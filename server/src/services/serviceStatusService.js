import { BusinessRuleError, NotFoundError } from '../domain/errors.js';
import { assertCanChangeService } from '../domain/permissions.js';
import { isolateElementsOfService } from './assetService.js';
import { listRecentEvents, recordHistory } from './historyService.js';

export const SERVICE_STATES = Object.freeze(['operativo', 'afectado', 'en_recuperacion']);

/**
 * Transiciones manuales permitidas. Un servicio afectado no puede volver a
 * "operativo" sin pasar por recuperación; una recuperación fallida vuelve a "afectado".
 */
const MANUAL_TRANSITIONS = Object.freeze({
  operativo: ['afectado'],
  afectado: ['en_recuperacion'],
  en_recuperacion: ['operativo', 'afectado'],
});

export function listServices(db) {
  return db.many(`SELECT * FROM servicios ORDER BY tipo DESC, criticidad DESC, codigo`);
}

export async function getService(db, serviceId, { forUpdate = false } = {}) {
  const service = await db.one(`SELECT * FROM servicios WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [serviceId]);
  if (!service) throw new NotFoundError('Servicio', serviceId);
  return service;
}

/**
 * Aplica un cambio de estado y lo audita. Usado tanto por cambios manuales
 * como por los efectos automáticos del flujo de contingencia.
 * @returns {Promise<boolean>} true si el estado cambió.
 */
export async function applyServiceStatus(db, service, nuevoEstado, { nota = null, incidenteId = null, usuarioId, evento }) {
  if (service.estado === nuevoEstado && service.nota_estado === nota) return false;

  await db.run(
    `UPDATE servicios SET estado = $1, nota_estado = $2, actualizado_en = now() WHERE id = $3`,
    [nuevoEstado, nota, service.id]
  );

  await recordHistory(db, {
    incidenteId,
    servicioId: service.id,
    evento,
    estadoAnterior: service.estado,
    estadoNuevo: nuevoEstado,
    detalle: nota,
    usuarioId,
  });
  if (nuevoEstado === 'afectado' && service.estado !== 'afectado') {
    await isolateElementsOfService(db, service, { usuarioId, incidenteId });
  }
  return true;
}

/** Último incidente abierto que afecta al servicio, para enlazar el historial. */
async function findOpenIncidentForService(db, serviceId) {
  const row = await db.one(
    `SELECT i.id FROM incidentes i
       JOIN incidente_servicios isv ON isv.incidente_id = i.id
      WHERE isv.servicio_id = $1 AND i.estado = 'abierto'
      ORDER BY i.id DESC LIMIT 1`,
    [serviceId]
  );
  return row?.id ?? null;
}

export function changeServiceStatus(db, serviceId, { estado, nota }, user) {
  return db.tx(async (tx) => {
    const service = await getService(tx, serviceId, { forUpdate: true });
    assertCanChangeService(user, service);

    if (service.estado === estado) {
      throw new BusinessRuleError(`El servicio ya está en estado "${estado}"`);
    }
    const allowed = MANUAL_TRANSITIONS[service.estado];
    if (!allowed.includes(estado)) {
      throw new BusinessRuleError(
        `Transición no permitida: ${service.estado} → ${estado}. Permitidas: ${allowed.join(', ')}`
      );
    }

    await applyServiceStatus(tx, service, estado, {
      nota: nota ?? null,
      incidenteId: await findOpenIncidentForService(tx, serviceId),
      usuarioId: user.id,
      evento: 'cambio_estado_servicio',
    });
    return getService(tx, serviceId);
  });
}

export async function getDashboard(db) {
  const [servicios, incidentesAbiertos, ultimosEventos] = await Promise.all([
    listServices(db),
    db.many(
      `SELECT id, codigo, titulo, etapa, severidad, detectado_en, es_simulacro
         FROM incidentes WHERE estado = 'abierto' ORDER BY id DESC`
    ),
    listRecentEvents(db, 12),
  ]);

  const resumen = SERVICE_STATES.reduce((acc, estado) => ({ ...acc, [estado]: 0 }), { total: servicios.length });
  servicios.forEach((s) => { resumen[s.estado] += 1; });

  const disponibilidad = servicios.length === 0 ? 100 : Math.round((resumen.operativo / servicios.length) * 100);

  return {
    generadoEn: new Date().toISOString(),
    resumen: { ...resumen, disponibilidad },
    servicios: {
      OT: servicios.filter((s) => s.tipo === 'OT'),
      TI: servicios.filter((s) => s.tipo === 'TI'),
    },
    incidentesAbiertos,
    ultimosEventos,
  };
}
