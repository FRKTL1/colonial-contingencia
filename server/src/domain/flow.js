/**
 * Plan de contingencia de Colonial Pipeline modelado como máquina de estados.
 * Cada etapa corresponde a un nodo del diagrama de flujo; las decisiones D1–D4
 * son los rombos y determinan la ruta (Sí / No).
 */

export const STAGE_TYPE = Object.freeze({
  ACTION: 'accion',
  DECISION: 'decision',
  FINAL: 'final',
});

export const SERVICE_EFFECT = Object.freeze({
  STOP_OT: 'detener_ot',
  START_RECOVERY: 'iniciar_recuperacion',
  RESTORE_ALL: 'restablecer_servicios',
});

export const MAX_ERADICATION_ATTEMPTS = 3;
export const MIN_LESSONS_LENGTH = 20;

export const STAGES = Object.freeze({
  deteccion: {
    orden: 1,
    nombre: 'Detección',
    tipo: STAGE_TYPE.ACTION,
    rolResponsable: 'analista_ti',
    procedimiento: 'Confirmar la nota de rescate, revisar las alertas del EDR y del SIEM y registrar el incidente con los servicios afectados.',
    recursos: ['R01', 'R02', 'R14'],
    siguiente: 'evaluacion',
    accionAlEntrar: { descripcion: 'Confirmar nota de rescate y actividad anómala en sistemas TI', rol: 'analista_ti' },
  },
  evaluacion: {
    orden: 2,
    nombre: 'Evaluación',
    tipo: STAGE_TYPE.DECISION,
    rolResponsable: 'coordinador',
    procedimiento: 'Activar el comité de crisis, medir el alcance (equipos cifrados, cuentas comprometidas) y estimar el riesgo de propagación a la red OT. Resolver D1.',
    recursos: ['R02', 'R08', 'R14'],
    decision: 'D1',
    accionAlEntrar: { descripcion: 'Activar equipo de respuesta; medir alcance, sistemas afectados y riesgo para la red OT', rol: 'coordinador' },
  },
  contencion: {
    orden: 3,
    nombre: 'Contención',
    tipo: STAGE_TYPE.DECISION,
    rolResponsable: 'analista_ti',
    procedimiento: 'Desconectar los equipos comprometidos, bloquear accesos (VPN y cuentas), preservar evidencia y notificar a FBI, CISA y Dpto. de Energía. Resolver D2.',
    recursos: ['R03', 'R07', 'R09', 'R10'],
    decision: 'D2',
    accionAlEntrar: { descripcion: 'Desconectar equipos, bloquear accesos y notificar a FBI, CISA y Dpto. de Energía', rol: 'analista_ti' },
  },
  erradicacion: {
    orden: 4,
    nombre: 'Erradicación',
    tipo: STAGE_TYPE.DECISION,
    rolResponsable: 'analista_ti',
    procedimiento: 'Eliminar el malware y su persistencia, rotar credenciales privilegiadas, cerrar la VPN sin MFA y validar con barridos del EDR. Resolver D3.',
    recursos: ['R01', 'R06', 'R07', 'R10'],
    decision: 'D3',
    accionAlEntrar: { descripcion: 'Eliminar el malware, rotar credenciales y cerrar la vía de acceso (VPN sin MFA)', rol: 'analista_ti' },
  },
  analisis_forense: {
    orden: 4.5,
    nombre: 'Análisis forense',
    tipo: STAGE_TYPE.ACTION,
    rolResponsable: 'analista_ti',
    procedimiento: 'Analizar imágenes de disco y memoria para hallar la persistencia que hizo fallar la erradicación, corregirla y volver a erradicar.',
    recursos: ['R02', 'R06', 'R10'],
    siguiente: 'erradicacion',
    esReintento: true,
  },
  recuperacion: {
    orden: 5,
    nombre: 'Recuperación',
    tipo: STAGE_TYPE.DECISION,
    rolResponsable: 'operador_ot',
    procedimiento: 'Reiniciar el oleoducto de forma manual y progresiva por tramos, validando presión y SCADA en cada uno; restaurar TI desde respaldos. Resolver D4.',
    recursos: ['R04', 'R05', 'R13'],
    decision: 'D4',
    efectoAlEntrar: SERVICE_EFFECT.START_RECOVERY,
  },
  ruta_alternativa: {
    orden: 5.5,
    nombre: 'Ruta alternativa',
    tipo: STAGE_TYPE.ACTION,
    rolResponsable: 'comunicaciones',
    procedimiento: 'Coordinar transporte por camiones, exenciones regulatorias con el gobierno y comunicados públicos sobre el abastecimiento.',
    recursos: ['R09', 'R12', 'R15'],
    siguiente: 'servicio_restablecido',
  },
  servicio_restablecido: {
    orden: 6,
    nombre: 'Servicio restablecido',
    tipo: STAGE_TYPE.ACTION,
    rolResponsable: 'operador_ot',
    procedimiento: 'Verificar que todos los tramos entregan con normalidad y que los sistemas de TI vuelven a operar.',
    recursos: ['R13', 'R14'],
    siguiente: 'cierre',
    efectoAlEntrar: SERVICE_EFFECT.RESTORE_ALL,
    accionAlEntrar: { descripcion: 'Verificar normalización de entregas en todos los tramos', rol: 'operador_ot' },
  },
  cierre: {
    orden: 7,
    nombre: 'Cierre',
    tipo: STAGE_TYPE.ACTION,
    rolResponsable: 'coordinador',
    procedimiento: 'Documentar lecciones aprendidas (MFA, segmentación TI/OT, respaldos, simulacros) y emitir el informe final.',
    recursos: ['R11', 'R14'],
    siguiente: 'finalizado',
    requiereLecciones: true,
    accionAlEntrar: { descripcion: 'Documentar lecciones aprendidas: MFA, segmentación TI/OT, plan de continuidad y simulacros', rol: 'coordinador' },
  },
  finalizado: {
    orden: 8,
    nombre: 'Finalizado',
    tipo: STAGE_TYPE.FINAL,
  },
});

export const DECISIONS = Object.freeze({
  D1: {
    etapa: 'evaluacion',
    pregunta: '¿El ataque puede propagarse a los sistemas OT?',
    si: {
      destino: 'contencion',
      accion: { descripcion: 'Detener preventivamente el oleoducto y aislar las redes TI / OT', rol: 'operador_ot' },
      efecto: SERVICE_EFFECT.STOP_OT,
    },
    no: {
      destino: 'contencion',
      accion: { descripcion: 'Mantener la operación con monitoreo reforzado y contener solo los equipos de TI', rol: 'operador_ot' },
    },
  },
  D2: {
    etapa: 'contencion',
    pregunta: '¿Existen respaldos limpios y verificados?',
    si: {
      destino: 'erradicacion',
      accion: { descripcion: 'Restaurar los sistemas desde copias de seguridad', rol: 'analista_ti' },
    },
    no: {
      destino: 'erradicacion',
      accion: { descripcion: 'Evaluar con asesoría legal y autoridades el pago del rescate y el uso de la herramienta de descifrado', rol: 'legal' },
    },
  },
  D3: {
    etapa: 'erradicacion',
    pregunta: '¿Sistemas seguros y validados para reiniciar?',
    si: {
      destino: 'recuperacion',
      accion: { descripcion: 'Reinicio progresivo y manual del oleoducto por tramos', rol: 'operador_ot' },
    },
    no: {
      destino: 'analisis_forense',
      accion: { descripcion: 'Análisis forense y corrección adicional', rol: 'analista_ti' },
      cuentaComoIntentoFallido: true,
    },
  },
  D4: {
    etapa: 'recuperacion',
    pregunta: '¿Hay riesgo de desabastecimiento de combustible?',
    si: {
      destino: 'ruta_alternativa',
      accion: { descripcion: 'Transporte por camiones, coordinación con el gobierno, exenciones regulatorias y comunicación pública', rol: 'comunicaciones' },
    },
    no: {
      destino: 'servicio_restablecido',
    },
  },
});

export const INITIAL_STAGE = 'deteccion';

export function getStage(stageKey) {
  const stage = STAGES[stageKey];
  if (!stage) throw new Error(`Etapa desconocida: ${stageKey}`);
  return stage;
}

export function getBranch(decisionCode, answer) {
  const decision = DECISIONS[decisionCode];
  if (!decision) throw new Error(`Decisión desconocida: ${decisionCode}`);
  return answer ? decision.si : decision.no;
}

const describeAction = (accion) => (accion ? { descripcion: accion.descripcion, rol: accion.rol } : null);

const describeBranch = (branch) => ({
  destino: branch.destino,
  accion: branch.accion?.descripcion ?? null,
  rol: branch.accion?.rol ?? null,
  efecto: branch.efecto ?? null,
  cuentaComoIntentoFallido: Boolean(branch.cuentaComoIntentoFallido),
});

/**
 * Definición serializable para que el cliente dibuje (y simule) el flujo sin duplicar
 * reglas: rutas, responsables por rol y efectos sobre los servicios.
 */
export function describeFlow() {
  return {
    etapaInicial: INITIAL_STAGE,
    etapas: Object.entries(STAGES).map(([clave, etapa]) => ({
      clave,
      nombre: etapa.nombre,
      orden: etapa.orden,
      tipo: etapa.tipo,
      decision: etapa.decision ?? null,
      esReintento: Boolean(etapa.esReintento),
      rolResponsable: etapa.rolResponsable ?? null,
      siguiente: etapa.siguiente ?? null,
      accionAlEntrar: describeAction(etapa.accionAlEntrar),
      efectoAlEntrar: etapa.efectoAlEntrar ?? null,
    })),
    decisiones: Object.entries(DECISIONS).map(([codigo, d]) => ({
      codigo,
      etapa: d.etapa,
      pregunta: d.pregunta,
      si: describeBranch(d.si),
      no: describeBranch(d.no),
    })),
    maxIntentosErradicacion: MAX_ERADICATION_ATTEMPTS,
  };
}
