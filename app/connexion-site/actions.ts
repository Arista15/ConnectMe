"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_COOKIE } from "@/lib/session";

const q = (s: string) => encodeURIComponent(s);
const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 12 * 3600 };

export async function openSite(formData: FormData) {
  const siteId = String(formData.get("site_id") ?? "");
  const code = String(formData.get("code") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_site", { p_site: siteId, p_code: code });
  if (error) redirect(`/connexion-site?err=${q(error.message)}`);
  if (!data) redirect(`/connexion-site?err=${q("Code d'accès incorrect.")}`);
  (await cookies()).set(SITE_COOKIE, siteId, cookieOpts);
  redirect("/espace");
}

/** Change de site actif parmi les sites déjà ouverts (ou tous pour un admin). */
export async function switchSite(formData: FormData) {
  const siteId = String(formData.get("site_id") ?? "");
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_site_access", { p_site: siteId });
  if (!data) redirect(`/connexion-site?err=${q("Ouvrez d'abord ce site avec son code d'accès.")}`);
  (await cookies()).set(SITE_COOKIE, siteId, cookieOpts);
  const back = String(formData.get("back") ?? "");
  redirect(back.startsWith("/espace") ? back : "/espace");
}

export async function closeSite(formData: FormData) {
  const siteId = String(formData.get("site_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("close_site", { p_site: siteId });
  const jar = await cookies();
  if (jar.get(SITE_COOKIE)?.value === siteId) jar.delete(SITE_COOKIE);
  redirect(`/connexion-site?ok=${q("Site fermé.")}`);
}
