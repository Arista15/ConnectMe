import Link from "next/link";
import Flash from "@/components/Flash";
import AccountSelect from "@/components/AccountSelect";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { getTreasuries } from "@/lib/treasury";
import { money, dateFr, today, monthBounds, isDate, rel } from "@/lib/format";
import { recordPayment, toggleReconciled, saveTreasuryAccount } from "../actions";

export const metadata = { title: "Caisse & banque" };

const KIND: Record<string, string> = {
  reglement_client: "Règlement client", reglement_fournisseur: "Règlement fournisseur", depense: "Dépense", recette: "Recette",
};

export default async function TreasuryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const treasuries = await getTreasuries(site.id);
  const mb = monthBounds();
  const from = isDate(sp.du) ? sp.du : mb.from;
  const to = isDate(sp.au) ? sp.au : mb.to;
  const back = `/espace/tresorerie?${new URLSearchParams({ du: from, au: to, ...(sp.compte ? { compte: sp.compte } : {}), ...(sp.nr ? { nr: sp.nr } : {}) })}`;

  let pq = supabase.from("payments")
    .select("id, kind, payment_date, amount, currency, label, reference, reconciled, treasury_account_id, treasury_accounts(name)")
    .eq("site_id", site.id).gte("payment_date", from).lte("payment_date", to)
    .order("payment_date", { ascending: false }).limit(500);
  if (sp.compte) pq = pq.eq("treasury_account_id", sp.compte);
  if (sp.nr) pq = pq.eq("reconciled", false);

  const [{ data: payments }, { data: openCust }, { data: openSup }] = await Promise.all([
    pq,
    supabase.from("customer_invoices").select("id, number, currency, total, amount_paid, customers(name)")
      .eq("site_id", site.id).in("status", ["emise", "partielle"]).order("due_date"),
    supabase.from("supplier_invoices").select("id, supplier_name, reference, currency, total, amount_paid")
      .eq("site_id", site.id).in("status", ["validee", "partielle"]).order("due_date"),
  ]);

  const tOpts = treasuries.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.currency})</option>);

  return (
    <>
      <div className="page-head">
        <div><h1>Caisse & banque</h1><p className="muted">Soldes en devise, règlements et rapprochement.</p></div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-4">
        {treasuries.map((t) => (
          <Link key={t.id} href={`/espace/tresorerie?compte=${t.id}`} className="card kpi" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="label">{t.name} · {t.account_code}</div>
            <div className="value">{money(t.balance, t.currency)}</div>
            {t.unreconciled > 0 && <span className="badge warn">{t.unreconciled} non rapproché(s)</span>}
            {t.balance < 0 && t.kind === "caisse" && <span className="badge err">Caisse négative</span>}
          </Link>
        ))}
      </div>

      <div className="grid grid-2">
        <form action={recordPayment} className="card">
          <h3 style={{ marginTop: 0 }}>Encaisser une facture client</h3>
          <input type="hidden" name="kind" value="reglement_client" />
          <input type="hidden" name="back" value={back} />
          <div className="field">
            <label>Facture</label>
            <select name="customer_invoice_id" required defaultValue="">
              <option value="" disabled>— Choisir —</option>
              {(openCust ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} · {rel(i.customers)?.name} · reste {money(Number(i.total) - Number(i.amount_paid), i.currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <div><label>Montant (devise de la facture)</label><input name="amount" inputMode="decimal" required /></div>
            <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <div><label>Sur</label><select name="treasury_account_id" required>{tOpts}</select></div>
            <div><label>Référence</label><input name="reference" /></div>
          </div>
          <button className="btn" style={{ marginTop: 10 }}>Encaisser</button>
        </form>

        <form action={recordPayment} className="card">
          <h3 style={{ marginTop: 0 }}>Payer une facture fournisseur</h3>
          <input type="hidden" name="kind" value="reglement_fournisseur" />
          <input type="hidden" name="back" value={back} />
          <div className="field">
            <label>Facture</label>
            <select name="supplier_invoice_id" required defaultValue="">
              <option value="" disabled>— Choisir —</option>
              {(openSup ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.supplier_name} {i.reference} · reste {money(Number(i.total) - Number(i.amount_paid), i.currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <div><label>Montant (devise de la facture)</label><input name="amount" inputMode="decimal" required /></div>
            <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <div><label>Depuis</label><select name="treasury_account_id" required>{tOpts}</select></div>
            <div><label>Référence</label><input name="reference" /></div>
          </div>
          <button className="btn" style={{ marginTop: 10 }}>Payer</button>
        </form>
      </div>

      <h2>Mouvements & rapprochement</h2>
      <form className="card row no-print" method="get">
        <div><label>Du</label><input type="date" name="du" defaultValue={from} /></div>
        <div><label>Au</label><input type="date" name="au" defaultValue={to} /></div>
        <div>
          <label>Compte</label>
          <select name="compte" defaultValue={sp.compte ?? ""}>
            <option value="">Tous</option>
            {treasuries.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="shrink" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" id="nr" name="nr" value="1" defaultChecked={!!sp.nr} style={{ width: "auto" }} />
          <label htmlFor="nr" style={{ margin: 0 }}>Non rapprochés seulement</label>
        </div>
        <button className="btn shrink">Filtrer</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Libellé</th><th>Réf.</th><th>Compte</th><th className="num">Entrée</th><th className="num">Sortie</th><th>Rapproché</th></tr></thead>
          <tbody>
            {(payments ?? []).map((p) => {
              const inflow = p.kind === "reglement_client" || p.kind === "recette";
              return (
                <tr key={p.id}>
                  <td>{dateFr(p.payment_date)}</td><td>{KIND[p.kind]}</td><td>{p.label}</td><td>{p.reference}</td>
                  <td>{rel(p.treasury_accounts)?.name}</td>
                  <td className="num">{inflow ? money(p.amount, p.currency) : ""}</td>
                  <td className="num">{!inflow ? money(p.amount, p.currency) : ""}</td>
                  <td>
                    <form action={toggleReconciled} style={{ display: "inline" }}>
                      <input type="hidden" name="payment_id" value={p.id} />
                      <input type="hidden" name="value" value={p.reconciled ? "0" : "1"} />
                      <input type="hidden" name="back" value={back} />
                      <button className={`btn sm ${p.reconciled ? "" : "ghost"}`}>{p.reconciled ? "✓ Rapproché" : "Rapprocher"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(payments ?? []).length === 0 && <tr><td colSpan={8} className="muted">Aucun mouvement sur la période.</td></tr>}
          </tbody>
        </table>
      </div>

      <details className="card" style={{ marginTop: 16 }}>
        <summary><strong>Ajouter une caisse ou un compte bancaire</strong></summary>
        <form action={saveTreasuryAccount} className="row" style={{ marginTop: 10 }}>
          <div><label>Nom</label><input name="name" placeholder="ex. Rawbank USD" required /></div>
          <div><label>Type</label><select name="kind"><option value="banque">Banque</option><option value="caisse">Caisse</option></select></div>
          <div><label>Devise</label><select name="currency"><option>USD</option><option>CDF</option></select></div>
          <div><label>Compte SYSCOHADA</label><AccountSelect name="account_code" accounts={accounts} sector={site.sector} classes={[5]} required /></div>
          <button className="btn shrink">Ajouter</button>
        </form>
        <p className="small muted">Utilisez un sous-compte distinct par banque pour obtenir des soldes séparés (créez-le dans le plan comptable si besoin).</p>
      </details>
    </>
  );
}
