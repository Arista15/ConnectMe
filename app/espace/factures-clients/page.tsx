import Link from "next/link";
import Flash from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { money, dateFr, today, INVOICE_STATUS, rel } from "@/lib/format";

export const metadata = { title: "Factures clients" };

const badge: Record<string, string> = { emise: "", partielle: "warn", payee: "ok", annulee: "err" };

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
      <div className="page-head">
        <div>
          <h1>Factures clients</h1>
          <p className="muted">Reste à encaisser : {money(due("USD"), "USD")} · {money(due("CDF"), "CDF")}</p>
        </div>
        <Link href="/espace/factures-clients/nouvelle" className="btn">Nouvelle facture</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="tabs">
        {[["", "Toutes"], ["ouvertes", "À encaisser"], ["payee", "Réglées"], ["annulee", "Annulées"]].map(([k, v]) => (
          <Link key={k} href={k ? `?statut=${k}` : "?"} className={(sp.statut ?? "") === k ? "active" : ""}>{v}</Link>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>N°</th><th>Client</th><th>Date</th><th>Échéance</th><th className="num">Total</th><th className="num">Reste dû</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((i) => {
              const late = ["emise", "partielle"].includes(i.status) && i.due_date < t;
              return (
                <tr key={i.id}>
                  <td><Link href={`/espace/factures-clients/${i.id}`}>{i.number}</Link></td>
                  <td>{rel(i.customers)?.name}</td>
                  <td>{dateFr(i.issue_date)}</td>
                  <td>{dateFr(i.due_date)} {late && <span className="badge err">En retard</span>}</td>
                  <td className="num">{money(i.total, i.currency)}</td>
                  <td className="num">{i.status === "annulee" ? "—" : money(Number(i.total) - Number(i.amount_paid), i.currency)}</td>
                  <td><span className={`badge ${badge[i.status]}`}>{INVOICE_STATUS[i.status]}</span></td>
                </tr>
              );
            })}
            {(invoices ?? []).length === 0 && <tr><td colSpan={7} className="muted">Aucune facture.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
