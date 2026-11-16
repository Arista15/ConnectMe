import Link from "next/link";
import Flash from "@/components/Flash";
import { PageHeader, Panel, Empty, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getOpenSiteById } from "@/lib/session";
import { money, dateFr, today, rel } from "@/lib/format";
import { quickCustomerInvoice } from "../../../parite-actions";

export const metadata = { title: "Factures clients du site" };

const REVENUE: Record<string, [string, string]> = { services: ["706", "706 — Services vendus"], btp: ["705", "705 — Travaux facturés"], transport: ["7061", "7061 — Fret"] };

export default async function QuickCustomer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getOpenSiteById(id);
  const supabase = await createClient();
  const [{ data: customers }, { data: recent }] = await Promise.all([
    supabase.from("customers").select("id, name").eq("site_id", site.id).order("name"),
    supabase.from("customer_invoices").select("id, number, issue_date, due_date, total, currency, exchange_rate, status, customers(name)")
      .eq("site_id", site.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const [acc, accLabel] = REVENUE[site.sector] ?? REVENUE.services;

  return (
    <>
      <PageHeader title={`Factures clients — ${site.code} ${site.name}`}
        subtitle={`La validation crée l'écriture de vente : débit 411 Clients, crédit ${accLabel} et 4431 TVA facturée.`} />
      <Flash ok={sp.ok} err={sp.err} />
      <form action={quickCustomerInvoice} className="card" style={{ padding: "1rem" }}>
        <input type="hidden" name="site_id" value={site.id} />
        <input type="hidden" name="account" value={acc} />
        <div className="form-grid g4">
          <div><label>Date</label><input type="date" name="date" defaultValue={today()} /></div>
          <div><label>Échéance</label><input type="date" name="due" /></div>
          <div>
            <label>Client</label>
            <select name="client_id" defaultValue="">
              <option value="">— Nouveau / aucun —</option>
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label>Nouveau client</label><input name="new_client" placeholder="Nom" maxLength={200} /></div>
          <div><label>Compte client</label><input value="411 — Clients" disabled /></div>
          <div className="span-2"><label>Libellé</label><input name="description" maxLength={500} required /></div>
          <div><label>Montant HT</label><input name="amount" type="number" step="0.01" required /></div>
          <div><label>TVA %</label><input name="tax_rate" type="number" defaultValue={Number(site.vat_rate)} /></div>
          <div><label>Devise</label><select name="currency"><option>USD</option><option>CDF</option></select></div>
          <div><label>Taux (FC par $)</label><input value={Number(site.usd_cdf_rate)} readOnly className="mono" /></div>
        </div>
        <div className="form-foot">
          <span className="grow small t-muted">Échéance par défaut : 30 jours.</span>
          <button className="btn">Enregistrer et passer l&apos;écriture</button>
        </div>
      </form>
      <Panel title="Dernières factures clients du site" actions={<Link href={`/espace/site/${site.id}`}>Retour au site →</Link>}>
        {(recent ?? []).length === 0 ? <Empty>Aucune facture.</Empty> : (
          <table>
            <thead><tr><th>N°</th><th>Date</th><th>Échéance</th><th>Client</th><th className="num">TTC</th><th className="num">Taux</th><th>Statut</th></tr></thead>
            <tbody>
              {(recent ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono xs"><Link href={`/espace/factures-clients/${r.id}`}>{r.number}</Link></td><td className="mono">{dateFr(r.issue_date)}</td><td className="mono">{dateFr(r.due_date)}</td>
                  <td>{rel(r.customers)?.name ?? "—"}</td><td className="num">{money(r.total, r.currency)}</td><td className="num">{Number(r.exchange_rate).toLocaleString("fr-FR")}</td><td><Status status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
