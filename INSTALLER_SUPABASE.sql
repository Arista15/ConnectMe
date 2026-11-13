

-- ================================================================
-- Source : supabase\migrations\0001_schema.sql
-- ================================================================

-- =====================================================================
-- KBS Comptable — schéma principal (SYSCOHADA, multi-sites, USD/CDF)
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Profils & rôles
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'comptable' check (role in ('admin','comptable')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Création automatique du profil lors de l'invitation (métadonnées full_name / role)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Le rôle n'est jamais lu depuis les métadonnées modifiables par l'utilisateur :
  -- tout nouveau compte est 'comptable' ; l'administrateur promeut ensuite.
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'comptable'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Sites
-- ---------------------------------------------------------------------
create table public.sites (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9]{2,6}$'),
  name          text not null,
  city          text not null default '',
  sector        text not null check (sector in ('services','btp','transport')),
  access_code_hash text not null,
  usd_cdf_rate  numeric(14,4) not null check (usd_cdf_rate > 0),
  vat_rate      numeric(5,2) not null default 16.00,
  created_at    timestamptz not null default now()
);

create table public.site_rates (
  id          bigint generated always as identity primary key,
  site_id     uuid not null references public.sites(id) on delete cascade,
  rate        numeric(14,4) not null,
  set_by      uuid references public.profiles(id),
  set_at      timestamptz not null default now()
);

create table public.site_assignments (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  site_id  uuid not null references public.sites(id) on delete cascade,
  primary key (user_id, site_id)
);

create table public.site_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  site_id     uuid not null references public.sites(id) on delete cascade,
  opened_at   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '12 hours',
  closed_at   timestamptz
);
create index on public.site_sessions (user_id, site_id, expires_at);

create table public.site_counters (
  site_id  uuid not null references public.sites(id) on delete cascade,
  kind     text not null,
  year     int  not null,
  value    int  not null default 0,
  primary key (site_id, kind, year)
);

-- ---------------------------------------------------------------------
-- Plan comptable SYSCOHADA & journaux
-- ---------------------------------------------------------------------
create table public.accounts (
  code     text primary key check (code ~ '^[1-9][0-9]{1,7}$'),
  label    text not null,
  class    int  generated always as ((substr(code,1,1))::int) stored,
  sectors  text[] not null default '{}',   -- vide = commun à tous les secteurs
  active   boolean not null default true
);

create table public.journals (
  code   text primary key,
  label  text not null
);

create table public.entry_templates (
  id        bigint generated always as identity primary key,
  sector    text check (sector in ('services','btp','transport')),
  name      text not null,
  journal_code text not null references public.journals(code),
  lines     jsonb not null   -- [{account_code, side:'D'|'C', label}]
);

-- ---------------------------------------------------------------------
-- Tiers
-- ---------------------------------------------------------------------
create table public.customers (
  id        uuid primary key default gen_random_uuid(),
  site_id   uuid not null references public.sites(id) on delete cascade,
  name      text not null,
  email     text,
  phone     text,
  address   text,
  tax_id    text,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id        uuid primary key default gen_random_uuid(),
  site_id   uuid not null references public.sites(id) on delete cascade,
  name      text not null,
  email     text,
  phone     text,
  tax_id    text,
  default_account text references public.accounts(code),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Écritures
-- ---------------------------------------------------------------------
create table public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity,
  site_id       uuid not null references public.sites(id),
  journal_code  text not null references public.journals(code),
  entry_date    date not null,
  reference     text not null default '',   -- pièce justificative
  label         text not null,
  currency      text not null check (currency in ('USD','CDF')),
  exchange_rate numeric(14,4) not null check (exchange_rate > 0), -- CDF pour 1 USD
  source_type   text not null default 'manuel'
                check (source_type in ('manuel','facture_client','facture_fournisseur','paiement','annulation')),
  source_id     uuid,
  reverses_id   uuid references public.journal_entries(id),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index on public.journal_entries (site_id, entry_date);

create table public.entry_lines (
  id            bigint generated always as identity primary key,
  entry_id      uuid not null references public.journal_entries(id) on delete cascade,
  account_code  text not null references public.accounts(code),
  label         text not null default '',
  debit         numeric(18,2) not null default 0 check (debit >= 0),
  credit        numeric(18,2) not null default 0 check (credit >= 0),
  debit_usd     numeric(18,2) not null default 0,
  credit_usd    numeric(18,2) not null default 0,
  constraint entry_lines_one_side check (debit = 0 or credit = 0),
  -- les lignes d'écart de change n'ont qu'un montant en USD
  constraint entry_lines_nonzero check (debit > 0 or credit > 0 or debit_usd > 0 or credit_usd > 0)
);
create index on public.entry_lines (entry_id);
create index on public.entry_lines (account_code);

-- ---------------------------------------------------------------------
-- Factures clients
-- ---------------------------------------------------------------------
create table public.customer_invoices (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites(id),
  number        text not null unique,
  customer_id   uuid not null references public.customers(id),
  issue_date    date not null,
  due_date      date not null,
  currency      text not null check (currency in ('USD','CDF')),
  exchange_rate numeric(14,4) not null,
  vat_rate      numeric(5,2) not null default 0,
  subtotal      numeric(18,2) not null,
  vat_amount    numeric(18,2) not null,
  total         numeric(18,2) not null,
  amount_paid   numeric(18,2) not null default 0,
  status        text not null default 'emise' check (status in ('emise','partielle','payee','annulee')),
  notes         text,
  entry_id      uuid references public.journal_entries(id),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);

create table public.customer_invoice_lines (
  id            bigint generated always as identity primary key,
  invoice_id    uuid not null references public.customer_invoices(id) on delete cascade,
  description   text not null,
  quantity      numeric(14,3) not null check (quantity > 0),
  unit_price    numeric(18,2) not null check (unit_price >= 0),
  amount        numeric(18,2) not null,
  account_code  text not null references public.accounts(code)
);

-- ---------------------------------------------------------------------
-- Factures fournisseurs (reçus analysés puis validés)
-- ---------------------------------------------------------------------
create table public.supplier_invoices (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites(id),
  supplier_id     uuid references public.suppliers(id),
  supplier_name   text not null default '',
  reference       text not null default '',
  invoice_date    date not null,
  due_date        date,
  currency        text not null check (currency in ('USD','CDF')),
  exchange_rate   numeric(14,4) not null,
  subtotal        numeric(18,2) not null default 0,
  vat_amount      numeric(18,2) not null default 0,
  total           numeric(18,2) not null default 0,
  amount_paid     numeric(18,2) not null default 0,
  expense_account text references public.accounts(code),
  status          text not null default 'brouillon'
                  check (status in ('brouillon','validee','partielle','payee','rejetee')),
  source_text     text,
  attachment_path text,
  ai_suggestion   jsonb,
  entry_id        uuid references public.journal_entries(id),
  created_by      uuid not null references public.profiles(id),
  validated_by    uuid references public.profiles(id),
  validated_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Trésorerie : caisses, banques, paiements, dépenses, recettes
-- ---------------------------------------------------------------------
create table public.treasury_accounts (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites(id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('caisse','banque')),
  account_code  text not null references public.accounts(code),
  currency      text not null check (currency in ('USD','CDF')),
  active        boolean not null default true
);

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  site_id              uuid not null references public.sites(id),
  kind                 text not null check (kind in ('reglement_client','reglement_fournisseur','depense','recette')),
  payment_date         date not null,
  amount               numeric(18,2) not null check (amount > 0),
  vat_amount           numeric(18,2) not null default 0,
  currency             text not null check (currency in ('USD','CDF')),
  exchange_rate        numeric(14,4) not null,
  treasury_account_id  uuid not null references public.treasury_accounts(id),
  customer_invoice_id  uuid references public.customer_invoices(id),
  supplier_invoice_id  uuid references public.supplier_invoices(id),
  supplier_id          uuid references public.suppliers(id),
  counterpart_account  text not null references public.accounts(code),
  label                text not null,
  reference            text not null default '',
  reconciled           boolean not null default false,
  reconciled_at        timestamptz,
  entry_id             uuid references public.journal_entries(id),
  created_by           uuid not null references public.profiles(id),
  created_at           timestamptz not null default now()
);
create index on public.payments (site_id, payment_date);

-- ---------------------------------------------------------------------
-- Historique d'audit
-- ---------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid references public.profiles(id),
  site_id    uuid references public.sites(id),
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'
);
create index on public.audit_log (site_id, at desc);

create table public.reminder_runs (
  id        bigint generated always as identity primary key,
  run_at    timestamptz not null default now(),
  sent      int not null default 0,
  details   jsonb
);


-- ================================================================
-- Source : supabase\migrations\0002_security_and_rpc.sql
-- ================================================================

-- =====================================================================
-- KBS Comptable — sécurité (RLS), accès par site, RPC comptables, états
-- Toutes les écritures comptables passent par des fonctions SECURITY DEFINER
-- qui vérifient l'accès au site, l'équilibre débit/crédit et journalisent l'audit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fonctions d'accès
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.is_assigned(p_site uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from site_assignments a join profiles p on p.id = a.user_id and p.active
    where a.user_id = auth.uid() and a.site_id = p_site);
$$;

-- Accès effectif : administrateur, ou comptable affecté ayant ouvert le site
-- avec son code d'accès depuis moins de 12 h (et sans s'être déconnecté).
create or replace function public.has_site_access(p_site uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from site_sessions s
    join site_assignments a on a.user_id = s.user_id and a.site_id = s.site_id
    join profiles p on p.id = s.user_id and p.active
    where s.user_id = auth.uid() and s.site_id = p_site
      and s.closed_at is null and s.expires_at > now());
$$;

create or replace function public._require_site(p_site uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non authentifié' using errcode = '28000'; end if;
  if not public.has_site_access(p_site) then
    raise exception 'Accès au site refusé ou session de site expirée' using errcode = '42501';
  end if;
end $$;

create or replace function public._require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.sites                  enable row level security;
alter table public.site_rates             enable row level security;
alter table public.site_assignments       enable row level security;
alter table public.site_sessions          enable row level security;
alter table public.site_counters          enable row level security;
alter table public.accounts               enable row level security;
alter table public.journals               enable row level security;
alter table public.entry_templates        enable row level security;
alter table public.customers              enable row level security;
alter table public.suppliers              enable row level security;
alter table public.journal_entries        enable row level security;
alter table public.entry_lines            enable row level security;
alter table public.customer_invoices      enable row level security;
alter table public.customer_invoice_lines enable row level security;
alter table public.supplier_invoices      enable row level security;
alter table public.treasury_accounts      enable row level security;
alter table public.payments               enable row level security;
alter table public.audit_log              enable row level security;
alter table public.reminder_runs          enable row level security;

-- Un comptable voit son profil et ceux des collègues partageant un site (noms dans l'audit)
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or exists (
    select 1 from public.site_assignments a1
    join public.site_assignments a2 on a2.site_id = a1.site_id
    where a1.user_id = auth.uid() and a2.user_id = profiles.id));

-- Le hash du code d'accès n'est jamais lisible côté client
revoke select on public.sites from anon, authenticated;
grant select (id, code, name, city, sector, usd_cdf_rate, vat_rate, created_at)
  on public.sites to authenticated;
create policy sites_read on public.sites for select to authenticated
  using (public.is_assigned(id));

create policy site_rates_read on public.site_rates for select to authenticated
  using (public.is_assigned(site_id));

create policy assignments_read on public.site_assignments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy sessions_read on public.site_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy accounts_read  on public.accounts        for select to authenticated using (true);
create policy journals_read  on public.journals        for select to authenticated using (true);
create policy templates_read on public.entry_templates for select to authenticated using (true);

create policy accounts_admin on public.accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tiers : lecture/écriture directe sur les sites ouverts
create policy customers_rw on public.customers for all to authenticated
  using (public.has_site_access(site_id)) with check (public.has_site_access(site_id));
create policy suppliers_rw on public.suppliers for all to authenticated
  using (public.has_site_access(site_id)) with check (public.has_site_access(site_id));
create policy treasury_rw on public.treasury_accounts for all to authenticated
  using (public.has_site_access(site_id)) with check (public.has_site_access(site_id));

-- Données comptables : lecture seule (écriture via RPC uniquement)
create policy entries_read on public.journal_entries for select to authenticated
  using (public.has_site_access(site_id));
create policy lines_read on public.entry_lines for select to authenticated
  using (exists (select 1 from public.journal_entries e
                 where e.id = entry_id and public.has_site_access(e.site_id)));
create policy cinv_read on public.customer_invoices for select to authenticated
  using (public.has_site_access(site_id));
create policy cinvl_read on public.customer_invoice_lines for select to authenticated
  using (exists (select 1 from public.customer_invoices i
                 where i.id = invoice_id and public.has_site_access(i.site_id)));
create policy sinv_read on public.supplier_invoices for select to authenticated
  using (public.has_site_access(site_id));
create policy payments_read on public.payments for select to authenticated
  using (public.has_site_access(site_id));
create policy audit_read on public.audit_log for select to authenticated
  using (public.is_admin() or (site_id is not null and public.has_site_access(site_id)));

-- ---------------------------------------------------------------------
-- Utilitaires internes
-- ---------------------------------------------------------------------
create or replace function public._audit(p_site uuid, p_action text, p_entity text, p_id text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (user_id, site_id, action, entity, entity_id, details)
  values (auth.uid(), p_site, p_action, p_entity, p_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public._next_number(p_site uuid, p_kind text, p_year int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into site_counters (site_id, kind, year, value) values (p_site, p_kind, p_year, 1)
  on conflict (site_id, kind, year) do update set value = site_counters.value + 1
  returning value into v;
  return v;
end $$;

create or replace function public._to_usd(p_amount numeric, p_currency text, p_rate numeric)
returns numeric language sql immutable as $$
  select case when p_currency = 'USD' then round(p_amount, 2) else round(p_amount / p_rate, 2) end;
$$;

-- Insère une écriture équilibrée. p_lines : [{account_code, label, debit, credit, debit_usd?, credit_usd?}]
create or replace function public._insert_entry(
  p_site uuid, p_journal text, p_date date, p_reference text, p_label text,
  p_currency text, p_rate numeric, p_source_type text, p_source_id uuid, p_lines jsonb,
  p_reverses uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; l jsonb; v_d numeric; v_c numeric; v_du numeric; v_cu numeric;
  v_sum_d numeric := 0; v_sum_c numeric := 0; v_diff numeric; v_count int := 0;
  v_accounts text[] := '{}';
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'Une écriture doit comporter au moins deux lignes';
  end if;
  if p_currency not in ('USD','CDF') then raise exception 'Devise invalide'; end if;

  insert into journal_entries (site_id, journal_code, entry_date, reference, label, currency,
                               exchange_rate, source_type, source_id, reverses_id, created_by)
  values (p_site, p_journal, p_date, coalesce(p_reference,''), p_label, p_currency,
          p_rate, p_source_type, p_source_id, p_reverses, auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_d := round(coalesce((l->>'debit')::numeric, 0), 2);
    v_c := round(coalesce((l->>'credit')::numeric, 0), 2);
    if v_d < 0 or v_c < 0 then raise exception 'Montants négatifs interdits'; end if;
    if v_d > 0 and v_c > 0 then raise exception 'Une ligne ne peut être à la fois au débit et au crédit'; end if;
    v_du := coalesce((l->>'debit_usd')::numeric, public._to_usd(v_d, p_currency, p_rate));
    v_cu := coalesce((l->>'credit_usd')::numeric, public._to_usd(v_c, p_currency, p_rate));
    if v_d = 0 and v_c = 0 and v_du = 0 and v_cu = 0 then continue; end if;
    if not exists (select 1 from accounts where code = l->>'account_code' and active) then
      raise exception 'Compte inconnu ou inactif : %', l->>'account_code';
    end if;
    insert into entry_lines (entry_id, account_code, label, debit, credit, debit_usd, credit_usd)
    values (v_id, l->>'account_code', coalesce(l->>'label', p_label), v_d, v_c, round(v_du,2), round(v_cu,2));
    v_sum_d := v_sum_d + v_d; v_sum_c := v_sum_c + v_c; v_count := v_count + 1;
    v_accounts := array_append(v_accounts, l->>'account_code');
  end loop;

  if v_count < 2 then raise exception 'Une écriture doit comporter au moins deux lignes non nulles'; end if;
  if v_sum_d <> v_sum_c then
    raise exception 'Écriture déséquilibrée : débit % ≠ crédit %', v_sum_d, v_sum_c;
  end if;

  -- Arrondi de conversion : on ajuste la plus grosse ligne du côté le plus faible
  select sum(debit_usd) - sum(credit_usd) into v_diff from entry_lines where entry_id = v_id;
  if v_diff <> 0 then
    if abs(v_diff) > 0.01 * v_count + 0.01 then
      raise exception 'Écriture déséquilibrée en USD (écart %)', v_diff;
    end if;
    if v_diff > 0 then
      update entry_lines set credit_usd = credit_usd + v_diff
      where id = (select id from entry_lines where entry_id = v_id and credit_usd > 0 order by credit_usd desc, id limit 1);
    else
      update entry_lines set debit_usd = debit_usd - v_diff
      where id = (select id from entry_lines where entry_id = v_id and debit_usd > 0 order by debit_usd desc, id limit 1);
    end if;
  end if;

  perform public._audit(p_site, 'ecriture.comptabilisee', 'journal_entry', v_id::text,
    jsonb_build_object('journal', p_journal, 'date', p_date, 'libelle', p_label,
                       'piece', p_reference, 'montant', v_sum_d, 'devise', p_currency,
                       'comptes', to_jsonb(v_accounts), 'source', p_source_type));
  return v_id;
end $$;

create or replace function public._journal_for_treasury(p_treasury uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when kind = 'caisse' then 'CA' else 'BQ' end from treasury_accounts where id = p_treasury;
$$;

-- ---------------------------------------------------------------------
-- Ouverture / fermeture de site (code d'accès, 12 h)
-- ---------------------------------------------------------------------
create or replace function public.open_site(p_site uuid, p_code text)
returns timestamptz language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_fail int; v_exp timestamptz;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if not public.is_assigned(p_site) then raise exception 'Ce site ne vous est pas attribué'; end if;

  select count(*) into v_fail from audit_log
  where user_id = auth.uid() and site_id = p_site and action = 'site.code_refuse'
    and at > now() - interval '15 minutes';
  if v_fail >= 5 then raise exception 'Trop de tentatives. Réessayez dans 15 minutes.'; end if;

  select access_code_hash into v_hash from sites where id = p_site;
  if v_hash is null or extensions.crypt(p_code, v_hash) <> v_hash then
    perform public._audit(p_site, 'site.code_refuse', 'site', p_site::text, '{}');
    return null;  -- pas d'exception : la tentative refusée reste journalisée
  end if;

  update site_sessions set closed_at = now()
  where user_id = auth.uid() and site_id = p_site and closed_at is null;
  insert into site_sessions (user_id, site_id) values (auth.uid(), p_site)
  returning expires_at into v_exp;
  perform public._audit(p_site, 'site.ouvert', 'site', p_site::text, jsonb_build_object('expire', v_exp));
  return v_exp;
end $$;

create or replace function public.close_site(p_site uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update site_sessions set closed_at = now()
  where user_id = auth.uid() and closed_at is null and (p_site is null or site_id = p_site);
end $$;

-- ---------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------
create or replace function public.admin_create_site(
  p_code text, p_name text, p_city text, p_sector text, p_access_code text, p_rate numeric, p_vat numeric default 16)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_cash text; v_bank text;
begin
  perform public._require_admin();
  if length(coalesce(p_access_code,'')) < 6 then raise exception 'Le code d''accès doit faire au moins 6 caractères'; end if;
  insert into sites (code, name, city, sector, access_code_hash, usd_cdf_rate, vat_rate)
  values (upper(p_code), p_name, p_city, p_sector, extensions.crypt(p_access_code, extensions.gen_salt('bf')), p_rate, p_vat)
  returning id into v_id;
  insert into site_rates (site_id, rate, set_by) values (v_id, p_rate, auth.uid());
  insert into treasury_accounts (site_id, name, kind, account_code, currency) values
    (v_id, 'Caisse USD', 'caisse', '5711', 'USD'),
    (v_id, 'Caisse CDF', 'caisse', '5712', 'CDF'),
    (v_id, 'Banque USD', 'banque', '5211', 'USD'),
    (v_id, 'Banque CDF', 'banque', '5212', 'CDF');
  perform public._audit(v_id, 'site.cree', 'site', v_id::text, jsonb_build_object('code', upper(p_code), 'nom', p_name));
  return v_id;
end $$;

create or replace function public.admin_update_site(
  p_site uuid, p_name text, p_city text, p_sector text, p_vat numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update sites set name = p_name, city = p_city, sector = p_sector, vat_rate = p_vat where id = p_site;
  perform public._audit(p_site, 'site.modifie', 'site', p_site::text,
    jsonb_build_object('nom', p_name, 'ville', p_city, 'secteur', p_sector, 'tva', p_vat));
end $$;

create or replace function public.admin_set_site_code(p_site uuid, p_access_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._require_admin();
  if length(coalesce(p_access_code,'')) < 6 then raise exception 'Le code d''accès doit faire au moins 6 caractères'; end if;
  update sites set access_code_hash = extensions.crypt(p_access_code, extensions.gen_salt('bf')) where id = p_site;
  -- Changer le code ferme toutes les sessions ouvertes sur ce site
  update site_sessions set closed_at = now() where site_id = p_site and closed_at is null;
  perform public._audit(p_site, 'site.code_change', 'site', p_site::text, '{}');
end $$;

create or replace function public.set_site_rate(p_site uuid, p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_old numeric;
begin
  perform public._require_site(p_site);
  if p_rate is null or p_rate <= 0 then raise exception 'Taux invalide'; end if;
  select usd_cdf_rate into v_old from sites where id = p_site;
  update sites set usd_cdf_rate = p_rate where id = p_site;
  insert into site_rates (site_id, rate, set_by) values (p_site, p_rate, auth.uid());
  perform public._audit(p_site, 'site.taux_change', 'site', p_site::text,
    jsonb_build_object('ancien', v_old, 'nouveau', p_rate));
end $$;

create or replace function public.admin_set_assignments(p_user uuid, p_sites uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from site_assignments where user_id = p_user and not (site_id = any(coalesce(p_sites,'{}')));
  insert into site_assignments (user_id, site_id)
  select p_user, s from unnest(coalesce(p_sites,'{}')) s on conflict do nothing;
  update site_sessions set closed_at = now()
  where user_id = p_user and closed_at is null and not (site_id = any(coalesce(p_sites,'{}')));
  perform public._audit(null, 'comptable.sites', 'profile', p_user::text, jsonb_build_object('sites', to_jsonb(p_sites)));
end $$;

create or replace function public.admin_update_profile(p_user uuid, p_full_name text, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception 'Vous ne pouvez pas retirer vos propres droits administrateur';
  end if;
  update profiles set full_name = p_full_name, role = p_role, active = p_active where id = p_user;
  if not p_active then
    update site_sessions set closed_at = now() where user_id = p_user and closed_at is null;
  end if;
  perform public._audit(null, 'comptable.modifie', 'profile', p_user::text,
    jsonb_build_object('nom', p_full_name, 'role', p_role, 'actif', p_active));
end $$;

-- ---------------------------------------------------------------------
-- Écritures manuelles
-- ---------------------------------------------------------------------
create or replace function public.post_manual_entry(
  p_site uuid, p_journal text, p_date date, p_reference text, p_label text,
  p_currency text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_rate numeric;
begin
  perform public._require_site(p_site);
  if exists (select 1 from jsonb_array_elements(p_lines) x where x ? 'debit_usd' or x ? 'credit_usd') then
    raise exception 'Champs non autorisés';
  end if;
  select usd_cdf_rate into v_rate from sites where id = p_site;
  return public._insert_entry(p_site, p_journal, p_date, p_reference, p_label, p_currency, v_rate,
                              'manuel', null, p_lines);
end $$;

-- Contre-passation d'une écriture manuelle
create or replace function public.reverse_entry(p_entry uuid, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare e journal_entries; v_lines jsonb; v_new uuid;
begin
  select * into e from journal_entries where id = p_entry;
  if not found then raise exception 'Écriture introuvable'; end if;
  perform public._require_site(e.site_id);
  if e.source_type <> 'manuel' then
    raise exception 'Seules les écritures manuelles se contre-passent ici (annulez le document source)';
  end if;
  if exists (select 1 from journal_entries where reverses_id = p_entry) then
    raise exception 'Écriture déjà contre-passée';
  end if;
  select jsonb_agg(jsonb_build_object('account_code', account_code, 'label', 'Contre-passation : ' || label,
           'debit', credit, 'credit', debit, 'debit_usd', credit_usd, 'credit_usd', debit_usd) order by id)
    into v_lines from entry_lines where entry_id = p_entry;
  v_new := public._insert_entry(e.site_id, e.journal_code, p_date, e.reference,
                                'Contre-passation n°' || e.number || ' – ' || e.label,
                                e.currency, e.exchange_rate, 'annulation', p_entry, v_lines, p_entry);
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- Factures clients
-- ---------------------------------------------------------------------
create or replace function public.create_customer_invoice(
  p_site uuid, p_customer uuid, p_issue date, p_due date, p_currency text,
  p_vat_rate numeric, p_lines jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric; v_code text; v_num text; v_id uuid; v_sub numeric := 0; v_vat numeric; v_total numeric;
  l jsonb; v_amt numeric; v_entry uuid; v_cust text; v_elines jsonb := '[]'::jsonb;
begin
  perform public._require_site(p_site);
  select name into v_cust from customers where id = p_customer and site_id = p_site;
  if v_cust is null then raise exception 'Client introuvable sur ce site'; end if;
  if p_due < p_issue then raise exception 'L''échéance précède la date de facture'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Facture sans ligne'; end if;
  select usd_cdf_rate, code into v_rate, v_code from sites where id = p_site;

  v_num := 'FA-' || v_code || '-' || extract(year from p_issue)::int || '-' ||
           lpad(public._next_number(p_site, 'facture_client', extract(year from p_issue)::int)::text, 4, '0');

  insert into customer_invoices (site_id, number, customer_id, issue_date, due_date, currency, exchange_rate,
                                 vat_rate, subtotal, vat_amount, total, notes, created_by)
  values (p_site, v_num, p_customer, p_issue, p_due, p_currency, v_rate, coalesce(p_vat_rate,0), 0, 0, 0, p_notes, auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    if substr(l->>'account_code',1,1) <> '7' then raise exception 'Compte de produit (classe 7) attendu'; end if;
    v_amt := round((l->>'quantity')::numeric * (l->>'unit_price')::numeric, 2);
    insert into customer_invoice_lines (invoice_id, description, quantity, unit_price, amount, account_code)
    values (v_id, l->>'description', (l->>'quantity')::numeric, (l->>'unit_price')::numeric, v_amt, l->>'account_code');
    v_sub := v_sub + v_amt;
  end loop;
  if v_sub <= 0 then raise exception 'Montant de facture nul'; end if;

  v_vat := round(v_sub * coalesce(p_vat_rate,0) / 100, 2);
  v_total := v_sub + v_vat;
  update customer_invoices set subtotal = v_sub, vat_amount = v_vat, total = v_total where id = v_id;

  -- 411 au débit (TTC), 7xx au crédit (HT par compte), 4431 au crédit (TVA)
  v_elines := v_elines || jsonb_build_array(jsonb_build_object('account_code','411','label', v_cust || ' – ' || v_num,'debit', v_total));
  select v_elines || coalesce(jsonb_agg(jsonb_build_object('account_code', account_code, 'label', v_num, 'credit', s)), '[]')
    into v_elines
    from (select account_code, sum(amount) s from customer_invoice_lines where invoice_id = v_id group by account_code) x;
  if v_vat > 0 then
    v_elines := v_elines || jsonb_build_array(jsonb_build_object('account_code','4431','label','TVA ' || v_num,'credit', v_vat));
  end if;

  v_entry := public._insert_entry(p_site, 'VE', p_issue, v_num, 'Facture ' || v_num || ' – ' || v_cust,
                                  p_currency, v_rate, 'facture_client', v_id, v_elines);
  update customer_invoices set entry_id = v_entry where id = v_id;
  perform public._audit(p_site, 'facture_client.emise', 'customer_invoice', v_id::text,
    jsonb_build_object('numero', v_num, 'total', v_total, 'devise', p_currency));
  return v_id;
end $$;

create or replace function public.cancel_customer_invoice(p_invoice uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare i customer_invoices; v_lines jsonb;
begin
  select * into i from customer_invoices where id = p_invoice;
  if not found then raise exception 'Facture introuvable'; end if;
  perform public._require_site(i.site_id);
  if i.status = 'annulee' then raise exception 'Facture déjà annulée'; end if;
  if i.amount_paid > 0 then raise exception 'Facture partiellement réglée : annulation impossible'; end if;
  select jsonb_agg(jsonb_build_object('account_code', account_code, 'label', 'Annulation ' || i.number,
           'debit', credit, 'credit', debit, 'debit_usd', credit_usd, 'credit_usd', debit_usd) order by id)
    into v_lines from entry_lines where entry_id = i.entry_id;
  perform public._insert_entry(i.site_id, 'VE', p_date, i.number, 'Annulation facture ' || i.number,
                               i.currency, i.exchange_rate, 'annulation', i.id, v_lines, i.entry_id);
  update customer_invoices set status = 'annulee' where id = p_invoice;
  perform public._audit(i.site_id, 'facture_client.annulee', 'customer_invoice', i.id::text,
                        jsonb_build_object('numero', i.number));
end $$;

-- ---------------------------------------------------------------------
-- Factures fournisseurs : brouillon (analyse) → validation par le comptable
-- ---------------------------------------------------------------------
create or replace function public.create_supplier_invoice(
  p_site uuid, p_supplier uuid, p_supplier_name text, p_reference text, p_date date, p_due date,
  p_currency text, p_subtotal numeric, p_vat numeric, p_total numeric, p_account text,
  p_source_text text, p_attachment text, p_ai jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rate numeric;
begin
  perform public._require_site(p_site);
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and site_id = p_site) then
    raise exception 'Fournisseur introuvable sur ce site';
  end if;
  if p_attachment is not null and split_part(p_attachment, '/', 1) <> p_site::text then
    raise exception 'Pièce jointe hors du site';
  end if;
  select usd_cdf_rate into v_rate from sites where id = p_site;
  insert into supplier_invoices (site_id, supplier_id, supplier_name, reference, invoice_date, due_date, currency,
    exchange_rate, subtotal, vat_amount, total, expense_account, source_text, attachment_path, ai_suggestion, created_by)
  values (p_site, p_supplier, coalesce(p_supplier_name,''), coalesce(p_reference,''), p_date, p_due, p_currency,
    v_rate, coalesce(p_subtotal,0), coalesce(p_vat,0), coalesce(p_total,0), p_account, p_source_text, p_attachment, p_ai, auth.uid())
  returning id into v_id;
  perform public._audit(p_site, 'facture_fournisseur.brouillon', 'supplier_invoice', v_id::text,
    jsonb_build_object('fournisseur', p_supplier_name, 'total', p_total, 'compte_propose', p_account));
  return v_id;
end $$;

create or replace function public.validate_supplier_invoice(
  p_invoice uuid, p_supplier uuid, p_reference text, p_date date, p_due date,
  p_account text, p_subtotal numeric, p_vat numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare i supplier_invoices; v_sup uuid; v_name text; v_total numeric; v_entry uuid; v_lines jsonb;
begin
  select * into i from supplier_invoices where id = p_invoice for update;
  if not found then raise exception 'Facture introuvable'; end if;
  perform public._require_site(i.site_id);
  if i.status <> 'brouillon' then raise exception 'Cette facture a déjà été traitée'; end if;
  if not exists (select 1 from accounts where code = p_account and active and class in (2,6)) then
    raise exception 'Compte de charge (classe 6) ou d''immobilisation (classe 2) attendu';
  end if;
  if coalesce(p_subtotal,0) <= 0 or coalesce(p_vat,0) < 0 then raise exception 'Montants invalides'; end if;

  v_sup := coalesce(p_supplier, i.supplier_id);
  if v_sup is null then
    if coalesce(trim(i.supplier_name),'') = '' then raise exception 'Fournisseur requis'; end if;
    select id into v_sup from suppliers where site_id = i.site_id and lower(name) = lower(trim(i.supplier_name)) limit 1;
    if v_sup is null then
      insert into suppliers (site_id, name, default_account) values (i.site_id, trim(i.supplier_name), p_account)
      returning id into v_sup;
    end if;
  end if;
  select name into v_name from suppliers where id = v_sup and site_id = i.site_id;
  if v_name is null then raise exception 'Fournisseur introuvable sur ce site'; end if;

  v_total := round(p_subtotal + p_vat, 2);
  v_lines := jsonb_build_array(jsonb_build_object('account_code', p_account, 'label', v_name || ' ' || coalesce(p_reference,''), 'debit', round(p_subtotal,2)));
  if p_vat > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','4452','label','TVA récupérable','debit', round(p_vat,2)));
  end if;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','401','label', v_name,'credit', v_total));

  v_entry := public._insert_entry(i.site_id, 'AC', p_date, coalesce(p_reference,''),
    'Facture fournisseur ' || v_name || ' ' || coalesce(p_reference,''), i.currency, i.exchange_rate,
    'facture_fournisseur', i.id, v_lines);

  update supplier_invoices set supplier_id = v_sup, supplier_name = v_name, reference = coalesce(p_reference,''),
    invoice_date = p_date, due_date = p_due, expense_account = p_account, subtotal = round(p_subtotal,2),
    vat_amount = round(p_vat,2), total = v_total, status = 'validee', entry_id = v_entry,
    validated_by = auth.uid(), validated_at = now()
  where id = p_invoice;
  update suppliers set default_account = coalesce(default_account, p_account) where id = v_sup;

  perform public._audit(i.site_id, 'facture_fournisseur.validee', 'supplier_invoice', i.id::text,
    jsonb_build_object('fournisseur', v_name, 'compte', p_account,
      'compte_propose', i.ai_suggestion->>'account_code', 'total', v_total));
  return v_entry;
end $$;

create or replace function public.reject_supplier_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_status text;
begin
  select site_id, status into v_site, v_status from supplier_invoices where id = p_invoice;
  perform public._require_site(v_site);
  if v_status <> 'brouillon' then raise exception 'Seul un brouillon peut être rejeté'; end if;
  update supplier_invoices set status = 'rejetee' where id = p_invoice;
  perform public._audit(v_site, 'facture_fournisseur.rejetee', 'supplier_invoice', p_invoice::text, '{}');
end $$;

-- ---------------------------------------------------------------------
-- Paiements : règlements clients/fournisseurs, dépenses, recettes du jour
-- ---------------------------------------------------------------------
create or replace function public.record_payment(
  p_site uuid, p_kind text, p_date date, p_amount numeric, p_vat numeric, p_currency text,
  p_treasury uuid, p_customer_invoice uuid, p_supplier_invoice uuid, p_supplier uuid,
  p_counterpart text, p_label text, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t treasury_accounts; v_rate numeric; v_journal text; v_lines jsonb; v_entry uuid; v_id uuid;
  ci customer_invoices; si supplier_invoices; v_counter text; v_label text;
  v_amt numeric := round(p_amount, 2); v_vat numeric := round(coalesce(p_vat,0), 2);
  v_usd_now numeric; v_usd_hist numeric; v_fx numeric;
begin
  perform public._require_site(p_site);
  if v_amt <= 0 then raise exception 'Montant invalide'; end if;
  select * into t from treasury_accounts where id = p_treasury and site_id = p_site and active;
  if not found then raise exception 'Caisse ou banque introuvable'; end if;
  if t.currency <> p_currency then raise exception 'La devise du paiement doit être celle de la caisse/banque (%)', t.currency; end if;
  select usd_cdf_rate into v_rate from sites where id = p_site;
  v_journal := case when t.kind = 'caisse' then 'CA' else 'BQ' end;
  v_usd_now := public._to_usd(v_amt, p_currency, v_rate);

  if p_kind = 'reglement_client' then
    select * into ci from customer_invoices where id = p_customer_invoice and site_id = p_site for update;
    if not found then raise exception 'Facture client introuvable'; end if;
    if ci.status in ('annulee','payee') then raise exception 'Facture déjà soldée ou annulée'; end if;
    if ci.currency <> p_currency then raise exception 'Devise différente de la facture (%)', ci.currency; end if;
    if v_amt > ci.total - ci.amount_paid then raise exception 'Montant supérieur au reste dû (%)', ci.total - ci.amount_paid; end if;
    v_counter := '411';
    v_label := coalesce(nullif(p_label,''), 'Règlement ' || ci.number);
    v_usd_hist := public._to_usd(v_amt, p_currency, ci.exchange_rate);
    v_fx := v_usd_now - v_usd_hist;   -- >0 gain, <0 perte
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', t.account_code, 'label', v_label, 'debit', v_amt, 'debit_usd', v_usd_now),
      jsonb_build_object('account_code', '411', 'label', v_label, 'credit', v_amt, 'credit_usd', v_usd_hist));
    if v_fx > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','776','label','Gain de change ' || ci.number,'credit',0,'credit_usd', v_fx));
    elsif v_fx < 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','676','label','Perte de change ' || ci.number,'debit',0,'debit_usd', -v_fx));
    end if;
    v_vat := 0;

  elsif p_kind = 'reglement_fournisseur' then
    select * into si from supplier_invoices where id = p_supplier_invoice and site_id = p_site for update;
    if not found then raise exception 'Facture fournisseur introuvable'; end if;
    if si.status not in ('validee','partielle') then raise exception 'La facture doit être validée et non soldée'; end if;
    if si.currency <> p_currency then raise exception 'Devise différente de la facture (%)', si.currency; end if;
    if v_amt > si.total - si.amount_paid then raise exception 'Montant supérieur au reste dû (%)', si.total - si.amount_paid; end if;
    v_counter := '401';
    v_label := coalesce(nullif(p_label,''), 'Règlement ' || si.supplier_name || ' ' || si.reference);
    v_usd_hist := public._to_usd(v_amt, p_currency, si.exchange_rate);
    v_fx := v_usd_hist - v_usd_now;   -- >0 gain (on paie moins en USD), <0 perte
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '401', 'label', v_label, 'debit', v_amt, 'debit_usd', v_usd_hist),
      jsonb_build_object('account_code', t.account_code, 'label', v_label, 'credit', v_amt, 'credit_usd', v_usd_now));
    if v_fx > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','776','label','Gain de change','credit',0,'credit_usd', v_fx));
    elsif v_fx < 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','676','label','Perte de change','debit',0,'debit_usd', -v_fx));
    end if;
    v_vat := 0;

  elsif p_kind = 'depense' then
    if not exists (select 1 from accounts where code = p_counterpart and class in (2,4,6) and active) then
      raise exception 'Compte de charge attendu';
    end if;
    if v_vat >= v_amt then raise exception 'TVA incohérente'; end if;
    v_counter := p_counterpart; v_label := p_label;
    v_lines := jsonb_build_array(jsonb_build_object('account_code', p_counterpart, 'label', p_label, 'debit', v_amt - v_vat));
    if v_vat > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','4452','label','TVA récupérable','debit', v_vat));
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', t.account_code, 'label', p_label, 'credit', v_amt));
    if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and site_id = p_site) then
      raise exception 'Fournisseur introuvable';
    end if;

  elsif p_kind = 'recette' then
    if not exists (select 1 from accounts where code = p_counterpart and class = 7 and active) then
      raise exception 'Compte de produit attendu';
    end if;
    if v_vat >= v_amt then raise exception 'TVA incohérente'; end if;
    v_counter := p_counterpart; v_label := p_label;
    v_lines := jsonb_build_array(jsonb_build_object('account_code', t.account_code, 'label', p_label, 'debit', v_amt),
                                 jsonb_build_object('account_code', p_counterpart, 'label', p_label, 'credit', v_amt - v_vat));
    if v_vat > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','4431','label','TVA facturée','credit', v_vat));
    end if;
  else
    raise exception 'Type de paiement inconnu';
  end if;

  insert into payments (site_id, kind, payment_date, amount, vat_amount, currency, exchange_rate, treasury_account_id,
    customer_invoice_id, supplier_invoice_id, supplier_id, counterpart_account, label, reference, created_by)
  values (p_site, p_kind, p_date, v_amt, v_vat, p_currency, v_rate, p_treasury,
    case when p_kind = 'reglement_client' then p_customer_invoice end,
    case when p_kind = 'reglement_fournisseur' then p_supplier_invoice end,
    case when p_kind = 'reglement_fournisseur' then si.supplier_id else p_supplier end,
    v_counter, v_label, coalesce(p_reference,''), auth.uid())
  returning id into v_id;

  v_entry := public._insert_entry(p_site, v_journal, p_date, coalesce(p_reference,''), v_label,
                                  p_currency, v_rate, 'paiement', v_id, v_lines);
  update payments set entry_id = v_entry where id = v_id;

  if p_kind = 'reglement_client' then
    update customer_invoices set amount_paid = amount_paid + v_amt,
      status = case when amount_paid + v_amt >= total then 'payee' else 'partielle' end
    where id = ci.id;
  elsif p_kind = 'reglement_fournisseur' then
    update supplier_invoices set amount_paid = amount_paid + v_amt,
      status = case when amount_paid + v_amt >= total then 'payee' else 'partielle' end
    where id = si.id;
  end if;
  return v_id;
end $$;

create or replace function public.set_payment_reconciled(p_payment uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_site uuid;
begin
  select site_id into v_site from payments where id = p_payment;
  perform public._require_site(v_site);
  update payments set reconciled = p_value, reconciled_at = case when p_value then now() end where id = p_payment;
  perform public._audit(v_site, case when p_value then 'paiement.rapproche' else 'paiement.derapproche' end,
                        'payment', p_payment::text, '{}');
end $$;

-- ---------------------------------------------------------------------
-- États financiers (SECURITY INVOKER : la RLS filtre les sites accessibles)
-- Montants en USD (contre-valeur au taux historique de chaque document)
-- ---------------------------------------------------------------------
create or replace function public.report_trial_balance(p_sites uuid[], p_from date, p_to date)
returns table (account_code text, label text, class int,
               opening_debit numeric, opening_credit numeric,
               period_debit numeric, period_credit numeric,
               closing_debit numeric, closing_credit numeric)
language sql stable security invoker set search_path = public as $$
  with base as (
    select l.account_code, l.debit_usd, l.credit_usd, e.entry_date, a.class
    from entry_lines l
    join journal_entries e on e.id = l.entry_id
    join accounts a on a.code = l.account_code
    where e.site_id = any(p_sites) and e.entry_date <= p_to
  ), agg as (
    select account_code, class,
      -- Classes 6 à 8 : solde d'ouverture à partir du 1er janvier de l'exercice
      sum(case when entry_date < p_from and (class <= 5 or entry_date >= date_trunc('year', p_from)::date)
               then debit_usd - credit_usd else 0 end) as ob,
      sum(case when entry_date >= p_from then debit_usd else 0 end) as pd,
      sum(case when entry_date >= p_from then credit_usd else 0 end) as pc
    from base group by account_code, class
  )
  select g.account_code, a.label, g.class,
    greatest(g.ob,0), greatest(-g.ob,0), g.pd, g.pc,
    greatest(g.ob + g.pd - g.pc, 0), greatest(-(g.ob + g.pd - g.pc), 0)
  from agg g join accounts a on a.code = g.account_code
  where g.ob <> 0 or g.pd <> 0 or g.pc <> 0
  order by g.account_code;
$$;

create or replace function public.report_ledger(p_sites uuid[], p_account text, p_from date, p_to date)
returns table (entry_id uuid, entry_number bigint, site_code text, entry_date date, journal_code text,
               reference text, label text, currency text, debit numeric, credit numeric,
               debit_usd numeric, credit_usd numeric, balance_usd numeric, opening_usd numeric)
language sql stable security invoker set search_path = public as $$
  with op as (
    select coalesce(sum(l.debit_usd - l.credit_usd), 0) v
    from entry_lines l join journal_entries e on e.id = l.entry_id
    where e.site_id = any(p_sites) and l.account_code like p_account || '%' and e.entry_date < p_from
      and (substr(p_account,1,1)::int <= 5 or e.entry_date >= date_trunc('year', p_from)::date)
  )
  select e.id, e.number, s.code, e.entry_date, e.journal_code, e.reference, l.label, e.currency,
         l.debit, l.credit, l.debit_usd, l.credit_usd,
         (select v from op) + sum(l.debit_usd - l.credit_usd) over (order by e.entry_date, e.number, l.id),
         (select v from op)
  from entry_lines l
  join journal_entries e on e.id = l.entry_id
  join sites s on s.id = e.site_id
  where e.site_id = any(p_sites) and l.account_code like p_account || '%'
    and e.entry_date between p_from and p_to
  order by e.entry_date, e.number, l.id;
$$;

create or replace function public.report_site_summary(p_sites uuid[], p_from date, p_to date)
returns table (site_id uuid, site_code text, site_name text, revenue numeric, expenses numeric,
               receivables numeric, payables numeric, cash numeric)
language sql stable security invoker set search_path = public as $$
  select s.id, s.code, s.name,
    coalesce(sum(case when a.class = 7 and e.entry_date between p_from and p_to then l.credit_usd - l.debit_usd end), 0),
    coalesce(sum(case when a.class = 6 and e.entry_date between p_from and p_to then l.debit_usd - l.credit_usd end), 0),
    coalesce(sum(case when l.account_code like '411%' and e.entry_date <= p_to then l.debit_usd - l.credit_usd end), 0),
    coalesce(sum(case when l.account_code like '401%' and e.entry_date <= p_to then l.credit_usd - l.debit_usd end), 0),
    coalesce(sum(case when a.class = 5 and e.entry_date <= p_to then l.debit_usd - l.credit_usd end), 0)
  from sites s
  left join journal_entries e on e.site_id = s.id
  left join entry_lines l on l.entry_id = e.id
  left join accounts a on a.code = l.account_code
  where s.id = any(p_sites)
  group by s.id, s.code, s.name
  order by s.code;
$$;

-- Soldes en devise du document (caisses / banques)
create or replace function public.report_account_balances(p_site uuid, p_codes text[])
returns table (account_code text, balance numeric)
language sql stable security invoker set search_path = public as $$
  select l.account_code, sum(l.debit - l.credit)
  from entry_lines l join journal_entries e on e.id = l.entry_id
  where e.site_id = p_site and l.account_code = any(p_codes)
  group by l.account_code;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution : seules les RPC publiques sont exposées
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on function public._audit(uuid,text,text,text,jsonb) from authenticated;
revoke execute on function public._next_number(uuid,text,int) from authenticated;
revoke execute on function public._insert_entry(uuid,text,date,text,text,text,numeric,text,uuid,jsonb,uuid) from authenticated;
revoke execute on function public._journal_for_treasury(uuid) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

grant execute on function
  public.is_admin(), public.is_assigned(uuid), public.has_site_access(uuid),
  public.open_site(uuid,text), public.close_site(uuid),
  public.admin_create_site(text,text,text,text,text,numeric,numeric),
  public.admin_update_site(uuid,text,text,text,numeric),
  public.admin_set_site_code(uuid,text), public.set_site_rate(uuid,numeric),
  public.admin_set_assignments(uuid,uuid[]), public.admin_update_profile(uuid,text,text,boolean),
  public.post_manual_entry(uuid,text,date,text,text,text,jsonb), public.reverse_entry(uuid,date),
  public.create_customer_invoice(uuid,uuid,date,date,text,numeric,jsonb,text),
  public.cancel_customer_invoice(uuid,date),
  public.create_supplier_invoice(uuid,uuid,text,text,date,date,text,numeric,numeric,numeric,text,text,text,jsonb),
  public.validate_supplier_invoice(uuid,uuid,text,date,date,text,numeric,numeric),
  public.reject_supplier_invoice(uuid),
  public.record_payment(uuid,text,date,numeric,numeric,text,uuid,uuid,uuid,uuid,text,text,text),
  public.set_payment_reconciled(uuid,boolean),
  public.report_trial_balance(uuid[],date,date), public.report_ledger(uuid[],text,date,date),
  public.report_site_summary(uuid[],date,date), public.report_account_balances(uuid,text[]),
  public._to_usd(numeric,text,numeric)
to authenticated;
-- _require_site / _require_admin sont appelées depuis les fonctions SECURITY DEFINER (propriétaire)


-- ================================================================
-- Source : supabase\migrations\0003_seed_syscohada.sql
-- ================================================================

-- =====================================================================
-- Plan comptable SYSCOHADA révisé (extrait opérationnel) + comptes sectoriels
-- sectors = '{}' : compte commun ; sinon secteurs où le compte est proposé en priorité
-- =====================================================================
insert into public.journals (code, label) values
  ('VE', 'Journal des ventes'),
  ('AC', 'Journal des achats'),
  ('CA', 'Journal de caisse'),
  ('BQ', 'Journal de banque'),
  ('OD', 'Opérations diverses'),
  ('AN', 'À-nouveaux')
on conflict do nothing;

insert into public.accounts (code, label, sectors) values
-- Classe 1 : ressources durables
  ('101',  'Capital social', '{}'),
  ('111',  'Réserve légale', '{}'),
  ('121',  'Report à nouveau créditeur', '{}'),
  ('129',  'Report à nouveau débiteur', '{}'),
  ('131',  'Résultat net : bénéfice', '{}'),
  ('139',  'Résultat net : perte', '{}'),
  ('162',  'Emprunts auprès des établissements de crédit', '{}'),
  ('165',  'Dépôts et cautionnements reçus', '{}'),
-- Classe 2 : actif immobilisé
  ('213',  'Logiciels et sites internet', '{}'),
  ('231',  'Bâtiments industriels, agricoles et commerciaux', '{btp}'),
  ('241',  'Matériel et outillage industriel et commercial', '{btp}'),
  ('2441', 'Matériel de bureau', '{}'),
  ('2442', 'Matériel informatique', '{}'),
  ('2444', 'Mobilier de bureau', '{}'),
  ('245',  'Matériel de transport', '{transport,btp}'),
  ('2841', 'Amortissements du matériel et outillage', '{btp}'),
  ('2844', 'Amortissements du matériel de bureau et informatique', '{}'),
  ('2845', 'Amortissements du matériel de transport', '{transport,btp}'),
-- Classe 3 : stocks
  ('321',  'Matières premières', '{btp}'),
  ('3351', 'Carburants et lubrifiants', '{transport}'),
  ('336',  'Pièces de rechange', '{transport}'),
-- Classe 4 : tiers
  ('401',  'Fournisseurs, dettes en compte', '{}'),
  ('4091', 'Fournisseurs, avances et acomptes versés', '{}'),
  ('411',  'Clients', '{}'),
  ('4117', 'Clients, retenues de garantie', '{btp}'),
  ('4191', 'Clients, avances et acomptes reçus', '{btp}'),
  ('421',  'Personnel, avances et acomptes', '{}'),
  ('422',  'Personnel, rémunérations dues', '{}'),
  ('431',  'Sécurité sociale (CNSS)', '{}'),
  ('441',  'État, impôt sur les bénéfices', '{}'),
  ('4421', 'État, impôts et taxes d''exploitation', '{}'),
  ('4431', 'État, TVA facturée sur ventes', '{}'),
  ('4441', 'État, TVA due', '{}'),
  ('4447', 'État, impôts retenus à la source (IPR)', '{}'),
  ('4449', 'État, crédit de TVA à reporter', '{}'),
  ('4452', 'État, TVA récupérable sur achats', '{}'),
  ('4451', 'État, TVA récupérable sur immobilisations', '{}'),
  ('471',  'Débiteurs et créditeurs divers', '{}'),
  ('476',  'Charges constatées d''avance', '{}'),
  ('477',  'Produits constatés d''avance', '{}'),
-- Classe 5 : trésorerie
  ('521',  'Banques', '{}'),
  ('5211', 'Banque USD', '{}'),
  ('5212', 'Banque CDF', '{}'),
  ('571',  'Caisse', '{}'),
  ('5711', 'Caisse USD', '{}'),
  ('5712', 'Caisse CDF', '{}'),
  ('585',  'Virements de fonds', '{}'),
-- Classe 6 : charges
  ('601',  'Achats de marchandises', '{}'),
  ('6021', 'Achats de matières premières (ciment, fer, agrégats)', '{btp}'),
  ('6041', 'Achats de matières consommables', '{btp}'),
  ('6042', 'Achats de pièces de rechange', '{transport}'),
  ('6051', 'Fournitures non stockables – Eau', '{}'),
  ('6052', 'Fournitures non stockables – Électricité', '{}'),
  ('6053', 'Carburants et lubrifiants', '{transport,btp}'),
  ('6054', 'Fournitures d''entretien', '{}'),
  ('6055', 'Fournitures de bureau', '{services}'),
  ('6056', 'Achats de petit matériel et outillage', '{btp}'),
  ('612',  'Transports sur ventes', '{}'),
  ('613',  'Transports pour le compte de tiers (sous-traitance)', '{transport}'),
  ('614',  'Transports du personnel', '{}'),
  ('616',  'Transports de plis', '{}'),
  ('618',  'Autres frais de transport (péages, frais de route)', '{transport}'),
  ('621',  'Sous-traitance générale', '{btp,services}'),
  ('622',  'Locations et charges locatives', '{}'),
  ('6224', 'Location de matériel et d''engins', '{btp}'),
  ('624',  'Entretien, réparations et maintenance', '{}'),
  ('6242', 'Entretien et réparation du matériel de transport', '{transport}'),
  ('625',  'Primes d''assurance', '{}'),
  ('6252', 'Assurances matériel de transport', '{transport}'),
  ('626',  'Études, recherches et documentation', '{services}'),
  ('627',  'Publicité, publications, relations publiques', '{services}'),
  ('628',  'Frais de télécommunications et internet', '{services}'),
  ('631',  'Frais bancaires', '{}'),
  ('632',  'Honoraires et rémunérations d''intermédiaires', '{services}'),
  ('633',  'Frais de formation du personnel', '{}'),
  ('637',  'Rémunérations de personnel extérieur (main-d''œuvre)', '{btp}'),
  ('638',  'Autres charges externes (frais de mission, réception)', '{}'),
  ('641',  'Impôts et taxes directs', '{}'),
  ('645',  'Impôts et taxes indirects', '{}'),
  ('646',  'Droits d''enregistrement, vignettes et permis', '{transport}'),
  ('658',  'Charges diverses', '{}'),
  ('661',  'Rémunérations directes versées au personnel national', '{}'),
  ('663',  'Indemnités forfaitaires versées au personnel', '{}'),
  ('664',  'Charges sociales', '{}'),
  ('671',  'Intérêts des emprunts', '{}'),
  ('676',  'Pertes de change', '{}'),
  ('681',  'Dotations aux amortissements d''exploitation', '{}'),
  ('691',  'Dotations aux provisions d''exploitation', '{}'),
  ('891',  'Impôts sur les bénéfices de l''exercice', '{}'),
-- Classe 7 : produits
  ('701',  'Ventes de marchandises', '{}'),
  ('704',  'Travaux facturés', '{btp}'),
  ('705',  'Travaux facturés (marchés)', '{btp}'),
  ('706',  'Services vendus', '{services}'),
  ('7061', 'Prestations de transport de marchandises (fret)', '{transport}'),
  ('7062', 'Prestations de transport de personnes', '{transport}'),
  ('7063', 'Location de véhicules et d''engins', '{transport,btp}'),
  ('7064', 'Honoraires et missions de conseil', '{services}'),
  ('707',  'Produits accessoires', '{}'),
  ('754',  'Produits des cessions d''immobilisations', '{}'),
  ('758',  'Produits divers', '{}'),
  ('771',  'Intérêts de prêts et créances', '{}'),
  ('776',  'Gains de change', '{}')
on conflict (code) do nothing;

-- Écritures types par secteur (proposées dans la saisie du journal)
insert into public.entry_templates (sector, name, journal_code, lines) values
  (null, 'Frais bancaires mensuels', 'BQ',
    '[{"account_code":"631","side":"D","label":"Frais bancaires"},{"account_code":"5211","side":"C","label":"Frais bancaires"}]'),
  (null, 'Paie du mois (salaires nets)', 'OD',
    '[{"account_code":"661","side":"D","label":"Salaires bruts"},{"account_code":"4447","side":"C","label":"IPR retenu"},{"account_code":"431","side":"C","label":"CNSS part salariale"},{"account_code":"422","side":"C","label":"Salaires nets à payer"}]'),
  (null, 'Virement caisse → banque', 'OD',
    '[{"account_code":"585","side":"D","label":"Virement de fonds"},{"account_code":"5711","side":"C","label":"Sortie caisse"}]'),
  (null, 'Dotation aux amortissements', 'OD',
    '[{"account_code":"681","side":"D","label":"Dotation"},{"account_code":"2844","side":"C","label":"Amortissement"}]'),
  ('services', 'Honoraires de conseil facturés', 'VE',
    '[{"account_code":"411","side":"D","label":"Client"},{"account_code":"7064","side":"C","label":"Honoraires"},{"account_code":"4431","side":"C","label":"TVA facturée"}]'),
  ('services', 'Abonnement internet / téléphone', 'AC',
    '[{"account_code":"628","side":"D","label":"Télécommunications"},{"account_code":"4452","side":"D","label":"TVA récupérable"},{"account_code":"401","side":"C","label":"Fournisseur"}]'),
  ('services', 'Loyer des bureaux', 'AC',
    '[{"account_code":"622","side":"D","label":"Loyer"},{"account_code":"401","side":"C","label":"Bailleur"}]'),
  ('btp', 'Situation de travaux avec retenue de garantie', 'VE',
    '[{"account_code":"411","side":"D","label":"Client – situation"},{"account_code":"4117","side":"D","label":"Retenue de garantie"},{"account_code":"705","side":"C","label":"Travaux facturés"},{"account_code":"4431","side":"C","label":"TVA facturée"}]'),
  ('btp', 'Achat de ciment / fer pour chantier', 'AC',
    '[{"account_code":"6021","side":"D","label":"Matériaux"},{"account_code":"4452","side":"D","label":"TVA récupérable"},{"account_code":"401","side":"C","label":"Fournisseur"}]'),
  ('btp', 'Location d''engin de chantier', 'AC',
    '[{"account_code":"6224","side":"D","label":"Location engin"},{"account_code":"401","side":"C","label":"Loueur"}]'),
  ('btp', 'Paie journaliers de chantier', 'CA',
    '[{"account_code":"637","side":"D","label":"Main-d''œuvre"},{"account_code":"5711","side":"C","label":"Paiement caisse"}]'),
  ('transport', 'Facture de fret', 'VE',
    '[{"account_code":"411","side":"D","label":"Client"},{"account_code":"7061","side":"C","label":"Fret"},{"account_code":"4431","side":"C","label":"TVA facturée"}]'),
  ('transport', 'Plein de carburant payé en caisse', 'CA',
    '[{"account_code":"6053","side":"D","label":"Carburant"},{"account_code":"5711","side":"C","label":"Caisse"}]'),
  ('transport', 'Péages et frais de route', 'CA',
    '[{"account_code":"618","side":"D","label":"Péages / frais de route"},{"account_code":"5711","side":"C","label":"Caisse"}]'),
  ('transport', 'Réparation de camion', 'AC',
    '[{"account_code":"6242","side":"D","label":"Réparation"},{"account_code":"4452","side":"D","label":"TVA récupérable"},{"account_code":"401","side":"C","label":"Garage"}]');


-- ================================================================
-- Source : supabase\migrations\0004_storage.sql
-- ================================================================

-- Pièces justificatives (photos de reçus, PDF) : bucket privé, rangé par site
-- Chemin : <site_id>/<annee>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pieces', 'pieces', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy "pieces_lecture" on storage.objects for select to authenticated
  using (bucket_id = 'pieces' and public.has_site_access(((storage.foldername(name))[1])::uuid));

create policy "pieces_depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'pieces' and public.has_site_access(((storage.foldername(name))[1])::uuid));


-- ================================================================
-- Source : supabase\migrations\0005_first_admin_login.sql
-- ================================================================

-- Compte directeur initial et changement obligatoire des identifiants.
alter table public.profiles
  add column if not exists username text,
  add column if not exists must_change_credentials boolean not null default false;

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username)) where username is not null;

-- Recover a bootstrap account created by an earlier app version before this migration.
do $$
begin
  if (select count(*) from auth.users) = 1 then
    insert into public.profiles (id, email, full_name, role, username, must_change_credentials)
    select id, coalesce(email, ''), 'Admin', 'admin', 'Admin', true
      from auth.users
     where email = 'premier-admin@kbs-comptable.invalid'
    on conflict (id) do update
      set role = 'admin',
          username = 'Admin',
          must_change_credentials = true,
          full_name = coalesce(nullif(public.profiles.full_name, ''), 'Admin');
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_bootstrap_admin boolean;
begin
  is_bootstrap_admin := new.email = 'premier-admin@kbs-comptable.invalid'
    and not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, full_name, role, username, must_change_credentials)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when is_bootstrap_admin then 'admin' else 'comptable' end,
    case when is_bootstrap_admin then 'Admin' else null end,
    is_bootstrap_admin
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.complete_first_admin_setup(p_username text, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise.'; end if;
  if p_username !~ '^[[:alnum:]_.-]{3,40}$' then raise exception 'Nom d’utilisateur invalide.'; end if;
  if length(trim(p_full_name)) < 1 or length(trim(p_full_name)) > 100 then raise exception 'Nom complet invalide.'; end if;
  update public.profiles
     set username = trim(p_username),
         full_name = trim(p_full_name),
         must_change_credentials = false
   where id = auth.uid()
     and role = 'admin'
     and must_change_credentials = true;
  if not found then raise exception 'Configuration initiale non autorisée.'; end if;
end $$;

revoke all on function public.complete_first_admin_setup(text, text) from public;
grant execute on function public.complete_first_admin_setup(text, text) to authenticated;
