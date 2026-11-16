import Flash from "@/components/Flash";
import Modal from "@/components/Modal";
import AccountSelect from "@/components/AccountSelect";
import { PageHeader, Panel, Empty } from "@/components/ui";
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
  let outUsd = 0;
  let inUsd = 0;
  for (const m of moves ?? []) {
    const usd = m.currency === "USD" ? Number(m.amount) : Number(m.amount) / Number(m.exchange_rate);
    if (m.kind === "recette") { inUsd += usd; continue; }
    outUsd += usd;
    const name = rel(m.suppliers)?.name ?? "(sans fournisseur)";
    bySupplier.set(name, (bySupplier.get(name) ?? 0) + usd);
  }
  const tOpts = treasuries.map((t) => <option key={t.id} value={t.id}>{t.name}</option>);
  const currencyHint = <p className="note">La devise est celle de la caisse ou de la banque choisie.</p>;

  return (
    <>
      <PageHeader
        title="Dépenses & recettes"
        subtitle={<>Sorties : <span className="num fw-500">{money(outUsd)}</span> · Recettes : <span className="num fw-500">{money(inUsd)}</span> · du {dateFr(from)} au {dateFr(to)}</>}
        actions={<>
          <Modal label="Recette du jour" title="Recette du jour" icon="plus" variant="ghost" size="lg">
            <form action={recordPayment}>
              <input type="hidden" name="kind" value="recette" />
              <input type="hidden" name="back" value={back} />
              <div className="form-grid">
                <div className="span-2"><label>Libellé</label><input name="label" required defaultValue={`Recettes du ${dateFr(today())}`} /></div>
                <div className="span-2"><label>Compte de produit</label><AccountSelect name="counterpart_account" accounts={accounts} sector={site.sector} classes={[7]} defaultValue={DEFAULT_REVENUE[site.sector]} required /></div>
                <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
                <div><label>Encaissé sur</label><select name="treasury_account_id" required>{tOpts}</select></div>
                <div><label>Montant TTC</label><input name="amount" inputMode="decimal" required /></div>
                <div><label>dont TVA</label><input name="vat_amount" inputMode="decimal" defaultValue="0" /></div>
                <div className="span-2"><label>Référence</label><input name="reference" placeholder="Brouillard de caisse n°…" /></div>
              </div>
              {currencyHint}
              <div className="form-foot"><button className="btn">Enregistrer et valider</button></div>
            </form>
          </Modal>
          <Modal label="Nouvelle dépense" title="Nouvelle dépense" icon="plus" size="lg">
            <form action={recordPayment}>
              <input type="hidden" name="kind" value="depense" />
              <input type="hidden" name="back" value={back} />
              <div className="form-grid">
                <div className="span-2"><label>Description</label><input name="label" required placeholder="ex. Carburant camion KN-1234" /></div>
                <div className="span-2"><label>Compte de charge</label><AccountSelect name="counterpart_account" accounts={accounts} sector={site.sector} classes={[2, 4, 6]} required /></div>
                <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
                <div>
                  <label>Fournisseur</label>
                  <select name="supplier_id" defaultValue="">
                    <option value="">—</option>
                    {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label>Mode de paiement</label><select name="treasury_account_id" required>{tOpts}</select></div>
                <div><label>N° reçu</label><input name="reference" required /></div>
                <div><label>Montant TTC</label><input name="amount" inputMode="decimal" required /></div>
                <div><label>dont TVA récupérable</label><input name="vat_amount" inputMode="decimal" defaultValue="0" /></div>
              </div>
              {currencyHint}
              <div className="form-foot"><button className="btn">Enregistrer et valider</button></div>
            </form>
          </Modal>
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <form className="filters toolbar no-print" method="get">
        <label>Du<input type="date" name="du" defaultValue={from} /></label>
        <label>Au<input type="date" name="au" defaultValue={to} /></label>
        <button className="btn ghost">Afficher</button>
      </form>

      <div className="cols-2-1">
        <Panel>
          {(moves ?? []).length === 0 ? <Empty>Aucune dépense ni recette sur la période.</Empty> : (
            <table>
              <thead><tr><th>Date</th><th>Compte</th><th>Description</th><th>Fournisseur</th><th>Paiement</th><th>Réf.</th><th className="num">Montant TTC</th></tr></thead>
              <tbody>
                {(moves ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{dateFr(m.payment_date)}</td>
                    <td className="mono">{m.counterpart_account}</td>
                    <td>{m.kind === "recette" && <span className="badge ok">Recette</span>} {m.label}</td>
                    <td>{rel(m.suppliers)?.name ?? "—"}</td>
                    <td className="xs">{rel(m.treasury_accounts)?.name}</td>
                    <td className="mono xs">{m.reference}</td>
                    <td className={`num${m.kind === "recette" ? " t-success" : ""}`}>{m.kind === "recette" ? "+" : "−"}{money(m.amount, m.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Par fournisseur (USD)">
          {bySupplier.size === 0 ? <Empty>—</Empty> : (
            <table>
              <tbody>
                {[...bySupplier.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => (
                  <tr key={name}><td>{name}</td><td className="num">{money(v)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
