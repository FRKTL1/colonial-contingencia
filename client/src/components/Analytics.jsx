import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, incidentsCsvUrl } from '../api.js';
import { AXIS_STYLE, CHART_COLORS, TOOLTIP_PROPS } from '../chartTheme.js';
import { EVIDENCE_CATEGORY, ROLE_LABELS, SECURITY_EVENT_LABELS, SEVERITY_LABELS, formatBytes, formatDate, formatHours } from '../constants.js';
import { useAsync } from '../useAsync.js';
import { ErrorBanner, Loading } from './common.jsx';

// Paleta compartida con el tema oscuro (chartTheme.js).
const C = CHART_COLORS;
const SEVERITY_COLORS = { baja: C.muted, media: C.navySoft, alta: C.warn, critica: C.bad };
const CATEGORY_COLORS = { imagen: C.navy, documento: C.ok, video: C.bad, audio: C.warn, registro: C.violet };
const AXIS = AXIS_STYLE;
// Accesibilidad: sin animaciones si el sistema operativo pide reducir el movimiento.
const ANIMATE = typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Kpi({ label, value, sub, tone = 'navy' }) {
  return (
    <div className={`kpi kpi--tone-${tone}`}>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      {sub && <span className="kpi__sub">{sub}</span>}
    </div>
  );
}

function ChartCard({ title, subtitle, children, wide = false }) {
  return (
    <section className={`panel chart-card${wide ? ' chart-card--wide' : ''}`}>
      <header className="panel__head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
      </header>
      <div className="chart-card__body">{children}</div>
    </section>
  );
}


export default function Analytics({ user }) {
  const { data, error, loading } = useAsync(() => api.analytics(), []);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;

  const r = data.resumen;
  const severity = data.porSeveridad.map((s) => ({ ...s, nombre: SEVERITY_LABELS[s.severidad] }));
  const stages = data.tiemposEtapa.map((s) => ({ ...s, nombre: s.etapa_nombre }));
  const downtime = data.indisponibilidad.filter((s) => s.horas > 0).sort((a, b) => b.horas - a.horas);
  const decisions = data.decisiones.map((d) => ({ ...d, nombre: d.codigo }));
  const owners = data.accionesPorResponsable.map((o) => ({ ...o, nombre: o.nombre.split(' ')[0], rolLabel: ROLE_LABELS[o.rol] }));
  const evidence = data.evidenciasPorCategoria.map((e) => ({ ...e, nombre: EVIDENCE_CATEGORY[e.categoria], bytes: Number(e.bytes) }));
  const security = data.seguridad?.map((s) => ({ ...s, nombre: SECURITY_EVENT_LABELS[s.evento] ?? s.evento }));
  // El cierre es documentación; la lectura se centra en las etapas operativas de la respuesta.
  const slowest = stages.filter((s) => s.etapa !== 'cierre').sort((a, b) => b.horas_promedio - a.horas_promedio)[0];

  return (
    <div className="analytics">
      <div className="page-head">
        <div>
          <h1>Analítica de la respuesta</h1>
          <p className="muted">Incidentes reales (los simulacros se excluyen de los tiempos) · actualizado {formatDate(data.generadoEn)}</p>
        </div>
        <a className="btn btn--ghost" href={incidentsCsvUrl} download>Exportar CSV</a>
      </div>

      <section className="kpis kpis--5" aria-label="Indicadores clave">
        <Kpi label="Tiempo medio de resolución" value={formatHours(r.mttr_horas)} sub={`MTTR · peor caso ${formatHours(r.peor_tiempo_horas)}`} tone="bad" />
        <Kpi label="Tiempo hasta contención" value={formatHours(r.mttc_horas)} sub="MTTC · detección → contención" tone="amber" />
        <Kpi label="Incidentes reales" value={r.incidentes_reales} sub={`${r.simulacros} simulacros · ${r.abiertos} abiertos`} />
        <Kpi label="Disponibilidad actual" value={`${r.disponibilidad}%`} sub="servicios operativos" tone="ok" />
        <Kpi label="Cuentas con MFA" value={`${r.usuarios_con_mfa}/${r.usuarios_total}`} sub={`${r.evidencias} evidencias · ${formatBytes(r.evidencias_bytes)}`} tone="violet" />
      </section>

      {slowest && (
        <div className="insight" role="note">
          <strong>Lectura para el comité:</strong> la etapa operativa más lenta es <strong>{slowest.nombre}</strong> ({formatHours(slowest.horas_promedio)} en promedio).
          {downtime[0] && <> El activo con más horas fuera de servicio es <strong>{downtime[0].codigo}</strong> ({formatHours(downtime[0].horas)}).</>}
        </div>
      )}

      <div className="chart-grid">
        <ChartCard title="Tiempo promedio por etapa" subtitle="Horas desde que el incidente entra a la etapa hasta que sale" wide>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stages} layout="vertical" margin={{ left: 20, right: 30 }}>
              <CartesianGrid horizontal={false} stroke={C.grid} />
              <XAxis type="number" tick={AXIS} unit=" h" />
              <YAxis type="category" dataKey="nombre" tick={AXIS} width={150} />
              <Tooltip {...TOOLTIP_PROPS} formatter={(v) => [`${v} h`, 'Promedio']} />
              <Bar isAnimationActive={ANIMATE} dataKey="horas_promedio" radius={[0, 4, 4, 0]}>
                {stages.map((s) => <Cell key={s.etapa} fill={s.etapa === slowest?.etapa ? C.bad : C.navy} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Horas fuera de servicio por activo" subtitle="Suma del tiempo no operativo según la bitácora">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={downtime} margin={{ right: 10 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="codigo" tick={{ ...AXIS, fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={55} />
              <YAxis tick={AXIS} unit=" h" />
              <Tooltip {...TOOLTIP_PROPS} formatter={(v) => [`${v} h`, 'Fuera de servicio']} labelFormatter={(l) => downtime.find((d) => d.codigo === l)?.nombre ?? l} />
              <Bar isAnimationActive={ANIMATE} dataKey="horas" radius={[4, 4, 0, 0]}>
                {downtime.map((d) => <Cell key={d.codigo} fill={d.tipo === 'OT' ? C.bad : C.navySoft} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="legend-note"><span className="dot-legend" style={{ background: C.bad }} /> Red OT <span className="dot-legend" style={{ background: C.navySoft }} /> Sistemas TI</p>
        </ChartCard>

        <ChartCard title="Incidentes por severidad">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={severity} margin={{ top: 20 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="nombre" tick={AXIS} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip {...TOOLTIP_PROPS} formatter={(v) => [v, 'Incidentes']} />
              <Bar isAnimationActive={ANIMATE} dataKey="cantidad" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 12, fill: C.navy }}>
                {severity.map((s) => <Cell key={s.severidad} fill={SEVERITY_COLORS[s.severidad]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Decisiones del plan" subtitle="Respuestas Sí / No en los rombos D1–D4">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={decisions}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="nombre" tick={AXIS} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip {...TOOLTIP_PROPS} labelFormatter={(l) => decisions.find((d) => d.codigo === l)?.pregunta ?? l} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={ANIMATE} dataKey="si" name="Sí" stackId="d" fill={C.ok} />
              <Bar isAnimationActive={ANIMATE} dataKey="no" name="No" stackId="d" fill={C.bad} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Incidentes por mes">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.porMes}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="mes" tick={AXIS} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip {...TOOLTIP_PROPS} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={ANIMATE} dataKey="reales" name="Reales" stackId="m" fill={C.navy} />
              <Bar isAnimationActive={ANIMATE} dataKey="simulacros" name="Simulacros" stackId="m" fill={C.violet} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Acciones por responsable">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={owners}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="nombre" tick={AXIS} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip {...TOOLTIP_PROPS} labelFormatter={(l) => { const o = owners.find((x) => x.nombre === l); return o ? `${o.nombre} · ${o.rolLabel}` : l; }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={ANIMATE} dataKey="completadas" name="Completadas" stackId="a" fill={C.ok} />
              <Bar isAnimationActive={ANIMATE} dataKey="fallidas" name="Fallidas" stackId="a" fill={C.bad} />
              <Bar isAnimationActive={ANIMATE} dataKey="abiertas" name="Abiertas" stackId="a" fill={C.amber} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evidencias por tipo">
          {evidence.length === 0 ? <p className="muted">Aún no hay evidencias cargadas.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={evidence} dataKey="cantidad" nameKey="nombre" innerRadius={55} outerRadius={90} paddingAngle={2} isAnimationActive={ANIMATE} label={({ nombre, cantidad }) => `${nombre}: ${cantidad}`}>
                  {evidence.map((e) => <Cell key={e.categoria} fill={CATEGORY_COLORS[e.categoria]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_PROPS} formatter={(v, _n, p) => [`${v} archivos · ${formatBytes(p.payload.bytes)}`, p.payload.nombre]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {security && (
          <ChartCard title="Eventos de seguridad (30 días)" subtitle="Solo visible para el coordinador">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={security} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" tick={AXIS} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={AXIS} width={140} />
                <Tooltip {...TOOLTIP_PROPS} formatter={(v) => [v, 'Eventos']} />
                <Bar isAnimationActive={ANIMATE} dataKey="cantidad" radius={[0, 4, 4, 0]}>
                  {security.map((s) => <Cell key={s.evento} fill={/fallido|bloqueada|denegado/.test(s.evento) ? C.bad : C.navy} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
      {user.rol !== 'coordinador' && <p className="hint">Los eventos de seguridad solo los ve el coordinador.</p>}
    </div>
  );
}
