import Link from "next/link";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import ReceiptAnalyzer from "@/components/ReceiptAnalyzer";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { today } from "@/lib/format";
import { createSupplierInvoice } from "../../actions";

export const metadata = { title: "Nouvelle facture fournisseur" };

export default async function NewSupplierInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("id, name, default_account").eq("site_id", site.id).order("name");
  return (
    <>
      <PageHeader
        title="Nouvelle facture fournisseur"
        subtitle="L'analyse lit le reçu et propose un compte de charge adapté au secteur du site ; vous validez avant comptabilisation."
        actions={<Link href="/espace/factures-fournisseurs" className="btn ghost"><Icon name="back" /> Factures</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <div style={{ maxWidth: "48rem" }}>
        <ReceiptAnalyzer accounts={accounts} sector={site.sector} suppliers={suppliers ?? []} today={today()} action={createSupplierInvoice} />
      </div>
    </>
  );
}
