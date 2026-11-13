import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import Flash from "@/components/Flash";
import { signIn } from "./actions";

export const metadata = { title: "Connexion" };

export default async function AuthPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return (
    <PublicShell>
      <div className="auth-box">
        <div className="card">
          <h1>Connexion</h1>
          <p className="muted">Accès réservé aux utilisateurs autorisés.</p>
          {!supabaseConfigured && <div className="alert info">Supabase n’est pas configuré. Créez <code>.env.local</code> depuis <code>.env.example</code> avec l’URL et la clé anon de votre projet, puis redémarrez le serveur.</div>}
          <Flash ok={sp.ok} err={sp.err} />
          {supabaseConfigured && <form action={signIn}>
            <input type="hidden" name="suite" value={sp.suite ?? ""} />
            <div className="field">
              <label htmlFor="login">Nom d’utilisateur ou e-mail</label>
              <input id="login" name="login" autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <button className="btn" style={{ width: "100%", justifyContent: "center" }}>Se connecter</button>
          </form>}
          <p className="small" style={{ marginTop: 12 }}>
            <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
