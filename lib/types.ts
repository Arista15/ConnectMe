export type Profile = { id: string; email: string; full_name: string; role: "admin" | "comptable"; active: boolean };
export type Site = {
  id: string; code: string; name: string; city: string;
  sector: "services" | "btp" | "transport"; usd_cdf_rate: number; vat_rate: number;
};
export type Account = { code: string; label: string; class: number; sectors: string[] };
