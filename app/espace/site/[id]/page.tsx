import Link from "next/link";
import Flash from "@/components/Flash";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getOpenSiteById } from "@/lib/session";
import { money, dateFr, dateTimeFr, isDate, today, rel, SECTORS } from "@/lib/format";
import { setRateForSite } from "../../parite-actions";

export const metadata = { title: "Module site" };

export default async function SitePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getOpenSiteById(id);
  const profile = await getProfile();
  const vue = sp.vue === "ecritures" || sp.vue === "fournisseurs" ? sp.vue : "synthese";
  const from = isDate(sp.du) ? sp.du : `${today().slice(0, 4)}-01-01`;
  const to = isDate(sp.au) ? sp.au : today();
  const supabase = await createClient();
  const base = `/espace/site/${site.id}`;

  const btn = (v: string, label: string) => (
    <Link href={`${base}?vue=${v}`} className={`btn ${vue === v ? "" : "ghost"}`}>{label}</Link>
  );

  return (
    <>
      <PageHeader
        title={`${site.code} — ${site.name}`}
        subtitle={`Secteur : ${SECTORS[site.sector]}${site.city ? " · " + site.city : ""}`}
        actions={<>
          <Link href={`${base}/saisie`} className="btn">Saisir une facture</Link>
          <Link href={`${base}/saisie-clients`} className="btn ghost">Saisir une facture client</Link>
          <Link href={`${base}/paiements`} className="btn ghost">Paiements</Link>
          <Link href={`${base}/rapport`} className="btn ghost">Rapport mensuel</Link>
          {btn("synthese", "Synthèse")}
          {btn("ecritures", "Écritures")}
          {btn("fournisseurs", "Écritures fournisseurs")}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      {vue === "synthese" && <Synthese siteId={site.id} rate={Number(site.usd_cdf_rate)} from={from} to={to} admin={profile.role === "admin"} base={base} />}
      {vue !== "synthese" && <Entries siteId={site.id} onlyAC={vue === "fournisseurs"} />}
    </>
  );

  async function Synthese({ siteId, rate, from, to, admin, base }: { siteId: string; rate: number; from: string; to: string; admin: boolean; base: string }) {
    const [{ data: sum }, { data: rates }] = await Promise.all([
      supabase.rpc("report_site_summary", { p_sites: [siteId], p_from: from, p_to: to }),
      supabase.from("site_rates").select("rate, set_at, profiles(full_name, email)").eq("site_id", siteId).order("set_at", { ascending: false }).limit(30),
    ]);
    const s = sum?.[0];
    const tiles: [string, number][] = [
      ["Chiffre d'affaires", Number(s?.revenue ?? 0)], ["Dépenses", Number(s?.expenses ?? 0)],
      ["Dette clients (411)", Number(s?.receivables ?? 0)], ["Dette fournisseurs (401)", Number(s?.payables ?? 0)],
    ];
    return (
      <div className="stack">
        <form method="get" className="filters">
          <input type="hidden" name="vue" value="synthese" />
          <label>Du<input type="date" name="du" defaultValue={from} /></label>
          <label>Au<input type="date" name="au" defaultValue={to} /></label>
          <button className="btn ghost">Afficher</button>
          <span className="hint xs t-muted" style={{ alignSelf: "center" }}>Montants en USD, convertis au taux de chaque pièce.</span>
        </form>
        <div className="stats" style={{ marginBottom: 0 }}>
          {tiles.map(([l, v]) => <div className="stat" key={l}><div className="label">{l}</div><div className="value">{money(v)}</div></div>)}
        </div>
        <Panel title="Taux de change du site">
          <div className="panel-body">
            <p className="small t-muted" style={{ marginTop: 0 }}>Taux appliqué : <span className="num fw-500">{rate.toLocaleString("fr-FR")} FC / $</span> (propre au site)</p>
            {admin && (
              <form action={setRateForSite} className="filters">
                <input type="hidden" name="site_id" value={siteId} />
                <input type="hidden" name="back" value={base} />
                <input name="rate" type="number" step="0.0001" min="1" defaultValue={rate} className="mono" style={{ width: "10rem", minWidth: 0 }} />
                <button className="btn">Enregistrer le taux du site</button>
              </form>
            )}
          </div>
          {(rates ?? []).length > 0 && (
            <table style={{ maxWidth: "32rem" }}>
              <thead><tr><th>Date</th><th>Portée</th><th className="num">FC pour 1 USD</th></tr></thead>
              <tbody>
                {(rates ?? []).map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{dateTimeFr(r.set_at)}</td>
                    <td className="xs">Ce site · {rel(r.profiles)?.full_name || rel(r.profiles)?.email}</td>
                    <td className="num">{Number(r.rate).toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    );
  }

  async function Entries({ siteId, onlyAC }: { siteId: string; onlyAC: boolean }) {
    let qy = supabase.from("journal_entries")
      .select("id, entry_date, journal_code, reference, label, currency, entry_lines(id, account_code, label, debit, credit, debit_usd, credit_usd)")
      .eq("site_id", siteId).order("entry_date", { ascending: false }).order("number", { ascending: false }).limit(300);
    if (onlyAC) qy = qy.eq("journal_code", "AC");
    const [{ data: entries }, { data: purchases }] = await Promise.all([
      qy,
      onlyAC ? supabase.from("supplier_invoices").select("id, invoice_date, supplier_name, reference, expense_account, source_text, total, currency, status")
        .eq("site_id", siteId).order("invoice_date", { ascending: false }).limit(200) : Promise.resolve({ data: [] as never[] }),
    ]);
    const all = entries ?? [];
    const td = all.reduce((s, e) => s + (e.entry_lines as { debit_usd: number }[]).reduce((a, l) => a + Number(l.debit_usd), 0), 0);
    const tc = all.reduce((s, e) => s + (e.entry_lines as { credit_usd: number }[]).reduce((a, l) => a + Number(l.credit_usd), 0), 0);
    const ST: Record<string, string> = { brouillon: "brouillon", validee: "validée", partielle: "partielle", payee: "payée", rejetee: "rejetée" };
    return (
      <>
        {onlyAC && (
          <Panel title="Factures fournisseurs" actions={<Link href="/espace/factures-fournisseurs/nouvelle">Saisir / analyser une facture →</Link>}>
            {(purchases ?? []).length === 0 ? <Empty>Aucune facture fournisseur.</Empty> : (
              <table>
                <thead><tr><th>Date</th><th>Fournisseur</th><th>Réf.</th><th>Compte</th><th>Description</th><th className="num">TTC</th><th>Statut</th></tr></thead>
                <tbody>
                  {(purchases ?? []).map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{dateFr(p.invoice_date)}</td><td>{p.supplier_name || "—"}</td><td className="mono xs">{p.reference}</td>
                      <td className="mono">{p.expense_account}</td><td>{p.source_text}</td>
                      <td className="num">{money(p.total, p.currency)}</td><td className="xs">{ST[p.status] ?? p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        )}
        <Panel title={onlyAC ? "Écritures du journal d'achats (AC)" : "Toutes les écritures du site"}>
          {all.length === 0 ? <Empty>Aucune écriture.</Empty> : (
            <table>
              <thead><tr><th>Date</th><th>Jnl</th><th>Pièce</th><th>Compte</th><th>Libellé</th><th className="num">Débit</th><th className="num">Crédit</th></tr></thead>
              <tbody>
                {all.flatMap((e) => [...(e.entry_lines as { id: number; account_code: string; label: string; debit: number; credit: number }[])].sort((a, b) => a.id - b.id).map((l, i) => (
                  <tr key={l.id} className={i === 0 ? "group-start" : undefined}>
                    <td className="mono">{i === 0 ? dateFr(e.entry_date) : ""}</td>
                    <td className="mono">{i === 0 ? e.journal_code : ""}</td>
                    <td className="mono xs">{i === 0 ? e.reference : ""}</td>
                    <td className="mono">{l.account_code}</td>
                    <td>{i === 0 ? <span className="fw-500">{e.label}</span> : <span className="t-muted">{l.label}</span>}</td>
                    <td className="num">{Number(l.debit) ? money(l.debit, e.currency) : ""}</td>
                    <td className="num">{Number(l.credit) ? money(l.credit, e.currency) : ""}</td>
                  </tr>
                )))}
                <tr className="total"><td colSpan={5}>RAN — Report à nouveau (en USD)</td><td className="num">{money(td)}</td><td className="num">{money(tc)}</td></tr>
              </tbody>
            </table>
          )}
        </Panel>
      </>
    );
  }
}
