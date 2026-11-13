import Link from "next/link";
import PublicShell from "@/components/PublicShell";

const modules = [
  ["Journal & grand livre", "Écritures en partie double avec date, pièce justificative, comptes au débit et au crédit. Recherche, filtres et impression."],
  ["Factures clients", "Numérotation par site, écritures automatiques sur le compte client, les produits et la TVA facturée."],
  ["Factures fournisseurs", "Reçus analysés depuis une photo ou un texte, avec un compte de charge proposé que le comptable valide avant comptabilisation."],
  ["Dépenses, caisse & banque", "Dépenses, règlements et recettes journalières, rapprochés avec la banque et la caisse, suivi des fournisseurs."],
  ["États financiers", "Balance, grand livre, compte de résultat et bilan par site et par période, plus un rapport mensuel imprimable en PDF."],
  ["Rappels par e-mail", "Chaque matin, la liste des factures en retard et de celles qui arrivent à échéance dans les 7 jours."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { setup } = await searchParams;

  return (
    <PublicShell>
      {setup === "supabase" && (
        <div className="container" style={{ padding: "1rem 1.5rem 0" }}>
          <div className="alert info">
            L’espace comptable nécessite une configuration Supabase. Créez un fichier <code>.env.local</code>
            à partir de <code>.env.example</code>, remplacez les valeurs d’exemple par l’URL et la clé anon
            de votre projet Supabase, puis relancez <code>npm run dev</code>.
          </div>
        </div>
      )}
      <section className="hero">
        <div className="container">
          <h1>La comptabilité SYSCOHADA de chaque site, de la pièce au bilan.</h1>
          <p>
            KBS Comptable centralise les écritures, factures, dépenses et états financiers de vos sites
            dans un même registre, en dollars américains et en francs congolais.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <Link href="/auth" className="btn gold">Accéder à mon espace</Link>
            <Link href="/guide-comptables" className="btn ghost" style={{ color: "#fff", borderColor: "#6d8aa8" }}>
              Lire le guide
            </Link>
          </div>
        </div>
      </section>

      <section className="container" style={{ padding: "2.5rem 1.5rem" }}>
        <h2>Modules</h2>
        <div className="grid grid-3">
          {modules.map(([t, d]) => (
            <div className="card feature" key={t}>
              <h3>{t}</h3>
              <p className="muted">{d}</p>
            </div>
          ))}
        </div>

        <h2>Pensé pour plusieurs sites et plusieurs métiers</h2>
        <div className="grid grid-2">
          <div className="card">
            <h3>Contrôles multi-sites</h3>
            <ul>
              <li>Chaque site est tenu séparément, puis consolidé dans les rapports communs.</li>
              <li>Un comptable ne voit que les sites qui lui sont attribués.</li>
              <li>Chaque site a son propre taux USD/CDF ; chaque document conserve son taux historique.</li>
              <li>Synthèse par site : chiffre d'affaires, charges, créances et dettes.</li>
              <li>Historique d'audit : qui a comptabilisé quelle écriture, quand, sur quel site et dans quel compte.</li>
            </ul>
          </div>
          <div className="card">
            <h3>Trois secteurs</h3>
            <p>Services professionnels, BTP et transport/logistique disposent chacun de leurs comptes usuels et d'écritures types, pour une saisie homogène d'un site à l'autre.</p>
            <h3>Accès sécurisé</h3>
            <p>Pas d'inscription libre : l'administrateur invite chaque comptable par e-mail et lui attribue ses sites. Un site s'ouvre avec le compte personnel et un code d'accès, pour 12 heures ou jusqu'à la déconnexion.</p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
