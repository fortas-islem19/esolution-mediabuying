export type Section = 'actif' | 'ended' | 'refund';
export type CampaignStatus = 'ON' | 'OFF';
export type Status =
  | 'NEW'
  | 'CREATIVE EN ATTENTE'
  | 'ACTIF'
  | 'ANALYTICS & OPTIMISATION'
  | 'ENDING SOON'
  | 'COST NEEDED'
  | 'INACTIF'
  | 'REMBOURSEMENT';

export type AlertCode =
  | 'ON SANS BUDGET'
  | 'DETTE'
  | 'ABONNEMENT EXPIRÉ'
  | 'PAYÉ NON LANCÉ'
  | 'BUDGET INSUFFISANT'
  | 'LOW BUDGET'
  | 'BUDGET DORMANT';

export interface MediaBuyer {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'mediabuyer';
  email: string | null;
  user_id?: string | null;
}

export interface Client {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  brand: string | null;
  notes: string | null;
}

export interface Subscription {
  id: string;
  client_id: string;
  media_buyer_id: string;
  section: Section;
  sale_type: string | null;
  platforms: string[];
  start_date: string | null;
  end_date: string | null;
  plan: string | null;
  campaign_proof: string | null;
  daily_budget: number;
  spent: number;
  results: Record<string, number>;
  campaign_status: CampaignStatus;
  test_num: string | null;
  priority: string | null;
  today_priority: string | null;
  done: boolean;
  current_campaign: string | null;
  status: Status;
  last_report: string | null;
  next_mission: string | null;
  updated_at: string;
}

/** Ligne de la vue v_subscriptions (= une ligne de la sheet avec ses formules) */
export interface SubRow extends Subscription {
  client_name: string;
  client_code: string | null;
  client_phone: string | null;
  client_brand: string | null;
  media_buyer_name: string;
  budget_initial: number;
  payment_proofs: string | null;
  budget_remaining: number;
  results_total: number;
  debt: number;
  days_left: number | null;
  runway_days: number | null;
  cost_per_result: number | null;
  category: string | null;
  alerts: AlertCode[];
}

export interface Payment {
  id: string;
  subscription_id: string;
  amount: number;
  paid_at: string;
  method: string;
  proof_ref: string | null;
  note: string | null;
}

export interface Activity {
  id: number;
  subscription_id: string;
  changed_at: string;
  changed_by: string | null;
  changes: Record<string, { old: unknown; new: unknown }>;
}

/** Ligne de la vue v_cost_sheet (onglet COST SHEET) */
export interface CostRow {
  media_buyer_id: string;
  media_buyer_name: string;
  role: string;
  budget_restant_net: number;
  budget_initial: number;
  depense: number;
  solde_clients_actifs: number;
  dettes_actives: number;
  solde_clients_termines: number;
  dettes_terminees: number;
  nb_actifs: number;
  nb_on: number;
  depense_jour_on: number;
  resultats: number;
  nb_alertes: number;
}

export interface NewSubscriptionInput {
  client: { id?: string; name: string; phone?: string | null; brand?: string | null };
  media_buyer_id: string;
  sale_type: string | null;
  platforms: string[];
  start_date: string | null;
  plan: string | null;
  daily_budget: number;
  status: Status;
  current_campaign: string | null;
  payment?: { amount: number; method: string; proof_ref: string | null; paid_at: string };
}

export interface RenewInput {
  subscription_id: string;
  plan: string;
  amount: number;
  start_date: string;
  method: string;
  proof_ref: string | null;
}

export interface Me {
  userEmail: string | null;
  buyer: MediaBuyer | null;
  isManager: boolean;
}
