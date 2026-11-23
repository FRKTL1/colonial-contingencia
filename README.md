# Centro de Contingencia — Colonial Pipeline (2021)

Sistema web para gestionar la respuesta a un ataque de ransomware sobre infraestructura
crítica. Convierte el plan de contingencia en una máquina de estados (etapas, decisiones
D1–D4, ruta alternativa y reintento) y lo acompaña con un panel de servicios,
**evidencias multimedia con cadena de custodia**, **seguridad con MFA**, **analítica de la
respuesta** y un **mapa de calor de la red real del oleoducto** (funciones adaptadas del
proyecto [Rack · Operación](https://github.com/Aldoyzx/rack-operacion)). Está listo para desplegarse en la nube (Render).

| Capa | Tecnología |
|---|---|
| Diseño | Figma (panel normal, crisis, recuperación y móvil) |
| Frontend | React 19 + Vite 8 · Recharts 3 (gráficos) · CSS con los tokens de Figma |
| Backend | Node.js 22 + Express 5 · zod · helmet · multer · file-type · qrcode |
| Base de datos | PostgreSQL 16 (driver `pg`) |
| Seguridad | scrypt, sesión firmada HS256 en cookie httpOnly, TOTP (RFC 6238), AES-256-GCM |
| Nube | Render (Blueprint `render.yaml`) · guía en [DESPLIEGUE.md](DESPLIEGUE.md) |
| Calidad | 73 pruebas automatizadas (`node:test`) · GitHub Actions |


> **Entregables de la actividad** (ficha, diagrama, presentación, guion, Figma): ver [`entrega/`](entrega/README.md).

## Módulos

| Módulo | Qué hace |
|---|---|
| Acceso | Contraseña + código MFA, bloqueo tras 5 intentos, límite por IP |
| Panel | Estado de los 10 servicios TI/OT, incidentes abiertos y eventos (se actualiza cada 10 s) |
| Mapa de calor | Red de Colonial de Houston a Linden: 22 instalaciones del mapa oficial en sus coordenadas, líneas 1–4 y ramales. Escala de calor de Rack alimentada con la capacidad nominal publicada de cada tramo detenido; capas de impacto, estado y verificación; reproducción día a día del 7 al 13 de mayo de 2021 |
| Aislamiento | Al caer un servicio, sus tramos (bombeo detenido, válvulas cerradas) y sistemas se aíslan solos, como el paro del 7 de mayo; aislamiento manual por rol; no se reinicia sin una verificación OK posterior |
| Rondas | Lista de verificación con fuente por tipo (tramo, sistema TI, sistema OT); un OK exige confirmar todos los puntos; cierre solo con todo verificado |
| Fuentes | Cada instalación, tramo, sistema, punto de verificación y día del caso cita su fuente pública (Colonial, Senado, CISA/FBI, TSA, McKinsey, S&P…) |
| Bitácora | Historial encadenado con SHA-256 y verificación de integridad recalculada fuera de la base |
| Incidentes | Registro (real o simulacro), flujo D1–D4, acciones por responsable, bitácora |
| Evidencias | Carga con arrastrar y soltar, visor (imagen, PDF, video, audio, registros), huella SHA-256, verificación de integridad, anulación con motivo y biblioteca |
| Plan | Procedimiento, responsable y recursos tecnológicos de cada etapa |
| Analítica | MTTR, MTTC, tiempo por etapa, horas fuera de servicio, decisiones, acciones, evidencias, eventos de seguridad y exportación CSV |
| Mi cuenta | Activar MFA con QR, cambiar contraseña y, para el coordinador, la bitácora de seguridad |

## Puesta en marcha local

Requisitos: Node.js 22 y PostgreSQL 16 (o Docker Desktop).

```bash
docker compose up -d                      # o: psql -U postgres -f database/00_crear_base_de_datos.sql
cd server && npm install
cd ../client && npm install && npm run build
cd ../server && npm run db:demo && npm start    # http://localhost:4000
```

Cuentas de demostración (contraseña `Colonial2021!`; cámbienla en "Mi cuenta"):

| Usuario | Correo | Rol |
|---|---|---|
| María Torres | mtorres@colonial.local | Coordinadora de respuesta (decide D1–D4) |
| Javier Ríos | jrios@colonial.local | Analista TI |
| Lucía Paredes | lparedes@colonial.local | Operadora OT |
| Andrés Salinas | asalinas@colonial.local | Asesoría legal |
| Carla Méndez | cmendez@colonial.local | Comunicaciones |

| Comando (en `server/`) | Qué hace |
|---|---|
| `npm test` | 73 pruebas contra la base `contingencia_test` |
| `npm run db:demo` | Recrea la base con datos iniciales e incidentes históricos (2021–2026) |
| `npm run db:reset` | Recrea la base solo con los datos iniciales |
| `npm run simulacro` | Ejecuta un simulacro completo y escribe el informe en `docs/evidencias/` |
| `npm run db:generate-seed` / `db:generate-demo` | Regeneran los scripts 02 y 04 desde el código |

## Variables de entorno (`server/.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | 4000 | Puerto HTTP |
| `DATABASE_URL` | `postgres://contingencia:contingencia@localhost:5432/contingencia` | Conexión a PostgreSQL |
| `APP_SECRET` | aleatorio en desarrollo | Firma de sesiones y cifrado de MFA (obligatorio en producción, 32+ caracteres) |
| `ALMACENAMIENTO` | `local` (`postgres` en producción) | Dónde se guardan las evidencias |
| `MAX_ARCHIVO_MB` | 10 | Tamaño máximo por evidencia |
| `MFA_OBLIGATORIO_ROLES` | vacío | Roles que no operan sin MFA, ej. `coordinador` |
| `MOSTRAR_CUENTAS_DEMO` | `true` en desarrollo | Muestra las cuentas de prueba en el acceso |
| `CARGAR_DATOS_DEMO` | `false` | Carga los incidentes históricos al crear la base |
| `SESION_HORAS` · `LIMITE_LOGIN_POR_MINUTO` | 8 · 10 | Duración de la sesión y límite de intentos por IP |

## Base de datos

`database/` contiene los scripts entregables; el servidor ejecuta esos mismos archivos.

| Script | Contenido |
|---|---|
| `00_crear_base_de_datos.sql` | Rol `contingencia` y bases `contingencia` y `contingencia_test` |
| `01_esquema.sql` | Esquema completo: 10 ENUM, 14 tablas, 29 claves foráneas, CHECK/UNIQUE, 2 triggers de auditoría, índices y 4 vistas |
| `02_datos_iniciales.sql` | Catálogo del plan, 15 recursos, 5 usuarios (contraseña con scrypt) y 10 servicios |
| `03_verificacion.sql` | Consultas de verificación de la estructura |
| `04_datos_prueba.sql` | 7 incidentes históricos (2021–2026), incluidos 2 simulacros |
| `05_…` · `06_migracion_entrega_final.sql` | Migraciones para bases creadas con versiones anteriores (se aplican solas) |
| `07_migracion_mapas.sql` | Instalaciones, tramos y sistemas con sus fuentes, rondas de verificación y bitácora encadenada (se aplica en cada arranque; encadena los eventos existentes) |

Diagrama entidad-relación: `docs/der/DER.png`.

## Seguridad

- **Contraseñas** con scrypt (N = 2^15, r = 8, p = 3, configuración de OWASP) y sal aleatoria; política de NIST SP 800-63B-4: 12+ caracteres y rechazo de contraseñas previsibles, sin reglas de composición.
- **Sesión** en cookie `httpOnly`, `SameSite=Strict` y `Secure` (en producción), firmada con HMAC-SHA256; caduca en 8 h.
- **MFA** con TOTP (RFC 6238), compatible con Google o Microsoft Authenticator; el secreto se guarda cifrado con AES-256-GCM. Se puede exigir por rol.
- **Fuerza bruta:** bloqueo de la cuenta 15 min tras 5 fallos, límite de 10 intentos por minuto por IP y el mismo mensaje para correo inexistente o contraseña errónea (con tiempo de respuesta constante).
- **CSRF:** cookie `SameSite=Strict` y cabecera `X-Requested-With` obligatoria en las modificaciones.
- **Autorización por rol** en el servidor (decisiones, acciones, servicios TI/OT, evidencias y bitácora de seguridad).
- **Archivos:** tipo validado por su firma binaria (no por la extensión), sin SVG ni HTML, `nosniff`, CSP `sandbox` y descarga con nombre saneado.
- **Auditoría:** `historial_recuperacion` y `eventos_seguridad` son de solo inserción (triggers). Además, cada evento del historial guarda la huella SHA-256 del anterior (ISO/IEC 27001 A.8.15): cambiar o borrar uno, incluso desde la base, rompe la cadena y `GET /api/bitacora/verificar` indica dónde.

### Datos de referencia

Datos de la red: solo lo publicado. Instalaciones y líneas del mapa oficial de reinicio de Colonial (13 may 2021); capacidad, diámetro y producto de cada línea de McKinsey Energy Insights; cronología del testimonio de Joseph Blount ante el Senado y de S&P Global / Fox Business; listas de verificación de la alerta AA21-131A de CISA/FBI y de la directiva TSA Pipeline-2021-02. Las coordenadas son las del centro de cada ciudad y el trazado entre ellas es esquemático; la capacidad de los ramales no es pública y se muestra como "sin dato público". El detalle está en `server/src/domain/sources.js` y en la pestaña Fuentes del mapa.
- helmet (CSP, HSTS, X-Frame-Options), consultas parametrizadas y validación con zod en cada entrada.

## API (resumen)

| Grupo | Rutas |
|---|---|
| Sesión | `POST /api/auth/login`, `/auth/mfa`, `/auth/logout`, `/auth/clave`, `/auth/mfa/configurar`, `/auth/mfa/confirmar`, `/auth/mfa/desactivar` · `GET /auth/sesion`, `/auth/config` |
| Operación | `GET /api/dashboard`, `/servicios`, `/plan`, `/incidentes[/:id]` · `POST /incidentes`, `/:id/avanzar`, `/:id/decisiones`, `/:id/acciones` · `PATCH /acciones/:id`, `/servicios/:id/estado` |
| Evidencias | `GET/POST /api/incidentes/:id/evidencias` · `GET /evidencias`, `/evidencias/:id/contenido`, `/evidencias/:id/verificar` · `POST /evidencias/:id/anular` |
| Analítica | `GET /api/analitica`, `/analitica/incidentes.csv`, `/seguridad/eventos` (coordinador) |
| Mapa y elementos | `GET /api/mapas/oleoducto`, `/activos/:id` · `POST /activos/:id/aislar`, `/activos/:id/liberar` |
| Rondas | `GET/POST /api/rondas` · `GET /rondas/:id` · `PATCH /rondas/:id/activos/:activoId` · `POST /rondas/:id/cerrar` |
| Bitácora | `GET /api/bitacora`, `/bitacora/verificar` |
| Salud | `GET /api/health` (base de datos y almacenamiento) |

Errores: `{ error: { code, message, details? } }` con 400, 401, 403, 404, 409, 413 y 429.

## Documentación

- [DESPLIEGUE.md](DESPLIEGUE.md): despliegue en Render paso a paso.
- `docs/der/DER.png`: diagrama entidad-relación.
- `docs/revision-actividad2.md`: hallazgos y correcciones de la revisión.
- `docs/evidencias/`: informes de simulacro.
