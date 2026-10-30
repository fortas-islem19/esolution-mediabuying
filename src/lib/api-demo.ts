/**
 * Mode démo : fonctionne sans Supabase, à partir de src/demo/seed.json
 * (généré depuis l'export CSV de la sheet avec `npm run sheet:demo`).
 * Les modifications sont gardées dans le navigateur (localStorage).
 */
import type { Api } from './api';
import { computeCostSheet, computeRow } from './compute';
import { PLAN_MONTHS } from './constants';
import { addMonths, todayISO } from './format';
import type { Activity, Client, MediaBuyer, Payment, Subscription } from './types';

interface Store {
  buyers: MediaBuyer[];
  clients: Client[];
  subscriptions: Subscription[];
  payments: Payment[];
  activity: Activity[];
}

const KEY = 'esolutions-demo-v1';
const seeds = import.meta.glob<{ default: Omit<Store, 'activity'> }>('../demo/seed.json');

let store: Store = { buyers: [], clients: [], subscriptions: [], payments: [], activity: [] };
const listeners = new Set<() => void>();
const uid = () => crypto.randomUUID();

async function load() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) { store = JSON.parse(saved) as Store; return; }
  } catch { /* stockage indisponible : on repart de la sheet */ }
  const loader = seeds['../demo/seed.json'];
  if (loader) {
    const mod = await loader();
    store = { ...structuredClone(mod.default), activity: [] };
  }
}
const ready = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ }
  setTimeout(() => listeners.forEach((l) => l()), 0);
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.location.reload();
}

export const hasDemoData = () => Boolean(seeds['../demo/seed.json']);

function rows() {
  const today = todayISO();
  const clients = new Map(store.clients.map((c) => [c.id, c]));
  const buyers = new Map(store.buyers.map((b) => [b.id, b]));
  return store.subscriptions
    .filter((s) => clients.has(s.client_id) && buyers.has(s.media_buyer_id))
    .map((s) => computeRow(s, clients.get(s.client_id)!, buyers.get(s.media_buyer_id)!, store.payments, today))
    .sort((a, b) => a.client_name.localeCompare(b.client_name, 'fr', { numeric: true }));
}

function patchSubscription(id: string, patch: Partial<Subscription>) {
  const s = store.subscriptions.find((x) => x.id === id);
  if (!s) throw new Error('Abonnement introuvable');
  const changes: Activity['changes'] = {};
  for (const [k, v] of Object.entries(patch)) {
    const old = (s as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(old) !== JSON.stringify(v)) changes[k] = { old, new: v };
  }
  Object.assign(s, patch, { updated_at: new Date().toISOString() });
  if (!s.end_date && s.start_date && s.plan && PLAN_MONTHS[s.plan]) s.end_date = addMonths(s.start_date, PLAN_MONTHS[s.plan]);
  if (Object.keys(changes).length) {
    store.activity.unshift({ id: Date.now(), subscription_id: id, changed_at: new Date().toISOString(), changed_by: null, changes });
  }
}

export const demoApi: Api = {
  mode: 'demo',

  async me() {
    await ready;
    const manager = store.buyers.find((b) => b.role === 'manager') ?? null;
    return { userEmail: null, buyer: manager, isManager: true };
  },
  async listBuyers() { await ready; return [...store.buyers]; },
  async costSheet() { await ready; return computeCostSheet(rows(), store.buyers); },
  async listRows(buyerId) { await ready; return rows().filter((r) => !buyerId || r.media_buyer_id === buyerId); },
  async listClients() { await ready; return [...store.clients].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })); },
  async payments(id) { await ready; return store.payments.filter((p) => p.subscription_id === id).sort((a, b) => a.paid_at.localeCompare(b.paid_at)); },
  async activity(id) { await ready; return store.activity.filter((a) => a.subscription_id === id); },

  async updateSubscription(id, patch) { patchSubscription(id, patch); save(); },

  async updateClient(id, patch) {
    const c = store.clients.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
    save();
  },

  async createSubscription(input) {
    let clientId = input.client.id;
    if (!clientId) {
      clientId = uid();
      store.clients.push({ id: clientId, code: input.client.name.match(/^(\d+(?:\/\d+)?)\s/)?.[1] ?? null, name: input.client.name,
        phone: input.client.phone || null, brand: input.client.brand || null, notes: null });
    }
    const id = uid();
    const end = input.start_date && input.plan && PLAN_MONTHS[input.plan] ? addMonths(input.start_date, PLAN_MONTHS[input.plan]) : null;
    store.subscriptions.push({
      id, client_id: clientId, media_buyer_id: input.media_buyer_id, section: 'actif', sale_type: input.sale_type,
      platforms: input.platforms, start_date: input.start_date, end_date: end, plan: input.plan, campaign_proof: null,
      daily_budget: input.daily_budget, spent: 0, results: {}, campaign_status: 'OFF', test_num: 'TEST 1', priority: null,
      today_priority: null, done: false, current_campaign: input.current_campaign, status: input.status, last_report: null,
      next_mission: null, updated_at: new Date().toISOString(),
    });
    if (input.payment && input.payment.amount) store.payments.push({ id: uid(), subscription_id: id, note: null, ...input.payment });
    save();
    return id;
  },

  async addPayment(input) { store.payments.push({ id: uid(), ...input }); save(); },
  async deletePayment(id) { store.payments = store.payments.filter((p) => p.id !== id); save(); },

  async renew(input) {
    const old = store.subscriptions.find((s) => s.id === input.subscription_id);
    if (!old) throw new Error('Abonnement introuvable');
    const paid = store.payments.filter((p) => p.subscription_id === old.id).reduce((a, p) => a + p.amount, 0);
    const rest = Math.round((paid - old.spent) * 100) / 100;
    const id = uid();
    store.subscriptions.push({
      ...old, id, section: 'actif', start_date: input.start_date, plan: input.plan,
      end_date: PLAN_MONTHS[input.plan] ? addMonths(input.start_date, PLAN_MONTHS[input.plan]) : null,
      spent: 0, results: {}, status: 'ACTIF', done: false, last_report: null, next_mission: null,
      updated_at: new Date().toISOString(),
    });
    if (rest !== 0) {
      store.payments.push(
        { id: uid(), subscription_id: old.id, amount: -rest, paid_at: input.start_date, method: 'REPORT', proof_ref: null, note: 'Solde reporté sur le renouvellement' },
        { id: uid(), subscription_id: id, amount: rest, paid_at: input.start_date, method: 'REPORT', proof_ref: null, note: 'Solde reporté de l’abonnement précédent' },
      );
    }
    if (input.amount) {
      store.payments.push({ id: uid(), subscription_id: id, amount: input.amount, paid_at: input.start_date, method: input.method, proof_ref: input.proof_ref, note: null });
    }
    patchSubscription(old.id, { section: 'ended', status: 'INACTIF', campaign_status: 'OFF' });
    save();
    return id;
  },

  subscribe(onChange) {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  },

  auth: {
    async isSignedIn() { return true; },
    onChange() { return () => {}; },
    async signIn() {},
    async signUp() {},
    async magicLink() {},
    async signOut() {},
  },
};
