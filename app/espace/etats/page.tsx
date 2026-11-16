import Link from "next/link";
import PeriodFilter from "@/components/PeriodFilter";
import PrintButton from "@/components/PrintButton";
import { PageHeader, Panel, Seg, Empty } from "@/components/ui";
import { StatementTable, TrialBalanceTable } from "@/components/Statements";
import { createClient } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/scope";
import { incomeStatement, balanceSheet, type TBRow } from "@/lib/statements";
import { fetchLines, cashFlow, monthLabel } from "@/lib/entries";
import { dateFr, money, num } from "@/lib/format";

export const metadata = { title: "États financiers" };

const TABS = [["grand-livre", "Grand livre"], ["balance", "Balance"], ["bilan", "Bilan"], ["resultat", "Compte de résultat"], ["flux", "Flux"], ["annexes", "Notes annexes"]] as const;
const signed = (v: number) => `${money(Math.abs(v))} ${v >= 0 ? "D" : "C"}`;

export default async function StatementsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { open, from, to, scope, siteIds, title } = await resolveScope(sp);
  const type = TABS.some(([k]) => k === sp.type) ? sp.type : "grand-livre";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_trial_balance", { p_sites: siteIds, p_from: from, p_to: to });
  const rows = (data ?? []) as TBRow[];
  const qs = (t: string) => `?${new URLSearchParams({ type: t, du: from, au: to, perimetre: scope })}`;
  const is = incomeStatement(rows);
  const needLines = type === "grand-livre" || type === "flux" || type === "annexes";
  const lines = needLines ? await fetchLines(siteIds, from, to) : [];
  const labelOf = new Map(rows.map((r) => [r.account_code, r.label]));
  const bal = (prefix: string) => rows.filter((r) => r.account_code.startsWith(prefix))
    .reduce((s, r) => s + Number(r.closing_debit) - Number(r.closing_credit), 0);

  return (
    <>
      <PageHeader
        title="États financiers"
        subtitle={<>{title} · du {dateFr(from)} au {dateFr(to)} · USD</>}
        actions={<>
          <Link className="btn ghost" href={`/rapport?mois=${from.slice(0, 7)}&perimetre=${scope}`}>Rapport mensuel PDF</Link>
          <PrintButton />
        </>}
      />
      <div className="toolbar"><PeriodFilter from={from} to={to} scope={scope} open={open} hidden={{ type }} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <img src="/kbs-logo.png" alt="Logo KBS" width={40} height={40} style={{ objectFit: "contain" }} />
        <span className="small fw-600 t-muted">K.B.S SARL</span>
      </div>
      <Seg items={TABS.map(([k, v]) => ({ href: qs(k), label: v, active: type === k }))} />
      {error && <div className="alert err">{error.message}</div>}

      {type === "grand-livre" && (() => {
        const byAcc = new Map<string, typeof lines>();
        for (const l of lines) byAcc.set(l.account_code, [...(byAcc.get(l.account_code) ?? []), l]);
        const accs = [...byAcc.keys()].sort();
        if (accs.length === 0) return <Panel><Empty>Aucun mouvement sur la période.</Empty></Panel>;
        return accs.map((code) => {
          let run = 0, td = 0, tc = 0;
          return (
            <Panel key={code} code={code} title={labelOf.get(code) ?? ""}>
              <table>
                <thead><tr><th>Date</th><th>Jnl</th><th>Pièce</th><th>Libellé</th><th className="num">Débit</th><th className="num">Crédit</th><th className="num">Solde (D/C)</th></tr></thead>
                <tbody>
                  {byAcc.get(code)!.map((l, i) => {
                    run += l.debit_usd - l.credit_usd; td += l.debit_usd; tc += l.credit_usd;
                    return (
                      <tr key={i}>
                        <td className="mono">{dateFr(l.entry_date)}</td><td className="mono">{l.journal_code}</td><td className="mono xs">{l.reference}</td>
                        <td>{l.label}</td><td className="num">{num(l.debit_usd)}</td><td className="num">{num(l.credit_usd)}</td><td className="num">{signed(run)}</td>
                      </tr>
                    );
                  })}
                  <tr className="total"><td colSpan={4}>Totaux et solde du compte</td><td className="num">{money(td)}</td><td className="num">{money(tc)}</td><td className="num">{signed(td - tc)}</td></tr>
                </tbody>
              </table>
            </Panel>
          );
        });
      })()}

      {type === "balance" && <TrialBalanceTable rows={rows} />}

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

      {type === "resultat" && (
        <>
          <div className="cols-2">
            {([["Charges (classe 6)", "6"], ["Produits (classe 7)", "7"]] as const).map(([t, c]) => {
              const accs = rows.filter((r) => r.account_code.startsWith(c));
              const total = accs.reduce((s, r) => s + (c === "6" ? Number(r.period_debit) - Number(r.period_credit) : Number(r.period_credit) - Number(r.period_debit)), 0);
              return (
                <Panel key={c} title={t} serif>
                  <table>
                    <tbody>
                      {accs.map((r) => (
                        <tr key={r.account_code}><td><span className="mono">{r.account_code}</span> {r.label}</td>
                          <td className="num">{money(c === "6" ? Number(r.period_debit) - Number(r.period_credit) : Number(r.period_credit) - Number(r.period_debit))}</td></tr>
                      ))}
                      <tr className="total"><td>Total</td><td className="num">{money(total)}</td></tr>
                    </tbody>
                  </table>
                </Panel>
              );
            })}
          </div>
          <div className={`result-box${is.net < 0 ? " neg" : ""}`}>
            <div className="label">{is.net >= 0 ? "Bénéfice" : "Perte"} de la période</div>
            <div className="value">{money(is.net)}</div>
          </div>
        </>
      )}

      {type === "flux" && (() => {
        const f = cashFlow(lines);
        const treso = rows.filter((r) => r.account_code.startsWith("5"));
        const tTot = lines.filter((l) => l.account_code.startsWith("5")).reduce((s, l) => s + l.debit_usd - l.credit_usd, 0);
        return (
          <>
            <div className="cols-2">
              <Panel title="Tableau des flux de trésorerie" serif>
                <table><tbody>
                  <tr><td>Flux de trésorerie d&apos;exploitation</td><td className="num">{money(f.exploitation)}</td></tr>
                  <tr><td>Flux de trésorerie d&apos;investissement</td><td className="num">{money(f.investissement)}</td></tr>
                  <tr><td>Flux de trésorerie de financement</td><td className="num">{money(f.financement)}</td></tr>
                  <tr className="total"><td>Variation nette de la trésorerie</td><td className="num">{money(f.variation)}</td></tr>
                </tbody></table>
              </Panel>
              <Panel title="Comptes de trésorerie (classe 5)" serif>
                <table>
                  <thead><tr><th>Compte</th><th>Intitulé</th><th className="num">Solde (D/C)</th></tr></thead>
                  <tbody>
                    {treso.length === 0 && <tr><td colSpan={3} className="t-center t-muted">Aucun compte de trésorerie mouvementé sur la période.</td></tr>}
                    {treso.map((r) => <tr key={r.account_code}><td className="mono">{r.account_code}</td><td>{r.label}</td><td className="num">{signed(Number(r.period_debit) - Number(r.period_credit))}</td></tr>)}
                    <tr className="total"><td colSpan={2}>Total des mouvements de trésorerie</td><td className="num">{signed(tTot)}</td></tr>
                  </tbody>
                </table>
              </Panel>
            </div>
            <Panel title="Flux par mois" serif className="" >
              {f.byMonth.length === 0 ? <Empty>Aucun mouvement de trésorerie sur la période.</Empty> : (
                <table>
                  <thead><tr><th>Mois</th><th className="num">Exploitation</th><th className="num">Investissement</th><th className="num">Financement</th><th className="num">Variation nette</th></tr></thead>
                  <tbody>
                    {f.byMonth.map((m) => (
                      <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{money(m.exploitation)}</td><td className="num">{money(m.investissement)}</td><td className="num">{money(m.financement)}</td><td className="num fw-500">{money(m.variation)}</td></tr>
                    ))}
                    <tr className="total"><td>Total</td><td className="num">{money(f.exploitation)}</td><td className="num">{money(f.investissement)}</td><td className="num">{money(f.financement)}</td><td className="num">{money(f.variation)}</td></tr>
                  </tbody>
                </table>
              )}
            </Panel>
            <p className="note">Méthode : le mouvement de trésorerie (classe 5) de chaque écriture est rattaché à la catégorie de sa contrepartie dominante — capitaux et dettes financières (classe 1) en financement, immobilisations (classe 2) en investissement, exploitation (classes 3, 4, 6, 7) en exploitation. Les virements entre comptes de trésorerie sont neutres.</p>
          </>
        );
      })()}

      {type === "annexes" && (() => {
        const f = cashFlow(lines);
        const b = balanceSheet(rows);
        const nEntries = new Set(lines.map((l) => l.entry_id)).size;
        const nAcc = new Set(lines.map((l) => l.account_code)).size;
        const journals = new Map<string, number>();
        for (const id of new Set(lines.map((l) => `${l.entry_id}|${l.journal_code}`))) { const j = id.split("|")[1]; journals.set(j, (journals.get(j) ?? 0) + 1); }
        const amort = bal("28");
        const others = rows.filter((r) => r.account_code[0] === "4" && !r.account_code.startsWith("411") && !r.account_code.startsWith("401"));
        const treso = rows.filter((r) => r.account_code.startsWith("5"));
        const actifImmo = bal("2") - amort;
        const Note = ({ n, t, children }: { n: number; t: string; children: React.ReactNode }) => (
          <Panel title={`Note ${n} — ${t}`} serif><div className="panel-body small" style={{ lineHeight: 1.7 }}>{children}</div></Panel>
        );
        return (
          <>
            <Note n={1} t="Base de préparation et périmètre">Les présents états sont établis selon le système comptable SYSCOHADA à partir du registre unique de KBS Comptable. Période du {dateFr(from)} au {dateFr(to)} — périmètre : {title}. Devise d&apos;affichage : dollar américain (USD). {nEntries} écritures et {lines.length} lignes ont été enregistrées sur la période, mouvant {nAcc} comptes du plan comptable.</Note>
            <Note n={2} t="Méthode de conversion des devises">Chaque pièce conserve sa devise d&apos;origine et son taux de change (CDF pour 1 USD) à la date de la pièce. Les montants des présents états sont convertis au taux historique de chaque pièce ; aucun taux de revalorisation en fin de période n&apos;est appliqué. Les écarts de change sur règlements sont comptabilisés en 676 / 776.</Note>
            <Note n={3} t="Immobilisations et amortissements">Actif immobilisé (classe 2) : {money(actifImmo)}.{Math.abs(amort) < 0.005 ? " Aucune écriture d'amortissement (comptes de la classe 28) n'a été enregistrée : la valeur présentée est une valeur brute." : ` Amortissements cumulés : ${money(-amort)}.`}</Note>
            <Note n={4} t="Stocks">Stocks (classe 3) : {money(bal("3"))}. Les biens achetés non consommés sont suivis en variation de stocks (compte 603).</Note>
            <Note n={5} t="Créances et dettes">Clients (compte 411) : {signed(bal("411"))}. Fournisseurs (compte 401) : {signed(bal("401"))}. {others.length > 0 ? `Autres comptes de tiers (classe 4), hors clients et fournisseurs : ${others.length} compte(s) mouvementé(s), dont le détail figure au grand livre.` : "Aucun autre compte de tiers (classe 4) n'est mouvementé."}</Note>
            <Note n={6} t="Taxes sur le chiffre d'affaires">TVA collectée (443) : {money(-bal("443"))}. TVA déductible (445) : {money(bal("445"))}. Solde TVA à payer : {money(-bal("443") - bal("445"))}.</Note>
            <Note n={7} t="Trésorerie">Mouvements nets de trésorerie sur la période : {money(f.variation)}, dont {money(f.exploitation)} en exploitation, {money(f.investissement)} en investissement et {money(f.financement)} en financement.{treso.length > 0 && <> Détail par compte : {treso.map((r) => `${r.account_code} ${r.label} (${signed(Number(r.closing_debit) - Number(r.closing_credit))})`).join(" ; ")}.</>}</Note>
            <Note n={8} t="Produits, charges et résultat">Résultat de la période : {money(is.net)} ({is.net >= 0 ? "bénéfice" : "perte"}). Bilan {b.balanced ? "équilibré" : "non équilibré : vérifiez la balance"}.</Note>
            <Note n={9} t="Méthode du tableau des flux de trésorerie">Le mouvement de trésorerie (classe 5) de chaque écriture est rattaché à la catégorie de sa contrepartie dominante : classe 1 en financement, classe 2 en investissement, classes 3, 4, 6 et 7 en exploitation. Les virements entre comptes de trésorerie sont neutres.</Note>
            <Note n={10} t="Journaux utilisés">{journals.size === 0 ? "Aucun journal utilisé sur la période" : [...journals.entries()].sort((a, b) => b[1] - a[1]).map(([j, n]) => `${j} (${n} écriture${n > 1 ? "s" : ""})`).join(", ")}. Chaque écriture porte son auteur, sa date de saisie et sa pièce d&apos;origine ; le rapprochement s&apos;effectue depuis l&apos;historique des écritures.</Note>
            <Note n={11} t="Événements postérieurs à la clôture">À compléter par le comptable avant diffusion : aucun événement postérieur à la date d&apos;arrêté n&apos;est automatiquement porté à la connaissance des états.</Note>
          </>
        );
      })()}
    </>
  );
}
