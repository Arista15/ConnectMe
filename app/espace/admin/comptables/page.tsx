import Flash from "@/components/Flash";
import Modal from "@/components/Modal";
import { PageHeader, Panel, Empty } from "@/components/ui";
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
    <div style={{ display: "flex", gap: "0.5rem 1rem", flexWrap: "wrap" }}>
      {(sites ?? []).map((s) => (
        <label key={s.id} style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--foreground)", fontSize: "0.875rem", margin: 0 }}>
          <input type="checkbox" name="sites" value={s.id} defaultChecked={selected.has(s.id)} />
          <span className="num">{s.code}</span> — {s.name}
        </label>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Comptables"
        subtitle="Invitations par e-mail et attribution des sites. Pas d'inscription libre ; les administrateurs voient tout."
        actions={
          <Modal label="Inviter un comptable" title="Inviter un comptable" icon="plus" size="lg">
            <form action={inviteAccountant}>
              <div className="form-grid">
                <div className="span-2"><label>Nom complet</label><input name="full_name" required /></div>
                <div><label>E-mail</label><input name="email" type="email" required /></div>
                <div><label>Rôle</label><select name="role"><option value="comptable">Comptable</option><option value="admin">Administrateur</option></select></div>
                <div className="span-2"><label>Sites attribués</label><SiteChecks selected={new Set()} /></div>
              </div>
              <p className="note">Le comptable reçoit un lien pour créer son mot de passe. Communiquez-lui séparément le code d&apos;accès de chaque site.</p>
              <div className="form-foot"><button className="btn">Envoyer l&apos;invitation</button></div>
            </form>
          </Modal>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      <Panel title="Utilisateurs & accès aux sites">
        {(profiles ?? []).length === 0 ? <Empty>Aucun utilisateur.</Empty> : (
          <table>
            <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Sites</th><th>Depuis</th><th></th></tr></thead>
            <tbody>
              {(profiles ?? []).map((p) => {
                const sel = assigned(p.id);
                return (
                  <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                    <td>
                      <div className="fw-500">{p.full_name}{!p.active && <span className="badge err" style={{ marginLeft: 6 }}>Désactivé</span>}</div>
                      <div className="xs t-muted">{p.email}</div>
                    </td>
                    <td>{p.role === "admin" ? <span className="badge info">Administrateur</span> : "Comptable"}</td>
                    <td className="mono">{p.role === "admin" ? "Tous" : (sites ?? []).filter((s) => sel.has(s.id)).map((s) => s.code).join(", ") || "—"}</td>
                    <td className="mono">{dateFr(p.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <Modal label="Modifier" title={`Modifier — ${p.full_name || p.email}`} variant="ghost sm" size="lg">
                          <form action={updateAccountant}>
                            <input type="hidden" name="user_id" value={p.id} />
                            <div className="form-grid">
                              <div className="span-2"><label>Nom</label><input name="full_name" defaultValue={p.full_name} /></div>
                              <div>
                                <label>Rôle</label>
                                <select name="role" defaultValue={p.role} disabled={p.id === me.id}>
                                  <option value="comptable">Comptable</option><option value="admin">Administrateur</option>
                                </select>
                                {p.id === me.id && <input type="hidden" name="role" value="admin" />}
                              </div>
                              <div>
                                <label>Statut</label>
                                <label style={{ display: "flex", gap: 6, alignItems: "center", height: "2.25rem", color: "var(--foreground)", fontSize: "0.875rem" }}>
                                  <input type="checkbox" name="active" defaultChecked={p.active} disabled={p.id === me.id} /> Compte actif
                                </label>
                                {p.id === me.id && <input type="hidden" name="active" value="on" />}
                              </div>
                              <div className="span-2"><label>Sites</label><SiteChecks selected={sel} /></div>
                            </div>
                            <div className="form-foot"><button className="btn">Enregistrer</button></div>
                          </form>
                          <form action={resendInvite} style={{ marginTop: 8 }}>
                            <input type="hidden" name="email" value={p.email} />
                            <button className="linkbtn small">Renvoyer un lien d&apos;accès</button>
                          </form>
                        </Modal>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
