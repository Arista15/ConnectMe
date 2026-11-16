import Link from "next/link";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import { PageHeader, Panel, Empty, Seg, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { money, dateFr, today } from "@/lib/format";

export const metadata = { title: "Factures fournisseurs" };

const TABS: [string, string][] = [["", "Toutes"], ["brouillon", "À valider"], ["a_payer", "À payer"], ["payee", "Réglées"], ["rejetee", "Rejetées"]];

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
  const toPay = (cur: string) => (invoices ?? []).filter((i) => ["validee", "partielle"].includes(i.status) && i.currency === cur)
    .reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);

  return (
    <>
      <PageHeader
        title="Factures fournisseurs"
        subtitle={<>La validation passe l&apos;écriture 60x / 4452 / 401. Reste à payer : <span className="num fw-500">{money(toPay("USD"), "USD")}</span> · <span className="num fw-500">{money(toPay("CDF"), "CDF")}</span></>}
        actions={<Link href="/espace/factures-fournisseurs/nouvelle" className="btn"><Icon name="plus" /> Nouvelle facture fournisseur</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <Seg items={TABS.map(([k, v]) => ({ href: k ? `?statut=${k}` : "?", label: v, active: (sp.statut ?? "") === k }))} />
      <Panel>
        {(invoices ?? []).length === 0 ? <Empty>Aucune facture fournisseur.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Fournisseur</th><th>Réf.</th><th>Compte</th><th>Échéance</th><th className="num">TTC</th><th className="num">Reste dû</th><th>Statut</th><th className="t-right">Actions</th></tr></thead>
            <tbody>
              {(invoices ?? []).map((i) => (
                <tr key={i.id}>
                  <td className="mono">{dateFr(i.invoice_date)}</td>
                  <td className="fw-500">{i.supplier_name || "(sans nom)"}</td>
                  <td className="mono xs">{i.reference}</td>
                  <td className="mono">{i.expense_account}</td>
                  <td className="nowrap"><span className="num">{dateFr(i.due_date)}</span> {["validee", "partielle"].includes(i.status) && i.due_date && i.due_date < t && <span className="badge err">En retard</span>}</td>
                  <td className="num">{money(i.total, i.currency)}</td>
                  <td className="num fw-600">{["validee", "partielle"].includes(i.status) ? money(Number(i.total) - Number(i.amount_paid), i.currency) : "—"}</td>
                  <td><Status status={i.status} /></td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/espace/factures-fournisseurs/${i.id}`} className="btn ghost sm">
                        {i.status === "brouillon" ? "Valider" : ["validee", "partielle"].includes(i.status) ? "Payer" : "Voir"}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
