import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);
const SEPARATOR = '\u001f';

/**
 * Reproduce fn_historial_huella (database/07_migracion_mapas.sql) en Node: la verificación
 * no depende de la base, así que detecta cambios hechos incluso con acceso directo a PostgreSQL.
 */
export function eventHash(row) {
  const text = [
    row.hash_anterior,
    String(row.secuencia),
    row.incidente_id ?? '',
    row.servicio_id ?? '',
    row.activo_id ?? '',
    row.evento,
    row.estado_anterior ?? '',
    row.estado_nuevo ?? '',
    row.detalle ?? '',
    String(row.usuario_id),
    row.fecha_us,
  ].map(String).join(SEPARATOR);
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const LEDGER_COLUMNS = `id, secuencia, incidente_id, servicio_id, activo_id, evento, estado_anterior, estado_nuevo, detalle,
  usuario_id, hash_anterior, hash, floor(extract(EPOCH FROM fecha) * 1000000)::BIGINT::TEXT AS fecha_us`;

/**
 * Recorre toda la cadena en orden. Detecta eventos alterados (huella distinta), borrados o
 * insertados fuera de orden (secuencia con huecos o enlace roto con el anterior).
 */
export async function verifyLedger(db) {
  const rows = await db.many(`SELECT ${LEDGER_COLUMNS} FROM historial_recuperacion ORDER BY secuencia`);
  let previous = GENESIS_HASH;
  let expectedSeq = 1;

  for (const row of rows) {
    const fail = (motivo) => ({ integra: false, total: rows.length, verificados: expectedSeq - 1, primerError: { secuencia: Number(row.secuencia), id: Number(row.id), motivo } });
    if (Number(row.secuencia) !== expectedSeq) return fail(`Falta el evento #${expectedSeq}: la secuencia salta a #${row.secuencia}`);
    if (row.hash_anterior !== previous) return fail('El enlace con el evento anterior no coincide');
    if (eventHash(row) !== row.hash) return fail('El contenido del evento fue modificado: su huella no coincide');
    previous = row.hash;
    expectedSeq += 1;
  }
  return { integra: true, total: rows.length, verificados: rows.length, ultimoHash: previous, verificadoEn: new Date().toISOString() };
}

export function listLedger(db, limit = 15) {
  return db.many(
    `SELECT h.secuencia, h.evento, h.detalle, h.fecha, h.hash, h.hash_anterior, u.nombre AS usuario_nombre,
            i.codigo AS incidente_codigo, a.codigo AS activo_codigo, s.codigo AS servicio_codigo
       FROM historial_recuperacion h
       JOIN usuarios u ON u.id = h.usuario_id
       LEFT JOIN incidentes i ON i.id = h.incidente_id
       LEFT JOIN activos a ON a.id = h.activo_id
       LEFT JOIN servicios s ON s.id = h.servicio_id
      ORDER BY h.secuencia DESC LIMIT $1`,
    [limit]
  );
}
