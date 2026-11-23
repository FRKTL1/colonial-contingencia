/**
 * Escala de calor del proyecto Rack (h0 verde … h5 rojo), aquí alimentada con la capacidad
 * nominal publicada de cada tramo detenido. Los colores de estado, verificación y caso real
 * usan los mismos tokens para que el mapa se lea igual en cualquier capa.
 */
export const heatColor = (level) => `var(--h${level})`;
export const NO_DATA = 'url(#sin-dato)';

const STATE_COLORS = {
  operativo: 'var(--ok)',
  en_recuperacion: 'var(--amber)',
  afectado: 'var(--bad)',
  aislado: 'var(--isolated)',
};

const VERIFICATION_COLORS = { ok: 'var(--ok)', observado: 'var(--amber)', falla: 'var(--bad)', none: '#b8c2d0' };

const CASE_COLORS = {
  detenido: 'var(--h5)',
  parcial: 'var(--h2)',
  manual: '#7c5cc4',
  reinicio: 'var(--amber)',
  operativo: 'var(--ok)',
};

export const LAYERS = {
  impacto: { label: 'Impacto', hint: 'Capacidad nominal que deja de fluir (McKinsey Energy Insights).' },
  estado: { label: 'Estado', hint: 'Estado del servicio y aislamiento de cada tramo.' },
  verificacion: { label: 'Verificación', hint: 'Resultado de la última ronda antes de reconectar.' },
};

/** Color del trazo de un tramo en el modo en vivo. */
export function segmentColor(tramo, layer) {
  if (layer === 'estado') return STATE_COLORS[tramo.estado];
  if (layer === 'verificacion') {
    if (!tramo.aislado && !tramo.verificacion_resultado) return '#dfe4ec';
    return VERIFICATION_COLORS[tramo.verificacion_resultado ?? 'none'];
  }
  return tramo.nivelCalor === null ? NO_DATA : heatColor(tramo.nivelCalor);
}

export const caseColor = (state) => CASE_COLORS[state] ?? '#dfe4ec';
export const stateColor = (state) => STATE_COLORS[state];

const LEGENDS = {
  impacto: [
    { label: 'Fluye con normalidad', color: heatColor(0) },
    { label: 'En recuperación', color: heatColor(1) },
    { label: 'Detenido · hasta 0.6 M b/d', color: heatColor(2) },
    { label: 'Detenido · hasta 0.9 M b/d', color: heatColor(3) },
    { label: 'Detenido · hasta 1.2 M b/d', color: heatColor(4) },
    { label: 'Detenido · hasta 1.5 M b/d', color: heatColor(5) },
    { label: 'Detenido · capacidad no publicada', pattern: true },
  ],
  estado: [
    { label: 'Fluye con normalidad', color: STATE_COLORS.operativo },
    { label: 'Servicio afectado', color: STATE_COLORS.afectado },
    { label: 'En recuperación', color: STATE_COLORS.en_recuperacion },
    { label: 'Aislado (válvulas cerradas)', color: STATE_COLORS.aislado },
  ],
  verificacion: [
    { label: 'OK', color: VERIFICATION_COLORS.ok },
    { label: 'Observado', color: VERIFICATION_COLORS.observado },
    { label: 'Falla', color: VERIFICATION_COLORS.falla },
    { label: 'Aislado sin verificar', color: VERIFICATION_COLORS.none },
    { label: 'Conectado, sin ronda', color: '#dfe4ec' },
  ],
};

export function HeatLegend({ layer, caseStates }) {
  const items = caseStates
    ? Object.entries(caseStates).map(([key, label]) => ({ label, color: caseColor(key) }))
    : LEGENDS[layer];
  return (
    <ul className="heat-legend" aria-label="Leyenda del mapa">
      {items.map((item) => (
        <li key={item.label}>
          <i className={item.pattern ? 'heat-legend__nodata' : undefined} style={item.pattern ? undefined : { background: item.color }} />
          {item.label}
        </li>
      ))}
      {!caseStates && <li><i className="heat-legend__isolated" />Rayado: aislado</li>}
    </ul>
  );
}

/** Patrones SVG compartidos: rayado gris para "sin dato público". */
export function MapPatterns() {
  return (
    <defs>
      <pattern id="sin-dato" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#c3cad6" />
        <rect width="3" height="8" fill="#8d97a8" />
      </pattern>
    </defs>
  );
}
