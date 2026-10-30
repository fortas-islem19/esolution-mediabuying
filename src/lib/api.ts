import type {
  Activity, Client, CostRow, Me, MediaBuyer, NewSubscriptionInput, Payment, RenewInput, SubRow, Subscription,
} from './types';

/** Couche d'accès aux données : Supabase en production, mémoire locale en mode démo. */
export interface Api {
  mode: 'supabase' | 'demo';
  me(): Promise<Me>;
  listBuyers(): Promise<MediaBuyer[]>;
  costSheet(): Promise<CostRow[]>;
  listRows(buyerId?: string): Promise<SubRow[]>;
  listClients(): Promise<Client[]>;
  payments(subscriptionId: string): Promise<Payment[]>;
  activity(subscriptionId: string): Promise<Activity[]>;
  updateSubscription(id: string, patch: Partial<Subscription>): Promise<void>;
  updateClient(id: string, patch: Partial<Client>): Promise<void>;
  createSubscription(input: NewSubscriptionInput): Promise<string>;
  addPayment(input: Omit<Payment, 'id'>): Promise<void>;
  deletePayment(id: string): Promise<void>;
  renew(input: RenewInput): Promise<string>;
  /** Appelé à chaque changement (temps réel) ; renvoie la fonction de désabonnement */
  subscribe(onChange: () => void): () => void;
  auth: {
    isSignedIn(): Promise<boolean>;
    onChange(cb: (signedIn: boolean) => void): () => void;
    signIn(email: string, password: string): Promise<void>;
    signUp(email: string, password: string): Promise<void>;
    magicLink(email: string): Promise<void>;
    signOut(): Promise<void>;
  };
}

export const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY),
);
