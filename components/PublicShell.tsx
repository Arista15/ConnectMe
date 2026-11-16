import Link from "next/link";

export default function PublicShell({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="public">
      <header className="site-header dark">
        <div className="wrap">
          <Link href="/" className="brand">
            <img src="/kbs-logo.png" alt="Logo KBS" />
            <span className="brand-name">KBS Comptable</span>
          </Link>
          <nav className="site-nav">
            <Link href="/guide-comptables">Guide des comptables</Link>
            <Link href="/connexion-site">Connexion à un site</Link>
            <Link href="/auth" className="btn secondary sm">Se connecter</Link>
          </nav>
        </div>
      </header>
      {dark ? children : <div className="page-body">{children}</div>}
      <footer className="site-footer dark">
        <div className="wrap">
          <div className="brand">
            <img src="/kbs-logo.png" alt="Logo KBS" />
            <div>
              <div className="serif">KBS Comptable</div>
              <div className="small" style={{ opacity: 0.7 }}>Kafaus Business Service SARL · Lubumbashi – Kolwezi</div>
            </div>
          </div>
          <nav>
            <Link href="/">Accueil</Link>
            <Link href="/auth">Connexion</Link>
            <Link href="/connexion-site">Connexion à un site</Link>
            <Link href="/guide-comptables">Guide comptable</Link>
            <Link href="/mot-de-passe-oublie">Mot de passe oublié</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
