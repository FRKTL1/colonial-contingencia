import { useState } from 'react';
import Ledger from './Ledger.jsx';
import PipelineMap from './PipelineMap.jsx';
import Rounds from './Rounds.jsx';
import Sources from './Sources.jsx';

const TABS = [
  { key: 'red', label: 'Red del oleoducto' },
  { key: 'rondas', label: 'Rondas de verificación' },
  { key: 'bitacora', label: 'Bitácora' },
  { key: 'fuentes', label: 'Fuentes' },
];

/**
 * Funciones adaptadas del proyecto Rack · Operación a la red real de Colonial: mapa de calor
 * (aquí, por capacidad detenida de cada tramo), bloqueo en rojo (aislamiento de tramos y
 * sistemas), revisión de ubicaciones (rondas) y bitácora encadenada con SHA-256.
 */
export default function HeatMaps({ user, onOpenIncident }) {
  const [tab, setTab] = useState('red');
  // Desde un elemento aislado se puede abrir una ronda ya filtrada.
  const [roundRequest, setRoundRequest] = useState(null);

  const goToRound = (request) => {
    setRoundRequest(request);
    setTab('rondas');
  };

  return (
    <div className="heatmaps">
      <div className="page-head">
        <div>
          <h1>Mapa de calor de la red</h1>
          <p className="muted">Qué tramo está detenido, cuánto deja de fluir, qué está aislado y qué falta verificar antes de reiniciar.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Vistas del mapa">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={tab === t.key ? 'segmented__item segmented__item--active' : 'segmented__item'}
              onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'red' && <PipelineMap user={user} onStartRound={goToRound} />}
      {tab === 'rondas' && <Rounds user={user} request={roundRequest} onRequestHandled={() => setRoundRequest(null)} onOpenIncident={onOpenIncident} />}
      {tab === 'bitacora' && <Ledger />}
      {tab === 'fuentes' && <Sources />}
    </div>
  );
}
