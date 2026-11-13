import Flash from "@/components/Flash";
import AccountSelect from "@/components/AccountSelect";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { getTreasuries } from "@/lib/treasury";
import { money, dateFr, today, monthBounds, isDate, rel } from "@/lib/format";
import { recordPayment } from "../actions";

export const metadata = { title: "Dépenses & recettes" };

const DEFAULT_REVENUE: Record<string, string> = { services: "706", btp: "705", transport: "7061" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const treasuries = await getTreasuries(site.id);
  const mb = monthBounds();
  const from = isDate(sp.du) ? sp.du : mb.from;
  const to = isDate(sp.au) ? sp.au : mb.to;
  const back = `/espace/depenses?du=${from}&au=${to}`;

  const [{ data: suppliers }, { data: moves }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("site_id", site.id).order("name"),
    supabase.from("payments")
      .select("id, kind, payment_date, amount, vat_amount, currency, exchange_rate, label, reference, counterpart_account, suppliers(name), treasury_accounts(name)")
      .eq("site_id", site.id).in("kind", ["depense", "recette", "reglement_fournisseur"])
      .gte("payment_date", from).lte("payment_date", to).order("payment_date", { ascending: false }).limit(500),
  ]);

  // Suivi par fournisseur (dépenses directes + règlements), contre-valeur USD
  const bySupplier = new Map<string, number>();
  for (const m of moves ?? []) {
    if (m.kind === "recette") continue;
    const name = rel(m.suppliers)?.name ?? "(sans fournisseur)";
    const usd = m.currency === "USD" ? Number(m.amount) : Number(m.amount) / Number(m.exchange_rate);
    bySupplier.set(name, (bySupplier.get(name) ?? 0) + usd);
  }
  const tOpts = treasuries.map((t) => <option key={t.id} value={t.id}>{t.name}</option>);
  const currencyHint = <p className="small muted">La devise est celle de la caisse ou de la banque choisie.</p>;

  return (
    <>
      <div className="page-head">
        <div><h1>Dépenses & recettes</h1><p className="muted">Dépenses payées comptant et recettes journalières, comptabilisées en caisse ou en banque.</p></div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-2">
        <form action={recordPayment} className="card">
          <h3 style={{ marginTop: 0 }}>Nouvelle dépense</h3>
          <input type="hidden" name="kind" value="depense" />
          <input type="hidden" name="back" value={back} />
          <div className="field"><label>Libellé</label><input name="label" required placeholder="ex. Carburant camion KN-1234" /></div>
          <div className="field"><label>Compte de charge</label><AccountSelect name="counterpart_account" accounts={accounts} sector={site.sector} classes={[2, 4, 6]} required /></div>
          <div className="row">
            <div><label>Montant TTC</label><input name="amount" inputMode="decimal" required /></div>
            <div><label>dont TVA</label><input name="vat_amount" inputMode="decimal" defaultValue="0" /></div>
            <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <div><label>Payé par</label><select name="treasury_account_id" required>{tOpts}</select></div>
            <div>
              <label>Fournisseur</label>
              <select name="supplier_id" defaultValue="">
                <option value="">—</option>
                {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label>N° reçu</label><input name="reference" required /></div>
          </div>
          {currencyHint}
          <button className="btn">Comptabiliser la dépense</button>
        </form>

        <form action={recordPayment} className="card">
          <h3 style={{ marginTop: 0 }}>Recette du jour</h3>
          <input type="hidden" name="kind" value="recette" />
          <input type="hidden" name="back" value={back} />
          <div className="field"><label>Libellé</label><input name="label" required defaultValue={`Recettes du ${dateFr(today())}`} /></div>
          <div className="field"><label>Compte de produit</label><AccountSelect name="counterpart_account" accounts={accounts} sector={site.sector} classes={[7]} defaultValue={DEFAULT_REVENUE[site.sector]} required /></div>
          <div className="row">
            <div><label>Montant TTC</label><input name="amount" inputMode="decimal" required /></div>
            <div><label>dont TVA</label><input name="vat_amount" inputMode="decimal" defaultValue="0" /></div>
            <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <div><label>Encaissé sur</label><select name="treasury_account_id" required>{tOpts}</select></div>
            <div><label>Référence</label><input name="reference" placeholder="Brouillard de caisse n°…" /></div>
          </div>
          {currencyHint}
          <button className="btn">Comptabiliser la recette</button>
        </form>
      </div>

      <form className="card row no-print" method="get">
        <div><label>Du</label><input type="date" name="du" defaultValue={from} /></div>
        <div><label>Au</label><input type="date" name="au" defaultValue={to} /></div>
        <button className="btn shrink">Afficher</button>
      </form>

      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Libellé</th><th>Compte</th><th>Fournisseur</th><th>Réf.</th><th className="num">Montant</th></tr></thead>
            <tbody>
              {(moves ?? []).map((m) => (
                <tr key={m.id}>
                  <td>{dateFr(m.payment_date)}</td>
                  <td>{m.kind === "recette" ? <span className="badge ok">Recette</span> : null} {m.label}</td>
                  <td className="mono">{m.counterpart_account}</td>
                  <td>{rel(m.suppliers)?.name}</td>
                  <td>{m.reference}</td>
                  <td className="num">{m.kind === "recette" ? "+" : "−"}{money(m.amount, m.currency)}</td>
                </tr>
              ))}
              {(moves ?? []).length === 0 && <tr><td colSpan={6} className="muted">Aucun mouvement.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Par fournisseur (USD)</h3>
          <table>
            <tbody>
              {[...bySupplier.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => (
                <tr key={name}><td>{name}</td><td className="num">{money(v)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
