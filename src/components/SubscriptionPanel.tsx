import { useEffect, useState } from 'react';
import { PAYMENT_METHODS, PLANS, PLATFORMS, PRIORITIES, RESULT_TYPES, SALE_TYPES, SECTION_LABEL, STATUSES, TESTS } from '../lib/constants';
import { useApp, useLive } from '../lib/context';
import { dmy, todayISO, usd } from '../lib/format';
import type { Section, Status, SubRow, Subscription } from '../lib/types';
import { AlertChip, Gauge, StatusChip } from './ui';

type Draft = Pick<Subscription,
  'sale_type' | 'platforms' | 'start_date' | 'end_date' | 'plan' | 'daily_budget' | 'spent' | 'results' | 'campaign_status' |
  'test_num' | 'priority' | 'today_priority' | 'current_campaign' | 'campaign_proof' | 'status' | 'section' | 'last_report' | 'next_mission' | 'media_buyer_id'>;

const draftOf = (r: SubRow): Draft => ({
  sale_type: r.sale_type, platforms: r.platforms, start_date: r.start_date, end_date: r.end_date, plan: r.plan,
  daily_budget: r.daily_budget, spent: r.spent, results: r.results, campaign_status: r.campaign_status, test_num: r.test_num,
  priority: r.priority, today_priority: r.today_priority, current_campaign: r.current_campaign, campaign_proof: r.campaign_proof,
  status: r.status, section: r.section, last_report: r.last_report, next_mission: r.next_mission, media_buyer_id: r.media_buyer_id,
});

const FIELD_LABEL: Record<string, string> = {
  spent: 'Dépensé', daily_budget: 'Budget quotidien', campaign_status: 'Campagne', status: 'Statut', section: 'Section',
  done: 'Fait', start_date: 'Début', end_date: 'Fin', plan: 'Abonnement', results: 'Résultats', current_campaign: 'Campagne actuelle',
};

export default function SubscriptionPanel({ row, onClose }: { row: SubRow; onClose: () => void }) {
  const { api, me, buyers, notify } = useApp();
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const [client, setClient] = useState({ name: row.client_name, phone: row.client_phone ?? '', brand: row.client_brand ?? '' });
  const [busy, setBusy] = useState(false);
  const payments = useLive(() => api.payments(row.id), [row.id]);
  const activity = useLive(() => api.activity(row.id), [row.id]);

  useEffect(() => { setDraft(draftOf(row)); }, [row.id, row.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); notify(label); return true; } catch (e) { notify((e as Error).message, 'error'); return false; } finally { setBusy(false); }
  }

  const saveAll = () => run('Modifications enregistrées', async () => {
    await api.updateSubscription(row.id, draft);
    if (client.name !== row.client_name || client.phone !== (row.client_phone ?? '') || client.brand !== (row.client_brand ?? '')) {
      await api.updateClient(row.client_id, { name: client.name, phone: client.phone || null, brand: client.brand || null });
    }
  });

  const resultEntries = Object.entries(draft.results ?? {});

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <div>
            <h2 id="drawer-title">{row.client_name}</h2>
            <p className="muted">{row.client_brand ?? 'Marque non renseignée'} · {row.media_buyer_name} · {SECTION_LABEL[row.section]}</p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Fermer">Fermer</button>
        </header>

        <div className="drawer__body">
          <div className="drawer__summary">
            <Gauge row={row} />
            <div className="alerts">{row.alerts.map((a) => <AlertChip key={a} code={a} />)}<StatusChip status={row.status} /></div>
          </div>

          <section className="form-block">
            <h3>Abonnement</h3>
            <div className="form-grid">
              <label>Type de vente
                <select value={draft.sale_type ?? ''} onChange={(e) => set('sale_type', e.target.value || null)}>
                  <option value="">—</option>{SALE_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <fieldset className="inline-checks">
                <legend>Plateforme</legend>
                {PLATFORMS.map((p) => (
                  <label key={p} className="check">
                    <input type="checkbox" checked={draft.platforms.includes(p)}
                      onChange={(e) => set('platforms', e.target.checked ? [...draft.platforms, p] : draft.platforms.filter((x) => x !== p))} /> {p}
                  </label>
                ))}
              </fieldset>
              <label>Début<input type="date" value={draft.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} /></label>
              <label>Fin<input type="date" value={draft.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} /></label>
              <label>Type d’abonnement
                <select value={draft.plan ?? ''} onChange={(e) => set('plan', e.target.value || null)}>
                  <option value="">—</option>{PLANS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label>Budget quotidien ($)<input type="number" step="0.01" value={draft.daily_budget} onChange={(e) => set('daily_budget', Number(e.target.value))} /></label>
              <label>Dépensé ($)<input type="number" step="0.01" value={draft.spent} onChange={(e) => set('spent', Number(e.target.value))} /></label>
              <label>Campagne
                <select value={draft.campaign_status} onChange={(e) => set('campaign_status', e.target.value as 'ON' | 'OFF')}>
                  <option>ON</option><option>OFF</option>
                </select>
              </label>
              <label>Statut
                <select value={draft.status} onChange={(e) => set('status', e.target.value as Status)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Section
                <select value={draft.section} onChange={(e) => set('section', e.target.value as Section)}>
                  {(Object.keys(SECTION_LABEL) as Section[]).map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
                </select>
              </label>
              <label>Num test
                <select value={draft.test_num ?? ''} onChange={(e) => set('test_num', e.target.value || null)}>
                  <option value="">—</option>{TESTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Priorité
                <select value={draft.priority ?? ''} onChange={(e) => set('priority', e.target.value || null)}>
                  <option value="">—</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Aujourd’hui
                <select value={draft.today_priority ?? ''} onChange={(e) => set('today_priority', e.target.value || null)}>
                  <option value="">—</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              {me.isManager && (
                <label>Media buyer
                  <select value={draft.media_buyer_id} onChange={(e) => set('media_buyer_id', e.target.value)}>
                    {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
              )}
              <label className="span-2">Campagne actuelle<input value={draft.current_campaign ?? ''} onChange={(e) => set('current_campaign', e.target.value || null)} /></label>
              <label className="span-2">Preuve campagne<input value={draft.campaign_proof ?? ''} onChange={(e) => set('campaign_proof', e.target.value || null)} /></label>
              <label className="span-2">Dernier rapport<textarea rows={2} value={draft.last_report ?? ''} onChange={(e) => set('last_report', e.target.value || null)} /></label>
              <label className="span-2">Prochaine mission<textarea rows={2} value={draft.next_mission ?? ''} onChange={(e) => set('next_mission', e.target.value || null)} /></label>
            </div>

            <h4>Résultats (client potentiel)</h4>
            <div className="results-editor">
              {resultEntries.map(([k, n]) => (
                <div key={k} className="results-editor__row">
                  <select value={k} aria-label="Type de résultat" onChange={(e) => {
                    const next = { ...draft.results }; delete next[k]; next[e.target.value] = n; set('results', next);
                  }}>
                    {Object.entries(RESULT_TYPES).map(([code, def]) => <option key={code} value={code}>{code} · {def.label}</option>)}
                  </select>
                  <input type="number" value={n} aria-label={`Nombre ${k}`} onChange={(e) => set('results', { ...draft.results, [k]: Number(e.target.value) })} />
                  <button type="button" className="btn btn--ghost" onClick={() => { const next = { ...draft.results }; delete next[k]; set('results', next); }}>Retirer</button>
                </div>
              ))}
              <button type="button" className="btn btn--ghost" onClick={() => {
                const free = Object.keys(RESULT_TYPES).find((k) => !(k in draft.results)) ?? 'AUTRE';
                set('results', { ...draft.results, [free]: 0 });
              }}>Ajouter un type de résultat</button>
            </div>

            <h4>Client</h4>
            <div className="form-grid">
              <label className="span-2">Nom<input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></label>
              <label>Téléphone<input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} /></label>
              <label>Marque / produit<input value={client.brand} onChange={(e) => setClient({ ...client, brand: e.target.value })} /></label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={saveAll}>Enregistrer</button>
            </div>
          </section>

          <PaymentsBlock row={row} payments={payments.data ?? []} busy={busy} run={run} />
          {row.section === 'actif' && <RenewBlock row={row} busy={busy} run={run} onRenewed={onClose} />}

          <section className="form-block">
            <h3>Historique</h3>
            {!activity.data?.length ? <p className="muted">Aucune modification enregistrée.</p> : (
              <ol className="history">
                {activity.data.map((a) => (
                  <li key={a.id}>
                    <time className="sub">{new Date(a.changed_at).toLocaleString('fr-FR')}</time>
                    <span>{Object.entries(a.changes).map(([k, v]) => `${FIELD_LABEL[k] ?? k} : ${fmt(v.old)} → ${fmt(v.new)}`).join(' ; ')}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

type Run = (label: string, fn: () => Promise<unknown>) => Promise<boolean>;

function PaymentsBlock({ row, payments, busy, run }: { row: SubRow; payments: { id: string; amount: number; paid_at: string; method: string; proof_ref: string | null; note: string | null }[]; busy: boolean; run: Run }) {
  const { api } = useApp();
  const [p, setP] = useState({ amount: '', paid_at: todayISO(), method: 'CASH', proof_ref: '' });
  const total = payments.reduce((n, x) => n + x.amount, 0);
  return (
    <section className="form-block">
      <h3>Paiements <span className="sub num">budget initial = {usd(total)}</span></h3>
      {payments.length > 0 && (
        <table className="mini">
          <tbody>
            {payments.map((x) => (
              <tr key={x.id}>
                <td className="num">{dmy(x.paid_at)}</td>
                <td className={`num r${x.amount < 0 ? ' is-neg' : ''}`}>{usd(x.amount)}</td>
                <td>{x.method}</td>
                <td className="sub">{x.proof_ref ?? x.note ?? ''}</td>
                <td><button type="button" className="btn btn--ghost btn--xs" disabled={busy}
                  onClick={() => { if (confirm(`Supprimer le paiement de ${usd(x.amount)} ?`)) void run('Paiement supprimé', () => api.deletePayment(x.id)); }}>Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="form-grid form-grid--4" onSubmit={(e) => {
        e.preventDefault();
        const amount = Number(p.amount.replace(',', '.'));
        if (!amount) return;
        void run('Paiement ajouté', () => api.addPayment({ subscription_id: row.id, amount, paid_at: p.paid_at, method: p.method, proof_ref: p.proof_ref || null, note: null }))
          .then((ok) => { if (ok) setP({ ...p, amount: '', proof_ref: '' }); });
      }}>
        <label>Montant ($)<input inputMode="decimal" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} placeholder="ex. 50 ou −10" /></label>
        <label>Date<input type="date" value={p.paid_at} onChange={(e) => setP({ ...p, paid_at: e.target.value })} /></label>
        <label>Moyen
          <select value={p.method} onChange={(e) => setP({ ...p, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label>Preuve reçu<input value={p.proof_ref} onChange={(e) => setP({ ...p, proof_ref: e.target.value })} placeholder="réf. / capture" /></label>
        <div className="form-actions span-4">
          <button type="submit" className="btn" disabled={busy || !p.amount}>Ajouter le paiement</button>
          {row.debt > 0 && <span className="sub">Dette actuelle : {usd(row.debt)}</span>}
        </div>
      </form>
    </section>
  );
}

function RenewBlock({ row, busy, run, onRenewed }: { row: SubRow; busy: boolean; run: Run; onRenewed: () => void }) {
  const { api } = useApp();
  const [r, setR] = useState({ plan: row.plan ?? '1 MOIS', amount: '', start_date: todayISO(), method: 'CASH', proof_ref: '' });
  const carry = row.budget_remaining;
  return (
    <section className="form-block">
      <h3>Renouveler</h3>
      <p className="muted">
        L’abonnement actuel passe dans Terminés.{' '}
        {carry > 0 ? `Le solde de ${usd(carry)} est reporté sur le nouvel abonnement.` : carry < 0 ? `La dette de ${usd(-carry)} est déduite du nouveau budget.` : 'Aucun solde à reporter.'}
      </p>
      <form className="form-grid form-grid--4" onSubmit={(e) => {
        e.preventDefault();
        void run('Abonnement renouvelé', () => api.renew({
          subscription_id: row.id, plan: r.plan, amount: Number(r.amount.replace(',', '.')) || 0,
          start_date: r.start_date, method: r.method, proof_ref: r.proof_ref || null,
        })).then((ok) => { if (ok) onRenewed(); });
      }}>
        <label>Abonnement<select value={r.plan} onChange={(e) => setR({ ...r, plan: e.target.value })}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label>Nouveau paiement ($)<input inputMode="decimal" value={r.amount} onChange={(e) => setR({ ...r, amount: e.target.value })} /></label>
        <label>Début<input type="date" value={r.start_date} onChange={(e) => setR({ ...r, start_date: e.target.value })} /></label>
        <label>Moyen<select value={r.method} onChange={(e) => setR({ ...r, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="span-4">Preuve reçu<input value={r.proof_ref} onChange={(e) => setR({ ...r, proof_ref: e.target.value })} /></label>
        <div className="form-actions span-4"><button type="submit" className="btn" disabled={busy}>Renouveler l’abonnement</button></div>
      </form>
    </section>
  );
}
