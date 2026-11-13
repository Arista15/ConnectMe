import PrintButton from "@/components/PrintButton";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { dateTimeFr, isDate, rel } from "@/lib/format";

export const metadata = { title: "Historique d'audit" };

const ACTIONS: Record<string, string> = {
  "ecriture.comptabilisee": "Écriture comptabilisée",
  "facture_client.emise": "Facture client émise",
  "facture_client.annulee": "Facture client annulée",
  "facture_fournisseur.brouillon": "Reçu fournisseur enregistré",
  "facture_fournisseur.validee": "Facture fournisseur validée",
  "facture_fournisseur.rejetee": "Reçu fournisseur rejeté",
  "paiement.rapproche": "Paiement rapproché",
  "paiement.derapproche": "Rapprochement annulé",
  "site.ouvert": "Site ouvert",
  "site.code_refuse": "Code d'accès refusé",
  "site.code_change": "Code d'accès changé",
  "site.taux_change": "Taux USD/CDF modifié",
  "site.cree": "Site créé",
  "site.modifie": "Site modifié",
  "comptable.sites": "Sites attribués",
  "comptable.modifie": "Comptable modifié",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: sites }, { data: users }] = await Promise.all([
    supabase.from("sites").select("id, code").order("code"),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);
  let q = supabase.from("audit_log")
    .select("id, at, action, entity, entity_id, details, sites(code), profiles(full_name, email)")
    .order("at", { ascending: false }).limit(500);
  if (sp.site) q = q.eq("site_id", sp.site);
  if (sp.user) q = q.eq("user_id", sp.user);
  if (sp.action) q = q.eq("action", sp.action);
  if (isDate(sp.du)) q = q.gte("at", sp.du);
  if (isDate(sp.au)) q = q.lte("at", sp.au + "T23:59:59");
  if (sp.compte) q = q.contains("details", { comptes: [sp.compte] });
  const { data: rows, error } = await q;

  return (
    <>
      <div className="page-head">
        <div><h1>Historique d'audit</h1><p className="muted">Qui a comptabilisé quelle écriture, quand, sur quel site et dans quels comptes.</p></div>
        <PrintButton />
      </div>
      <form className="card row no-print" method="get">
        <div><label>Site</label><select name="site" defaultValue={sp.site ?? ""}><option value="">Tous</option>{(sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}</select></div>
        <div><label>Comptable</label><select name="user" defaultValue={sp.user ?? ""}><option value="">Tous</option>{(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></div>
        <div><label>Action</label><select name="action" defaultValue={sp.action ?? ""}><option value="">Toutes</option>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label>Compte</label><input name="compte" defaultValue={sp.compte ?? ""} placeholder="ex. 6053" /></div>
        <div><label>Du</label><input type="date" name="du" defaultValue={sp.du ?? ""} /></div>
        <div><label>Au</label><input type="date" name="au" defaultValue={sp.au ?? ""} /></div>
        <button className="btn shrink">Filtrer</button>
      </form>
      {error && <div className="alert err">{error.message}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Comptable</th><th>Site</th><th>Action</th><th>Détails</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const d = (r.details ?? {}) as Record<string, unknown>;
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{dateTimeFr(r.at)}</td>
                  <td>{rel(r.profiles)?.full_name || rel(r.profiles)?.email || "—"}</td>
                  <td>{rel(r.sites)?.code ?? "—"}</td>
                  <td>{ACTIONS[r.action] ?? r.action}</td>
                  <td className="small">
                    {r.action === "ecriture.comptabilisee" ? (
                      <>Jnl {String(d.journal)} · {String(d.libelle)} · pièce {String(d.piece || "—")} · {String(d.montant)} {String(d.devise)} · comptes {(d.comptes as string[] | undefined)?.join(", ")}</>
                    ) : (
                      Object.entries(d).map(([k, v]) => `${k} : ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
