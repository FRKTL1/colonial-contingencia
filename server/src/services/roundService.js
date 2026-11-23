import { BusinessRuleError, NotFoundError } from '../domain/errors.js';
import { ROLES, assertCanOperateAsset, assertCanStartRound } from '../domain/permissions.js';
import { checklistFor } from '../domain/pipeline.js';
import { recordHistory } from './historyService.js';

/**
 * Rondas de verificación: adaptación de la revisión diaria de ubicaciones del proyecto Rack.
 * Antes de reiniciar un tramo o reconectar un sistema aislado, alguien de su red confirma
 * cada punto de una lista con fuente (domain/pipeline.js). Un OK exige confirmarlos todos.
 */
const ITEM_ORDER = `ORDER BY a.tipo, CASE WHEN a.linea = 'LAT' THEN 1 ELSE 0 END, a.linea, a.codigo`;

const ROUND_SELECT = `
  SELECT r.*, ui.nombre AS iniciada_por_nombre, uc.nombre AS cerrada_por_nombre, i.codigo AS incidente_codigo,
         count(ri.activo_id) AS total,
         count(ri.resultado) AS verificados,
         count(*) FILTER (WHERE ri.resultado = 'ok') AS ok,
         count(*) FILTER (WHERE ri.resultado = 'observado') AS observados,
         count(*) FILTER (WHERE ri.resultado = 'falla') AS fallas
    FROM rondas r
    JOIN usuarios ui ON ui.id = r.iniciada_por
    LEFT JOIN usuarios uc ON uc.id = r.cerrada_por
    LEFT JOIN incidentes i ON i.id = r.incidente_id
    LEFT JOIN ronda_items ri ON ri.ronda_id = r.id`;

export function listRounds(db) {
  return db.many(`${ROUND_SELECT} GROUP BY r.id, ui.nombre, uc.nombre, i.codigo ORDER BY r.cerrada_en IS NOT NULL, r.id DESC LIMIT 50`);
}

export async function getRound(db, roundId) {
  const round = await db.one(`${ROUND_SELECT} WHERE r.id = $1 GROUP BY r.id, ui.nombre, uc.nombre, i.codigo`, [roundId]);
  if (!round) throw new NotFoundError('Ronda', roundId);
  const items = await db.many(
    `SELECT ri.*, u.nombre AS verificado_por_nombre,
            a.codigo, a.nombre, a.tipo, a.red, a.linea, a.aislado, a.aislado_en,
            s.codigo AS servicio_codigo
       FROM ronda_items ri
       JOIN activos a ON a.id = ri.activo_id
       LEFT JOIN servicios s ON s.id = a.servicio_id
       LEFT JOIN usuarios u ON u.id = ri.verificado_por
      WHERE ri.ronda_id = $1
      ${ITEM_ORDER}`,
    [roundId]
  );
  return { ...round, items: items.map((item) => ({ ...item, checklist: checklistFor(item) })) };
}

async function resolveScope(db, alcance, valor) {
  if (alcance === 'aislados') return db.many(`SELECT a.id, a.codigo FROM activos a WHERE a.aislado ${ITEM_ORDER}`);
  if (alcance === 'linea') return db.many(`SELECT a.id, a.codigo FROM activos a WHERE a.linea = $1 ${ITEM_ORDER}`, [valor]);
  return db.many(
    `SELECT a.id, a.codigo FROM activos a JOIN servicios s ON s.id = a.servicio_id WHERE s.codigo = $1 ${ITEM_ORDER}`,
    [valor]
  );
}

const SCOPE_LABEL = { aislados: 'elementos aislados', linea: 'línea', servicio: 'servicio' };

export function startRound(db, { alcance, valor, incidenteId }, user) {
  return db.tx(async (tx) => {
    assertCanStartRound(user);
    const assets = await resolveScope(tx, alcance, valor);
    if (assets.length === 0) {
      throw new BusinessRuleError(alcance === 'aislados' ? 'No hay elementos aislados que verificar' : `No hay elementos en ${SCOPE_LABEL[alcance]} ${valor}`);
    }
    if (incidenteId) {
      const incident = await tx.one('SELECT id FROM incidentes WHERE id = $1', [incidenteId]);
      if (!incident) throw new NotFoundError('Incidente', incidenteId);
    }
    const { id } = await tx.one(
      `INSERT INTO rondas (alcance, alcance_valor, incidente_id, iniciada_por) VALUES ($1, $2, $3, $4) RETURNING id`,
      [alcance, alcance === 'aislados' ? null : valor, incidenteId ?? null, user.id]
    );
    await tx.run(
      `INSERT INTO ronda_items (ronda_id, activo_id) SELECT $1, unnest($2::INTEGER[])`,
      [id, assets.map((a) => a.id)]
    );
    await recordHistory(tx, {
      incidenteId: incidenteId ?? null,
      evento: 'ronda_iniciada',
      estadoNuevo: 'abierta',
      detalle: `Ronda #${id} · ${SCOPE_LABEL[alcance]}${valor ? ` ${valor}` : ''} · ${assets.length} elemento(s)`,
      usuarioId: user.id,
    });
    return getRound(tx, id);
  });
}

async function getOpenRound(db, roundId) {
  const round = await db.one('SELECT * FROM rondas WHERE id = $1 FOR UPDATE', [roundId]);
  if (!round) throw new NotFoundError('Ronda', roundId);
  if (round.cerrada_en) throw new BusinessRuleError(`La ronda #${roundId} ya está cerrada`);
  return round;
}

export function recordCheck(db, roundId, assetId, { resultado, nota, confirmados = [] }, user) {
  return db.tx(async (tx) => {
    const round = await getOpenRound(tx, roundId);
    const item = await tx.one(
      `SELECT ri.*, a.codigo, a.red, a.tipo FROM ronda_items ri JOIN activos a ON a.id = ri.activo_id
        WHERE ri.ronda_id = $1 AND ri.activo_id = $2 FOR UPDATE OF ri`,
      [roundId, assetId]
    );
    if (!item) throw new NotFoundError('Elemento en la ronda', assetId);
    assertCanOperateAsset(user, item);
    if (resultado !== 'ok' && !nota) {
      throw new BusinessRuleError('Explica lo observado o la falla en la nota');
    }
    const checklist = checklistFor(item);
    const confirmed = [...new Set(confirmados)].sort((a, b) => a - b);
    if (confirmed.some((i) => i >= checklist.length)) {
      throw new BusinessRuleError(`La lista de ${item.codigo} tiene ${checklist.length} puntos`);
    }
    if (resultado === 'ok' && confirmed.length !== checklist.length) {
      const missing = checklist.filter((_, i) => !confirmed.includes(i)).map((c) => c.texto);
      throw new BusinessRuleError(`Para marcar OK confirma todos los puntos. Falta: ${missing.join('; ')}`);
    }

    // clock_timestamp: la verificación debe quedar después del aislamiento aunque ocurra en la misma transacción.
    await tx.run(
      `UPDATE ronda_items SET resultado = $3, nota = $4, confirmados = $6::SMALLINT[], verificado_por = $5, verificado_en = clock_timestamp()
        WHERE ronda_id = $1 AND activo_id = $2`,
      [roundId, assetId, resultado, nota ?? null, user.id, confirmed]
    );
    await recordHistory(tx, {
      incidenteId: round.incidente_id,
      activoId: assetId,
      evento: 'verificacion_activo',
      estadoAnterior: item.resultado,
      estadoNuevo: resultado,
      detalle: `Ronda #${roundId} · ${item.codigo} · ${confirmed.length}/${checklist.length} puntos confirmados${nota ? `: ${nota}` : ''}`,
      usuarioId: user.id,
    });
    return getRound(tx, roundId);
  });
}

export function closeRound(db, roundId, user) {
  return db.tx(async (tx) => {
    const round = await getOpenRound(tx, roundId);
    if (user.rol !== ROLES.COORDINATOR && user.id !== round.iniciada_por) {
      throw new BusinessRuleError('Solo quien inició la ronda o el coordinador pueden cerrarla');
    }
    const counts = await tx.one(
      `SELECT count(*) FILTER (WHERE resultado IS NULL) AS pendientes,
              count(*) FILTER (WHERE resultado = 'ok') AS ok,
              count(*) FILTER (WHERE resultado = 'observado') AS observados,
              count(*) FILTER (WHERE resultado = 'falla') AS fallas
         FROM ronda_items WHERE ronda_id = $1`,
      [roundId]
    );
    if (counts.pendientes > 0) {
      throw new BusinessRuleError(`Faltan ${counts.pendientes} elemento(s) por verificar antes de cerrar la ronda`);
    }
    await tx.run('UPDATE rondas SET cerrada_por = $2, cerrada_en = clock_timestamp() WHERE id = $1', [roundId, user.id]);
    await recordHistory(tx, {
      incidenteId: round.incidente_id,
      evento: 'ronda_cerrada',
      estadoAnterior: 'abierta',
      estadoNuevo: 'cerrada',
      detalle: `Ronda #${roundId}: ${counts.ok} OK · ${counts.observados} observado(s) · ${counts.fallas} falla(s)`,
      usuarioId: user.id,
    });
    return getRound(tx, roundId);
  });
}
