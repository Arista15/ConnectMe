import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import AccountSelect from "@/components/AccountSelect";
import { PageHeader, Panel, Empty, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { money, dateFr, dateTimeFr, today, rel } from "@/lib/format";
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
      <PageHeader
        title={<>{inv.supplier_name || "Reçu fournisseur"}{inv.reference && <span className="num t-muted" style={{ fontSize: "1.25rem" }}> · {inv.reference}</span>}</>}
        subtitle={<>
          <span className="num">{dateFr(inv.invoice_date)}</span> · <span className="num">{money(inv.total, inv.currency)}</span> · <Status status={inv.status} />
          {validator && <> · validée par {validator.full_name || validator.email} le {dateTimeFr(inv.validated_at)}</>}
        </>}
        actions={<Link href="/espace/factures-fournisseurs" className="btn ghost"><Icon name="back" /> Factures</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="cols-2">
        <Panel title="Pièce justificative">
          <div className="panel-body">
            {signed?.data?.signedUrl ? (
              inv.attachment_path?.endsWith(".pdf")
                ? <a href={signed.data.signedUrl} target="_blank" rel="noreferrer" className="btn ghost">Ouvrir le PDF</a>
                : <a href={signed.data.signedUrl} target="_blank" rel="noreferrer"><img src={signed.data.signedUrl} alt="Reçu" style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid var(--border)" }} /></a>
            ) : <p className="t-muted small">Pas d&apos;image jointe.</p>}
            {inv.source_text && <pre className="ai-box" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 12 }}>{inv.source_text}</pre>}
            {ai?.account_code && (
              <div className="alert info" style={{ marginTop: 12, marginBottom: 0 }}>
                Compte proposé : <strong className="num">{ai.account_code}</strong>
                {ai.account_reason && <> — {ai.account_reason}</>}
                {typeof ai.confidence === "number" && ` (confiance ${Math.round(ai.confidence * 100)} %)`}
              </div>
            )}
          </div>
        </Panel>

        {inv.status === "brouillon" ? (
          <Panel title="Valider la comptabilisation">
            <div className="panel-body">
              <form action={validateSupplierInvoice}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <div className="form-grid">
                  <div className="span-2">
                    <label>Fournisseur</label>
                    <select name="supplier_id" defaultValue={inv.supplier_id ?? ""}>
                      <option value="">+ Nouveau : {inv.supplier_name}</option>
                      {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div><label>N° facture fournisseur</label><input name="reference" defaultValue={inv.reference} /></div>
                  <div><label>Date</label><input type="date" name="invoice_date" defaultValue={inv.invoice_date} required /></div>
                  <div><label>Échéance</label><input type="date" name="due_date" defaultValue={inv.due_date ?? ""} /></div>
                  <div><label>Montant HT ({inv.currency})</label><input name="subtotal" inputMode="decimal" defaultValue={inv.subtotal} required /></div>
                  <div><label>TVA récupérable</label><input name="vat_amount" inputMode="decimal" defaultValue={inv.vat_amount} /></div>
                  <div className="span-2">
                    <label>Compte de charge retenu</label>
                    <AccountSelect name="expense_account" accounts={accounts} sector={site.sector} classes={[2, 6]} defaultValue={inv.expense_account ?? ""} required />
                  </div>
                </div>
                <p className="note">Écriture : compte retenu et 4452 au débit, 401 au crédit (journal des achats).</p>
                <div className="form-foot">
                  <button className="btn">Enregistrer et valider</button>
                </div>
              </form>
              <form action={rejectSupplierInvoice} style={{ marginTop: 8 }}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button className="btn plain sm t-danger">Rejeter ce reçu</button>
              </form>
            </div>
          </Panel>
        ) : (
          <Panel title="Comptabilisation">
            <table>
              <tbody>
                <tr><td>Montant HT</td><td className="num">{money(inv.subtotal, inv.currency)}</td></tr>
                <tr><td>TVA récupérable</td><td className="num">{money(inv.vat_amount, inv.currency)}</td></tr>
                <tr className="fw-600"><td>Total TTC</td><td className="num">{money(inv.total, inv.currency)}</td></tr>
                <tr><td>Compte de charge</td><td className="mono fw-600 t-primary">{inv.expense_account}</td></tr>
                <tr><td>Reste à payer</td><td className="num fw-600">{["validee", "partielle"].includes(inv.status) ? money(remaining, inv.currency) : "—"}</td></tr>
              </tbody>
            </table>
            <div className="panel-head" style={{ borderTop: "1px solid var(--border)" }}><h3>Paiements</h3></div>
            {(payments ?? []).length === 0 ? <Empty>Aucun paiement.</Empty> : (
              <table>
                <tbody>
                  {(payments ?? []).map((p) => (
                    <tr key={p.id}><td className="mono">{dateFr(p.payment_date)}</td><td>{rel(p.treasury_accounts)?.name}</td><td className="mono xs">{p.reference}</td><td className="num">{money(p.amount, inv.currency)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {["validee", "partielle"].includes(inv.status) && (
              <form action={recordPayment} className="panel-foot">
                <input type="hidden" name="kind" value="reglement_fournisseur" />
                <input type="hidden" name="supplier_invoice_id" value={inv.id} />
                <input type="hidden" name="currency" value={inv.currency} />
                <input type="hidden" name="back" value={`/espace/factures-fournisseurs/${inv.id}`} />
                <div className="form-grid">
                  <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} /></div>
                  <div><label>Montant ({inv.currency})</label><input name="amount" inputMode="decimal" defaultValue={remaining.toFixed(2)} /></div>
                  <div>
                    <label>Payé par</label>
                    <select name="treasury_account_id">{(treasuries ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                  </div>
                  <div><label>Référence</label><input name="reference" /></div>
                </div>
                <div className="form-foot"><button className="btn">Enregistrer le paiement</button></div>
              </form>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
