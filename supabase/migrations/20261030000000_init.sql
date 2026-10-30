-- =====================================================================
--  ESOLUTIONS — Media buying : schéma Supabase
--  Reproduit la logique de la Google Sheet "COST" :
--    * onglet par media buyer (ISLEM, SAMIR, ...)  -> table media_buyers
--    * sections ACTIF CLIENT / ENDED SUB / CLIENT REMBOURSEMENT -> subscriptions.section
--    * BUDGET RESTANT = BUDGET INITIAL - DEPENSÉ
--    * DETTE          = SI(RESTANT < 0 ; -RESTANT ; 0)
--    * ALERT SYSTEM   = "LOW BUDGET" si RESTANT <= 5 ET BUDGET INITIAL > 0
--    * CATEGORIE      = NEW->A, CREATIVE EN ATTENTE->B, ACTIF->C, ANALYTICS & OPTIMISATION->D, ENDING SOON->E
--    * COST SHEET     = somme du BUDGET RESTANT par media buyer + total équipe
--  Améliorations : BUDGET INITIAL = somme des paiements (preuves de reçu),
--  résultats numériques par type (MC, ML, MWP, TL, TWP), alertes supplémentaires,
--  historique des modifications, droits par media buyer (RLS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.media_buyers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  role        text not null default 'mediabuyer' check (role in ('manager', 'mediabuyer')),
  email       text unique,
  user_id     uuid unique references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.media_buyers is 'Un onglet de la sheet = un media buyer. role=manager voit tout.';

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  code        text,            -- numéro devant le nom dans la sheet ("116"), pas unique
  name        text not null,   -- "116 AMINE"
  phone       text,
  brand       text,            -- BRAND ( PRODUIT / SERVICES )
  notes       text,
  created_at  timestamptz not null default now()
);
create index clients_phone_idx on public.clients (phone);
create index clients_name_idx on public.clients (lower(name));

create table public.subscriptions (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  media_buyer_id   uuid not null references public.media_buyers (id),
  section          text not null default 'actif' check (section in ('actif', 'ended', 'refund')),
  sale_type        text check (sale_type in ('Par Message', 'Par Site', 'Formulaire Instantane', 'APPEL', 'Par Telephone')),
  platforms        text[] not null default '{META}',
  start_date       date,
  end_date         date,
  plan             text check (plan in ('1 MOIS', '3 MOIS', '6 MOIS', '12 MOIS')),
  campaign_proof   text,                                   -- PREUVE COMPAGNE
  daily_budget     numeric(12,2) not null default 0,       -- BUDGET QUOTIDIEN
  spent            numeric(12,2) not null default 0,       -- DEPENSEÉ
  results          jsonb not null default '{}'::jsonb,     -- CLIENT POTENTIEL par TYPE DE CLIENT, ex {"MC":2708,"ML":241}
  campaign_status  text not null default 'OFF' check (campaign_status in ('ON', 'OFF')),
  test_num         text check (test_num in ('TEST 1', 'TEST 2', 'TEST 3', 'TEST 4')),
  priority         text check (priority in ('URGENT', 'NORMAL')),
  today_priority   text check (today_priority in ('URGENT', 'NORMAL')),  -- colonne "Aujourd'hui"
  done             boolean not null default false,
  current_campaign text,                                   -- COMPAGNE ACTUELLE
  status           text not null default 'NEW' check (status in
                     ('NEW', 'CREATIVE EN ATTENTE', 'ACTIF', 'ANALYTICS & OPTIMISATION', 'ENDING SOON', 'COST NEEDED', 'INACTIF', 'REMBOURSEMENT')),
  last_report      text,                                   -- DERNIER RAPPORT
  next_mission     text,                                   -- PROCHAINE MISSION
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),     -- DERNIERE MODIFICATION
  updated_by       uuid references auth.users (id) on delete set null
);
create index subscriptions_buyer_idx on public.subscriptions (media_buyer_id, section);
create index subscriptions_client_idx on public.subscriptions (client_id);

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.subscriptions (id) on delete cascade,
  amount           numeric(12,2) not null,       -- négatif = remboursement / report de solde
  paid_at          date not null default current_date,
  method           text not null default 'CASH' check (method in ('CASH', 'BARIDIMOB', 'CCP', 'VIREMENT', 'REPORT', 'AUTRE')),
  proof_ref        text,                         -- PREUVE RECU (texte)
  proof_path       text,                         -- fichier dans le bucket Storage "proofs"
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null
);
create index payments_sub_idx on public.payments (subscription_id);

create table public.activity_log (
  id               bigint generated always as identity primary key,
  subscription_id  uuid not null references public.subscriptions (id) on delete cascade,
  changed_at       timestamptz not null default now(),
  changed_by       uuid references auth.users (id) on delete set null,
  changes          jsonb not null
);
create index activity_log_sub_idx on public.activity_log (subscription_id, changed_at desc);

-- ---------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------
create or replace function public.plan_months(p_plan text) returns int
language sql immutable as $$
  select case p_plan when '1 MOIS' then 1 when '3 MOIS' then 3 when '6 MOIS' then 6 when '12 MOIS' then 12 end
$$;

-- Seuil de l'alerte LOW BUDGET (5 $ dans la sheet)
create or replace function public.low_budget_threshold() returns numeric
language sql immutable as $$ select 5::numeric $$;

create or replace function public.my_buyer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.media_buyers where user_id = auth.uid() limit 1
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.media_buyers where user_id = auth.uid() and role = 'manager')
$$;

-- updated_at / updated_by + date de fin calculée depuis TYPE D'ABONNEMENT
create or replace function public.subscriptions_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.end_date is null and new.start_date is not null and new.plan is not null then
    new.end_date := (new.start_date + make_interval(months => public.plan_months(new.plan)))::date;
  end if;
  return new;
end $$;

create trigger subscriptions_before_write
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_before_write();

-- Historique : chaque modification d'un abonnement est tracée (qui, quand, avant/après)
create or replace function public.subscriptions_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_changes jsonb;
begin
  select jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
    into v_changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value and n.key not in ('updated_at', 'updated_by');
  if v_changes is not null then
    insert into public.activity_log (subscription_id, changed_by, changes) values (new.id, auth.uid(), v_changes);
  end if;
  return new;
end $$;

create trigger subscriptions_log
  after update on public.subscriptions
  for each row execute function public.subscriptions_log();

-- Lien automatique : un utilisateur qui s'inscrit avec l'email d'un media buyer est rattaché à son onglet
create or replace function public.link_media_buyer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.media_buyers set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;

create trigger on_auth_user_created_link_buyer
  after insert on auth.users
  for each row execute function public.link_media_buyer();

-- ---------------------------------------------------------------------
-- Vues (calculs de la sheet)
-- ---------------------------------------------------------------------
create or replace view public.v_subscriptions
with (security_invoker = true) as
with pay as (
  select subscription_id,
         sum(amount)                                   as budget_initial,
         string_agg(nullif(proof_ref, ''), ' · ' order by paid_at) as payment_proofs
  from public.payments
  group by subscription_id
), base as (
  select s.*,
         c.name   as client_name,
         c.code   as client_code,
         c.phone  as client_phone,
         c.brand  as client_brand,
         mb.name  as media_buyer_name,
         coalesce(p.budget_initial, 0)              as budget_initial,
         p.payment_proofs,
         coalesce(p.budget_initial, 0) - s.spent    as budget_remaining,
         (select coalesce(sum(value::numeric), 0) from jsonb_each_text(s.results) where value ~ '^-?\d+(\.\d+)?$') as results_total
  from public.subscriptions s
  join public.clients c       on c.id = s.client_id
  join public.media_buyers mb on mb.id = s.media_buyer_id
  left join pay p             on p.subscription_id = s.id
)
select b.*,
       greatest(-b.budget_remaining, 0)                                        as debt,
       case when b.end_date is not null then b.end_date - current_date end     as days_left,
       case when b.daily_budget > 0 then round(b.budget_remaining / b.daily_budget, 1) end as runway_days,
       case when b.results_total > 0 then round(b.spent / b.results_total, 2) end           as cost_per_result,
       case trim(b.status)
         when 'NEW' then 'A' when 'CREATIVE EN ATTENTE' then 'B' when 'ACTIF' then 'C'
         when 'ANALYTICS & OPTIMISATION' then 'D' when 'ENDING SOON' then 'E'
       end                                                                     as category,
       array_remove(array[
         -- règle identique à la sheet
         case when b.section = 'actif' and b.budget_remaining <= public.low_budget_threshold() and b.budget_initial > 0 then 'LOW BUDGET' end,
         -- nouvelles alertes
         case when b.campaign_status = 'ON' and b.budget_remaining <= 0 then 'ON SANS BUDGET' end,
         case when b.budget_remaining < 0 then 'DETTE' end,
         case when b.section = 'actif' and b.end_date < current_date then 'ABONNEMENT EXPIRÉ' end,
         case when b.section = 'actif' and b.budget_initial > 0 and b.spent = 0
                   and b.start_date < current_date - 3 then 'PAYÉ NON LANCÉ' end,
         case when b.campaign_status = 'ON' and b.daily_budget > 0 and b.budget_remaining > 0 and b.end_date is not null
                   and b.budget_remaining / b.daily_budget < (b.end_date - current_date) then 'BUDGET INSUFFISANT' end,
         case when b.campaign_status = 'OFF' and b.section = 'actif' and b.budget_remaining > public.low_budget_threshold()
                   and b.end_date >= current_date then 'BUDGET DORMANT' end
       ], null)                                                                as alerts
from base b;

-- COST SHEET : une ligne par media buyer
create or replace view public.v_cost_sheet
with (security_invoker = true) as
select mb.id   as media_buyer_id,
       mb.name as media_buyer_name,
       mb.role,
       -- chiffre identique à la sheet (section ACTIF, positifs et négatifs compensés)
       coalesce(sum(v.budget_remaining) filter (where v.section = 'actif'), 0)              as budget_restant_net,
       coalesce(sum(v.budget_initial)   filter (where v.section = 'actif'), 0)              as budget_initial,
       coalesce(sum(v.spent)            filter (where v.section = 'actif'), 0)              as depense,
       -- vision corrigée
       coalesce(sum(greatest(v.budget_remaining, 0)) filter (where v.section = 'actif'), 0) as solde_clients_actifs,
       coalesce(sum(v.debt)             filter (where v.section = 'actif'), 0)              as dettes_actives,
       coalesce(sum(greatest(v.budget_remaining, 0)) filter (where v.section <> 'actif'), 0) as solde_clients_termines,
       coalesce(sum(v.debt)             filter (where v.section <> 'actif'), 0)             as dettes_terminees,
       count(v.id) filter (where v.section = 'actif')                                       as nb_actifs,
       count(v.id) filter (where v.campaign_status = 'ON')                                  as nb_on,
       coalesce(sum(v.daily_budget) filter (where v.campaign_status = 'ON'), 0)             as depense_jour_on,
       coalesce(sum(v.results_total) filter (where v.section = 'actif'), 0)                 as resultats,
       count(v.id) filter (where cardinality(v.alerts) > 0 and v.section = 'actif')         as nb_alertes
from public.media_buyers mb
left join public.v_subscriptions v on v.media_buyer_id = mb.id
group by mb.id, mb.name, mb.role;

-- ---------------------------------------------------------------------
-- Actions (RPC)
-- ---------------------------------------------------------------------
-- Renouveler un abonnement : l'ancien passe en ENDED SUB, son solde (positif ou dette)
-- est reporté sur le nouveau, puis le nouveau paiement est ajouté.
create or replace function public.renew_subscription(
  p_subscription_id uuid,
  p_plan            text,
  p_amount          numeric,
  p_start_date      date default current_date,
  p_method          text default 'CASH',
  p_proof_ref       text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_old   public.subscriptions;
  v_rest  numeric;
  v_new   uuid;
begin
  select * into v_old from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Abonnement introuvable'; end if;

  select coalesce(sum(amount), 0) - v_old.spent into v_rest from public.payments where subscription_id = v_old.id;

  insert into public.subscriptions (client_id, media_buyer_id, section, sale_type, platforms, start_date, plan,
                                    daily_budget, campaign_status, test_num, priority, current_campaign, status)
  values (v_old.client_id, v_old.media_buyer_id, 'actif', v_old.sale_type, v_old.platforms, p_start_date, p_plan,
          v_old.daily_budget, v_old.campaign_status, v_old.test_num, v_old.priority, v_old.current_campaign, 'ACTIF')
  returning id into v_new;

  if v_rest <> 0 then
    insert into public.payments (subscription_id, amount, method, note)
    values (v_old.id, -v_rest, 'REPORT', 'Solde reporté sur le renouvellement'),
           (v_new,     v_rest, 'REPORT', 'Solde reporté de l''abonnement précédent');
  end if;
  if coalesce(p_amount, 0) <> 0 then
    insert into public.payments (subscription_id, amount, paid_at, method, proof_ref)
    values (v_new, p_amount, p_start_date, coalesce(p_method, 'CASH'), p_proof_ref);
  end if;

  update public.subscriptions set section = 'ended', status = 'INACTIF', campaign_status = 'OFF' where id = v_old.id;
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- Sécurité (RLS) : le manager voit tout, chaque media buyer voit son onglet
-- ---------------------------------------------------------------------
alter table public.media_buyers  enable row level security;
alter table public.clients       enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments      enable row level security;
alter table public.activity_log  enable row level security;

create policy "buyers: lecture" on public.media_buyers for select to authenticated using (true);
create policy "buyers: gestion manager" on public.media_buyers for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "clients: lecture" on public.clients for select to authenticated
  using (public.my_buyer_id() is not null);
create policy "clients: création" on public.clients for insert to authenticated
  with check (public.my_buyer_id() is not null);
create policy "clients: modification" on public.clients for update to authenticated
  using (public.my_buyer_id() is not null) with check (public.my_buyer_id() is not null);
create policy "clients: suppression manager" on public.clients for delete to authenticated
  using (public.is_manager());

create policy "abonnements: lecture" on public.subscriptions for select to authenticated
  using (public.is_manager() or media_buyer_id = public.my_buyer_id());
create policy "abonnements: création" on public.subscriptions for insert to authenticated
  with check (public.is_manager() or media_buyer_id = public.my_buyer_id());
create policy "abonnements: modification" on public.subscriptions for update to authenticated
  using (public.is_manager() or media_buyer_id = public.my_buyer_id())
  with check (public.is_manager() or media_buyer_id = public.my_buyer_id());
create policy "abonnements: suppression manager" on public.subscriptions for delete to authenticated
  using (public.is_manager());

create policy "paiements: accès via abonnement" on public.payments for all to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id
                 and (public.is_manager() or s.media_buyer_id = public.my_buyer_id())))
  with check (exists (select 1 from public.subscriptions s where s.id = subscription_id
                 and (public.is_manager() or s.media_buyer_id = public.my_buyer_id())));

create policy "historique: lecture" on public.activity_log for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id
                 and (public.is_manager() or s.media_buyer_id = public.my_buyer_id())));

grant select on public.v_subscriptions, public.v_cost_sheet to authenticated;
revoke all on public.v_subscriptions, public.v_cost_sheet from anon;
grant execute on function public.renew_subscription(uuid, text, numeric, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Temps réel (comme plusieurs personnes sur la même sheet)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.subscriptions, public.payments, public.clients;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Stockage des preuves de paiement (captures BaridiMob, reçus...)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false) on conflict (id) do nothing;
    execute $p$create policy "proofs: lecture" on storage.objects for select to authenticated using (bucket_id = 'proofs')$p$;
    execute $p$create policy "proofs: upload" on storage.objects for insert to authenticated with check (bucket_id = 'proofs')$p$;
  end if;
end $$;
