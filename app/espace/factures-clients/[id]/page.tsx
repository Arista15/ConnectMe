import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import PrintButton from "@/components/PrintButton";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { money, dateFr, today, INVOICE_STATUS, rel } from "@/lib/format";
import { recordPayment, cancelCustomerInvoice } from "../../actions";

export const metadata = { title: "Facture client" };

export default async function InvoicePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getActiveSite();
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("customer_invoices")
    .select("*, customers(name, email, phone, address, tax_id), customer_invoice_lines(*)")
    .eq("id", id).eq("site_id", site.id).maybeSingle();
  if (!inv) notFound();
  const [{ data: payments }, { data: treasuries }] = await Promise.all([
    supabase.from("payments").select("id, payment_date, amount, reference, reconciled, treasury_accounts(name)")
      .eq("customer_invoice_id", id).order("payment_date"),
    supabase.from("treasury_accounts").select("id, name, kind").eq("site_id", site.id)
      .eq("currency", inv.currency).eq("active", true).order("name"),
  ]);
  const c = rel<{ name: string; email: string; phone: string; address: string; tax_id: string }>(inv.customers);
  const remaining = Number(inv.total) - Number(inv.amount_paid);
  const lines = [...inv.customer_invoice_lines].sort((a: { id: number }, b: { id: number }) => a.id - b.id);

  return (
    <>
      <div className="page-head no-print">
        <Link href="/espace/factures-clients" className="btn ghost">← Factures</Link>
        <PrintButton label="Imprimer la facture" />
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="card">
        <div className="page-head">
          <div>
            <img src="/logo.svg" alt="KBS" width={48} height={48} />
            <p><strong>Kafaus Business Service SARL</strong><br />{site.name} – {site.city}</p>
          </div>
          <div className="right">
            <h1>Facture {inv.number}</h1>
            <p>Date : {dateFr(inv.issue_date)}<br />Échéance : {dateFr(inv.due_date)}</p>
            <span className="badge">{INVOICE_STATUS[inv.status]}</span>
          </div>
        </div>
        <p>
          <strong>Client :</strong> {c?.name}<br />
          {c?.address && <>{c.address}<br /></>}
          {c?.tax_id && <>N° impôt : {c.tax_id}<br /></>}
          {c?.email}
        </p>
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">P.U. HT</th><th className="num">Montant HT</th></tr></thead>
          <tbody>
            {lines.map((l: { id: number; description: string; quantity: number; unit_price: number; amount: number }) => (
              <tr key={l.id}>
                <td>{l.description}</td><td className="num">{Number(l.quantity)}</td>
                <td className="num">{money(l.unit_price, inv.currency)}</td><td className="num">{money(l.amount, inv.currency)}</td>
              </tr>
            ))}
            <tr className="subtotal"><td colSpan={3} className="right">Total HT</td><td className="num">{money(inv.subtotal, inv.currency)}</td></tr>
            <tr className="subtotal"><td colSpan={3} className="right">TVA {Number(inv.vat_rate)} %</td><td className="num">{money(inv.vat_amount, inv.currency)}</td></tr>
            <tr className="total"><td colSpan={3} className="right">Total TTC</td><td className="num">{money(inv.total, inv.currency)}</td></tr>
          </tbody>
        </table>
        {inv.currency === "CDF" && <p className="small muted">Contre-valeur : {money(Number(inv.total) / Number(inv.exchange_rate))} au taux de 1 USD = {Number(inv.exchange_rate)} CDF.</p>}
        {inv.notes && <p style={{ whiteSpace: "pre-wrap" }}>{inv.notes}</p>}
      </div>

      <div className="grid grid-2 no-print">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Règlements</h3>
          {(payments ?? []).length === 0 ? <p className="muted">Aucun règlement.</p> : (
            <table>
              <thead><tr><th>Date</th><th>Compte</th><th>Réf.</th><th className="num">Montant</th></tr></thead>
              <tbody>
                {(payments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{dateFr(p.payment_date)}</td><td>{rel(p.treasury_accounts)?.name}</td><td>{p.reference}</td>
                    <td className="num">{money(p.amount, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p><strong>Reste dû : {money(inv.status === "annulee" ? 0 : remaining, inv.currency)}</strong></p>
        </div>

        {["emise", "partielle"].includes(inv.status) && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Enregistrer un règlement</h3>
            <form action={recordPayment}>
              <input type="hidden" name="kind" value="reglement_client" />
              <input type="hidden" name="customer_invoice_id" value={inv.id} />
              <input type="hidden" name="currency" value={inv.currency} />
              <input type="hidden" name="back" value={`/espace/factures-clients/${inv.id}`} />
              <div className="row">
                <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} required /></div>
                <div><label>Montant ({inv.currency})</label><input name="amount" inputMode="decimal" defaultValue={remaining.toFixed(2)} required /></div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <div>
                  <label>Encaissé sur</label>
                  <select name="treasury_account_id" required>
                    {(treasuries ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div><label>Référence</label><input name="reference" placeholder="N° virement, reçu…" /></div>
              </div>
              <button className="btn" style={{ marginTop: 10 }}>Enregistrer</button>
              {inv.currency === "CDF" && <p className="small muted">L'écart entre le taux de la facture et le taux du jour est comptabilisé en 676 / 776.</p>}
            </form>
            {Number(inv.amount_paid) === 0 && (
              <form action={cancelCustomerInvoice} style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button className="btn danger sm">Annuler la facture (écriture inverse)</button>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}
