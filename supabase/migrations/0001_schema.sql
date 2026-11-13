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
