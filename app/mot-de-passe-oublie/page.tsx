import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import Flash from "@/components/Flash";
import { requestReset } from "../auth/actions";

export const metadata = { title: "Mot de passe oublié" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <PublicShell>
      <div className="auth-box">
        <div className="card">
          <h1>Mot de passe oublié</h1>
          <p className="muted">Saisissez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.</p>
          <Flash ok={sp.ok} err={sp.err} />
          <form action={requestReset}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" required />
            </div>
            <button className="btn" style={{ width: "100%", justifyContent: "center" }}>Envoyer le lien</button>
          </form>
          <p className="small" style={{ marginTop: 12 }}><Link href="/auth">Retour à la connexion</Link></p>
        </div>
      </div>
    </PublicShell>
  );
}
