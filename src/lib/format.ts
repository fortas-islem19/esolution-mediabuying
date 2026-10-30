const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** 3106.92 -> "3 106,92 $" (même rendu que la sheet) */
export const usd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${nf.format(n)} $`);
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const dec1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : nf1.format(n));
export const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : nf0.format(n));

/** "2026-10-12" -> "12/10/2026" */
export function dmy(iso: string | null | undefined, short = false) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);
}

export function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export function relativeDays(n: number | null) {
  if (n === null) return '';
  if (n === 0) return 'se termine aujourd’hui';
  if (n > 0) return `${n} j restant${n > 1 ? 's' : ''}`;
  return `expiré depuis ${-n} j`;
}

export const longDate = (d = new Date()) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export const round2 = (n: number) => Math.round(n * 100) / 100;
