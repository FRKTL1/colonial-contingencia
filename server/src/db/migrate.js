import { readFile } from 'node:fs/promises';
import { SQL_FILES } from './files.js';

async function runFile(db, path) {
  await db.query(await readFile(path, 'utf8'));
}

async function schemaExists(db) {
  const row = await db.one(`SELECT to_regclass('public.incidentes') IS NOT NULL AS existe`);
  return row.existe;
}

/**
 * Deja la base lista para usarse: crea el esquema si no existe y sincroniza el
 * catálogo del plan (02 es idempotente, así que se aplica en cada arranque).
 * @returns {Promise<boolean>} true si el esquema se creó en esta llamada.
 */
export async function ensureDatabase(db, { withDemoData = false } = {}) {
  const created = !(await schemaExists(db));
  if (created) await runFile(db, SQL_FILES.schema);
  else {
    // Bases creadas con versiones anteriores: las migraciones son idempotentes.
    for (const file of SQL_FILES.migrations) await runFile(db, file);
  }
  await runFile(db, SQL_FILES.maps);
  await runFile(db, SQL_FILES.seed);
  if (created && withDemoData) await runFile(db, SQL_FILES.demo);
  return created;
}

/** Borra todos los objetos y vuelve a crear el esquema con sus datos iniciales. */
export async function resetDatabase(db, { withDemoData = false } = {}) {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await runFile(db, SQL_FILES.schema);
  await runFile(db, SQL_FILES.maps);
  await runFile(db, SQL_FILES.seed);
  if (withDemoData) await runFile(db, SQL_FILES.demo);
}
