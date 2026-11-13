import Link from "next/link";
import PeriodFilter from "@/components/PeriodFilter";
import PrintButton from "@/components/PrintButton";
import { createClient } from "@/lib/supabase/server";
import { resolveScope } from "@/lib/scope";
import { dateFr, num } from "@/lib/format";

export const metadata = { title: "Grand livre" };

type Row = {
  entry_id: string; entry_number: number; site_code: string; entry_date: string; journal_code: string;
  reference: string; label: string; currency: string; debit: number; credit: number;
  debit_usd: number; credit_usd: number; balance_usd: number; opening_usd: number;
};

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { open, from, to, scope, siteIds, title } = await resolveScope(sp);
  const supabase = await createClient();
  const account = (sp.compte ?? "").replace(/\D/g, "");

  const { data: tb } = await supabase.rpc("report_trial_balance", { p_sites: siteIds, p_from: from, p_to: to });
  const accountsWithMoves = (tb ?? []) as {
    account_code: string; label: string; opening_debit: number; opening_credit: number;
  }[];

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grand livre</h1>
          <p className="muted">{title} · du {dateFr(from)} au {dateFr(to)} · montants en USD (contre-valeur historique)</p>
        </div>
        <PrintButton />
      </div>
      <PeriodFilter from={from} to={to} scope={scope} open={open} extra={
        <div>
          <label>Compte (ou racine)</label>
          <input name="compte" defaultValue={account} placeholder="ex. 411, 6, 5711" />
        </div>
      } />

      {!account ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Comptes mouvementés</h3>
          {accountsWithMoves.length === 0 && <p className="muted">Aucun mouvement sur la période.</p>}
          <div className="grid grid-3">
            {accountsWithMoves.map((a) => (
              <Link key={a.account_code} href={`/espace/grand-livre?${params}&compte=${a.account_code}`}>
                {a.account_code} – {a.label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>{siteIds.length > 1 && <th>Site</th>}<th>Jnl</th><th>N°</th><th>Pièce</th><th>Libellé</th>
                <th className="num">Montant devise</th><th className="num">Débit USD</th><th className="num">Crédit USD</th><th className="num">Solde USD</th>
              </tr>
            </thead>
            <tbody>
              <tr className="subtotal">
                <td colSpan={siteIds.length > 1 ? 9 : 8}>Solde d'ouverture — compte {account}</td>
                <td className="num">{num(opening) || "0,00"}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{dateFr(r.entry_date)}</td>{siteIds.length > 1 && <td>{r.site_code}</td>}
                  <td>{r.journal_code}</td><td>{r.entry_number}</td><td>{r.reference}</td><td>{r.label}</td>
                  <td className="num small muted">{r.currency === "CDF" ? `${num(Number(r.debit) || Number(r.credit))} FC` : ""}</td>
                  <td className="num">{num(r.debit_usd)}</td><td className="num">{num(r.credit_usd)}</td>
                  <td className="num">{num(r.balance_usd) || "0,00"}</td>
                </tr>
              ))}
              <tr className="total">
                <td colSpan={siteIds.length > 1 ? 7 : 6}>Totaux de la période</td>
                <td className="num">{num(totD)}</td><td className="num">{num(totC)}</td>
                <td className="num">{num(opening + totD - totC) || "0,00"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
