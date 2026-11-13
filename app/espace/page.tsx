import Link from "next/link";
import Flash from "@/components/Flash";
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord · {site.name}</h1>
          <p className="muted">Mois en cours ({dateFr(from)} – {dateFr(to)}), montants en USD.</p>
        </div>
        <div className="row shrink">
          <Link href="/espace/factures-clients/nouvelle" className="btn shrink">Nouvelle facture</Link>
          <Link href="/espace/factures-fournisseurs/nouvelle" className="btn gold shrink">Analyser un reçu</Link>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-4">
        <div className="card kpi"><div className="label">Chiffre d'affaires du mois</div><div className="value">{money(s?.revenue)}</div></div>
        <div className="card kpi"><div className="label">Charges du mois</div><div className="value">{money(s?.expenses)}</div></div>
        <div className="card kpi"><div className="label">Créances clients</div><div className="value">{money(s?.receivables)}</div></div>
        <div className="card kpi"><div className="label">Dettes fournisseurs</div><div className="value">{money(s?.payables)}</div></div>
      </div>

      {(drafts ?? 0) > 0 && (
        <div className="alert info">
          {drafts} reçu(s) fournisseur en attente de validation.{" "}
          <Link href="/espace/factures-fournisseurs?statut=brouillon">Les valider</Link>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Factures en retard ou à échéance sous 7 jours</h3>
          {(due ?? []).length === 0 ? <p className="muted">Rien à relancer.</p> : (
            <table>
              <thead><tr><th>Facture</th><th>Client</th><th>Échéance</th><th className="num">Reste dû</th></tr></thead>
              <tbody>
                {(due ?? []).map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/espace/factures-clients/${i.id}`}>{i.number}</Link></td>
                    <td>{rel(i.customers)?.name}</td>
                    <td>
                      {dateFr(i.due_date)}{" "}
                      {i.due_date < t ? <span className="badge err">En retard</span> : <span className="badge warn">Bientôt</span>}
                    </td>
                    <td className="num">{money(Number(i.total) - Number(i.amount_paid), i.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dernières écritures</h3>
          <table>
            <thead><tr><th>N°</th><th>Date</th><th>Jnl</th><th>Libellé</th><th>Par</th></tr></thead>
            <tbody>
              {(recent ?? []).map((e) => (
                <tr key={e.id}>
                  <td>{e.number}</td><td>{dateFr(e.entry_date)}</td><td>{e.journal_code}</td>
                  <td>{e.label}</td>
                  <td className="small muted">{rel(e.profiles)?.full_name || rel(e.profiles)?.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open.length > 1 && (
        <p className="muted small">
          Vous avez {open.length} sites ouverts. <Link href="/espace/sites">Voir la synthèse consolidée</Link>.
        </p>
      )}
    </>
  );
}
