"use client";

import { useMemo, useState } from "react";
import AccountSelect from "./AccountSelect";
import type { Account } from "@/lib/types";

type Line = { account_code: string; label: string; debit: string; credit: string };
type Template = { id: number; name: string; journal_code: string; sector: string | null;
  lines: { account_code: string; side: "D" | "C"; label: string }[] };

const empty = (): Line => ({ account_code: "", label: "", debit: "", credit: "" });

export type EntryInitial = { journal: string; date: string; reference: string; label: string; currency: string; lines: Line[] };
const n = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;

export default function EntryForm({
  accounts, sector, templates, action, today, initial, entryId, back,
}: {
  accounts: Account[]; sector: string; templates: Template[];
  action: (fd: FormData) => void; today: string;
  initial?: EntryInitial; entryId?: string; back?: string;
}) {
  const [journal, setJournal] = useState(initial?.journal ?? "OD");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [lines, setLines] = useState<Line[]>(initial?.lines.length ? initial.lines : [empty(), empty()]);

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + n(l.debit), 0);
    const c = lines.reduce((s, l) => s + n(l.credit), 0);
    return { d: Math.round(d * 100) / 100, c: Math.round(c * 100) / 100 };
  }, [lines]);
  const balanced = totals.d > 0 && totals.d === totals.c;

  function set(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function applyTemplate(id: string) {
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setJournal(t.journal_code);
    setLabel(t.name);
    setLines(t.lines.map((l) => ({ account_code: l.account_code, label: l.label, debit: "", credit: "" })));
  }

  return (
    <form action={action}>
      {entryId && <input type="hidden" name="entry_id" value={entryId} />}
      {back && <input type="hidden" name="back" value={back} />}
      <div className="form-grid g4">
        <div className="span-2">
          <label>Écriture type</label>
          <select defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">— Aucune —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.sector ? "★ " : ""}{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="journal_code">Journal</label>
          <select id="journal_code" name="journal_code" value={journal} onChange={(e) => setJournal(e.target.value)}>
            <option value="OD">OD – Opérations diverses</option>
            <option value="VE">VE – Ventes</option>
            <option value="AC">AC – Achats</option>
            <option value="CA">CA – Caisse</option>
            <option value="BQ">BQ – Banque</option>
            <option value="AN">AN – À-nouveaux</option>
          </select>
        </div>
        <div>
          <label htmlFor="entry_date">Date</label>
          <input id="entry_date" name="entry_date" type="date" defaultValue={initial?.date ?? today} required />
        </div>
        <div>
          <label htmlFor="reference">Pièce justificative</label>
          <input id="reference" name="reference" defaultValue={initial?.reference} placeholder="N° reçu, facture, relevé…" required />
        </div>
        <div>
          <label htmlFor="currency">Devise</label>
          <select id="currency" name="currency" defaultValue={initial?.currency ?? "USD"}>
            <option value="USD">USD</option>
            <option value="CDF">CDF</option>
          </select>
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="label">Libellé</label>
        <input id="label" name="label" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>

      <div className="panel" style={{ marginBottom: 0 }}>
        <table>
          <thead>
            <tr><th style={{ width: "34%" }}>Compte</th><th>Libellé de ligne</th><th className="num" style={{ width: 140 }}>Débit</th><th className="num" style={{ width: 140 }}>Crédit</th><th></th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <AccountSelect accounts={accounts} sector={sector} value={l.account_code}
                    onChange={(code) => set(i, { account_code: code })} required />
                </td>
                <td><input value={l.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
                <td><input inputMode="decimal" value={l.debit} style={{ textAlign: "right" }}
                  onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} /></td>
                <td><input inputMode="decimal" value={l.credit} style={{ textAlign: "right" }}
                  onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} /></td>
                <td>
                  {lines.length > 2 && (
                    <button type="button" className="linkbtn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Retirer</button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={2}>
                <button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, empty()])}>+ Ligne</button>
                {!balanced && totals.d + totals.c > 0 && (
                  <span className="badge err" style={{ marginLeft: 10 }}>Écart : {(totals.d - totals.c).toFixed(2)}</span>
                )}
                {balanced && <span className="badge ok" style={{ marginLeft: 10 }}>Équilibrée</span>}
              </td>
              <td className="num">{totals.d.toFixed(2)}</td>
              <td className="num">{totals.c.toFixed(2)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({
        account_code: l.account_code, label: l.label || label, debit: n(l.debit), credit: n(l.credit),
      })))} />
      <div className="form-foot">
        <span className="grow small num">Débit {totals.d.toFixed(2)} · Crédit {totals.c.toFixed(2)}{" "}
          <span className={balanced ? "t-success" : "t-danger"}>{balanced ? "✓ équilibrée" : totals.d + totals.c > 0 ? `écart ${(totals.d - totals.c).toFixed(2)}` : ""}</span>
        </span>
        <button className="btn" disabled={!balanced}>Enregistrer</button>
      </div>
    </form>
  );
}
