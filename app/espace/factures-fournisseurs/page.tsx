import Link from "next/link";
import Flash from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { money, dateFr, today, INVOICE_STATUS } from "@/lib/format";

export const metadata = { title: "Factures fournisseurs" };

const badge: Record<string, string> = { brouillon: "warn", validee: "", partielle: "warn", payee: "ok", rejetee: "err" };

export default async function SupplierInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const supabase = await createClient();
  let query = supabase
    .from("supplier_invoices")
    .select("id, supplier_name, reference, invoice_date, due_date, currency, total, amount_paid, status, expense_account")
    .eq("site_id", site.id).order("invoice_date", { ascending: false }).limit(300);
  if (sp.statut === "a_payer") query = query.in("status", ["validee", "partielle"]);
  else if (sp.statut) query = query.eq("status", sp.statut);
  const { data: invoices } = await query;
  const t = today();

  return (
    <>
      <div className="page-head">
        <div><h1>Factures fournisseurs</h1><p className="muted">Reçus analysés, validés par le comptable, puis réglés.</p></div>
        <Link href="/espace/factures-fournisseurs/nouvelle" className="btn gold">Analyser un reçu</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="tabs">
        {[["", "Toutes"], ["brouillon", "À valider"], ["a_payer", "À payer"], ["payee", "Réglées"], ["rejetee", "Rejetées"]].map(([k, v]) => (
          <Link key={k} href={k ? `?statut=${k}` : "?"} className={(sp.statut ?? "") === k ? "active" : ""}>{v}</Link>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fournisseur</th><th>Réf.</th><th>Date</th><th>Échéance</th><th>Compte</th><th className="num">Total</th><th className="num">Reste dû</th><th>Statut</th></tr></thead>
          <tbody>
            {(invoices ?? []).map((i) => (
              <tr key={i.id}>
                <td><Link href={`/espace/factures-fournisseurs/${i.id}`}>{i.supplier_name || "(sans nom)"}</Link></td>
                <td>{i.reference}</td>
                <td>{dateFr(i.invoice_date)}</td>
                <td>{dateFr(i.due_date)} {["validee", "partielle"].includes(i.status) && i.due_date && i.due_date < t && <span className="badge err">En retard</span>}</td>
                <td className="mono">{i.expense_account}</td>
                <td className="num">{money(i.total, i.currency)}</td>
                <td className="num">{["validee", "partielle"].includes(i.status) ? money(Number(i.total) - Number(i.amount_paid), i.currency) : "—"}</td>
                <td><span className={`badge ${badge[i.status]}`}>{INVOICE_STATUS[i.status]}</span></td>
              </tr>
            ))}
            {(invoices ?? []).length === 0 && <tr><td colSpan={8} className="muted">Aucune facture.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
