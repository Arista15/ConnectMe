import Link from "next/link";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getOpenSites } from "@/lib/session";
import { money, dateFr } from "@/lib/format";
import { reminder } from "@/lib/reminder";

export const metadata = { title: "Soldes fournisseurs" };

const usd = (v: number, cur: string, rate: number) => (cur === "USD" ? v : v / rate);

export default async function SupplierBalances({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const open = await getOpenSites();
  const siteIds = sp.site && open.some((s) => s.id === sp.site) ? [sp.site] : open.map((s) => s.id);
  const supabase = await createClient();
  const { data: invoices } = await supabase.from("supplier_invoices")
    .select("supplier_id, supplier_name, total, amount_paid, currency, exchange_rate, status, due_date, suppliers(name)")
    .in("site_id", siteIds).in("status", ["validee", "partielle", "payee"]);

  type Row = { name: string; facture: number; paye: number; restant: number; due: string | null };
  const map = new Map<string, Row>();
  for (const i of invoices ?? []) {
    const name = (i.suppliers as unknown as { name: string } | null)?.name ?? i.supplier_name ?? "Fournisseur non nommé";
    const key = i.supplier_id ?? name;
    const r = map.get(key) ?? { name, facture: 0, paye: 0, restant: 0, due: null };
    const rate = Number(i.exchange_rate), rest = Number(i.total) - Number(i.amount_paid);
    r.facture += usd(Number(i.total), i.currency, rate);
    r.paye += usd(Number(i.amount_paid), i.currency, rate);
    if (rest > 0.005) { r.restant += usd(rest, i.currency, rate); if (i.due_date && (!r.due || i.due_date < r.due)) r.due = i.due_date; }
    map.set(key, r);
  }
  const rows = [...map.values()].sort((a, b) => reminder(a.restant > 0 ? a.due : null).rank - reminder(b.restant > 0 ? b.due : null).rank || b.restant - a.restant);
  const total = rows.reduce((s, r) => s + r.restant, 0);

  return (
    <>
      <PageHeader
        title="Soldes fournisseurs"
        subtitle="Dettes par fournisseur : facturé, payé, restant à payer"
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
          <span className="fw-600">{rows.length} fournisseur(s) avec factures validées</span>
          <span>Total restant à payer : <span className="num fw-600">{money(total)}</span></span>
        </div>
        {rows.length === 0 ? <Empty>Aucune facture fournisseur validée.</Empty> : (
          <table>
            <thead><tr><th>Fournisseur</th><th className="num">Facturé</th><th className="num">Payé</th><th className="num">Restant dû</th><th>Prochaine échéance</th><th>Rappel</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const rem = reminder(r.restant > 0 ? r.due : null, "à régler");
                return (
                  <tr key={r.name}>
                    <td className="fw-500">{r.name}</td>
                    <td className="num">{money(r.facture)}</td>
                    <td className="num">{money(r.paye)}</td>
                    <td className="num fw-600">{r.restant > 0.005 ? money(r.restant) : "—"}</td>
                    <td className="mono">{r.restant > 0.005 ? dateFr(r.due) || "—" : "—"}</td>
                    <td className={`xs ${r.restant > 0.005 ? rem.cls : "t-muted"}`}>{r.restant > 0.005 ? rem.label : "Soldé"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="note">
        Montants en USD, convertis au taux de chaque pièce. Détail facture par facture : page{" "}
        <Link href="/espace/factures-fournisseurs">Factures fournisseurs</Link> ou le suivi des paiements d&apos;un site.
      </p>
    </>
  );
}
