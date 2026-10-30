/**
 * Mêmes règles que les vues SQL v_subscriptions / v_cost_sheet
 * (supabase/migrations/..._init.sql). Utilisé par le mode démo hors-ligne.
 */
import { LOW_BUDGET_THRESHOLD } from './constants';
import { daysBetween, round2 } from './format';
import type { AlertCode, Client, CostRow, MediaBuyer, Payment, SubRow, Subscription } from './types';

const CATEGORY: Record<string, string> = {
  'NEW': 'A', 'CREATIVE EN ATTENTE': 'B', 'ACTIF': 'C', 'ANALYTICS & OPTIMISATION': 'D', 'ENDING SOON': 'E',
};

export function computeRow(s: Subscription, client: Client, buyer: MediaBuyer, payments: Payment[], today: string): SubRow {
  const mine = payments.filter((p) => p.subscription_id === s.id).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  const budget = round2(mine.reduce((acc, p) => acc + p.amount, 0));
  const remaining = round2(budget - s.spent);
  const resultsTotal = Object.values(s.results ?? {}).reduce((acc, n) => acc + (Number(n) || 0), 0);
  const daysLeft = s.end_date ? daysBetween(today, s.end_date) : null;
  const runway = s.daily_budget > 0 ? Math.round((remaining / s.daily_budget) * 10) / 10 : null;
  const actif = s.section === 'actif';

  const alerts: (AlertCode | false)[] = [
    actif && remaining <= LOW_BUDGET_THRESHOLD && budget > 0 && 'LOW BUDGET',
    s.campaign_status === 'ON' && remaining <= 0 && 'ON SANS BUDGET',
    remaining < 0 && 'DETTE',
    actif && daysLeft !== null && daysLeft < 0 && 'ABONNEMENT EXPIRÉ',
    actif && budget > 0 && s.spent === 0 && !!s.start_date && daysBetween(s.start_date, today) > 3 && 'PAYÉ NON LANCÉ',
    s.campaign_status === 'ON' && s.daily_budget > 0 && remaining > 0 && daysLeft !== null && remaining / s.daily_budget < daysLeft && 'BUDGET INSUFFISANT',
    s.campaign_status === 'OFF' && actif && remaining > LOW_BUDGET_THRESHOLD && daysLeft !== null && daysLeft >= 0 && 'BUDGET DORMANT',
  ];

  return {
    ...s,
    client_name: client.name,
    client_code: client.code,
    client_phone: client.phone,
    client_brand: client.brand,
    media_buyer_name: buyer.name,
    budget_initial: budget,
    payment_proofs: mine.map((p) => p.proof_ref).filter(Boolean).join(' · ') || null,
    budget_remaining: remaining,
    results_total: resultsTotal,
    debt: Math.max(-remaining, 0),
    days_left: daysLeft,
    runway_days: runway,
    cost_per_result: resultsTotal > 0 ? round2(s.spent / resultsTotal) : null,
    category: CATEGORY[s.status.trim()] ?? null,
    alerts: alerts.filter((a): a is AlertCode => Boolean(a)),
  };
}

export function computeCostSheet(rows: SubRow[], buyers: MediaBuyer[]): CostRow[] {
  return buyers.map((b) => {
    const mine = rows.filter((r) => r.media_buyer_id === b.id);
    const act = mine.filter((r) => r.section === 'actif');
    const other = mine.filter((r) => r.section !== 'actif');
    const sum = (xs: SubRow[], f: (r: SubRow) => number) => round2(xs.reduce((acc, r) => acc + f(r), 0));
    return {
      media_buyer_id: b.id,
      media_buyer_name: b.name,
      role: b.role,
      budget_restant_net: sum(act, (r) => r.budget_remaining),
      budget_initial: sum(act, (r) => r.budget_initial),
      depense: sum(act, (r) => r.spent),
      solde_clients_actifs: sum(act, (r) => Math.max(r.budget_remaining, 0)),
      dettes_actives: sum(act, (r) => r.debt),
      solde_clients_termines: sum(other, (r) => Math.max(r.budget_remaining, 0)),
      dettes_terminees: sum(other, (r) => r.debt),
      nb_actifs: act.length,
      nb_on: mine.filter((r) => r.campaign_status === 'ON').length,
      depense_jour_on: sum(mine.filter((r) => r.campaign_status === 'ON'), (r) => r.daily_budget),
      resultats: sum(act, (r) => r.results_total),
      nb_alertes: act.filter((r) => r.alerts.length > 0).length,
    };
  });
}
