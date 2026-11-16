import Link from "next/link";
import Flash from "@/components/Flash";
import Icon from "@/components/Icon";
import Modal from "@/components/Modal";
import { PageHeader, Panel, Empty, Seg, Status } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { getTreasuries } from "@/lib/treasury";
import { money, dateFr, today, rel } from "@/lib/format";
import { recordAdvance, deleteAdvance } from "../parite-actions";

export const metadata = { title: "Factures & devis" };

const QUOTE_STATUS: Record<string, [string, string]> = { brouillon: ["", "Brouillon"], accepte: ["ok", "Accepté"], refuse: ["err", "Refusé"] };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = sp.onglet === "devis" ? "devis" : sp.onglet === "acomptes" ? "acomptes" : "factures";
  const site = await getActiveSite();
  const supabase = await createClient();

  const [{ data: invoices }, { data: quotes }, { data: advances }, { data: customers }] = await Promise.all([
    tab === "factures"
      ? supabase.from("customer_invoices").select("id, number, issue_date, due_date, currency, total, amount_paid, status, customers(name)")
          .eq("site_id", site.id).order("issue_date", { ascending: false }).order("number", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as never[] }),
    tab === "devis"
      ? supabase.from("customer_quotes").select("id, number, issue_date, valid_until, currency, total, status, invoice_id, customers(name)")
          .eq("site_id", site.id).order("issue_date", { ascending: false }).order("number", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as never[] }),
    tab === "acomptes"
      ? supabase.from("customer_advances").select("id, advance_date, amount, applied, currency, reference, customers(name), treasury_accounts(name), advance_applications(amount, cancelled_at, customer_invoices(number))")
          .eq("site_id", site.id).order("advance_date", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("customers").select("id, name").eq("site_id", site.id).order("name"),
  ]);
  const treasuries = tab === "acomptes" ? await getTreasuries(site.id) : [];
  const t = today();
  const back = `/espace/factures-clients?onglet=${tab}`;

  const action = tab === "acomptes" ? (
    <Modal label="Nouvel acompte" title="Nouvel acompte client" icon="plus" size="lg">
      <form action={recordAdvance}>
        <input type="hidden" name="back" value={back} />
        <div className="form-grid">
          <div className="span-2">
            <label>Client</label>
            <select name="customer_id" required defaultValue="">
              <option value="" disabled>— Choisir —</option>
              {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label>Date</label><input type="date" name="payment_date" defaultValue={t} /></div>
          <div><label>Montant</label><input name="amount" inputMode="decimal" required /></div>
          <div className="span-2"><label>Mode (caisse ou banque)</label><select name="treasury_account_id" required>{treasuries.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.currency})</option>)}</select></div>
          <div className="span-2"><label>Référence</label><input name="reference" maxLength={100} placeholder="Bon de commande, reçu…" /></div>
        </div>
        <p className="note">Écriture : débit banque/caisse, crédit 4191 Clients, avances et acomptes reçus. L&apos;acompte sera déduit de la facture finale depuis « Encaisser / acompte ». La devise est celle de la caisse ou banque.</p>
        <div className="form-foot"><button className="btn">Enregistrer l&apos;acompte</button></div>
      </form>
    </Modal>
  ) : tab === "devis" ? (
    <Link href="/espace/devis/nouveau" className="btn"><Icon name="plus" /> Nouveau devis</Link>
  ) : (
    <Link href="/espace/factures-clients/nouvelle" className="btn"><Icon name="plus" /> Nouvelle facture</Link>
  );

  return (
    <>
      <PageHeader
        title="Factures & devis"
        subtitle="La validation d'une facture génère automatiquement l'écriture de vente (411 / 70x / 4431)."
        actions={action}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <Seg items={[
        { href: "?onglet=factures", label: "Factures", active: tab === "factures" },
        { href: "?onglet=devis", label: "Devis", active: tab === "devis" },
        { href: "?onglet=acomptes", label: "Acomptes clients", active: tab === "acomptes" },
      ]} />

      {tab === "factures" && (
        <Panel>
          {(invoices ?? []).length === 0 ? <Empty>Aucun document.</Empty> : (
            <table>
              <thead><tr><th>N°</th><th>Date</th><th>Site</th><th>Client</th><th className="num">Total TTC</th><th className="num">Reçu</th><th className="num">Reste dû</th><th>Statut</th><th className="t-right">Actions</th></tr></thead>
              <tbody>
                {(invoices ?? []).map((i) => {
                  const rest = Number(i.total) - Number(i.amount_paid);
                  const open = ["emise", "partielle"].includes(i.status);
                  return (
                    <tr key={i.id}>
                      <td className="mono xs">{i.number}</td>
                      <td className="mono">{dateFr(i.issue_date)}</td>
                      <td className="mono t-muted">{site.code}</td>
                      <td>{rel(i.customers)?.name ?? "—"}</td>
                      <td className="num">{money(i.total, i.currency)}</td>
                      <td className="num">{Number(i.amount_paid) > 0 ? money(i.amount_paid, i.currency) : "—"}</td>
                      <td className="num fw-600">{open && rest > 0 ? money(rest, i.currency) : "—"}{open && i.due_date < t && <div className="xs t-danger">en retard</div>}</td>
                      <td><Status status={i.status} /></td>
                      <td>
                        <div className="row-actions">
                          {open
                            ? <Link href={`/espace/factures-clients/${i.id}#reglement`} className="btn ghost sm">Encaisser / acompte</Link>
                            : i.status === "payee" ? <Link href={`/espace/factures-clients/${i.id}#reglement`} className="btn plain sm">Paiements</Link> : null}
                          <Link href={`/espace/factures-clients/${i.id}`} className="btn plain sm icon" title="Voir / imprimer"><Icon name="printer" /></Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {tab === "devis" && (
        <Panel>
          {(quotes ?? []).length === 0 ? <Empty>Aucun document.</Empty> : (
            <table>
              <thead><tr><th>N°</th><th>Date</th><th>Site</th><th>Client</th><th className="num">Total TTC</th><th>Statut</th><th className="t-right">Actions</th></tr></thead>
              <tbody>
                {(quotes ?? []).map((d) => {
                  const [cls, label] = QUOTE_STATUS[d.status] ?? ["", d.status];
                  return (
                    <tr key={d.id}>
                      <td className="mono xs">{d.number}</td>
                      <td className="mono">{dateFr(d.issue_date)}</td>
                      <td className="mono t-muted">{site.code}</td>
                      <td>{rel(d.customers)?.name ?? "—"}</td>
                      <td className="num">{money(d.total, d.currency)}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td>
                        <div className="row-actions">
                          {d.status === "accepte" && d.invoice_id
                            ? <Link href={`/espace/factures-clients/${d.invoice_id}`} className="btn plain sm">Voir la facture</Link>
                            : <Link href={`/espace/devis/${d.id}`} className="btn ghost sm">Convertir en facture</Link>}
                          <Link href={`/espace/devis/${d.id}`} className="btn plain sm icon" title="Voir / imprimer"><Icon name="printer" /></Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {tab === "acomptes" && (
        <Panel>
          {(advances ?? []).length === 0 ? <Empty>Aucun acompte reçu.</Empty> : (
            <table>
              <thead><tr><th>Date</th><th>Site</th><th>Client</th><th>Réf.</th><th>Mode</th><th className="num">Montant</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {(advances ?? []).map((a) => {
                  const left = Number(a.amount) - Number(a.applied);
                  const apps = ((a.advance_applications ?? []) as unknown as { amount: number; cancelled_at: string | null; customer_invoices: { number: string } | null }[]).filter((x) => !x.cancelled_at);
                  return (
                    <tr key={a.id}>
                      <td className="mono">{dateFr(a.advance_date)}</td>
                      <td className="mono t-muted">{site.code}</td>
                      <td>{rel(a.customers)?.name ?? "—"}</td>
                      <td className="mono xs">{a.reference || "—"}</td>
                      <td>{rel(a.treasury_accounts)?.name}</td>
                      <td className="num">{money(a.amount, a.currency)}</td>
                      <td className="xs">
                        {left > 0.005 && <span className="fw-600 t-primary">Disponible {left < Number(a.amount) ? money(left, a.currency) : ""}</span>}
                        {apps.length > 0 && <div className="t-muted">Imputé sur {apps.map((x) => (x.customer_invoices as unknown as { number: string } | null)?.number).join(", ")}</div>}
                      </td>
                      <td className="t-right">
                        {Number(a.applied) === 0 && (
                          <form action={deleteAdvance}>
                            <input type="hidden" name="advance_id" value={a.id} />
                            <input type="hidden" name="back" value={back} />
                            <button className="btn plain sm icon" title="Supprimer l'acompte et son écriture"><Icon name="trash" /></button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </>
  );
}
