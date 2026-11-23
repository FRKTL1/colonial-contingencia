import { ForbiddenError } from './errors.js';

export const ROLES = Object.freeze({
  COORDINATOR: 'coordinador',
  IT_ANALYST: 'analista_ti',
  OT_OPERATOR: 'operador_ot',
  LEGAL: 'legal',
  COMMUNICATIONS: 'comunicaciones',
});

const isCoordinator = (user) => user.rol === ROLES.COORDINATOR;

export function assertCanDecide(user) {
  if (!isCoordinator(user)) {
    throw new ForbiddenError('Solo el coordinador de respuesta puede tomar decisiones del plan');
  }
}

export function assertCanAdvance(user, incident) {
  if (!isCoordinator(user) && user.id !== incident.responsable_id) {
    throw new ForbiddenError('Solo el coordinador o el responsable del incidente pueden avanzar de etapa');
  }
}

export function assertCanUpdateAction(user, action) {
  if (!isCoordinator(user) && user.id !== action.responsable_id) {
    throw new ForbiddenError('Solo el coordinador o el responsable de la acción pueden actualizarla');
  }
}

export function assertCanChangeService(user, service) {
  const allowed =
    isCoordinator(user) ||
    (user.rol === ROLES.IT_ANALYST && service.tipo === 'TI') ||
    (user.rol === ROLES.OT_OPERATOR && service.tipo === 'OT');

  if (!allowed) {
    throw new ForbiddenError(`El rol ${user.rol} no puede cambiar el estado de servicios ${service.tipo}`);
  }
}

/** Aislar, reconectar y verificar un elemento: el coordinador o el rol dueño de su red (TI u OT). */
export function assertCanOperateAsset(user, asset) {
  const allowed =
    isCoordinator(user) ||
    (user.rol === ROLES.IT_ANALYST && asset.red === 'TI') ||
    (user.rol === ROLES.OT_OPERATOR && asset.red === 'OT');
  if (!allowed) {
    throw new ForbiddenError(`El rol ${user.rol} no puede operar elementos de la red ${asset.red}`);
  }
}

/** Las rondas de verificación las inician los equipos técnicos o el coordinador. */
export function assertCanStartRound(user) {
  if (![ROLES.COORDINATOR, ROLES.IT_ANALYST, ROLES.OT_OPERATOR].includes(user.rol)) {
    throw new ForbiddenError('Solo el coordinador, el analista TI o el operador OT pueden iniciar rondas de verificación');
  }
}
