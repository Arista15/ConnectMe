import Link from "next/link";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getOpenSiteById } from "@/lib/session";
import { money, dateFr, rel } from "@/lib/format";
import { reminder } from "@/lib/reminder";

export const metadata = { title: "Suivi des paiements" };

type Item = { id: string; tiers: string; ref: string; date: string; due: string | null; total: number; reste: number; currency: string; rate: number; paid: boolean };
const rank = (i: Item, verb: string) => (i.paid ? { label: "Payée", cls: "t-muted", rank: 4 } : reminder(i.due, verb));
const usd = (v: number, cur: string, rate: number) => (cur === "USD" ? v : v / rate);

export default async function PaymentsFollowUp({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await getOpenSiteById(id);
  const supabase = await createClient();
  const [{ data: ci }, { data: si }] = await Promise.all([
    supabase.from("customer_invoices").select("id, number, issue_date, due_date, total, amount_paid, currency, exchange_rate, status, customers(name)")
      .eq("site_id", site.id).in("status", ["emise", "partielle", "payee"]).order("due_date"),
    supabase.from("supplier_invoices").select("id, reference, supplier_name, invoice_date, due_date, total, amount_paid, currency, exchange_rate, status")
      .eq("site_id", site.id).in("status", ["validee", "partielle", "payee"]).order("due_date"),
  ]);
  const clients: Item[] = (ci ?? []).map((i) => ({ id: i.id, tiers: rel(i.customers)?.name ?? "—", ref: i.number, date: i.issue_date, due: i.due_date,
    total: Number(i.total), reste: Number(i.total) - Number(i.amount_paid), currency: i.currency, rate: Number(i.exchange_rate), paid: i.status === "payee" }));
  const suppliers: Item[] = (si ?? []).map((i) => ({ id: i.id, tiers: i.supplier_name || "—", ref: i.reference, date: i.invoice_date, due: i.due_date,
    total: Number(i.total), reste: Number(i.total) - Number(i.amount_paid), currency: i.currency, rate: Number(i.exchange_rate), paid: i.status === "payee" }));

  const block = (title: string, items: Item[], href: string, verb: string, action: string) => {
    const sorted = [...items].sort((a, b) => rank(a, verb).rank - rank(b, verb).rank || (a.due ?? "9").localeCompare(b.due ?? "9"));
    const open = sorted.filter((i) => !i.paid);
    const total = open.reduce((s, i) => s + usd(i.reste, i.currency, i.rate), 0);
    const late = open.filter((i) => rank(i, verb).rank === 0).length;
    const soon = open.filter((i) => rank(i, verb).rank === 1).length;
    return (
      <Panel title={title} actions={
        <span className="small">Reste à {action} : <span className="num fw-600">{money(total)}</span>
          {late > 0 && <span className="fw-600 t-danger" style={{ marginLeft: 12 }}>{late} en retard</span>}
          {soon > 0 && <span className="fw-600 t-primary" style={{ marginLeft: 12 }}>{soon} sous 7 jours</span>}
        </span>
      }>
        {sorted.length === 0 ? <Empty>Aucune facture validée.</Empty> : (
          <table>
            <thead><tr><th>Tiers</th><th>Réf.</th><th>Date</th><th>Échéance</th><th className="num">Montant</th><th className="num">Reste dû</th><th>Rappel</th></tr></thead>
            <tbody>
              {sorted.map((i) => {
                const r = rank(i, verb);
                return (
                  <tr key={i.id}>
                    <td>{i.tiers}</td><td className="mono xs">{i.ref}</td><td className="mono">{dateFr(i.date)}</td><td className="mono">{dateFr(i.due) || "—"}</td>
                    <td className="num">{money(i.total, i.currency)}</td>
                    <td className="num">{i.paid ? "—" : <>{money(i.reste, i.currency)}{i.reste < i.total && <div className="xs t-muted">déjà reçu {money(i.total - i.reste, i.currency)}</div>}</>}</td>
                    <td className={`xs ${r.cls}`}>{r.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="panel-foot t-right"><Link href={href}>Enregistrer un paiement →</Link></div>
      </Panel>
    );
  };

  return (
    <>
      <PageHeader title="Suivi des paiements" subtitle={`${site.code} — ${site.name}`}
        actions={<Link href={`/espace/site/${site.id}`} className="btn ghost">Retour au site</Link>} />
      {block("Paiements clients (à encaisser)", clients, "/espace/factures-clients", "relancer", "encaisser")}
      {block("Paiements fournisseurs (à régler)", suppliers, "/espace/factures-fournisseurs", "à régler", "payer")}
      <p className="note">Le reste dû tient compte des paiements partiels et des acomptes imputés ; une facture passe à « payée » quand il atteint zéro. Rappel affiché dès 7 jours avant l&apos;échéance, et en rouge une fois l&apos;échéance dépassée.</p>
    </>
  );
}
