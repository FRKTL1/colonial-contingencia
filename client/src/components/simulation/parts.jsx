import { ROLE_LABELS, SERVICE_STATE_LABELS } from '../../constants.js';
import { EVENT_TYPES, formatElapsed, formatSimulatedTime } from '../../simulation/engine.js';

export const EFFECT_LABELS = {
  detener_ot: 'Detiene el bombeo y los 4 servicios OT',
  iniciar_recuperacion: 'Pasa lo afectado a recuperación',
  restablecer_servicios: 'Restablece todos los servicios',
};

export const EVENT_ICONS = {
  [EVENT_TYPES.START]: '⚠',
  [EVENT_TYPES.STAGE]: '▸',
  [EVENT_TYPES.SERVICE]: '⇄',
  [EVENT_TYPES.ACTION_ASSIGNED]: '＋',
  [EVENT_TYPES.ACTION_DONE]: '✓',
  [EVENT_TYPES.ACTION_FAILED]: '✕',
  [EVENT_TYPES.DECISION]: '◆',
  [EVENT_TYPES.ESCALATION]: '▲',
  [EVENT_TYPES.LESSONS]: '✎',
  [EVENT_TYPES.END]: '■',
};

export const EVENT_TITLES = {
  [EVENT_TYPES.START]: 'Afectación',
  [EVENT_TYPES.STAGE]: 'Cambio de etapa',
  [EVENT_TYPES.SERVICE]: 'Cambio en servicios',
  [EVENT_TYPES.ACTION_ASSIGNED]: 'Acción asignada',
  [EVENT_TYPES.ACTION_DONE]: 'Acción completada',
  [EVENT_TYPES.ACTION_FAILED]: 'Acción fallida',
  [EVENT_TYPES.DECISION]: 'Decisión',
  [EVENT_TYPES.ESCALATION]: 'Escalamiento',
  [EVENT_TYPES.LESSONS]: 'Lecciones aprendidas',
  [EVENT_TYPES.END]: 'Cierre',
};

const initials = (name) => (name ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('');

export function Person({ person, compact = false }) {
  if (!person) return null;
  return (
    <span className={`sim-person${compact ? ' sim-person--compact' : ''}`}>
      <span className={`avatar sim-person__avatar sim-role--${person.rol}`} aria-hidden="true">{initials(person.nombre ?? ROLE_LABELS[person.rol])}</span>
      <span className="sim-person__text">
        <strong>{person.nombre ?? 'Sin asignar'}</strong>
        {!compact && <small>{ROLE_LABELS[person.rol] ?? person.rol}</small>}
      </span>
    </span>
  );
}

export function Clock({ hours, started }) {
  return (
    <div className="sim-clock" aria-live="off">
      <span className="sim-clock__label">Hora simulada (este de EE. UU.)</span>
      <strong className="sim-clock__time">{formatSimulatedTime(started ? hours : 0)}</strong>
      <span className="sim-clock__elapsed">{started ? formatElapsed(hours) : 'Antes de la detección'}</span>
    </div>
  );
}

export function Controls({ playing, started, finished, pending, speed, pauseAtDecisions, index, last, onPlay, onPause, onStep, onReset, onSpeed, onTogglePause, onSeek }) {
  return (
    <section className="panel sim-controls" aria-label="Controles de la simulación">
      <div className="sim-controls__buttons">
        {playing && !pending ? (
          <button type="button" className="btn btn--primary" onClick={onPause}>⏸ Pausar</button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={onPlay} disabled={Boolean(pending)}>
            {finished ? '⟲ Repetir' : started ? '▶ Continuar' : '▶ Iniciar simulación'}
          </button>
        )}
        <button type="button" className="btn" onClick={onStep} disabled={finished || Boolean(pending)} title="Avanza un evento">⏭ Paso</button>
        <button type="button" className="btn btn--ghost" onClick={onReset} disabled={!started}>Reiniciar</button>
      </div>

      <div className="segmented" role="group" aria-label="Velocidad">
        {[1, 2, 4].map((s) => (
          <button key={s} type="button" className={`segmented__item${speed === s ? ' segmented__item--active' : ''}`} onClick={() => onSpeed(s)} aria-pressed={speed === s}>{s}×</button>
        ))}
      </div>

      <label className="sim-toggle">
        <input type="checkbox" checked={pauseAtDecisions} onChange={(e) => onTogglePause(e.target.checked)} />
        <span>Detenerme en cada decisión para elegir</span>
      </label>

      <label className="sim-seek">
        <span className="sr-only">Posición en la simulación</span>
        <input type="range" min={-1} max={last} value={index} onChange={(e) => onSeek(Number(e.target.value))} />
        <span className="muted small">{Math.max(index + 1, 0)} / {last + 1} eventos</span>
      </label>
    </section>
  );
}

export function NowCard({ event, stageEvent }) {
  if (!event) {
    return (
      <section className="panel sim-now sim-now--intro">
        <h3>Antes del ataque</h3>
        <p>Los 10 servicios operan con normalidad. Al iniciar, la simulación recorre el plan de contingencia desde la afectación por ransomware hasta el cierre: quién actúa en cada etapa, qué decide el comité y cómo cambian los servicios.</p>
        <p className="muted small">Por defecto reproduce lo que hizo Colonial Pipeline en mayo de 2021. Con «Detenerme en cada decisión» puedes elegir otra respuesta y ver otra ruta.</p>
      </section>
    );
  }
  const info = stageEvent?.etapaInfo;
  return (
    <section className={`panel sim-now sim-now--${event.tipo}`} aria-live="polite">
      {info && (
        <header className="sim-now__head">
          <div>
            <span className="muted small">Etapa actual {info.decision ? `· resuelve ${info.decision}` : ''}{info.esReintento ? ' · reintento' : ''}</span>
            <h3>{stageEvent.texto}</h3>
          </div>
          <div className="sim-now__owner">
            <span className="muted small">Responsable</span>
            <Person person={stageEvent.actor} />
          </div>
        </header>
      )}
      {info?.procedimiento && <p className="sim-now__procedure">{info.procedimiento}</p>}
      {info?.recursos?.length > 0 && (
        <ul className="sim-chips" aria-label="Recursos tecnológicos">
          {info.recursos.map((r) => <li key={r.codigo} title={r.categoria}>{r.codigo} · {r.nombre}</li>)}
        </ul>
      )}
      <div className={`sim-event sim-event--${event.tipo}`}>
        <span className="sim-event__icon" aria-hidden="true">{EVENT_ICONS[event.tipo]}</span>
        <div>
          <span className="sim-event__title">{EVENT_TITLES[event.tipo]}</span>
          <p>{event.texto}</p>
          {event.decision && <p className="muted small">{event.decision.justificacion}</p>}
          {event.cambios && (
            <ul className="sim-changes">
              {event.cambios.map((c) => <li key={c.codigo}><b>{c.codigo}</b> {c.nombre} → {SERVICE_STATE_LABELS[c.estado]}</li>)}
            </ul>
          )}
        </div>
        <Person person={event.actor} compact />
      </div>
    </section>
  );
}

function BranchOption({ label, branch, stageNames, colonial, failures, maxFailures, onChoose, tone }) {
  return (
    <div className={`sim-branch sim-branch--${tone}`}>
      <div className="sim-branch__head">
        <strong>{label}</strong>
        {colonial && <span className="badge badge--simulacro">Lo que hizo Colonial</span>}
      </div>
      <dl className="sim-branch__facts">
        <dt>Pasa a</dt><dd>{stageNames[branch.destino] ?? branch.destino}</dd>
        {branch.accion && (<><dt>Acción</dt><dd>{branch.accion}</dd></>)}
        {branch.responsable && (<><dt>Responsable</dt><dd><Person person={branch.responsable} compact /></dd></>)}
        {branch.efecto && (<><dt>Efecto</dt><dd>{EFFECT_LABELS[branch.efecto]}</dd></>)}
        {branch.cuentaComoIntentoFallido && (<><dt>Intentos</dt><dd>Suma un intento fallido ({failures + 1} de {maxFailures}; al tope se escala a crítica)</dd></>)}
      </dl>
      <button type="button" className={`btn btn--${tone === 'si' ? 'yes' : 'no'} btn--block`} onClick={onChoose}>Decidir {label}</button>
    </div>
  );
}

export function DecisionPrompt({ event, stageNames, failures, maxFailures, onChoose }) {
  const d = event.decision;
  return (
    <section className="panel sim-decision" role="dialog" aria-labelledby="sim-decision-title">
      <header className="sim-decision__head">
        <div>
          <span className="muted small">Decisión {d.codigo} · el comité espera tu respuesta</span>
          <h3 id="sim-decision-title">{d.pregunta}</h3>
        </div>
        <div className="sim-now__owner">
          <span className="muted small">Decide</span>
          <Person person={event.actor} />
        </div>
      </header>
      <div className="sim-decision__options">
        <BranchOption label="Sí" tone="si" branch={d.ramas.si} stageNames={stageNames} colonial={d.colonial === true}
          failures={failures} maxFailures={maxFailures} onChoose={() => onChoose(true)} />
        <BranchOption label="No" tone="no" branch={d.ramas.no} stageNames={stageNames} colonial={d.colonial === false}
          failures={failures} maxFailures={maxFailures} onChoose={() => onChoose(false)} />
      </div>
    </section>
  );
}

export function ServiceBoard({ services, snapshot, changed }) {
  const groups = [
    { tipo: 'OT', titulo: 'Red operativa (OT)' },
    { tipo: 'TI', titulo: 'Sistemas de TI' },
  ];
  return (
    <section className="panel sim-board" aria-label="Estado de los servicios">
      <header className="panel__head"><h3>Servicios</h3></header>
      {groups.map((g) => (
        <div key={g.tipo} className="sim-board__group">
          <span className="muted small">{g.titulo}</span>
          <ul className="sim-tiles">
            {services.filter((s) => s.tipo === g.tipo).map((s) => {
              const estado = snapshot[s.codigo] ?? 'operativo';
              return (
                <li key={s.codigo} className={`sim-tile sim-tile--${estado}${changed.has(s.codigo) ? ' sim-tile--changed' : ''}`} title={`${s.nombre}: ${SERVICE_STATE_LABELS[estado]}`}>
                  <b>{s.codigo}</b>
                  <span>{s.nombre}</span>
                  <small>{SERVICE_STATE_LABELS[estado]}</small>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

const LOG_CLASS = {
  [EVENT_TYPES.DECISION]: 'decision',
  [EVENT_TYPES.ESCALATION]: 'escalamiento',
  [EVENT_TYPES.ACTION_FAILED]: 'escalamiento',
  [EVENT_TYPES.START]: 'detencion_preventiva',
  [EVENT_TYPES.END]: 'incidente_cerrado',
};

function logClass(event) {
  if (event.tipo === EVENT_TYPES.SERVICE) {
    return event.cambios.some((c) => c.estado === 'afectado') ? 'detencion_preventiva' : 'servicio_restablecido';
  }
  return LOG_CLASS[event.tipo] ?? event.tipo;
}

export function SimLog({ events }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h3>Bitácora de la simulación</h3>
          <p className="muted small">Del evento más reciente al primero</p>
        </div>
      </header>
      {events.length === 0 ? (
        <p className="muted">Aún no hay eventos.</p>
      ) : (
        <ol className="timeline sim-log">
          {[...events].reverse().map((e) => (
            <li key={e.id} className={`timeline__item timeline__item--${logClass(e)}`}>
              <span className="timeline__title">{EVENT_TITLES[e.tipo]}{e.decision?.porUsuario ? ' · elegida por ti' : ''}</span>
              <span className="small">{e.texto}</span>
              <span className="muted small">{formatSimulatedTime(e.t)} · {e.actor?.nombre ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function SimSummary({ summary, onRetry }) {
  const route = summary.decisiones.map((d) => `${d.codigo} ${d.respuesta ? 'Sí' : 'No'}`).join(' → ');
  const days = (h) => `${(h / 24).toLocaleString('es-CO', { maximumFractionDigits: 1 })} días`;
  return (
    <section className="panel sim-summary">
      <header className="panel__head">
        <div>
          <h3>Resultado de la simulación</h3>
          <p className="muted small">Ruta seguida: {route}</p>
        </div>
        <button type="button" className="btn btn--warning" onClick={onRetry}>Probar otra ruta</button>
      </header>
      <div className="kpis kpis--5">
        <div className="kpi"><span className="kpi__label">Duración total</span><span className="kpi__value">{days(summary.horasTotales)}</span><span className="kpi__sub">detección → cierre</span></div>
        <div className="kpi kpi--tone-bad"><span className="kpi__label">Oleoducto sin flujo pleno</span><span className="kpi__value">{days(summary.horasSinOleoducto)}</span><span className="kpi__sub">algún tramo detenido</span></div>
        <div className="kpi kpi--tone-amber"><span className="kpi__label">Disponibilidad mínima</span><span className="kpi__value">{summary.disponibilidadMinima}%</span><span className="kpi__sub">de los 10 servicios</span></div>
        <div className="kpi kpi--tone-ok"><span className="kpi__label">Acciones</span><span className="kpi__value">{summary.accionesCompletadas}</span><span className="kpi__sub">{summary.accionesFallidas} fallida(s) · {summary.intentosFallidos} intento(s) de erradicación</span></div>
        <div className="kpi kpi--tone-violet"><span className="kpi__label">Distintas a Colonial</span><span className="kpi__value">{summary.diferentesAColonial}</span><span className="kpi__sub">{summary.escalado ? 'severidad escalada a crítica' : `de ${summary.decisiones.length} decisiones`}</span></div>
      </div>
    </section>
  );
}
