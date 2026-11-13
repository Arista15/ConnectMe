import PrintButton from "@/components/PrintButton";
import { createClient } from "@/lib/supabase/server";
import { getOpenSites } from "@/lib/session";
import { money, dateFr, monthBounds, isDate, SECTORS } from "@/lib/format";

export const metadata = { title: "Synthèse par site" };

type Row = { site_id: string; site_code: string; site_name: string; revenue: number; expenses: number; receivables: number; payables: number; cash: number };

export default async function SitesSummaryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const open = await getOpenSites();
  const mb = monthBounds();
  const from = isDate(sp.du) ? sp.du : mb.from;
  const to = isDate(sp.au) ? sp.au : mb.to;
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_site_summary", { p_sites: open.map((s) => s.id), p_from: from, p_to: to });
  const rows = (data ?? []) as Row[];
  const total = rows.reduce(
    (a, r) => ({
      revenue: a.revenue + Number(r.revenue), expenses: a.expenses + Number(r.expenses),
      receivables: a.receivables + Number(r.receivables), payables: a.payables + Number(r.payables), cash: a.cash + Number(r.cash),
    }),
    { revenue: 0, expenses: 0, receivables: 0, payables: 0, cash: 0 },
  );
  const sector = new Map(open.map((s) => [s.id, s.sector]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Synthèse par site</h1>
          <p className="muted">Sites accessibles · activité du {dateFr(from)} au {dateFr(to)} · créances, dettes et trésorerie au {dateFr(to)} · USD</p>
        </div>
        <PrintButton />
      </div>
      <form className="card row no-print" method="get">
        <div><label>Du</label><input type="date" name="du" defaultValue={from} /></div>
        <div><label>Au</label><input type="date" name="au" defaultValue={to} /></div>
        <button className="btn shrink">Afficher</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Site</th><th>Secteur</th><th className="num">Chiffre d'affaires</th><th className="num">Charges</th><th className="num">Résultat</th><th className="num">Créances</th><th className="num">Dettes fournisseurs</th><th className="num">Trésorerie</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.site_id}>
                <td><strong>{r.site_code}</strong> – {r.site_name}</td>
                <td>{SECTORS[sector.get(r.site_id) ?? ""]}</td>
                <td className="num">{money(r.revenue)}</td><td className="num">{money(r.expenses)}</td>
                <td className="num">{money(Number(r.revenue) - Number(r.expenses))}</td>
                <td className="num">{money(r.receivables)}</td><td className="num">{money(r.payables)}</td><td className="num">{money(r.cash)}</td>
              </tr>
            ))}
            {rows.length > 1 && (
              <tr className="total">
                <td colSpan={2}>Consolidé</td>
                <td className="num">{money(total.revenue)}</td><td className="num">{money(total.expenses)}</td>
                <td className="num">{money(total.revenue - total.expenses)}</td>
                <td className="num">{money(total.receivables)}</td><td className="num">{money(total.payables)}</td><td className="num">{money(total.cash)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="small muted">Seuls les sites que vous avez ouverts avec leur code apparaissent (tous les sites pour un administrateur).</p>
    </>
  );
}
