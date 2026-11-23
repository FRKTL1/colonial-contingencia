import { useState } from 'react';
import { api } from '../../api.js';
import { EVENT_LABELS, formatDate } from '../../constants.js';
import { useAsync } from '../../useAsync.js';
import { ErrorBanner, Loading } from '../common.jsx';

const short = (hash) => `${hash.slice(0, 10)}…`;

/** Bitácora encadenada: cada evento guarda la huella del anterior, como la del proyecto Rack. */
export default function Ledger() {
  const { data: events, error, loading, reload } = useAsync(() => api.ledger(15), []);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(null);

  const verify = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      setCheck(await api.verifyLedger());
      await reload();
    } catch (err) {
      setCheckError(err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="ledger">
      <section className="panel ledger__intro">
        <div>
          <h3>Bitácora encadenada con SHA-256</h3>
          <p className="muted small">
            Cada evento guarda la huella del anterior. Si alguien cambia o borra un registro, incluso desde la base de datos,
            la cadena se rompe en ese punto. La verificación recalcula todas las huellas en el servidor, fuera de PostgreSQL.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={verify} disabled={checking}>{checking ? 'Verificando…' : 'Verificar integridad'}</button>
      </section>

      <ErrorBanner error={checkError ?? error} onDismiss={() => setCheckError(null)} />
      {check && (check.integra ? (
        <div className="alert alert--ok" role="status">
          <div><strong>✓ Cadena íntegra.</strong> {check.total} eventos verificados · última huella <code>{short(check.ultimoHash)}</code> · {formatDate(check.verificadoEn)}</div>
        </div>
      ) : (
        <div className="alert alert--error" role="alert">
          <div><strong>✗ Alteración detectada en el evento #{check.primerError.secuencia}.</strong> {check.primerError.motivo}. Se verificaron {check.verificados} de {check.total} eventos antes del error.</div>
        </div>
      ))}

      {loading && !events ? <Loading /> : (
        <div className="panel table-wrap">
          <table className="table ledger__table">
            <thead><tr><th>#</th><th>Fecha</th><th>Evento</th><th>Detalle</th><th>Usuario</th><th>Huella anterior → huella</th></tr></thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.secuencia}>
                  <td className="mono">{e.secuencia}</td>
                  <td className="small">{formatDate(e.fecha)}</td>
                  <td className="small"><b>{EVENT_LABELS[e.evento] ?? e.evento}</b><div className="muted">{[e.incidente_codigo, e.activo_codigo, e.servicio_codigo].filter(Boolean).join(' · ')}</div></td>
                  <td className="small ledger__detail">{e.detalle}</td>
                  <td className="small">{e.usuario_nombre}</td>
                  <td className="mono small ledger__hash">{short(e.hash_anterior)} → <b>{short(e.hash)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
