import { Link } from 'react-router-dom';
import { AlertChip, Chip, Empty } from '../components/ui';
import { ALERTS, ALERT_ORDER, CAMPAIGN_TONE } from '../lib/constants';
import { useApp, useLive } from '../lib/context';
import { dec1, int, longDate, relativeDays, usd } from '../lib/format';
import type { AlertCode, CostRow, SubRow } from '../lib/types';

/** Le chiffre qui compte pour chaque type d'alerte */
function keyFigure(code: AlertCode, r: SubRow) {
  switch (code) {
    case 'ON SANS BUDGET': return `${usd(r.daily_budget)}/jour sans budget`;
    case 'DETTE': return `${usd(r.debt)} à encaisser`;
    case 'ABONNEMENT EXPIRÉ': return `${relativeDays(r.days_left)}${r.budget_remaining > 0 ? `, ${usd(r.budget_remaining)} non dépensés` : ''}`;
    case 'PAYÉ NON LANCÉ': return `${usd(r.budget_initial)} payés, 0 dépensé`;
    case 'BUDGET INSUFFISANT': return `${dec1(r.runway_days)} j de budget pour ${r.days_left} j d’abonnement`;
    case 'LOW BUDGET': return `${usd(r.budget_remaining)} restant`;
    case 'BUDGET DORMANT': return `${usd(r.budget_remaining)} disponibles`;
  }
}

export default function Dashboard() {
  const { api, me } = useApp();
  const rows = useLive(() => api.listRows(), []);
  const cost = useLive(() => api.costSheet(), []);

  if (rows.error || cost.error) return <Empty title="Impossible de charger les données">{rows.error ?? cost.error}</Empty>;
  if (!rows.data || !cost.data) return <div className="loading">Chargement…</div>;

  const all = rows.data;
  // Une ligne apparaît dans son alerte la plus urgente uniquement
  const groups = new Map<AlertCode, SubRow[]>();
  for (const r of all) {
    const relevant = r.alerts.filter((a) => r.section === 'actif' || a === 'DETTE' || a === 'ON SANS BUDGET');
    if (!relevant.length) continue;
    const top = [...relevant].sort((a, b) => ALERTS[a].rank - ALERTS[b].rank)[0];
    groups.set(top, [...(groups.get(top) ?? []), r]);
  }
  const todo = ALERT_ORDER.filter((a) => groups.has(a));
  const total = todo.reduce((n, a) => n + groups.get(a)!.length, 0);

  return (
    <div className="page">
      <header className="page-head">
        <p className="page-head__date">{longDate()}</p>
        <h1 className="page-head__title">
          {total === 0 ? 'Rien d’urgent aujourd’hui' : `${total} dossier${total > 1 ? 's' : ''} à traiter`}
        </h1>
        {!me.isManager && me.buyer && <p className="muted">Vue limitée à l’onglet {me.buyer.name}.</p>}
      </header>

      <section className="queue" aria-label="À traiter">
        {todo.map((code) => {
          const list = groups.get(code)!;
          const sumDebt = code === 'DETTE' ? list.reduce((n, r) => n + r.debt, 0) : null;
          return (
            <article key={code} className={`queue-group queue-group--r${ALERTS[code].rank}`}>
              <header className="queue-group__head">
                <AlertChip code={code} />
                <h2>{ALERTS[code].title}</h2>
                <span className="queue-group__count num">{list.length}{sumDebt !== null && ` · ${usd(sumDebt)}`}</span>
              </header>
              <p className="queue-group__why">{ALERTS[code].why}</p>
              <ul className="queue-list">
                {list.map((r) => (
                  <li key={r.id}>
                    <Link to={`/buyer/${r.media_buyer_id}?section=${r.section}&open=${r.id}`} className="queue-item">
                      <span className="queue-item__client">{r.client_name}</span>
                      <span className="queue-item__brand">{r.client_brand ?? ''}</span>
                      <span className="queue-item__buyer">{r.media_buyer_name}{r.section !== 'actif' && ' · terminé'}</span>
                      <span className="queue-item__figure num">{keyFigure(code, r)}</span>
                      <Chip tone={CAMPAIGN_TONE[r.campaign_status]}>{r.campaign_status}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <CostSheet rows={cost.data} />
    </div>
  );
}

function CostSheet({ rows }: { rows: CostRow[] }) {
  const sum = (f: (r: CostRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const cols: { label: string; hint: string; get: (r: CostRow) => number; fmt?: (n: number) => string; sheet?: boolean }[] = [
    { label: 'Budget restant', hint: 'Chiffre de l’onglet COST SHEET : somme nette des clients actifs (dettes déduites)', get: (r) => r.budget_restant_net, sheet: true },
    { label: 'Argent client non dépensé', hint: 'Clients actifs : ce qui reste réellement en compte, sans compenser avec les dettes', get: (r) => r.solde_clients_actifs },
    { label: 'Dettes clients actifs', hint: 'Dépensé au-delà du payé', get: (r) => r.dettes_actives },
    { label: 'Soldes abonnements terminés', hint: 'Absent de la sheet : à rembourser ou à reporter', get: (r) => r.solde_clients_termines },
    { label: 'Dettes abonnements terminés', hint: 'Absent de la sheet : à encaisser', get: (r) => r.dettes_terminees },
    { label: 'Payé (actifs)', hint: 'Somme des BUDGET INITIAL des clients actifs', get: (r) => r.budget_initial },
    { label: 'Dépensé (actifs)', hint: 'Somme des DÉPENSÉ des clients actifs', get: (r) => r.depense },
    { label: 'Campagnes ON', hint: 'Toutes sections', get: (r) => r.nb_on, fmt: int },
    { label: '$ / jour ON', hint: 'Somme des budgets quotidiens des campagnes allumées', get: (r) => r.depense_jour_on },
    { label: 'Résultats', hint: 'Messages + leads + achats (les cellules « 2708 | 241 » sont comptées)', get: (r) => r.resultats, fmt: int },
  ];
  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <div className="ledger__head">
        <h2 id="ledger-title">COST SHEET</h2>
        <p className="muted">La première colonne reproduit la sheet ; les suivantes montrent ce qu’elle compense ou ne compte pas.</p>
      </div>
      <div className="table-wrap">
        <table className="grid grid--ledger">
          <thead>
            <tr>
              <th scope="col" className="sticky">Media buyer</th>
              {cols.map((c) => <th key={c.label} scope="col" title={c.hint} className={c.sheet ? 'is-sheet' : undefined}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.media_buyer_id}>
                <th scope="row" className="sticky">
                  <Link to={`/buyer/${r.media_buyer_id}`}>{r.media_buyer_name}</Link>
                  {r.role === 'manager' && <span className="sub"> gérant</span>}
                </th>
                {cols.map((c) => <td key={c.label} className={`num${c.sheet ? ' is-sheet' : ''}`}>{(c.fmt ?? usd)(c.get(r))}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sticky">Équipe</th>
              {cols.map((c) => <td key={c.label} className={`num${c.sheet ? ' is-sheet' : ''}`}>{(c.fmt ?? usd)(sum(c.get))}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
