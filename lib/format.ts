export type Currency = "USD" | "CDF";

export function money(value: number | string | null | undefined, currency: Currency | string = "USD") {
  const n = Number(value ?? 0);
  const s = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return currency === "CDF" ? `${s} FC` : `${s} $`;
}

export function num(value: number | string | null | undefined, digits = 2) {
  const n = Number(value ?? 0);
  if (n === 0) return "";
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function dateFr(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value.length === 10 ? value + "T00:00:00" : value) : value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function dateTimeFr(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Lubumbashi",
  });
}

/** Date du jour à Lubumbashi (UTC+2), format AAAA-MM-JJ */
export function today() {
  return new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
}

export function monthBounds(month?: string) {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { month: m, from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}` };
}

export function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const SECTORS: Record<string, string> = {
  services: "Services professionnels",
  btp: "BTP / Construction",
  transport: "Transport & logistique",
};

export const JOURNALS: Record<string, string> = {
  VE: "Ventes",
  AC: "Achats",
  CA: "Caisse",
  BQ: "Banque",
  OD: "Opérations diverses",
  AN: "À-nouveaux",
};

export const INVOICE_STATUS: Record<string, string> = {
  emise: "Émise",
  partielle: "Partiellement réglée",
  payee: "Réglée",
  annulee: "Annulée",
  brouillon: "À valider",
  validee: "Validée",
  rejetee: "Rejetée",
};

/** Relation embarquée Supabase (objet ou tableau selon l'inférence) → premier objet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rel<T = Record<string, any>>(v: unknown): T | undefined {
  if (!v) return undefined;
  return (Array.isArray(v) ? v[0] : v) as T;
}
