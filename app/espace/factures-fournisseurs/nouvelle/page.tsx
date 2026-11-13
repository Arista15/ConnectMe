import Link from "next/link";
import Flash from "@/components/Flash";
import ReceiptAnalyzer from "@/components/ReceiptAnalyzer";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { today } from "@/lib/format";
import { createSupplierInvoice } from "../../actions";

export const metadata = { title: "Nouveau reçu fournisseur" };

export default async function NewSupplierInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("id, name, default_account").eq("site_id", site.id).order("name");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Nouveau reçu fournisseur</h1>
          <p className="muted">L'analyse lit le reçu et propose un compte de charge adapté au secteur du site ; vous validez avant comptabilisation.</p>
        </div>
        <Link href="/espace/factures-fournisseurs" className="btn ghost">Retour</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <ReceiptAnalyzer accounts={accounts} sector={site.sector} suppliers={suppliers ?? []} today={today()} action={createSupplierInvoice} />
    </>
  );
}
