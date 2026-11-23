export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let onUnauthorized = () => {};

/** App registra aquí qué hacer cuando la sesión vence (volver al inicio de sesión). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/**
 * La sesión viaja en una cookie httpOnly que el navegador envía solo; el código no puede
 * leerla. X-Requested-With es la cabecera anti-CSRF que exige el servidor.
 */
async function request(path, { method = 'GET', body, form, silent401 = false } = {}) {
  const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Revisa tu conexión.', 0);
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !silent401) onUnauthorized();
    const error = payload?.error;
    throw new ApiError(error?.message ?? `Error ${response.status}`, response.status, error?.details);
  }
  return payload;
}

export const evidenceUrl = (id, { download = false } = {}) => `/api/evidencias/${id}/contenido${download ? '?descargar=1' : ''}`;
export const incidentsCsvUrl = '/api/analitica/incidentes.csv';

export const api = {
  // sesión y cuenta
  authConfig: () => request('/auth/config'),
  session: () => request('/auth/sesion', { silent401: true }),
  login: (data) => request('/auth/login', { method: 'POST', body: data, silent401: true }),
  loginMfa: (data) => request('/auth/mfa', { method: 'POST', body: data, silent401: true }),
  logout: () => request('/auth/logout', { method: 'POST', silent401: true }),
  startMfa: () => request('/auth/mfa/configurar', { method: 'POST' }),
  confirmMfa: (codigo) => request('/auth/mfa/confirmar', { method: 'POST', body: { codigo } }),
  disableMfa: (data) => request('/auth/mfa/desactivar', { method: 'POST', body: data }),
  changePassword: (data) => request('/auth/clave', { method: 'POST', body: data }),
  securityEvents: () => request('/seguridad/eventos'),

  // operación
  users: () => request('/usuarios'),
  flow: () => request('/flujo'),
  plan: () => request('/plan'),
  dashboard: () => request('/dashboard'),
  services: () => request('/servicios'),
  changeServiceStatus: (id, data) => request(`/servicios/${id}/estado`, { method: 'PATCH', body: data }),
  incidents: (estado) => request(`/incidentes${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`),
  incident: (id) => request(`/incidentes/${id}`),
  createIncident: (data) => request('/incidentes', { method: 'POST', body: data }),
  advance: (id, data = {}) => request(`/incidentes/${id}/avanzar`, { method: 'POST', body: data }),
  decide: (id, data) => request(`/incidentes/${id}/decisiones`, { method: 'POST', body: data }),
  createAction: (id, data) => request(`/incidentes/${id}/acciones`, { method: 'POST', body: data }),
  updateAction: (id, data) => request(`/acciones/${id}`, { method: 'PATCH', body: data }),

  // evidencias multimedia
  evidenceConfig: () => request('/evidencias/config'),
  incidentEvidence: (id) => request(`/incidentes/${id}/evidencias`),
  evidenceLibrary: (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '' && v !== false));
    return request(`/evidencias${params.size ? `?${params}` : ''}`);
  },
  uploadEvidence: (incidentId, { file, descripcion, accionId }) => {
    const form = new FormData();
    form.append('archivo', file);
    if (descripcion) form.append('descripcion', descripcion);
    if (accionId) form.append('accionId', String(accionId));
    return request(`/incidentes/${incidentId}/evidencias`, { method: 'POST', form });
  },
  verifyEvidence: (id) => request(`/evidencias/${id}/verificar`),
  voidEvidence: (id, motivo) => request(`/evidencias/${id}/anular`, { method: 'POST', body: { motivo } }),
  evidenceText: async (id) => {
    const res = await fetch(evidenceUrl(id), { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError('No se pudo leer el archivo', res.status);
    return res.text();
  },

  // analítica
  analytics: () => request('/analitica'),

  // mapas de calor, aislamiento, rondas y bitácora
  pipelineMap: () => request('/mapas/oleoducto'),
  asset: (id) => request(`/activos/${id}`),
  isolateAsset: (id, motivo) => request(`/activos/${id}/aislar`, { method: 'POST', body: { motivo } }),
  releaseAsset: (id, nota) => request(`/activos/${id}/liberar`, { method: 'POST', body: nota ? { nota } : {} }),
  rounds: () => request('/rondas'),
  round: (id) => request(`/rondas/${id}`),
  startRound: (data) => request('/rondas', { method: 'POST', body: data }),
  recordCheck: (roundId, assetId, data) => request(`/rondas/${roundId}/activos/${assetId}`, { method: 'PATCH', body: data }),
  closeRound: (id) => request(`/rondas/${id}/cerrar`, { method: 'POST' }),
  ledger: (limite = 15) => request(`/bitacora?limite=${limite}`),
  verifyLedger: () => request('/bitacora/verificar'),
};
