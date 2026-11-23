-- =============================================================================
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
  ('deteccion', 'Detección', 1, 'accion', 'Confirmar la nota de rescate, revisar las alertas del EDR y del SIEM y registrar el incidente con los servicios afectados.', 'analista_ti', 'evaluacion', FALSE),
  ('evaluacion', 'Evaluación', 2, 'decision', 'Activar el comité de crisis, medir el alcance (equipos cifrados, cuentas comprometidas) y estimar el riesgo de propagación a la red OT. Resolver D1.', 'coordinador', NULL, FALSE),
  ('contencion', 'Contención', 3, 'decision', 'Desconectar los equipos comprometidos, bloquear accesos (VPN y cuentas), preservar evidencia y notificar a FBI, CISA y Dpto. de Energía. Resolver D2.', 'analista_ti', NULL, FALSE),
  ('erradicacion', 'Erradicación', 4, 'decision', 'Eliminar el malware y su persistencia, rotar credenciales privilegiadas, cerrar la VPN sin MFA y validar con barridos del EDR. Resolver D3.', 'analista_ti', NULL, FALSE),
  ('analisis_forense', 'Análisis forense', 4.5, 'accion', 'Analizar imágenes de disco y memoria para hallar la persistencia que hizo fallar la erradicación, corregirla y volver a erradicar.', 'analista_ti', 'erradicacion', TRUE),
  ('recuperacion', 'Recuperación', 5, 'decision', 'Reiniciar el oleoducto de forma manual y progresiva por tramos, validando presión y SCADA en cada uno; restaurar TI desde respaldos. Resolver D4.', 'operador_ot', NULL, FALSE),
  ('ruta_alternativa', 'Ruta alternativa', 5.5, 'accion', 'Coordinar transporte por camiones, exenciones regulatorias con el gobierno y comunicados públicos sobre el abastecimiento.', 'comunicaciones', 'servicio_restablecido', FALSE),
  ('servicio_restablecido', 'Servicio restablecido', 6, 'accion', 'Verificar que todos los tramos entregan con normalidad y que los sistemas de TI vuelven a operar.', 'operador_ot', 'cierre', FALSE),
  ('cierre', 'Cierre', 7, 'accion', 'Documentar lecciones aprendidas (MFA, segmentación TI/OT, respaldos, simulacros) y emitir el informe final.', 'coordinador', 'finalizado', FALSE),
  ('finalizado', 'Finalizado', 8, 'final', NULL, NULL, NULL, FALSE)
ON CONFLICT (clave) DO UPDATE SET
  nombre = EXCLUDED.nombre, orden = EXCLUDED.orden, tipo = EXCLUDED.tipo,
  procedimiento = EXCLUDED.procedimiento, rol_responsable = EXCLUDED.rol_responsable,
  siguiente = EXCLUDED.siguiente, es_reintento = EXCLUDED.es_reintento;

-- Decisiones D1–D4 (rombos del diagrama)
INSERT INTO decisiones_plan (codigo, etapa, pregunta, destino_si, destino_no, accion_si, accion_no) VALUES
  ('D1', 'evaluacion', '¿El ataque puede propagarse a los sistemas OT?', 'contencion', 'contencion', 'Detener preventivamente el oleoducto y aislar las redes TI / OT', 'Mantener la operación con monitoreo reforzado y contener solo los equipos de TI'),
  ('D2', 'contencion', '¿Existen respaldos limpios y verificados?', 'erradicacion', 'erradicacion', 'Restaurar los sistemas desde copias de seguridad', 'Evaluar con asesoría legal y autoridades el pago del rescate y el uso de la herramienta de descifrado'),
  ('D3', 'erradicacion', '¿Sistemas seguros y validados para reiniciar?', 'recuperacion', 'analisis_forense', 'Reinicio progresivo y manual del oleoducto por tramos', 'Análisis forense y corrección adicional'),
  ('D4', 'recuperacion', '¿Hay riesgo de desabastecimiento de combustible?', 'ruta_alternativa', 'servicio_restablecido', 'Transporte por camiones, coordinación con el gobierno, exenciones regulatorias y comunicación pública', NULL)
ON CONFLICT (codigo) DO UPDATE SET
  etapa = EXCLUDED.etapa, pregunta = EXCLUDED.pregunta,
  destino_si = EXCLUDED.destino_si, destino_no = EXCLUDED.destino_no,
  accion_si = EXCLUDED.accion_si, accion_no = EXCLUDED.accion_no;

-- Recursos tecnológicos del plan
INSERT INTO recursos_tecnologicos (codigo, nombre, categoria, descripcion) VALUES
  ('R01', 'EDR / antivirus corporativo', 'herramienta', 'Detección y respuesta en equipos; barridos para validar la erradicación.'),
  ('R02', 'SIEM y registros centralizados', 'herramienta', 'Correlación de alertas y evidencia de la actividad anómala.'),
  ('R03', 'Firewall y segmentación TI/OT', 'infraestructura', 'Permite aislar la red operativa de la red corporativa.'),
  ('R04', 'Respaldos offline inmutables', 'infraestructura', 'Copias fuera de línea verificadas para restaurar sin pagar rescate.'),
  ('R05', 'Herramienta de descifrado', 'herramienta', 'Descifrador obtenido tras el pago o de las autoridades; lento, se usa como apoyo.'),
  ('R06', 'Kit forense (disco y memoria)', 'herramienta', 'Imágenes forenses para hallar persistencia y preservar evidencia.'),
  ('R07', 'Gestión de identidades con MFA', 'infraestructura', 'Rotación de credenciales y segundo factor obligatorio en la VPN.'),
  ('R08', 'Canal de comunicación fuera de banda', 'infraestructura', 'Teléfonos y chat alterno por si el correo corporativo está comprometido.'),
  ('R09', 'Contactos de FBI, CISA y Dpto. de Energía', 'servicio_externo', 'Notificación obligatoria y apoyo de las autoridades.'),
  ('R10', 'Proveedor de respuesta a incidentes', 'servicio_externo', 'Equipo especializado externo (en el caso real, Mandiant).'),
  ('R11', 'Asesoría legal y seguro cibernético', 'servicio_externo', 'Evalúa el pago del rescate, obligaciones regulatorias y cobertura.'),
  ('R12', 'Flota de camiones y acuerdos logísticos', 'servicio_externo', 'Ruta alternativa de suministro mientras el oleoducto está detenido.'),
  ('R13', 'Procedimientos de operación manual (SCADA)', 'documento', 'Guía para reiniciar cada tramo de forma manual y segura.'),
  ('R14', 'Centro de Contingencia (este sistema)', 'herramienta', 'Registro del incidente, decisiones, acciones y estado de servicios.'),
  ('R15', 'Plantillas de comunicación pública', 'documento', 'Comunicados preaprobados para clientes, prensa y gobierno.')
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria, descripcion = EXCLUDED.descripcion;

-- Recursos por etapa (N:M)
INSERT INTO etapa_recursos (etapa, recurso_id)
SELECT v.etapa, r.id
  FROM (VALUES
  ('deteccion', 'R01'),
  ('deteccion', 'R02'),
  ('deteccion', 'R14'),
  ('evaluacion', 'R02'),
  ('evaluacion', 'R08'),
  ('evaluacion', 'R14'),
  ('contencion', 'R03'),
  ('contencion', 'R07'),
  ('contencion', 'R09'),
  ('contencion', 'R10'),
  ('erradicacion', 'R01'),
  ('erradicacion', 'R06'),
  ('erradicacion', 'R07'),
  ('erradicacion', 'R10'),
  ('analisis_forense', 'R02'),
  ('analisis_forense', 'R06'),
  ('analisis_forense', 'R10'),
  ('recuperacion', 'R04'),
  ('recuperacion', 'R05'),
  ('recuperacion', 'R13'),
  ('ruta_alternativa', 'R09'),
  ('ruta_alternativa', 'R12'),
  ('ruta_alternativa', 'R15'),
  ('servicio_restablecido', 'R13'),
  ('servicio_restablecido', 'R14'),
  ('cierre', 'R11'),
  ('cierre', 'R14')
  ) AS v (etapa, codigo)
  JOIN recursos_tecnologicos r ON r.codigo = v.codigo
ON CONFLICT DO NOTHING;

-- Usuarios (actores del plan). Contraseña inicial de demostración: ver server/src/db/seedData.js.
-- Si la cuenta ya existe, solo completa la contraseña cuando aún no tiene una.
INSERT INTO usuarios (nombre, email, rol, clave_hash) VALUES
  ('María Torres', 'mtorres@colonial.local', 'coordinador', 'scrypt$32768$8$3$STv3RauCtEdRUyf7J+hhwg==$DPzzgy0QzL24zL4xr+rBTpbtEOgetmmbD85Xd/hkRFKKDTAGa6L+179uTZ2pK05HjRQXp1/4IbpPAoAfqF8MyQ=='),
  ('Javier Ríos', 'jrios@colonial.local', 'analista_ti', 'scrypt$32768$8$3$1ikNr6F6EdSqXh4ukbhHKA==$YKkiHYhtOV1FrFS9rY8LO8R1eh/1jpYZCac3gNLvkQ2XsesHM49+Y6J5aTJ1mHI7L/FDGdpq5bn97Oz75tWpFg=='),
  ('Lucía Paredes', 'lparedes@colonial.local', 'operador_ot', 'scrypt$32768$8$3$tadMTW4+0ZDdVNBI4PveCA==$fgEv0btTg3t3/PXAz3pRs9BFpzl3tLoLglKYWCUOzCVoMUsLeX8pAmLtArj/QcbtfanWmomzdQkPe5mXGwzINw=='),
  ('Andrés Salinas', 'asalinas@colonial.local', 'legal', 'scrypt$32768$8$3$mLhKXJKYHbmnrdapiCL7CA==$s9oyar+ZhSkRcRPsu9fHAL4gm+kx8gFNGDPWuXJOfNb3EJg8sDXGIQD8n6Huf2HC8vM+slV38gYIYdfFRFWBfA=='),
  ('Carla Méndez', 'cmendez@colonial.local', 'comunicaciones', 'scrypt$32768$8$3$tjaknJ7RiEgqTSTQdo7sjA==$SgLIrJdmoUg45iCUfWc2bj+ESVWHvRl0pRY6cPc7NT5qN+gNhgkMwhLoQI0nw+E7Yaxg5s6dphaj8LPMW+tvxQ==')
ON CONFLICT (email) DO UPDATE SET clave_hash = COALESCE(usuarios.clave_hash, EXCLUDED.clave_hash);

-- Servicios TI / OT del oleoducto
INSERT INTO servicios (codigo, nombre, tipo, criticidad, descripcion) VALUES
  ('OT-T1', 'Tramo 1: Houston – Atlanta', 'OT', 5, 'Línea principal de gasolina y diésel desde la costa del Golfo.'),
  ('OT-T2', 'Tramo 2: Atlanta – Greensboro', 'OT', 5, 'Distribución hacia el sureste.'),
  ('OT-T3', 'Tramo 3: Greensboro – Linden', 'OT', 5, 'Entrega hacia la costa este y Nueva Jersey.'),
  ('OT-SCADA', 'SCADA / control de bombeo', 'OT', 5, 'Supervisión y control de estaciones de bombeo.'),
  ('TI-FACT', 'Facturación a clientes', 'TI', 4, 'Sistema de facturación por volumen entregado.'),
  ('TI-ERP', 'ERP corporativo', 'TI', 4, 'Finanzas, compras y logística.'),
  ('TI-VPN', 'VPN de acceso remoto', 'TI', 3, 'Acceso remoto de empleados (vector de entrada del ataque).'),
  ('TI-AD', 'Directorio activo / identidades', 'TI', 4, 'Autenticación y gestión de cuentas.'),
  ('TI-MAIL', 'Correo corporativo', 'TI', 2, 'Comunicación interna y externa.'),
  ('TI-BKP', 'Plataforma de respaldos', 'TI', 5, 'Copias de seguridad de sistemas TI.')
ON CONFLICT (codigo) DO NOTHING;

-- Instalaciones y mercados de la red (mapa oficial de Colonial; ver fuentes de cada fila)
INSERT INTO ubicaciones (codigo, nombre, tipo, ciudad, estado_eeuu, latitud, longitud, servicio_id, descripcion, fuentes)
SELECT v.codigo, v.nombre, v.tipo::tipo_ubicacion, v.ciudad, v.estado, v.latitud, v.longitud, s.id, v.descripcion, v.fuentes
  FROM (VALUES
  ('HOU', 'Houston', 'origen', 'Houston', 'TX', 29.7604, -95.3698, 'OT-T1', 'Origen del sistema: las líneas 1 y 2 salen de aquí con producto de las refinerías del golfo.', ARRAY['mckinsey', 'wikipedia', 'colmap0513']),
  ('OPE', 'Opelousas', 'punto_entrega', 'Opelousas', 'LA', 30.5335, -92.0815, 'OT-T1', 'Mercado de entrega en Luisiana.', ARRAY['colmap0513']),
  ('MER', 'Meridian', 'punto_entrega', 'Meridian', 'MS', 32.3643, -88.7037, 'OT-T1', 'Mercado de entrega en Misisipi.', ARRAY['colmap0513']),
  ('BOL', 'Boligee', 'punto_entrega', 'Boligee', 'AL', 32.7579, -88.0281, 'OT-T1', 'Mercado de entrega en Alabama.', ARRAY['colmap0513']),
  ('BHM', 'Birmingham', 'punto_entrega', 'Birmingham', 'AL', 33.5186, -86.8104, 'OT-T1', 'Mercado de entrega en Alabama.', ARRAY['colmap0513']),
  ('ATL', 'Atlanta', 'punto_entrega', 'Atlanta', 'GA', 33.749, -84.388, 'OT-T1', 'Mercado de entrega; de aquí salen los ramales a Tennessee y al sur de Georgia.', ARRAY['colmap0513', 'mckinsey']),
  ('NAS', 'Nashville', 'punto_entrega', 'Nashville', 'TN', 36.1627, -86.7816, 'OT-T1', 'Mercado del ramal Atlanta–Tennessee.', ARRAY['colmap0513', 'mckinsey']),
  ('KNX', 'Knoxville', 'punto_entrega', 'Knoxville', 'TN', 35.9606, -83.9207, 'OT-T1', 'Mercado del ramal Atlanta–Tennessee.', ARRAY['colmap0513', 'mckinsey']),
  ('MAC', 'Macon', 'punto_entrega', 'Macon', 'GA', 32.8407, -83.6324, 'OT-T1', 'Mercado del ramal Atlanta–sur de Georgia.', ARRAY['colmap0513', 'mckinsey']),
  ('BAI', 'Bainbridge', 'punto_entrega', 'Bainbridge', 'GA', 30.9038, -84.5755, 'OT-T1', 'Mercado del ramal Atlanta–sur de Georgia.', ARRAY['colmap0513', 'mckinsey']),
  ('BEL', 'Belton', 'punto_entrega', 'Belton', 'SC', 34.5229, -82.4943, 'OT-T2', 'Mercado de entrega en Carolina del Sur.', ARRAY['colmap0513']),
  ('AUG', 'Augusta', 'punto_entrega', 'Augusta', 'GA', 33.4735, -82.0105, 'OT-T2', 'Mercado de entrega; su conexión se dibuja al nodo de línea principal más cercano.', ARRAY['colmap0513']),
  ('SPA', 'Spartanburg', 'punto_entrega', 'Spartanburg', 'SC', 34.9496, -81.932, 'OT-T2', 'Mercado de entrega en Carolina del Sur.', ARRAY['colmap0513']),
  ('CLT', 'Charlotte', 'punto_entrega', 'Charlotte', 'NC', 35.2271, -80.8431, 'OT-T2', 'Mercado de entrega en Carolina del Norte.', ARRAY['colmap0513']),
  ('GSO', 'Greensboro', 'patio_tanques', 'Greensboro', 'NC', 36.0726, -79.792, 'OT-T3', 'Patio de tanques más grande: terminan las líneas 1 y 2 y nacen las líneas 3 y 4.', ARRAY['wikipedia', 'mckinsey']),
  ('SEL', 'Selma', 'punto_entrega', 'Selma', 'NC', 35.5354, -78.2836, 'OT-T3', 'Mercado del ramal Greensboro–Raleigh/Durham.', ARRAY['colmap0513', 'mckinsey']),
  ('MIT', 'Mitchell', 'derivacion', 'Mitchell', 'VA', 38.37, -78, 'OT-T3', 'Punto del centro de Virginia del que salen los ramales a Richmond y Norfolk (ubicación aproximada: la fuente solo dice “centro de Virginia”).', ARRAY['mckinsey', 'colmap0513']),
  ('RIC', 'Richmond', 'punto_entrega', 'Richmond', 'VA', 37.5407, -77.436, 'OT-T3', 'Mercado del ramal Mitchell–Richmond/Norfolk.', ARRAY['colmap0513', 'mckinsey']),
  ('NOR', 'Norfolk', 'punto_entrega', 'Norfolk', 'VA', 36.8508, -76.2859, 'OT-T3', 'Mercado del ramal Mitchell–Richmond/Norfolk.', ARRAY['colmap0513', 'mckinsey']),
  ('DOR', 'Dorsey Junction', 'estacion', 'Woodbine', 'MD', 39.362, -77.065, 'OT-T3', 'Estación de bombeo Dorsey Junction; destino de la Línea 4 (Greensboro–Woodbine).', ARRAY['wikipedia', 'fox0510', 'colmap0513']),
  ('BAL', 'Baltimore', 'punto_entrega', 'Baltimore', 'MD', 39.2904, -76.6122, 'OT-T3', 'Mercado de entrega de la Línea 4.', ARRAY['colmap0513', 'mckinsey']),
  ('LIN', 'Linden', 'terminal', 'Linden', 'NJ', 40.622, -74.2446, 'OT-T3', 'Fin del sistema: patio de tanques Linden Junction, hacia el puerto de Nueva York.', ARRAY['colmap0513', 'wikipedia', 'mckinsey'])
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
  ('L1-T1', 'Línea 1 · Houston – Atlanta', 'tramo', 'OT', 'OT-T1', 'L1', 'HOU', 'ATL', ARRAY['OPE', 'MER', 'BOL', 'BHM'], 40, 1500000, 'Gasolina', 'Primer segmento de la línea de gasolina.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('L2-T1', 'Línea 2 · Houston – Atlanta', 'tramo', 'OT', 'OT-T1', 'L2', 'HOU', 'ATL', ARRAY['OPE', 'MER', 'BOL', 'BHM'], 36, 1200000, 'Destilados: diésel, combustible de aviación y de calefacción', 'Primer segmento de la línea de destilados.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('L1-T2', 'Línea 1 · Atlanta – Greensboro', 'tramo', 'OT', 'OT-T2', 'L1', 'ATL', 'GSO', ARRAY['BEL', 'SPA', 'CLT'], 40, 1500000, 'Gasolina', 'Segundo segmento de la línea de gasolina, hasta el patio de Greensboro.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('L2-T2', 'Línea 2 · Atlanta – Greensboro', 'tramo', 'OT', 'OT-T2', 'L2', 'ATL', 'GSO', ARRAY['BEL', 'SPA', 'CLT'], 36, 1200000, 'Destilados: diésel, combustible de aviación y de calefacción', 'Segundo segmento de la línea de destilados, hasta el patio de Greensboro.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('L3-T3', 'Línea 3 · Greensboro – Linden', 'tramo', 'OT', 'OT-T3', 'L3', 'GSO', 'LIN', ARRAY['MIT'], NULL, 885000, 'Todos los productos', 'Lleva todos los productos de Greensboro al patio de Linden, NJ.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('L4-T3', 'Línea 4 · Greensboro – Woodbine', 'tramo', 'OT', 'OT-T3', 'L4', 'GSO', 'DOR', '{}'::TEXT[], 32, 700000, 'Productos refinados', 'De Greensboro a Dorsey Junction (Woodbine, MD), hacia Baltimore.', NULL, ARRAY['mckinsey', 'fox0510', 'colmap0513']),
  ('LAT-NAS', 'Ramal Atlanta – Nashville', 'tramo', 'OT', 'OT-T1', 'LAT', 'ATL', 'NAS', '{}'::TEXT[], NULL, NULL, NULL, 'Parte del ramal Atlanta–Tennessee.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('LAT-KNX', 'Ramal Atlanta – Knoxville', 'tramo', 'OT', 'OT-T1', 'LAT', 'ATL', 'KNX', '{}'::TEXT[], NULL, NULL, NULL, 'Parte del ramal Atlanta–Tennessee.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('LAT-MAC', 'Ramal Atlanta – Macon', 'tramo', 'OT', 'OT-T1', 'LAT', 'ATL', 'MAC', '{}'::TEXT[], NULL, NULL, NULL, 'Parte del ramal Atlanta–sur de Georgia.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('LAT-BAI', 'Ramal Macon – Bainbridge', 'tramo', 'OT', 'OT-T1', 'LAT', 'MAC', 'BAI', '{}'::TEXT[], NULL, NULL, NULL, 'Parte del ramal Atlanta–sur de Georgia.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('LAT-AUG', 'Conexión a Augusta', 'tramo', 'OT', 'OT-T2', 'LAT', 'BEL', 'AUG', '{}'::TEXT[], NULL, NULL, NULL, 'Conexión esquemática al nodo de línea principal más cercano: la ruta real no se publica.', NULL, ARRAY['colmap0513']),
  ('LAT-SEL', 'Ramal Greensboro – Selma', 'tramo', 'OT', 'OT-T3', 'LAT', 'GSO', 'SEL', '{}'::TEXT[], NULL, NULL, NULL, 'Ramal Greensboro–Raleigh/Durham.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('LAT-RIC', 'Ramal Mitchell – Richmond', 'tramo', 'OT', 'OT-T3', 'LAT', 'MIT', 'RIC', '{}'::TEXT[], NULL, NULL, NULL, 'Parte del ramal Mitchell–Richmond/Norfolk.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('LAT-NOR', 'Ramal Richmond – Norfolk', 'tramo', 'OT', 'OT-T3', 'LAT', 'RIC', 'NOR', '{}'::TEXT[], NULL, NULL, NULL, 'Parte del ramal Mitchell–Richmond/Norfolk.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('LAT-BAL', 'Conexión Dorsey – Baltimore', 'tramo', 'OT', 'OT-T3', 'LAT', 'DOR', 'BAL', '{}'::TEXT[], NULL, NULL, NULL, 'Entrega de la Línea 4 en el área de Baltimore.', NULL, ARRAY['mckinsey', 'colmap0513']),
  ('VPN-LEGADA', 'Perfil VPN heredado', 'sistema', 'TI', 'TI-VPN', NULL, NULL, NULL, '{}'::TEXT[], NULL, NULL, NULL, 'Acceso remoto a la red corporativa.', 'Perfil que no debía estar en uso y solo pedía una contraseña, sin MFA: por ahí entró el atacante.', ARRAY['blount', 'insjournal']),
  ('FACT-SIS', 'Facturación y contabilidad', 'sistema', 'TI', 'TI-FACT', NULL, NULL, NULL, '{}'::TEXT[], NULL, NULL, NULL, 'Factura a cada cliente el volumen entregado.', 'Fue de los sistemas TI afectados; sin facturación no se podía cobrar lo entregado.', ARRAY['techtarget', 'spg0508']),
  ('SCADA-CTL', 'Centro de control y SCADA', 'sistema', 'OT', 'OT-SCADA', NULL, NULL, NULL, '{}'::TEXT[], NULL, NULL, NULL, 'Supervisa y opera el bombeo de toda la red.', 'No fue comprometido directamente; su supervisor emitió la orden de paro para que el malware no llegara a OT.', ARRAY['blount', 'techtarget'])
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
