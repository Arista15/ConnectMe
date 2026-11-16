import Link from "next/link";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getOpenSites } from "@/lib/session";
import { money, dateFr, rel } from "@/lib/format";
import { reminder } from "@/lib/reminder";

export const metadata = { title: "Soldes clients" };

const usd = (v: number, cur: string, rate: number) => (cur === "USD" ? v : v / rate);

export default async function ClientBalances({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const open = await getOpenSites();
  const siteIds = sp.site && open.some((s) => s.id === sp.site) ? [sp.site] : open.map((s) => s.id);
  const supabase = await createClient();
  const [{ data: invoices }, { data: advances }] = await Promise.all([
    supabase.from("customer_invoices").select("customer_id, total, amount_paid, currency, exchange_rate, status, due_date, customers(name)")
      .in("site_id", siteIds).neq("status", "annulee"),
    supabase.from("customer_advances").select("customer_id, amount, applied, currency, exchange_rate, customers(name)").in("site_id", siteIds),
  ]);

  type Row = { name: string; facture: number; encaisse: number; restant: number; acompte: number; due: string | null };
  const map = new Map<string, Row>();
  const get = (id: string, name: string) => map.get(id) ?? { name, facture: 0, encaisse: 0, restant: 0, acompte: 0, due: null };
  for (const i of invoices ?? []) {
    const r = get(i.customer_id, rel(i.customers)?.name ?? "Client non nommé");
    const rate = Number(i.exchange_rate), rest = Number(i.total) - Number(i.amount_paid);
    r.facture += usd(Number(i.total), i.currency, rate);
    r.encaisse += usd(Math.min(Number(i.total), Number(i.amount_paid)), i.currency, rate);
    if (rest > 0.005) { r.restant += usd(rest, i.currency, rate); if (i.due_date && (!r.due || i.due_date < r.due)) r.due = i.due_date; }
    map.set(i.customer_id, r);
  }
  for (const a of advances ?? []) {
    const r = get(a.customer_id, rel(a.customers)?.name ?? "Client non nommé");
    r.acompte += usd(Number(a.amount) - Number(a.applied), a.currency, Number(a.exchange_rate));
    map.set(a.customer_id, r);
  }
  const rows = [...map.values()].sort((a, b) => reminder(a.restant > 0 ? a.due : null).rank - reminder(b.restant > 0 ? b.due : null).rank || b.restant - a.restant);
  const total = rows.reduce((s, r) => s + r.restant, 0);

  return (
    <>
      <PageHeader
        title="Soldes clients"
        subtitle="Créances par client : facturé, encaissé, restant à encaisser"
        actions={
          <form method="get" className="filters">
            <select name="site" defaultValue={sp.site ?? ""} style={{ minWidth: "14rem" }}>
              <option value="">Tous les sites</option>
              {open.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
            <button className="btn ghost">Afficher</button>
          </form>
        }
      />
      <Panel>
        <div className="panel-strip">
          <span className="fw-600">{rows.length} client(s) avec factures ou acomptes</span>
          <span>Total restant à encaisser : <span className="num fw-600">{money(total)}</span></span>
        </div>
        {rows.length === 0 ? <Empty>Aucune facture client ni acompte.</Empty> : (
          <table>
            <thead><tr><th>Client</th><th className="num">Facturé</th><th className="num">Encaissé</th><th className="num">Restant dû</th><th className="num">Acompte disponible</th><th>Prochaine échéance</th><th>Rappel</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const rem = reminder(r.restant > 0 ? r.due : null);
                return (
                  <tr key={r.name}>
                    <td className="fw-500">{r.name}</td>
                    <td className="num">{money(r.facture)}</td>
                    <td className="num">{money(r.encaisse)}</td>
                    <td className="num fw-600">{r.restant > 0.005 ? money(r.restant) : "—"}</td>
                    <td className="num t-primary">{r.acompte > 0.005 ? money(r.acompte) : "—"}</td>
                    <td className="mono">{r.restant > 0.005 ? dateFr(r.due) || "—" : "—"}</td>
                    <td className={`xs ${r.restant > 0.005 ? rem.cls : "t-muted"}`}>{r.restant > 0.005 ? rem.label : r.facture > 0 ? "Soldé" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="note">
        Montants en USD, convertis au taux de chaque pièce. « Encaissé » inclut les paiements partiels et les acomptes imputés ;
        « Acompte disponible » = avances reçues pas encore déduites d&apos;une facture. Détail facture par facture : page{" "}
        <Link href="/espace/factures-clients">Factures</Link> ou le suivi des paiements d&apos;un site.
      </p>
    </>
  );
}
