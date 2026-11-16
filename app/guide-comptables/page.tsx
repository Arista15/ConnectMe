import Link from "next/link";
import PublicShell from "@/components/PublicShell";

export const metadata = { title: "Guide des comptables" };

const steps: [string, string][] = [
  ["1. Activer votre compte", "Ouvrez le lien d'invitation reçu par e-mail et choisissez votre mot de passe personnel (10 caractères minimum). Il n'y a pas d'inscription libre."],
  ["2. Ouvrir un site", "Connectez-vous, puis saisissez le code d'accès du site communiqué par l'administrateur. L'accès dure 12 heures ou jusqu'à la déconnexion. Après 5 codes erronés, le site est bloqué 15 minutes."],
  ["3. Vérifier le taux du jour", "Chaque site a son propre taux USD/CDF, affiché en haut de l'écran. Mettez-le à jour avant de saisir : il s'applique aux nouveaux documents, les documents passés gardent leur taux historique."],
  ["4. Saisir", "Factures clients, reçus fournisseurs, dépenses et recettes génèrent leurs écritures automatiquement. Les opérations diverses se saisissent dans le journal, en partant si besoin d'une écriture type de votre secteur."],
  ["5. Valider les reçus fournisseurs", "Photographiez ou collez le reçu : l'analyse propose le fournisseur, les montants et un compte de charge. Rien n'est comptabilisé avant votre validation ; corrigez le compte si nécessaire."],
  ["6. Rapprocher la trésorerie", "Dans Caisse & banque, cochez les mouvements retrouvés sur le relevé bancaire ou dans le brouillard de caisse. Les soldes non rapprochés restent visibles."],
  ["7. Clôturer le mois", "Contrôlez la balance (débit = crédit), puis imprimez le rapport mensuel en PDF depuis États financiers → Rapport mensuel."],
];

const rules: [string, string][] = [
  ["Pièce justificative", "Chaque écriture porte une référence de pièce (numéro de facture, reçu, relevé)."],
  ["Corrections", "Une écriture comptabilisée ne se modifie pas : on la contre-passe puis on ressaisit. Une facture client non réglée s'annule par une écriture inverse."],
  ["Devises", "Les montants sont saisis dans la devise du document. Les états sont présentés en USD (contre-valeur au taux historique). Les écarts de change sur règlements vont en 676 / 776."],
  ["TVA", "TVA facturée : 4431. TVA récupérable sur achats : 4452. Le taux par défaut du site est modifiable par l'administrateur."],
  ["Audit", "Chaque comptabilisation est tracée : auteur, date, site, comptes mouvementés."],
];

const sectors: [string, string, [string, string][]][] = [
  ["Services", "var(--primary)", [["706", "Honoraires"], ["632", "Honoraires versés"], ["622", "Loyers"], ["628", "Télécoms"], ["6055", "Fournitures de bureau"]]],
  ["BTP", "var(--brass)", [["705", "Travaux facturés"], ["4117", "Retenues de garantie"], ["6021", "Matériaux"], ["6224", "Location d'engins"], ["637", "Main-d'œuvre"]]],
  ["Transport", "var(--success)", [["7061", "Fret"], ["6053", "Carburant"], ["6242", "Entretien camions"], ["6252", "Assurances"], ["618", "Péages et frais de route"]]],
];

export default function GuidePage() {
  return (
    <PublicShell>
      <div className="wrap" style={{ maxWidth: "48rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <img src="/kbs-logo.png" alt="Logo KBS" width={56} height={56} style={{ borderRadius: 6 }} />
          <h1 style={{ margin: 0 }}>Guide du nouveau comptable</h1>
        </div>
        <p className="muted">Les étapes pour tenir la comptabilité d&apos;un site dans KBS Comptable (référentiel SYSCOHADA révisé).</p>

        <h2>Au quotidien</h2>
        {steps.map(([t, d]) => (
          <section className="card" key={t} style={{ padding: "1rem" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "0.9375rem" }}>{t}</h3>
            <p className="small muted" style={{ marginBottom: 0 }}>{d}</p>
          </section>
        ))}

        <h2>Règles de tenue</h2>
        <section className="panel">
          <table>
            <tbody>
              {rules.map(([t, d]) => (
                <tr key={t}><th style={{ width: 180 }}>{t}</th><td className="small">{d}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <h2>Comptes les plus utilisés</h2>
        <div className="sector-grid" style={{ marginTop: 0 }}>
          {sectors.map(([name, color, acc]) => (
            <article className="sector" key={name}>
              <div className="bar" style={{ background: color }} />
              <h3>{name}</h3>
              <ul>{acc.map(([c, l]) => <li key={c}><span className="chip">{c}</span><span>{l}</span></li>)}</ul>
            </article>
          ))}
        </div>

        <div className="auth-links" style={{ marginTop: "2rem" }}>
          <Link href="/auth">Connexion</Link>
          <Link href="/connexion-site">Connexion à un site</Link>
        </div>
      </div>
    </PublicShell>
  );
}
