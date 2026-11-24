import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_STYLE, CHART_COLORS, TOOLTIP_PROPS } from '../../chartTheme.js';
import { SIMULATION_START, formatSimulatedTime } from '../../simulation/engine.js';

const C = CHART_COLORS;
const AXIS = AXIS_STYLE;
const ANIMATE = typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Marcas del eje en cada medianoche simulada, para leer el eje por días como en el caso real. */
function midnightTicks(totalHours) {
  const startHour = new Date(SIMULATION_START).getUTCHours() + new Date(SIMULATION_START).getUTCMinutes() / 60;
  const ticks = [];
  for (let h = 24 - startHour; h <= totalHours; h += 24) ticks.push(Math.round(h * 100) / 100);
  return ticks;
}

const dayLabel = (h) => new Date(SIMULATION_START + h * 3_600_000).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const timeLabel = (h) => formatSimulatedTime(Number(h));

function ChartCard({ title, subtitle, children }) {
  return (
    <section className="panel chart-card">
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

export default function SimCharts({ series, totalHours, owners, stages }) {
  const ticks = midnightTicks(totalHours);
  const xAxis = (
    <XAxis dataKey="t" type="number" domain={[0, totalHours]} ticks={ticks} tickFormatter={dayLabel} tick={AXIS} allowDataOverflow />
  );

  return (
    <div className="chart-grid">
      <ChartCard title="Servicios por estado" subtitle="Cuántos de los 10 servicios están afectados, en recuperación u operativos">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            {xAxis}
            <YAxis allowDecimals={false} domain={[0, 10]} tick={AXIS} />
            <Tooltip {...TOOLTIP_PROPS} labelFormatter={timeLabel} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="stepAfter" dataKey="afectado" name="Afectados" stackId="s" stroke={C.bad} fill={C.bad} fillOpacity={0.75} isAnimationActive={false} />
            <Area type="stepAfter" dataKey="en_recuperacion" name="En recuperación" stackId="s" stroke={C.warn} fill={C.amber} fillOpacity={0.85} isAnimationActive={false} />
            <Area type="stepAfter" dataKey="operativo" name="Operativos" stackId="s" stroke={C.ok} fill={C.ok} fillOpacity={0.6} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Disponibilidad y flujo del oleoducto" subtitle="% de servicios operativos y % de tramos bombeando">
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            {xAxis}
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} />
            <Tooltip {...TOOLTIP_PROPS} labelFormatter={timeLabel} formatter={(v) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="stepAfter" dataKey="disponibilidad" name="Disponibilidad" stroke={C.navy} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="flujoOleoducto" name="Flujo del oleoducto" stroke={C.bad} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Acciones por responsable" subtitle="Asignadas y cerradas por cada persona del equipo">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={owners} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="corto" tick={AXIS} />
            <YAxis allowDecimals={false} tick={AXIS} />
            <Tooltip {...TOOLTIP_PROPS} labelFormatter={(_, p) => p?.[0]?.payload?.nombre ?? ''} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="asignadas" name="Asignadas" fill={C.navy} radius={[4, 4, 0, 0]} isAnimationActive={ANIMATE} />
            <Bar dataKey="completadas" name="Completadas" fill={C.ok} radius={[4, 4, 0, 0]} isAnimationActive={ANIMATE} />
            <Bar dataKey="fallidas" name="Fallidas" fill={C.bad} radius={[4, 4, 0, 0]} isAnimationActive={ANIMATE} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Horas por etapa" subtitle="Tiempo simulado acumulado en cada etapa del plan">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={stages} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" tick={AXIS} tickFormatter={(v) => `${v} h`} />
            <YAxis type="category" dataKey="nombre" tick={AXIS} width={130} interval={0} />
            <Tooltip {...TOOLTIP_PROPS} formatter={(v) => `${v} h`} />
            <Bar dataKey="horas" name="Horas" fill={C.violet} radius={[0, 4, 4, 0]} isAnimationActive={ANIMATE} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
