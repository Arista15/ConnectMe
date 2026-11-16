import Link from "next/link";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import { PageHeader, Panel, Empty, Seg, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { money, dateFr, today, rel } from "@/lib/format";

export const metadata = { title: "Factures clients" };

const TABS: [string, string][] = [["", "Toutes"], ["ouvertes", "À encaisser"], ["payee", "Réglées"], ["annulee", "Annulées"]];

export default async function CustomerInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const supabase = await createClient();
  let query = supabase
    .from("customer_invoices")
    .select("id, number, issue_date, due_date, currency, total, amount_paid, status, customers(name)")
    .eq("site_id", site.id).order("issue_date", { ascending: false }).order("number", { ascending: false }).limit(300);
  if (sp.statut === "ouvertes") query = query.in("status", ["emise", "partielle"]);
  else if (sp.statut) query = query.eq("status", sp.statut);
  const { data: invoices } = await query;
  const t = today();

  const open = (invoices ?? []).filter((i) => ["emise", "partielle"].includes(i.status));
  const due = (cur: string) => open.filter((i) => i.currency === cur).reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);

  return (
    <>
      <PageHeader
        title="Factures clients"
        subtitle={<>L&apos;émission passe automatiquement l&apos;écriture de vente (411 / 70x / 4431). Reste à encaisser : <span className="num fw-500">{money(due("USD"), "USD")}</span> · <span className="num fw-500">{money(due("CDF"), "CDF")}</span></>}
        actions={<Link href="/espace/factures-clients/nouvelle" className="btn"><Icon name="plus" /> Nouvelle facture</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <Seg items={TABS.map(([k, v]) => ({ href: k ? `?statut=${k}` : "?", label: v, active: (sp.statut ?? "") === k }))} />
      <Panel>
        {(invoices ?? []).length === 0 ? <Empty>Aucune facture.</Empty> : (
          <table>
            <thead>
              <tr><th>N°</th><th>Date</th><th>Client</th><th>Échéance</th><th className="num">Total TTC</th><th className="num">Reçu</th><th className="num">Reste dû</th><th>Statut</th><th className="t-right">Actions</th></tr>
            </thead>
            <tbody>
              {(invoices ?? []).map((i) => {
                const late = ["emise", "partielle"].includes(i.status) && i.due_date < t;
                const rest = Number(i.total) - Number(i.amount_paid);
                return (
                  <tr key={i.id}>
                    <td className="mono xs"><Link href={`/espace/factures-clients/${i.id}`}>{i.number}</Link></td>
                    <td className="mono">{dateFr(i.issue_date)}</td>
                    <td>{rel(i.customers)?.name ?? "—"}</td>
                    <td className="nowrap"><span className="num">{dateFr(i.due_date)}</span> {late && <span className="badge err">En retard</span>}</td>
                    <td className="num">{money(i.total, i.currency)}</td>
                    <td className="num">{Number(i.amount_paid) > 0 ? money(i.amount_paid, i.currency) : "—"}</td>
                    <td className="num fw-600">{i.status === "annulee" || rest <= 0 ? "—" : money(rest, i.currency)}</td>
                    <td><Status status={i.status} /></td>
                    <td>
                      <div className="row-actions">
                        {["emise", "partielle"].includes(i.status) && <Link href={`/espace/factures-clients/${i.id}#reglement`} className="btn ghost sm">Encaisser</Link>}
                        <Link href={`/espace/factures-clients/${i.id}`} className="btn plain sm icon" title="Voir / imprimer"><Icon name="printer" /></Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
