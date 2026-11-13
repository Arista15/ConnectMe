import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Lien des e-mails d'invitation et de réinitialisation.
 * Modèles d'e-mail Supabase à configurer :
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/nouveau-mot-de-passe
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nouveau-mot-de-passe
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/nouveau-mot-de-passe";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/nouveau-mot-de-passe";

  const supabase = await createClient();
  let ok = false;
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }
  if (ok) return NextResponse.redirect(`${origin}${next}`);
  return NextResponse.redirect(
    `${origin}/auth?err=${encodeURIComponent("Lien invalide ou expiré. Demandez un nouveau lien.")}`,
  );
}
