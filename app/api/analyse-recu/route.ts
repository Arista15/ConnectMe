import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SITE_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Analyse d'un reçu fournisseur (photo, PDF ou texte) :
 * 1. stocke la pièce dans le bucket privé « pieces » (RLS : site ouvert uniquement) ;
 * 2. demande à Claude d'extraire les montants et de proposer un compte de charge
 *    parmi le plan comptable du site. Rien n'est comptabilisé ici.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const siteId = (await cookies()).get(SITE_COOKIE)?.value;
  if (!siteId) return NextResponse.json({ error: "Aucun site ouvert" }, { status: 400 });
  const { data: allowed } = await supabase.rpc("has_site_access", { p_site: siteId });
  if (!allowed) return NextResponse.json({ error: "Session de site expirée : rouvrez le site." }, { status: 403 });
  const { data: site } = await supabase.from("sites").select("code, name, sector, vat_rate").eq("id", siteId).single();

  const form = await req.formData();
  const text = String(form.get("text") ?? "").slice(0, 20000).trim();
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !text) return NextResponse.json({ error: "Joignez une photo/PDF ou collez le texte du reçu." }, { status: 400 });

  let attachmentPath: string | null = null;
  const content: unknown[] = [];

  if (hasFile) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop lourd (8 Mo max.)" }, { status: 400 });
    const isPdf = file.type === "application/pdf";
    if (!isPdf && !IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Formats acceptés : JPEG, PNG, WebP ou PDF." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = isPdf ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
    attachmentPath = `${siteId}/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("pieces").upload(attachmentPath, bytes, { contentType: file.type });
    if (up.error) return NextResponse.json({ error: `Dépôt de la pièce impossible : ${up.error.message}` }, { status: 500 });
    content.push(
      isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
        : { type: "image", source: { type: "base64", media_type: file.type, data: bytes.toString("base64") } },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // Sans clé API : la pièce est stockée, la saisie se fait à la main.
    return NextResponse.json({
      attachment_path: attachmentPath,
      suggestion: { notes: "Analyse automatique non configurée (ANTHROPIC_API_KEY manquante) : complétez les champs." },
    });
  }

  const { data: accounts } = await supabase.from("accounts").select("code, label, class, sectors").in("class", [2, 6]).eq("active", true).order("code");
  const list = (accounts ?? [])
    .map((a) => `${a.code} ${a.label}${a.sectors.includes(site?.sector) ? " [secteur]" : ""}`)
    .join("\n");

  const instructions = `Tu es l'assistant d'un comptable en RDC (référentiel SYSCOHADA révisé). Site : ${site?.name} (${site?.code}), secteur « ${site?.sector} », TVA usuelle ${site?.vat_rate} %.
Analyse le reçu ou la facture fournisseur fourni(e) et réponds UNIQUEMENT par un objet JSON, sans texte autour, avec les clés :
supplier_name (string), reference (string, numéro de facture/reçu ou ""), invoice_date (AAAA-MM-JJ), due_date (AAAA-MM-JJ ou null),
currency ("USD" ou "CDF" ; FC, Fc, CDF = "CDF" ; $ ou USD = "USD"), subtotal (nombre HT), vat_amount (nombre, 0 si pas de TVA visible), total (nombre TTC),
account_code (le compte le plus adapté, choisi STRICTEMENT dans la liste ci-dessous ; privilégie les comptes marqués [secteur]),
account_reason (une phrase en français expliquant le choix), confidence (0 à 1), notes (string : anomalies, illisibilités, ou "").
Si subtotal n'est pas indiqué, déduis-le : subtotal = total - vat_amount. N'invente aucune donnée illisible : mets "" ou null et baisse la confidence.

Comptes autorisés :
${list}`;

  content.push({ type: "text", text: text ? `${instructions}\n\nTexte du reçu :\n${text}` : instructions });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("Analyse reçu :", res.status, detail);
    return NextResponse.json({ attachment_path: attachmentPath, error: "Le service d'analyse n'a pas répondu. Complétez les champs à la main." }, { status: 502 });
  }
  const data = await res.json();
  const raw: string = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  let suggestion: Record<string, unknown> = {};
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    suggestion = m ? JSON.parse(m[0]) : {};
  } catch {
    suggestion = { notes: "Réponse d'analyse illisible : complétez les champs." };
  }

  // Garde-fous : compte autorisé, devise valide, montants numériques
  const allowedCodes = new Set((accounts ?? []).map((a) => a.code));
  if (typeof suggestion.account_code !== "string" || !allowedCodes.has(suggestion.account_code)) delete suggestion.account_code;
  if (suggestion.currency !== "USD" && suggestion.currency !== "CDF") suggestion.currency = "USD";
  for (const k of ["subtotal", "vat_amount", "total"]) {
    const v = Number(suggestion[k]);
    suggestion[k] = Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
  }
  for (const k of ["invoice_date", "due_date"]) {
    if (typeof suggestion[k] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(suggestion[k] as string)) suggestion[k] = undefined;
  }

  return NextResponse.json({ attachment_path: attachmentPath, suggestion });
}
