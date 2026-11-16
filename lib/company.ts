/** Identité légale de KBS (reprise de kbs-comptable.com) — utilisée sur tous les documents imprimés. */
export const COMPANY = {
  short: "K.B.S SARL",
  legal: "Kafaus Business Service SARL",
  activities: "Prestation de services · BTP / Construction · Transport / Logistique",
  rccm: "CD/LSH/RCCM/14-B-01713",
  idNat: "6-83-N81496G",
  nif: "A1418621G",
  phones: "+243 996 968 868 · +243 999 182 675",
  bank: [
    ["Account Name", "KAFAUS BUSINESS SERVICE SARL"],
    ["Account Number", "45130-01027985101-11 / USD"],
    ["Branch Code", "45130"],
    ["Swift Code", "RAWBCDKI"],
    ["Bank Name", "RAW BANK"],
    ["Country", "REPUBLIC DEMOCRATIC OF CONGO"],
  ] as [string, string][],
};

/** Adresses connues par ville (utilisées si les mentions du site ne sont pas encore saisies). */
const ADDRESSES: Record<string, string> = {
  lubumbashi: "2237, Avenue Kapenda, Q/Makutano, C/Lubumbashi, Haut-Katanga, RDC",
  kolwezi: "2469, Avenue Mumba2, Q/Dilungu, C/Manika, Kolwezi, Lualaba, RDC",
};

export type SiteMentions = { name?: string; city?: string | null; address?: string | null; rccm?: string | null; id_nat?: string | null; nif?: string | null };

/** Mentions effectives d'un site : celles saisies dans « Gestion des sites », sinon celles de la société. */
export function mentions(site?: SiteMentions | null) {
  const key = (site?.city || site?.name || "").trim().toLowerCase();
  return {
    address: site?.address || ADDRESSES[key] || ADDRESSES[Object.keys(ADDRESSES).find((k) => key.includes(k)) ?? ""] || "",
    rccm: site?.rccm || COMPANY.rccm,
    idNat: site?.id_nat || COMPANY.idNat,
    nif: site?.nif || COMPANY.nif,
  };
}
