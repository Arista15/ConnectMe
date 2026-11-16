import Link from "next/link";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getOpenSites } from "@/lib/session";
import { SECTORS, dateTimeFr } from "@/lib/format";
import { openSite, closeSite, switchSite } from "./actions";
import { signOut } from "../auth/actions";
import { createSite } from "../espace/admin/actions";

export const metadata = { title: "Connexion à un site" };

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
  const admin = profile.role === "admin";

  return (
    <div className="center-wrap">
      <div>
        <img src="/kbs-logo.png" alt="Logo KBS" className="center-logo" />
        <h1 className="t-center" style={{ fontSize: "1.5rem" }}>Connexion à un site</h1>
        <p className="t-center small t-muted" style={{ marginBottom: "1.5rem" }}>
          Bonjour {profile.full_name || profile.email}.{" "}
          {admin
            ? "En tant qu'administrateur, vous accédez à tous les sites sans code."
            : "Saisissez le code d'accès de chaque site. L'accès reste ouvert 12 heures ou jusqu'à la déconnexion."}
        </p>
        <Flash ok={sp.ok} err={sp.err} />

        {(sites ?? []).length === 0 && !admin && (
          <div className="alert info">Aucun site ne vous est attribué pour le moment. Demandez à un administrateur de vous donner accès.</div>
        )}
        {(sites ?? []).length === 0 && admin && (
          <form action={createSite} className="card">
            <h3>Créer le premier site</h3>
            <div className="form-grid">
              <div><label>Code</label><input name="code" pattern="[A-Za-z0-9]{2,6}" required placeholder="LUB" /></div>
              <div><label>Nom</label><input name="name" required placeholder="Lubumbashi" /></div>
              <div><label>Ville</label><input name="city" /></div>
              <div><label>Secteur</label><select name="sector">{Object.entries(SECTORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label>Taux (CDF pour 1 USD)</label><input name="rate" inputMode="decimal" required /></div>
              <div><label>TVA %</label><input name="vat_rate" defaultValue="16" /></div>
              <div className="span-2"><label>Code d&apos;accès (6 min.)</label><input name="access_code" minLength={6} required autoComplete="off" /></div>
            </div>
            <div className="form-foot"><button className="btn">Créer le site</button></div>
          </form>
        )}

        {(sites ?? []).map((s) => {
          const isOpen = openIds.has(s.id);
          return (
            <div className="site-card" key={s.id}>
              <span className={`ico${isOpen ? " open" : ""}`}><Icon name={isOpen ? "unlock" : "lock"} /></span>
              <div className="info">
                <div className="fw-500"><span className="num">{s.code}</span> — {s.name}</div>
                <div className="xs t-muted">
                  {s.city} · {SECTORS[s.sector]}
                  {isOpen && <> · ouvert{expiry.get(s.id) ? ` jusqu'au ${dateTimeFr(expiry.get(s.id))}` : ""}</>}
                </div>
              </div>
              {isOpen ? (
                <>
                  {!admin && (
                    <form action={closeSite}>
                      <input type="hidden" name="site_id" value={s.id} />
                      <button className="btn plain sm">Fermer</button>
                    </form>
                  )}
                  <form action={switchSite}>
                    <input type="hidden" name="site_id" value={s.id} />
                    <input type="hidden" name="back" value="/espace" />
                    <button className="btn sm">Travailler sur ce site</button>
                  </form>
                </>
              ) : (
                <form action={openSite}>
                  <input type="hidden" name="site_id" value={s.id} />
                  <input name="code" type="password" autoComplete="off" required placeholder="Code d'accès" aria-label={`Code d'accès ${s.code}`} />
                  <button className="btn">Ouvrir</button>
                </form>
              )}
            </div>
          );
        })}

        <div className="auth-links" style={{ marginTop: "1.5rem" }}>
          <form action={signOut}><button className="linkbtn" style={{ color: "var(--muted-foreground)" }}>Se déconnecter</button></form>
          <Link href="/guide-comptables">Nouveau comptable ?</Link>
        </div>
      </div>
    </div>
  );
}
