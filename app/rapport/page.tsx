import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import { StatementTable, TrialBalanceTable } from "@/components/Statements";
import { createClient } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/scope";
import { getProfile } from "@/lib/session";
import { incomeStatement, balanceSheet, type TBRow } from "@/lib/statements";
import { money, dateFr, dateTimeFr, monthBounds, rel } from "@/lib/format";

export const metadata = { title: "Rapport mensuel" };

/** Rapport mensuel imprimable : Imprimer → « Enregistrer au format PDF ». */
export default async function MonthlyReport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { month, from, to } = monthBounds(sp.mois);
  const { siteIds, title, sites, scope } = await resolveScope({ ...sp, du: from, au: to });
  const profile = await getProfile();
  const supabase = await createClient();

  const [{ data: tb }, { data: summary }, { data: invoices }, { data: overdue }] = await Promise.all([
    supabase.rpc("report_trial_balance", { p_sites: siteIds, p_from: from, p_to: to }),
    supabase.rpc("report_site_summary", { p_sites: siteIds, p_from: from, p_to: to }),
    supabase.from("customer_invoices").select("number, issue_date, total, currency, status, customers(name), sites(code)")
      .in("site_id", siteIds).gte("issue_date", from).lte("issue_date", to).neq("status", "annulee").order("issue_date"),
    supabase.from("customer_invoices").select("number, due_date, total, amount_paid, currency, customers(name), sites(code)")
      .in("site_id", siteIds).in("status", ["emise", "partielle"]).lt("due_date", to).order("due_date"),
  ]);
  const rows = (tb ?? []) as TBRow[];
  const is = incomeStatement(rows);
  const bs = balanceSheet(rows);
  const monthLabel = new Date(from + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const prev = monthBounds(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)).month;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "1.5rem", background: "#fff" }}>
      <div className="page-head no-print">
        <Link href="/espace/etats" className="btn ghost">← États financiers</Link>
        <form method="get" className="row" style={{ flex: "0 1 auto" }}>
          <input type="hidden" name="perimetre" value={scope} />
          <input type="month" name="mois" defaultValue={month} style={{ width: 170 }} />
          <button className="btn ghost shrink">Afficher</button>
          <Link className="btn ghost shrink" href={`/rapport?mois=${prev}&perimetre=${scope}`}>Mois précédent</Link>
        </form>
        <PrintButton label="Imprimer / enregistrer en PDF" />
      </div>

      <div className="page-head">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <img src="/kbs-logo.png" alt="" width={56} height={56} style={{ borderRadius: 6, objectFit: "contain" }} />
          <div>
            <h1 style={{ margin: 0 }}>Rapport mensuel – {monthLabel}</h1>
            <p className="muted" style={{ margin: 0 }}>Kafaus Business Service SARL · {title}</p>
          </div>
        </div>
        <p className="small muted right">Édité le {dateTimeFr(new Date().toISOString())}<br />par {profile.full_name || profile.email}<br />Montants en USD</p>
      </div>

      <h2>1. Synthèse</h2>
      <div className="grid grid-4">
        <div className="card kpi"><div className="label">Chiffre d'affaires</div><div className="value">{money(is.ca)}</div></div>
        <div className="card kpi"><div className="label">Résultat net du mois</div><div className="value">{money(is.net)}</div></div>
        <div className="card kpi"><div className="label">Créances clients</div><div className="value">{money((summary ?? []).reduce((s: number, r: { receivables: number }) => s + Number(r.receivables), 0))}</div></div>
        <div className="card kpi"><div className="label">Trésorerie</div><div className="value">{money((summary ?? []).reduce((s: number, r: { cash: number }) => s + Number(r.cash), 0))}</div></div>
      </div>
      {sites.length > 1 && (
        <table>
          <thead><tr><th>Site</th><th className="num">CA</th><th className="num">Charges</th><th className="num">Créances</th><th className="num">Dettes</th><th className="num">Trésorerie</th></tr></thead>
          <tbody>
            {(summary ?? []).map((r: { site_code: string; revenue: number; expenses: number; receivables: number; payables: number; cash: number }) => (
              <tr key={r.site_code}>
                <td>{r.site_code}</td><td className="num">{money(r.revenue)}</td><td className="num">{money(r.expenses)}</td>
                <td className="num">{money(r.receivables)}</td><td className="num">{money(r.payables)}</td><td className="num">{money(r.cash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>2. Compte de résultat du mois</h2>
      <StatementTable lines={is.lines} title="Rubrique" />

      <h2 className="page-break">3. Bilan au {dateFr(to)}</h2>
      <div className="grid grid-2">
        <StatementTable title="Actif" lines={bs.actif} />
        <StatementTable title="Passif" lines={bs.passif} />
      </div>

      <h2>4. Factures émises ({(invoices ?? []).length})</h2>
      <table>
        <thead><tr><th>N°</th><th>Date</th><th>Client</th>{sites.length > 1 && <th>Site</th>}<th className="num">Total</th></tr></thead>
        <tbody>
          {(invoices ?? []).map((i) => (
            <tr key={i.number}>
              <td>{i.number}</td><td>{dateFr(i.issue_date)}</td><td>{rel(i.customers)?.name}</td>
              {sites.length > 1 && <td>{rel(i.sites)?.code}</td>}
              <td className="num">{money(i.total, i.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>5. Factures échues non réglées au {dateFr(to)}</h2>
      {(overdue ?? []).length === 0 ? <p className="muted">Aucune.</p> : (
        <table>
          <thead><tr><th>N°</th><th>Échéance</th><th>Client</th><th className="num">Reste dû</th></tr></thead>
          <tbody>
            {(overdue ?? []).map((i) => (
              <tr key={i.number}>
                <td>{i.number}</td><td>{dateFr(i.due_date)}</td><td>{rel(i.customers)?.name}</td>
                <td className="num">{money(Number(i.total) - Number(i.amount_paid), i.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="page-break">6. Balance générale du mois</h2>
      <TrialBalanceTable rows={rows} />
    </div>
  );
}
