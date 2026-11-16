import Link from "next/link";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import InvoiceForm from "@/components/InvoiceForm";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { today } from "@/lib/format";
import { createQuote } from "../../parite-actions";

export const metadata = { title: "Nouveau devis" };

const DEFAULT_REVENUE: Record<string, string> = { services: "706", btp: "705", transport: "7061" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const { data: customers } = await supabase.from("customers").select("id, name").eq("site_id", site.id).order("name");
  const t = today();
  const valid = new Date(new Date(t).getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Nouveau devis"
        subtitle={<>Site {site.code} · numérotation <span className="num">DV-{site.code}-AAAA-NNNN</span> · aucune écriture tant qu&apos;il n&apos;est pas converti en facture</>}
        actions={<Link href="/espace/factures-clients?onglet=devis" className="btn ghost"><Icon name="back" /> Devis</Link>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <InvoiceForm
        accounts={accounts} sector={site.sector} customers={customers ?? []} optionalCustomer
        defaultAccount={DEFAULT_REVENUE[site.sector]} vatRate={Number(site.vat_rate)} rate={Number(site.usd_cdf_rate)}
        today={t} dueDefault={valid} action={createQuote}
        dueLabel="Valable jusqu'au" submitLabel="Enregistrer le brouillon" footnote="Le devis n'est pas comptabilisé. Convertissez-le en facture une fois accepté."
      />
    </>
  );
}
