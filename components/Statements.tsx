import { num } from "@/lib/format";
import type { Line, TBRow } from "@/lib/statements";

export function StatementTable({ lines, title }: { lines: Line[]; title?: string }) {
  return (
    <table>
      {title && <thead><tr><th>{title}</th><th className="num">USD</th></tr></thead>}
      <tbody>
        {lines.map((l) => (
          <tr key={l.label} className={l.kind}>
            <td>{l.label}</td>
            <td className="num">{num(l.value) || "0,00"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TrialBalanceTable({ rows }: { rows: TBRow[] }) {
  const t = rows.reduce(
    (a, r) => ({
      od: a.od + Number(r.opening_debit), oc: a.oc + Number(r.opening_credit),
      pd: a.pd + Number(r.period_debit), pc: a.pc + Number(r.period_credit),
      cd: a.cd + Number(r.closing_debit), cc: a.cc + Number(r.closing_credit),
    }),
    { od: 0, oc: 0, pd: 0, pc: 0, cd: 0, cc: 0 },
  );
  const ok = Math.abs(t.pd - t.pc) < 0.01 && Math.abs(t.cd - t.cc) < 0.01;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>Compte</th><th rowSpan={2}>Intitulé</th>
              <th colSpan={2} className="num">Solde d'ouverture</th>
              <th colSpan={2} className="num">Mouvements de la période</th>
              <th colSpan={2} className="num">Solde de clôture</th>
            </tr>
            <tr>
              <th className="num">Débit</th><th className="num">Crédit</th>
              <th className="num">Débit</th><th className="num">Crédit</th>
              <th className="num">Débit</th><th className="num">Crédit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account_code}>
                <td className="mono">{r.account_code}</td><td>{r.label}</td>
                <td className="num">{num(r.opening_debit)}</td><td className="num">{num(r.opening_credit)}</td>
                <td className="num">{num(r.period_debit)}</td><td className="num">{num(r.period_credit)}</td>
                <td className="num">{num(r.closing_debit)}</td><td className="num">{num(r.closing_credit)}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={2}>Totaux</td>
              <td className="num">{num(t.od)}</td><td className="num">{num(t.oc)}</td>
              <td className="num">{num(t.pd)}</td><td className="num">{num(t.pc)}</td>
              <td className="num">{num(t.cd)}</td><td className="num">{num(t.cc)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={`badge ${ok ? "ok" : "err"}`} style={{ marginTop: 8 }}>
        {ok ? "Balance équilibrée" : "Attention : balance déséquilibrée"}
      </p>
    </>
  );
}
