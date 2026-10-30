import { useMemo, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import NewSubscriptionDialog from '../components/NewSubscriptionDialog';
import SubscriptionPanel from '../components/SubscriptionPanel';
import { AlertChip, CampaignToggle, CategoryMark, Empty, Gauge, MoneyInput, Results, SaleChip } from '../components/ui';
import { SECTION_LABEL, STATUSES, STATUS_TONE } from '../lib/constants';
import { useApp, useLive } from '../lib/context';
import { dmy, relativeDays, usd } from '../lib/format';
import type { Section, Status, SubRow, Subscription } from '../lib/types';

const SECTIONS: Section[] = ['actif', 'ended', 'refund'];

export default function BuyerSheet() {
  const { id = '' } = useParams();
  const { api, buyers, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const section = (params.get('section') as Section) || 'actif';
  const openId = params.get('open');
  const [query, setQuery] = useState('');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [creating, setCreating] = useState(false);

  const buyer = buyers.find((b) => b.id === id);
  const live = useLive(() => api.listRows(id), [id]);

  const counts = useMemo(() => {
    const c: Record<Section, number> = { actif: 0, ended: 0, refund: 0 };
    for (const r of live.data ?? []) c[r.section]++;
    return c;
  }, [live.data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (live.data ?? []).filter((r) =>
      r.section === section &&
      (!onlyAlerts || r.alerts.length > 0) &&
      (!q || [r.client_name, r.client_brand, r.client_phone, r.current_campaign].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [live.data, section, query, onlyAlerts]);

  const open = (live.data ?? []).find((r) => r.id === openId) ?? null;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key); else next.set(key, value);
    setParams(next, { replace: key === 'open' && value === null });
  }

  async function save(row: SubRow, patch: Partial<Subscription>) {
    try {
      await api.updateSubscription(row.id, patch);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  }

  if (!buyer) return <Empty title="Onglet introuvable" />;
  if (live.error) return <Empty title="Impossible de charger l’onglet">{live.error}</Empty>;

  const totals = rows.reduce(
    (t, r) => ({ paid: t.paid + r.budget_initial, spent: t.spent + r.spent, rest: t.rest + r.budget_remaining, debt: t.debt + r.debt, daily: t.daily + r.daily_budget }),
    { paid: 0, spent: 0, rest: 0, debt: 0, daily: 0 },
  );

  return (
    <div className="page page--sheet">
      <header className="sheet-head">
        <div>
          <h1 className="sheet-head__title">{buyer.name}</h1>
          <p className="muted">{buyer.role === 'manager' ? 'Gérant des media buyers' : 'Media buyer'}</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>Ajouter un client</button>
      </header>

      <div className="sheet-tools">
        <nav className="tabs" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button key={s} type="button" className="tab" aria-current={s === section ? 'page' : undefined} onClick={() => setParam('section', s)}>
              {SECTION_LABEL[s]} <span className="tab__count num">{counts[s]}</span>
            </button>
          ))}
        </nav>
        <div className="sheet-tools__right">
          <label className="check">
            <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} /> Avec alerte
          </label>
          <input className="search" type="search" placeholder="Client, marque, téléphone…" aria-label="Rechercher"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {!live.data ? <div className="loading">Chargement…</div> : rows.length === 0 ? (
        <Empty title={query || onlyAlerts ? 'Aucun client ne correspond au filtre' : `Aucun client dans « ${SECTION_LABEL[section]} »`}>
          {section === 'actif' && !query && <button type="button" className="btn" onClick={() => setCreating(true)}>Ajouter un client</button>}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="grid grid--sheet">
            <thead>
              <tr>
                <th scope="col" className="sticky">Client et alertes</th>
                <th scope="col">Campagne</th>
                <th scope="col">Consommation</th>
                <th scope="col" className="r">Payé</th>
                <th scope="col" className="r">Dépensé</th>
                <th scope="col" className="r">$ / jour</th>
                <th scope="col">Période</th>
                <th scope="col">Vente</th>
                <th scope="col">Résultats</th>
                <th scope="col">Statut</th>
                <th scope="col" className="c">Fait</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.alerts.includes('ON SANS BUDGET') ? 'is-critical' : undefined}>
                  <th scope="row" className="sticky">
                    <button type="button" className="client-link" onClick={() => setParam('open', r.id)}>
                      <span className="client-link__name">{r.client_name}</span>
                      <span className="sub">{[r.client_brand, r.client_phone].filter(Boolean).join(' · ') || '—'}</span>
                    </button>
                    {r.alerts.length > 0 && <div className="alerts">{r.alerts.map((a) => <AlertChip key={a} code={a} />)}</div>}
                  </th>
                  <td><CampaignToggle value={r.campaign_status} onChange={(v) => save(r, { campaign_status: v })} /></td>
                  <td className="gauge-cell"><Gauge row={r} /></td>
                  <td className="r num" title={r.payment_proofs ?? undefined}>{usd(r.budget_initial)}</td>
                  <td className="r"><MoneyInput value={r.spent} label={`Dépensé ${r.client_name}`} onCommit={(n) => save(r, { spent: n })} /></td>
                  <td className="r"><MoneyInput value={r.daily_budget} width={72} label={`Budget quotidien ${r.client_name}`} onCommit={(n) => save(r, { daily_budget: n })} /></td>
                  <td>
                    <span className="num">{dmy(r.start_date, true)} → {dmy(r.end_date)}</span>
                    <div className={`sub${r.days_left !== null && r.days_left < 0 && r.section === 'actif' ? ' is-late' : ''}`}>
                      {r.plan ?? ''} {r.section === 'actif' ? relativeDays(r.days_left) : ''}
                    </div>
                  </td>
                  <td>
                    <SaleChip sale={r.sale_type} />
                    <div className="sub">{r.platforms.join(' + ')}</div>
                  </td>
                  <td><Results results={r.results} costPerResult={r.cost_per_result} /></td>
                  <td>
                    <div className="status-cell">
                      <select className="chip-select" aria-label={`Statut ${r.client_name}`} value={r.status}
                        style={{ '--chip-ink': STATUS_TONE[r.status].ink, '--chip-wash': STATUS_TONE[r.status].wash } as CSSProperties}
                        onChange={(e) => save(r, { status: e.target.value as Status })}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <CategoryMark category={r.category} />
                    </div>
                  </td>
                  <td className="c">
                    <input type="checkbox" aria-label={`Fait ${r.client_name}`} checked={r.done} onChange={(e) => save(r, { done: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="sticky">Total ({rows.length})</th>
                <td />
                <td className="num">
                  <strong>{usd(totals.rest)}</strong>
                  <div className="sub">dont dettes {usd(totals.debt)}</div>
                </td>
                <td className="r num">{usd(totals.paid)}</td>
                <td className="r num">{usd(totals.spent)}</td>
                <td className="r num">{usd(totals.daily)}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {open && <SubscriptionPanel row={open} onClose={() => setParam('open', null)} />}
      {creating && (
        <NewSubscriptionDialog
          defaultBuyerId={id}
          onClose={() => setCreating(false)}
          onCreated={(newId) => { setCreating(false); setParam('open', newId); }}
        />
      )}
    </div>
  );
}
