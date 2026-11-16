import Link from "next/link";
import Flash from "@/components/Flash";
import EntryForm from "@/components/EntryForm";
import PrintButton from "@/components/PrintButton";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import ConfirmButton from "@/components/ConfirmButton";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { dateFr, num, money, today, JOURNALS, rel, isDate } from "@/lib/format";
import { monthLabel, payroll, type Line } from "@/lib/entries";
import { postEntry } from "../actions";
import { updateEntry, deleteEntry } from "../parite-actions";

export const metadata = { title: "Journal" };

type SP = Record<string, string>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entry = any;

export default async function JournalPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const year = today().slice(0, 4);
  const from = isDate(sp.du) ? sp.du : `${year}-01-01`;
  const to = isDate(sp.au) ? sp.au : today();

  const { data: templates } = await supabase
    .from("entry_templates").select("id, name, journal_code, sector, lines")
    .or(`sector.is.null,sector.eq.${site.sector}`).order("sector", { nullsFirst: false }).order("name");

  let query = supabase
    .from("journal_entries")
    .select("id, number, entry_date, journal_code, reference, label, currency, exchange_rate, source_type, reverses_id, created_at, profiles(full_name, email), entry_lines(id, account_code, label, debit, credit, debit_usd, credit_usd)")
    .eq("site_id", site.id).gte("entry_date", from).lte("entry_date", to)
    .order("entry_date", { ascending: false }).order("number", { ascending: false }).limit(500);
  if (sp.journal) query = query.eq("journal_code", sp.journal);
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, " ");
    query = query.or(`label.ilike.%${term}%,reference.ilike.%${term}%`);
  }
  const { data: entriesRaw, error } = await query;
  let entries: Entry[] = entriesRaw ?? [];
  if (sp.compte) entries = entries.filter((e) => e.entry_lines.some((l: { account_code: string }) => l.account_code.startsWith(sp.compte)));
  const reversed = new Set(entries.map((e) => e.reverses_id).filter(Boolean));

  // Regroupement par mois (du plus récent au plus ancien)
  const months = new Map<string, Entry[]>();
  for (const e of entries) {
    const m = e.entry_date.slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), e]);
  }
  const editing = sp.modifier ? entries.find((e) => e.id === sp.modifier) : undefined;
  const qs = new URLSearchParams(Object.entries(sp).filter(([k]) => ["du", "au", "journal", "compte", "q"].includes(k)));
  const back = `/espace/journal${qs.toString() ? `?${qs}` : ""}`;
  const canEdit = (e: Entry) => e.source_type === "manuel" && !reversed.has(e.id);

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle={<>{site.code} — {site.name} · {entries.length} écriture(s) du {dateFr(from)} au {dateFr(to)}</>}
        actions={<>
          <PrintButton />
          <Modal label="Nouvelle écriture" title="Nouvelle écriture" icon="plus" size="xl">
            <EntryForm accounts={accounts} sector={site.sector} templates={templates ?? []} action={postEntry} today={today()} />
          </Modal>
        </>}
      />
      <Flash ok={sp.ok} err={sp.err ?? error?.message} />

      {editing && canEdit(editing) && (
        <Modal title={<>Modifier l&apos;écriture n° {editing.number}</>} size="xl" defaultOpen hideTrigger>
          <EntryForm
            accounts={accounts} sector={site.sector} templates={[]} action={updateEntry} today={today()}
            entryId={editing.id} back={back}
            initial={{
              journal: editing.journal_code, date: editing.entry_date, reference: editing.reference, label: editing.label,
              currency: editing.currency,
              lines: [...editing.entry_lines].sort((a: { id: number }, b: { id: number }) => a.id - b.id).map((l: { account_code: string; label: string; debit: number; credit: number }) => ({
                account_code: l.account_code, label: l.label, debit: Number(l.debit) ? String(Number(l.debit)) : "", credit: Number(l.credit) ? String(Number(l.credit)) : "",
              })),
            }}
          />
        </Modal>
      )}

      <form className="filters toolbar no-print" method="get">
        <label>Du<input type="date" name="du" defaultValue={from} /></label>
        <label>Au<input type="date" name="au" defaultValue={to} /></label>
        <label>
          Journal
          <select name="journal" defaultValue={sp.journal ?? ""}>
            <option value="">Tous</option>
            {Object.entries(JOURNALS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
          </select>
        </label>
        <label>Compte<input name="compte" defaultValue={sp.compte ?? ""} placeholder="ex. 411" /></label>
        <label>Recherche<input name="q" defaultValue={sp.q ?? ""} placeholder="Libellé ou pièce" /></label>
        <button className="btn ghost">Filtrer</button>
      </form>

      {entries.length === 0 && <Panel><Empty>Aucune écriture sur la période.</Empty></Panel>}

      {[...months.entries()].map(([m, list]) => {
        const flat: Line[] = list.flatMap((e: Entry) => e.entry_lines.map((l: Entry) => ({ ...l, debit_usd: Number(l.debit_usd), credit_usd: Number(l.credit_usd), account_code: l.account_code } as Line)));
        const totD = flat.reduce((s, l) => s + l.debit_usd, 0);
        const totC = flat.reduce((s, l) => s + l.credit_usd, 0);
        const paie = payroll(flat);
        const hasPaie = Object.values(paie).some((v) => Math.abs(v) > 0.004);
        return (
          <Panel key={m} title={monthLabel(m)} serif actions={<span className="xs t-muted">{list.length} écriture(s)</span>}>
            <table>
              <thead>
                <tr><th>Date</th><th>Jnl</th><th>Pièce</th><th>Compte</th><th>Libellé</th><th className="num">Débit</th><th className="num">Crédit</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {list.map((e: Entry) => {
                  const author = rel<{ full_name: string; email: string }>(e.profiles);
                  const lines = [...e.entry_lines].sort((a: { id: number }, b: { id: number }) => a.id - b.id);
                  return lines.map((l: Entry, i: number) => (
                    <tr key={l.id} className={i === 0 ? "group-start" : undefined}>
                      <td className="mono">{i === 0 ? dateFr(e.entry_date) : ""}</td>
                      <td className="mono">{i === 0 ? e.journal_code : ""}</td>
                      <td className="mono xs">{i === 0 ? e.reference : ""}</td>
                      <td className="mono">{l.account_code}</td>
                      <td>
                        {i === 0 ? <span className="fw-500">{e.label}</span> : <span className="t-muted">{l.label}</span>}
                        {i === 0 && <div className="xs t-muted">n° {e.number} · {author?.full_name || author?.email}{e.currency === "CDF" && ` · taux ${Number(e.exchange_rate)}`}</div>}
                      </td>
                      <td className="num">{num(l.debit) ? money(l.debit, e.currency) : Number(l.debit_usd) ? `${num(l.debit_usd)} $` : ""}</td>
                      <td className="num">{num(l.credit) ? money(l.credit, e.currency) : Number(l.credit_usd) ? `${num(l.credit_usd)} $` : ""}</td>
                      <td className="no-print">
                        {i === 0 && (canEdit(e) ? (
                          <div className="row-actions">
                            <Link href={`${back}${back.includes("?") ? "&" : "?"}modifier=${e.id}`} className="btn plain sm icon" title="Modifier l'écriture" scroll={false}><Icon name="pencil" /></Link>
                            <form action={deleteEntry}>
                              <input type="hidden" name="entry_id" value={e.id} />
                              <input type="hidden" name="back" value={back} />
                              <ConfirmButton message="Supprimer cette écriture ?" className="btn plain sm icon" title="Supprimer l'écriture"><Icon name="trash" /></ConfirmButton>
                            </form>
                          </div>
                        ) : <span className="xs t-muted" title="Écriture créée par une pièce : modifiez la facture, la dépense ou le paiement d'origine">auto</span>)}
                      </td>
                    </tr>
                  ));
                })}
                <tr className="total">
                  <td colSpan={5}>RAN — Report à nouveau {monthLabel(m).toLowerCase()} (en USD)</td>
                  <td className="num">{money(totD)}</td><td className="num">{money(totC)}</td><td className="no-print"></td>
                </tr>
              </tbody>
            </table>
            {hasPaie && (
              <div className="panel-foot" style={{ background: "color-mix(in oklab, var(--muted) 40%, transparent)" }}>
                <h4 className="small fw-600" style={{ margin: "0 0 8px" }}>Paie — {monthLabel(m)} (en USD)</h4>
                <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", gap: 10, marginBottom: 0 }}>
                  {([["Salaires", "Bruts et primes (661–663)", paie.salaires], ["CNSS", "Parts patronale et salariale (4313, 4317)", paie.cnss], ["INPP", "Cotisation (4315)", paie.inpp], ["ONEM", "Cotisation (4316)", paie.onem], ["Impôts", "IPR, IERE… retenus (447)", paie.impots]] as [string, string, number][]).map(([l, h, v]) => (
                    <div key={l} className="stat" style={{ padding: "0.5rem 0.75rem" }}>
                      <div className="label fw-500">{l}</div>
                      <div className="value" style={{ fontSize: "1rem" }}>{money(v)}</div>
                      <div style={{ fontSize: 11 }} className="t-muted">{h}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        );
      })}
    </>
  );
}
