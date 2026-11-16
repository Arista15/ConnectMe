import Link from "next/link";
import PeriodFilter from "@/components/PeriodFilter";
import PrintButton from "@/components/PrintButton";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/scope";
import { dateFr, num } from "@/lib/format";

export const metadata = { title: "Grand livre" };

type Row = {
  entry_id: string; entry_number: number; site_code: string; entry_date: string; journal_code: string;
  reference: string; label: string; currency: string; debit: number; credit: number;
  debit_usd: number; credit_usd: number; balance_usd: number; opening_usd: number;
};
type TB = { account_code: string; label: string; opening_debit: number; opening_credit: number; period_debit: number; period_credit: number };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { open, from, to, scope, siteIds, title } = await resolveScope(sp);
  const supabase = await createClient();
  const account = (sp.compte ?? "").replace(/\D/g, "");

  const { data: tb } = await supabase.rpc("report_trial_balance", { p_sites: siteIds, p_from: from, p_to: to });
  const accountsWithMoves = (tb ?? []) as TB[];

  let rows: Row[] = [];
  if (account) {
    const { data } = await supabase.rpc("report_ledger", { p_sites: siteIds, p_account: account, p_from: from, p_to: to });
    rows = (data ?? []) as Row[];
  }
  const opening = account
    ? accountsWithMoves
        .filter((a) => a.account_code.startsWith(account))
        .reduce((s, a) => s + Number(a.opening_debit) - Number(a.opening_credit), 0)
    : 0;
  const totD = rows.reduce((s, r) => s + Number(r.debit_usd), 0);
  const totC = rows.reduce((s, r) => s + Number(r.credit_usd), 0);
  const params = new URLSearchParams({ du: from, au: to, perimetre: scope });
  const accLabel = accountsWithMoves.find((a) => a.account_code === account)?.label ?? (account ? "Comptes commençant par " + account : "");
  const multi = siteIds.length > 1;

  return (
    <>
      <PageHeader
        title="Grand livre"
        subtitle={<>{title} · du {dateFr(from)} au {dateFr(to)} · montants en USD (contre-valeur historique)</>}
        actions={<>
          {account && <Link href={`/espace/grand-livre?${params}`} className="btn ghost">Tous les comptes</Link>}
          <PrintButton />
        </>}
      />
      <div className="toolbar">
        <PeriodFilter from={from} to={to} scope={scope} open={open} extra={
          <label>Compte (ou racine)<input name="compte" defaultValue={account} placeholder="ex. 411, 6, 5711" /></label>
        } />
      </div>

      {!account ? (
        <Panel title="Comptes mouvementés sur la période">
          {accountsWithMoves.length === 0 ? <Empty>Aucun mouvement sur la période.</Empty> : (
            <table>
              <thead><tr><th>Compte</th><th>Intitulé</th><th className="num">Débit</th><th className="num">Crédit</th><th></th></tr></thead>
              <tbody>
                {accountsWithMoves.map((a) => (
                  <tr key={a.account_code}>
                    <td className="mono fw-600 t-primary">{a.account_code}</td>
                    <td>{a.label}</td>
                    <td className="num">{num(a.period_debit)}</td>
                    <td className="num">{num(a.period_credit)}</td>
                    <td className="t-right no-print"><Link href={`/espace/grand-livre?${params}&compte=${a.account_code}`} className="xs">Détail →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      ) : (
        <Panel code={account} title={accLabel}>
          <table>
            <thead>
              <tr>
                <th>Date</th>{multi && <th>Site</th>}<th>Jnl</th><th>N°</th><th>Pièce</th><th>Libellé</th>
                <th className="num">Montant devise</th><th className="num">Débit</th><th className="num">Crédit</th><th className="num">Solde (D/C)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="subtotal">
                <td colSpan={multi ? 9 : 8}>Solde d&apos;ouverture</td>
                <td className="num">{num(opening) || "0,00"}</td>
              </tr>
              {rows.length === 0 && <tr><td colSpan={multi ? 10 : 9} className="t-muted t-center">Aucun mouvement sur la période.</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{dateFr(r.entry_date)}</td>{multi && <td className="mono t-muted">{r.site_code}</td>}
                  <td className="mono">{r.journal_code}</td><td className="mono">{r.entry_number}</td>
                  <td className="mono xs">{r.reference}</td><td>{r.label}</td>
                  <td className="num xs t-muted">{r.currency === "CDF" ? `${num(Number(r.debit) || Number(r.credit))} FC` : ""}</td>
                  <td className="num">{num(r.debit_usd)}</td><td className="num">{num(r.credit_usd)}</td>
                  <td className="num">{num(r.balance_usd) || "0,00"}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={multi ? 7 : 6}>Totaux et solde du compte</td>
                <td className="num">{num(totD)}</td><td className="num">{num(totC)}</td>
                <td className="num">{num(opening + totD - totC) || "0,00"}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
