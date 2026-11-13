\set ON_ERROR_STOP 1
\set QUIET 1
-- Utilisateurs
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@kbs.test', '{"full_name":"Admin KBS","role":"admin"}'),
  ('00000000-0000-0000-0000-00000000000c', 'compta@kbs.test', '{"full_name":"Comptable Lubumbashi"}');
select role as "rôle du compte invité avec metadata admin (attendu comptable)" from profiles where email='admin@kbs.test';
update profiles set role = 'admin' where email = 'admin@kbs.test';

-- Admin : création des sites
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select admin_create_site('LUB', 'Lubumbashi', 'Lubumbashi', 'services', 'lub-2026', 2800) as lub \gset
select admin_create_site('KOL', 'Kolwezi', 'Kolwezi', 'transport', 'kol-2026', 2800) as kol \gset
select admin_set_assignments('00000000-0000-0000-0000-00000000000c', array[:'lub']::uuid[]);

-- Comptable
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select count(*) as "sites visibles (attendu 1)" from sites;
\set ON_ERROR_STOP 0
select access_code_hash from sites;  -- doit échouer (colonne protégée)
select post_manual_entry(:'lub', 'OD', current_date, 'X', 'test', 'USD',
  '[{"account_code":"571","debit":10},{"account_code":"101","credit":10}]');  -- doit échouer (site non ouvert)
\set ON_ERROR_STOP 1
select open_site(:'lub', 'mauvais') is null as "code faux refusé";
select open_site(:'lub', 'lub-2026') is not null as "code correct accepté";
\set ON_ERROR_STOP 0
select open_site(:'kol', 'kol-2026');  -- doit échouer (non attribué)
select post_manual_entry(:'lub', 'OD', current_date, 'X', 'déséquilibre', 'USD',
  '[{"account_code":"571","debit":10},{"account_code":"101","credit":9}]');  -- doit échouer
\set ON_ERROR_STOP 1

-- Apport en capital
select post_manual_entry(:'lub', 'OD', '2026-11-01', 'PV-001', 'Apport en capital', 'USD',
  '[{"account_code":"5211","debit":10000},{"account_code":"101","credit":10000}]') is not null as "écriture manuelle";

-- Client + facture en CDF au taux 2800
insert into customers (site_id, name, email) values (:'lub', 'Gécamines SA', 'compta@client.test') returning id as cust \gset
select create_customer_invoice(:'lub', :'cust', '2026-11-02', '2026-11-10', 'CDF', 16,
  '[{"description":"Mission de conseil","quantity":1,"unit_price":2800000,"account_code":"7064"}]') as inv \gset
select number, subtotal, vat_amount, total, status from customer_invoices where id = :'inv';

-- Le taux passe à 2900 puis règlement partiel puis solde
select set_site_rate(:'lub', 2900);
select treasury.id as bq_cdf from treasury_accounts treasury where site_id = :'lub' and account_code = '5212' \gset
select record_payment(:'lub', 'reglement_client', '2026-11-05', 1000000, 0, 'CDF', :'bq_cdf', :'inv', null, null, null, '', 'VIR-1') is not null as "règlement partiel";
select record_payment(:'lub', 'reglement_client', '2026-11-06', 2248000, 0, 'CDF', :'bq_cdf', :'inv', null, null, null, '', 'VIR-2') is not null as "solde";
select status, amount_paid from customer_invoices where id = :'inv';

-- Facture fournisseur : brouillon (proposition IA) puis validation
select create_supplier_invoice(:'lub', null, 'Vodacom Congo', 'VC-889', '2026-11-03', '2026-11-20', 'USD',
  100, 16, 116, '628', 'Facture internet novembre', null, '{"account_code":"628","confidence":0.9}') as sinv \gset
select validate_supplier_invoice(:'sinv', null, 'VC-889', '2026-11-03', '2026-11-20', '628', 100, 16) is not null as "validée";
select treasury.id as cs_usd from treasury_accounts treasury where site_id = :'lub' and account_code = '5711' \gset
\set ON_ERROR_STOP 0
select record_payment(:'lub', 'reglement_fournisseur', '2026-11-07', 116, 0, 'USD', :'bq_cdf', null, :'sinv', null, null, '', ''); -- devise différente → doit échouer
\set ON_ERROR_STOP 1
select record_payment(:'lub', 'reglement_fournisseur', '2026-11-07', 116, 0, 'USD', :'cs_usd', null, :'sinv', null, null, '', '') is not null as "fournisseur réglé";

-- Dépense et recette du jour
select record_payment(:'lub', 'depense', '2026-11-08', 50, 0, 'USD', :'cs_usd', null, null, null, '6055', 'Ramettes papier', 'R-12') is not null as "dépense";
select record_payment(:'lub', 'recette', '2026-11-08', 232, 32, 'USD', :'cs_usd', null, null, null, '706', 'Recettes du jour', '') is not null as "recette";

-- Contre-passation manuelle
select id as man from journal_entries where label = 'Apport en capital' \gset
select reverse_entry(:'man', '2026-11-09') is not null as "contre-passation";
\set ON_ERROR_STOP 0
select reverse_entry(:'man', '2026-11-09');  -- doit échouer (déjà contre-passée)
\set ON_ERROR_STOP 1

-- Contrôles
select sum(debit_usd) = sum(credit_usd) as "balance USD équilibrée", sum(debit_usd) total_debit from entry_lines;
select e.number, e.journal_code, e.label, sum(l.debit_usd) d, sum(l.credit_usd) c
from journal_entries e join entry_lines l on l.entry_id = e.id group by e.number, e.journal_code, e.label
having sum(l.debit_usd) <> sum(l.credit_usd);
select account_code, label, period_debit, period_credit, closing_debit, closing_credit
from report_trial_balance(array[:'lub']::uuid[], '2026-11-01', '2026-11-30');
select * from report_site_summary(array[:'lub']::uuid[], '2026-11-01', '2026-11-30');
select entry_date, journal_code, label, debit_usd, credit_usd, balance_usd from report_ledger(array[:'lub']::uuid[], '411', '2026-11-01', '2026-11-30');
select action, entity, details->>'comptes' comptes from audit_log order by id;

-- Fermeture : plus d'accès
select close_site(:'lub');
select count(*) as "écritures visibles après fermeture (attendu 0)" from journal_entries;
reset role;
