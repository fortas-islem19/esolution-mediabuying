import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { Api } from './lib/api';
import { AppProvider, useLive } from './lib/context';
import type { Me, MediaBuyer } from './lib/types';
import BuyerSheet from './pages/BuyerSheet';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

type Toast = { id: number; text: string; kind: 'ok' | 'error' };

export default function App({ api, demo }: { api: Api; demo?: { hasData: boolean; reset: () => void } }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [buyers, setBuyers] = useState<MediaBuyer[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    void api.auth.isSignedIn().then(setSignedIn);
    return api.auth.onChange(setSignedIn);
  }, [api]);

  useEffect(() => {
    if (!signedIn) { setMe(null); return; }
    void Promise.all([api.me(), api.listBuyers()]).then(([m, b]) => { setMe(m); setBuyers(b); });
  }, [api, signedIn]);

  const notify = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 2500);
  }, []);

  if (signedIn === null) return <div className="loading">Chargement…</div>;
  if (!signedIn) return <Login api={api} />;
  if (!me) return <div className="loading">Chargement…</div>;
  // Build sans variables Supabase ni seed.json (ex. Vercel sans env vars) : expliquer au lieu de « Compte non rattaché »
  if (demo && !demo.hasData) {
    return (
      <main className="login">
        <div className="login__card">
          <p className="wordmark">ESOLUTIONS</p>
          <h1>Supabase non configuré</h1>
          <p>Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (fichier <code>.env</code>, ou
            variables d’environnement Vercel puis Redeploy). En local, <code>npm run sheet:demo</code> génère les données du mode démo.</p>
        </div>
      </main>
    );
  }
  if (!me.buyer) {
    return (
      <main className="login">
        <div className="login__card">
          <p className="wordmark">ESOLUTIONS</p>
          <h1>Compte non rattaché</h1>
          <p>Le compte {me.userEmail} n’est lié à aucun onglet media buyer. Le gérant doit renseigner cet email dans la table
            <code> media_buyers</code> (voir README), puis vous reconnecter.</p>
          <button type="button" className="btn" onClick={() => void api.auth.signOut()}>Se déconnecter</button>
        </div>
      </main>
    );
  }

  // L'owner n'a pas d'onglet clients : ni onglet, ni choix dans les listes « Media buyer »
  const team = buyers.filter((b) => b.role !== 'owner');
  const visible = me.isManager ? team : team.filter((b) => b.id === me.buyer!.id);

  return (
    <AppProvider value={{ api, me, buyers: team, notify }}>
      <BrowserRouter>
        <div className="shell">
          <Rail buyers={visible} me={me} api={api} demo={demo} />
          <main className="main">
            <Routes>
              <Route path="/" element={me.isManager ? <Dashboard /> : <Navigate to={`/buyer/${me.buyer.id}`} replace />} />
              <Route path="/buyer/:id" element={<BuyerSheet />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => <p key={t.id} className={`toast toast--${t.kind}`}>{t.text}</p>)}
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}

function Rail({ buyers, me, api, demo }: { buyers: MediaBuyer[]; me: Me; api: Api; demo?: { reset: () => void } }) {
  const cost = useLive(() => api.costSheet(), []);
  const alertsFor = (id: string) => cost.data?.find((c) => c.media_buyer_id === id)?.nb_alertes ?? 0;
  return (
    <nav className="rail" aria-label="Navigation">
      <p className="wordmark">ESOLUTIONS</p>
      {me.isManager && <NavLink to="/" end className="rail__link">Aujourd’hui</NavLink>}
      <p className="rail__group">Onglets</p>
      {buyers.map((b) => (
        <NavLink key={b.id} to={`/buyer/${b.id}`} className="rail__link">
          <span>{b.name}</span>
          {alertsFor(b.id) > 0 && <span className="rail__badge num" title="Clients actifs avec alerte">{alertsFor(b.id)}</span>}
        </NavLink>
      ))}
      <div className="rail__foot">
        {demo ? (
          <>
            <p className="sub">Mode démo : données de la sheet du 30/10/2026, modifications gardées dans ce navigateur.</p>
            <button type="button" className="btn btn--ghost btn--xs" onClick={demo.reset}>Revenir aux données de la sheet</button>
          </>
        ) : (
          <>
            <p className="sub">{me.userEmail}</p>
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => void api.auth.signOut()}>Se déconnecter</button>
          </>
        )}
      </div>
    </nav>
  );
}
