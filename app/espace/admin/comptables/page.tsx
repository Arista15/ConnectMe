import Flash from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { dateFr } from "@/lib/format";
import { inviteAccountant, updateAccountant, resendInvite } from "../actions";

export const metadata = { title: "Comptables" };

export default async function AccountantsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const supabase = await createClient();
  const [{ data: profiles }, { data: sites }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("sites").select("id, code, name").order("code"),
    supabase.from("site_assignments").select("user_id, site_id"),
  ]);
  const assigned = (uid: string) => new Set((assignments ?? []).filter((a) => a.user_id === uid).map((a) => a.site_id));

  const SiteChecks = ({ selected }: { selected: Set<string> }) => (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {(sites ?? []).map((s) => (
        <label key={s.id} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" name="sites" value={s.id} defaultChecked={selected.has(s.id)} style={{ width: "auto" }} />
          {s.code} – {s.name}
        </label>
      ))}
    </div>
  );

  return (
    <>
      <div className="page-head"><div><h1>Comptables</h1><p className="muted">Invitations par e-mail et attribution des sites. Pas d'inscription libre.</p></div></div>
      <Flash ok={sp.ok} err={sp.err} />

      <form action={inviteAccountant} className="card">
        <h3 style={{ marginTop: 0 }}>Inviter un comptable</h3>
        <div className="row">
          <div><label>Nom complet</label><input name="full_name" required /></div>
          <div><label>E-mail</label><input name="email" type="email" required /></div>
          <div><label>Rôle</label><select name="role"><option value="comptable">Comptable</option><option value="admin">Administrateur</option></select></div>
        </div>
        <div className="field" style={{ marginTop: 8 }}><label>Sites attribués</label><SiteChecks selected={new Set()} /></div>
        <button className="btn">Envoyer l'invitation</button>
        <p className="small muted">Le comptable reçoit un lien pour créer son mot de passe. Communiquez-lui séparément le code d'accès de chaque site.</p>
      </form>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Sites</th><th>Depuis</th><th></th></tr></thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const sel = assigned(p.id);
              return (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                  <td>{p.full_name}{!p.active && <span className="badge err" style={{ marginLeft: 6 }}>Désactivé</span>}</td>
                  <td>{p.email}</td>
                  <td>{p.role === "admin" ? "Administrateur" : "Comptable"}</td>
                  <td>{p.role === "admin" ? "Tous" : (sites ?? []).filter((s) => sel.has(s.id)).map((s) => s.code).join(", ") || "—"}</td>
                  <td>{dateFr(p.created_at)}</td>
                  <td>
                    <details>
                      <summary className="linkbtn">Modifier</summary>
                      <form action={updateAccountant} style={{ minWidth: 340, marginTop: 8 }}>
                        <input type="hidden" name="user_id" value={p.id} />
                        <div className="field"><label>Nom</label><input name="full_name" defaultValue={p.full_name} /></div>
                        <div className="row">
                          <div>
                            <label>Rôle</label>
                            <select name="role" defaultValue={p.role} disabled={p.id === me.id}>
                              <option value="comptable">Comptable</option><option value="admin">Administrateur</option>
                            </select>
                            {p.id === me.id && <input type="hidden" name="role" value="admin" />}
                          </div>
                          <label className="shrink" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input type="checkbox" name="active" defaultChecked={p.active} disabled={p.id === me.id} style={{ width: "auto" }} /> Actif
                            {p.id === me.id && <input type="hidden" name="active" value="on" />}
                          </label>
                        </div>
                        <div className="field" style={{ marginTop: 8 }}><label>Sites</label><SiteChecks selected={sel} /></div>
                        <button className="btn sm">Enregistrer</button>
                      </form>
                      <form action={resendInvite} style={{ marginTop: 6 }}>
                        <input type="hidden" name="email" value={p.email} />
                        <button className="linkbtn small">Renvoyer un lien d'accès</button>
                      </form>
                    </details>
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
