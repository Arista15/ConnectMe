import Flash from "@/components/Flash";
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
      <div className="page-head"><div><h1>Sites & codes d'accès</h1><p className="muted">Chaque site est tenu séparément, avec son taux USD/CDF et son code d'accès.</p></div></div>
      <Flash ok={sp.ok} err={sp.err} />

      <form action={createSite} className="card">
        <h3 style={{ marginTop: 0 }}>Nouveau site</h3>
        <div className="row">
          <div><label>Code (2 à 6 lettres/chiffres)</label><input name="code" pattern="[A-Za-z0-9]{2,6}" required placeholder="LUB" /></div>
          <div><label>Nom</label><input name="name" required placeholder="Lubumbashi" /></div>
          <div><label>Ville</label><input name="city" /></div>
          <div><label>Secteur</label><select name="sector">{sectorOpts}</select></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div><label>Taux initial (CDF pour 1 USD)</label><input name="rate" inputMode="decimal" required /></div>
          <div><label>TVA par défaut %</label><input name="vat_rate" defaultValue="16" /></div>
          <div><label>Code d'accès (6 caractères min.)</label><input name="access_code" minLength={6} required autoComplete="off" /></div>
        </div>
        <button className="btn" style={{ marginTop: 10 }}>Créer le site</button>
        <p className="small muted">Le site est créé avec quatre comptes de trésorerie : caisse et banque, en USD et en CDF.</p>
      </form>

      {(sites ?? []).map((s) => (
        <div className="card" key={s.id}>
          <h3 style={{ marginTop: 0 }}>{s.code} – {s.name} <span className="muted small">· 1 USD = {Number(s.usd_cdf_rate)} CDF</span></h3>
          <div className="grid grid-2">
            <form action={updateSite}>
              <input type="hidden" name="site_id" value={s.id} />
              <div className="row">
                <div><label>Nom</label><input name="name" defaultValue={s.name} /></div>
                <div><label>Ville</label><input name="city" defaultValue={s.city} /></div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <div><label>Secteur</label><select name="sector" defaultValue={s.sector}>{sectorOpts}</select></div>
                <div><label>TVA %</label><input name="vat_rate" defaultValue={Number(s.vat_rate)} /></div>
              </div>
              <button className="btn ghost sm" style={{ marginTop: 8 }}>Enregistrer</button>
            </form>
            <form action={setSiteCode}>
              <input type="hidden" name="site_id" value={s.id} />
              <label>Nouveau code d'accès</label>
              <input name="access_code" minLength={6} required autoComplete="off" />
              <button className="btn danger sm" style={{ marginTop: 8 }}>Changer le code</button>
              <p className="small muted">Ferme immédiatement toutes les sessions ouvertes sur ce site.</p>
            </form>
          </div>
          <details style={{ marginTop: 8 }}>
            <summary className="linkbtn small">Historique des taux</summary>
            <table>
              <tbody>
                {(rates ?? []).filter((r) => r.site_id === s.id).map((r, i) => (
                  <tr key={i}>
                    <td>{dateTimeFr(r.set_at)}</td><td className="num">{Number(r.rate)}</td>
                    <td className="small muted">{rel(r.profiles)?.full_name || rel(r.profiles)?.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ))}
    </>
  );
}
