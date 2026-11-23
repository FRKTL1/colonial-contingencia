import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../domain/errors.js';
import { describeFlow } from '../domain/flow.js';
import { DEMO_PASSWORD, USERS } from '../db/seedData.js';
import { createRateLimiter } from '../security/rateLimiter.js';
import { createAction, updateAction } from '../services/actionService.js';
import { getAnalytics, incidentsCsv } from '../services/analyticsService.js';
import {
  authenticateMfa,
  authenticatePassword,
  changePassword,
  confirmMfaEnrollment,
  disableMfa,
  getPublicUser,
  listSecurityEvents,
  recordSecurityEvent,
  startMfaEnrollment,
} from '../services/authService.js';
import {
  ACCEPTED_EXTENSIONS,
  contentDisposition,
  listEvidenceLibrary,
  listIncidentEvidence,
  readEvidenceContent,
  uploadEvidence,
  verifyEvidenceIntegrity,
  voidEvidence,
} from '../services/evidenceService.js';
import {
  advanceIncident,
  createIncident,
  decideIncident,
  getIncidentDetail,
  listIncidents,
} from '../services/incidentService.js';
import { getContingencyPlan } from '../services/planService.js';
import { getAsset, getPipelineMap, isolateAsset, releaseAsset } from '../services/assetService.js';
import { listLedger, verifyLedger } from '../services/ledgerService.js';
import { closeRound, getRound, listRounds, recordCheck, startRound } from '../services/roundService.js';
import { changeServiceStatus, getDashboard, listServices } from '../services/serviceStatusService.js';
import { listUsers } from '../services/userService.js';
import { createStorage } from '../storage/index.js';
import {
  advanceSchema,
  changePasswordSchema,
  contentQuerySchema,
  createActionSchema,
  createIncidentSchema,
  decisionSchema,
  disableMfaSchema,
  evidenceLibraryQuerySchema,
  idParamSchema,
  isolateAssetSchema,
  ledgerQuerySchema,
  listIncidentsQuerySchema,
  loginSchema,
  mfaCodeSchema,
  mfaLoginSchema,
  parse,
  recordCheckSchema,
  releaseAssetSchema,
  roundItemParamsSchema,
  serviceStatusSchema,
  startRoundSchema,
  updateActionSchema,
  uploadEvidenceSchema,
  voidEvidenceSchema,
} from './schemas.js';
import { authenticate, createSessionManager, mfaPending, requestContext, requireRole } from './session.js';

const CLIENT_DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'client', 'dist');

/** Tipos que el navegador puede mostrar en línea sin riesgo de ejecutar código. */
const INLINE_SAFE = /^(image\/(jpeg|png|webp|gif)|application\/pdf|video\/|audio\/|text\/plain|text\/csv|application\/json)/;

function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido' : `Carga inválida: ${err.message}`;
    return res.status(status).json({ error: { code: 'UPLOAD_ERROR', message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo no es JSON válido' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo excede el tamaño permitido' } });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'El registro ya existe o fue modificado por otro usuario' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
}

function authRoutes(db, config, sessions, loginLimiter) {
  const router = express.Router();
  const auth = authenticate(db, config, { allowMfaPending: true });

  const sessionResponse = async (userId) => {
    const usuario = await getPublicUser(db, userId);
    return { usuario, mfaPendiente: mfaPending(usuario, config) };
  };

  router.get('/config', (_req, res) => res.json({
    cuentasDemo: config.showDemoAccounts ? { clave: DEMO_PASSWORD, cuentas: USERS.map((u) => ({ email: u.email, nombre: u.nombre, rol: u.rol })) } : null,
    mfaObligatorioRoles: config.mfaRequiredRoles,
  }));

  router.post('/login', async (req, res) => {
    if (!loginLimiter.take(req.ip)) {
      return res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos desde esta red. Espera un minuto' } });
    }
    const credentials = parse(loginSchema, req.body);
    const result = await authenticatePassword(db, credentials, requestContext(req));
    if (result.mfaRequerido) {
      return res.json({ mfaRequerido: true, desafio: sessions.issueMfaChallenge(result.userId) });
    }
    sessions.issueSession(res, result.userId);
    res.json(await sessionResponse(result.userId));
  });

  router.post('/mfa', async (req, res) => {
    if (!loginLimiter.take(req.ip)) {
      return res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera un minuto' } });
    }
    const { desafio, codigo } = parse(mfaLoginSchema, req.body);
    const userId = sessions.readMfaChallenge(desafio);
    await authenticateMfa(db, userId, codigo, requestContext(req), config.appSecret);
    sessions.issueSession(res, userId);
    res.json(await sessionResponse(userId));
  });

  router.get('/sesion', auth, async (req, res) => res.json(await sessionResponse(req.user.id)));

  router.post('/logout', auth, async (req, res) => {
    await recordSecurityEvent(db, { usuarioId: req.user.id, email: req.user.email, evento: 'cierre_sesion' }, requestContext(req));
    sessions.clearSession(res);
    res.status(204).end();
  });

  router.post('/mfa/configurar', auth, async (req, res) => {
    res.json(await startMfaEnrollment(db, req.user, config.appSecret));
  });
  router.post('/mfa/confirmar', auth, async (req, res) => {
    const { codigo } = parse(mfaCodeSchema, req.body);
    await confirmMfaEnrollment(db, req.user, codigo, requestContext(req), config.appSecret);
    res.json(await sessionResponse(req.user.id));
  });
  router.post('/mfa/desactivar', auth, async (req, res) => {
    await disableMfa(db, req.user, parse(disableMfaSchema, req.body), requestContext(req), config.appSecret, config.mfaRequiredRoles);
    res.json(await sessionResponse(req.user.id));
  });
  router.post('/clave', auth, async (req, res) => {
    await changePassword(db, req.user, parse(changePasswordSchema, req.body), requestContext(req));
    res.status(204).end();
  });
  return router;
}

function evidenceRoutes(db, config, storage) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5 } });

  router.get('/evidencias/config', (_req, res) => res.json({ extensiones: ACCEPTED_EXTENSIONS, maxBytes: config.maxUploadBytes }));

  router.get('/evidencias', async (req, res) => {
    res.json(await listEvidenceLibrary(db, parse(evidenceLibraryQuerySchema, req.query)));
  });

  router.get('/incidentes/:id/evidencias', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await listIncidentEvidence(db, id));
  });

  router.post('/incidentes/:id/evidencias', upload.single('archivo'), async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const fields = parse(uploadEvidenceSchema, req.body);
    res.status(201).json(await uploadEvidence(db, storage, id, { file: req.file, ...fields }, req.user));
  });

  router.get('/evidencias/:id/contenido', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { descargar } = parse(contentQuerySchema, req.query);
    const { evidence, buffer } = await readEvidenceContent(db, storage, id);
    const inline = descargar !== '1' && INLINE_SAFE.test(evidence.tipo_mime);
    res.set({
      'Content-Type': evidence.tipo_mime,
      'Content-Length': String(buffer.length),
      'Content-Disposition': contentDisposition(evidence.nombre_original, !inline),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (inline && evidence.tipo_mime !== 'application/pdf') {
      res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    }
    res.send(buffer);
  });

  router.get('/evidencias/:id/verificar', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await verifyEvidenceIntegrity(db, storage, id));
  });

  router.post('/evidencias/:id/anular', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await voidEvidence(db, id, parse(voidEvidenceSchema, req.body), req.user));
  });
  return router;
}

/** Mapa de calor de la red, aislamiento de tramos y sistemas, rondas y bitácora encadenada. */
function mapRoutes(db) {
  const router = express.Router();

  router.get('/mapas/oleoducto', async (_req, res) => res.json(await getPipelineMap(db)));

  router.get('/activos/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await getAsset(db, id));
  });
  router.post('/activos/:id/aislar', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await isolateAsset(db, id, parse(isolateAssetSchema, req.body), req.user));
  });
  router.post('/activos/:id/liberar', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await releaseAsset(db, id, parse(releaseAssetSchema, req.body), req.user));
  });

  router.get('/rondas', async (_req, res) => res.json(await listRounds(db)));
  router.post('/rondas', async (req, res) => {
    res.status(201).json(await startRound(db, parse(startRoundSchema, req.body), req.user));
  });
  router.get('/rondas/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await getRound(db, id));
  });
  router.patch('/rondas/:id/activos/:activoId', async (req, res) => {
    const { id, activoId } = parse(roundItemParamsSchema, req.params);
    res.json(await recordCheck(db, id, activoId, parse(recordCheckSchema, req.body), req.user));
  });
  router.post('/rondas/:id/cerrar', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await closeRound(db, id, req.user));
  });

  router.get('/bitacora', async (req, res) => {
    const { limite } = parse(ledgerQuerySchema, req.query);
    res.json(await listLedger(db, limite));
  });
  router.get('/bitacora/verificar', async (_req, res) => res.json(await verifyLedger(db)));
  return router;
}

export function createApp(db, config) {
  const app = express();
  const sessions = createSessionManager(config);
  const storage = createStorage(config);
  const loginLimiter = createRateLimiter({ windowMs: 60_000, max: config.loginRateLimit ?? 10 });

  app.set('trust proxy', 1); // detrás del balanceador de la nube: IP real y cookies seguras
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'frame-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', async (_req, res) => {
    await db.one('SELECT 1');
    res.json({ status: 'ok', baseDeDatos: 'ok', almacenamiento: storage.active.name });
  });
  api.use('/auth', authRoutes(db, config, sessions, loginLimiter));

  api.use(authenticate(db, config));

  api.get('/usuarios', async (_req, res) => res.json(await listUsers(db)));
  api.get('/flujo', (_req, res) => res.json(describeFlow()));
  api.get('/plan', async (_req, res) => res.json(await getContingencyPlan(db)));
  api.get('/dashboard', async (_req, res) => res.json(await getDashboard(db)));
  api.get('/servicios', async (_req, res) => res.json(await listServices(db)));
  api.patch('/servicios/:id/estado', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await changeServiceStatus(db, id, parse(serviceStatusSchema, req.body), req.user));
  });

  api.get('/incidentes', async (req, res) => {
    res.json(await listIncidents(db, parse(listIncidentsQuerySchema, req.query)));
  });
  api.post('/incidentes', async (req, res) => {
    res.status(201).json(await createIncident(db, parse(createIncidentSchema, req.body), req.user));
  });
  api.get('/incidentes/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await getIncidentDetail(db, id));
  });
  api.post('/incidentes/:id/avanzar', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await advanceIncident(db, id, parse(advanceSchema, req.body), req.user));
  });
  api.post('/incidentes/:id/decisiones', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await decideIncident(db, id, parse(decisionSchema, req.body), req.user));
  });
  api.post('/incidentes/:id/acciones', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.status(201).json(await createAction(db, id, parse(createActionSchema, req.body), req.user));
  });
  api.patch('/acciones/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    res.json(await updateAction(db, id, parse(updateActionSchema, req.body), req.user));
  });

  api.use(evidenceRoutes(db, config, storage));
  api.use(mapRoutes(db));

  api.get('/analitica', async (req, res) => {
    res.json(await getAnalytics(db, { includeSecurity: req.user.rol === 'coordinador' }));
  });
  api.get('/analitica/incidentes.csv', async (_req, res) => {
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="incidentes.csv"' });
    res.send(await incidentsCsv(db));
  });
  api.get('/seguridad/eventos', requireRole('coordinador'), async (_req, res) => res.json(await listSecurityEvents(db)));

  api.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }));
  app.use('/api', api);

  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
    app.get('/{*ruta}', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
