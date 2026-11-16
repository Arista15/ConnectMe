-- =====================================================================
-- KBS Comptable — 0006 : parité fonctionnelle avec kbs-comptable.com
--   1. Comptes complémentaires (paie, achats, transport)
--   2. Mentions légales des sites (adresse, RCCM, Id. nat., NIF) sur factures/devis
--   3. Comptes par secteur (table + usage), modifiables par l'administrateur
--   4. Modification / suppression des écritures manuelles
--   5. Devis clients (brouillon → accepté/refusé → conversion en facture)
--   6. Acomptes clients (4191) et imputation sur facture (4191 → 411)
-- À exécuter une fois dans l'éditeur SQL de Supabase (idempotent autant que possible).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Comptes complémentaires
-- ---------------------------------------------------------------------
insert into public.accounts (code, label, sectors) values
  ('602',  'Achats de matières premières et fournitures liées', '{btp}'),
  ('603',  'Variations des stocks de biens achetés', '{btp}'),
  ('604',  'Locations et charges locatives', '{}'),
  ('605',  'Autres achats (carburant, petit matériel)', '{}'),
  ('623',  'Publicité, publications, relations publiques', '{services}'),
  ('244',  'Matériel et mobilier de transport', '{transport}'),
  ('4313', 'Sécurité sociale – part patronale (CNSS)', '{}'),
  ('4315', 'INPP – cotisation', '{}'),
  ('4316', 'ONEM – cotisation', '{}'),
  ('4317', 'Sécurité sociale – part salariale (CNSS)', '{}'),
  ('447',  'État, impôts retenus à la source (IPR, IERE)', '{}'),
  ('662',  'Rémunérations directes versées au personnel non national', '{}')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2. Mentions légales des sites
-- ---------------------------------------------------------------------
alter table public.sites add column if not exists address text;
alter table public.sites add column if not exists rccm    text;
alter table public.sites add column if not exists id_nat  text;
alter table public.sites add column if not exists nif     text;
grant select (address, rccm, id_nat, nif) on public.sites to authenticated;

create or replace function public.admin_set_site_mentions(
  p_site uuid, p_address text, p_rccm text, p_id_nat text, p_nif text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update sites set address = nullif(trim(p_address),''), rccm = nullif(trim(p_rccm),''),
                   id_nat = nullif(trim(p_id_nat),''), nif = nullif(trim(p_nif),'')
  where id = p_site;
  perform public._audit(p_site, 'site.modifie', 'site', p_site::text, jsonb_build_object('mentions', true));
end $$;

-- ---------------------------------------------------------------------
-- 3. Comptes par secteur
-- ---------------------------------------------------------------------
create table if not exists public.sector_accounts (
  id            bigint generated always as identity primary key,
  sector        text not null check (sector in ('services','btp','transport')),
  account_code  text not null references public.accounts(code) on delete cascade,
  usage         text,
  unique (sector, account_code)
);
alter table public.sector_accounts enable row level security;
drop policy if exists sector_accounts_read on public.sector_accounts;
create policy sector_accounts_read on public.sector_accounts for select to authenticated using (true);
drop policy if exists sector_accounts_admin on public.sector_accounts;
create policy sector_accounts_admin on public.sector_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.sector_accounts to authenticated;

insert into public.sector_accounts (sector, account_code, usage)
select v.sector, v.code, v.usage from (values
  ('services','706','Facturation des honoraires et services rendus'),
  ('services','604','Loyers des bureaux'),
  ('services','605','Petit matériel, maintenance'),
  ('services','623','Communication et marketing'),
  ('services','661','Salaires'),
  ('services','411','Créances sur clients'),
  ('btp','602','Ciment, fer, agrégats, peinture'),
  ('btp','603','Ajustement des stocks de matériaux en fin de période'),
  ('btp','604','Location d''engins et d''échafaudages'),
  ('btp','705','Facturation des chantiers'),
  ('btp','4452','TVA sur les factures fournisseurs'),
  ('btp','401','Dettes envers les fournisseurs de matériaux'),
  ('transport','605','Gasoil, lubrifiants'),
  ('transport','624','Réparations et pneus des camions'),
  ('transport','625','Assurance flotte'),
  ('transport','706','Facturation du fret'),
  ('transport','244','Acquisition des véhicules (immobilisation)'),
  ('transport','571','Recettes encaissées en espèces')
) as v(sector, code, usage)
join public.accounts a on a.code = v.code
on conflict (sector, account_code) do nothing;

-- Comptes déjà marqués par secteur dans le plan comptable
insert into public.sector_accounts (sector, account_code)
select s, a.code from public.accounts a, unnest(a.sectors) s
where s in ('services','btp','transport')
on conflict (sector, account_code) do nothing;

-- ---------------------------------------------------------------------
-- 4. Modification / suppression des écritures manuelles
-- ---------------------------------------------------------------------
alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check
  check (source_type in ('manuel','facture_client','facture_fournisseur','paiement','annulation','acompte','imputation'));

create or replace function public.update_manual_entry(
  p_entry uuid, p_journal text, p_date date, p_reference text, p_label text,
  p_currency text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare e journal_entries; v_rate numeric; v_new uuid;
begin
  select * into e from journal_entries where id = p_entry for update;
  if not found then raise exception 'Écriture introuvable'; end if;
  perform public._require_site(e.site_id);
  if e.source_type <> 'manuel' then
    raise exception 'Écriture créée par une pièce : modifiez la facture, la dépense ou le paiement d''origine';
  end if;
  if exists (select 1 from journal_entries where reverses_id = p_entry) then
    raise exception 'Écriture contre-passée : modification impossible';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x where x ? 'debit_usd' or x ? 'credit_usd') then
    raise exception 'Champs non autorisés';
  end if;
  v_rate := case when p_currency = e.currency then e.exchange_rate
                 else (select usd_cdf_rate from sites where id = e.site_id) end;
  v_new := public._insert_entry(e.site_id, p_journal, p_date, p_reference, p_label, p_currency, v_rate,
                                'manuel', null, p_lines);
  delete from journal_entries where id = p_entry;
  perform public._audit(e.site_id, 'ecriture.modifiee', 'journal_entry', v_new::text,
    jsonb_build_object('ancienne', e.number, 'libelle', p_label, 'journal', p_journal));
  return v_new;
end $$;

create or replace function public.delete_manual_entry(p_entry uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e journal_entries; v_total numeric;
begin
  select * into e from journal_entries where id = p_entry for update;
  if not found then raise exception 'Écriture introuvable'; end if;
  perform public._require_site(e.site_id);
  if e.source_type <> 'manuel' then
    raise exception 'Écriture créée par une pièce : annulez la facture, la dépense ou le paiement d''origine';
  end if;
  if exists (select 1 from journal_entries where reverses_id = p_entry) then
    raise exception 'Écriture contre-passée : suppression impossible';
  end if;
  select sum(debit) into v_total from entry_lines where entry_id = p_entry;
  delete from journal_entries where id = p_entry;
  perform public._audit(e.site_id, 'ecriture.supprimee', 'journal_entry', p_entry::text,
    jsonb_build_object('numero', e.number, 'journal', e.journal_code, 'libelle', e.label,
                       'piece', e.reference, 'montant', v_total, 'devise', e.currency));
end $$;

-- ---------------------------------------------------------------------
-- 5. Devis clients
-- ---------------------------------------------------------------------
create table if not exists public.customer_quotes (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites(id),
  number        text not null unique,
  customer_id   uuid references public.customers(id),
  issue_date    date not null,
  valid_until   date,
  currency      text not null check (currency in ('USD','CDF')),
  exchange_rate numeric(14,4) not null,
  vat_rate      numeric(5,2) not null default 0,
  subtotal      numeric(18,2) not null default 0,
  vat_amount    numeric(18,2) not null default 0,
  total         numeric(18,2) not null default 0,
  status        text not null default 'brouillon' check (status in ('brouillon','accepte','refuse')),
  notes         text,
  invoice_id    uuid references public.customer_invoices(id),
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create table if not exists public.customer_quote_lines (
  id            bigint generated always as identity primary key,
  quote_id      uuid not null references public.customer_quotes(id) on delete cascade,
  description   text not null,
  quantity      numeric(14,3) not null check (quantity > 0),
  unit_price    numeric(18,2) not null check (unit_price >= 0),
  amount        numeric(18,2) not null,
  account_code  text not null references public.accounts(code)
);
alter table public.customer_quotes      enable row level security;
alter table public.customer_quote_lines enable row level security;
drop policy if exists quotes_read on public.customer_quotes;
create policy quotes_read on public.customer_quotes for select to authenticated
  using (public.has_site_access(site_id));
drop policy if exists quote_lines_read on public.customer_quote_lines;
create policy quote_lines_read on public.customer_quote_lines for select to authenticated
  using (exists (select 1 from public.customer_quotes q where q.id = quote_id and public.has_site_access(q.site_id)));
grant select on public.customer_quotes, public.customer_quote_lines to authenticated;

create or replace function public.create_quote(
  p_site uuid, p_customer uuid, p_issue date, p_valid date, p_currency text,
  p_vat_rate numeric, p_lines jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_rate numeric; v_code text; v_num text; v_id uuid; v_sub numeric := 0; v_vat numeric; l jsonb; v_amt numeric;
begin
  perform public._require_site(p_site);
  if p_customer is not null and not exists (select 1 from customers where id = p_customer and site_id = p_site) then
    raise exception 'Client introuvable sur ce site';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'Devis sans ligne'; end if;
  if p_currency not in ('USD','CDF') then raise exception 'Devise invalide'; end if;
  select usd_cdf_rate, code into v_rate, v_code from sites where id = p_site;
  v_num := 'DV-' || v_code || '-' || extract(year from p_issue)::int || '-' ||
           lpad(public._next_number(p_site, 'devis', extract(year from p_issue)::int)::text, 4, '0');
  insert into customer_quotes (site_id, number, customer_id, issue_date, valid_until, currency, exchange_rate,
                               vat_rate, notes, created_by)
  values (p_site, v_num, p_customer, p_issue, p_valid, p_currency, v_rate, coalesce(p_vat_rate,0), p_notes, auth.uid())
  returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    if substr(l->>'account_code',1,1) <> '7' then raise exception 'Compte de produit (classe 7) attendu'; end if;
    v_amt := round((l->>'quantity')::numeric * (l->>'unit_price')::numeric, 2);
    insert into customer_quote_lines (quote_id, description, quantity, unit_price, amount, account_code)
    values (v_id, l->>'description', (l->>'quantity')::numeric, (l->>'unit_price')::numeric, v_amt, l->>'account_code');
    v_sub := v_sub + v_amt;
  end loop;
  if v_sub <= 0 then raise exception 'Montant du devis nul'; end if;
  v_vat := round(v_sub * coalesce(p_vat_rate,0) / 100, 2);
  update customer_quotes set subtotal = v_sub, vat_amount = v_vat, total = v_sub + v_vat where id = v_id;
  perform public._audit(p_site, 'devis.cree', 'customer_quote', v_id::text, jsonb_build_object('numero', v_num, 'total', v_sub + v_vat));
  return v_id;
end $$;

create or replace function public.set_quote_status(p_quote uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare qt customer_quotes;
begin
  select * into qt from customer_quotes where id = p_quote for update;
  if not found then raise exception 'Devis introuvable'; end if;
  perform public._require_site(qt.site_id);
  if qt.status = 'accepte' then raise exception 'Devis déjà converti en facture'; end if;
  if p_status not in ('brouillon','refuse') then raise exception 'Statut invalide'; end if;
  update customer_quotes set status = p_status where id = p_quote;
end $$;

create or replace function public.delete_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare qt customer_quotes;
begin
  select * into qt from customer_quotes where id = p_quote;
  if not found then raise exception 'Devis introuvable'; end if;
  perform public._require_site(qt.site_id);
  if qt.status = 'accepte' then raise exception 'Devis converti : suppression impossible'; end if;
  delete from customer_quotes where id = p_quote;
end $$;

create or replace function public.convert_quote(p_quote uuid, p_issue date, p_due date)
returns uuid language plpgsql security definer set search_path = public as $$
declare qt customer_quotes; v_lines jsonb; v_inv uuid;
begin
  select * into qt from customer_quotes where id = p_quote for update;
  if not found then raise exception 'Devis introuvable'; end if;
  perform public._require_site(qt.site_id);
  if qt.status = 'accepte' then raise exception 'Devis déjà converti'; end if;
  if qt.customer_id is null then raise exception 'Choisissez un client sur le devis avant de le convertir'; end if;
  select jsonb_agg(jsonb_build_object('description', description, 'quantity', quantity,
                                      'unit_price', unit_price, 'account_code', account_code) order by id)
    into v_lines from customer_quote_lines where quote_id = p_quote;
  v_inv := public.create_customer_invoice(qt.site_id, qt.customer_id, p_issue, p_due, qt.currency,
                                          qt.vat_rate, v_lines, 'Selon devis ' || qt.number ||
                                          coalesce(E'\n' || qt.notes, ''));
  update customer_quotes set status = 'accepte', invoice_id = v_inv where id = p_quote;
  return v_inv;
end $$;

-- ---------------------------------------------------------------------
-- 6. Acomptes clients
-- ---------------------------------------------------------------------
insert into public.accounts (code, label, sectors) values
  ('4191', 'Clients, avances et acomptes reçus', '{}')
on conflict (code) do nothing;

create table if not exists public.customer_advances (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null references public.sites(id),
  customer_id         uuid not null references public.customers(id),
  advance_date        date not null,
  amount              numeric(18,2) not null check (amount > 0),
  applied             numeric(18,2) not null default 0,
  currency            text not null check (currency in ('USD','CDF')),
  exchange_rate       numeric(14,4) not null,
  treasury_account_id uuid not null references public.treasury_accounts(id),
  reference           text not null default '',
  entry_id            uuid references public.journal_entries(id) on delete set null,
  created_by          uuid not null references public.profiles(id),
  created_at          timestamptz not null default now()
);
create table if not exists public.advance_applications (
  id                uuid primary key default gen_random_uuid(),
  advance_id        uuid not null references public.customer_advances(id),
  invoice_id        uuid not null references public.customer_invoices(id),
  amount            numeric(18,2) not null check (amount > 0),
  application_date  date not null,
  entry_id          uuid references public.journal_entries(id),
  cancelled_at      timestamptz,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now()
);
alter table public.customer_advances    enable row level security;
alter table public.advance_applications enable row level security;
drop policy if exists advances_read on public.customer_advances;
create policy advances_read on public.customer_advances for select to authenticated
  using (public.has_site_access(site_id));
drop policy if exists applications_read on public.advance_applications;
create policy applications_read on public.advance_applications for select to authenticated
  using (exists (select 1 from public.customer_advances a where a.id = advance_id and public.has_site_access(a.site_id)));
grant select on public.customer_advances, public.advance_applications to authenticated;

create or replace function public.record_customer_advance(
  p_site uuid, p_customer uuid, p_date date, p_amount numeric, p_treasury uuid, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t treasury_accounts; v_rate numeric; v_cust text; v_id uuid; v_entry uuid; v_amt numeric := round(p_amount,2);
begin
  perform public._require_site(p_site);
  if v_amt is null or v_amt <= 0 then raise exception 'Montant invalide'; end if;
  select name into v_cust from customers where id = p_customer and site_id = p_site;
  if v_cust is null then raise exception 'Client introuvable sur ce site'; end if;
  select * into t from treasury_accounts where id = p_treasury and site_id = p_site and active;
  if not found then raise exception 'Caisse ou banque introuvable'; end if;
  select usd_cdf_rate into v_rate from sites where id = p_site;
  insert into customer_advances (site_id, customer_id, advance_date, amount, currency, exchange_rate,
                                 treasury_account_id, reference, created_by)
  values (p_site, p_customer, p_date, v_amt, t.currency, v_rate, p_treasury, coalesce(p_reference,''), auth.uid())
  returning id into v_id;
  v_entry := public._insert_entry(p_site, case when t.kind = 'caisse' then 'CA' else 'BQ' end, p_date,
    coalesce(p_reference,''), 'Acompte reçu – ' || v_cust, t.currency, v_rate, 'acompte', v_id,
    jsonb_build_array(
      jsonb_build_object('account_code', t.account_code, 'debit', v_amt),
      jsonb_build_object('account_code', '4191', 'credit', v_amt)));
  update customer_advances set entry_id = v_entry where id = v_id;
  return v_id;
end $$;

create or replace function public.delete_customer_advance(p_advance uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a customer_advances;
begin
  select * into a from customer_advances where id = p_advance for update;
  if not found then raise exception 'Acompte introuvable'; end if;
  perform public._require_site(a.site_id);
  if a.applied > 0 then raise exception 'Acompte déjà imputé sur une facture : retirez d''abord l''imputation'; end if;
  delete from advance_applications where advance_id = p_advance;
  delete from customer_advances where id = p_advance;
  if a.entry_id is not null then delete from journal_entries where id = a.entry_id; end if;
  perform public._audit(a.site_id, 'acompte.supprime', 'customer_advance', p_advance::text,
    jsonb_build_object('montant', a.amount, 'devise', a.currency));
end $$;

create or replace function public.apply_customer_advance(p_advance uuid, p_invoice uuid, p_date date default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare a customer_advances; ci customer_invoices; v_amt numeric; v_du numeric; v_cu numeric; v_fx numeric;
        v_lines jsonb; v_entry uuid; v_date date := coalesce(p_date, current_date);
begin
  select * into a from customer_advances where id = p_advance for update;
  if not found then raise exception 'Acompte introuvable'; end if;
  select * into ci from customer_invoices where id = p_invoice for update;
  if not found then raise exception 'Facture introuvable'; end if;
  perform public._require_site(a.site_id);
  if ci.site_id <> a.site_id or ci.customer_id <> a.customer_id then raise exception 'Acompte d''un autre client ou site'; end if;
  if ci.currency <> a.currency then raise exception 'Devise différente (acompte %, facture %)', a.currency, ci.currency; end if;
  if ci.status not in ('emise','partielle') then raise exception 'Facture déjà soldée ou annulée'; end if;
  v_amt := least(a.amount - a.applied, ci.total - ci.amount_paid);
  if v_amt <= 0 then raise exception 'Rien à imputer'; end if;
  v_du := public._to_usd(v_amt, a.currency, a.exchange_rate);
  v_cu := public._to_usd(v_amt, ci.currency, ci.exchange_rate);
  v_fx := v_du - v_cu;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code','4191','label','Imputation acompte ' || ci.number,'debit', v_amt,'debit_usd', v_du),
    jsonb_build_object('account_code','411','label','Imputation acompte ' || ci.number,'credit', v_amt,'credit_usd', v_cu));
  if v_fx > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','776','label','Gain de change ' || ci.number,'credit',0,'credit_usd', v_fx));
  elsif v_fx < 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code','676','label','Perte de change ' || ci.number,'debit',0,'debit_usd', -v_fx));
  end if;
  v_entry := public._insert_entry(a.site_id, 'OD', v_date, ci.number, 'Imputation acompte sur ' || ci.number,
                                  ci.currency, ci.exchange_rate, 'imputation', a.id, v_lines);
  insert into advance_applications (advance_id, invoice_id, amount, application_date, entry_id, created_by)
  values (a.id, ci.id, v_amt, v_date, v_entry, auth.uid());
  update customer_advances set applied = applied + v_amt where id = a.id;
  update customer_invoices set amount_paid = amount_paid + v_amt,
    status = case when amount_paid + v_amt >= total then 'payee' else 'partielle' end where id = ci.id;
  return v_amt;
end $$;

create or replace function public.cancel_advance_application(p_application uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ap advance_applications; a customer_advances; v_lines jsonb; ci customer_invoices;
begin
  select * into ap from advance_applications where id = p_application for update;
  if not found or ap.cancelled_at is not null then raise exception 'Imputation introuvable'; end if;
  select * into a from customer_advances where id = ap.advance_id for update;
  select * into ci from customer_invoices where id = ap.invoice_id for update;
  perform public._require_site(a.site_id);
  select jsonb_agg(jsonb_build_object('account_code', account_code, 'label', 'Retrait imputation ' || ci.number,
           'debit', credit, 'credit', debit, 'debit_usd', credit_usd, 'credit_usd', debit_usd) order by id)
    into v_lines from entry_lines where entry_id = ap.entry_id;
  perform public._insert_entry(a.site_id, 'OD', current_date, ci.number, 'Retrait imputation acompte ' || ci.number,
                               ci.currency, ci.exchange_rate, 'annulation', ap.id, v_lines, ap.entry_id);
  update advance_applications set cancelled_at = now() where id = ap.id;
  update customer_advances set applied = applied - ap.amount where id = a.id;
  update customer_invoices set amount_paid = amount_paid - ap.amount,
    status = case when amount_paid - ap.amount <= 0 then 'emise' else 'partielle' end where id = ci.id;
end $$;

-- ---------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------
grant execute on function
  public.admin_set_site_mentions(uuid,text,text,text,text),
  public.update_manual_entry(uuid,text,date,text,text,text,jsonb),
  public.delete_manual_entry(uuid),
  public.create_quote(uuid,uuid,date,date,text,numeric,jsonb,text),
  public.set_quote_status(uuid,text), public.delete_quote(uuid),
  public.convert_quote(uuid,date,date),
  public.record_customer_advance(uuid,uuid,date,numeric,uuid,text),
  public.delete_customer_advance(uuid),
  public.apply_customer_advance(uuid,uuid,date),
  public.cancel_advance_application(uuid)
to authenticated;
