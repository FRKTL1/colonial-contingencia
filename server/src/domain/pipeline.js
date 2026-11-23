/**
 * Reglas del mapa de calor de la red del oleoducto.
 *
 * El calor mide el IMPACTO de un tramo detenido según su capacidad nominal publicada
 * (McKinsey Energy Insights): la Línea 1 (1.5 millones de barriles/día) es la referencia.
 * Es la misma escala de 6 niveles del proyecto Rack · Operación, pero alimentada con un dato
 * público en lugar de un puntaje inventado. Los ramales sin capacidad publicada no reciben
 * calor: se muestran como "sin dato público".
 */
export const HEAT_LEVELS = 5;
export const REFERENCE_CAPACITY_BPD = 1_500_000;

/** Estado operativo de un elemento: aislado manda; si no, el del servicio que lo soporta. */
export function elementState(element) {
  if (element.aislado) return 'aislado';
  return element.servicio_estado ?? 'operativo';
}

/**
 * Nivel de calor 0–5 de un tramo. 0 = fluye con normalidad; null = detenido pero sin
 * capacidad publicada (no se inventa un número).
 */
export function impactLevel(element) {
  if (element.tipo !== 'tramo') return null;
  const state = elementState(element);
  if (state === 'operativo') return 0;
  if (state === 'en_recuperacion') return 1;
  if (!element.capacidad_bpd) return null;
  return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil((element.capacidad_bpd / REFERENCE_CAPACITY_BPD) * HEAT_LEVELS - 1e-9)));
}

/** Barriles por día que dejan de pasar por el tramo (solo si hay capacidad publicada). */
export function stoppedCapacity(element) {
  const state = elementState(element);
  return element.tipo === 'tramo' && (state === 'aislado' || state === 'afectado') ? element.capacidad_bpd ?? 0 : 0;
}

/**
 * Lista de verificación antes de reconectar o reiniciar un elemento aislado. Cada punto
 * cita la práctica documentada en el caso o la norma de la que sale.
 */
export const CHECKLISTS = Object.freeze({
  tramo: [
    { texto: 'Derecho de vía patrullado sin hallazgos (recorrido terrestre y aéreo)', fuentes: ['blount', 'aopa'] },
    { texto: 'Presión y caudal leídos en sitio y reportados al centro de control', fuentes: ['blount'] },
    { texto: 'Operación manual disponible y probada antes de reiniciar', fuentes: ['cisa', 'fox0510'] },
    { texto: 'Detección de fugas por monitoreo computacional en servicio', fuentes: ['api1130'] },
  ],
  sistema_TI: [
    { texto: 'Acceso remoto solo con autenticación multifactor', fuentes: ['cisa', 'tsa', 'insjournal'] },
    { texto: 'Perfiles y cuentas heredados o compartidos deshabilitados', fuentes: ['tsa', 'blount'] },
    { texto: 'Parches críticos aplicados, priorizando el catálogo KEV de CISA', fuentes: ['tsa'] },
    { texto: 'Restaurado desde un respaldo aislado y probado', fuentes: ['cisa'] },
  ],
  sistema_OT: [
    { texto: 'Segmentación TI/OT con zona desmilitarizada verificada', fuentes: ['cisa', 'tsa'] },
    { texto: 'Protocolos industriales sin tránsito por la red TI', fuentes: ['cisa'] },
    { texto: 'Acceso remoto a OT solo con autenticación multifactor', fuentes: ['cisa', 'tsa'] },
    { texto: 'Imagen dorada y respaldo de SCADA probados', fuentes: ['cisa'] },
  ],
});

export function checklistFor(element) {
  return element.tipo === 'tramo' ? CHECKLISTS.tramo : CHECKLISTS[`sistema_${element.red}`];
}

/**
 * Reproducción del caso real, día por día, con lo que Colonial y la prensa publicaron.
 * `principal` es el estado de las líneas 1–4, `laterales` el de los ramales y `excepciones`
 * fija el estado de tramos concretos.
 */
export const CASE_TIMELINE = Object.freeze([
  {
    fecha: '2021-05-07',
    titulo: '7 may · Paro total',
    detalle: 'Ransomware detectado poco antes de las 5:00. A las 6:10 las 5,500 millas estaban detenidas para que el malware no llegara a la red OT.',
    principal: 'detenido',
    laterales: 'detenido',
    excepciones: {},
    fuentes: ['blount', 'spg0508'],
  },
  {
    fecha: '2021-05-09',
    titulo: '9 may · Algunos laterales',
    detalle: 'Operan algunos laterales entre terminales y puntos de entrega (Colonial no publicó cuáles). Las líneas 1, 2, 3 y 4 siguen fuera de servicio.',
    principal: 'detenido',
    laterales: 'parcial',
    excepciones: {},
    fuentes: ['spg0509'],
  },
  {
    fecha: '2021-05-10',
    titulo: '10 may · Línea 4 en manual',
    detalle: 'La Línea 4, de Greensboro a Woodbine (MD), opera bajo control manual mientras dure el inventario. Las demás líneas principales siguen fuera.',
    principal: 'detenido',
    laterales: 'parcial',
    excepciones: { 'L4-T3': 'manual' },
    fuentes: ['fox0510', 'spg0509'],
  },
  {
    fecha: '2021-05-12',
    titulo: '12 may · Reinicio por segmentos',
    detalle: 'Desde la tarde comienza el reinicio, un segmento a la vez. El personal recorre la línea y reporta lecturas manuales al centro de control.',
    principal: 'reinicio',
    laterales: 'reinicio',
    excepciones: {},
    fuentes: ['spg0512', 'blount'],
  },
  {
    fecha: '2021-05-13',
    titulo: '13 may · Entregas en todos los mercados',
    detalle: 'El sistema completo reinició y la entrega comenzó en todos los mercados; normalizar el suministro tomaría varios días.',
    principal: 'operativo',
    laterales: 'operativo',
    excepciones: {},
    fuentes: ['colmap0513'],
  },
]);

export const CASE_STATES = Object.freeze({
  detenido: 'Detenido',
  parcial: 'Algunos operan',
  manual: 'Control manual',
  reinicio: 'Reiniciando',
  operativo: 'Operativo',
});

export function caseStateOf(day, element) {
  if (element.tipo !== 'tramo') return null;
  return day.excepciones[element.codigo] ?? (element.linea === 'LAT' ? day.laterales : day.principal);
}
