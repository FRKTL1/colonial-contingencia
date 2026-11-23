import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Carpeta /database del repositorio: los scripts SQL entregables son la única fuente del esquema. */
export const DATABASE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'database');

export const SQL_FILES = Object.freeze({
  schema: join(DATABASE_DIR, '01_esquema.sql'),
  seed: join(DATABASE_DIR, '02_datos_iniciales.sql'),
  demo: join(DATABASE_DIR, '04_datos_prueba.sql'),
  migrations: [join(DATABASE_DIR, '05_migracion_actividad2.sql'), join(DATABASE_DIR, '06_migracion_entrega_final.sql')],
  /** Mapas de calor, rondas y bitácora encadenada: se aplica siempre, también en bases nuevas. */
  maps: join(DATABASE_DIR, '07_migracion_mapas.sql'),
});
