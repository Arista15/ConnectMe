import Flash from "@/components/Flash";
import Modal from "@/components/Modal";
import { PageHeader, Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { SECTORS, dateTimeFr, rel } from "@/lib/format";
import { createSite, updateSite, setSiteCode } from "../actions";

export const metadata = { title: "Sites & codes d'accès" };

export default async function AdminSitesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: sites }, { data: rates }] = await Promise.all([
    supabase.from("sites").select("id, code, name, city, sector, usd_cdf_rate, vat_rate").order("code"),
    supabase.from("site_rates").select("site_id, rate, set_at, profiles(full_name, email)").order("set_at", { ascending: false }).limit(60),
  ]);
  const sectorOpts = Object.entries(SECTORS).map(([k, v]) => <option key={k} value={k}>{v}</option>);

  return (
    <>
      <PageHeader
        title="Gestion des sites"
        subtitle="Chaque site est tenu séparément, avec son taux USD/CDF et son code d'accès."
        actions={
          <Modal label="Nouveau site" title="Nouveau site" icon="plus" size="lg">
            <form action={createSite}>
              <div className="form-grid">
                <div><label>Code (2 à 6 lettres/chiffres)</label><input name="code" pattern="[A-Za-z0-9]{2,6}" required placeholder="LUB" /></div>
                <div><label>Nom</label><input name="name" required placeholder="Lubumbashi" /></div>
                <div><label>Ville</label><input name="city" /></div>
                <div><label>Secteur</label><select name="sector">{sectorOpts}</select></div>
                <div><label>Taux initial (CDF pour 1 USD)</label><input name="rate" inputMode="decimal" required /></div>
                <div><label>TVA par défaut %</label><input name="vat_rate" defaultValue="16" /></div>
                <div className="span-2"><label>Code d&apos;accès (6 caractères min.)</label><input name="access_code" minLength={6} required autoComplete="off" /></div>
              </div>
              <p className="note">Le site est créé avec quatre comptes de trésorerie : caisse et banque, en USD et en CDF.</p>
              <div className="form-foot"><button className="btn">Créer le site</button></div>
            </form>
          </Modal>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="cols-2">
        {(sites ?? []).map((s) => {
          const hist = (rates ?? []).filter((r) => r.site_id === s.id);
          return (
            <Panel key={s.id} code={s.code} title={s.name}
              actions={<span className="xs t-muted">1 USD = <span className="num fw-500">{Number(s.usd_cdf_rate).toLocaleString("fr-FR")}</span> FC</span>}>
              <div className="panel-body">
                <form action={updateSite}>
                  <input type="hidden" name="site_id" value={s.id} />
                  <div className="form-grid">
                    <div><label>Nom</label><input name="name" defaultValue={s.name} /></div>
                    <div><label>Ville</label><input name="city" defaultValue={s.city} /></div>
                    <div><label>Secteur</label><select name="sector" defaultValue={s.sector}>{sectorOpts}</select></div>
                    <div><label>TVA %</label><input name="vat_rate" defaultValue={Number(s.vat_rate)} /></div>
                  </div>
                  <div style={{ marginTop: 10 }}><button className="btn sm">Enregistrer</button></div>
                </form>
                <form action={setSiteCode} className="filters" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  <input type="hidden" name="site_id" value={s.id} />
                  <label style={{ flex: 1 }}>Nouveau code d&apos;accès<input name="access_code" type="password" minLength={6} required autoComplete="new-password" placeholder="Min. 6 caractères" style={{ width: "100%" }} /></label>
                  <button className="btn ghost sm" style={{ height: "2.25rem" }}>Définir</button>
                </form>
                <p className="note" style={{ marginTop: 6 }}>Changer le code ferme immédiatement toutes les sessions ouvertes sur ce site.</p>
              </div>
              {hist.length > 0 && (
                <details className="inline" style={{ borderTop: "1px solid var(--border)" }}>
                  <summary className="panel-strip"><span className="fw-500">Historique des taux</span><span className="xs t-muted">{hist.length} ▾</span></summary>
                  <table>
                    <thead><tr><th>Date</th><th className="num">FC pour 1 USD</th><th>Par</th></tr></thead>
                    <tbody>
                      {hist.map((r, i) => (
                        <tr key={i}>
                          <td className="mono">{dateTimeFr(r.set_at)}</td><td className="num">{Number(r.rate).toLocaleString("fr-FR")}</td>
                          <td className="xs t-muted">{rel(r.profiles)?.full_name || rel(r.profiles)?.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
