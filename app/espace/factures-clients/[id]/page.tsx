import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import PrintButton from "@/components/PrintButton";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { PageHeader, Panel, Empty, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { money, dateFr, today, rel } from "@/lib/format";
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
  const isOpen = ["emise", "partielle"].includes(inv.status);

  return (
    <>
      <PageHeader
        title={<>Facture <span className="num">{inv.number}</span></>}
        subtitle={<>{c?.name} · émise le {dateFr(inv.issue_date)} · échéance {dateFr(inv.due_date)} · <Status status={inv.status} /></>}
        actions={<>
          <Link href="/espace/factures-clients" className="btn ghost"><Icon name="back" /> Factures</Link>
          <PrintButton label="Imprimer la facture" />
          {isOpen && (
            <Modal label="Enregistrer un règlement" title={<>Encaissement — {inv.number}</>} icon="wallet" size="lg">
              <div className="stats" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 16 }}>
                <div className="stat"><div className="label">Total TTC</div><div className="value">{money(inv.total, inv.currency)}</div></div>
                <div className="stat"><div className="label">Déjà reçu</div><div className="value">{money(inv.amount_paid, inv.currency)}</div></div>
                <div className="stat"><div className="label">Reste dû</div><div className="value">{money(remaining, inv.currency)}</div></div>
              </div>
              <form action={recordPayment}>
                <input type="hidden" name="kind" value="reglement_client" />
                <input type="hidden" name="customer_invoice_id" value={inv.id} />
                <input type="hidden" name="currency" value={inv.currency} />
                <input type="hidden" name="back" value={`/espace/factures-clients/${inv.id}`} />
                <div className="form-grid">
                  <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} required /></div>
                  <div><label>Montant ({inv.currency})</label><input name="amount" inputMode="decimal" defaultValue={remaining.toFixed(2)} required /></div>
                  <div>
                    <label>Encaissé sur</label>
                    <select name="treasury_account_id" required>
                      {(treasuries ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div><label>Référence</label><input name="reference" placeholder="N° virement, reçu…" /></div>
                </div>
                <p className="note">
                  Le paiement passe l&apos;écriture banque/caisse au crédit du 411.
                  {inv.currency === "CDF" && " L'écart entre le taux de la facture et le taux du jour va en 676 / 776."}
                </p>
                <div className="form-foot"><button className="btn">Enregistrer le paiement</button></div>
              </form>
            </Modal>
          )}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <article className="doc">
        <div className="doc-head">
          <div>
            <img src="/kbs-logo.png" alt="KBS" />
            <div className="doc-meta"><strong>Kafaus Business Service SARL</strong><br />{site.name} — {site.city}</div>
          </div>
          <div className="t-right">
            <h1>Facture <span className="num">{inv.number}</span></h1>
            <div className="doc-meta">Date : <span className="num">{dateFr(inv.issue_date)}</span><br />Échéance : <span className="num">{dateFr(inv.due_date)}</span></div>
          </div>
        </div>
        <div className="doc-meta" style={{ marginBottom: 16 }}>
          <span className="xs t-muted" style={{ textTransform: "uppercase", letterSpacing: ".05em" }}>Client</span><br />
          <strong>{c?.name}</strong><br />
          {c?.address && <>{c.address}<br /></>}
          {c?.tax_id && <>N° impôt : {c.tax_id}<br /></>}
          {c?.email}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">P.U. HT</th><th className="num">Montant HT</th></tr></thead>
            <tbody>
              {lines.map((l: { id: number; description: string; quantity: number; unit_price: number; amount: number }) => (
                <tr key={l.id}>
                  <td>{l.description}</td><td className="mono">{Number(l.quantity)}</td>
                  <td className="num">{money(l.unit_price, inv.currency)}</td><td className="num">{money(l.amount, inv.currency)}</td>
                </tr>
              ))}
              <tr className="subtotal"><td colSpan={3} className="t-right">Total HT</td><td className="num">{money(inv.subtotal, inv.currency)}</td></tr>
              <tr className="subtotal"><td colSpan={3} className="t-right">TVA {Number(inv.vat_rate)} %</td><td className="num">{money(inv.vat_amount, inv.currency)}</td></tr>
              <tr className="total"><td colSpan={3} className="t-right">Total TTC</td><td className="num">{money(inv.total, inv.currency)}</td></tr>
            </tbody>
          </table>
        </div>
        {inv.currency === "CDF" && <p className="note">Contre-valeur : {money(Number(inv.total) / Number(inv.exchange_rate))} au taux de 1 USD = {Number(inv.exchange_rate)} CDF.</p>}
        {inv.notes && <p style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{inv.notes}</p>}
      </article>

      <Panel title="Historique des paiements" id="reglement" className="no-print"
        actions={<span className="small">Reste dû : <span className="num fw-600">{money(inv.status === "annulee" ? 0 : remaining, inv.currency)}</span></span>}>
        {(payments ?? []).length === 0 ? <Empty>Aucun paiement reçu.</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Compte</th><th>Référence</th><th className="num">Montant</th></tr></thead>
            <tbody>
              {(payments ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="mono">{dateFr(p.payment_date)}</td><td>{rel(p.treasury_accounts)?.name}</td><td className="mono xs">{p.reference}</td>
                  <td className="num">{money(p.amount, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isOpen && Number(inv.amount_paid) === 0 && (
          <div className="panel-foot">
            <form action={cancelCustomerInvoice}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <button className="btn danger sm">Annuler la facture (écriture inverse)</button>
            </form>
          </div>
        )}
      </Panel>
    </>
  );
}
