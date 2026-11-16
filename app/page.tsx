import Link from "next/link";
import PublicShell from "@/components/PublicShell";
import Icon, { type IconName } from "@/components/Icon";
import Reveal from "@/components/landing/Reveal";
import CountUp from "@/components/landing/CountUp";

const modules: [IconName, string, string][] = [
  ["book", "Journal", "Partie double, contrôlée"],
  ["file", "Factures", "Écriture automatique"],
  ["sparkles", "Reçus IA", "Photo → compte proposé"],
  ["wallet", "Caisse & banque", "Rapprochement en un clic"],
  ["scale", "États", "Bilan, résultat, balance"],
  ["building", "Multi-sites", "USD / CDF par site"],
];

const flow: [IconName, string][] = [["receipt", "Pièce"], ["book", "Écriture"], ["scale", "États"]];

const bars = [38, 52, 45, 63, 58, 72, 66, 80, 74, 88, 82, 95];

const accounts = [
  ["706", "Prestations"], ["705", "Travaux"], ["7061", "Fret"], ["6053", "Carburant"], ["6021", "Matériaux"],
  ["411", "Clients"], ["401", "Fournisseurs"], ["4431", "TVA facturée"], ["4452", "TVA récupérable"], ["571", "Caisse"], ["521", "Banque"],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { setup } = await searchParams;

  return (
    <PublicShell dark>
      {setup === "supabase" && (
        <div className="wrap" style={{ paddingTop: "1rem" }}>
          <div className="alert info">
            Configuration Supabase requise : créez <code>.env.local</code> depuis <code>.env.example</code>, puis relancez <code>npm run dev</code>.
          </div>
        </div>
      )}

      {/* ───────── Héros ───────── */}
      <section className="lp-hero dark">
        <div className="lp-grid-bg" aria-hidden="true" />
        <div className="lp-orb lp-orb-a" aria-hidden="true" />
        <div className="lp-orb lp-orb-b" aria-hidden="true" />
        <div className="wrap lp-hero-in">
          <div className="lp-hero-text">
            <p className="eyebrow lp-fade" style={{ animationDelay: "0ms" }}>SYSCOHADA · USD / CDF</p>
            <h1 className="lp-fade" style={{ animationDelay: "120ms" }}>
              Du reçu<br />au <span className="lp-shine">bilan</span>.
            </h1>
            <p className="lp-lead lp-fade" style={{ animationDelay: "240ms" }}>La comptabilité de tous vos sites, au même endroit.</p>
            <div className="lp-actions lp-fade" style={{ animationDelay: "360ms" }}>
              <Link href="/auth" className="btn secondary lg lp-cta">Accéder au site <Icon name="arrow" /></Link>
              <Link href="/connexion-site" className="btn on-dark lg">Ouvrir mon site</Link>
            </div>
          </div>

          {/* Aperçu animé de l'application */}
          <div className="lp-stage lp-fade" style={{ animationDelay: "300ms" }} aria-hidden="true">
            <div className="lp-mock">
              <div className="lp-mock-top"><i /><i /><i /><span>Tableau de bord · S01</span></div>
              <div className="lp-kpis">
                <div><small>Chiffre d&apos;affaires</small><b><CountUp to={15000} suffix=" $" /></b></div>
                <div><small>Charges</small><b><CountUp to={8120} suffix=" $" /></b></div>
                <div><small>Résultat</small><b className="up"><CountUp to={6880} suffix=" $" /></b></div>
              </div>
              <div className="lp-chart">
                {bars.map((h, i) => <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />)}
              </div>
              <div className="lp-entry">
                <div className="lp-line" style={{ animationDelay: "0s" }}><em>D</em><code>411</code>Clients<b>1 160 $</b></div>
                <div className="lp-line" style={{ animationDelay: ".6s" }}><em className="c">C</em><code>706</code>Prestations<b>1 000 $</b></div>
                <div className="lp-line" style={{ animationDelay: "1.2s" }}><em className="c">C</em><code>4431</code>TVA facturée<b>160 $</b></div>
                <div className="lp-ok">✓ équilibrée</div>
              </div>
            </div>
            <div className="lp-float lp-toast"><Icon name="sparkles" /> Reçu analysé · <code>6053</code> proposé</div>
            <div className="lp-float lp-rate"><span className="lp-dot" /> 1 $ = 2 850 FC</div>
          </div>
        </div>
      </section>

      {/* ───────── Bande défilante ───────── */}
      <div className="lp-marquee" aria-hidden="true">
        <div className="lp-track">
          {[...accounts, ...accounts].map(([c, l], i) => <span key={i}><code>{c}</code>{l}</span>)}
        </div>
      </div>

      {/* ───────── Modules ───────── */}
      <section className="lp-section">
        <div className="wrap">
          <Reveal><h2 className="lp-h2">Tout le cycle comptable.</h2></Reveal>
          <div className="lp-tiles">
            {modules.map(([icon, t, d], i) => (
              <Reveal key={t} delay={i * 80} className="lp-tile">
                <span className="lp-ico"><Icon name={icon} /></span>
                <strong>{t}</strong>
                <small>{d}</small>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Flux ───────── */}
      <section className="lp-section lp-band">
        <div className="wrap">
          <Reveal><h2 className="lp-h2 t-center">Une pièce. Une écriture. Un état.</h2></Reveal>
          <Reveal delay={150} className="lp-flow">
            <div className="lp-rail" aria-hidden="true"><span className="lp-runner" /></div>
            {flow.map(([icon, t], i) => (
              <div key={t} className="lp-node" style={{ animationDelay: `${i * 1.2}s` }}>
                <span><Icon name={icon} /></span>
                <strong>{t}</strong>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ───────── Chiffres ───────── */}
      <section className="lp-section">
        <div className="wrap lp-stats">
          {[
            [3, "", "secteurs"],
            [2, "", "devises"],
            [12, " h", "d'accès sécurisé"],
            [100, " %", "SYSCOHADA"],
          ].map(([n, s, l], i) => (
            <Reveal key={String(l)} delay={i * 100} className="lp-stat">
              <b><CountUp to={Number(n)} suffix={String(s)} duration={1200} /></b>
              <span>{l}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Appel à l'action ───────── */}
      <section className="lp-final dark">
        <div className="lp-orb lp-orb-c" aria-hidden="true" />
        <Reveal className="wrap lp-final-in">
          <h2>Prêt à ouvrir votre site ?</h2>
          <div className="lp-actions" style={{ justifyContent: "center" }}>
            <Link href="/auth" className="btn secondary lg lp-cta">Accéder au site <Icon name="arrow" /></Link>
            <Link href="/guide-comptables" className="btn on-dark lg">Guide du comptable</Link>
          </div>
        </Reveal>
      </section>
    </PublicShell>
  );
}
