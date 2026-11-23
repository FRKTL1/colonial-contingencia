import { useState } from 'react';
import { api } from '../../api.js';
import {
  ELEMENT_STATE_LABELS, EVENT_LABELS, LINE_LABELS, VERIFICATION_LABELS, canOperateAsset, formatBarrels, formatDate,
} from '../../constants.js';
import { useAsync } from '../../useAsync.js';
import { ErrorBanner, NoteDialog, ServiceStateBadge } from '../common.jsx';
import SourceLinks from './SourceLinks.jsx';

/** Detalle de un tramo o sistema: datos publicados, fuente, aislamiento y verificación. */
export default function ElementDetail({ element, sources, places, user, onChanged, onClose, onStartRound }) {
  const history = useAsync(() => api.asset(element.id), [element.id, element.aislado, element.verificado_en]);
  const [dialog, setDialog] = useState(null); // 'aislar' | 'reconectar' | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canOperate = canOperateAsset(user, element);
  const isSegment = element.tipo === 'tramo';
  const route = isSegment ? [element.desde_codigo, ...element.paradas, element.hasta_codigo].map((c) => places[c]?.nombre ?? c) : [];

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
      await onChanged();
      await history.reload();
    } catch (err) {
      setError(err);
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel element-detail" aria-label={`Detalle de ${element.codigo}`}>
      <header className="element-detail__head">
        <div>
          <span className="element-detail__code">{element.codigo} · {isSegment ? LINE_LABELS[element.linea] : `Sistema ${element.red}`}</span>
          <h3>{element.nombre}</h3>
        </div>
        <button type="button" className="alert__close" onClick={onClose} aria-label="Cerrar detalle">×</button>
      </header>

      <dl className="element-detail__facts">
        {isSegment && <><dt>Recorrido</dt><dd>{route.join(' → ')}</dd></>}
        {isSegment && <><dt>Producto</dt><dd>{element.producto ?? <span className="muted">No publicado</span>}</dd></>}
        {isSegment && <><dt>Diámetro</dt><dd>{element.diametro_pulg ? `${element.diametro_pulg} pulgadas` : <span className="muted">No publicado</span>}</dd></>}
        {isSegment && <><dt>Capacidad</dt><dd>{formatBarrels(element.capacidad_bpd)}{element.capacidad_bpd ? ' (nominal)' : ''}</dd></>}
        <dt>Servicio</dt><dd>{element.servicio_codigo} <ServiceStateBadge estado={element.servicio_estado} /></dd>
        <dt>Estado</dt><dd><b>{ELEMENT_STATE_LABELS[element.estado]}</b>{element.bpdDetenidos ? ` · dejan de fluir ${formatBarrels(element.bpdDetenidos)}` : ''}</dd>
      </dl>
      <p className="small">{element.descripcion}</p>
      {element.hallazgo && <p className="element-detail__finding"><b>Hallazgo documentado:</b> {element.hallazgo}</p>}
      <SourceLinks keys={element.fuentes} sources={sources} />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {element.aislado ? (
        <div className="isolation isolation--on">
          <strong>⛔ {isSegment ? 'Aislado: bombeo detenido y válvulas cerradas' : 'Aislado: desconectado de la red'}</strong>
          <p className="small">{element.aislado_motivo}</p>
          <p className="muted small">{element.aislado_por_nombre} · {formatDate(element.aislado_en)}</p>
          {element.puedeLiberarse ? (
            <p className="small isolation__ok">✓ Verificado OK después del aislamiento: ya se puede {isSegment ? 'reiniciar' : 'reconectar'}.</p>
          ) : (
            <p className="small">Antes de {isSegment ? 'reiniciarlo' : 'reconectarlo'} debe pasar una ronda con todos los puntos confirmados.</p>
          )}
          <div className="isolation__actions">
            {!element.puedeLiberarse && (
              <button type="button" className="btn btn--sm" onClick={() => onStartRound({ alcance: 'aislados' })}>Ir a verificar</button>
            )}
            <button type="button" className="btn btn--sm btn--yes" disabled={!canOperate || !element.puedeLiberarse || busy}
              onClick={() => setDialog('reconectar')}>{isSegment ? 'Reiniciar tramo' : 'Reconectar'}</button>
          </div>
        </div>
      ) : (
        <div className="isolation">
          <p className="small muted">{isSegment ? 'Bombeo habilitado.' : 'Conectado a la red.'}</p>
          <button type="button" className="btn btn--sm btn--no" disabled={!canOperate || busy} onClick={() => setDialog('aislar')}>Aislar</button>
        </div>
      )}
      {!canOperate && <p className="hint">Solo el coordinador o el equipo de la red {element.red} pueden aislar o reconectar este elemento.</p>}

      <details className="element-detail__checklist">
        <summary>Qué se verifica antes de {isSegment ? 'reiniciar' : 'reconectar'} ({element.checklist.length} puntos)</summary>
        <ol>
          {element.checklist.map((c) => (
            <li key={c.texto}>{c.texto}<SourceLinks keys={c.fuentes} sources={sources} /></li>
          ))}
        </ol>
      </details>

      <div className="small">
        <b>Última verificación:</b>{' '}
        {element.verificacion_resultado
          ? <>{VERIFICATION_LABELS[element.verificacion_resultado]} · {element.verificado_por_nombre} · {formatDate(element.verificado_en)}{element.verificacion_nota ? ` · ${element.verificacion_nota}` : ''}</>
          : <span className="muted">nunca</span>}
      </div>

      {history.data?.historial?.length > 0 && (
        <ol className="timeline timeline--compact element-detail__history">
          {history.data.historial.slice(0, 5).map((h) => (
            <li key={h.id}>
              <span className="timeline__title">{EVENT_LABELS[h.evento] ?? h.evento}</span>
              <span className="small">{h.detalle}</span>
              <span className="muted small">{formatDate(h.fecha)} · {h.usuario_nombre}</span>
            </li>
          ))}
        </ol>
      )}

      <NoteDialog
        open={dialog === 'aislar'}
        title={`Aislar ${element.codigo}`}
        description={isSegment
          ? 'Se detiene el bombeo y se cierran las válvulas del tramo. No podrá reiniciarse sin una verificación OK.'
          : 'El sistema se desconecta de la red y no podrá reconectarse sin una verificación OK.'}
        label="Motivo" required minLength={10} confirmLabel="Aislar"
        onCancel={() => setDialog(null)}
        onConfirm={(motivo) => run(() => api.isolateAsset(element.id, motivo))}
      />
      <NoteDialog
        open={dialog === 'reconectar'}
        title={`${isSegment ? 'Reiniciar' : 'Reconectar'} ${element.codigo}`}
        description="Quedará registrado en la bitácora encadenada con tu usuario."
        label="Nota" confirmLabel={isSegment ? 'Reiniciar' : 'Reconectar'}
        onCancel={() => setDialog(null)}
        onConfirm={(nota) => run(() => api.releaseAsset(element.id, nota))}
      />
    </section>
  );
}
