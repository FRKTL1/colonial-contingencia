import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../useAsync.js';
import {
  EVENT_TYPES,
  actionsByOwner,
  answersWithChoice,
  buildSimulation,
  computeKpis,
  hoursByStage,
} from '../../simulation/engine.js';
import { ErrorBanner, Loading } from '../common.jsx';
import FlowStepper from '../FlowStepper.jsx';
import SimCharts from './SimCharts.jsx';
import { Clock, Controls, DecisionPrompt, NowCard, ServiceBoard, SimLog, SimSummary } from './parts.jsx';

/** Milisegundos por evento a velocidad 1×: las etapas y decisiones se dejan leer más tiempo. */
const DELAY_MS = {
  [EVENT_TYPES.STAGE]: 1800,
  [EVENT_TYPES.DECISION]: 2400,
  [EVENT_TYPES.START]: 2200,
  [EVENT_TYPES.END]: 1500,
};
const DEFAULT_DELAY_MS = 1000;

async function loadInputs() {
  const [flow, plan, users, services] = await Promise.all([api.flow(), api.plan(), api.users(), api.services()]);
  return { flow, plan, users, services };
}

function useSimulation(inputs, answers) {
  return useMemo(() => {
    if (!inputs) return { sim: null, error: null };
    try {
      return { sim: buildSimulation({ ...inputs, answers }), error: null };
    } catch (error) {
      return { sim: null, error };
    }
  }, [inputs, answers]);
}

export default function Simulation() {
  const { data: inputs, error: loadError, loading } = useAsync(loadInputs, []);
  const [answers, setAnswers] = useState([]);
  const [confirmed, setConfirmed] = useState(() => new Set());
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pauseAtDecisions, setPauseAtDecisions] = useState(true);
  const { sim, error: simError } = useSimulation(inputs, answers);

  const events = sim?.events ?? [];
  const last = events.length - 1;
  const started = index >= 0;
  const finished = started && index >= last;
  const next = events[index + 1];
  const pending = pauseAtDecisions && next?.tipo === EVENT_TYPES.DECISION && !next.decision.forzada && !confirmed.has(next.decision.ordinal)
    ? next
    : null;

  // Reproducción: avanza un evento por tic hasta el final o hasta una decisión pendiente.
  useEffect(() => {
    if (!playing || pending || index >= last) {
      if (playing && index >= last) setPlaying(false);
      return undefined;
    }
    const delay = (DELAY_MS[next?.tipo] ?? DEFAULT_DELAY_MS) / speed;
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, last)), delay);
    return () => clearTimeout(timer);
  }, [playing, pending, index, last, next, speed]);

  const reset = useCallback(() => {
    setPlaying(false);
    setIndex(-1);
    setAnswers([]);
    setConfirmed(new Set());
  }, []);

  const play = () => {
    if (finished) {
      reset();
      setPlaying(true);
      return;
    }
    if (!started) setIndex(0);
    setPlaying(true);
  };

  const step = () => {
    if (pending || finished) return;
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, last));
  };

  const seek = (value) => {
    setPlaying(false);
    setIndex(Math.max(-1, Math.min(value, last)));
  };

  /** Fija la respuesta elegida y rehace la línea de tiempo desde esa decisión. */
  const choose = (respuesta) => {
    if (!pending) return;
    const { ordinal } = pending.decision;
    setAnswers(answersWithChoice(events, ordinal, respuesta));
    setConfirmed((prev) => new Set([...prev].filter((o) => o < ordinal)).add(ordinal));
    setIndex((i) => i + 1);
    setPlaying(true);
  };

  const retry = () => {
    reset();
    setPauseAtDecisions(true);
  };

  const view = useMemo(() => {
    if (!sim || !inputs) return null;
    const upTo = events.slice(0, index + 1);
    const current = upTo.at(-1) ?? null;
    const stageEvent = [...upTo].reverse().find((e) => e.tipo === EVENT_TYPES.STAGE) ?? null;
    const stageNames = Object.fromEntries(inputs.flow.etapas.map((e) => [e.clave, e.nombre]));
    const initialStates = Object.fromEntries(inputs.services.map((s) => [s.codigo, 'operativo']));
    const types = Object.fromEntries(inputs.services.map((s) => [s.codigo, s.tipo]));
    return {
      current,
      stageEvent,
      stageNames,
      snapshot: current?.servicios ?? initialStates,
      kpis: current?.kpis ?? computeKpis(initialStates, types),
      changed: new Set(current?.cambios?.map((c) => c.codigo) ?? []),
      decisions: upTo.filter((e) => e.tipo === EVENT_TYPES.DECISION).map((e) => e.decision),
      series: upTo.map((e) => ({ t: e.t, ...e.kpis })),
      owners: actionsByOwner(events, index).map((o) => ({ ...o, corto: (o.nombre ?? o.rol).split(' ')[0] })),
      stages: hoursByStage(events, index, stageNames),
      log: upTo,
    };
  }, [sim, inputs, events, index]);

  if (loading && !inputs) return <Loading label="Preparando la simulación…" />;
  if (!inputs || !view) return <ErrorBanner error={loadError ?? simError ?? new Error('No se pudo preparar la simulación')} />;

  const { current, stageEvent, kpis } = view;

  return (
    <div className="simulation">
      <div className="page-head">
        <div>
          <h1>Simulación del plan de contingencia</h1>
          <p className="muted">Recrea el ataque a Colonial Pipeline (7–13 de mayo de 2021) desde la afectación hasta el cierre: etapas, responsables, decisiones y su efecto en los servicios.</p>
        </div>
        <Clock hours={current?.t ?? 0} started={started} />
      </div>

      <div className="alert alert--simulacro" role="note">
        <strong>Solo visual.</strong> Corre en tu navegador: no crea incidentes ni cambia el estado real de los servicios. Los tiempos se calibraron con los hitos públicos del caso (paro el 7 de mayo a las 6:10, reinicio el 12 y entregas el 13).
      </div>

      <Controls
        playing={playing}
        started={started}
        finished={finished}
        pending={pending}
        speed={speed}
        pauseAtDecisions={pauseAtDecisions}
        index={index}
        last={last}
        onPlay={play}
        onPause={() => setPlaying(false)}
        onStep={step}
        onReset={reset}
        onSpeed={setSpeed}
        onTogglePause={setPauseAtDecisions}
        onSeek={seek}
      />

      <FlowStepper etapa={current?.etapa ?? 'deteccion'} decisiones={view.decisions} intentos={current?.intentos ?? 0} />

      <section className="kpis" aria-label="Indicadores en este instante">
        <div className="kpi kpi--operativo"><span className="kpi__label">Operativos</span><span className="kpi__value">{kpis.operativo}</span><span className="kpi__sub">de {kpis.total} servicios</span></div>
        <div className="kpi kpi--afectado"><span className="kpi__label">Afectados</span><span className="kpi__value">{kpis.afectado}</span><span className="kpi__sub">{current?.escalado ? 'severidad crítica' : 'por el ataque o la contención'}</span></div>
        <div className="kpi kpi--en_recuperacion"><span className="kpi__label">En recuperación</span><span className="kpi__value">{kpis.en_recuperacion}</span><span className="kpi__sub">reinicio progresivo</span></div>
        <div className="kpi kpi--availability">
          <span className="kpi__label">Disponibilidad · flujo del oleoducto</span>
          <span className="kpi__value">{kpis.disponibilidad}% · {kpis.flujoOleoducto}%</span>
          <div className="meter" role="meter" aria-valuenow={kpis.disponibilidad} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${kpis.disponibilidad}%` }} />
          </div>
        </div>
      </section>

      <div className="sim-grid">
        <div className="sim-grid__main">
          {pending ? (
            <DecisionPrompt
              event={pending}
              stageNames={view.stageNames}
              failures={current?.intentos ?? 0}
              maxFailures={inputs.flow.maxIntentosErradicacion}
              onChoose={choose}
            />
          ) : (
            <NowCard event={current} stageEvent={stageEvent} />
          )}
          {finished && <SimSummary summary={sim.summary} onRetry={retry} />}
        </div>
        <ServiceBoard services={inputs.services} snapshot={view.snapshot} changed={view.changed} />
      </div>

      <SimCharts series={view.series} totalHours={sim.summary.horasTotales} owners={view.owners} stages={view.stages} />

      <SimLog events={view.log} />
    </div>
  );
}
