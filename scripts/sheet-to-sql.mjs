#!/usr/bin/env node
/**
 * Convertit les onglets media buyer de la Google Sheet "COST" (export CSV)
 * en SQL prêt à exécuter dans Supabase (SQL Editor ou `supabase db reset`).
 *
 * Usage :
 *   node scripts/sheet-to-sql.mjs "ISLEM:data/islem.csv:manager" "SAMIR:data/samir.csv" > supabase/seed.sql
 *   node scripts/sheet-to-sql.mjs --reset ...   (vide clients/abonnements/paiements avant import)
 *
 * Chaque argument = NOM_DU_MEDIABUYER:chemin_du_csv[:manager]
 * Export CSV : Google Sheets > Fichier > Télécharger > CSV (onglet actif), un fichier par onglet.
 *
 * Les colonnes sont reconnues par leur NOM d'en-tête (l'ordre peut différer d'un onglet à l'autre).
 * Sections reconnues : "ACTIF CLIENT" -> actif, "ENDED SUB" -> ended, "CLIENT REMBOURSEMENT" -> refund.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const sources = args.filter((a) => !a.startsWith('--')).map((a) => {
  const [name, path, role] = a.split(':');
  if (!name || !path) throw new Error(`Argument invalide: ${a}`);
  return { name: name.trim().toUpperCase(), path, role: role === 'manager' ? 'manager' : 'mediabuyer' };
});
if (!sources.length) {
  console.error('Usage: node scripts/sheet-to-sql.mjs "ISLEM:data/islem.csv:manager" "SAMIR:data/samir.csv" > supabase/seed.sql');
  process.exit(1);
}

// ---------- helpers ----------
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const INVISIBLE = /[​-‏‪-‮⁠﻿]/g;
const clean = (s) => (s ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const sql = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'null' : String(v));

function money(s) {
  let t = clean(s).replace(/[^\d,.\-]/g, '');
  if (!t || t === '-') return 0;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function date(s) {
  const m = clean(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
function uuidFrom(key) {
  const h = createHash('sha1').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const pick = (v, allowed) => { const n = norm(v); return allowed.find((a) => norm(a) === n) ?? null; };

const SALE_TYPES = ['Par Message', 'Par Site', 'Formulaire Instantane', 'APPEL', 'Par Telephone'];
const PLANS = ['1 MOIS', '3 MOIS', '6 MOIS', '12 MOIS'];
const STATUSES = ['NEW', 'CREATIVE EN ATTENTE', 'ACTIF', 'ANALYTICS & OPTIMISATION', 'ENDING SOON', 'COST NEEDED', 'INACTIF', 'REMBOURSEMENT'];
const TESTS = ['TEST 1', 'TEST 2', 'TEST 3', 'TEST 4'];
const PRIORITIES = ['URGENT', 'NORMAL'];
const SECTIONS = { 'ACTIF CLIENT': 'actif', 'ENDED SUB': 'ended', 'CLIENT REMBOURSEMENT': 'refund' };

// en-tête normalisé -> champ
const HEADER_MAP = [
  [/^CLIENT$/, 'client'], [/^NUM TEL/, 'phone'], [/^BRAND/, 'brand'], [/^TYPE DE VENTE/, 'sale_type'],
  [/^PLATFORME/, 'platform'], [/^DATE DE DEBUT/, 'start'], [/^DATE DE FIN/, 'end'], [/^TYPE D.ABONNEMENT/, 'plan'],
  [/^BUDGET INITIAL/, 'budget'], [/^PREUVE RECU/, 'proof_payment'], [/^PREUVE COMPAGNE/, 'proof_campaign'],
  [/^BUDGET QUOTIDIEN/, 'daily'], [/^DEPENSE/, 'spent'], [/^CLIENT POTENTIEL/, 'results'], [/^TYPE DE CLIENT/, 'result_types'],
  [/^STATUT COMPAGNE/, 'campaign_status'], [/^STATUT( ABONNEMENT)?$/, 'status'], [/^NUM TEST/, 'test'],
  [/^PRIORITY/, 'priority'], [/^AUJOURD.HUI/, 'today'], [/^DONE/, 'done'], [/^COMPAGNE ACTUELLE/, 'current_campaign'],
  [/^DERNIER RAPPORT/, 'last_report'], [/^PROCHAINE MISSION/, 'next_mission'],
];

function parseResults(raw, typesRaw) {
  const text = clean(raw);
  if (!text) return {};
  const nums = /\$/.test(text) ? [money(text)] : text.split(/[|/]/).map((x) => Number.parseInt(x.replace(/\D/g, ''), 10)).filter(Number.isFinite);
  const types = clean(typesRaw).toUpperCase().split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const out = {};
  nums.forEach((n, i) => { const k = types[i] ?? (types.length === 1 && nums.length === 1 ? types[0] : 'AUTRE'); out[k] = (out[k] ?? 0) + n; });
  return Object.values(out).every((n) => n === 0) && !types.length ? {} : out;
}

// ---------- import ----------
const clients = new Map(); // key -> client
const subs = [];
const warnings = [];

for (const src of sources) {
  const rows = parseCSV(readFileSync(src.path, 'utf8'));
  const hIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'CLIENT') && r.some((c) => norm(c).startsWith('NUM TEL')));
  if (hIdx < 0) throw new Error(`En-tête introuvable dans ${src.path}`);
  const col = {};
  rows[hIdx].forEach((h, i) => { const n = norm(h); const hit = HEADER_MAP.find(([re]) => re.test(n)); if (hit && col[hit[1]] === undefined) col[hit[1]] = i; });
  const get = (r, f) => (col[f] === undefined ? '' : r[col[f]] ?? '');

  let section = 'actif';
  rows.forEach((r, i) => {
    const marker = SECTIONS[norm(r[1] ?? '')];
    if (marker) { section = marker; return; }
    if (i <= hIdx) return;
    const name = clean(get(r, 'client'));
    if (!name || norm(name) === 'TOTAL') return;
    if (/^CL[EI]{2}NT\s*\d+$/i.test(name)) return; // lignes modèle vides

    const phone = clean(get(r, 'phone'));
    const digits = phone.replace(/\D/g, '');
    const key = digits && !/^0+$/.test(digits) ? `p:${digits}` : `n:${norm(name)}`;
    const brand = clean(get(r, 'brand'));
    const placeholderBrand = /^BRAND\s*\d+$/i.test(brand);
    const code = (name.match(/^(\d+(?:\/\d+)?)\s/) ?? [])[1] ?? null;

    let c = clients.get(key);
    if (!c) { c = { id: uuidFrom(`client|${key}`), code, name, phone: digits && !/^0+$/.test(digits) ? phone : null, brand: placeholderBrand ? null : brand || null }; clients.set(key, c); }
    else if (!c.brand && !placeholderBrand && brand) c.brand = brand;

    const budget = money(get(r, 'budget'));
    const spent = money(get(r, 'spent'));
    const start = date(get(r, 'start'));
    const end = date(get(r, 'end'));
    if (placeholderBrand && !budget && !spent && !start && !end) return; // contact seul (archive)

    const statusRaw = norm(get(r, 'status')).replace('REMBOURSSEMENT', 'REMBOURSEMENT');
    const status = pick(statusRaw, STATUSES) ?? (statusRaw ? null : 'NEW');
    if (!status) warnings.push(`${src.name} ligne ${i + 1}: statut inconnu "${get(r, 'status')}" -> INACTIF`);
    const platRaw = norm(get(r, 'platform'));
    const platforms = [platRaw.includes('META') && 'META', platRaw.includes('TIKTOK') && 'TIKTOK'].filter(Boolean);

    subs.push({
      id: uuidFrom(`sub|${src.name}|${section}|${i}|${key}`),
      client_id: c.id, buyer: src.name, section,
      sale_type: pick(get(r, 'sale_type'), SALE_TYPES),
      platforms: platforms.length ? platforms : ['META'],
      start, end, plan: pick(get(r, 'plan'), PLANS),
      proof_payment: clean(get(r, 'proof_payment')), proof_campaign: clean(get(r, 'proof_campaign')),
      budget, daily: money(get(r, 'daily')), spent,
      results: parseResults(get(r, 'results'), get(r, 'result_types')),
      campaign_status: norm(get(r, 'campaign_status')) === 'ON' ? 'ON' : 'OFF',
      test: pick(get(r, 'test'), TESTS), priority: pick(get(r, 'priority'), PRIORITIES), today: pick(get(r, 'today'), PRIORITIES),
      done: norm(get(r, 'done')) === 'TRUE',
      current_campaign: clean(get(r, 'current_campaign')), status: status ?? 'INACTIF',
      last_report: clean(get(r, 'last_report')), next_mission: clean(get(r, 'next_mission')),
    });
  });
}

// ---------- JSON (mode démo du frontend, sans Supabase) ----------
if (args.includes('--json')) {
  const buyers = sources.map((s) => ({ id: uuidFrom(`buyer|${s.name}`), name: s.name, role: s.role, email: null }));
  const buyerId = Object.fromEntries(buyers.map((b) => [b.name, b.id]));
  const today = new Date().toISOString().slice(0, 10);
  const data = {
    generated_at: new Date().toISOString(),
    buyers,
    clients: [...clients.values()].map((c) => ({ ...c, notes: null })),
    subscriptions: subs.map((s) => ({
      id: s.id, client_id: s.client_id, media_buyer_id: buyerId[s.buyer], section: s.section, sale_type: s.sale_type,
      platforms: s.platforms, start_date: s.start, end_date: s.end, plan: s.plan, campaign_proof: s.proof_campaign || null,
      daily_budget: s.daily, spent: s.spent, results: s.results, campaign_status: s.campaign_status, test_num: s.test,
      priority: s.priority, today_priority: s.today, done: s.done, current_campaign: s.current_campaign || null, status: s.status,
      last_report: s.last_report || null, next_mission: s.next_mission || null, updated_at: new Date().toISOString(),
    })),
    payments: subs.filter((s) => s.budget !== 0).map((s) => ({
      id: uuidFrom(`pay|${s.id}`), subscription_id: s.id, amount: s.budget, paid_at: s.start ?? s.end ?? today,
      method: norm(s.proof_payment) === 'CASH' ? 'CASH' : 'AUTRE', proof_ref: s.proof_payment || null, note: 'Import sheet COST (BUDGET INITIAL)',
    })),
  };
  process.stdout.write(JSON.stringify(data, null, 1));
  console.error(`✔ JSON démo : ${data.clients.length} clients, ${data.subscriptions.length} abonnements`);
  process.exit(0);
}

// ---------- SQL ----------
const out = [];
out.push('-- Généré par scripts/sheet-to-sql.mjs à partir de la Google Sheet "COST"');
out.push(`-- ${new Date().toISOString()} — ${clients.size} clients, ${subs.length} abonnements`);
out.push('begin;');
if (reset) out.push('delete from public.payments;\ndelete from public.subscriptions;\ndelete from public.clients;');
for (const s of sources) {
  out.push(`insert into public.media_buyers (name, role) values (${sql(s.name)}, ${sql(s.role)}) on conflict (name) do update set role = excluded.role;`);
}
out.push('');
out.push('insert into public.clients (id, code, name, phone, brand) values');
out.push([...clients.values()].map((c) => `  (${sql(c.id)}, ${sql(c.code)}, ${sql(c.name)}, ${sql(c.phone)}, ${sql(c.brand)})`).join(',\n') +
  '\non conflict (id) do update set name = excluded.name, phone = excluded.phone, brand = coalesce(excluded.brand, public.clients.brand);');
out.push('');
for (const s of subs) {
  out.push(`insert into public.subscriptions (id, client_id, media_buyer_id, section, sale_type, platforms, start_date, end_date, plan, campaign_proof, daily_budget, spent, results, campaign_status, test_num, priority, today_priority, done, current_campaign, status, last_report, next_mission)
values (${sql(s.id)}, ${sql(s.client_id)}, (select id from public.media_buyers where name = ${sql(s.buyer)}), ${sql(s.section)}, ${sql(s.sale_type)}, '{${s.platforms.join(',')}}', ${sql(s.start)}, ${sql(s.end)}, ${sql(s.plan)}, ${sql(s.proof_campaign)}, ${num(s.daily)}, ${num(s.spent)}, ${sql(JSON.stringify(s.results))}, ${sql(s.campaign_status)}, ${sql(s.test)}, ${sql(s.priority)}, ${sql(s.today)}, ${s.done}, ${sql(s.current_campaign)}, ${sql(s.status)}, ${sql(s.last_report)}, ${sql(s.next_mission)})
on conflict (id) do nothing;`);
  if (s.budget !== 0) {
    const method = norm(s.proof_payment) === 'CASH' ? 'CASH' : 'AUTRE';
    out.push(`insert into public.payments (id, subscription_id, amount, paid_at, method, proof_ref, note) values (${sql(uuidFrom(`pay|${s.id}`))}, ${sql(s.id)}, ${num(s.budget)}, ${sql(s.start ?? s.end ?? new Date().toISOString().slice(0, 10))}, ${sql(method)}, ${sql(s.proof_payment)}, 'Import sheet COST (BUDGET INITIAL)') on conflict (id) do nothing;`);
  }
}
out.push('commit;');
process.stdout.write(out.join('\n') + '\n');
warnings.forEach((w) => console.error('⚠️ ', w));
console.error(`✔ ${clients.size} clients, ${subs.length} abonnements, ${subs.filter((s) => s.budget).length} paiements`);
