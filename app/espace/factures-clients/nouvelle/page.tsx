import Link from "next/link";
import Flash from "@/components/Flash";
import InvoiceForm from "@/components/InvoiceForm";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { today } from "@/lib/format";
import { createCustomerInvoice } from "../../actions";

export const metadata = { title: "Nouvelle facture client" };

const DEFAULT_REVENUE: Record<string, string> = { services: "706", btp: "705", transport: "7061" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").eq("site_id", site.id).order("name");
  const t = today();
  const due = new Date(new Date(t).getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  return (
    <>
      <div className="page-head">
        <div><h1>Nouvelle facture client</h1><p className="muted">Site {site.code} · numérotation FA-{site.code}-AAAA-NNNN automatique</p></div>
        <Link href="/espace/factures-clients" className="btn ghost">Retour</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {(customers ?? []).length === 0 ? (
        <div className="alert info">Aucun client sur ce site. <Link href="/espace/tiers">Créer un client</Link> d'abord.</div>
      ) : (
        <InvoiceForm
          accounts={accounts} sector={site.sector} customers={customers ?? []}
          defaultAccount={DEFAULT_REVENUE[site.sector]} vatRate={Number(site.vat_rate)} rate={Number(site.usd_cdf_rate)}
          today={t} dueDefault={due} action={createCustomerInvoice}
        />
      )}
    </>
  );
}
