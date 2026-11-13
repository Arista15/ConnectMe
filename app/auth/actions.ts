"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_COOKIE } from "@/lib/session";

const q = (s: string) => encodeURIComponent(s);

function safeNext(next: FormDataEntryValue | null) {
  const n = String(next ?? "");
  return n.startsWith("/") && !n.startsWith("//") ? n : "/connexion-site";
}

export async function signIn(formData: FormData) {
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect("/?setup=supabase");
  }
  if (!login.includes("@") && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(`/auth?err=${q("Configuration incomplète : ajoutez SUPABASE_SERVICE_ROLE_KEY dans .env.local puis redémarrez l’application.")}`);
  }
  let email = login.toLowerCase();

  // Bootstrap the director only while the application has no profiles and no Auth users.
  if (login.toLowerCase() === "admin") {
    const admin = createAdminClient();
    const [{ data: profiles, error: profilesError }, { data: authUsers, error: usersError }] = await Promise.all([
      admin.from("profiles").select("id").limit(1),
      admin.auth.admin.listUsers({ page: 1, perPage: 1 }),
    ]);
    if (profilesError) {
      redirect(`/auth?err=${q("La base Supabase n’est pas prête. Exécutez les migrations du dossier supabase/migrations, notamment 0005_first_admin_login.sql.")}`);
    }
    if (usersError || !authUsers) {
      redirect(`/auth?err=${q("La clé SUPABASE_SERVICE_ROLE_KEY est invalide ou ne permet pas l’accès administrateur à Supabase.")}`);
    }
    if (!profilesError && !usersError && profiles?.length === 0 && authUsers.users.length === 0) {
      const { error: createError } = await admin.auth.admin.createUser({
        email: "premier-admin@kbs-comptable.invalid",
        password: "admin1234*",
        email_confirm: true,
        user_metadata: { full_name: "Admin", username: "Admin" },
      });
      if (createError && !createError.message.toLowerCase().includes("already been registered")) {
        redirect(`/auth?err=${q(`Création du compte directeur impossible : ${createError.message}`)}`);
      }
    }
    const { data: initialProfile, error: initialProfileError } = await admin.from("profiles").select("email").eq("username", login).maybeSingle();
    if (initialProfileError) {
      redirect(`/auth?err=${q("La migration 0005_first_admin_login.sql n’est pas appliquée dans Supabase. Exécutez-la dans le SQL Editor puis réessayez.")}`);
    }
    if (initialProfile?.email) email = initialProfile.email;
    else if (authUsers.users.length > 0) {
      redirect(`/auth?err=${q("Le compte initial n’a pas été créé : Auth contient déjà un utilisateur, ou le profil directeur manque. Vérifiez Authentication → Users et public.profiles dans Supabase.")}`);
    }
  } else if (!login.includes("@")) {
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("email").ilike("username", login).maybeSingle();
    if (!profile?.email) redirect(`/auth?err=${q("Nom d’utilisateur ou mot de passe incorrect.")}`);
    email = profile.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/auth?err=${q("E-mail ou mot de passe incorrect.")}`);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("must_change_credentials").eq("id", user.id).maybeSingle()
    : { data: null };
  if (profile?.must_change_credentials) redirect("/premiere-connexion");
  redirect(safeNext(formData.get("suite")));
}

export async function completeFirstLogin(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!/^[\p{L}\p{N}._-]{3,40}$/u.test(username)) redirect(`/premiere-connexion?err=${q("Nom d’utilisateur invalide (3 à 40 caractères).")}`);
  if (!fullName || fullName.length > 100) redirect(`/premiere-connexion?err=${q("Veuillez saisir votre nom complet.")}`);
  if (password.length < 10) redirect(`/premiere-connexion?err=${q("Le nouveau mot de passe doit contenir au moins 10 caractères.")}`);
  if (password !== confirm) redirect(`/premiere-connexion?err=${q("Les deux mots de passe diffèrent.")}`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const { data: profile } = await supabase.from("profiles").select("must_change_credentials").eq("id", user.id).maybeSingle();
  if (!profile?.must_change_credentials) redirect("/espace");
  const { data: duplicate } = await createAdminClient().from("profiles").select("id").ilike("username", username).neq("id", user.id).maybeSingle();
  if (duplicate) redirect(`/premiere-connexion?err=${q("Ce nom d’utilisateur est déjà utilisé.")}`);
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) redirect(`/premiere-connexion?err=${q(updateError.message)}`);
  const { error } = await supabase.rpc("complete_first_admin_setup", {
    p_username: username,
    p_full_name: fullName,
  });
  if (error) redirect(`/premiere-connexion?err=${q("Enregistrement du profil impossible. Réessayez.")}`);
  redirect("/connexion-site?ok=" + q("Identifiants modifiés. Votre espace directeur est prêt."));
}

export async function requestReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/nouveau-mot-de-passe`,
  });
  // Même message que le compte existe ou non
  redirect(`/mot-de-passe-oublie?ok=${q("Si ce compte existe, un lien de réinitialisation vient d'être envoyé.")}`);
}

export async function setPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10) redirect(`/nouveau-mot-de-passe?err=${q("Au moins 10 caractères.")}`);
  if (password !== confirm) redirect(`/nouveau-mot-de-passe?err=${q("Les deux mots de passe diffèrent.")}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/nouveau-mot-de-passe?err=${q(error.message)}`);
  redirect(`/connexion-site?ok=${q("Mot de passe enregistré.")}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.rpc("close_site", { p_site: null });
  await supabase.auth.signOut();
  (await cookies()).delete(SITE_COOKIE);
  redirect("/auth");
}
