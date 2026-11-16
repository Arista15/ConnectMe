import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import Flash from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { completeFirstLogin } from "@/app/auth/actions";

export const metadata = { title: "Configuration du compte directeur" };

export default async function FirstLoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const { data: profile } = await supabase.from("profiles").select("must_change_credentials").eq("id", user.id).maybeSingle();
  if (!profile?.must_change_credentials) redirect("/espace");
  const sp = await searchParams;
  return (
    <AuthShell>
      <div className="auth-box"><div className="card">
        <h1>Configurer le compte directeur</h1>
        <p className="muted">Avant d’ouvrir votre espace, choisissez votre nom d’utilisateur et un nouveau mot de passe.</p>
        <Flash ok={sp.ok} err={sp.err} />
        <form action={completeFirstLogin}>
          <div className="field"><label htmlFor="full_name">Nom complet</label><input id="full_name" name="full_name" autoComplete="name" required /></div>
          <div className="field"><label htmlFor="username">Nouveau nom d’utilisateur</label><input id="username" name="username" autoComplete="username" minLength={3} maxLength={40} required /></div>
          <div className="field"><label htmlFor="password">Nouveau mot de passe (10 caractères minimum)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></div>
          <div className="field"><label htmlFor="confirm">Confirmer le mot de passe</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required /></div>
          <button className="btn block">Enregistrer et continuer</button>
        </form>
      </div></div>
    </AuthShell>
  );
}
