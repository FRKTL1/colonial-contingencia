import { useState } from 'react';
import { api } from '../api.js';
import {
  EVENT_LABELS,
  SERVICE_STATE_LABELS,
  SERVICE_TRANSITIONS,
  canChangeService,
  stageLabel,
  formatDate,
} from '../constants.js';
import { useAsync } from '../useAsync.js';
import { Criticality, ErrorBanner, Loading, NoteDialog, ServiceStateBadge, SeverityBadge, SimulacroBadge } from './common.jsx';

const POLL_MS = 10_000;

const KPIS = [
  { key: 'operativo', label: 'Operativos' },
  { key: 'afectado', label: 'Afectados' },
  { key: 'en_recuperacion', label: 'En recuperación' },
];

function ServiceCard({ service, user, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [pendingState, setPendingState] = useState(null);
  const options = canChangeService(user, service) ? SERVICE_TRANSITIONS[service.estado] : [];

  const confirmChange = async (nota) => {
    const estado = pendingState;
    setPendingState(null);
    setBusy(true);
    try {
      await api.changeServiceStatus(service.id, { estado, nota });
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`service-card service-card--${service.estado}`}>
      <header className="service-card__head">
        <span className="service-card__code">{service.codigo}</span>
        <ServiceStateBadge estado={service.estado} />
      </header>
      <h4>{service.nombre}</h4>
      <p className="service-card__note">{service.nota_estado ?? service.descripcion}</p>
      <footer className="service-card__foot">
        <Criticality value={service.criticidad} />
        <span className="muted small">{formatDate(service.actualizado_en)}</span>
      </footer>
      {options.length > 0 && (
        <select
          className="service-card__action"
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && setPendingState(e.target.value)}
          aria-label={`Cambiar estado de ${service.nombre}`}
        >
          <option value="">Cambiar estado…</option>
          {options.map((estado) => (
            <option key={estado} value={estado}>{SERVICE_STATE_LABELS[estado]}</option>
          ))}
        </select>
      )}
      {pendingState && (
      <NoteDialog
        open
        title={`${service.codigo} → ${SERVICE_STATE_LABELS[pendingState] ?? ''}`}
        description={`${service.nombre}. La nota queda en la bitácora de auditoría.`}
        required={pendingState === 'afectado'}
        confirmLabel="Cambiar estado"
        onConfirm={confirmChange}
        onCancel={() => setPendingState(null)}
      />
      )}
    </article>
  );
}

function ServiceGroup({ title, subtitle, services, ...cardProps }) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h3>{title}</h3>
          <p className="muted small">{subtitle}</p>
        </div>
      </header>
      <div className="service-grid">
        {services.map((s) => <ServiceCard key={s.id} service={s} {...cardProps} />)}
      </div>
    </section>
  );
}

export default function Dashboard({ user, onOpenIncident, onSimulate }) {
  const { data, error, loading, reload } = useAsync(() => api.dashboard(), [], { pollMs: POLL_MS });
  const [actionError, setActionError] = useState(null);

  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;

  const { resumen, servicios, incidentesAbiertos, ultimosEventos } = data;

  return (
    <div className="dashboard">
      <div className="page-head">
        <div>
          <h1>Estado de servicios</h1>
          <p className="muted">Actualización automática cada {POLL_MS / 1000} s · Última: {formatDate(data.generadoEn)}</p>
        </div>
        <div className="page-head__actions">
          {onSimulate && (
            <button type="button" className="btn btn--warning" onClick={onSimulate} title="Recorre el plan completo en pantalla sin modificar datos">
              ▶ Iniciar simulación
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={reload}>Actualizar</button>
        </div>
      </div>

      <ErrorBanner error={error ?? actionError} onDismiss={() => setActionError(null)} />

      {incidentesAbiertos.some((i) => i.es_simulacro) && (
        <div className="alert alert--simulacro" role="status">
          <strong>Simulacro en curso.</strong> Los cambios de estado corresponden a un ejercicio de práctica del plan.
        </div>
      )}

      <section className="kpis" aria-label="Resumen">
        {KPIS.map((kpi) => (
          <div key={kpi.key} className={`kpi kpi--${kpi.key}`}>
            <span className="kpi__label">{kpi.label}</span>
            <span className="kpi__value">{resumen[kpi.key]}</span>
            <span className="kpi__sub">de {resumen.total} servicios</span>
          </div>
        ))}
        <div className="kpi kpi--availability">
          <span className="kpi__label">Disponibilidad</span>
          <span className="kpi__value">{resumen.disponibilidad}%</span>
          <div className="meter" role="meter" aria-valuenow={resumen.disponibilidad} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${resumen.disponibilidad}%` }} />
          </div>
        </div>
      </section>

      <div className="dashboard__grid">
        <div className="dashboard__main">
          <ServiceGroup
            title="Red operativa (OT)"
            subtitle="Tramos del oleoducto y control SCADA"
            services={servicios.OT}
            user={user}
            onChanged={reload}
            onError={setActionError}
          />
          <ServiceGroup
            title="Sistemas de TI"
            subtitle="Sistemas corporativos y de soporte"
            services={servicios.TI}
            user={user}
            onChanged={reload}
            onError={setActionError}
          />
        </div>

        <aside className="dashboard__side">
          <section className="panel">
            <header className="panel__head"><h3>Incidentes abiertos</h3></header>
            {incidentesAbiertos.length === 0 ? (
              <p className="muted">Sin incidentes abiertos.</p>
            ) : (
              <ul className="incident-mini">
                {incidentesAbiertos.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => onOpenIncident(i.id)}>
                      <span className="incident-mini__code">{i.codigo}</span>
                      <span className="incident-mini__badges">
                        <SeverityBadge severidad={i.severidad} />
                        <SimulacroBadge show={i.es_simulacro} />
                      </span>
                      <span className="incident-mini__title">{i.titulo}</span>
                      <span className="muted small">Etapa: {stageLabel(i.etapa)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <header className="panel__head"><h3>Últimos eventos</h3></header>
            {ultimosEventos.length === 0 ? (
              <p className="muted">Aún no hay eventos.</p>
            ) : (
              <ol className="timeline timeline--compact">
                {ultimosEventos.map((e) => (
                  <li key={e.id} className={`timeline__item timeline__item--${e.evento}`}>
                    <span className="timeline__title">{EVENT_LABELS[e.evento] ?? e.evento}</span>
                    <span className="small">{e.servicio_nombre ?? e.detalle ?? ''}</span>
                    <span className="muted small">{formatDate(e.fecha)} · {e.usuario_nombre}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
