import { api } from '../../api.js';
import { useAsync } from '../../useAsync.js';
import { ErrorBanner, Loading } from '../common.jsx';

/**
 * Todas las fuentes públicas del mapa, qué sustenta cada una y qué datos la citan.
 * Sirve para responder "¿de dónde sale este dato?" durante la exposición.
 */
export default function Sources() {
  const { data, error, loading } = useAsync(() => api.pipelineMap(), []);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;

  const citing = {};
  const cite = (keys, label) => (keys ?? []).forEach((k) => { (citing[k] ??= []).push(label); });
  data.instalaciones.forEach((p) => cite(p.fuentes, p.nombre));
  [...data.tramos, ...data.sistemas].forEach((e) => cite(e.fuentes, e.codigo));
  data.caso.dias.forEach((d) => cite(d.fuentes, d.titulo.split(' · ')[0]));
  const checklistKeys = new Set([...data.tramos, ...data.sistemas].flatMap((e) => e.checklist.flatMap((c) => c.fuentes)));

  return (
    <div className="sources">
      <section className="panel">
        <h3>De dónde sale cada dato</h3>
        <p className="muted small" style={{ marginTop: 4 }}>
          Las instalaciones, los tramos, los sistemas, la reproducción del caso y cada punto de verificación citan una de estas fuentes.
          Lo que ninguna fuente publica (la ruta exacta del ducto, la capacidad de los ramales, el inventario de servidores) no se muestra como dato:
          aparece como “sin dato público” o como trazado esquemático.
        </p>
      </section>
      <ol className="sources__list">
        {Object.entries(data.fuentes).map(([key, s]) => (
          <li key={key} className="panel source-card">
            <div className="source-card__head">
              <a href={s.url} target="_blank" rel="noreferrer noopener"><b>{s.titulo}</b></a>
              <span className="muted small">{s.editor}{s.fecha ? ` · ${s.fecha.split('-').reverse().join('/')}` : ''}</span>
            </div>
            <p className="small">{s.sustenta}</p>
            <p className="muted small">
              Citada por: {[...(citing[key] ?? []), ...(checklistKeys.has(key) ? ['listas de verificación'] : [])].join(', ') || '—'}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
