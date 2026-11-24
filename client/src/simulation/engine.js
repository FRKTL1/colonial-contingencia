/**
 * Motor de la simulación visual del plan de contingencia.
 *
 * Es una función pura: recibe la definición del flujo que publica el servidor (GET /api/flujo),
 * el plan, los usuarios y los servicios, y devuelve la línea de tiempo completa de eventos.
 * No escribe nada en la base de datos. Las reglas (rutas, responsables y efectos sobre los
 * servicios) salen del servidor; aquí solo se ordenan en el tiempo.
 *
 * El guion por defecto reproduce lo que hizo Colonial Pipeline en mayo de 2021. Cada
 * respuesta de `answers` reemplaza, en orden, a la decisión del guion en esa posición.
 */

/** 7 may 2021, 04:45 (hora del este de EE. UU.): Colonial detecta la nota de rescate. */
export const SIMULATION_START = Date.UTC(2021, 4, 7, 4, 45);

/** Servicios de TI que el ransomware dejó fuera al inicio (facturación, ERP, VPN y directorio). */
export const INITIAL_AFFECTED = Object.freeze(['TI-FACT', 'TI-ERP', 'TI-VPN', 'TI-AD']);

/** Tramos que el operador reinicia uno a uno durante la recuperación, con SCADA primero. */
export const RESTART_ORDER = Object.freeze(['OT-SCADA', 'OT-T1', 'OT-T2', 'OT-T3']);

/**
 * Horas simuladas por etapa, calibradas con los hitos públicos del caso: paro a las 6:10 del
 * 7 de mayo, reinicio desde la tarde del 12 y entregas en todos los mercados el 13.
 */
export const STAGE_HOURS = Object.freeze({
  deteccion: 1,
  evaluacion: 0.5,
  contencion: 46,
  erradicacion: 84,
  erradicacion_reintento: 24,
  analisis_forense: 18,
  recuperacion: 24,
  ruta_alternativa: 6,
  servicio_restablecido: 6,
  cierre: 12,
});

/** Lo que decidió Colonial en cada rombo, con su justificación pública. */
export const COLONIAL_SCRIPT = Object.freeze({
  D1: { respuesta: true, justificacion: 'Sin certeza de que la red OT estuviera aislada, Colonial detuvo las 5,500 millas del oleoducto a las 6:10 del 7 de mayo.' },
  D2: { respuesta: false, justificacion: 'Con los sistemas de TI cifrados, se evaluó el rescate con asesoría legal y el FBI: Colonial pagó 75 BTC (unos US$ 4.4 millones) y recibió el descifrador.' },
  D3: { respuesta: true, justificacion: 'Con los sistemas limpios y validados, el reinicio por segmentos comenzó la tarde del 12 de mayo.' },
  D4: { respuesta: true, justificacion: 'Hubo compras de pánico y escasez en el sureste: el gobierno emitió exenciones y se movió combustible en camiones.' },
});

export const LESSONS = 'MFA en todo acceso remoto, segmentación TI/OT, respaldos verificados y fuera de línea, y simulacros periódicos del plan.';

const MAX_STEPS = 60;
const ROUND = (n) => Math.round(n * 100) / 100;

export const EVENT_TYPES = Object.freeze({
  START: 'inicio',
  STAGE: 'etapa',
  SERVICE: 'servicio',
  ACTION_ASSIGNED: 'accion_asignada',
  ACTION_DONE: 'accion_completada',
  ACTION_FAILED: 'accion_fallida',
  DECISION: 'decision',
  ESCALATION: 'escalamiento',
  LESSONS: 'lecciones',
  END: 'fin',
});

/** Indicadores de un instante: mismo cálculo de disponibilidad que el panel del servidor. */
export function computeKpis(serviceStates, serviceTypes) {
  const codes = Object.keys(serviceStates);
  const count = (estado) => codes.filter((c) => serviceStates[c] === estado).length;
  const tramos = codes.filter((c) => serviceTypes[c] === 'OT' && c !== 'OT-SCADA');
  const tramosOk = tramos.filter((c) => serviceStates[c] === 'operativo').length;
  const operativo = count('operativo');
  return {
    total: codes.length,
    operativo,
    afectado: count('afectado'),
    en_recuperacion: count('en_recuperacion'),
    disponibilidad: codes.length === 0 ? 100 : Math.round((operativo / codes.length) * 100),
    flujoOleoducto: tramos.length === 0 ? 100 : Math.round((tramosOk / tramos.length) * 100),
  };
}

function indexBy(list, key) {
  return Object.fromEntries((list ?? []).map((item) => [item[key], item]));
}

function validateInputs({ flow, services }) {
  if (!flow?.etapas?.length || !flow?.decisiones?.length) throw new Error('La definición del flujo está vacía');
  if (!services?.length) throw new Error('No hay servicios para simular');
}

/**
 * Construye la simulación completa.
 * @param {object} input
 * @param {object} input.flow      Respuesta de GET /api/flujo.
 * @param {object} [input.plan]    Respuesta de GET /api/plan (procedimientos y recursos).
 * @param {Array}  input.users     Usuarios activos (nombre y rol).
 * @param {Array}  input.services  Servicios (codigo, nombre, tipo).
 * @param {boolean[]} [input.answers] Respuestas en el orden en que aparecen las decisiones.
 */
export function buildSimulation({ flow, plan, users = [], services, answers = [] }) {
  validateInputs({ flow, services });

  const stages = indexBy(flow.etapas, 'clave');
  const decisions = indexBy(flow.decisiones, 'codigo');
  const planStages = indexBy(plan?.etapas, 'clave');
  const serviceTypes = Object.fromEntries(services.map((s) => [s.codigo, s.tipo]));
  const serviceNames = Object.fromEntries(services.map((s) => [s.codigo, s.nombre]));
  const maxFailures = flow.maxIntentosErradicacion ?? 3;

  const personFor = (rol) => {
    const user = users.find((u) => u.rol === rol);
    return { rol, nombre: user?.nombre ?? null };
  };

  const states = Object.fromEntries(services.map((s) => [s.codigo, 'operativo']));
  const events = [];
  const openActions = [];
  const stageHours = {};
  let t = 0;
  let etapa = null;
  let failures = 0;
  let escalated = false;
  let decisionOrdinal = 0;
  let actionSeq = 0;

  const push = (event) => {
    events.push({
      ...event,
      id: events.length,
      t: ROUND(t),
      etapa,
      intentos: failures,
      escalado: escalated,
      servicios: { ...states },
      kpis: computeKpis(states, serviceTypes),
    });
  };

  const setServices = (codes, estado, { actor, texto }) => {
    const changed = codes.filter((c) => c in states && states[c] !== estado);
    if (changed.length === 0) return;
    changed.forEach((c) => { states[c] = estado; });
    push({
      tipo: EVENT_TYPES.SERVICE,
      actor,
      texto,
      cambios: changed.map((codigo) => ({ codigo, nombre: serviceNames[codigo], estado })),
    });
  };

  const applyEffect = (efecto, actor) => {
    const codes = Object.keys(states);
    if (efecto === 'detener_ot') {
      setServices(codes.filter((c) => serviceTypes[c] === 'OT'), 'afectado', { actor, texto: 'Detención preventiva: se aíslan las redes TI y OT y se detiene el bombeo' });
    } else if (efecto === 'iniciar_recuperacion') {
      setServices(codes.filter((c) => states[c] === 'afectado'), 'en_recuperacion', { actor, texto: 'Comienza la recuperación progresiva de los servicios afectados' });
    } else if (efecto === 'restablecer_servicios') {
      setServices(codes.filter((c) => states[c] !== 'operativo'), 'operativo', { actor, texto: 'Todos los servicios vuelven a operar' });
    }
  };

  const assign = (accion, origen) => {
    if (!accion?.descripcion) return;
    const action = { id: ++actionSeq, descripcion: accion.descripcion, responsable: personFor(accion.rol), origen };
    openActions.push(action);
    push({ tipo: EVENT_TYPES.ACTION_ASSIGNED, actor: action.responsable, accion: action, texto: action.descripcion });
  };

  const closeOpenActions = ({ failEntryAction = false } = {}) => {
    while (openActions.length > 0) {
      const action = openActions.shift();
      const fails = failEntryAction && action.origen === 'entrada:erradicacion';
      push({
        tipo: fails ? EVENT_TYPES.ACTION_FAILED : EVENT_TYPES.ACTION_DONE,
        actor: action.responsable,
        accion: action,
        texto: fails ? `${action.descripcion} · falló: persistencia detectada en el directorio activo` : action.descripcion,
      });
    }
  };

  const nextAnswer = (codigo) => {
    const ordinal = decisionOrdinal++;
    const given = answers[ordinal];
    const scripted = COLONIAL_SCRIPT[codigo];
    const forced = codigo === 'D3' && failures >= maxFailures;
    if (forced) {
      return { ordinal, respuesta: true, porUsuario: false, forzada: true, justificacion: `Tras ${failures} validaciones fallidas el comité escala y exige un reinicio validado.` };
    }
    if (typeof given === 'boolean') {
      const sameAsColonial = given === scripted?.respuesta;
      return { ordinal, respuesta: given, porUsuario: true, justificacion: sameAsColonial ? scripted.justificacion : 'Decisión tomada en la simulación (distinta a la de Colonial).' };
    }
    return { ordinal, respuesta: scripted?.respuesta ?? true, porUsuario: false, justificacion: scripted?.justificacion ?? 'Decisión del comité de crisis.' };
  };

  /** Una respuesta "No" en D3 hace fallar la acción de erradicación antes de decidir. */
  const peekD3Fails = () => {
    if (failures >= maxFailures) return false;
    const given = answers[decisionOrdinal];
    return typeof given === 'boolean' ? !given : !COLONIAL_SCRIPT.D3.respuesta;
  };

  // Afectación inicial: el ransomware cifra los sistemas de TI.
  const analista = personFor('analista_ti');
  push({ tipo: EVENT_TYPES.START, actor: analista, texto: 'Nota de rescate en los servidores de facturación: DarkSide cifró sistemas de TI tras entrar por una VPN sin MFA' });
  setServices(INITIAL_AFFECTED, 'afectado', { actor: analista, texto: 'Sistemas de TI cifrados por el ransomware' });

  let stageKey = flow.etapaInicial ?? 'deteccion';
  let eradicationRuns = 0;

  for (let step = 0; step < MAX_STEPS && stageKey !== 'finalizado'; step += 1) {
    const stage = stages[stageKey];
    if (!stage) throw new Error(`Etapa desconocida en el flujo: ${stageKey}`);
    const info = planStages[stageKey] ?? {};
    const owner = personFor(stage.rolResponsable);
    const t0 = t;
    const isRetry = stageKey === 'erradicacion' && eradicationRuns > 0;
    const duration = isRetry ? STAGE_HOURS.erradicacion_reintento : (STAGE_HOURS[stageKey] ?? 4);
    if (stageKey === 'erradicacion') eradicationRuns += 1;

    etapa = stageKey;
    push({
      tipo: EVENT_TYPES.STAGE,
      actor: owner,
      texto: isRetry ? `${stage.nombre} (reintento)` : stage.nombre,
      etapaInfo: {
        clave: stageKey,
        nombre: stage.nombre,
        tipo: stage.tipo,
        decision: stage.decision,
        procedimiento: info.procedimiento ?? null,
        recursos: info.recursos ?? [],
        esReintento: Boolean(stage.esReintento) || isRetry,
      },
    });

    if (stage.efectoAlEntrar) applyEffect(stage.efectoAlEntrar, owner);
    if (stage.accionAlEntrar) assign(stage.accionAlEntrar, `entrada:${stageKey}`);

    // Reinicio manual y progresivo por tramos, como el 12 de mayo.
    if (stageKey === 'recuperacion') {
      const operador = personFor('operador_ot');
      RESTART_ORDER.filter((c) => states[c] && states[c] !== 'operativo').forEach((codigo, i, list) => {
        t = t0 + duration * (0.2 + (0.6 * i) / Math.max(list.length, 1));
        setServices([codigo], 'operativo', { actor: operador, texto: `${serviceNames[codigo]}: presión y SCADA validados en el recorrido` });
      });
    }

    t = Math.max(t, t0 + duration * 0.85);
    closeOpenActions({ failEntryAction: stageKey === 'erradicacion' && peekD3Fails() });

    if (stageKey === 'cierre') {
      push({ tipo: EVENT_TYPES.LESSONS, actor: owner, texto: `Lecciones aprendidas: ${LESSONS}` });
    }

    t = t0 + duration;
    stageHours[stageKey] = ROUND((stageHours[stageKey] ?? 0) + duration);

    if (stage.tipo === 'decision') {
      const decision = decisions[stage.decision];
      const answer = nextAnswer(stage.decision);
      const branch = answer.respuesta ? decision.si : decision.no;
      push({
        tipo: EVENT_TYPES.DECISION,
        actor: personFor('coordinador'),
        texto: `${decision.codigo}: ${decision.pregunta} → ${answer.respuesta ? 'Sí' : 'No'}`,
        decision: {
          codigo: decision.codigo,
          pregunta: decision.pregunta,
          respuesta: answer.respuesta,
          justificacion: answer.justificacion,
          porUsuario: answer.porUsuario,
          forzada: Boolean(answer.forzada),
          ordinal: answer.ordinal,
          colonial: COLONIAL_SCRIPT[decision.codigo]?.respuesta ?? null,
          ramas: {
            si: { ...decision.si, responsable: decision.si.rol ? personFor(decision.si.rol) : null },
            no: { ...decision.no, responsable: decision.no.rol ? personFor(decision.no.rol) : null },
          },
        },
      });
      if (branch.efecto) applyEffect(branch.efecto, personFor(branch.rol ?? 'coordinador'));
      if (branch.cuentaComoIntentoFallido) {
        failures += 1;
        if (failures >= maxFailures && !escalated) {
          escalated = true;
          push({ tipo: EVENT_TYPES.ESCALATION, actor: personFor('coordinador'), texto: `${failures} validaciones fallidas: la severidad se escala a crítica` });
        }
      }
      if (branch.rol) assign({ descripcion: branch.accion, rol: branch.rol }, `${decision.codigo}:${answer.respuesta ? 'si' : 'no'}`);
      stageKey = branch.destino;
    } else {
      stageKey = stage.siguiente ?? 'finalizado';
    }
  }

  if (stageKey !== 'finalizado') throw new Error('La simulación no llegó al final del flujo');

  etapa = 'finalizado';
  closeOpenActions();
  push({ tipo: EVENT_TYPES.END, actor: personFor('coordinador'), texto: 'Incidente cerrado: informe final emitido' });

  return { events, stageHours, summary: summarize(events, stageHours) };
}

/** Resumen de la corrida completa (lo que se muestra al terminar). */
export function summarize(events, stageHours = {}) {
  let horasSinOleoducto = 0;
  let horasDegradado = 0;
  for (let i = 1; i < events.length; i += 1) {
    const dt = events[i].t - events[i - 1].t;
    if (events[i - 1].kpis.flujoOleoducto < 100) horasSinOleoducto += dt;
    if (events[i - 1].kpis.disponibilidad < 100) horasDegradado += dt;
  }
  const last = events.at(-1);
  const decisions = events.filter((e) => e.tipo === EVENT_TYPES.DECISION).map((e) => e.decision);
  return {
    horasTotales: last?.t ?? 0,
    horasSinOleoducto: ROUND(horasSinOleoducto),
    horasDegradado: ROUND(horasDegradado),
    disponibilidadMinima: Math.min(...events.map((e) => e.kpis.disponibilidad)),
    decisiones: decisions,
    diferentesAColonial: decisions.filter((d) => d.colonial !== null && d.respuesta !== d.colonial).length,
    accionesCompletadas: events.filter((e) => e.tipo === EVENT_TYPES.ACTION_DONE).length,
    accionesFallidas: events.filter((e) => e.tipo === EVENT_TYPES.ACTION_FAILED).length,
    intentosFallidos: last?.intentos ?? 0,
    escalado: Boolean(last?.escalado),
    horasPorEtapa: stageHours,
  };
}

/** Acciones asignadas y completadas por persona hasta el evento `index` (para la gráfica). */
export function actionsByOwner(events, index) {
  const rows = new Map();
  for (const event of events.slice(0, index + 1)) {
    if (!event.accion) continue;
    const { nombre, rol } = event.accion.responsable;
    const key = nombre ?? rol;
    const row = rows.get(key) ?? { nombre: key, rol, asignadas: 0, completadas: 0, fallidas: 0 };
    if (event.tipo === EVENT_TYPES.ACTION_ASSIGNED) row.asignadas += 1;
    if (event.tipo === EVENT_TYPES.ACTION_DONE) row.completadas += 1;
    if (event.tipo === EVENT_TYPES.ACTION_FAILED) row.fallidas += 1;
    rows.set(key, row);
  }
  return [...rows.values()];
}

/** Horas transcurridas en cada etapa hasta el evento `index`. */
export function hoursByStage(events, index, stageNames = {}) {
  const totals = new Map();
  const upTo = events.slice(0, index + 1);
  for (let i = 1; i < upTo.length; i += 1) {
    const key = upTo[i - 1].etapa;
    if (!key || key === 'finalizado') continue;
    totals.set(key, (totals.get(key) ?? 0) + (upTo[i].t - upTo[i - 1].t));
  }
  return [...totals.entries()].map(([clave, horas]) => ({ clave, nombre: stageNames[clave] ?? clave, horas: ROUND(horas) }));
}

/** Respuestas ya fijadas antes de la decisión `ordinal`, más la nueva elección. */
export function answersWithChoice(events, ordinal, respuesta) {
  const before = events
    .filter((e) => e.tipo === EVENT_TYPES.DECISION && e.decision.ordinal < ordinal)
    .sort((a, b) => a.decision.ordinal - b.decision.ordinal)
    .map((e) => e.decision.respuesta);
  return [...before, respuesta];
}

/** Hora simulada legible: "7 may 2021, 06:15". */
export function formatSimulatedTime(hours) {
  const date = new Date(SIMULATION_START + hours * 3_600_000);
  return date.toLocaleString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatElapsed(hours) {
  if (hours < 48) return `T+${hours.toLocaleString('es-CO', { maximumFractionDigits: 1 })} h`;
  return `T+${(hours / 24).toLocaleString('es-CO', { maximumFractionDigits: 1 })} días`;
}
