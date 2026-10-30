import { createClient } from '@supabase/supabase-js';
import type { Api } from './api';
import type { Activity, Client, CostRow, MediaBuyer, Payment, SubRow } from './types';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string,
);

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// PostgREST peut renvoyer les numeric en texte selon la config : on normalise.
const NUMERIC_ROW = ['daily_budget', 'spent', 'budget_initial', 'budget_remaining', 'results_total', 'debt', 'runway_days', 'cost_per_result'];
const NUMERIC_COST = ['budget_restant_net', 'budget_initial', 'depense', 'solde_clients_actifs', 'dettes_actives', 'solde_clients_termines',
  'dettes_terminees', 'nb_actifs', 'nb_on', 'depense_jour_on', 'resultats', 'nb_alertes'];
function numbers<T extends object>(row: T, keys: string[]): T {
  const r = row as Record<string, unknown>;
  for (const k of keys) if (r[k] !== null && r[k] !== undefined) r[k] = Number(r[k]);
  return row;
}

export const supabaseApi: Api = {
  mode: 'supabase',

  async me() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return { userEmail: null, buyer: null, isManager: false };
    const buyer = must(await supabase.from('media_buyers').select('*').eq('user_id', user.id).maybeSingle()) as MediaBuyer | null;
    return { userEmail: user.email ?? null, buyer, isManager: buyer?.role === 'manager' || buyer?.role === 'owner' };
  },

  async listBuyers() {
    return must(await supabase.from('media_buyers').select('*').order('role').order('name')) as MediaBuyer[];
  },

  async costSheet() {
    const rows = must(await supabase.from('v_cost_sheet').select('*')) as CostRow[];
    return rows.map((r) => numbers(r, NUMERIC_COST));
  },

  async listRows(buyerId) {
    let q = supabase.from('v_subscriptions').select('*').order('client_name');
    if (buyerId) q = q.eq('media_buyer_id', buyerId);
    const rows = must(await q) as SubRow[];
    return rows.map((r) => numbers({ ...r, alerts: r.alerts ?? [] }, NUMERIC_ROW));
  },

  async listClients() {
    return must(await supabase.from('clients').select('*').order('name')) as Client[];
  },

  async payments(id) {
    const rows = must(await supabase.from('payments').select('*').eq('subscription_id', id).order('paid_at')) as Payment[];
    return rows.map((p) => numbers(p, ['amount']));
  },

  async activity(id) {
    return must(await supabase.from('activity_log').select('*').eq('subscription_id', id).order('changed_at', { ascending: false }).limit(50)) as Activity[];
  },

  async updateSubscription(id, patch) {
    must(await supabase.from('subscriptions').update(patch).eq('id', id).select('id'));
  },

  async updateClient(id, patch) {
    must(await supabase.from('clients').update(patch).eq('id', id).select('id'));
  },

  async createSubscription(input) {
    let clientId = input.client.id;
    if (!clientId) {
      const c = must(await supabase.from('clients')
        .insert({ name: input.client.name, phone: input.client.phone || null, brand: input.client.brand || null,
          code: input.client.name.match(/^(\d+(?:\/\d+)?)\s/)?.[1] ?? null })
        .select('id').single()) as { id: string };
      clientId = c.id;
    }
    const sub = must(await supabase.from('subscriptions').insert({
      client_id: clientId, media_buyer_id: input.media_buyer_id, section: 'actif', sale_type: input.sale_type,
      platforms: input.platforms, start_date: input.start_date, plan: input.plan, daily_budget: input.daily_budget,
      status: input.status, current_campaign: input.current_campaign, test_num: 'TEST 1',
    }).select('id').single()) as { id: string };
    if (input.payment && input.payment.amount) {
      must(await supabase.from('payments').insert({ subscription_id: sub.id, ...input.payment }).select('id'));
    }
    return sub.id;
  },

  async addPayment(input) {
    must(await supabase.from('payments').insert(input).select('id'));
  },

  async deletePayment(id) {
    must(await supabase.from('payments').delete().eq('id', id).select('id'));
  },

  async renew(input) {
    return must(await supabase.rpc('renew_subscription', {
      p_subscription_id: input.subscription_id, p_plan: input.plan, p_amount: input.amount,
      p_start_date: input.start_date, p_method: input.method, p_proof_ref: input.proof_ref,
    })) as string;
  },

  subscribe(onChange) {
    const channel = supabase.channel('cost-sheet-live');
    for (const table of ['subscriptions', 'payments', 'clients']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  },

  auth: {
    async isSignedIn() {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session);
    },
    onChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(Boolean(session)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
    },
    async magicLink(email) {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  },
};
