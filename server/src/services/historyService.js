/**
 * Registra un evento en el historial de recuperación (bitácora de auditoría).
 */
export async function recordHistory(db, { incidenteId = null, servicioId = null, activoId = null, evento, estadoAnterior = null, estadoNuevo = null, detalle = null, usuarioId }) {
  // La secuencia y las huellas SHA-256 las calcula el trigger trg_historial_encadenar.
  await db.run(
    `INSERT INTO historial_recuperacion
       (incidente_id, servicio_id, activo_id, evento, estado_anterior, estado_nuevo, detalle, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [incidenteId, servicioId, activoId, evento, estadoAnterior, estadoNuevo, detalle, usuarioId]
  );
}

const HISTORY_SELECT = `
  SELECT h.*, u.nombre AS usuario_nombre, s.nombre AS servicio_nombre, a.codigo AS activo_codigo, a.nombre AS activo_nombre
    FROM historial_recuperacion h
    JOIN usuarios u ON u.id = h.usuario_id
    LEFT JOIN servicios s ON s.id = h.servicio_id
    LEFT JOIN activos a ON a.id = h.activo_id`;

export function listIncidentHistory(db, incidenteId) {
  return db.many(`${HISTORY_SELECT} WHERE h.incidente_id = $1 ORDER BY h.fecha DESC, h.id DESC`, [incidenteId]);
}

export function listRecentEvents(db, limit = 10) {
  return db.many(
    `SELECT h.*, u.nombre AS usuario_nombre, s.nombre AS servicio_nombre, i.codigo AS incidente_codigo,
            a.codigo AS activo_codigo, a.nombre AS activo_nombre
       FROM historial_recuperacion h
       JOIN usuarios u ON u.id = h.usuario_id
       LEFT JOIN servicios s ON s.id = h.servicio_id
       LEFT JOIN incidentes i ON i.id = h.incidente_id
       LEFT JOIN activos a ON a.id = h.activo_id
      ORDER BY h.fecha DESC, h.id DESC
      LIMIT $1`,
    [limit]
  );
}
