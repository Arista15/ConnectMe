import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import AccountSelect from "@/components/AccountSelect";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { money, dateFr, dateTimeFr, today, INVOICE_STATUS, rel } from "@/lib/format";
import { validateSupplierInvoice, rejectSupplierInvoice, recordPayment } from "../../actions";

export const metadata = { title: "Facture fournisseur" };

export default async function SupplierInvoicePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("supplier_invoices")
    .select("*, validator:profiles!supplier_invoices_validated_by_fkey(full_name, email)")
    .eq("id", id).eq("site_id", site.id).maybeSingle();
  if (!inv) notFound();

  const [{ data: suppliers }, { data: treasuries }, { data: payments }, signed] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("site_id", site.id).order("name"),
    supabase.from("treasury_accounts").select("id, name").eq("site_id", site.id).eq("currency", inv.currency).eq("active", true),
    supabase.from("payments").select("id, payment_date, amount, reference, treasury_accounts(name)").eq("supplier_invoice_id", id).order("payment_date"),
    inv.attachment_path
      ? supabase.storage.from("pieces").createSignedUrl(inv.attachment_path, 600)
      : Promise.resolve({ data: null }),
  ]);
  const ai = inv.ai_suggestion as { account_code?: string; account_reason?: string; confidence?: number } | null;
  const remaining = Number(inv.total) - Number(inv.amount_paid);
  const validator = rel<{ full_name: string; email: string }>(inv.validator);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{inv.supplier_name || "Reçu fournisseur"} {inv.reference && `· ${inv.reference}`}</h1>
          <p className="muted">
            {dateFr(inv.invoice_date)} · {money(inv.total, inv.currency)} · <span className="badge">{INVOICE_STATUS[inv.status]}</span>
            {validator && <> · validée par {validator.full_name || validator.email} le {dateTimeFr(inv.validated_at)}</>}
          </p>
        </div>
        <Link href="/espace/factures-fournisseurs" className="btn ghost">← Factures</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pièce justificative</h3>
          {signed?.data?.signedUrl ? (
            inv.attachment_path?.endsWith(".pdf")
              ? <a href={signed.data.signedUrl} target="_blank" rel="noreferrer">Ouvrir le PDF</a>
              : <a href={signed.data.signedUrl} target="_blank" rel="noreferrer"><img src={signed.data.signedUrl} alt="Reçu" style={{ maxWidth: "100%", borderRadius: 8 }} /></a>
          ) : <p className="muted">Pas d'image jointe.</p>}
          {inv.source_text && <pre style={{ whiteSpace: "pre-wrap", background: "#fafbfc", padding: 10, borderRadius: 8 }}>{inv.source_text}</pre>}
          {ai?.account_code && (
            <div className="alert info">
              Proposition de l'analyse : compte <strong>{ai.account_code}</strong>
              {ai.account_reason && <> — {ai.account_reason}</>}
              {typeof ai.confidence === "number" && ` (confiance ${Math.round(ai.confidence * 100)} %)`}
            </div>
          )}
        </div>

        {inv.status === "brouillon" ? (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Valider la comptabilisation</h3>
            <form action={validateSupplierInvoice}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <div className="field">
                <label>Fournisseur</label>
                <select name="supplier_id" defaultValue={inv.supplier_id ?? ""}>
                  <option value="">Créer « {inv.supplier_name} »</option>
                  {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="row">
                <div><label>Référence</label><input name="reference" defaultValue={inv.reference} /></div>
                <div><label>Date</label><input type="date" name="invoice_date" defaultValue={inv.invoice_date} required /></div>
                <div><label>Échéance</label><input type="date" name="due_date" defaultValue={inv.due_date ?? ""} /></div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <div><label>HT ({inv.currency})</label><input name="subtotal" inputMode="decimal" defaultValue={inv.subtotal} required /></div>
                <div><label>TVA</label><input name="vat_amount" inputMode="decimal" defaultValue={inv.vat_amount} /></div>
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label>Compte de charge retenu</label>
                <AccountSelect name="expense_account" accounts={accounts} sector={site.sector} classes={[2, 6]} defaultValue={inv.expense_account ?? ""} required />
              </div>
              <p className="small muted">Écriture : compte retenu et 4452 au débit, 401 au crédit (journal des achats).</p>
              <button className="btn">Valider et comptabiliser</button>
            </form>
            <form action={rejectSupplierInvoice} style={{ marginTop: 10 }}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <button className="btn ghost sm">Rejeter ce reçu</button>
            </form>
          </div>
        ) : (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Comptabilisation</h3>
            <p>HT {money(inv.subtotal, inv.currency)} · TVA {money(inv.vat_amount, inv.currency)} · TTC {money(inv.total, inv.currency)}</p>
            <p>Compte : <strong className="mono">{inv.expense_account}</strong></p>
            <h3>Règlements</h3>
            {(payments ?? []).map((p) => (
              <p key={p.id} className="small">{dateFr(p.payment_date)} · {rel(p.treasury_accounts)?.name} · {money(p.amount, inv.currency)} {p.reference}</p>
            ))}
            {["validee", "partielle"].includes(inv.status) && (
              <form action={recordPayment} style={{ marginTop: 10 }}>
                <input type="hidden" name="kind" value="reglement_fournisseur" />
                <input type="hidden" name="supplier_invoice_id" value={inv.id} />
                <input type="hidden" name="currency" value={inv.currency} />
                <input type="hidden" name="back" value={`/espace/factures-fournisseurs/${inv.id}`} />
                <div className="row">
                  <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
                  <div><label>Montant</label><input name="amount" inputMode="decimal" defaultValue={remaining.toFixed(2)} /></div>
                  <div>
                    <label>Payé par</label>
                    <select name="treasury_account_id">{(treasuries ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                  </div>
                  <div><label>Référence</label><input name="reference" /></div>
                </div>
                <button className="btn" style={{ marginTop: 8 }}>Enregistrer le paiement</button>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}
