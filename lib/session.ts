import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const SITE_COOKIE = "kbs_site";

import type { Profile, Site, Account } from "@/lib/types";
export type { Profile, Site, Account };

export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/auth?err=" + encodeURIComponent("Compte désactivé ou introuvable."));
  }
  if (profile.must_change_credentials) redirect("/premiere-connexion");
  return profile as Profile;
});

/** Sites actuellement accessibles : tous pour un admin, sinon ceux ouverts avec le code (< 12 h). */
export const getOpenSites = cache(async (): Promise<Site[]> => {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("id, code, name, city, sector, usd_cdf_rate, vat_rate").order("code");
  if (!sites) return [];
  if (profile.role === "admin") return sites as Site[];
  const { data: sessions } = await supabase
    .from("site_sessions")
    .select("site_id")
    .eq("user_id", profile.id)
    .is("closed_at", null)
    .gt("expires_at", new Date().toISOString());
  const open = new Set((sessions ?? []).map((s) => s.site_id));
  return (sites as Site[]).filter((s) => open.has(s.id));
});

/** Site actif (cookie) ; redirige vers la connexion au site s'il n'est plus accessible. */
export const getActiveSite = cache(async (): Promise<Site> => {
  const open = await getOpenSites();
  const id = (await cookies()).get(SITE_COOKIE)?.value;
  const site = open.find((s) => s.id === id) ?? (open.length === 1 ? open[0] : undefined);
  if (!site) redirect("/connexion-site");
  return site;
});

export const getAccounts = cache(async (): Promise<Account[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("accounts").select("code, label, class, sectors").eq("active", true).order("code");
  return (data ?? []) as Account[];
});

export async function requireAdmin() {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/espace?err=" + encodeURIComponent("Réservé aux administrateurs."));
  return profile;
}
