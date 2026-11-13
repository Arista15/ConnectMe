import Link from "next/link";
import { getProfile, getOpenSites, getActiveSite } from "@/lib/session";
import { SECTORS } from "@/lib/format";
import { switchSite } from "../connexion-site/actions";
import { signOut } from "../auth/actions";
import { updateRate } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const site = await getActiveSite();
  const open = await getOpenSites();
  const admin = profile.role === "admin";

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/espace" className="brand">
          <img src="/logo.svg" alt="" width={32} height={32} /> KBS Comptable
        </Link>
        <nav>
          <Link href="/espace">Tableau de bord</Link>
          <div className="section">Saisie</div>
          <Link href="/espace/journal">Journal</Link>
          <Link href="/espace/factures-clients">Factures clients</Link>
          <Link href="/espace/factures-fournisseurs">Factures fournisseurs</Link>
          <Link href="/espace/depenses">Dépenses & recettes</Link>
          <Link href="/espace/tresorerie">Caisse & banque</Link>
          <Link href="/espace/tiers">Clients & fournisseurs</Link>
          <div className="section">États</div>
          <Link href="/espace/grand-livre">Grand livre</Link>
          <Link href="/espace/etats">États financiers</Link>
          <Link href="/espace/sites">Synthèse par site</Link>
          <Link href={`/rapport`}>Rapport mensuel (PDF)</Link>
          {admin && (
            <>
              <div className="section">Administration</div>
              <Link href="/espace/admin/comptables">Comptables</Link>
              <Link href="/espace/admin/sites">Sites & codes</Link>
              <Link href="/espace/admin/audit">Historique d'audit</Link>
            </>
          )}
          <div className="section">Aide</div>
          <Link href="/guide-comptables">Guide des comptables</Link>
        </nav>
      </aside>
      <div>
        <div className="topbar">
          <div className="row" style={{ alignItems: "center", flex: "1 1 auto" }}>
            <span className="site-pill shrink">{site.code} · {site.name}</span>
            <span className="muted small shrink">{SECTORS[site.sector]}</span>
            {open.length > 1 && (
              <form action={switchSite} className="shrink" style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="back" value="/espace" />
                <select name="site_id" defaultValue={site.id} style={{ width: "auto" }} aria-label="Changer de site">
                  {open.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
                </select>
                <button className="btn ghost sm">Changer</button>
              </form>
            )}
            <Link href="/connexion-site" className="small shrink">Ouvrir un autre site</Link>
          </div>
          <form action={updateRate} className="shrink" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label htmlFor="rate" style={{ margin: 0 }}>1 USD =</label>
            <input id="rate" name="rate" type="number" step="0.0001" min="1" defaultValue={site.usd_cdf_rate} style={{ width: 110 }} />
            <span className="small">CDF</span>
            <button className="btn ghost sm">Mettre à jour</button>
          </form>
          <div className="shrink" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="small">{profile.full_name || profile.email}{admin && " · admin"}</span>
            <form action={signOut}><button className="btn ghost sm">Déconnexion</button></form>
          </div>
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
