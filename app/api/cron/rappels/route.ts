import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Inv = {
  kind: "client" | "fournisseur"; site_id: string; label: string; party: string;
  due_date: string; remaining: number; currency: string;
};

const fmt = (n: number, c: string) =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${c === "CDF" ? "FC" : "$"}`;
const fr = (d: string) => d.split("-").reverse().join("/");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Rappel quotidien (Vercel Cron, 7 h à Lubumbashi) : factures en retard et à échéance sous 7 jours,
 * envoyé à chaque administrateur et à chaque comptable pour ses sites.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const db = createAdminClient();
  const today = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + (2 + 7 * 24) * 3600_000).toISOString().slice(0, 10);

  const [{ data: sites }, { data: cust }, { data: sup }, { data: profiles }, { data: assignments }] = await Promise.all([
    db.from("sites").select("id, code, name"),
    db.from("customer_invoices").select("site_id, number, due_date, total, amount_paid, currency, customers(name)")
      .in("status", ["emise", "partielle"]).lte("due_date", horizon),
    db.from("supplier_invoices").select("site_id, supplier_name, reference, due_date, total, amount_paid, currency")
      .in("status", ["validee", "partielle"]).not("due_date", "is", null).lte("due_date", horizon),
    db.from("profiles").select("id, email, full_name, role").eq("active", true),
    db.from("site_assignments").select("user_id, site_id"),
  ]);

  const items: Inv[] = [
    ...(cust ?? []).map((i) => ({
      kind: "client" as const, site_id: i.site_id, label: i.number,
      party: (Array.isArray(i.customers) ? i.customers[0]?.name : (i.customers as { name?: string } | null)?.name) ?? "",
      due_date: i.due_date, remaining: Number(i.total) - Number(i.amount_paid), currency: i.currency,
    })),
    ...(sup ?? []).map((i) => ({
      kind: "fournisseur" as const, site_id: i.site_id, label: i.reference || "(sans réf.)", party: i.supplier_name,
      due_date: i.due_date as string, remaining: Number(i.total) - Number(i.amount_paid), currency: i.currency,
    })),
  ].sort((a, b) => a.due_date.localeCompare(b.due_date));

  const siteName = new Map((sites ?? []).map((s) => [s.id, `${s.code} – ${s.name}`]));
  let sent = 0;
  const errors: string[] = [];

  for (const p of profiles ?? []) {
    const mySites = p.role === "admin"
      ? new Set((sites ?? []).map((s) => s.id))
      : new Set((assignments ?? []).filter((a) => a.user_id === p.id).map((a) => a.site_id));
    const mine = items.filter((i) => mySites.has(i.site_id));
    if (mine.length === 0) continue;
    const late = mine.filter((i) => i.due_date < today);
    const soon = mine.filter((i) => i.due_date >= today);

    const table = (rows: Inv[]) => rows.length === 0 ? "<p>Aucune.</p>" : `
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
        <tr style="background:#f3f5f8"><th align="left">Site</th><th align="left">Type</th><th align="left">Pièce</th><th align="left">Tiers</th><th align="left">Échéance</th><th align="right">Reste dû</th></tr>
        ${rows.map((r) => `<tr style="border-top:1px solid #e2e6eb">
          <td>${esc(siteName.get(r.site_id) ?? "")}</td><td>${r.kind === "client" ? "À encaisser" : "À payer"}</td>
          <td>${esc(r.label)}</td><td>${esc(r.party)}</td><td>${fr(r.due_date)}</td><td align="right">${fmt(r.remaining, r.currency)}</td></tr>`).join("")}
      </table>`;

    const html = `<div style="font-family:Arial,sans-serif;color:#1c2430">
      <h2 style="color:#0f2a44">KBS Comptable – rappel du ${fr(today)}</h2>
      <p>Bonjour ${esc(p.full_name || "")},</p>
      <h3 style="color:#b42318">En retard (${late.length})</h3>${table(late)}
      <h3 style="color:#8a5a00">À échéance dans les 7 jours (${soon.length})</h3>${table(soon)}
      <p style="margin-top:20px"><a href="${process.env.NEXT_PUBLIC_SITE_URL}/connexion-site">Ouvrir KBS Comptable</a></p>
      <p style="color:#5d6b7a;font-size:12px">Message automatique quotidien – Kafaus Business Service SARL.</p></div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [p.email],
        subject: `KBS Comptable : ${late.length} facture(s) en retard, ${soon.length} à échéance sous 7 jours`,
        html,
      }),
    });
    if (r.ok) sent++;
    else errors.push(`${p.email}: ${r.status}`);
  }

  await db.from("reminder_runs").insert({ sent, details: { items: items.length, errors } });
  return NextResponse.json({ sent, items: items.length, errors });
}
