import Flash from "@/components/Flash";
import Modal from "@/components/Modal";
import AccountSelect from "@/components/AccountSelect";
import { PageHeader, Panel, Empty, Seg } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { saveCustomer, saveSupplier } from "../actions";
import { deleteCustomer, deleteSupplier } from "../parite-actions";

export const metadata = { title: "Clients & fournisseurs" };

type Customer = { id: string; name: string; email: string | null; phone: string | null; address: string | null; tax_id: string | null };
type Supplier = { id: string; name: string; email: string | null; phone: string | null; tax_id: string | null; default_account: string | null };
type Accounts = Awaited<ReturnType<typeof getAccounts>>;

export default async function ThirdPartiesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const [{ data: customers }, { data: suppliers }] = await Promise.all([
    supabase.from("customers").select("*").eq("site_id", site.id).order("name"),
    supabase.from("suppliers").select("*").eq("site_id", site.id).order("name"),
  ]);
  const tab = sp.onglet === "fournisseurs" ? "fournisseurs" : "clients";

  return (
    <>
      <PageHeader
        title="Clients & fournisseurs"
        subtitle={<>Tiers du site {site.code} — {site.name}</>}
        actions={tab === "clients" ? (
          <Modal label="Ajouter" title="Nouveau client" icon="plus"><CustomerForm /></Modal>
        ) : (
          <Modal label="Ajouter" title="Nouveau fournisseur" icon="plus"><SupplierForm accounts={accounts} sector={site.sector} /></Modal>
        )}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <Seg items={[
        { href: "?onglet=clients", label: "Clients", active: tab === "clients", count: customers?.length ?? 0 },
        { href: "?onglet=fournisseurs", label: "Fournisseurs", active: tab === "fournisseurs", count: suppliers?.length ?? 0 },
      ]} />

      <Panel>
        {tab === "clients" ? (
          (customers ?? []).length === 0 ? <Empty>Aucun client.</Empty> : (
            <table>
              <thead><tr><th>Nom</th><th>Téléphone</th><th>E-mail</th><th>NIF / RCCM</th><th>Adresse</th><th></th></tr></thead>
              <tbody>
                {((customers ?? []) as Customer[]).map((c) => (
                  <tr key={c.id}>
                    <td className="fw-500">{c.name}</td><td>{c.phone}</td><td>{c.email}</td><td className="mono">{c.tax_id}</td><td>{c.address}</td>
                    <td><div className="row-actions"><Modal label="" title={`Modifier — ${c.name}`} icon="pencil" variant="plain sm icon" triggerTitle="Modifier"><CustomerForm c={c} /></Modal>
                      <DeleteDialog kind="client" name={c.name} id={c.id} action={deleteCustomer} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          (suppliers ?? []).length === 0 ? <Empty>Aucun fournisseur.</Empty> : (
            <table>
              <thead><tr><th>Nom</th><th>Téléphone</th><th>E-mail</th><th>NIF / RCCM</th><th>Compte habituel</th><th></th></tr></thead>
              <tbody>
                {((suppliers ?? []) as Supplier[]).map((s) => (
                  <tr key={s.id}>
                    <td className="fw-500">{s.name}</td><td>{s.phone}</td><td>{s.email}</td><td className="mono">{s.tax_id}</td><td className="mono">{s.default_account}</td>
                    <td><div className="row-actions"><Modal label="" title={`Modifier — ${s.name}`} icon="pencil" variant="plain sm icon" triggerTitle="Modifier"><SupplierForm s={s} accounts={accounts} sector={site.sector} /></Modal>
                      <DeleteDialog kind="fournisseur" name={s.name} id={s.id} action={deleteSupplier} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Panel>
    </>
  );
}

function CustomerForm({ c }: { c?: Customer }) {
  return (
    <form action={saveCustomer}>
      <input type="hidden" name="id" value={c?.id ?? ""} />
      <input type="hidden" name="back" value="/espace/tiers?onglet=clients" />
      <div className="form-grid">
        <div className="span-2"><label>Nom / raison sociale</label><input name="name" defaultValue={c?.name} required /></div>
        <div><label>Téléphone</label><input name="phone" defaultValue={c?.phone ?? ""} /></div>
        <div><label>E-mail</label><input name="email" type="email" defaultValue={c?.email ?? ""} /></div>
        <div><label>NIF / RCCM</label><input name="tax_id" defaultValue={c?.tax_id ?? ""} /></div>
        <div><label>Adresse</label><input name="address" defaultValue={c?.address ?? ""} /></div>
      </div>
      <div className="form-foot"><button className="btn">Enregistrer</button></div>
    </form>
  );
}

function SupplierForm({ s, accounts, sector }: { s?: Supplier; accounts: Accounts; sector: string }) {
  return (
    <form action={saveSupplier}>
      <input type="hidden" name="id" value={s?.id ?? ""} />
      <input type="hidden" name="back" value="/espace/tiers?onglet=fournisseurs" />
      <div className="form-grid">
        <div className="span-2"><label>Nom / raison sociale</label><input name="name" defaultValue={s?.name} required /></div>
        <div><label>Téléphone</label><input name="phone" defaultValue={s?.phone ?? ""} /></div>
        <div><label>E-mail</label><input name="email" type="email" defaultValue={s?.email ?? ""} /></div>
        <div className="span-2"><label>NIF / RCCM</label><input name="tax_id" defaultValue={s?.tax_id ?? ""} /></div>
        <div className="span-2">
          <label>Compte de charge habituel</label>
          <AccountSelect name="default_account" accounts={accounts} sector={sector} classes={[2, 6]} defaultValue={s?.default_account ?? ""} />
        </div>
      </div>
      <div className="form-foot"><button className="btn">Enregistrer</button></div>
    </form>
  );
}

function DeleteDialog({ kind, name, id, action }: { kind: "client" | "fournisseur"; name: string; id: string; action: (fd: FormData) => Promise<void> }) {
  return (
    <Modal label="" title={`Supprimer ce ${kind} ?`} icon="trash" variant="plain sm icon danger-ghost" triggerTitle={`Supprimer le ${kind}`}>
      <div className="delete-box">
        <p>Le {kind} <strong>« {name} »</strong> sera supprimé <strong>définitivement</strong> de la base. Cette action est irréversible.</p>
        <p className="note" style={{ marginTop: 6 }}>
          Si ce {kind} a encore des {kind === "client" ? "factures, devis ou acomptes" : "factures ou paiements"}, la suppression sera refusée pour protéger la comptabilité.
        </p>
      </div>
      <div className="form-foot">
        <form method="dialog"><button className="btn ghost">Annuler</button></form>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <button className="btn danger">Supprimer définitivement</button>
        </form>
      </div>
    </Modal>
  );
}
