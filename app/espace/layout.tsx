import Link from "next/link";
import { getProfile, getOpenSites, getActiveSite } from "@/lib/session";
import { SECTORS } from "@/lib/format";
import { switchSite } from "../connexion-site/actions";
import { signOut } from "../auth/actions";
import { updateRate } from "./actions";
import NavLink from "@/components/NavLink";
import Icon from "@/components/Icon";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const site = await getActiveSite();
  const open = await getOpenSites();
  const admin = profile.role === "admin";
  const who = profile.full_name || profile.email;

  return (
    <div className="shell">
      {/* Case à cocher pilotant le tiroir de navigation sur mobile (aucun JS requis) */}
      <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-hidden="true" tabIndex={-1} />

      <aside className="sidebar no-print" aria-label="Navigation principale">
        <Link href="/espace" className="brand">
          <img src="/kbs-logo.png" alt="Logo KBS" />
          <div>
            <div className="brand-name">KBS Comptable</div>
            <div className="brand-tag">SYSCOHADA</div>
          </div>
        </Link>
        <nav>
          <NavLink href="/espace" icon="dashboard" exact>Tableau de bord</NavLink>
          <div className="section">Saisie</div>
          <NavLink href="/espace/journal" icon="book">Journal</NavLink>
          <NavLink href="/espace/factures-clients" icon="file">Factures clients</NavLink>
          <NavLink href="/espace/factures-fournisseurs" icon="cart">Factures fournisseurs</NavLink>
          <NavLink href="/espace/depenses" icon="receipt">Dépenses &amp; recettes</NavLink>
          <NavLink href="/espace/tresorerie" icon="wallet">Caisse &amp; banque</NavLink>
          <NavLink href="/espace/tiers" icon="users">Clients &amp; fournisseurs</NavLink>
          <div className="section">États</div>
          <NavLink href="/espace/grand-livre" icon="library">Grand livre</NavLink>
          <NavLink href="/espace/etats" icon="scale">États financiers</NavLink>
          <NavLink href="/espace/sites" icon="building">Synthèse par site</NavLink>
          <NavLink href="/rapport" icon="printer">Rapport mensuel (PDF)</NavLink>
          {admin && (
            <>
              <div className="section">Administration</div>
              <NavLink href="/espace/admin/comptables" icon="key">Comptables</NavLink>
              <NavLink href="/espace/admin/sites" icon="settings">Sites &amp; codes</NavLink>
              <NavLink href="/espace/admin/audit" icon="history">Historique d&apos;audit</NavLink>
            </>
          )}
          <div className="section">Aide</div>
          <NavLink href="/guide-comptables" icon="cap">Guide des comptables</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="who">{who}</div>
          <div className="role">{admin ? "Administrateur" : "Comptable"}</div>
          <form action={signOut}>
            <button type="submit"><Icon name="logout" /> Se déconnecter</button>
          </form>
        </div>
      </aside>
      <label htmlFor="nav-toggle" className="nav-overlay" aria-hidden="true" />

      <div className="main">
        <header className="topbar no-print">
          <div className="topbar-mobile">
            <label htmlFor="nav-toggle" className="icon-btn" aria-label="Ouvrir le menu">
              <Icon name="menu" />
            </label>
            <Link href="/espace" className="brand" style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}>
              <img src="/kbs-logo.png" alt="" />
              <span className="brand-name">KBS Comptable</span>
            </Link>
            <span className="spacer" />
            <form action={signOut}>
              <button className="icon-btn" aria-label="Se déconnecter"><Icon name="logout" /></button>
            </form>
          </div>

          <div className="topbar-site">
            <span className="site-pill">{site.code} · {site.name}</span>
            <span className="muted small">{SECTORS[site.sector]}</span>
            {open.length > 1 && (
              <form action={switchSite}>
                <input type="hidden" name="back" value="/espace" />
                <select name="site_id" defaultValue={site.id} aria-label="Changer de site">
                  {open.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
                <button className="btn ghost">Changer</button>
              </form>
            )}
            <Link href="/connexion-site" className="small">Ouvrir un autre site</Link>
          </div>

          <div className="topbar-right">
            <form action={updateRate} className="rate-form" title="Taux de change du site">
              <span>1 $ =</span>
              <input id="rate" name="rate" type="number" step="0.0001" min="1" defaultValue={site.usd_cdf_rate} aria-label="Taux CDF pour 1 USD" />
              <span>FC</span>
              <button>Mettre à jour</button>
            </form>
            <div className="user-chip">
              <span className="avatar">{who.slice(0, 1).toUpperCase()}</span>
              <span>{who}{admin && " · admin"}</span>
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
