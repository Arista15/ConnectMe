import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Guide par secteur" };

type Entry = { label: string; lines: { account: string; name: string; debit?: string; credit?: string }[]; note?: string };
type Guide = { sector: string; title: string; intro: string; entries: Entry[]; rates: [string, string][] };

const GUIDES: Guide[] = [
  {
    sector: "services", title: "Prestation de services",
    intro: "Honoraires, études, conseil, location de main-d'œuvre. Le chiffre d'affaires passe en 706 (prestations) ; les charges sont surtout des services extérieurs et du personnel.",
    entries: [
      { label: "Facture d'honoraires de 1 000 $ HT (TVA 16 %)", lines: [
        { account: "411", name: "Clients", debit: "1 160 $" }, { account: "706", name: "Prestations de services", credit: "1 000 $" }, { account: "4431", name: "TVA facturée sur ventes", credit: "160 $" }] },
      { label: "Encaissement du client par banque", lines: [
        { account: "521", name: "Banque", debit: "1 160 $" }, { account: "411", name: "Clients", credit: "1 160 $" }] },
      { label: "Paiement du loyer mensuel de 350 $", lines: [
        { account: "604", name: "Locations", debit: "350 $" }, { account: "521", name: "Banque", credit: "350 $" }],
        note: "Dépense sans TVA si le bailleur n'est pas assujetti." },
    ],
    rates: [["TVA sur prestations", "16 %"], ["Taux de change indicatif", "≈ 2 800 FC / 1 $"], ["Délai de paiement client courant", "30 jours"]],
  },
  {
    sector: "btp", title: "BTP / Construction",
    intro: "Travaux et chantiers. Les achats de matériaux vont en 602 ; les travaux facturés en 704/705 ; la variation de stocks de matériaux en 603.",
    entries: [
      { label: "Facture fournisseur : 50 sacs de ciment, 500 $ HT (TVA 16 %)", lines: [
        { account: "602", name: "Achats de matières consommables", debit: "500 $" }, { account: "4452", name: "TVA récupérable sur achats", debit: "80 $" }, { account: "401", name: "Fournisseurs", credit: "580 $" }],
        note: "Saisissez-la dans « Factures fournisseurs » : l'écriture est générée automatiquement à la validation." },
      { label: "Facturation d'une situation de travaux, 5 000 $ HT", lines: [
        { account: "411", name: "Clients", debit: "5 800 $" }, { account: "705", name: "Travaux facturés", credit: "5 000 $" }, { account: "4431", name: "TVA facturée sur ventes", credit: "800 $" }] },
      { label: "Règlement du fournisseur de ciment", lines: [
        { account: "401", name: "Fournisseurs", debit: "580 $" }, { account: "521", name: "Banque", credit: "580 $" }] },
    ],
    rates: [["TVA sur travaux et matériaux", "16 %"], ["Retenue à la source fréquente", "5 – 10 % du marché"], ["Taux de change indicatif", "≈ 2 800 FC / 1 $"]],
  },
  {
    sector: "transport", title: "Transport / Logistique",
    intro: "Fret et logistique. Le carburant est la première charge ; les recettes de transport passent en 706 ; l'entretien des véhicules en 624.",
    entries: [
      { label: "Achat de carburant, 200 $ en espèces", lines: [
        { account: "605", name: "Carburant", debit: "200 $" }, { account: "571", name: "Caisse", credit: "200 $" }],
        note: "Photographiez le reçu dans « Dépenses » : l'analyse pré-remplit le fournisseur, la date et le montant." },
      { label: "Facture de fret à un client, 800 $ HT (TVA 16 %)", lines: [
        { account: "411", name: "Clients", debit: "928 $" }, { account: "706", name: "Prestations de services", credit: "800 $" }, { account: "4431", name: "TVA facturée sur ventes", credit: "128 $" }] },
      { label: "Réparation d'un camion chez le garage, 450 $ HT", lines: [
        { account: "624", name: "Entretien des biens", debit: "450 $" }, { account: "4452", name: "TVA récupérable sur achats", debit: "72 $" }, { account: "401", name: "Fournisseurs", credit: "522 $" }] },
    ],
    rates: [["TVA sur le fret", "16 %"], ["Carburant (part des charges)", "30 – 40 %"], ["Taux de change indicatif", "≈ 2 800 FC / 1 $"]],
  },
];

export default async function SectorGuide() {
  const supabase = await createClient();
  const { data: sa } = await supabase.from("sector_accounts").select("sector, account_code, usage, accounts(label)").order("account_code");

  return (
    <div style={{ maxWidth: "64rem" }}>
      <PageHeader title="Guide par secteur" subtitle="Exemples d'écritures et taux typiques pour aider les comptables de chaque secteur. Les montants sont des exemples." />
      {GUIDES.map((g) => (
        <section key={g.sector} style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.25rem" }}>{g.title}</h2>
          <p className="small muted" style={{ maxWidth: "48rem", marginBottom: "1rem" }}>{g.intro}</p>

          <Panel>
            <div className="panel-strip xs fw-600 t-muted" style={{ textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid var(--border)" }}>
              <span>Comptes du secteur <Link href="/espace/comptes-secteurs" style={{ textTransform: "none", marginLeft: 8 }}>Gérer →</Link></span>
            </div>
            <table>
              <tbody>
                {(sa ?? []).filter((a) => a.sector === g.sector).map((a) => (
                  <tr key={a.account_code}>
                    <td className="mono fw-500" style={{ width: 80 }}>{a.account_code}</td>
                    <td>{(a.accounts as unknown as { label: string } | null)?.label}</td>
                    <td className="t-muted">{a.usage}</td>
                  </tr>
                ))}
                {(sa ?? []).filter((a) => a.sector === g.sector).length === 0 && <tr><td className="t-muted">Aucun compte défini.</td></tr>}
              </tbody>
            </table>
          </Panel>

          <div className="cols-2">
            {g.entries.map((e) => (
              <Panel key={e.label} title={<span className="fw-500" style={{ fontWeight: 500 }}>{e.label}</span>}>
                <table>
                  <thead><tr><th>Compte</th><th>Intitulé</th><th className="num">Débit</th><th className="num">Crédit</th></tr></thead>
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i}><td className="mono">{l.account}</td><td>{l.name}</td><td className="mono">{l.debit ?? ""}</td><td className="mono">{l.credit ?? ""}</td></tr>
                    ))}
                  </tbody>
                </table>
                {e.note && <div className="panel-foot xs t-muted">{e.note}</div>}
              </Panel>
            ))}
          </div>

          <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 2rem", padding: "0.75rem 1rem", marginTop: "1.5rem" }}>
            {g.rates.map(([l, v]) => (
              <div key={l} className="small"><span className="t-muted">{l} : </span><span className="num fw-500">{v}</span></div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
