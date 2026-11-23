-- =============================================================================
--  Centro de Contingencia — Colonial Pipeline (2021)
--  07 · Mapa de calor de la red del oleoducto, aislamiento de tramos y sistemas,
--       rondas de verificación y bitácora encadenada con SHA-256
--       (funciones adaptadas del proyecto Rack · Operación; datos con fuente pública)
--  Gestor: PostgreSQL 16
--
--  Es idempotente: el servidor lo aplica en cada arranque, tanto en bases nuevas
--  (después de 01) como en bases creadas con versiones anteriores.
--  psql -U contingencia -d contingencia -f database/07_migracion_mapas.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_ubicacion') THEN
    CREATE TYPE tipo_ubicacion AS ENUM ('origen', 'punto_entrega', 'patio_tanques', 'estacion', 'derivacion', 'terminal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_activo') THEN
    CREATE TYPE tipo_activo AS ENUM ('tramo', 'sistema');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resultado_verificacion') THEN
    CREATE TYPE resultado_verificacion AS ENUM ('ok', 'observado', 'falla');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alcance_ronda') THEN
    CREATE TYPE alcance_ronda AS ENUM ('aislados', 'linea', 'servicio');
  END IF;
END $$;

-- Claves de server/src/domain/sources.js: cada fila dice qué fuente pública la sustenta.
CREATE OR REPLACE FUNCTION fn_fuentes_validas(p_fuentes TEXT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(p_fuentes) >= 1 AND NOT EXISTS (SELECT 1 FROM unnest(p_fuentes) f WHERE f !~ '^[a-z0-9]{3,20}$')
$$;

-- -----------------------------------------------------------------------------
-- Instalaciones de la red (mapa oficial de Colonial, 13 may 2021)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ubicaciones (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo       CHAR(3)        NOT NULL UNIQUE,
  nombre       VARCHAR(80)    NOT NULL,
  tipo         tipo_ubicacion NOT NULL,
  ciudad       VARCHAR(60)    NOT NULL,
  estado_eeuu  CHAR(2)        NOT NULL,
  latitud      NUMERIC(7, 4)  NOT NULL,
  longitud     NUMERIC(7, 4)  NOT NULL,
  servicio_id  INTEGER        NOT NULL REFERENCES servicios (id) ON DELETE RESTRICT,
  descripcion  VARCHAR(300)   NOT NULL,
  fuentes      TEXT[]         NOT NULL,
  CONSTRAINT ck_ubicaciones_codigo  CHECK (codigo ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_ubicaciones_estado  CHECK (estado_eeuu ~ '^[A-Z]{2}$'),
  -- Territorio continental de EE. UU.
  CONSTRAINT ck_ubicaciones_coords  CHECK (latitud BETWEEN 24 AND 50 AND longitud BETWEEN -125 AND -66),
  CONSTRAINT ck_ubicaciones_fuentes CHECK (fn_fuentes_validas(fuentes))
);
COMMENT ON TABLE ubicaciones IS 'Instalaciones y mercados del mapa oficial de Colonial; coordenadas del centro de cada ciudad';

-- -----------------------------------------------------------------------------
-- Elementos de la red: tramos de tubería y sistemas documentados en el caso
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activos (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          VARCHAR(16)   NOT NULL UNIQUE,
  nombre          VARCHAR(100)  NOT NULL,
  tipo            tipo_activo   NOT NULL,
  red             tipo_servicio NOT NULL,
  servicio_id     INTEGER       NOT NULL REFERENCES servicios (id) ON DELETE RESTRICT,
  linea           VARCHAR(3),
  desde_id        INTEGER       REFERENCES ubicaciones (id) ON DELETE RESTRICT,
  hasta_id        INTEGER       REFERENCES ubicaciones (id) ON DELETE RESTRICT,
  paradas         CHAR(3)[]     NOT NULL DEFAULT '{}',
  diametro_pulg   SMALLINT,
  capacidad_bpd   INTEGER,
  producto        VARCHAR(120),
  descripcion     VARCHAR(300)  NOT NULL,
  hallazgo        VARCHAR(300),
  fuentes         TEXT[]        NOT NULL,
  aislado         BOOLEAN       NOT NULL DEFAULT FALSE,
  aislado_motivo  VARCHAR(300),
  aislado_por     INTEGER       REFERENCES usuarios (id),
  aislado_en      TIMESTAMPTZ,
  actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_activos_codigo    CHECK (codigo ~ '^[A-Z0-9]{2,5}-[A-Z0-9]{2,10}$'),
  -- Un tramo une dos instalaciones y pertenece a una línea; un sistema no tiene recorrido.
  CONSTRAINT ck_activos_tramo     CHECK (
    (tipo = 'tramo'   AND red = 'OT' AND linea ~ '^(L[1-4]|LAT)$' AND desde_id IS NOT NULL AND hasta_id IS NOT NULL AND desde_id <> hasta_id AND hallazgo IS NULL)
 OR (tipo = 'sistema' AND linea IS NULL AND desde_id IS NULL AND hasta_id IS NULL AND cardinality(paradas) = 0
                      AND diametro_pulg IS NULL AND capacidad_bpd IS NULL AND hallazgo IS NOT NULL)
  ),
  CONSTRAINT ck_activos_medidas   CHECK ((diametro_pulg IS NULL OR diametro_pulg BETWEEN 4 AND 60) AND (capacidad_bpd IS NULL OR capacidad_bpd > 0)),
  CONSTRAINT ck_activos_fuentes   CHECK (fn_fuentes_validas(fuentes)),
  CONSTRAINT ck_activos_aislado   CHECK (aislado = (aislado_motivo IS NOT NULL AND aislado_por IS NOT NULL AND aislado_en IS NOT NULL))
);
COMMENT ON TABLE activos IS 'Tramos del oleoducto (datos publicados) y sistemas documentados en el caso; se aíslan, verifican y reconectan';
COMMENT ON COLUMN activos.capacidad_bpd IS 'Capacidad nominal publicada en barriles por día; NULL si no es pública';
CREATE INDEX IF NOT EXISTS idx_activos_servicio ON activos (servicio_id);
CREATE INDEX IF NOT EXISTS idx_activos_linea    ON activos (linea);

-- -----------------------------------------------------------------------------
-- Rondas de verificación antes de reconectar (revisión de ubicaciones de Rack)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rondas (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alcance        alcance_ronda NOT NULL,
  alcance_valor  VARCHAR(16),
  incidente_id   INTEGER       REFERENCES incidentes (id) ON DELETE SET NULL,
  iniciada_por   INTEGER       NOT NULL REFERENCES usuarios (id),
  iniciada_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cerrada_por    INTEGER       REFERENCES usuarios (id),
  cerrada_en     TIMESTAMPTZ,
  CONSTRAINT ck_rondas_cierre  CHECK ((cerrada_por IS NULL) = (cerrada_en IS NULL)),
  CONSTRAINT ck_rondas_alcance CHECK ((alcance = 'aislados') = (alcance_valor IS NULL))
);

CREATE TABLE IF NOT EXISTS ronda_items (
  ronda_id        INTEGER                NOT NULL REFERENCES rondas (id) ON DELETE CASCADE,
  activo_id       INTEGER                NOT NULL REFERENCES activos (id) ON DELETE RESTRICT,
  resultado       resultado_verificacion,
  confirmados     SMALLINT[]             NOT NULL DEFAULT '{}',
  nota            VARCHAR(500),
  verificado_por  INTEGER                REFERENCES usuarios (id),
  verificado_en   TIMESTAMPTZ,
  PRIMARY KEY (ronda_id, activo_id),
  CONSTRAINT ck_ronda_items_registro CHECK ((resultado IS NULL) = (verificado_por IS NULL) AND (resultado IS NULL) = (verificado_en IS NULL)),
  CONSTRAINT ck_ronda_items_nota     CHECK (resultado IS NULL OR resultado = 'ok' OR char_length(btrim(nota)) >= 5)
);
COMMENT ON COLUMN ronda_items.confirmados IS 'Índices de la lista de verificación confirmados; un OK exige todos';
CREATE INDEX IF NOT EXISTS idx_ronda_items_activo ON ronda_items (activo_id, verificado_en DESC);

-- -----------------------------------------------------------------------------
-- Bitácora encadenada: cada evento guarda la huella SHA-256 del anterior.
-- Cambiar o borrar un evento rompe la cadena desde ese punto (ISO/IEC 27001 A.8.15).
-- -----------------------------------------------------------------------------
ALTER TABLE historial_recuperacion ADD COLUMN IF NOT EXISTS activo_id     INTEGER REFERENCES activos (id);
ALTER TABLE historial_recuperacion ADD COLUMN IF NOT EXISTS secuencia     BIGINT;
ALTER TABLE historial_recuperacion ADD COLUMN IF NOT EXISTS hash_anterior CHAR(64);
ALTER TABLE historial_recuperacion ADD COLUMN IF NOT EXISTS hash          CHAR(64);
CREATE INDEX IF NOT EXISTS idx_historial_activo ON historial_recuperacion (activo_id);

-- Texto canónico del evento. server/src/services/ledgerService.js lo reproduce para verificar
-- la cadena fuera de la base: si cambias el formato aquí, cámbialo también allí.
-- La fecha va en microsegundos desde 1970 para no depender de la zona horaria.
CREATE OR REPLACE FUNCTION fn_historial_huella(
  p_hash_anterior CHAR(64), p_secuencia BIGINT, p_incidente INTEGER, p_servicio INTEGER, p_activo INTEGER,
  p_evento VARCHAR, p_estado_anterior VARCHAR, p_estado_nuevo VARCHAR, p_detalle TEXT, p_usuario INTEGER, p_fecha TIMESTAMPTZ
) RETURNS CHAR(64) LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws(chr(31),
    p_hash_anterior, p_secuencia::TEXT,
    coalesce(p_incidente::TEXT, ''), coalesce(p_servicio::TEXT, ''), coalesce(p_activo::TEXT, ''),
    p_evento, coalesce(p_estado_anterior, ''), coalesce(p_estado_nuevo, ''), coalesce(p_detalle, ''),
    p_usuario::TEXT, floor(extract(EPOCH FROM p_fecha) * 1000000)::BIGINT::TEXT
  ), 'UTF8')), 'hex')
$$;

-- La secuencia (no el id) ordena la cadena: dos transacciones pueden obtener ids en un
-- orden y confirmar en otro; el candado asegura que cada evento enlace con el último confirmado.
CREATE OR REPLACE FUNCTION fn_historial_encadenar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ultimo RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('historial_recuperacion_cadena'));
  SELECT secuencia, hash INTO v_ultimo
    FROM historial_recuperacion WHERE secuencia IS NOT NULL
   ORDER BY secuencia DESC LIMIT 1;
  NEW.secuencia     := coalesce(v_ultimo.secuencia, 0) + 1;
  NEW.hash_anterior := coalesce(v_ultimo.hash, repeat('0', 64));
  NEW.hash          := fn_historial_huella(NEW.hash_anterior, NEW.secuencia, NEW.incidente_id, NEW.servicio_id,
                         NEW.activo_id, NEW.evento, NEW.estado_anterior, NEW.estado_nuevo, NEW.detalle,
                         NEW.usuario_id, NEW.fecha);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_historial_encadenar ON historial_recuperacion;
CREATE TRIGGER trg_historial_encadenar
  BEFORE INSERT ON historial_recuperacion
  FOR EACH ROW EXECUTE FUNCTION fn_historial_encadenar();

-- Bases existentes: encadena los eventos anteriores en orden de fecha. Es la única vez que
-- se actualiza la bitácora, por eso se suspende un momento el trigger de inmutabilidad.
DO $$
DECLARE
  r RECORD;
  v_seq  BIGINT  := 0;
  v_prev CHAR(64) := repeat('0', 64);
BEGIN
  IF EXISTS (SELECT 1 FROM historial_recuperacion WHERE hash IS NULL) THEN
    PERFORM pg_advisory_xact_lock(hashtext('historial_recuperacion_cadena'));
    ALTER TABLE historial_recuperacion DISABLE TRIGGER trg_historial_inmutable;
    SELECT coalesce(max(secuencia), 0), coalesce((SELECT hash FROM historial_recuperacion WHERE secuencia IS NOT NULL ORDER BY secuencia DESC LIMIT 1), repeat('0', 64))
      INTO v_seq, v_prev FROM historial_recuperacion;
    FOR r IN SELECT * FROM historial_recuperacion WHERE hash IS NULL ORDER BY fecha, id LOOP
      v_seq := v_seq + 1;
      UPDATE historial_recuperacion
         SET secuencia = v_seq, hash_anterior = v_prev,
             hash = fn_historial_huella(v_prev, v_seq, r.incidente_id, r.servicio_id, r.activo_id, r.evento,
                                        r.estado_anterior, r.estado_nuevo, r.detalle, r.usuario_id, r.fecha)
       WHERE id = r.id
      RETURNING hash INTO v_prev;
    END LOOP;
    ALTER TABLE historial_recuperacion ENABLE TRIGGER trg_historial_inmutable;
  END IF;
END $$;

ALTER TABLE historial_recuperacion ALTER COLUMN secuencia     SET NOT NULL;
ALTER TABLE historial_recuperacion ALTER COLUMN hash_anterior SET NOT NULL;
ALTER TABLE historial_recuperacion ALTER COLUMN hash          SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_historial_secuencia ON historial_recuperacion (secuencia);

-- -----------------------------------------------------------------------------
-- Vista de apoyo: última verificación de cada activo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ultima_verificacion AS
SELECT DISTINCT ON (ri.activo_id)
       ri.activo_id, ri.resultado, ri.nota, ri.verificado_en, ri.ronda_id, u.nombre AS verificado_por
  FROM ronda_items ri
  JOIN usuarios u ON u.id = ri.verificado_por
 WHERE ri.resultado IS NOT NULL
 ORDER BY ri.activo_id, ri.verificado_en DESC;

COMMIT;
