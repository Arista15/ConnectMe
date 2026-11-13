import Link from "next/link";
import PeriodFilter from "@/components/PeriodFilter";
import PrintButton from "@/components/PrintButton";
import { StatementTable, TrialBalanceTable } from "@/components/Statements";
import { createClient } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/scope";
import { incomeStatement, balanceSheet, type TBRow } from "@/lib/statements";
import { dateFr } from "@/lib/format";

export const metadata = { title: "États financiers" };

const TABS = [["balance", "Balance"], ["resultat", "Compte de résultat"], ["bilan", "Bilan"]] as const;

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { open, from, to, scope, siteIds, title } = await resolveScope(sp);
  const type = TABS.some(([k]) => k === sp.type) ? sp.type : "balance";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_trial_balance", { p_sites: siteIds, p_from: from, p_to: to });
  const rows = (data ?? []) as TBRow[];
  const qs = (t: string) => `?${new URLSearchParams({ type: t, du: from, au: to, perimetre: scope })}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>États financiers</h1>
          <p className="muted">{title} · du {dateFr(from)} au {dateFr(to)} · en USD (contre-valeur au taux historique de chaque document)</p>
        </div>
        <div className="row shrink">
          <Link className="btn ghost shrink no-print" href={`/rapport?mois=${from.slice(0, 7)}&perimetre=${scope}`}>Rapport mensuel PDF</Link>
          <PrintButton />
        </div>
      </div>
      <div className="tabs">
        {TABS.map(([k, v]) => <Link key={k} href={qs(k)} className={type === k ? "active" : ""}>{v}</Link>)}
      </div>
      <PeriodFilter from={from} to={to} scope={scope} open={open} hidden={{ type }} />
      {error && <div className="alert err">{error.message}</div>}

      {type === "balance" && <TrialBalanceTable rows={rows} />}

      {type === "resultat" && (
        <div className="card" style={{ maxWidth: 760 }}>
          <StatementTable title={`Compte de résultat — ${title}`} lines={incomeStatement(rows).lines} />
        </div>
      )}

      {type === "bilan" && (() => {
        const b = balanceSheet(rows);
        return (
          <>
            <p className="muted small">Bilan au {dateFr(to)} (soldes cumulés ; résultat depuis le 1er janvier {to.slice(0, 4)}).</p>
            <div className="grid grid-2">
              <div className="card"><StatementTable title="Actif" lines={b.actif} /></div>
              <div className="card"><StatementTable title="Passif" lines={b.passif} /></div>
            </div>
            {!b.balanced && <div className="alert err">Écart actif / passif : vérifiez la balance.</div>}
          </>
        );
      })()}
    </>
  );
}
