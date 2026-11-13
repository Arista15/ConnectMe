"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/session";

const q = (s: string) => encodeURIComponent(s);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function done(path: string, ok: string): never {
  revalidatePath(path);
  redirect(`${path}?ok=${q(ok)}`);
}
function fail(path: string, err: string): never {
  redirect(`${path}?err=${q(err)}`);
}

// ---------------------------------------------------------------- Comptables
export async function inviteAccountant(fd: FormData) {
  await requireAdmin();
  const path = "/espace/admin/comptables";
  const email = str(fd, "email").toLowerCase();
  const fullName = str(fd, "full_name");
  const role = str(fd, "role") === "admin" ? "admin" : "comptable";
  const sites = fd.getAll("sites").map(String).filter(Boolean);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(path, "E-mail invalide.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/nouveau-mot-de-passe`,
  });
  if (error || !data.user) fail(path, error?.message ?? "Invitation impossible.");

  // Le profil est créé par le trigger ; on applique le rôle et les sites via les RPC admin
  // (exécutées avec la session de l'administrateur, donc journalisées à son nom).
  const supabase = await createClient();
  const r1 = await supabase.rpc("admin_update_profile", {
    p_user: data.user.id, p_full_name: fullName, p_role: role, p_active: true,
  });
  if (r1.error) fail(path, r1.error.message);
  const r2 = await supabase.rpc("admin_set_assignments", { p_user: data.user.id, p_sites: sites });
  if (r2.error) fail(path, r2.error.message);
  done(path, `Invitation envoyée à ${email}.`);
}

export async function updateAccountant(fd: FormData) {
  await requireAdmin();
  const path = "/espace/admin/comptables";
  const supabase = await createClient();
  const userId = str(fd, "user_id");
  const r1 = await supabase.rpc("admin_update_profile", {
    p_user: userId,
    p_full_name: str(fd, "full_name"),
    p_role: str(fd, "role") === "admin" ? "admin" : "comptable",
    p_active: str(fd, "active") === "on",
  });
  if (r1.error) fail(path, r1.error.message);
  const r2 = await supabase.rpc("admin_set_assignments", {
    p_user: userId, p_sites: fd.getAll("sites").map(String).filter(Boolean),
  });
  if (r2.error) fail(path, r2.error.message);
  done(path, "Comptable mis à jour.");
}

export async function resendInvite(fd: FormData) {
  await requireAdmin();
  const path = "/espace/admin/comptables";
  const admin = createAdminClient();
  const { error } = await admin.auth.resetPasswordForEmail(str(fd, "email"), {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/nouveau-mot-de-passe`,
  });
  if (error) fail(path, error.message);
  done(path, "Lien d'accès renvoyé.");
}

// ---------------------------------------------------------------- Sites
export async function createSite(fd: FormData) {
  await requireAdmin();
  const path = "/espace/admin/sites";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_site", {
    p_code: str(fd, "code").toUpperCase(),
    p_name: str(fd, "name"),
    p_city: str(fd, "city"),
    p_sector: str(fd, "sector"),
    p_access_code: str(fd, "access_code"),
    p_rate: Number(str(fd, "rate").replace(",", ".")),
    p_vat: Number(str(fd, "vat_rate").replace(",", ".") || 16),
  });
  if (error) fail(path, error.message);
  done(path, "Site créé avec ses caisses et banques USD/CDF.");
}

export async function updateSite(fd: FormData) {
  await requireAdmin();
  const path = "/espace/admin/sites";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_site", {
    p_site: str(fd, "site_id"), p_name: str(fd, "name"), p_city: str(fd, "city"),
    p_sector: str(fd, "sector"), p_vat: Number(str(fd, "vat_rate").replace(",", ".")),
  });
  if (error) fail(path, error.message);
  done(path, "Site mis à jour.");
}

export async function setSiteCode(fd: FormData) {
  await requireAdmin();
  const path = "/espace/admin/sites";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_site_code", {
    p_site: str(fd, "site_id"), p_access_code: str(fd, "access_code"),
  });
  if (error) fail(path, error.message);
  done(path, "Code d'accès changé. Les sessions ouvertes sur ce site ont été fermées.");
}
