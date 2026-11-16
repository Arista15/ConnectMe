import Link from "next/link";

/** Écrans de connexion : panneau bleu nuit à gauche, formulaire à droite (empilé sur mobile). */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside dark">
        <Link href="/" className="brand">
          <img src="/kbs-logo.png" alt="Logo KBS" />
          <span className="brand-name">KBS Comptable</span>
        </Link>
        <blockquote>« Toute écriture doit être justifiée par une pièce. »</blockquote>
        <span className="num small" style={{ opacity: 0.6 }}>SYSCOHADA révisé · USD / CDF</span>
      </aside>
      <main className="auth-main">
        <div className="auth-box">
          <Link href="/" className="auth-mobile-brand">
            <img src="/kbs-logo.png" alt="Logo KBS" />
            <span className="brand-name">KBS Comptable</span>
          </Link>
          {children}
          <div className="auth-links">
            <Link href="/">Découvrir KBS Comptable</Link>
            <Link href="/connexion-site">Connexion à un site</Link>
            <Link href="/guide-comptables">Guide du comptable</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
