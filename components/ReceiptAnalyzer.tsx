"use client";

import { useState } from "react";
import AccountSelect from "./AccountSelect";
import Icon from "./Icon";
import type { Account } from "@/lib/types";

type Suggestion = {
  supplier_name?: string; reference?: string; invoice_date?: string; due_date?: string | null;
  currency?: "USD" | "CDF"; subtotal?: number; vat_amount?: number; total?: number;
  account_code?: string; account_reason?: string; confidence?: number; notes?: string;
};

export default function ReceiptAnalyzer({
  accounts, sector, suppliers, today, action,
}: {
  accounts: Account[]; sector: string; suppliers: { id: string; name: string; default_account: string | null }[];
  today: string; action: (fd: FormData) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<Suggestion>({});
  const [attachment, setAttachment] = useState<string>("");
  const [text, setText] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [account, setAccount] = useState("");
  const [key, setKey] = useState(0); // force la remise à zéro des champs pré-remplis

  async function analyse(form: HTMLFormElement) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(form);
      const res = await fetch("/api/analyse-recu", { method: "POST", body: fd });
      const json = await res.json();
      if (json.attachment_path) setAttachment(json.attachment_path);
      if (!res.ok) throw new Error(json.error ?? "Analyse impossible");
      const sug: Suggestion = json.suggestion ?? {};
      setS(sug);
      setAttachment(json.attachment_path ?? "");
      setAccount(sug.account_code ?? "");
      const match = suppliers.find((x) => sug.supplier_name && x.name.toLowerCase() === sug.supplier_name.toLowerCase());
      setSupplierId(match?.id ?? "");
      if (match?.default_account && !sug.account_code) setAccount(match.default_account);
      setKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="ai-box" data-keep-open onSubmit={(e) => { e.preventDefault(); analyse(e.currentTarget); }}>
        <div className="ai-title"><Icon name="sparkles" /> Lire le reçu avec l&apos;IA</div>
        <div className="form-grid">
          <div>
            <label htmlFor="file">Photo ou PDF du reçu</label>
            <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" />
          </div>
          <div>
            <label htmlFor="text">… ou texte du reçu (copié d'un e-mail, d'un SMS)</label>
            <textarea id="text" name="text" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 70 }} />
          </div>
        </div>
        <button className="btn secondary sm" style={{ marginTop: 10 }} disabled={busy}>{busy ? "Analyse en cours…" : "Analyser et pré-remplir"}</button>
        {err && <div className="alert err" style={{ marginTop: 10 }}>{err}</div>}
        {s.account_reason && (
          <div className="alert info" style={{ marginTop: 10 }}>
            Compte proposé <strong>{s.account_code}</strong> : {s.account_reason}
            {typeof s.confidence === "number" && ` (confiance ${Math.round(s.confidence * 100)} %)`}
            {s.notes && <><br />{s.notes}</>}
          </div>
        )}
      </form>

      <form action={action} className="card" key={key}>
        <h3 style={{ marginTop: 0 }}>Vérifier puis enregistrer</h3>
        <p className="small muted">Rien n'est comptabilisé à cette étape : la facture reste « à valider » jusqu'à votre validation.</p>
        <input type="hidden" name="attachment_path" value={attachment} />
        <input type="hidden" name="source_text" value={text} />
        <input type="hidden" name="ai" value={Object.keys(s).length ? JSON.stringify(s) : ""} />
        <div className="row">
          <div>
            <label>Fournisseur existant</label>
            <select name="supplier_id" value={supplierId} onChange={(e) => {
              setSupplierId(e.target.value);
              const sup = suppliers.find((x) => x.id === e.target.value);
              if (sup?.default_account && !account) setAccount(sup.default_account);
            }}>
              <option value="">— Nouveau / non listé —</option>
              {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div><label>Nom du fournisseur</label><input name="supplier_name" defaultValue={s.supplier_name ?? ""} required={!supplierId} /></div>
          <div><label>N° de facture / reçu</label><input name="reference" defaultValue={s.reference ?? ""} /></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div><label>Date</label><input type="date" name="invoice_date" defaultValue={s.invoice_date ?? today} required /></div>
          <div><label>Échéance</label><input type="date" name="due_date" defaultValue={s.due_date ?? ""} /></div>
          <div>
            <label>Devise</label>
            <select name="currency" defaultValue={s.currency ?? "USD"}><option>USD</option><option>CDF</option></select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div><label>Montant HT</label><input name="subtotal" inputMode="decimal" defaultValue={s.subtotal ?? ""} required /></div>
          <div><label>TVA</label><input name="vat_amount" inputMode="decimal" defaultValue={s.vat_amount ?? 0} /></div>
          <div><label>Total TTC</label><input name="total" inputMode="decimal" defaultValue={s.total ?? ""} /></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Compte de charge proposé</label>
          <AccountSelect name="expense_account" accounts={accounts} sector={sector} classes={[2, 6]}
            value={account} onChange={setAccount} />
        </div>
        <div className="form-foot"><button className="btn">Enregistrer en brouillon (à valider)</button></div>
      </form>
    </>
  );
}
