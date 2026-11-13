import PublicShell from "@/components/PublicShell";
import Flash from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getOpenSites } from "@/lib/session";
import { SECTORS, dateTimeFr } from "@/lib/format";
import { openSite, closeSite, switchSite } from "./actions";
import { signOut } from "../auth/actions";
import { createSite } from "../espace/admin/actions";

export const metadata = { title: "Ouvrir un site" };

export default async function SiteLoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("id, code, name, city, sector").order("code");
  const open = await getOpenSites();
  const openIds = new Set(open.map((s) => s.id));
  const { data: sessions } = await supabase
    .from("site_sessions").select("site_id, expires_at")
    .eq("user_id", profile.id).is("closed_at", null).gt("expires_at", new Date().toISOString());
  const expiry = new Map((sessions ?? []).map((s) => [s.site_id, s.expires_at as string]));

  return (
    <PublicShell>
      <div className="container" style={{ maxWidth: 760, padding: "2rem 1.5rem" }}>
        <div className="page-head">
          <div>
            <h1>Bonjour {profile.full_name || profile.email}</h1>
            <p className="muted">
              {profile.role === "admin"
                ? "En tant qu'administrateur, vous accédez à tous les sites sans code."
                : "Saisissez le code d'accès communiqué par l'administrateur pour ouvrir un site (valable 12 heures)."}
            </p>
          </div>
          <form action={signOut}><button className="btn ghost sm">Se déconnecter</button></form>
        </div>
        <Flash ok={sp.ok} err={sp.err} />

        {(sites ?? []).length === 0 && profile.role !== "admin" && (
          <div className="alert info">Aucun site ne vous est attribué pour le moment. Contactez l'administrateur.</div>
        )}
        {(sites ?? []).length === 0 && profile.role === "admin" && (
          <form action={createSite} className="card">
            <h3 style={{ marginTop: 0 }}>Créer le premier site</h3>
            <div className="row">
              <div><label>Code</label><input name="code" pattern="[A-Za-z0-9]{2,6}" required placeholder="LUB" /></div>
              <div><label>Nom</label><input name="name" required placeholder="Lubumbashi" /></div>
              <div><label>Ville</label><input name="city" /></div>
              <div>
                <label>Secteur</label>
                <select name="sector">{Object.entries(SECTORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <div><label>Taux (CDF pour 1 USD)</label><input name="rate" inputMode="decimal" required /></div>
              <div><label>TVA %</label><input name="vat_rate" defaultValue="16" /></div>
              <div><label>Code d'accès (6 min.)</label><input name="access_code" minLength={6} required autoComplete="off" /></div>
            </div>
            <button className="btn" style={{ marginTop: 10 }}>Créer</button>
          </form>
        )}

        {(sites ?? []).map((s) => (
          <div className="card" key={s.id}>
            <div className="page-head" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>{s.name} <span className="badge">{s.code}</span></h3>
                <p className="muted small">{s.city} · {SECTORS[s.sector]}</p>
              </div>
              {openIds.has(s.id) && (
                <span className="badge ok">
                  Ouvert{expiry.get(s.id) ? ` jusqu'au ${dateTimeFr(expiry.get(s.id))}` : ""}
                </span>
              )}
            </div>
            {openIds.has(s.id) ? (
              <div className="row">
                <form action={switchSite} className="shrink">
                  <input type="hidden" name="site_id" value={s.id} />
                  <input type="hidden" name="back" value="/espace" />
                  <button className="btn">Travailler sur ce site</button>
                </form>
                {profile.role !== "admin" && (
                  <form action={closeSite} className="shrink">
                    <input type="hidden" name="site_id" value={s.id} />
                    <button className="btn ghost">Fermer le site</button>
                  </form>
                )}
              </div>
            ) : (
              <form action={openSite} className="row">
                <input type="hidden" name="site_id" value={s.id} />
                <div>
                  <label htmlFor={`code-${s.id}`}>Code d'accès du site</label>
                  <input id={`code-${s.id}`} name="code" type="password" autoComplete="off" required />
                </div>
                <button className="btn shrink">Ouvrir</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </PublicShell>
  );
}
