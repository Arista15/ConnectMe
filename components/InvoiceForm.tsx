"use client";

import { useMemo, useState } from "react";
import AccountSelect from "./AccountSelect";
import type { Account } from "@/lib/types";

type Line = { description: string; quantity: string; unit_price: string; account_code: string };
const n = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;

export default function InvoiceForm({
  accounts, sector, customers, defaultAccount, vatRate, rate, today, dueDefault, action,
}: {
  accounts: Account[]; sector: string; customers: { id: string; name: string }[];
  defaultAccount: string; vatRate: number; rate: number; today: string; dueDefault: string;
  action: (fd: FormData) => void;
}) {
  const blank = (): Line => ({ description: "", quantity: "1", unit_price: "", account_code: defaultAccount });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [vat, setVat] = useState(String(vatRate));
  const [currency, setCurrency] = useState("USD");

  const t = useMemo(() => {
    const sub = lines.reduce((s, l) => s + Math.round(n(l.quantity) * n(l.unit_price) * 100) / 100, 0);
    const v = Math.round(sub * n(vat)) / 100;
    return { sub, v, total: sub + v };
  }, [lines, vat]);
  const fmt = (x: number) => x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  return (
    <form action={action} className="card">
      <div className="row">
        <div style={{ flex: "2 1 260px" }}>
          <label htmlFor="customer_id">Client</label>
          <select id="customer_id" name="customer_id" required defaultValue="">
            <option value="" disabled>— Choisir —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label htmlFor="issue_date">Date</label><input id="issue_date" type="date" name="issue_date" defaultValue={today} required /></div>
        <div><label htmlFor="due_date">Échéance</label><input id="due_date" type="date" name="due_date" defaultValue={dueDefault} required /></div>
        <div>
          <label htmlFor="currency">Devise</label>
          <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD</option><option value="CDF">CDF</option>
          </select>
        </div>
        <div><label htmlFor="vat_rate">TVA %</label><input id="vat_rate" name="vat_rate" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
      </div>
      {currency === "CDF" && <p className="small muted">Taux du site appliqué et conservé sur la facture : 1 USD = {rate} CDF.</p>}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Désignation</th><th style={{ width: 90 }}>Qté</th><th style={{ width: 140 }}>P.U. HT</th><th style={{ width: "28%" }}>Compte de produit</th><th className="num">Montant HT</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><input value={l.description} onChange={(e) => set(i, { description: e.target.value })} required /></td>
                <td><input inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></td>
                <td><input inputMode="decimal" value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} /></td>
                <td><AccountSelect accounts={accounts} sector={sector} classes={[7]} value={l.account_code} onChange={(c) => set(i, { account_code: c })} required /></td>
                <td className="num">{fmt(Math.round(n(l.quantity) * n(l.unit_price) * 100) / 100)}</td>
                <td>{lines.length > 1 && <button type="button" className="linkbtn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Retirer</button>}</td>
              </tr>
            ))}
            <tr><td colSpan={6}><button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, blank()])}>+ Ligne</button></td></tr>
            <tr className="subtotal"><td colSpan={4} className="right">Total HT</td><td className="num">{fmt(t.sub)}</td><td></td></tr>
            <tr className="subtotal"><td colSpan={4} className="right">TVA ({vat} %)</td><td className="num">{fmt(t.v)}</td><td></td></tr>
            <tr className="total"><td colSpan={4} className="right">Total TTC ({currency})</td><td className="num">{fmt(t.total)}</td><td></td></tr>
          </tbody>
        </table>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="notes">Mentions (conditions de paiement, coordonnées bancaires…)</label>
        <textarea id="notes" name="notes" />
      </div>
      <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({
        description: l.description, quantity: n(l.quantity), unit_price: n(l.unit_price), account_code: l.account_code,
      })))} />
      <button className="btn" disabled={t.sub <= 0}>Émettre et comptabiliser</button>
      <p className="small muted">Écriture générée au journal des ventes : 411 au débit (TTC), produits et 4431 au crédit.</p>
    </form>
  );
}
