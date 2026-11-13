import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-box card" style={{ textAlign: "center" }}>
      <h1>Page introuvable</h1>
      <p className="muted">Ce document n'existe pas ou n'appartient pas au site ouvert.</p>
      <Link href="/espace" className="btn">Retour au tableau de bord</Link>
    </div>
  );
}
