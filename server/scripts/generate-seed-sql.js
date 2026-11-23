/**
 * Genera database/02_datos_iniciales.sql a partir de las mismas constantes que usa
 * el servidor (flow.js, resources.js y seedData.js), para que el script SQL y el
 * código nunca se desincronicen.   Uso: npm run db:generate-seed
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { DATABASE_DIR } from '../src/db/files.js';
import { DECISIONS, STAGES } from '../src/domain/flow.js';
import { RESOURCES } from '../src/domain/resources.js';
import { ASSETS, DEMO_PASSWORD, LOCATIONS, SERVICES, USERS } from '../src/db/seedData.js';
import { hashPassword } from '../src/security/password.js';

const literal = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length ? `ARRAY[${value.map(literal).join(', ')}]` : `'{}'::TEXT[]`;
  return `'${String(value).replaceAll("'", "''")}'`;
};

const valuesBlock = (rows) => rows.map((row) => `  (${row.map(literal).join(', ')})`).join(',\n');

// Sal derivada del correo: el archivo generado es reproducible (CI compara que no cambie).
// Solo se usa para las cuentas de demostración; las contraseñas nuevas usan sal aleatoria.
const demoSalt = (email) => createHash('sha256').update(`demo-salt:${email}`).digest().subarray(0, 16);
const userRows = await Promise.all(USERS.map(async (u) => [u.nombre, u.email, u.rol, await hashPassword(DEMO_PASSWORD, demoSalt(u.email))]));

const stageRows = Object.entries(STAGES).map(([clave, s]) => [
  clave, s.nombre, s.orden, s.tipo, s.procedimiento ?? null, s.rolResponsable ?? null, s.siguiente ?? null, Boolean(s.esReintento),
]);

const decisionRows = Object.entries(DECISIONS).map(([codigo, d]) => [
  codigo, d.etapa, d.pregunta, d.si.destino, d.no.destino, d.si.accion?.descripcion ?? null, d.no.accion?.descripcion ?? null,
]);

const stageResourceRows = Object.entries(STAGES).flatMap(([clave, s]) =>
  (s.recursos ?? []).map((codigo) => `  (${literal(clave)}, ${literal(codigo)})`)
);

const sql = `-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  02 · Datos iniciales: catálogo del plan, recursos, usuarios, servicios y red del oleoducto
--  Gestor: PostgreSQL 16 · ARCHIVO GENERADO por server/scripts/generate-seed-sql.js
--
--  Es idempotente: puede ejecutarse varias veces sin duplicar registros.
--  psql -U contingencia -d contingencia -f database/02_datos_iniciales.sql
-- =============================================================================

BEGIN;

-- Etapas del plan (nodos del diagrama de flujo)
INSERT INTO etapas (clave, nombre, orden, tipo, procedimiento, rol_responsable, siguiente, es_reintento) VALUES
${valuesBlock(stageRows)}
ON CONFLICT (clave) DO UPDATE SET
  nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, tipo = EXCLUDED.tipo,
  procedimiento = EXCLUDED.procedimiento, rol_responsable = EXCLUDED.rol_responsable,
  siguiente = EXCLUDED.siguiente, es_reintento = EXCLUDED.es_reintento;

-- Decisiones D1–D4 (rombos del diagrama)
INSERT INTO decisiones_plan (codigo, etapa, pregunta, destino_si, destino_no, accion_si, accion_no) VALUES
${valuesBlock(decisionRows)}
ON CONFLICT (codigo) DO UPDATE SET
  etapa = EXCLUDED.etapa, pregunta = EXCLUDED.pregunta,
  destino_si = EXCLUDED.destino_si, destino_no = EXCLUDED.destino_no,
  accion_si = EXCLUDED.accion_si, accion_no = EXCLUDED.accion_no;

-- Recursos tecnológicos del plan
INSERT INTO recursos_tecnologicos (codigo, nombre, categoria, descripcion) VALUES
${valuesBlock(RESOURCES.map((r) => [r.codigo, r.nombre, r.categoria, r.descripcion]))}
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria, descripcion = EXCLUDED.descripcion;

-- Recursos por etapa (N:M)
INSERT INTO etapa_recursos (etapa, recurso_id)
SELECT v.etapa, r.id
  FROM (VALUES
${stageResourceRows.join(',\n')}
  ) AS v (etapa, codigo)
  JOIN recursos_tecnologicos r ON r.codigo = v.codigo
ON CONFLICT DO NOTHING;

-- Usuarios (actores del plan). Contraseña inicial de demostración: ver server/src/db/seedData.js.
-- Si la cuenta ya existe, solo completa la contraseña cuando aún no tiene una.
INSERT INTO usuarios (nombre, email, rol, clave_hash) VALUES
${valuesBlock(userRows)}
ON CONFLICT (email) DO UPDATE SET clave_hash = COALESCE(usuarios.clave_hash, EXCLUDED.clave_hash);

-- Servicios TI / OT del oleoducto
INSERT INTO servicios (codigo, nombre, tipo, criticidad, descripcion) VALUES
${valuesBlock(SERVICES.map((s) => [s.codigo, s.nombre, s.tipo, s.criticidad, s.descripcion]))}
ON CONFLICT (codigo) DO NOTHING;

-- Instalaciones y mercados de la red (mapa oficial de Colonial; ver fuentes de cada fila)
INSERT INTO ubicaciones (codigo, nombre, tipo, ciudad, estado_eeuu, latitud, longitud, servicio_id, descripcion, fuentes)
SELECT v.codigo, v.nombre, v.tipo::tipo_ubicacion, v.ciudad, v.estado, v.latitud, v.longitud, s.id, v.descripcion, v.fuentes
  FROM (VALUES
${valuesBlock(LOCATIONS.map((l) => [l.codigo, l.nombre, l.tipo, l.ciudad, l.estado, l.latitud, l.longitud, l.servicio, l.descripcion, l.fuentes]))}
  ) AS v (codigo, nombre, tipo, ciudad, estado, latitud, longitud, servicio, descripcion, fuentes)
  JOIN servicios s ON s.codigo = v.servicio
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, ciudad = EXCLUDED.ciudad, estado_eeuu = EXCLUDED.estado_eeuu,
  latitud = EXCLUDED.latitud, longitud = EXCLUDED.longitud, servicio_id = EXCLUDED.servicio_id,
  descripcion = EXCLUDED.descripcion, fuentes = EXCLUDED.fuentes;

-- Tramos y sistemas del caso. El estado de aislamiento no se toca al resincronizar.
INSERT INTO activos (codigo, nombre, tipo, red, servicio_id, linea, desde_id, hasta_id, paradas, diametro_pulg, capacidad_bpd,
                     producto, descripcion, hallazgo, fuentes)
SELECT v.codigo, v.nombre, v.tipo::tipo_activo, v.red::tipo_servicio, s.id, v.linea, d.id, h.id, v.paradas::CHAR(3)[],
       v.diametro::SMALLINT, v.capacidad::INTEGER, v.producto, v.descripcion, v.hallazgo, v.fuentes
  FROM (VALUES
${valuesBlock(ASSETS.map((a) => [a.codigo, a.nombre, a.tipo, a.red, a.servicio, a.linea, a.desde, a.hasta, a.paradas, a.diametro, a.capacidad, a.producto, a.descripcion, a.hallazgo, a.fuentes]))}
  ) AS v (codigo, nombre, tipo, red, servicio, linea, desde, hasta, paradas, diametro, capacidad, producto, descripcion, hallazgo, fuentes)
  JOIN servicios s ON s.codigo = v.servicio
  LEFT JOIN ubicaciones d ON d.codigo = v.desde
  LEFT JOIN ubicaciones h ON h.codigo = v.hasta
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, red = EXCLUDED.red, servicio_id = EXCLUDED.servicio_id,
  linea = EXCLUDED.linea, desde_id = EXCLUDED.desde_id, hasta_id = EXCLUDED.hasta_id, paradas = EXCLUDED.paradas,
  diametro_pulg = EXCLUDED.diametro_pulg, capacidad_bpd = EXCLUDED.capacidad_bpd, producto = EXCLUDED.producto,
  descripcion = EXCLUDED.descripcion, hallazgo = EXCLUDED.hallazgo, fuentes = EXCLUDED.fuentes;

COMMIT;
`;

const target = `${DATABASE_DIR}/02_datos_iniciales.sql`;
writeFileSync(target, sql);
console.log(`Generado ${target}`);
