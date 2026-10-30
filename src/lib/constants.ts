import type { AlertCode, Status } from './types';

/**
 * Couleurs reprises des listes déroulantes de la Google Sheet "COST"
 * (fond foncé / texte clair dans la sheet ; inversé ici pour des puces plus légères).
 */
export type Tone = { ink: string; wash: string };
const t = (ink: string, wash: string): Tone => ({ ink, wash });

export const STATUS_TONE: Record<Status, Tone> = {
  'NEW': t('#5C5D00', '#F4F5A6'),
  'CREATIVE EN ATTENTE': t('#5A3286', '#E5CFF2'),
  'ACTIF': t('#11734B', '#D4EDBC'),
  'ANALYTICS & OPTIMISATION': t('#0A53A8', '#BFE1F6'),
  'ENDING SOON': t('#0A1D91', '#FFD9A8'),
  'COST NEEDED': t('#9A3D00', '#FFD3B5'),
  'INACTIF': t('#3D3D3D', '#E5E5E5'),
  'REMBOURSEMENT': t('#B10202', '#FFCFC9'),
};

export const STATUSES = Object.keys(STATUS_TONE) as Status[];

export const CATEGORY_LABEL: Record<string, string> = {
  A: 'A · nouveau',
  B: 'B · créa en attente',
  C: 'C · actif',
  D: 'D · optimisation',
  E: 'E · fin proche',
};

export const CAMPAIGN_TONE: Record<'ON' | 'OFF', Tone> = {
  ON: t('#0A53A8', '#BFE1F6'),
  OFF: t('#473822', '#FFE5A0'),
};

export const SALE_TYPES = ['Par Message', 'Par Site', 'Formulaire Instantane', 'APPEL', 'Par Telephone'] as const;
export const SALE_TONE: Record<string, Tone> = {
  'Par Message': t('#5A3286', '#E5CFF2'),
  'Par Site': t('#0A53A8', '#BFE1F6'),
  'Formulaire Instantane': t('#11734B', '#D4EDBC'),
  'APPEL': t('#473822', '#FFE5A0'),
  'Par Telephone': t('#473822', '#FFE5A0'),
};

export const PLANS = ['1 MOIS', '3 MOIS', '6 MOIS', '12 MOIS'] as const;
export const PLAN_MONTHS: Record<string, number> = { '1 MOIS': 1, '3 MOIS': 3, '6 MOIS': 6, '12 MOIS': 12 };
export const PLATFORMS = ['META', 'TIKTOK'] as const;
export const TESTS = ['TEST 1', 'TEST 2', 'TEST 3', 'TEST 4'] as const;
export const PRIORITIES = ['URGENT', 'NORMAL'] as const;
export const PAYMENT_METHODS = ['CASH', 'BARIDIMOB', 'CCP', 'VIREMENT', 'REPORT', 'AUTRE'] as const;

/** TYPE DE CLIENT de la sheet : plateforme + objectif */
export const RESULT_TYPES: Record<string, { label: string; tone: Tone }> = {
  MC: { label: 'Messages (Meta)', tone: t('#11734B', '#D4EDBC') },
  ML: { label: 'Leads (Meta)', tone: t('#5A3286', '#E5CFF2') },
  MWP: { label: 'Site web (Meta)', tone: t('#215A6C', '#C6DBE1') },
  TL: { label: 'Leads (TikTok)', tone: t('#473822', '#FFE5A0') },
  TWP: { label: 'Site web (TikTok)', tone: t('#3D3D3D', '#E5E5E5') },
  AUTRE: { label: 'Non classé', tone: t('#3D3D3D', '#EEEEEE') },
};

export const SECTION_LABEL = { actif: 'Clients actifs', ended: 'Abonnements terminés', refund: 'Remboursements' } as const;

/** Seuil "LOW BUDGET" de la sheet : =IF(AND(O8<=5; J8>0); "LOW BUDGET"; "") */
export const LOW_BUDGET_THRESHOLD = 5;

/** Ordre de traitement + explication de chaque alerte */
export const ALERTS: Record<AlertCode, { rank: number; title: string; why: string; tone: Tone }> = {
  'ON SANS BUDGET': {
    rank: 1, title: 'Campagne allumée sans budget',
    why: 'Chaque jour de diffusion crée une dette. Couper la campagne ou encaisser un paiement.',
    tone: t('#FFFFFF', '#B10202'),
  },
  'DETTE': {
    rank: 2, title: 'Dettes à encaisser',
    why: 'Le client a consommé plus que ce qu’il a payé.',
    tone: t('#B10202', '#FFCFC9'),
  },
  'ABONNEMENT EXPIRÉ': {
    rank: 3, title: 'Abonnement expiré mais toujours dans Actifs',
    why: 'Renouveler l’abonnement ou le passer dans Terminés.',
    tone: t('#9A3D00', '#FFD3B5'),
  },
  'PAYÉ NON LANCÉ': {
    rank: 4, title: 'Payé mais jamais lancé',
    why: 'Le client a payé, aucune dépense depuis plus de 3 jours.',
    tone: t('#5A3286', '#E5CFF2'),
  },
  'BUDGET INSUFFISANT': {
    rank: 5, title: 'Le budget finira avant l’abonnement',
    why: 'Au rythme du budget quotidien, le solde s’épuise avant la date de fin.',
    tone: t('#0A1D91', '#FFD9A8'),
  },
  'LOW BUDGET': {
    rank: 6, title: 'LOW BUDGET (règle de la sheet)',
    why: `Budget restant ≤ ${LOW_BUDGET_THRESHOLD} $ : demander une recharge.`,
    tone: t('#473822', '#FFE5A0'),
  },
  'BUDGET DORMANT': {
    rank: 7, title: 'Budget disponible, campagne éteinte',
    why: 'Le client a de l’argent en compte et rien ne tourne.',
    tone: t('#3D3D3D', '#E5E5E5'),
  },
};
export const ALERT_ORDER = (Object.keys(ALERTS) as AlertCode[]).sort((a, b) => ALERTS[a].rank - ALERTS[b].rank);
