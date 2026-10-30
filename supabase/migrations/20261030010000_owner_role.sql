-- =====================================================================
--  Rôle "owner" (propriétaire) au-dessus du gérant :
--    * voit et modifie tout, comme le manager
--    * seul à pouvoir ajouter / modifier / retirer des media buyers (rôles, emails)
--    * n'a pas d'onglet clients : absent de la COST SHEET
-- =====================================================================

alter table public.media_buyers drop constraint media_buyers_role_check;
alter table public.media_buyers add constraint media_buyers_role_check
  check (role in ('owner', 'manager', 'mediabuyer'));
comment on table public.media_buyers is
  'Un onglet de la sheet = un media buyer. role=manager voit tout ; role=owner voit tout et gère l''équipe.';

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.media_buyers where user_id = auth.uid() and role = 'owner')
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.media_buyers where user_id = auth.uid() and role in ('owner', 'manager'))
$$;

drop policy "buyers: gestion manager" on public.media_buyers;
create policy "buyers: gestion owner" on public.media_buyers for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

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
where mb.role <> 'owner'
group by mb.id, mb.name, mb.role;
