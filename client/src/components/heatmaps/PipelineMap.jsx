import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { ELEMENT_STATE_LABELS, LOCATION_TYPE_LABELS } from '../../constants.js';
import { useAsync } from '../../useAsync.js';
import { ErrorBanner, Loading } from '../common.jsx';
import ElementDetail from './ElementDetail.jsx';
import SourceLinks from './SourceLinks.jsx';
import { HeatLegend, LAYERS, MapPatterns, caseColor, segmentColor, stateColor } from './heat.jsx';

const POLL_MS = 15_000;
const WIDTH = 1100;
const HEIGHT = 700;
const PAD = 46;
const BOUNDS = { lonMin: -96.2, lonMax: -73.6, latMin: 29.4, latMax: 41.2 };
// Proyección equirectangular con corrección por la latitud media (≈35°): suficiente para un esquema.
const LON_FACTOR = Math.cos((35.3 * Math.PI) / 180);
const SCALE = Math.min(
  (WIDTH - PAD * 2) / ((BOUNDS.lonMax - BOUNDS.lonMin) * LON_FACTOR),
  (HEIGHT - PAD * 2) / (BOUNDS.latMax - BOUNDS.latMin)
);
const project = (lat, lon) => [PAD + (lon - BOUNDS.lonMin) * LON_FACTOR * SCALE, PAD + (BOUNDS.latMax - lat) * SCALE];

// Las líneas 1 y 2 corren en paralelo: se dibujan separadas unos píxeles.
// Las líneas 3 y 4 salen juntas de Greensboro hacia el noreste: también se separan.
const LINE_OFFSET = { L1: -4, L2: 4, L3: -4, L4: 4, LAT: 0 };
const LINE_WIDTH = { L1: 6, L2: 6, L3: 7, L4: 7, LAT: 4 };
// Zona de clic: en las paralelas no se pisan entre sí.
const HIT_WIDTH = { L1: 8, L2: 8, L3: 8, L4: 8, LAT: 16 };
// Posición del rótulo de cada instalación para que no se encimen.
const LABEL_POS = {
  HOU: 'bottom', OPE: 'bottom', MER: 'left', BOL: 'bottom', BHM: 'top', ATL: 'left', NAS: 'top', KNX: 'top', MAC: 'right', BAI: 'right',
  BEL: 'left', AUG: 'bottom', SPA: 'top', CLT: 'bottom', GSO: 'top', SEL: 'bottom', MIT: 'left', RIC: 'left', NOR: 'right',
  DOR: 'left', BAL: 'right', LIN: 'right',
};

function labelProps(pos, x, y) {
  if (pos === 'left') return { x: x - 11, y: y + 4, textAnchor: 'end' };
  if (pos === 'top') return { x, y: y - 12, textAnchor: 'middle' };
  if (pos === 'bottom') return { x, y: y + 21, textAnchor: 'middle' };
  return { x: x + 11, y: y + 4, textAnchor: 'start' };
}

function nodeShape(tipo, x, y) {
  if (tipo === 'patio_tanques') return <rect x={x - 7} y={y - 7} width={14} height={14} rx={2} />;
  if (tipo === 'terminal') return <polygon points={`${x},${y - 9} ${x + 9},${y} ${x},${y + 9} ${x - 9},${y}`} />;
  if (tipo === 'origen') return <polygon points={`${x},${y - 9} ${x + 8},${y + 6} ${x - 8},${y + 6}`} />;
  if (tipo === 'estacion') return <rect x={x - 6} y={y - 6} width={12} height={12} rx={6} />;
  if (tipo === 'derivacion') return <circle cx={x} cy={y} r={4} />;
  return <circle cx={x} cy={y} r={5} />;
}

/** Segmentos [x1, y1, x2, y2] del recorrido, desplazados en perpendicular para separar L1 y L2. */
function segmentPieces(points, offset) {
  return points.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = points[i];
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = (-(y2 - y1) / length) * offset;
    const ny = ((x2 - x1) / length) * offset;
    return [x1 + nx, y1 + ny, x2 + nx, y2 + ny];
  });
}

export default function PipelineMap({ user, onStartRound }) {
  const { data, error, loading, reload } = useAsync(() => api.pipelineMap(), [], { pollMs: POLL_MS });
  const [layer, setLayer] = useState('impacto');
  const [mode, setMode] = useState('vivo'); // 'vivo' o la fecha de un día del caso real
  const [selected, setSelected] = useState(null); // { kind: 'elemento' | 'lugar', id }

  const places = useMemo(() => Object.fromEntries((data?.instalaciones ?? []).map((p) => [p.codigo, p])), [data]);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;

  const { tramos, sistemas, resumen, caso, fuentes } = data;
  const day = mode === 'vivo' ? null : caso.dias.find((d) => d.fecha === mode);
  const elements = [...tramos, ...sistemas];
  const selectedElement = selected?.kind === 'elemento' ? elements.find((e) => e.id === selected.id) : null;
  const selectedPlace = selected?.kind === 'lugar' ? places[selected.id] : null;

  const strokeOf = (t) => (day ? caseColor(day.tramos[t.codigo]) : segmentColor(t, layer));
  const select = (kind, id) => setSelected({ kind, id });
  const keySelect = (kind, id) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(kind, id); } };
  const pointsOf = (t) => [t.desde_codigo, ...t.paradas, t.hasta_codigo].map((c) => project(places[c].latitud, places[c].longitud));
  // Ramales primero y líneas principales encima.
  const drawOrder = [...tramos].sort((a, b) => (a.linea === 'LAT' ? 0 : 1) - (b.linea === 'LAT' ? 0 : 1));

  return (
    <div className="netmap">
      <ErrorBanner error={error} />

      <section className="kpis kpis--4" aria-label="Resumen de la red">
        <div className="kpi kpi--afectado"><span className="kpi__label">Líneas principales detenidas</span><span className="kpi__value">{resumen.lineasDetenidas}/{resumen.lineasPrincipales}</span><span className="kpi__sub">líneas 1 a 4 del mapa oficial</span></div>
        <div className="kpi kpi--isolated"><span className="kpi__label">Elementos aislados</span><span className="kpi__value">{resumen.aislados}</span><span className="kpi__sub">de {resumen.tramos} tramos y {resumen.sistemas} sistemas</span></div>
        <div className="kpi kpi--en_recuperacion"><span className="kpi__label">Aislados sin verificar</span><span className="kpi__value">{resumen.sinVerificar}</span><span className="kpi__sub">no pueden reiniciarse aún</span></div>
        <div className="kpi kpi--operativo"><span className="kpi__label">Listos para reiniciar</span><span className="kpi__value">{resumen.listosParaReconectar}</span><span className="kpi__sub">con ronda OK tras aislar</span></div>
      </section>

      <div className="mapbar">
        <div className="segmented" role="group" aria-label="Qué mostrar">
          <button type="button" aria-pressed={mode === 'vivo'} className={mode === 'vivo' ? 'segmented__item segmented__item--active' : 'segmented__item'} onClick={() => setMode('vivo')}>Ahora</button>
          {caso.dias.map((d) => (
            <button key={d.fecha} type="button" aria-pressed={mode === d.fecha}
              className={mode === d.fecha ? 'segmented__item segmented__item--active' : 'segmented__item'}
              onClick={() => setMode(d.fecha)}>{d.titulo.split(' · ')[0]}</button>
          ))}
        </div>
        {mode === 'vivo' && (
          <div className="segmented" role="group" aria-label="Capa del mapa">
            {Object.entries(LAYERS).map(([key, l]) => (
              <button key={key} type="button" aria-pressed={layer === key} title={l.hint}
                className={layer === key ? 'segmented__item segmented__item--active' : 'segmented__item'}
                onClick={() => setLayer(key)}>{l.label}</button>
            ))}
          </div>
        )}
        {resumen.aislados > 0 && mode === 'vivo' && (
          <button type="button" className="btn btn--sm btn--warning" onClick={() => onStartRound({ alcance: 'aislados' })}>
            Verificar los {resumen.aislados} aislados
          </button>
        )}
      </div>

      {day && (
        <div className="case-banner" role="status">
          <div>
            <strong>Caso real · {day.titulo}</strong>
            <p>{day.detalle}</p>
            <SourceLinks keys={day.fuentes} sources={fuentes} />
          </div>
          <span className="case-banner__tag">Reproducción de solo lectura</span>
        </div>
      )}

      <div className="netmap__grid">
        <div className="panel netmap__canvas">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Mapa de la red de Colonial Pipeline, de Houston a Linden">
            <MapPatterns />
            <text x={150} y={HEIGHT - 40} className="netmap__sea">Golfo de México</text>
            <text x={WIDTH - 150} y={HEIGHT - 150} className="netmap__sea" textAnchor="middle">Océano Atlántico</text>

            {drawOrder.map((t) => {
              const pieces = segmentPieces(pointsOf(t), LINE_OFFSET[t.linea]);
              const stroke = strokeOf(t);
              const caseState = day?.tramos[t.codigo];
              const isSelected = selectedElement?.id === t.id;
              const dashed = day ? caseState === 'parcial' : t.aislado;
              return (
                <g key={t.codigo} className={`netmap__segment${isSelected ? ' is-selected' : ''}`} role="button" tabIndex={0}
                  aria-label={`${t.nombre}: ${day ? caso.estados[caseState] : ELEMENT_STATE_LABELS[t.estado]}`}
                  onClick={() => select('elemento', t.id)} onKeyDown={keySelect('elemento', t.id)}>
                  {pieces.map(([x1, y1, x2, y2]) => (
                    <g key={`${x1}-${y1}`}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} className="netmap__hit" strokeWidth={HIT_WIDTH[t.linea]} />
                      {isSelected && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--navy)" strokeWidth={LINE_WIDTH[t.linea] + 6} strokeLinecap="round" />}
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={LINE_WIDTH[t.linea]} strokeLinecap="round" />
                      {dashed && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={LINE_WIDTH[t.linea] - 3} strokeDasharray="3 7" />}
                    </g>
                  ))}
                </g>
              );
            })}

            {Object.values(places).map((p) => {
              const [x, y] = project(p.latitud, p.longitud);
              const major = ['origen', 'terminal', 'patio_tanques'].includes(p.tipo);
              return (
                <g key={p.codigo} className={`netmap__node netmap__node--${p.tipo}${selectedPlace?.codigo === p.codigo ? ' is-selected' : ''}`}
                  role="button" tabIndex={0} aria-label={`${p.nombre}, ${p.estado_eeuu}: ${LOCATION_TYPE_LABELS[p.tipo]}`}
                  onClick={() => select('lugar', p.codigo)} onKeyDown={keySelect('lugar', p.codigo)}>
                  {nodeShape(p.tipo, x, y)}
                  <text {...labelProps(LABEL_POS[p.codigo], x, y)} className={major ? 'netmap__label netmap__label--major' : 'netmap__label'}>{p.nombre}</text>
                </g>
              );
            })}
          </svg>
          <div className="netmap__foot">
            <HeatLegend layer={layer} caseStates={day ? caso.estados : null} />
            <p className="muted small">
              Ciudades en sus coordenadas reales; el trazado entre ellas es esquemático (el derecho de vía exacto no es público).
              Líneas 1 y 2 en paralelo. Instalaciones del mapa oficial de Colonial del 13 de mayo de 2021.
            </p>
          </div>
        </div>

        <aside className="netmap__side">
          {selectedElement && (
            <ElementDetail key={selectedElement.id} element={selectedElement} sources={fuentes} places={places} user={user}
              onChanged={reload} onClose={() => setSelected(null)} onStartRound={onStartRound} />
          )}
          {selectedPlace && (
            <section className="panel element-detail">
              <header className="element-detail__head">
                <div>
                  <span className="element-detail__code">{LOCATION_TYPE_LABELS[selectedPlace.tipo]} · {selectedPlace.servicio_codigo}</span>
                  <h3>{selectedPlace.nombre}</h3>
                </div>
                <button type="button" className="alert__close" onClick={() => setSelected(null)} aria-label="Cerrar detalle">×</button>
              </header>
              <p className="small">{selectedPlace.ciudad}, {selectedPlace.estado_eeuu}</p>
              <p className="small">{selectedPlace.descripcion}</p>
              <SourceLinks keys={selectedPlace.fuentes} sources={fuentes} />
              <ul className="element-detail__links">
                {tramos.filter((t) => [t.desde_codigo, t.hasta_codigo, ...t.paradas].includes(selectedPlace.codigo)).map((t) => (
                  <li key={t.codigo}>
                    <button type="button" className="linklike" onClick={() => select('elemento', t.id)}>
                      <i style={{ background: strokeOf(t) === 'url(#sin-dato)' ? '#a3acba' : strokeOf(t) }} />{t.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!selected && (
            <div className="panel">
              <h3>¿Cómo leer el mapa?</h3>
              <p className="small" style={{ marginTop: 6 }}>
                Cada tramo toma el color de su capa. En <b>Impacto</b>, el rojo es la línea de mayor capacidad detenida
                (Línea 1, 1.5 M barriles/día). Elige un día del caso para ver cómo se apagó y reinició la red real.
                Haz clic en un tramo o una ciudad para ver sus datos y su fuente.
              </p>
            </div>
          )}
        </aside>
      </div>

      <section aria-label="Sistemas documentados en el caso">
        <h3 className="netmap__systems-title">Sistemas que el caso documenta</h3>
        <div className="system-cards">
          {sistemas.map((s) => (
            <article key={s.id} className={`system-card${selectedElement?.id === s.id ? ' is-selected' : ''}`} style={{ borderLeftColor: stateColor(s.estado) }}>
              <button type="button" className="system-card__open" onClick={() => select('elemento', s.id)}>
                <span className="system-card__type">{s.red} · {s.servicio_codigo} · {ELEMENT_STATE_LABELS[s.estado]}</span>
                <strong>{s.aislado ? '⛔ ' : ''}{s.nombre}</strong>
                <span className="small">{s.hallazgo}</span>
              </button>
              <SourceLinks keys={s.fuentes} sources={fuentes} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
