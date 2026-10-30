import { useState } from 'react';
import type { Api } from '../lib/api';

export default function Login({ api }: { api: Api }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<void>, ok?: string) {
    setBusy(true); setMessage(null);
    try { await fn(); if (ok) setMessage({ kind: 'ok', text: ok }); }
    catch (e) { setMessage({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'signin') void act(() => api.auth.signIn(email, password));
        else void act(() => api.auth.signUp(email, password), 'Compte créé. Confirmez l’email reçu, puis connectez-vous.');
      }}>
        <p className="wordmark">ESOLUTIONS</p>
        <h1>{mode === 'signin' ? 'Connexion' : 'Créer un compte'}</h1>
        <p className="muted">Utilisez l’email enregistré pour votre onglet media buyer.</p>
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Mot de passe<input type="password" required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {message && <p className={`note note--${message.kind}`} role="status">{message.text}</p>}
        <button type="submit" className="btn btn--primary" disabled={busy}>{mode === 'signin' ? 'Se connecter' : 'Créer le compte'}</button>
        <div className="login__alt">
          <button type="button" className="btn btn--ghost" disabled={busy || !email}
            onClick={() => void act(() => api.auth.magicLink(email), 'Lien de connexion envoyé par email.')}>Recevoir un lien par email</button>
          <button type="button" className="btn btn--ghost" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null); }}>
            {mode === 'signin' ? 'Créer un compte' : 'J’ai déjà un compte'}
          </button>
        </div>
      </form>
    </main>
  );
}
