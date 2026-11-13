import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client service_role : contourne la RLS. À n'utiliser que dans du code serveur,
 * après avoir vérifié les droits de l'appelant (invitations, tâche de rappels).
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
