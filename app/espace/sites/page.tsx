import PrintButton from "@/components/PrintButton";
import { PageHeader, Panel, Empty } from "@/components/ui";
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
  const res = total.revenue - total.expenses;

  return (
    <>
      <PageHeader
        title="Synthèse par site"
        subtitle={<>Activité du {dateFr(from)} au {dateFr(to)} · créances, dettes et trésorerie au {dateFr(to)} · USD</>}
        actions={<PrintButton />}
      />
      <form className="filters toolbar no-print" method="get">
        <label>Du<input type="date" name="du" defaultValue={from} /></label>
        <label>Au<input type="date" name="au" defaultValue={to} /></label>
        <button className="btn ghost">Afficher</button>
        <span className="hint">Montants convertis au taux de chaque pièce.</span>
      </form>

      <div className="stats">
        <div className="stat"><div className="label">Chiffre d&apos;affaires</div><div className="value">{money(total.revenue)}</div></div>
        <div className="stat"><div className="label">Charges</div><div className="value">{money(total.expenses)}</div></div>
        <div className="stat"><div className="label">Résultat</div><div className={`value${res < 0 ? " t-danger" : ""}`}>{money(res)}</div></div>
        <div className="stat"><div className="label">Trésorerie</div><div className="value">{money(total.cash)}</div></div>
      </div>

      <Panel title="Détail par site">
        {rows.length === 0 ? <Empty>Aucun site ouvert.</Empty> : (
          <table>
            <thead>
              <tr><th>Site</th><th>Secteur</th><th className="num">Produits</th><th className="num">Charges</th><th className="num">Résultat</th><th className="num">Créances (411)</th><th className="num">Dettes (401)</th><th className="num">Trésorerie</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rr = Number(r.revenue) - Number(r.expenses);
                return (
                  <tr key={r.site_id}>
                    <td><span className="num t-muted">{r.site_code}</span> {r.site_name}</td>
                    <td className="t-muted">{SECTORS[sector.get(r.site_id) ?? ""]}</td>
                    <td className="num">{money(r.revenue)}</td><td className="num">{money(r.expenses)}</td>
                    <td className={`num fw-500${rr < 0 ? " t-danger" : ""}`}>{money(rr)}</td>
                    <td className="num">{money(r.receivables)}</td><td className="num">{money(r.payables)}</td><td className="num">{money(r.cash)}</td>
                  </tr>
                );
              })}
              {rows.length > 1 && (
                <tr className="total">
                  <td colSpan={2}>Consolidé</td>
                  <td className="num">{money(total.revenue)}</td><td className="num">{money(total.expenses)}</td>
                  <td className="num">{money(res)}</td>
                  <td className="num">{money(total.receivables)}</td><td className="num">{money(total.payables)}</td><td className="num">{money(total.cash)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="note">Seuls les sites que vous avez ouverts avec leur code apparaissent (tous les sites pour un administrateur).</p>
    </>
  );
}
