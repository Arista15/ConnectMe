import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import PrintButton from "@/components/PrintButton";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import InvoiceDocument from "@/components/InvoiceDocument";
import { Panel, Empty, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { money, dateFr, today, rel } from "@/lib/format";
import { recordPayment, cancelCustomerInvoice } from "../../actions";
import { applyAdvance, cancelApplication } from "../../parite-actions";

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
  const [{ data: payments }, { data: treasuries }, { data: siteInfo }, { data: advances }, { data: applications }] = await Promise.all([
    supabase.from("payments").select("id, payment_date, amount, reference, treasury_accounts(name)").eq("customer_invoice_id", id).order("payment_date"),
    supabase.from("treasury_accounts").select("id, name, kind").eq("site_id", site.id).eq("currency", inv.currency).eq("active", true).order("name"),
    supabase.from("sites").select("name, city, sector, address, rccm, id_nat, nif").eq("id", site.id).maybeSingle(),
    supabase.from("customer_advances").select("id, advance_date, amount, applied, currency, reference, treasury_accounts(kind)")
      .eq("site_id", site.id).eq("customer_id", inv.customer_id).eq("currency", inv.currency).order("advance_date"),
    supabase.from("advance_applications").select("id, amount, application_date, cancelled_at").eq("invoice_id", id).is("cancelled_at", null).order("application_date"),
  ]);
  const c = rel<{ name: string; email: string; phone: string; address: string; tax_id: string }>(inv.customers);
  const remaining = Number(inv.total) - Number(inv.amount_paid);
  const lines = [...inv.customer_invoice_lines].sort((a: { id: number }, b: { id: number }) => a.id - b.id);
  const isOpen = ["emise", "partielle"].includes(inv.status);
  const available = (advances ?? []).filter((a) => Number(a.amount) - Number(a.applied) > 0.005);
  const self = `/espace/factures-clients/${inv.id}`;

  const history = [
    ...(payments ?? []).map((p) => ({ key: p.id, date: p.payment_date, type: "Règlement", ref: p.reference, mode: rel(p.treasury_accounts)?.name ?? "", amount: Number(p.amount), appId: null as string | null })),
    ...(applications ?? []).map((a) => ({ key: a.id, date: a.application_date, type: "Acompte imputé", ref: "", mode: "4191", amount: Number(a.amount), appId: a.id })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="doc-bar no-print">
        <Link href="/espace/factures-clients" className="btn plain"><Icon name="back" /> Retour</Link>
        <div className="actions-bar">
          {isOpen && (
            <Modal label="Encaisser / acompte" title={<>Encaissement — {inv.number}</>} variant="ghost" size="lg">
              <div className="stats" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 16 }}>
                <div className="stat"><div className="label">Total TTC</div><div className="value">{money(inv.total, inv.currency)}</div></div>
                <div className="stat"><div className="label">Déjà reçu</div><div className="value">{money(inv.amount_paid, inv.currency)}</div></div>
                <div className="stat"><div className="label">Reste dû</div><div className="value">{money(remaining, inv.currency)}</div></div>
              </div>
              {available.length > 0 && (
                <>
                  <h4 className="small fw-600" style={{ margin: "0 0 8px" }}>Acomptes disponibles de ce client</h4>
                  {available.map((a) => {
                    const left = Number(a.amount) - Number(a.applied);
                    return (
                      <form key={a.id} action={applyAdvance} className="site-card" style={{ padding: "0.5rem 0.75rem", marginBottom: 8 }}>
                        <input type="hidden" name="advance_id" value={a.id} />
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <input type="hidden" name="back" value={self} />
                        <span className="info mono small">{dateFr(a.advance_date)} · {money(left, a.currency)}{a.reference ? ` · ${a.reference}` : ""}</span>
                        <button className="btn ghost sm">Imputer {money(Math.min(left, remaining), inv.currency)}</button>
                      </form>
                    );
                  })}
                </>
              )}
              <h4 className="small fw-600" style={{ margin: "16px 0 8px" }}>Nouveau paiement (partiel ou total)</h4>
              <form action={recordPayment}>
                <input type="hidden" name="kind" value="reglement_client" />
                <input type="hidden" name="customer_invoice_id" value={inv.id} />
                <input type="hidden" name="currency" value={inv.currency} />
                <input type="hidden" name="back" value={self} />
                <div className="form-grid g4">
                  <div><label>Date</label><input type="date" name="payment_date" defaultValue={today()} required /></div>
                  <div><label>Montant ({inv.currency})</label><input name="amount" inputMode="decimal" placeholder={remaining.toFixed(2)} defaultValue={remaining.toFixed(2)} required /></div>
                  <div>
                    <label>Mode</label>
                    <select name="treasury_account_id" required>
                      {(treasuries ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div><label>Référence</label><input name="reference" maxLength={100} placeholder="N° chèque, virement…" /></div>
                </div>
                <div className="form-foot"><button className="btn">Enregistrer le paiement</button></div>
              </form>
              <p className="note">Chaque paiement passe l&apos;écriture banque/caisse au crédit du 411. Un acompte imputé passe 4191 → 411. La facture passe à « Réglée » quand le reste dû est à zéro.</p>
            </Modal>
          )}
          <PrintButton label="Imprimer / PDF" />
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <InvoiceDocument
        kind="Facture" number={inv.number} issueDate={inv.issue_date} dueDate={inv.due_date}
        site={siteInfo ?? { name: site.name, city: site.city, sector: site.sector }}
        client={c ? { name: c.name, address: c.address, tax_id: c.tax_id } : null}
        lines={lines.map((l: { description: string; quantity: number; unit_price: number; amount: number }) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), amount: Number(l.amount) }))}
        currency={inv.currency} subtotal={Number(inv.subtotal)} vatRate={Number(inv.vat_rate)} vatAmount={Number(inv.vat_amount)}
        total={Number(inv.total)} amountPaid={Number(inv.amount_paid)} notes={inv.notes}
      />

      <div style={{ maxWidth: "48rem", margin: "0 auto" }} className="no-print">
        <Panel id="reglement" title={<>Historique des paiements · <Status status={inv.status} /></>}
          actions={<span className="small">Reste dû : <span className="num fw-600">{money(inv.status === "annulee" ? 0 : remaining, inv.currency)}</span></span>}>
          {history.length === 0 ? <Empty>Aucun paiement reçu.</Empty> : (
            <table>
              <thead><tr><th>Date</th><th>Type</th><th>Mode</th><th className="num">Montant</th><th></th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.key}>
                    <td className="mono">{dateFr(h.date)}</td>
                    <td>{h.type}{h.ref && <span className="xs t-muted"> · {h.ref}</span>}</td>
                    <td>{h.mode}</td>
                    <td className="num">{money(h.amount, inv.currency)}</td>
                    <td className="t-right">
                      {h.appId && (
                        <form action={cancelApplication}>
                          <input type="hidden" name="application_id" value={h.appId} />
                          <input type="hidden" name="back" value={self} />
                          <button className="btn plain sm" title="Retirer l'imputation (l'acompte redevient disponible)">Retirer</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {isOpen && Number(inv.amount_paid) === 0 && (
            <div className="panel-foot">
              <form action={cancelCustomerInvoice}>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <button className="btn plain sm t-danger">Annuler la facture et ses écritures</button>
              </form>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
