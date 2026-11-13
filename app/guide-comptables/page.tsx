import PublicShell from "@/components/PublicShell";

export const metadata = { title: "Guide des comptables" };

const steps: [string, string][] = [
  ["1. Activer votre compte", "Ouvrez le lien d'invitation reçu par e-mail et choisissez votre mot de passe personnel (10 caractères minimum). Il n'y a pas d'inscription libre."],
  ["2. Ouvrir un site", "Connectez-vous, puis saisissez le code d'accès du site communiqué par l'administrateur. L'accès dure 12 heures ou jusqu'à la déconnexion. Après 5 codes erronés, le site est bloqué 15 minutes."],
  ["3. Vérifier le taux du jour", "Chaque site a son propre taux USD/CDF, affiché en haut de l'écran. Mettez-le à jour avant de saisir : il s'applique aux nouveaux documents, les documents passés gardent leur taux historique."],
  ["4. Saisir", "Factures clients, reçus fournisseurs, dépenses et recettes génèrent leurs écritures automatiquement. Les opérations diverses se saisissent dans le journal, en partant si besoin d'une écriture type de votre secteur."],
  ["5. Valider les reçus fournisseurs", "Photographiez ou collez le reçu : l'analyse propose le fournisseur, les montants et un compte de charge. Rien n'est comptabilisé avant votre validation ; corrigez le compte si nécessaire."],
  ["6. Rapprocher la trésorerie", "Dans Trésorerie, cochez les mouvements retrouvés sur le relevé bancaire ou dans le brouillard de caisse. Les soldes non rapprochés restent visibles."],
  ["7. Clôturer le mois", "Contrôlez la balance (débit = crédit), puis imprimez le rapport mensuel en PDF depuis États financiers → Rapport mensuel."],
];

const rules: [string, string][] = [
  ["Pièce justificative", "Chaque écriture porte une référence de pièce (numéro de facture, reçu, relevé)."],
  ["Corrections", "Une écriture comptabilisée ne se modifie pas : on la contre-passe puis on ressaisit. Une facture client non réglée s'annule par une écriture inverse."],
  ["Devises", "Les montants sont saisis dans la devise du document. Les états sont présentés en USD (contre-valeur au taux historique). Les écarts de change sur règlements vont en 676 / 776."],
  ["TVA", "TVA facturée : 4431. TVA récupérable sur achats : 4452. Le taux par défaut du site est modifiable par l'administrateur."],
  ["Audit", "Chaque comptabilisation est tracée : auteur, date, site, comptes mouvementés."],
];

export default function GuidePage() {
  return (
    <PublicShell>
      <div className="container" style={{ padding: "2rem 1.5rem", maxWidth: 900 }}>
        <h1>Guide des comptables</h1>
        <p className="muted">Les étapes pour tenir la comptabilité d'un site dans KBS Comptable (référentiel SYSCOHADA révisé).</p>
        <h2>Au quotidien</h2>
        {steps.map(([t, d]) => (
          <div className="card" key={t}>
            <h3 style={{ marginTop: 0 }}>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
        <h2>Règles de tenue</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              {rules.map(([t, d]) => (
                <tr key={t}><th style={{ width: 200 }}>{t}</th><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>Comptes les plus utilisés</h2>
        <div className="grid grid-3">
          <div className="card"><h3>Services</h3><p>706 / 7064 honoraires · 632 honoraires versés · 622 loyers · 628 télécoms · 6055 fournitures de bureau</p></div>
          <div className="card"><h3>BTP</h3><p>705 travaux facturés · 4117 retenues de garantie · 6021 matériaux · 6224 location d'engins · 637 main-d'œuvre</p></div>
          <div className="card"><h3>Transport</h3><p>7061 fret · 6053 carburant · 6242 entretien camions · 6252 assurances · 618 péages et frais de route</p></div>
        </div>
      </div>
    </PublicShell>
  );
}
