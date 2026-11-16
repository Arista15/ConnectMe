import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import PrintButton from "@/components/PrintButton";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import InvoiceDocument from "@/components/InvoiceDocument";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { today, rel } from "@/lib/format";
import { convertQuote, setQuoteStatus, deleteQuote } from "../../parite-actions";

export const metadata = { title: "Devis" };

export default async function QuotePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getActiveSite();
  const supabase = await createClient();
  const { data: qt } = await supabase.from("customer_quotes")
    .select("*, customers(name, address, tax_id), customer_quote_lines(*)").eq("id", id).eq("site_id", site.id).maybeSingle();
  if (!qt) notFound();
  const { data: siteInfo } = await supabase.from("sites").select("name, city, sector, address, rccm, id_nat, nif").eq("id", site.id).maybeSingle();
  const lines = [...qt.customer_quote_lines].sort((a: { id: number }, b: { id: number }) => a.id - b.id);
  const c = rel<{ name: string; address: string; tax_id: string }>(qt.customers);
  const t = today();
  const due = new Date(new Date(t).getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  return (
    <>
      <div className="doc-bar no-print">
        <Link href="/espace/factures-clients?onglet=devis" className="btn plain"><Icon name="back" /> Retour</Link>
        <div className="actions-bar">
          {qt.status === "accepte" && qt.invoice_id && <Link href={`/espace/factures-clients/${qt.invoice_id}`} className="btn ghost">Voir la facture</Link>}
          {qt.status !== "accepte" && (
            <>
              <form action={deleteQuote}><input type="hidden" name="quote_id" value={qt.id} /><button className="btn plain" title="Supprimer"><Icon name="trash" /></button></form>
              <form action={setQuoteStatus}>
                <input type="hidden" name="quote_id" value={qt.id} />
                <input type="hidden" name="status" value={qt.status === "refuse" ? "brouillon" : "refuse"} />
                <button className="btn ghost">{qt.status === "refuse" ? "Remettre en brouillon" : "Refusé"}</button>
              </form>
              <Modal label="Convertir en facture" title={<>Convertir le devis {qt.number}</>}>
                <form action={convertQuote}>
                  <input type="hidden" name="quote_id" value={qt.id} />
                  <div className="form-grid">
                    <div><label>Date de facture</label><input type="date" name="issue_date" defaultValue={t} required /></div>
                    <div><label>Échéance</label><input type="date" name="due_date" defaultValue={due} required /></div>
                  </div>
                  <p className="note">La facture reprend les lignes du devis, au taux du jour du site, et passe l&apos;écriture de vente (411 / 70x / 4431).</p>
                  <div className="form-foot"><button className="btn">Créer la facture</button></div>
                </form>
              </Modal>
            </>
          )}
          <PrintButton label="Imprimer / PDF" />
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <InvoiceDocument
        kind="Devis" number={qt.number} issueDate={qt.issue_date} dueDate={qt.valid_until} dueLabel="valable jusqu'au"
        site={siteInfo ?? { name: site.name, city: site.city, sector: site.sector }}
        client={c ? { name: c.name, address: c.address, tax_id: c.tax_id } : null}
        lines={lines.map((l: { description: string; quantity: number; unit_price: number; amount: number }) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price), amount: Number(l.amount) }))}
        currency={qt.currency} subtotal={Number(qt.subtotal)} vatRate={Number(qt.vat_rate)} vatAmount={Number(qt.vat_amount)} total={Number(qt.total)} notes={qt.notes} status={qt.status}
      />
    </>
  );
}
