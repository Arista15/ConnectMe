import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Ligne d'écriture aplatie (en-tête + ligne), montants natifs et contre-valeur USD. */
export type Line = {
  entry_id: string; number: number; site_id: string; entry_date: string; journal_code: string;
  reference: string; label: string; currency: string; exchange_rate: number; source_type: string;
  account_code: string; line_label: string; debit: number; credit: number; debit_usd: number; credit_usd: number;
};

/** Toutes les lignes d'écriture des sites sur la période (pagination par 1 000 écritures). */
export async function fetchLines(siteIds: string[], from: string, to: string): Promise<Line[]> {
  if (siteIds.length === 0) return [];
  const supabase = await createClient();
  const out: Line[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, number, site_id, entry_date, journal_code, reference, label, currency, exchange_rate, source_type, entry_lines(id, account_code, label, debit, credit, debit_usd, credit_usd)")
      .in("site_id", siteIds).gte("entry_date", from).lte("entry_date", to)
      .order("entry_date").order("number").range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const e of data ?? []) {
      const ls = [...(e.entry_lines as { id: number; account_code: string; label: string; debit: number; credit: number; debit_usd: number; credit_usd: number }[])].sort((a, b) => a.id - b.id);
      for (const l of ls) {
        out.push({
          entry_id: e.id, number: e.number, site_id: e.site_id, entry_date: e.entry_date, journal_code: e.journal_code,
          reference: e.reference, label: e.label, currency: e.currency, exchange_rate: Number(e.exchange_rate),
          source_type: e.source_type, account_code: l.account_code, line_label: l.label,
          debit: Number(l.debit), credit: Number(l.credit), debit_usd: Number(l.debit_usd), credit_usd: Number(l.credit_usd),
        });
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tableau des flux : le mouvement de trésorerie (classe 5) de chaque écriture est rattaché
 *  à la catégorie de sa contrepartie dominante (1 financement, 2 investissement, sinon exploitation). */
export function cashFlow(lines: Line[]) {
  const byEntry = new Map<string, Line[]>();
  for (const l of lines) byEntry.set(l.entry_id, [...(byEntry.get(l.entry_id) ?? []), l]);
  const months = new Map<string, { month: string; exploitation: number; investissement: number; financement: number; variation: number }>();
  const tot = { exploitation: 0, investissement: 0, financement: 0, variation: 0 };
  for (const ls of byEntry.values()) {
    const cash = ls.filter((l) => l.account_code.startsWith("5")).reduce((s, l) => s + l.debit_usd - l.credit_usd, 0);
    if (Math.abs(cash) < 0.005) continue;
    const others = ls.filter((l) => !l.account_code.startsWith("5"));
    if (others.length === 0) continue; // virement entre comptes de trésorerie
    const dom = others.reduce((a, b) => (Math.abs(b.debit_usd - b.credit_usd) > Math.abs(a.debit_usd - a.credit_usd) ? b : a));
    const cat = dom.account_code[0] === "1" ? "financement" : dom.account_code[0] === "2" ? "investissement" : "exploitation";
    const m = ls[0].entry_date.slice(0, 7);
    const row = months.get(m) ?? { month: m, exploitation: 0, investissement: 0, financement: 0, variation: 0 };
    row[cat] += cash; row.variation += cash; tot[cat] += cash; tot.variation += cash;
    months.set(m, row);
  }
  return {
    exploitation: r2(tot.exploitation), investissement: r2(tot.investissement), financement: r2(tot.financement), variation: r2(tot.variation),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export type MonthRow = { month: string; ca: number; depenses: number; tvaCollectee: number; tvaDeductible: number; tvaNette: number; solde: number };

/** Synthèse mensuelle : CA (classe 7), dépenses (classe 6), TVA collectée (443) et déductible (445), en USD. */
export function monthly(lines: Line[]): Map<string, MonthRow> {
  const m = new Map<string, MonthRow>();
  for (const l of lines) {
    const k = l.entry_date.slice(0, 7);
    const row = m.get(k) ?? { month: k, ca: 0, depenses: 0, tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0, solde: 0 };
    const d = l.debit_usd, c = l.credit_usd;
    if (l.account_code.startsWith("7")) row.ca += c - d;
    if (l.account_code.startsWith("6")) row.depenses += d - c;
    if (l.account_code.startsWith("443")) row.tvaCollectee += c - d;
    if (l.account_code.startsWith("445")) row.tvaDeductible += d - c;
    row.tvaNette = row.tvaCollectee - row.tvaDeductible;
    row.solde = row.ca - row.depenses;
    m.set(k, row);
  }
  return m;
}

/** Paie du mois : salaires (661–663), CNSS (4313, 4317), INPP (4315), ONEM (4316), impôts retenus (447). */
export function payroll(lines: Line[]) {
  const sum = (pred: (c: string) => boolean, side: "D" | "C") =>
    r2(lines.filter((l) => pred(l.account_code)).reduce((s, l) => s + (side === "D" ? l.debit_usd - l.credit_usd : l.credit_usd - l.debit_usd), 0));
  return {
    salaires: sum((c) => /^66[123]/.test(c), "D"),
    cnss: sum((c) => c.startsWith("4313") || c.startsWith("4317"), "C"),
    inpp: sum((c) => c.startsWith("4315"), "C"),
    onem: sum((c) => c.startsWith("4316"), "C"),
    impots: sum((c) => c.startsWith("447"), "C"),
  };
}

export const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
export const monthLabel = (ym: string) => `${MONTHS_FR[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
