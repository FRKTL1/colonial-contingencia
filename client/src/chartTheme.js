/** Paleta de gráficas del tema «Sala de control» (fondo oscuro): mismos tonos que theme.css. */
export const CHART_COLORS = Object.freeze({
  navy: '#8fb9c9',
  navySoft: '#5e8fa5',
  amber: '#f5b544',
  ok: '#3fcf8e',
  bad: '#ff6b6b',
  warn: '#f2bd4b',
  muted: '#93a7af',
  violet: '#b9a3ff',
  teal: '#45d3c2',
  grid: 'rgba(150, 182, 194, 0.16)',
  text: '#e6edef',
});

export const AXIS_STYLE = Object.freeze({ fontSize: 11, fill: CHART_COLORS.muted });

export const TOOLTIP_PROPS = Object.freeze({
  contentStyle: { borderRadius: 10, border: '1px solid rgba(150, 182, 194, 0.32)', background: '#0f1c22', fontSize: 12, color: CHART_COLORS.text },
  labelStyle: { color: CHART_COLORS.text, fontWeight: 600 },
  itemStyle: { color: CHART_COLORS.text },
  cursor: { fill: 'rgba(255, 255, 255, 0.04)' },
});
