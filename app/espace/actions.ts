"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveSite } from "@/lib/session";
import { isDate, today } from "@/lib/format";

const q = (s: string) => encodeURIComponent(s);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numOrNull = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/\s/g, "").replace(",", ".");
  return v === "" ? null : Number(v);
};
const uuidOrNull = (fd: FormData, k: string) => str(fd, k) || null;

function done(path: string, ok: string): never {
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${path.includes("?") ? "&" : "?"}ok=${q(ok)}`);
}
function fail(path: string, err: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}err=${q(err)}`);
}
function backPath(fd: FormData, fallback: string) {
  const b = str(fd, "back");
  return b.startsWith("/espace") ? b : fallback;
}

// ---------------------------------------------------------------- Taux
export async function updateRate(fd: FormData) {
  const site = await getActiveSite();
  const rate = numOrNull(fd, "rate");
  if (!rate || rate <= 0) fail("/espace", "Taux invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_site_rate", { p_site: site.id, p_rate: rate });
  if (error) fail("/espace", error.message);
  revalidatePath("/espace", "layout");
  done("/espace", `Taux du site ${site.code} mis à jour : 1 USD = ${rate} CDF.`);
}

// ---------------------------------------------------------------- Journal
type EntryLine = { account_code: string; label?: string; debit?: number; credit?: number };

export async function postEntry(fd: FormData) {
  const site = await getActiveSite();
  let lines: EntryLine[];
  try {
    lines = JSON.parse(str(fd, "lines"));
  } catch {
    fail("/espace/journal", "Lignes illisibles.");
  }
  const date = str(fd, "entry_date");
  if (!isDate(date)) fail("/espace/journal", "Date invalide.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_manual_entry", {
    p_site: site.id,
    p_journal: str(fd, "journal_code"),
    p_date: date,
    p_reference: str(fd, "reference"),
    p_label: str(fd, "label"),
    p_currency: str(fd, "currency"),
    p_lines: lines.map((l) => ({
      account_code: l.account_code, label: l.label ?? "",
      debit: Number(l.debit || 0), credit: Number(l.credit || 0),
    })),
  });
  if (error) fail("/espace/journal", error.message);
  done("/espace/journal", "Écriture comptabilisée.");
}

export async function reverseEntry(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_entry", { p_entry: str(fd, "entry_id"), p_date: str(fd, "date") || today() });
  const back = backPath(fd, "/espace/journal");
  if (error) fail(back, error.message);
  done(back, "Écriture contre-passée.");
}

// ---------------------------------------------------------------- Tiers
export async function saveCustomer(fd: FormData) {
  const site = await getActiveSite();
  const supabase = await createClient();
  const row = {
    site_id: site.id, name: str(fd, "name"), email: str(fd, "email") || null,
    phone: str(fd, "phone") || null, address: str(fd, "address") || null, tax_id: str(fd, "tax_id") || null,
  };
  if (!row.name) fail("/espace/tiers", "Nom requis.");
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("customers").update(row).eq("id", id)
    : await supabase.from("customers").insert(row);
  if (error) fail("/espace/tiers", error.message);
  done(backPath(fd, "/espace/tiers"), `Client « ${row.name} » enregistré.`);
}

export async function saveSupplier(fd: FormData) {
  const site = await getActiveSite();
  const supabase = await createClient();
  const row = {
    site_id: site.id, name: str(fd, "name"), email: str(fd, "email") || null,
    phone: str(fd, "phone") || null, tax_id: str(fd, "tax_id") || null,
    default_account: str(fd, "default_account") || null,
  };
  if (!row.name) fail("/espace/tiers", "Nom requis.");
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id)
    : await supabase.from("suppliers").insert(row);
  if (error) fail("/espace/tiers", error.message);
  done(backPath(fd, "/espace/tiers"), `Fournisseur « ${row.name} » enregistré.`);
}

// ---------------------------------------------------------------- Factures clients
export async function createCustomerInvoice(fd: FormData) {
  const site = await getActiveSite();
  let lines: { description: string; quantity: number; unit_price: number; account_code: string }[];
  try {
    lines = JSON.parse(str(fd, "lines"));
  } catch {
    fail("/espace/factures-clients/nouvelle", "Lignes illisibles.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_customer_invoice", {
    p_site: site.id,
    p_customer: str(fd, "customer_id"),
    p_issue: str(fd, "issue_date"),
    p_due: str(fd, "due_date"),
    p_currency: str(fd, "currency"),
    p_vat_rate: numOrNull(fd, "vat_rate") ?? 0,
    p_lines: lines.filter((l) => l.description && Number(l.quantity) > 0),
    p_notes: str(fd, "notes") || null,
  });
  if (error) fail("/espace/factures-clients/nouvelle", error.message);
  done(`/espace/factures-clients/${data}`, "Facture émise et comptabilisée.");
}

export async function cancelCustomerInvoice(fd: FormData) {
  const id = str(fd, "invoice_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_customer_invoice", { p_invoice: id, p_date: str(fd, "date") || today() });
  if (error) fail(`/espace/factures-clients/${id}`, error.message);
  done(`/espace/factures-clients/${id}`, "Facture annulée (écriture inverse passée).");
}

// ---------------------------------------------------------------- Factures fournisseurs
export async function createSupplierInvoice(fd: FormData) {
  const site = await getActiveSite();
  const supabase = await createClient();
  let ai: unknown = null;
  try { ai = str(fd, "ai") ? JSON.parse(str(fd, "ai")) : null; } catch { ai = null; }
  const { data, error } = await supabase.rpc("create_supplier_invoice", {
    p_site: site.id,
    p_supplier: uuidOrNull(fd, "supplier_id"),
    p_supplier_name: str(fd, "supplier_name"),
    p_reference: str(fd, "reference"),
    p_date: str(fd, "invoice_date") || today(),
    p_due: str(fd, "due_date") || null,
    p_currency: str(fd, "currency") || "USD",
    p_subtotal: numOrNull(fd, "subtotal") ?? 0,
    p_vat: numOrNull(fd, "vat_amount") ?? 0,
    p_total: numOrNull(fd, "total") ?? 0,
    p_account: str(fd, "expense_account") || null,
    p_source_text: str(fd, "source_text") || null,
    p_attachment: str(fd, "attachment_path") || null,
    p_ai: ai,
  });
  if (error) fail("/espace/factures-fournisseurs/nouvelle", error.message);
  done(`/espace/factures-fournisseurs/${data}`, "Reçu enregistré. Vérifiez puis validez la comptabilisation.");
}

export async function validateSupplierInvoice(fd: FormData) {
  const id = str(fd, "invoice_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("validate_supplier_invoice", {
    p_invoice: id,
    p_supplier: uuidOrNull(fd, "supplier_id"),
    p_reference: str(fd, "reference"),
    p_date: str(fd, "invoice_date"),
    p_due: str(fd, "due_date") || null,
    p_account: str(fd, "expense_account"),
    p_subtotal: numOrNull(fd, "subtotal") ?? 0,
    p_vat: numOrNull(fd, "vat_amount") ?? 0,
  });
  if (error) fail(`/espace/factures-fournisseurs/${id}`, error.message);
  done(`/espace/factures-fournisseurs/${id}`, "Facture validée et comptabilisée au journal des achats.");
}

export async function rejectSupplierInvoice(fd: FormData) {
  const id = str(fd, "invoice_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_supplier_invoice", { p_invoice: id });
  if (error) fail(`/espace/factures-fournisseurs/${id}`, error.message);
  done("/espace/factures-fournisseurs", "Reçu rejeté.");
}

// ---------------------------------------------------------------- Paiements
export async function recordPayment(fd: FormData) {
  const site = await getActiveSite();
  const back = backPath(fd, "/espace/tresorerie");
  const supabase = await createClient();
  const kind = str(fd, "kind");
  const amount = numOrNull(fd, "amount");
  if (!amount || amount <= 0) fail(back, "Montant invalide.");
  // Pour un règlement, la devise est celle de la facture
  let currency = str(fd, "currency");
  if (!currency && kind === "reglement_client") {
    const { data } = await supabase.from("customer_invoices").select("currency").eq("id", str(fd, "customer_invoice_id")).maybeSingle();
    currency = data?.currency ?? "";
  } else if (!currency && kind === "reglement_fournisseur") {
    const { data } = await supabase.from("supplier_invoices").select("currency").eq("id", str(fd, "supplier_invoice_id")).maybeSingle();
    currency = data?.currency ?? "";
  }
  if (!currency) {
    // Dépense / recette : devise de la caisse ou banque choisie
    const { data } = await supabase.from("treasury_accounts").select("currency").eq("id", str(fd, "treasury_account_id")).maybeSingle();
    currency = data?.currency ?? "USD";
  }
  const { error } = await supabase.rpc("record_payment", {
    p_site: site.id,
    p_kind: kind,
    p_date: str(fd, "payment_date") || today(),
    p_amount: amount,
    p_vat: numOrNull(fd, "vat_amount") ?? 0,
    p_currency: currency,
    p_treasury: str(fd, "treasury_account_id"),
    p_customer_invoice: uuidOrNull(fd, "customer_invoice_id"),
    p_supplier_invoice: uuidOrNull(fd, "supplier_invoice_id"),
    p_supplier: uuidOrNull(fd, "supplier_id"),
    p_counterpart: str(fd, "counterpart_account") || null,
    p_label: str(fd, "label"),
    p_reference: str(fd, "reference"),
  });
  if (error) fail(back, error.message);
  const labels: Record<string, string> = {
    reglement_client: "Règlement client enregistré.",
    reglement_fournisseur: "Règlement fournisseur enregistré.",
    depense: "Dépense comptabilisée.",
    recette: "Recette comptabilisée.",
  };
  done(back, labels[kind] ?? "Paiement enregistré.");
}

export async function toggleReconciled(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_payment_reconciled", {
    p_payment: str(fd, "payment_id"), p_value: str(fd, "value") === "1",
  });
  const back = backPath(fd, "/espace/tresorerie");
  if (error) fail(back, error.message);
  revalidatePath("/espace/tresorerie");
  redirect(back);
}

export async function saveTreasuryAccount(fd: FormData) {
  const site = await getActiveSite();
  const supabase = await createClient();
  const { error } = await supabase.from("treasury_accounts").insert({
    site_id: site.id, name: str(fd, "name"), kind: str(fd, "kind"),
    account_code: str(fd, "account_code"), currency: str(fd, "currency"),
  });
  if (error) fail("/espace/tresorerie", error.message);
  done("/espace/tresorerie", "Compte de trésorerie ajouté.");
}
