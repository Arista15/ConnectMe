"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite, getOpenSites, requireAdmin } from "@/lib/session";
import { isDate, today } from "@/lib/format";

const q = (s: string) => encodeURIComponent(s);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/\s/g, "").replace(",", ".");
  return v === "" ? 0 : Number(v);
};
function done(path: string, ok: string): never {
  revalidatePath(path.split("?")[0].split("#")[0]);
  redirect(`${path}${path.includes("?") ? "&" : "?"}ok=${q(ok)}`);
}
function fail(path: string, err: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}err=${q(err)}`);
}
function back(fd: FormData, fallback: string) {
  const b = str(fd, "back");
  return b.startsWith("/espace") ? b : fallback;
}
/** Site explicite d'un formulaire (module site) : doit faire partie des sites ouverts. */
async function siteFrom(fd: FormData) {
  const id = str(fd, "site_id");
  if (!id) return getActiveSite();
  const s = (await getOpenSites()).find((x) => x.id === id);
  if (!s) redirect("/connexion-site?err=" + q("Ce site n'est pas ouvert."));
  return s;
}
type JLine = { account_code: string; label?: string; debit?: number; credit?: number };
const cleanLines = (lines: JLine[]) => lines
  .filter((l) => l.account_code && (Number(l.debit) || Number(l.credit)))
  .map((l) => ({ account_code: l.account_code, label: l.label ?? "", debit: Number(l.debit || 0), credit: Number(l.credit || 0) }));

// ---------------------------------------------------------------- Journal : modifier / supprimer
export async function updateEntry(fd: FormData) {
  const path = back(fd, "/espace/journal");
  let lines: JLine[] = [];
  try { lines = JSON.parse(str(fd, "lines")); } catch { fail(path, "Lignes illisibles."); }
  const date = str(fd, "entry_date");
  if (!isDate(date)) fail(path, "Date invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_manual_entry", {
    p_entry: str(fd, "entry_id"), p_journal: str(fd, "journal_code"), p_date: date,
    p_reference: str(fd, "reference"), p_label: str(fd, "label"), p_currency: str(fd, "currency"),
    p_lines: cleanLines(lines),
  });
  if (error) fail(path, error.message);
  done(path, "Écriture modifiée.");
}

export async function deleteEntry(fd: FormData) {
  const path = back(fd, "/espace/journal");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_manual_entry", { p_entry: str(fd, "entry_id") });
  if (error) fail(path, error.message);
  done(path, "Écriture supprimée.");
}

// ---------------------------------------------------------------- Devis
export async function createQuote(fd: FormData) {
  const site = await getActiveSite();
  const path = "/espace/devis/nouveau";
  let lines: { description: string; quantity: number; unit_price: number; account_code: string }[] = [];
  try { lines = JSON.parse(str(fd, "lines")); } catch { fail(path, "Lignes illisibles."); }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_quote", {
    p_site: site.id, p_customer: str(fd, "customer_id") || null,
    p_issue: str(fd, "issue_date") || today(), p_valid: str(fd, "due_date") || null,
    p_currency: str(fd, "currency") || "USD", p_vat_rate: num(fd, "vat_rate"),
    p_lines: lines.filter((l) => l.description && Number(l.quantity) > 0),
    p_notes: str(fd, "notes") || null,
  });
  if (error) fail(path, error.message);
  done(`/espace/devis/${data}`, "Devis enregistré (brouillon).");
}

export async function setQuoteStatus(fd: FormData) {
  const id = str(fd, "quote_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_quote_status", { p_quote: id, p_status: str(fd, "status") });
  if (error) fail(back(fd, `/espace/devis/${id}`), error.message);
  done(back(fd, `/espace/devis/${id}`), str(fd, "status") === "refuse" ? "Devis marqué refusé." : "Devis remis en brouillon.");
}

export async function deleteQuote(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_quote", { p_quote: str(fd, "quote_id") });
  if (error) fail(back(fd, "/espace/factures-clients?onglet=devis"), error.message);
  done("/espace/factures-clients?onglet=devis", "Devis supprimé.");
}

export async function convertQuote(fd: FormData) {
  const id = str(fd, "quote_id");
  const issue = str(fd, "issue_date") || today();
  const due = str(fd, "due_date") || new Date(new Date(issue).getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_quote", { p_quote: id, p_issue: issue, p_due: due });
  if (error) fail(back(fd, `/espace/devis/${id}`), error.message);
  done(`/espace/factures-clients/${data}`, "Facture créée depuis le devis et comptabilisée.");
}

// ---------------------------------------------------------------- Acomptes clients
export async function recordAdvance(fd: FormData) {
  const site = await siteFrom(fd);
  const path = back(fd, "/espace/factures-clients?onglet=acomptes");
  const amount = num(fd, "amount");
  if (!(amount > 0)) fail(path, "Montant invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_customer_advance", {
    p_site: site.id, p_customer: str(fd, "customer_id"), p_date: str(fd, "payment_date") || today(),
    p_amount: amount, p_treasury: str(fd, "treasury_account_id"), p_reference: str(fd, "reference"),
  });
  if (error) fail(path, error.message);
  done(path, "Acompte enregistré (compte 4191).");
}

export async function deleteAdvance(fd: FormData) {
  const path = back(fd, "/espace/factures-clients?onglet=acomptes");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_customer_advance", { p_advance: str(fd, "advance_id") });
  if (error) fail(path, error.message);
  done(path, "Acompte supprimé avec son écriture.");
}

export async function applyAdvance(fd: FormData) {
  const path = back(fd, "/espace/factures-clients");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_customer_advance", {
    p_advance: str(fd, "advance_id"), p_invoice: str(fd, "invoice_id"), p_date: today(),
  });
  if (error) fail(path, error.message);
  done(path, `Acompte imputé : ${Number(data).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}.`);
}

export async function cancelApplication(fd: FormData) {
  const path = back(fd, "/espace/factures-clients");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_advance_application", { p_application: str(fd, "application_id") });
  if (error) fail(path, error.message);
  done(path, "Imputation retirée : l'acompte redevient disponible.");
}

// ---------------------------------------------------------------- Comptes par secteur (admin)
export async function addSectorAccount(fd: FormData) {
  await requireAdmin();
  const path = "/espace/comptes-secteurs";
  const code = str(fd, "account_code");
  if (!code) fail(path, "Choisissez un compte.");
  const supabase = await createClient();
  const { error } = await supabase.from("sector_accounts").insert({ sector: str(fd, "sector"), account_code: code, usage: str(fd, "usage") || null });
  if (error) fail(path, error.code === "23505" ? "Ce compte est déjà dans ce secteur." : error.message);
  done(path, "Compte ajouté.");
}

export async function updateSectorUsage(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("sector_accounts").update({ usage: str(fd, "usage") || null }).eq("id", Number(str(fd, "id")));
  if (error) fail("/espace/comptes-secteurs", error.message);
  done("/espace/comptes-secteurs", "Usage mis à jour.");
}

export async function removeSectorAccount(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("sector_accounts").delete().eq("id", Number(str(fd, "id")));
  if (error) fail("/espace/comptes-secteurs", error.message);
  done("/espace/comptes-secteurs", "Compte retiré du secteur.");
}

// ---------------------------------------------------------------- Sites : mentions & taux
export async function saveSiteMentions(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_site_mentions", {
    p_site: str(fd, "site_id"), p_address: str(fd, "address"), p_rccm: str(fd, "rccm"),
    p_id_nat: str(fd, "id_nat"), p_nif: str(fd, "nif"),
  });
  if (error) fail("/espace/admin/sites", error.message);
  done("/espace/admin/sites", "Mentions enregistrées.");
}

export async function setRateForSite(fd: FormData) {
  const site = await siteFrom(fd);
  const path = back(fd, `/espace/site/${site.id}`);
  const rate = num(fd, "rate");
  if (!(rate > 0)) fail(path, "Taux invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_site_rate", { p_site: site.id, p_rate: rate });
  if (error) fail(path, error.message);
  revalidatePath("/espace", "layout");
  done(path, `Taux du site enregistré : 1 USD = ${rate} FC.`);
}

// ---------------------------------------------------------------- Saisie rapide (module site)
export async function quickSupplierInvoice(fd: FormData) {
  const site = await siteFrom(fd);
  const path = `/espace/site/${site.id}/saisie`;
  const supabase = await createClient();
  const amount = num(fd, "amount"), tax = num(fd, "tax");
  if (!str(fd, "description") || !(amount > 0)) fail(path, "Libellé et montant obligatoires.");
  let supplierId = str(fd, "supplier_id") || null;
  let supplierName = str(fd, "new_supplier");
  if (!supplierId && supplierName) {
    const { data, error } = await supabase.from("suppliers").insert({ site_id: site.id, name: supplierName }).select("id").single();
    if (error) fail(path, error.message);
    supplierId = data.id;
  }
  if (supplierId && !supplierName) {
    const { data } = await supabase.from("suppliers").select("name").eq("id", supplierId).maybeSingle();
    supplierName = data?.name ?? "";
  }
  const date = str(fd, "date") || today();
  const { data: id, error } = await supabase.rpc("create_supplier_invoice", {
    p_site: site.id, p_supplier: supplierId, p_supplier_name: supplierName || str(fd, "description"),
    p_reference: str(fd, "ref"), p_date: date, p_due: str(fd, "due") || null, p_currency: str(fd, "currency") || "USD",
    p_subtotal: amount, p_vat: tax, p_total: amount + tax, p_account: str(fd, "account"),
    p_source_text: str(fd, "description"), p_attachment: null, p_ai: null,
  });
  if (error) fail(path, error.message);
  const { error: e2 } = await supabase.rpc("validate_supplier_invoice", {
    p_invoice: id, p_supplier: supplierId, p_reference: str(fd, "ref"), p_date: date, p_due: str(fd, "due") || null,
    p_account: str(fd, "account"), p_subtotal: amount, p_vat: tax,
  });
  if (e2) fail(path, e2.message);
  done(path, "Facture enregistrée et écriture passée au journal.");
}

const DEFAULT_REVENUE: Record<string, string> = { services: "706", btp: "705", transport: "7061" };

export async function quickCustomerInvoice(fd: FormData) {
  const site = await siteFrom(fd);
  const path = `/espace/site/${site.id}/saisie-clients`;
  const supabase = await createClient();
  const amount = num(fd, "amount");
  const date = str(fd, "date") || today();
  const due = str(fd, "due") || new Date(new Date(date).getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  if (!str(fd, "description") || !(amount > 0)) fail(path, "Libellé et montant obligatoires.");
  if (due < date) fail(path, "L'échéance doit être après la date de facture.");
  let customerId = str(fd, "client_id") || null;
  const newName = str(fd, "new_client");
  if (!customerId) {
    if (!newName) fail(path, "Choisissez un client ou saisissez un nouveau client.");
    const { data, error } = await supabase.from("customers").insert({ site_id: site.id, name: newName.slice(0, 200) }).select("id").single();
    if (error) fail(path, error.message);
    customerId = data.id;
  }
  const { error } = await supabase.rpc("create_customer_invoice", {
    p_site: site.id, p_customer: customerId, p_issue: date, p_due: due, p_currency: str(fd, "currency") || "USD",
    p_vat_rate: num(fd, "tax_rate"),
    p_lines: [{ description: str(fd, "description").slice(0, 500), quantity: 1, unit_price: amount, account_code: str(fd, "account") || DEFAULT_REVENUE[site.sector] }],
    p_notes: null,
  });
  if (error) fail(path, error.message);
  done(path, "Facture client enregistrée et écriture passée au journal.");
}
