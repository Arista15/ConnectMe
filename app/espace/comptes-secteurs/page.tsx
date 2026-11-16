import Flash from "@/components/Flash";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/session";
import { addSectorAccount, updateSectorUsage, removeSectorAccount } from "../parite-actions";

export const metadata = { title: "Comptes par secteur" };

const SECTORS: [string, string][] = [["services", "Prestation de services"], ["btp", "BTP / Construction"], ["transport", "Transport / Logistique"]];
const CLASSES: Record<string, string> = {
  1: "Comptes de ressources durables", 2: "Comptes d'actif immobilisé", 3: "Comptes de stocks", 4: "Comptes de tiers",
  5: "Comptes de trésorerie", 6: "Comptes de charges des activités ordinaires", 7: "Comptes de produits des activités ordinaires",
  8: "Comptes des autres charges et des autres produits", 9: "Comptes des engagements hors bilan et comptabilité analytique",
};

export default async function SectorAccounts({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const profile = await getProfile();
  const admin = profile.role === "admin";
  const supabase = await createClient();
  const [{ data: sa }, { data: accounts }] = await Promise.all([
    supabase.from("sector_accounts").select("id, sector, account_code, usage, accounts(label)").order("account_code"),
    supabase.from("accounts").select("code, label").eq("active", true).order("code"),
  ]);
  const term = (sp.q ?? "").trim().toLowerCase();
  const plan = term ? (accounts ?? []).filter((a) => a.code.startsWith(term) || a.label.toLowerCase().includes(term)) : (accounts ?? []);

  return (
    <>
      <PageHeader
        title="Comptes par secteur"
        subtitle={admin ? "Définissez les comptes propres à chaque secteur. Ils s'affichent dans le Guide secteurs." : "Comptes propres à chaque secteur (modifiables par l'administrateur)."}
      />
      <Flash ok={sp.ok} err={sp.err} />

      {SECTORS.map(([k, label]) => {
        const rows = (sa ?? []).filter((a) => a.sector === k);
        const used = new Set(rows.map((r) => r.account_code));
        return (
          <Panel key={k} title={label}>
            {rows.length === 0 ? <Empty>Aucun compte.</Empty> : (
              <table>
                <thead><tr><th>Compte</th><th>Intitulé</th><th>Usage dans le secteur</th>{admin && <th></th>}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono fw-500">{r.account_code}</td>
                      <td>{(r.accounts as unknown as { label: string } | null)?.label}</td>
                      <td>
                        {admin ? (
                          <form action={updateSectorUsage} style={{ display: "flex", gap: 6 }}>
                            <input type="hidden" name="id" value={r.id} />
                            <input name="usage" defaultValue={r.usage ?? ""} placeholder="Usage…" />
                            <button className="btn ghost sm" title="Enregistrer l'usage">OK</button>
                          </form>
                        ) : <span className="t-muted">{r.usage}</span>}
                      </td>
                      {admin && (
                        <td className="t-right">
                          <form action={removeSectorAccount}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="btn plain sm">Retirer</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {admin && (
              <form action={addSectorAccount} className="panel-foot filters">
                <input type="hidden" name="sector" value={k} />
                <select name="account_code" defaultValue="" style={{ minWidth: "16rem" }}>
                  <option value="">— Ajouter un compte —</option>
                  {(accounts ?? []).filter((a) => !used.has(a.code)).map((a) => <option key={a.code} value={a.code}>{a.code} — {a.label}</option>)}
                </select>
                <input name="usage" placeholder="Usage (ex. carburant des camions)" style={{ flex: 1, minWidth: "14rem" }} />
                <button className="btn">Ajouter</button>
              </form>
            )}
          </Panel>
        );
      })}

      <Panel
        title={`Plan comptable SYSCOHADA révisé — classes 1 à 9 (${(accounts ?? []).length} comptes)`}
        actions={
          <form method="get" className="filters">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Rechercher un numéro ou intitulé" style={{ minWidth: "16rem" }} />
          </form>
        }
      >
        {Object.entries(CLASSES).map(([c, name]) => {
          const list = plan.filter((a) => a.code.startsWith(c));
          if (list.length === 0) return null;
          return (
            <details key={c} open={!!term} style={{ borderTop: "1px solid var(--border)" }}>
              <summary className="panel-strip fw-500" style={{ cursor: "pointer" }}>Classe {c} — {name} ({list.length})</summary>
              <table>
                <thead><tr><th>Compte</th><th>Intitulé</th><th>Compte mère</th></tr></thead>
                <tbody>
                  {list.map((a) => {
                    const parent = a.code.length > 2 ? (accounts ?? []).find((x) => x.code === a.code.slice(0, -1)) : null;
                    return (
                      <tr key={a.code}>
                        <td className={`mono ${a.code.length <= 2 ? "fw-600" : ""}`} style={a.code.length > 3 ? { paddingLeft: "1.5rem" } : undefined}>{a.code}</td>
                        <td className={a.code.length <= 2 ? "fw-600" : ""}>{a.label}</td>
                        <td className="t-muted">{parent ? `${parent.code} — ${parent.label}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          );
        })}
      </Panel>
    </>
  );
}
