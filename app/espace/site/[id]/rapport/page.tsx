import { Fragment } from "react";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import { PageHeader, Panel } from "@/components/ui";
import { getOpenSiteById } from "@/lib/session";
import { fetchLines, monthly, MONTHS_FR, type MonthRow } from "@/lib/entries";
import { money, today } from "@/lib/format";

export const metadata = { title: "Rapport mensuel du site" };

const zero = (): Omit<MonthRow, "month"> => ({ ca: 0, depenses: 0, tvaCollectee: 0, tvaDeductible: 0, tvaNette: 0, solde: 0 });
const add = (a: Omit<MonthRow, "month">, b: Omit<MonthRow, "month">) => ({
  ca: a.ca + b.ca, depenses: a.depenses + b.depenses, tvaCollectee: a.tvaCollectee + b.tvaCollectee,
  tvaDeductible: a.tvaDeductible + b.tvaDeductible, tvaNette: a.tvaNette + b.tvaNette, solde: a.solde + b.solde,
});

export default async function SiteReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const site = await getOpenSiteById(id);
  const year = /^\d{4}$/.test(sp.annee ?? "") ? Number(sp.annee) : Number(today().slice(0, 4));
  const lines = await fetchLines([site.id], `${year}-01-01`, `${year}-12-31`);
  const m = monthly(lines);
  const rows = MONTHS_FR.map((label, i) => ({ label, ...(m.get(`${year}-${String(i + 1).padStart(2, "0")}`) ?? zero()) }));
  const total = rows.reduce((a, r) => add(a, r), zero());
  const cell = (v: number) => <td className="num">{Math.abs(v) > 0.004 ? money(v) : "—"}</td>;
  const Row = ({ label, r, cls }: { label: string; r: Omit<MonthRow, "month">; cls?: string }) => (
    <tr className={cls}><td>{label}</td>{cell(r.ca)}{cell(r.depenses)}{cell(r.tvaCollectee)}{cell(r.tvaDeductible)}{cell(r.tvaNette)}{cell(r.solde)}</tr>
  );

  return (
    <>
      <PageHeader title={`Rapport mensuel — ${site.code} ${site.name}`} subtitle={`Exercice ${year} · montants en USD`}
        actions={<>
          <form method="get" className="filters">
            <select name="annee" defaultValue={String(year)}>
              {Array.from({ length: 6 }, (_, i) => Number(today().slice(0, 4)) - i).map((y) => <option key={y}>{y}</option>)}
            </select>
            <button className="btn ghost">Afficher</button>
          </form>
          <Link href={`/espace/site/${site.id}`} className="btn ghost">Retour au site</Link>
          <PrintButton />
        </>} />
      <Panel>
        <table>
          <thead><tr><th>Mois</th><th className="num">Chiffre d&apos;affaires</th><th className="num">Dépenses</th><th className="num">TVA collectée</th><th className="num">TVA déductible</th><th className="num">TVA nette</th><th className="num">Solde</th></tr></thead>
          <tbody>
            {[0, 1, 2, 3].map((q) => (
              <Fragment key={q}>
                {rows.slice(q * 3, q * 3 + 3).map((r) => <Row key={r.label} label={r.label} r={r} />)}
                <Row label={`Trimestre ${q + 1}`} r={rows.slice(q * 3, q * 3 + 3).reduce((a, r) => add(a, r), zero())} cls="subtotal" />
              </Fragment>
            ))}
            <Row label={`Total ${year}`} r={total} cls="total" />
          </tbody>
        </table>
      </Panel>
      <p className="note">Chiffre d&apos;affaires : comptes de classe 7 ; dépenses : classe 6 ; TVA collectée : 443 ; TVA déductible : 445. Solde = chiffre d&apos;affaires − dépenses.</p>
    </>
  );
}
