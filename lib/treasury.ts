import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Treasury = {
  id: string; name: string; kind: "caisse" | "banque"; account_code: string;
  currency: "USD" | "CDF"; balance: number; unreconciled: number;
};

/** Comptes de caisse/banque d'un site avec solde en devise et nombre de mouvements non rapprochés. */
export async function getTreasuries(siteId: string): Promise<Treasury[]> {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("treasury_accounts").select("id, name, kind, account_code, currency")
    .eq("site_id", siteId).eq("active", true).order("kind").order("name");
  const codes = (accounts ?? []).map((a) => a.account_code);
  const [{ data: balances }, { data: unrec }] = await Promise.all([
    supabase.rpc("report_account_balances", { p_site: siteId, p_codes: codes }),
    supabase.from("payments").select("treasury_account_id").eq("site_id", siteId).eq("reconciled", false).limit(5000),
  ]);
  const bal = new Map<string, number>(
    ((balances ?? []) as { account_code: string; balance: number }[]).map((b) => [b.account_code, Number(b.balance)]),
  );
  const un = new Map<string, number>();
  for (const p of unrec ?? []) un.set(p.treasury_account_id, (un.get(p.treasury_account_id) ?? 0) + 1);
  return (accounts ?? []).map((a) => ({
    ...a, balance: Math.round((bal.get(a.account_code) ?? 0) * 100) / 100, unreconciled: un.get(a.id) ?? 0,
  }));
}
