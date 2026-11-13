import Link from "next/link";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public">
      <header>
        <Link href="/" style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 700 }}>
          <img src="/logo.svg" alt="" width={34} height={34} />
          KBS Comptable
        </Link>
        <nav>
          <Link href="/guide-comptables">Guide des comptables</Link>
          <Link href="/auth" className="btn gold sm">Se connecter</Link>
        </nav>
      </header>
      {children}
      <footer>
        © {new Date().getFullYear()} Kafaus Business Service SARL · KBS Comptable · Lubumbashi – Kolwezi
      </footer>
    </div>
  );
}
