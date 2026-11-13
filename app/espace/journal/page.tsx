import Flash from "@/components/Flash";
import EntryForm from "@/components/EntryForm";
import PrintButton from "@/components/PrintButton";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getAccounts } from "@/lib/session";
import { dateFr, num, monthBounds, today, JOURNALS, rel, isDate } from "@/lib/format";
import { postEntry, reverseEntry } from "../actions";

export const metadata = { title: "Journal" };

type SP = Record<string, string>;

export default async function JournalPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const site = await getActiveSite();
  const accounts = await getAccounts();
  const supabase = await createClient();
  const mb = monthBounds();
  const from = isDate(sp.du) ? sp.du : mb.from;
  const to = isDate(sp.au) ? sp.au : mb.to;

  const { data: templates } = await supabase
    .from("entry_templates").select("id, name, journal_code, sector, lines")
    .or(`sector.is.null,sector.eq.${site.sector}`).order("sector", { nullsFirst: false }).order("name");

  let query = supabase
    .from("journal_entries")
    .select("id, number, entry_date, journal_code, reference, label, currency, exchange_rate, source_type, reverses_id, created_at, profiles(full_name, email), entry_lines(id, account_code, label, debit, credit, debit_usd, credit_usd)")
    .eq("site_id", site.id).gte("entry_date", from).lte("entry_date", to)
    .order("entry_date", { ascending: false }).order("number", { ascending: false }).limit(300);
  if (sp.journal) query = query.eq("journal_code", sp.journal);
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, " ");
    query = query.or(`label.ilike.%${term}%,reference.ilike.%${term}%`);
  }
  const { data: entriesRaw, error } = await query;
  let entries = entriesRaw ?? [];
  if (sp.compte) entries = entries.filter((e) => e.entry_lines.some((l: { account_code: string }) => l.account_code.startsWith(sp.compte)));
  const reversed = new Set(entries.map((e) => e.reverses_id).filter(Boolean));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Journal · {site.name}</h1>
          <p className="muted">Écritures en partie double. Les écritures automatiques proviennent des factures et paiements.</p>
        </div>
        <PrintButton />
      </div>
      <Flash ok={sp.ok} err={sp.err ?? error?.message} />

      <div className="no-print">
        <EntryForm accounts={accounts} sector={site.sector} templates={templates ?? []} action={postEntry} today={today()} />
      </div>

      <form className="card row no-print" method="get">
        <div><label>Du</label><input type="date" name="du" defaultValue={from} /></div>
        <div><label>Au</label><input type="date" name="au" defaultValue={to} /></div>
        <div>
          <label>Journal</label>
          <select name="journal" defaultValue={sp.journal ?? ""}>
            <option value="">Tous</option>
            {Object.entries(JOURNALS).map(([k, v]) => <option key={k} value={k}>{k} – {v}</option>)}
          </select>
        </div>
        <div><label>Compte (commence par)</label><input name="compte" defaultValue={sp.compte ?? ""} placeholder="ex. 411" /></div>
        <div><label>Recherche</label><input name="q" defaultValue={sp.q ?? ""} placeholder="Libellé ou pièce" /></div>
        <button className="btn shrink">Filtrer</button>
      </form>

      <p className="muted small">{entries.length} écriture(s) du {dateFr(from)} au {dateFr(to)}{entries.length === 300 && " (300 max. affichées — affinez les filtres)"}.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N°</th><th>Date</th><th>Jnl</th><th>Pièce</th><th>Compte</th><th>Libellé</th>
              <th className="num">Débit</th><th className="num">Crédit</th><th>Dev.</th><th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <EntryRows key={e.id} e={e} canReverse={e.source_type === "manuel" && !reversed.has(e.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EntryRows({ e, canReverse }: { e: any; canReverse: boolean }) {
  const author = rel<{ full_name: string; email: string }>(e.profiles);
  const lines = [...e.entry_lines].sort((a, b) => a.id - b.id);
  return (
    <>
      {lines.map((l, i) => (
        <tr key={l.id} className={i === 0 ? "subtotal" : undefined}>
          {i === 0 ? (
            <>
              <td>{e.number}</td><td>{dateFr(e.entry_date)}</td><td>{e.journal_code}</td><td>{e.reference}</td>
            </>
          ) : (<><td></td><td></td><td></td><td></td></>)}
          <td className="mono">{l.account_code}</td>
          <td>
            {i === 0 ? <strong>{e.label}</strong> : l.label}
            {i === 0 && <div className="small muted">{l.label} · {author?.full_name || author?.email}{e.currency === "CDF" && ` · taux ${e.exchange_rate}`}</div>}
          </td>
          <td className="num">{num(l.debit) || (Number(l.debit_usd) ? `${num(l.debit_usd)} $` : "")}</td>
          <td className="num">{num(l.credit) || (Number(l.credit_usd) ? `${num(l.credit_usd)} $` : "")}</td>
          <td>{i === 0 ? e.currency : ""}</td>
          <td className="no-print">
            {i === 0 && canReverse && (
              <form action={reverseEntry}>
                <input type="hidden" name="entry_id" value={e.id} />
                <input type="hidden" name="back" value="/espace/journal" />
                <button className="linkbtn small">Contre-passer</button>
              </form>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
