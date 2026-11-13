import PublicShell from "@/components/PublicShell";
import Flash from "@/components/Flash";
import { setPassword } from "../auth/actions";

export const metadata = { title: "Choisir mon mot de passe" };

export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <PublicShell>
      <div className="auth-box">
        <div className="card">
          <h1>Choisir mon mot de passe</h1>
          <p className="muted">Ce mot de passe est personnel. Il ne remplace pas le code d'accès des sites.</p>
          <Flash ok={sp.ok} err={sp.err} />
          <form action={setPassword}>
            <div className="field">
              <label htmlFor="password">Nouveau mot de passe (10 caractères minimum)</label>
              <input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirmer</label>
              <input id="confirm" name="confirm" type="password" minLength={10} autoComplete="new-password" required />
            </div>
            <button className="btn" style={{ width: "100%", justifyContent: "center" }}>Enregistrer</button>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}
