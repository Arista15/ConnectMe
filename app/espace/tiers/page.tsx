import Flash from "@/components/Flash";
import AccountSelect from "@/components/AccountSelect";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { saveCustomer, saveSupplier } from "../actions";

export const metadata = { title: "Clients & fournisseurs" };

type Customer = { id: string; name: string; email: string | null; phone: string | null; address: string | null; tax_id: string | null };
type Supplier = { id: string; name: string; email: string | null; phone: string | null; tax_id: string | null; default_account: string | null };

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
      <div className="page-head"><div><h1>Clients & fournisseurs</h1><p className="muted">Tiers du site {site.code}.</p></div></div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="tabs">
        <a href="?onglet=clients" className={tab === "clients" ? "active" : ""}>Clients ({customers?.length ?? 0})</a>
        <a href="?onglet=fournisseurs" className={tab === "fournisseurs" ? "active" : ""}>Fournisseurs ({suppliers?.length ?? 0})</a>
      </div>

      {tab === "clients" ? (
        <>
          <CustomerForm />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>N° impôt</th><th></th></tr></thead>
              <tbody>
                {((customers ?? []) as Customer[]).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}<div className="small muted">{c.address}</div></td><td>{c.email}</td><td>{c.phone}</td><td>{c.tax_id}</td>
                    <td><details><summary className="linkbtn">Modifier</summary><CustomerForm c={c} /></details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <SupplierForm accounts={accounts} sector={site.sector} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nom</th><th>E-mail</th><th>Téléphone</th><th>N° impôt</th><th>Compte habituel</th><th></th></tr></thead>
              <tbody>
                {((suppliers ?? []) as Supplier[]).map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td><td>{s.email}</td><td>{s.phone}</td><td>{s.tax_id}</td><td className="mono">{s.default_account}</td>
                    <td><details><summary className="linkbtn">Modifier</summary><SupplierForm s={s} accounts={accounts} sector={site.sector} /></details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function CustomerForm({ c }: { c?: Customer }) {
  return (
    <form action={saveCustomer} className="card">
      {!c && <h3 style={{ marginTop: 0 }}>Nouveau client</h3>}
      <input type="hidden" name="id" value={c?.id ?? ""} />
      <input type="hidden" name="back" value="/espace/tiers?onglet=clients" />
      <div className="row">
        <div><label>Nom / raison sociale</label><input name="name" defaultValue={c?.name} required /></div>
        <div><label>E-mail</label><input name="email" type="email" defaultValue={c?.email ?? ""} /></div>
        <div><label>Téléphone</label><input name="phone" defaultValue={c?.phone ?? ""} /></div>
        <div><label>N° impôt / RCCM</label><input name="tax_id" defaultValue={c?.tax_id ?? ""} /></div>
      </div>
      <div className="field" style={{ marginTop: 8 }}><label>Adresse</label><input name="address" defaultValue={c?.address ?? ""} /></div>
      <button className="btn">{c ? "Enregistrer" : "Ajouter le client"}</button>
    </form>
  );
}

function SupplierForm({ s, accounts, sector }: { s?: Supplier; accounts: Awaited<ReturnType<typeof getAccounts>>; sector: string }) {
  return (
    <form action={saveSupplier} className="card">
      {!s && <h3 style={{ marginTop: 0 }}>Nouveau fournisseur</h3>}
      <input type="hidden" name="id" value={s?.id ?? ""} />
      <input type="hidden" name="back" value="/espace/tiers?onglet=fournisseurs" />
      <div className="row">
        <div><label>Nom</label><input name="name" defaultValue={s?.name} required /></div>
        <div><label>E-mail</label><input name="email" type="email" defaultValue={s?.email ?? ""} /></div>
        <div><label>Téléphone</label><input name="phone" defaultValue={s?.phone ?? ""} /></div>
        <div><label>N° impôt</label><input name="tax_id" defaultValue={s?.tax_id ?? ""} /></div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Compte de charge habituel</label>
        <AccountSelect name="default_account" accounts={accounts} sector={sector} classes={[2, 6]} defaultValue={s?.default_account ?? ""} />
      </div>
      <button className="btn">{s ? "Enregistrer" : "Ajouter le fournisseur"}</button>
    </form>
  );
}
