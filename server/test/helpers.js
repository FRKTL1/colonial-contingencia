import { readFile } from 'node:fs/promises';
import { SQL_FILES } from '../src/db/files.js';
import { resetDatabase } from '../src/db/migrate.js';
import { createDb } from '../src/db/pool.js';
import { updateAction } from '../src/services/actionService.js';
import { getActiveUser } from '../src/services/userService.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://contingencia:contingencia@localhost:5432/contingencia_test';

// allowExitOnIdle: el proceso de pruebas termina solo cuando no quedan consultas pendientes.
const db = createDb(TEST_DATABASE_URL, { allowExitOnIdle: true, max: 4 });
let schemaReady = false;

const DATA_TABLES = 'ronda_items, rondas, evidencia_contenidos, evidencias, eventos_seguridad, historial_recuperacion, decisiones, acciones, incidente_servicios, activos, ubicaciones, incidentes, servicios, usuarios';

/** Base limpia para cada prueba: el esquema se crea una vez y luego solo se vacían los datos. */
async function freshDatabase() {
  if (!schemaReady) {
    await resetDatabase(db);
    schemaReady = true;
    return;
  }
  await db.query(`TRUNCATE ${DATA_TABLES} RESTART IDENTITY CASCADE; ALTER SEQUENCE incidente_numero_seq RESTART`);
  await db.query(await readFile(SQL_FILES.seed, 'utf8'));
}

export async function setup() {
  await freshDatabase();
  const users = {
    coordinador: await getActiveUser(db, 1),
    analistaTi: await getActiveUser(db, 2),
    operadorOt: await getActiveUser(db, 3),
    legal: await getActiveUser(db, 4),
    comunicaciones: await getActiveUser(db, 5),
  };
  return { db, users };
}

export function serviceByCode(dbConn, codigo) {
  return dbConn.one('SELECT * FROM servicios WHERE codigo = $1', [codigo]);
}

export async function serviceIds(dbConn, ...codes) {
  const rows = await dbConn.many('SELECT id, codigo FROM servicios WHERE codigo = ANY($1)', [codes]);
  return codes.map((code) => rows.find((r) => r.codigo === code).id);
}

/** Marca como completadas (o fallidas) todas las acciones abiertas de la etapa actual. */
export async function closeStageActions(dbConn, detail, user, { estado = 'completada', resultado = 'Ejecutado' } = {}) {
  const open = detail.acciones.filter((a) => a.etapa === detail.etapa && ['pendiente', 'en_progreso'].includes(a.estado));
  for (const action of open) {
    await updateAction(dbConn, action.id, { estado, resultado }, user);
  }
}

export const baseIncident = async (dbConn) => ({
  titulo: 'Ransomware DarkSide en red corporativa',
  descripcion: 'Nota de rescate en servidores de facturación; actividad anómala desde la VPN.',
  severidad: 'alta',
  responsableId: 1,
  servicioIds: await serviceIds(dbConn, 'TI-FACT', 'TI-VPN', 'TI-ERP'),
});
