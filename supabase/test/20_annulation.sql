\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select id as lub from sites where code = 'LUB' \gset
select open_site(:'lub', 'lub-2026') is not null as "réouverture";
select id as cust from customers limit 1 \gset
select create_customer_invoice(:'lub', :'cust', '2026-11-12', '2026-12-12', 'USD', 16,
  '[{"description":"Audit","quantity":2,"unit_price":500,"account_code":"7064"}]') as inv \gset
select cancel_customer_invoice(:'inv', '2026-11-13');
select number, status from customer_invoices where id = :'inv';
select create_supplier_invoice(:'lub', null, 'Test', 'X1', '2026-11-12', null, 'CDF', 0, 0, 0, null, 'texte', null, null) as s2 \gset
select reject_supplier_invoice(:'s2');
select status from supplier_invoices where id = :'s2';
select count(*) filter (where status='annulee') annulees, (select sum(debit_usd)-sum(credit_usd) from entry_lines) ecart_global from customer_invoices;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select admin_set_site_code(:'lub', 'nouveau-code');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select has_site_access(:'lub') as "accès après changement de code (attendu f)";
select count(*) as "profils visibles" from profiles;
reset role;
