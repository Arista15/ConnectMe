import Link from "next/link";
import Flash from "@/components/Flash";
import AccountSelect from "@/components/AccountSelect";
import { PageHeader, Panel, Empty, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getOpenSiteById, getAccounts } from "@/lib/session";
import { money, dateFr, today } from "@/lib/format";
import { quickSupplierInvoice } from "../../../parite-actions";

export const metadata = { title: "Saisie des factures" };

export default async function QuickSupplier({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getOpenSiteById(id);
  const accounts = await getAccounts();
  const supabase = await createClient();
  const [{ data: suppliers }, { data: recent }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("site_id", site.id).order("name"),
    supabase.from("supplier_invoices").select("id, invoice_date, supplier_name, reference, expense_account, total, currency, exchange_rate, status")
      .eq("site_id", site.id).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <>
      <PageHeader title={`Saisie des factures — ${site.code} ${site.name}`}
        subtitle="La validation crée automatiquement l'écriture d'achat (compte de charge / TVA 4452 / fournisseur 401)." />
      <Flash ok={sp.ok} err={sp.err} />
      <form action={quickSupplierInvoice} className="card" style={{ padding: "1rem" }}>
        <input type="hidden" name="site_id" value={site.id} />
        <div className="form-grid g4">
          <div><label>Date</label><input type="date" name="date" defaultValue={today()} /></div>
          <div>
            <label>Fournisseur</label>
            <select name="supplier_id" defaultValue="">
              <option value="">— Nouveau / aucun —</option>
              {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label>Nouveau fournisseur</label><input name="new_supplier" placeholder="Nom (optionnel)" /></div>
          <div><label>N° facture</label><input name="ref" /></div>
          <div><label>Compte</label><AccountSelect name="account" accounts={accounts} sector={site.sector} classes={[2, 6]} defaultValue="601" required /></div>
          <div className="span-2"><label>Libellé</label><input name="description" required /></div>
          <div><label>Montant HT</label><input name="amount" type="number" step="0.01" required /></div>
          <div><label>TVA</label><input name="tax" type="number" step="0.01" placeholder="16 % du HT" /></div>
          <div><label>Devise</label><select name="currency"><option>USD</option><option>CDF</option></select></div>
          <div><label>Taux (FC par $)</label><input value={Number(site.usd_cdf_rate)} readOnly className="mono" title="Taux du site, appliqué à la pièce" /></div>
        </div>
        <div className="form-foot">
          <span className="grow small t-muted">Total TTC = HT + TVA, au taux du site.</span>
          <button className="btn">Enregistrer et passer l&apos;écriture</button>
        </div>
      </form>
      <Panel title="Dernières factures du site" actions={<Link href={`/espace/site/${site.id}`}>Retour au site →</Link>}>
        {(recent ?? []).length === 0 ? <Empty>Aucune facture.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Fournisseur</th><th>Réf.</th><th>Compte</th><th className="num">TTC</th><th className="num">Taux</th><th>Statut</th></tr></thead>
            <tbody>
              {(recent ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono">{dateFr(r.invoice_date)}</td><td>{r.supplier_name || "—"}</td><td className="mono xs">{r.reference}</td><td className="mono">{r.expense_account}</td>
                  <td className="num">{money(r.total, r.currency)}</td><td className="num">{Number(r.exchange_rate).toLocaleString("fr-FR")}</td><td><Status status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
