import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center-page">
      <div className="card">
        <img src="/kbs-logo.png" alt="" width={56} height={56} style={{ margin: "0 auto 1rem", borderRadius: 6 }} />
        <p className="eyebrow" style={{ color: "var(--muted-foreground)" }}>Erreur 404</p>
        <h1 style={{ marginTop: 12 }}>Page introuvable</h1>
        <p className="muted">Ce document n&apos;existe pas ou n&apos;appartient pas au site ouvert.</p>
        <Link href="/espace" className="btn" style={{ marginTop: 16 }}>Retour au tableau de bord</Link>
      </div>
    </div>
  );
}
