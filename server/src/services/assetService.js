import { BusinessRuleError, NotFoundError } from '../domain/errors.js';
import { assertCanOperateAsset } from '../domain/permissions.js';
import {
  CASE_STATES, CASE_TIMELINE, REFERENCE_CAPACITY_BPD, caseStateOf, checklistFor, elementState, impactLevel, stoppedCapacity,
} from '../domain/pipeline.js';
import { SOURCES } from '../domain/sources.js';
import { recordHistory } from './historyService.js';

const ASSET_SELECT = `
  SELECT a.*, s.codigo AS servicio_codigo, s.nombre AS servicio_nombre, s.estado AS servicio_estado,
         d.codigo AS desde_codigo, d.nombre AS desde_nombre, h.codigo AS hasta_codigo, h.nombre AS hasta_nombre,
         ua.nombre AS aislado_por_nombre,
         v.resultado AS verificacion_resultado, v.verificado_en, v.nota AS verificacion_nota, v.verificado_por AS verificado_por_nombre
    FROM activos a
    JOIN servicios s ON s.id = a.servicio_id
    LEFT JOIN ubicaciones d ON d.id = a.desde_id
    LEFT JOIN ubicaciones h ON h.id = a.hasta_id
    LEFT JOIN usuarios ua ON ua.id = a.aislado_por
    LEFT JOIN v_ultima_verificacion v ON v.activo_id = a.id`;

const ORDER = `ORDER BY a.tipo, CASE WHEN a.linea = 'LAT' THEN 1 ELSE 0 END, a.linea, a.codigo`;

/** Elemento con su estado, su calor y si ya puede reconectarse (OK posterior al aislamiento). */
function decorate(asset) {
  const puedeLiberarse = Boolean(
    asset.aislado && asset.verificacion_resultado === 'ok' && new Date(asset.verificado_en) > new Date(asset.aislado_en)
  );
  return {
    ...asset,
    estado: elementState(asset),
    nivelCalor: impactLevel(asset),
    bpdDetenidos: stoppedCapacity(asset),
    checklist: checklistFor(asset),
    puedeLiberarse,
  };
}

async function getAssetRow(db, assetId, { forUpdate = false } = {}) {
  const asset = await db.one(
    forUpdate ? 'SELECT * FROM activos WHERE id = $1 FOR UPDATE' : `${ASSET_SELECT} WHERE a.id = $1`,
    [assetId]
  );
  if (!asset) throw new NotFoundError('Elemento de la red', assetId);
  return asset;
}

export async function getAsset(db, assetId) {
  const asset = decorate(await getAssetRow(db, assetId));
  const historial = await db.many(
    `SELECT h.id, h.evento, h.estado_anterior, h.estado_nuevo, h.detalle, h.fecha, u.nombre AS usuario_nombre
       FROM historial_recuperacion h JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.activo_id = $1 ORDER BY h.secuencia DESC LIMIT 20`,
    [assetId]
  );
  return { ...asset, historial };
}

export async function listAssets(db) {
  return (await db.many(`${ASSET_SELECT} ${ORDER}`)).map(decorate);
}

// ------------------------------------------------------------------ aislamiento

async function isolate(db, asset, { motivo, usuarioId, incidenteId = null }) {
  await db.run(
    `UPDATE activos SET aislado = TRUE, aislado_motivo = $2, aislado_por = $3, aislado_en = clock_timestamp(), actualizado_en = now()
      WHERE id = $1`,
    [asset.id, motivo, usuarioId]
  );
  await recordHistory(db, {
    incidenteId, activoId: asset.id, evento: 'activo_aislado', estadoAnterior: 'conectado', estadoNuevo: 'aislado',
    detalle: `${asset.codigo}: ${motivo}`, usuarioId,
  });
}

/**
 * Regla adaptada de Rack (lo que queda en rojo se bloquea solo) y de lo que hizo Colonial:
 * cuando un servicio pasa a "afectado", todos sus tramos y sistemas se aíslan, igual que el
 * 7 de mayo se detuvo la red entera para contener el ataque (testimonio de Blount).
 * @returns {Promise<string[]>} códigos de los elementos aislados.
 */
export async function isolateElementsOfService(db, service, { usuarioId, incidenteId = null }) {
  const assets = await db.many('SELECT * FROM activos WHERE servicio_id = $1 AND NOT aislado ORDER BY id FOR UPDATE', [service.id]);
  for (const asset of assets) {
    const motivo = asset.tipo === 'tramo'
      ? `Aislamiento automático: bombeo detenido y válvulas cerradas al quedar afectado ${service.codigo}`
      : `Aislamiento automático: desconectado de la red al quedar afectado ${service.codigo}`;
    await isolate(db, asset, { motivo, usuarioId, incidenteId });
  }
  return assets.map((a) => a.codigo);
}

/** Incidente abierto más reciente del servicio del elemento, para enlazar la bitácora. */
async function openIncidentFor(db, asset) {
  const row = await db.one(
    `SELECT i.id FROM incidentes i JOIN incidente_servicios isv ON isv.incidente_id = i.id
      WHERE isv.servicio_id = $1 AND i.estado = 'abierto' ORDER BY i.id DESC LIMIT 1`,
    [asset.servicio_id]
  );
  return row?.id ?? null;
}

export function isolateAsset(db, assetId, { motivo }, user) {
  return db.tx(async (tx) => {
    const asset = await getAssetRow(tx, assetId, { forUpdate: true });
    assertCanOperateAsset(user, asset);
    if (asset.aislado) throw new BusinessRuleError(`${asset.codigo} ya está aislado`);
    await isolate(tx, asset, { motivo, usuarioId: user.id, incidenteId: await openIncidentFor(tx, asset) });
    return getAsset(tx, assetId);
  });
}

export function releaseAsset(db, assetId, { nota }, user) {
  return db.tx(async (tx) => {
    const asset = await getAssetRow(tx, assetId, { forUpdate: true });
    assertCanOperateAsset(user, asset);
    if (!asset.aislado) throw new BusinessRuleError(`${asset.codigo} no está aislado`);

    const verified = await tx.one(
      `SELECT 1 FROM ronda_items WHERE activo_id = $1 AND resultado = 'ok' AND verificado_en > $2 LIMIT 1`,
      [asset.id, asset.aislado_en]
    );
    if (!verified) {
      throw new BusinessRuleError(
        `No se puede reconectar ${asset.codigo}: primero debe pasar una ronda de verificación con resultado OK después de aislarlo`
      );
    }

    await tx.run(
      `UPDATE activos SET aislado = FALSE, aislado_motivo = NULL, aislado_por = NULL, aislado_en = NULL, actualizado_en = now()
        WHERE id = $1`,
      [asset.id]
    );
    await recordHistory(tx, {
      incidenteId: await openIncidentFor(tx, asset),
      activoId: asset.id,
      evento: 'activo_liberado',
      estadoAnterior: 'aislado',
      estadoNuevo: 'conectado',
      detalle: nota ? `${asset.codigo}: ${nota}` : `${asset.codigo}: reconectado tras verificación`,
      usuarioId: user.id,
    });
    return getAsset(tx, assetId);
  });
}

// ------------------------------------------------------------------ mapa de calor

function summarize(assets) {
  const tramos = assets.filter((a) => a.tipo === 'tramo');
  const principales = tramos.filter((t) => t.linea !== 'LAT');
  const lineasDetenidas = new Set(principales.filter((t) => ['aislado', 'afectado'].includes(t.estado)).map((t) => t.linea));
  return {
    tramos: tramos.length,
    sistemas: assets.length - tramos.length,
    aislados: assets.filter((a) => a.aislado).length,
    lineasDetenidas: lineasDetenidas.size,
    lineasPrincipales: new Set(principales.map((t) => t.linea)).size,
    listosParaReconectar: assets.filter((a) => a.puedeLiberarse).length,
    sinVerificar: assets.filter((a) => a.aislado && !a.puedeLiberarse).length,
  };
}

/**
 * Mapa de calor de la red: instalaciones con coordenadas, tramos con su estado e impacto,
 * sistemas del caso, la reproducción día a día del caso real y las fuentes de todo.
 */
export async function getPipelineMap(db) {
  const [locations, assets] = await Promise.all([
    db.many(
      `SELECT u.codigo, u.nombre, u.tipo, u.ciudad, u.estado_eeuu, u.latitud::FLOAT AS latitud, u.longitud::FLOAT AS longitud,
              u.descripcion, u.fuentes, s.codigo AS servicio_codigo, s.estado AS servicio_estado
         FROM ubicaciones u JOIN servicios s ON s.id = u.servicio_id
        ORDER BY u.longitud`
    ),
    listAssets(db),
  ]);
  const tramos = assets.filter((a) => a.tipo === 'tramo');
  return {
    generadoEn: new Date().toISOString(),
    capacidadReferencia: REFERENCE_CAPACITY_BPD,
    instalaciones: locations,
    tramos,
    sistemas: assets.filter((a) => a.tipo === 'sistema'),
    resumen: summarize(assets),
    caso: {
      estados: CASE_STATES,
      dias: CASE_TIMELINE.map((day) => ({
        fecha: day.fecha,
        titulo: day.titulo,
        detalle: day.detalle,
        fuentes: day.fuentes,
        tramos: Object.fromEntries(tramos.map((t) => [t.codigo, caseStateOf(day, t)])),
      })),
    },
    fuentes: SOURCES,
  };
}
