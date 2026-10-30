import type { CSSProperties, ReactNode } from 'react';
import { ALERTS, CAMPAIGN_TONE, CATEGORY_LABEL, RESULT_TYPES, SALE_TONE, STATUS_TONE, type Tone } from '../lib/constants';
import { dec1, int, usd } from '../lib/format';
import type { AlertCode, Status, SubRow } from '../lib/types';

export function Chip({ tone, children, title, strong }: { tone?: Tone; children: ReactNode; title?: string; strong?: boolean }) {
  const style = tone ? ({ '--chip-ink': tone.ink, '--chip-wash': tone.wash } as CSSProperties) : undefined;
  return <span className={`chip${strong ? ' chip--strong' : ''}`} style={style} title={title}>{children}</span>;
}

export const StatusChip = ({ status }: { status: Status }) => <Chip tone={STATUS_TONE[status]}>{status}</Chip>;
export const SaleChip = ({ sale }: { sale: string | null }) => (sale ? <Chip tone={SALE_TONE[sale]}>{sale}</Chip> : <span className="muted">—</span>);
export const AlertChip = ({ code }: { code: AlertCode }) => (
  <Chip tone={ALERTS[code].tone} title={ALERTS[code].why} strong={code === 'ON SANS BUDGET'}>{code}</Chip>
);

export function CampaignToggle({ value, onChange, disabled }: { value: 'ON' | 'OFF'; onChange: (v: 'ON' | 'OFF') => void; disabled?: boolean }) {
  const tone = CAMPAIGN_TONE[value];
  return (
    <button
      type="button"
      className="toggle"
      aria-pressed={value === 'ON'}
      aria-label={`Campagne ${value}. Basculer`}
      disabled={disabled}
      style={{ '--chip-ink': tone.ink, '--chip-wash': tone.wash } as CSSProperties}
      onClick={() => onChange(value === 'ON' ? 'OFF' : 'ON')}
    >
      <span className="toggle__dot" />
      {value}
    </button>
  );
}

export function CategoryMark({ category }: { category: string | null }) {
  if (!category) return null;
  return <span className={`cat cat--${category}`} title={CATEGORY_LABEL[category]}>{category}</span>;
}

export function Results({ results, costPerResult }: { results: Record<string, number>; costPerResult: number | null }) {
  const entries = Object.entries(results ?? {}).filter(([, n]) => n !== 0);
  if (!entries.length) return <span className="muted">—</span>;
  return (
    <div className="results">
      {entries.map(([k, n]) => (
        <span key={k} className="results__item" title={RESULT_TYPES[k]?.label ?? k}>
          <Chip tone={RESULT_TYPES[k]?.tone}>{k}</Chip> <span className="num">{int(n)}</span>
        </span>
      ))}
      {costPerResult !== null && <span className="sub num">{usd(costPerResult)} / résultat</span>}
    </div>
  );
}

/**
 * Jauge de consommation : payé (rail) vs dépensé (remplissage).
 * Au-delà de 100 %, la partie en trop apparaît en rouge (= dette).
 */
export function Gauge({ row }: { row: Pick<SubRow, 'budget_initial' | 'spent' | 'campaign_status' | 'budget_remaining' | 'debt' | 'runway_days'> }) {
  const paid = row.budget_initial;
  const spent = row.spent;
  const base = Math.max(paid, spent, 0.01);
  const used = Math.min(spent, paid) / base;
  const over = Math.max(spent - paid, 0) / base;
  const state = row.debt > 0 ? 'debt' : paid > 0 && row.budget_remaining <= 5 ? 'low' : row.campaign_status === 'ON' ? 'on' : 'off';
  return (
    <div className={`gauge gauge--${state}`}>
      <div className="gauge__rail" role="img"
        aria-label={`${usd(spent)} dépensés sur ${usd(paid)} payés`}>
        <span className="gauge__used" style={{ width: `${used * 100}%` }} />
        {over > 0 && <span className="gauge__over" style={{ width: `${over * 100}%` }} />}
      </div>
      <div className="gauge__legend">
        <strong className="num">{row.debt > 0 ? `−${usd(row.debt)}` : usd(row.budget_remaining)}</strong>
        <span className="sub">
          {row.debt > 0 ? 'dette' : paid === 0 ? 'aucun paiement' : 'restant'}
          {row.campaign_status === 'ON' && row.runway_days !== null && row.budget_remaining > 0 && ` · ${dec1(row.runway_days)} j d’autonomie`}
        </span>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
    </div>
  );
}

export function MoneyInput({ value, onCommit, label, width = 92 }: { value: number; onCommit: (n: number) => void; label: string; width?: number }) {
  return (
    <input
      key={value}
      className="cell-input num"
      type="number"
      step="0.01"
      inputMode="decimal"
      aria-label={label}
      defaultValue={value.toFixed(2)}
      style={{ width }}
      onBlur={(e) => {
        const n = Math.round(Number(e.currentTarget.value.replace(',', '.')) * 100) / 100;
        if (Number.isFinite(n) && n !== value) onCommit(n);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = value.toFixed(2); e.currentTarget.blur(); } }}
    />
  );
}
