import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { ROLE_LABELS } from './constants.js';
import { ErrorBanner, Loading } from './components/common.jsx';
import Account from './components/Account.jsx';
import Dashboard from './components/Dashboard.jsx';
import EvidenceLibrary from './components/EvidenceLibrary.jsx';
import HeatMaps from './components/heatmaps/HeatMaps.jsx';
import IncidentDetail from './components/IncidentDetail.jsx';
import IncidentForm from './components/IncidentForm.jsx';
import IncidentList from './components/IncidentList.jsx';
import Login from './components/Login.jsx';
import PlanView from './components/PlanView.jsx';

// Los gráficos (Recharts) se descargan solo al abrir Analítica: el acceso inicial es más liviano.
const Analytics = lazy(() => import('./components/Analytics.jsx'));

const NAV = [
  { key: 'panel', label: 'Panel' },
  { key: 'mapa', label: 'Mapa de calor' },
  { key: 'incidentes', label: 'Incidentes' },
  { key: 'nuevo', label: 'Registrar' },
  { key: 'plan', label: 'Plan' },
  { key: 'evidencias', label: 'Evidencias' },
  { key: 'analitica', label: 'Analítica' },
];
const SECTIONS = new Set([...NAV.map((n) => n.key), 'cuenta']);

/** Enrutado por hash: permite enlaces directos (#/incidentes/3) sin dependencias extra. */
function parseHash(hash) {
  const [, section, id] = hash.replace(/^#/, '').split('/');
  const numericId = Number.parseInt(id ?? '', 10);
  if (section === 'incidentes' && numericId > 0) return { name: 'detalle', id: numericId };
  return { name: SECTIONS.has(section) ? section : 'panel' };
}

function viewToHash(view) {
  if (view.name === 'detalle') return `#/incidentes/${view.id}`;
  return view.name === 'panel' ? '#/' : `#/${view.name}`;
}

function useHashView() {
  const [view, setViewState] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setViewState(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const setView = (next) => { window.location.hash = viewToHash(next); };
  return [view, setView];
}

function UserMenu({ session, onAccount, onLogout }) {
  const { usuario } = session;
  const initials = usuario.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <div className="user-menu">
      <button type="button" className="user-menu__button" onClick={onAccount} title="Mi cuenta">
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="user-menu__text">
          <strong>{usuario.nombre}</strong>
          <small>{ROLE_LABELS[usuario.rol]}{usuario.mfa_activo ? ' · MFA ✓' : ''}</small>
        </span>
      </button>
      <button type="button" className="btn btn--sm btn--on-dark" onClick={onLogout}>Salir</button>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined: cargando · null: sin sesión
  const [users, setUsers] = useState([]);
  const [view, setView] = useHashView();
  const [error, setError] = useState(null);

  const loadSession = useCallback(async () => {
    try {
      setSession(await api.session());
    } catch (err) {
      if (err.status === 401) setSession(null);
      else setError(err);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    loadSession();
  }, [loadSession]);

  const canOperate = session && !session.mfaPendiente;

  useEffect(() => {
    if (!canOperate) return;
    api.users().then(setUsers).catch(setError);
  }, [canOperate]);

  const logout = async () => {
    await api.logout().catch(() => {});
    setSession(null);
    setUsers([]);
  };

  if (session === undefined) {
    return error ? <main className="content"><ErrorBanner error={error} /></main> : <main className="content"><Loading label="Conectando…" /></main>;
  }
  if (session === null) return <Login onLoggedIn={setSession} />;

  const currentUser = session.usuario;
  const effectiveView = session.mfaPendiente ? { name: 'cuenta' } : view;
  const openIncident = (id) => setView({ name: 'detalle', id });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <strong>Centro de Contingencia</strong>
            <small>Colonial Pipeline · Respuesta a ransomware</small>
          </div>
        </div>

        <nav className="nav" aria-label="Secciones">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={effectiveView.name === item.key || (item.key === 'incidentes' && effectiveView.name === 'detalle') ? 'nav__item nav__item--active' : 'nav__item'}
              onClick={() => setView({ name: item.key })}
              disabled={session.mfaPendiente}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <UserMenu session={session} onAccount={() => setView({ name: 'cuenta' })} onLogout={logout} />
      </header>

      <main className="content">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {effectiveView.name === 'cuenta' && <Account session={session} onSessionChange={setSession} />}
        {canOperate && (
          <>
            {effectiveView.name === 'panel' && <Dashboard user={currentUser} onOpenIncident={openIncident} />}
            {effectiveView.name === 'incidentes' && <IncidentList onOpen={openIncident} />}
            {effectiveView.name === 'nuevo' && users.length > 0 && <IncidentForm users={users} currentUser={currentUser} onCreated={openIncident} />}
            {effectiveView.name === 'mapa' && <HeatMaps user={currentUser} onOpenIncident={openIncident} />}
            {effectiveView.name === 'plan' && <PlanView />}
            {effectiveView.name === 'evidencias' && <EvidenceLibrary user={currentUser} onOpenIncident={openIncident} />}
            {effectiveView.name === 'analitica' && <Suspense fallback={<Loading label="Cargando gráficos…" />}><Analytics user={currentUser} /></Suspense>}
            {effectiveView.name === 'detalle' && (
              <IncidentDetail id={effectiveView.id} users={users} user={currentUser} onBack={() => setView({ name: 'incidentes' })} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
