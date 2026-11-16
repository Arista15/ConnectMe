import Link from "next/link";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getOpenSites } from "@/lib/session";
import { money, dateFr, monthBounds, today, rel } from "@/lib/format";

export const metadata = { title: "Tableau de bord" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const open = await getOpenSites();
  const supabase = await createClient();
  const { from, to } = monthBounds();
  const in7 = new Date(Date.now() + 2 * 3600_000 + 7 * 86400_000).toISOString().slice(0, 10);

  const [{ data: summary }, { data: due }, { count: drafts }, { data: recent }] = await Promise.all([
    supabase.rpc("report_site_summary", { p_sites: [site.id], p_from: from, p_to: to }),
    supabase.from("customer_invoices")
      .select("id, number, due_date, total, amount_paid, currency, status, customers(name)")
      .eq("site_id", site.id).in("status", ["emise", "partielle"]).lte("due_date", in7)
      .order("due_date").limit(10),
    supabase.from("supplier_invoices").select("id", { count: "exact", head: true })
      .eq("site_id", site.id).eq("status", "brouillon"),
    supabase.from("journal_entries")
      .select("id, number, entry_date, journal_code, label, reference, currency, profiles(full_name, email)")
      .eq("site_id", site.id).order("created_at", { ascending: false }).limit(8),
  ]);
  const s = summary?.[0];
  const t = today();
  const result = Number(s?.revenue ?? 0) - Number(s?.expenses ?? 0);
  const kpis: [string, number | undefined, boolean?][] = [
    ["Chiffre d'affaires", s?.revenue],
    ["Charges", s?.expenses],
    ["Résultat", result, result < 0],
    ["Trésorerie", s?.cash],
    ["Créances clients", s?.receivables],
    ["Dettes fournisseurs", s?.payables],
  ];

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={<>Mois en cours · {site.code} — {site.name} · du {dateFr(from)} au {dateFr(to)} · USD</>}
        actions={<>
          <Link href="/espace/factures-fournisseurs/nouvelle" className="btn ghost"><Icon name="sparkles" /> Analyser un reçu</Link>
          <Link href="/espace/factures-clients/nouvelle" className="btn"><Icon name="plus" /> Nouvelle facture</Link>
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-3">
        {kpis.map(([label, v, neg]) => (
          <div className="card kpi" key={label}>
            <div className="label">{label}</div>
            <div className={`value${neg ? " t-danger" : ""}`}>{money(v)}</div>
          </div>
        ))}
      </div>

      {(drafts ?? 0) > 0 && (
        <div className="alert info" style={{ marginTop: "1.5rem" }}>
          {drafts} reçu(s) fournisseur en attente de validation.{" "}
          <Link href="/espace/factures-fournisseurs?statut=brouillon">Les valider →</Link>
        </div>
      )}

      <div className="cols-2" style={{ marginTop: "1.5rem" }}>
        <Panel title="Factures en retard ou dues sous 7 jours" actions={<Link href="/espace/factures-clients?statut=ouvertes">Toutes →</Link>}>
          {(due ?? []).length === 0 ? <Empty>Rien à relancer.</Empty> : (
            <table>
              <thead><tr><th>Facture</th><th>Client</th><th>Échéance</th><th className="num">Reste dû</th></tr></thead>
              <tbody>
                {(due ?? []).map((i) => (
                  <tr key={i.id}>
                    <td className="mono"><Link href={`/espace/factures-clients/${i.id}`}>{i.number}</Link></td>
                    <td>{rel(i.customers)?.name}</td>
                    <td className="nowrap">
                      <span className="num">{dateFr(i.due_date)}</span>{" "}
                      {i.due_date < t ? <span className="badge err">En retard</span> : <span className="badge warn">Bientôt</span>}
                    </td>
                    <td className="num fw-600">{money(Number(i.total) - Number(i.amount_paid), i.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Dernières écritures" actions={<Link href="/espace/journal">Journal →</Link>}>
          {(recent ?? []).length === 0 ? <Empty>Aucune écriture.</Empty> : (
            <table>
              <thead><tr><th>N°</th><th>Date</th><th>Jnl</th><th>Libellé</th><th>Par</th></tr></thead>
              <tbody>
                {(recent ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.number}</td><td className="mono">{dateFr(e.entry_date)}</td><td className="mono">{e.journal_code}</td>
                    <td>{e.label}</td>
                    <td className="xs t-muted">{rel(e.profiles)?.full_name || rel(e.profiles)?.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {open.length > 1 && (
        <p className="note">
          Vous avez {open.length} sites ouverts. <Link href="/espace/sites">Voir la synthèse consolidée →</Link>
        </p>
      )}
    </>
  );
}
