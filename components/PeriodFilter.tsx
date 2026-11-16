import type { Site } from "@/lib/types";

/** Filtre période + périmètre (site actif ou consolidation des sites ouverts), en ligne. */
export default function PeriodFilter({
  from, to, scope, open, extra, hidden,
}: {
  from: string; to: string; scope: string; open: Site[];
  extra?: React.ReactNode; hidden?: Record<string, string>;
}) {
  return (
    <form className="filters no-print" method="get">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label>Du<input type="date" name="du" defaultValue={from} /></label>
      <label>Au<input type="date" name="au" defaultValue={to} /></label>
      {open.length > 1 && (
        <label>
          Périmètre
          <select name="perimetre" defaultValue={scope}>
            <option value="site">Site actif</option>
            <option value="tous">Consolidé ({open.map((s) => s.code).join(" + ")})</option>
            {open.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
        </label>
      )}
      {open.length <= 1 && <input type="hidden" name="perimetre" value={scope} />}
      {extra}
      <button className="btn ghost">Afficher</button>
    </form>
  );
}
