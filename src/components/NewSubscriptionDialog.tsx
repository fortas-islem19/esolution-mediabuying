import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PAYMENT_METHODS, PLANS, PLATFORMS, SALE_TYPES, STATUSES } from '../lib/constants';
import { useApp, useLive } from '../lib/context';
import { addMonths, dmy, todayISO } from '../lib/format';
import type { Status } from '../lib/types';

export default function NewSubscriptionDialog({ defaultBuyerId, onClose, onCreated }: {
  defaultBuyerId: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { api, me, buyers, notify } = useApp();
  const clients = useLive(() => api.listClients(), []);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    clientQuery: '', phone: '', brand: '', media_buyer_id: defaultBuyerId, sale_type: 'Par Message', platforms: ['META'] as string[],
    start_date: todayISO(), plan: '1 MOIS', daily_budget: '5', amount: '', method: 'CASH', proof_ref: '', status: 'NEW' as Status, current_campaign: '',
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Client existant : même nom exact, ou même numéro de téléphone
  const existing = useMemo(() => {
    const q = f.clientQuery.trim().toLowerCase();
    const digits = f.phone.replace(/\D/g, '');
    return (clients.data ?? []).find((c) =>
      (q && c.name.trim().toLowerCase() === q) || (digits.length >= 9 && c.phone?.replace(/\D/g, '') === digits)) ?? null;
  }, [clients.data, f.clientQuery, f.phone]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.clientQuery.trim()) return;
    setBusy(true);
    try {
      const amount = Number(f.amount.replace(',', '.')) || 0;
      const id = await api.createSubscription({
        client: existing ? { id: existing.id, name: existing.name } : { name: f.clientQuery.trim(), phone: f.phone || null, brand: f.brand || null },
        media_buyer_id: f.media_buyer_id, sale_type: f.sale_type, platforms: f.platforms, start_date: f.start_date || null,
        plan: f.plan, daily_budget: Number(f.daily_budget.replace(',', '.')) || 0, status: f.status,
        current_campaign: f.current_campaign || null,
        payment: amount ? { amount, method: f.method, proof_ref: f.proof_ref || null, paid_at: f.start_date || todayISO() } : undefined,
      });
      notify('Client ajouté');
      onCreated(id);
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const end = f.start_date && f.plan ? addMonths(f.start_date, Number(f.plan.split(' ')[0])) : null;

  return (
    <div className="drawer-backdrop drawer-backdrop--center" onClick={onClose}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="drawer__head">
          <h2 id="new-title">Ajouter un client</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Annuler</button>
        </header>
        <div className="form-grid">
          <label className="span-2">Client
            <input list="clients-list" required autoFocus value={f.clientQuery} placeholder="ex. 125 YACINE"
              onChange={(e) => set({ clientQuery: e.target.value })} />
            <datalist id="clients-list">
              {(clients.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.phone ?? ''}</option>)}
            </datalist>
          </label>
          {existing ? (
            <p className="span-2 note">Client existant : {existing.name}{existing.phone ? `, ${existing.phone}` : ''}. Le nouvel abonnement sera ajouté à sa fiche.</p>
          ) : (
            <>
              <label>Téléphone<input value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="0555 00 00 00" /></label>
              <label>Marque / produit<input value={f.brand} onChange={(e) => set({ brand: e.target.value })} /></label>
            </>
          )}
          {me.isManager && (
            <label>Media buyer
              <select value={f.media_buyer_id} onChange={(e) => set({ media_buyer_id: e.target.value })}>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
          <label>Type de vente
            <select value={f.sale_type} onChange={(e) => set({ sale_type: e.target.value })}>{SALE_TYPES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <fieldset className="inline-checks">
            <legend>Plateforme</legend>
            {PLATFORMS.map((p) => (
              <label key={p} className="check">
                <input type="checkbox" checked={f.platforms.includes(p)}
                  onChange={(e) => set({ platforms: e.target.checked ? [...f.platforms, p] : f.platforms.filter((x) => x !== p) })} /> {p}
              </label>
            ))}
          </fieldset>
          <label>Statut
            <select value={f.status} onChange={(e) => set({ status: e.target.value as Status })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label>Début<input type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></label>
          <label>Abonnement
            <select value={f.plan} onChange={(e) => set({ plan: e.target.value })}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select>
            {end && <span className="sub">Fin le {dmy(end)}</span>}
          </label>
          <label>Budget quotidien ($)<input inputMode="decimal" value={f.daily_budget} onChange={(e) => set({ daily_budget: e.target.value })} /></label>
          <label>Montant payé ($)<input inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="budget initial" /></label>
          <label>Moyen de paiement
            <select value={f.method} onChange={(e) => set({ method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label>Preuve reçu<input value={f.proof_ref} onChange={(e) => set({ proof_ref: e.target.value })} /></label>
          <label className="span-2">Campagne actuelle<input value={f.current_campaign} onChange={(e) => set({ current_campaign: e.target.value })} /></label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>Ajouter le client</button>
        </div>
      </form>
    </div>
  );
}
