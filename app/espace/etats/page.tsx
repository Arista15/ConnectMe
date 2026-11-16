import Link from "next/link";
import PeriodFilter from "@/components/PeriodFilter";
import PrintButton from "@/components/PrintButton";
import { PageHeader, Panel, Seg } from "@/components/ui";
import { StatementTable, TrialBalanceTable } from "@/components/Statements";
import { createClient } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/scope";
import { incomeStatement, balanceSheet, type TBRow } from "@/lib/statements";
import { dateFr, money } from "@/lib/format";

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
  const is = incomeStatement(rows);

  return (
    <>
      <PageHeader
        title="États financiers"
        subtitle={<>{title} · du {dateFr(from)} au {dateFr(to)} · USD (contre-valeur au taux historique de chaque document)</>}
        actions={<>
          <Link className="btn ghost" href={`/rapport?mois=${from.slice(0, 7)}&perimetre=${scope}`}>Rapport mensuel PDF</Link>
          <PrintButton />
        </>}
      />
      <div className="toolbar"><PeriodFilter from={from} to={to} scope={scope} open={open} hidden={{ type }} /></div>
      <div className="print-only-brand" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <img src="/kbs-logo.png" alt="Logo KBS" width={40} height={40} style={{ objectFit: "contain" }} />
        <span className="small fw-600 t-muted">K.B.S SARL · {title}</span>
      </div>
      <Seg items={TABS.map(([k, v]) => ({ href: qs(k), label: v, active: type === k }))} />
      {error && <div className="alert err">{error.message}</div>}

      {type === "balance" && <TrialBalanceTable rows={rows} />}

      {type === "resultat" && (
        <>
          <Panel title={`Compte de résultat — ${title}`} serif className="" >
            <StatementTable lines={is.lines} />
          </Panel>
          <div className={`result-box${is.net < 0 ? " neg" : ""}`}>
            <div className="label">{is.net >= 0 ? "Bénéfice" : "Perte"} de la période</div>
            <div className="value">{money(is.net)}</div>
          </div>
        </>
      )}

      {type === "bilan" && (() => {
        const b = balanceSheet(rows);
        return (
          <>
            <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>Bilan au {dateFr(to)} (soldes cumulés ; résultat depuis le 1er janvier {to.slice(0, 4)}).</p>
            <div className="cols-2">
              <Panel title="Actif" serif><StatementTable lines={b.actif} /></Panel>
              <Panel title="Passif" serif><StatementTable lines={b.passif} /></Panel>
            </div>
            {!b.balanced && <div className="alert err" style={{ marginTop: 16 }}>Écart actif / passif : vérifiez la balance.</div>}
          </>
        );
      })()}
    </>
  );
}
