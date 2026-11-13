import type { Site } from "@/lib/types";

/** Filtre période + périmètre (site actif ou consolidation des sites ouverts). */
export default function PeriodFilter({
  from, to, scope, open, extra, hidden,
}: {
  from: string; to: string; scope: string; open: Site[];
  extra?: React.ReactNode; hidden?: Record<string, string>;
}) {
  return (
    <form className="card row no-print" method="get">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div><label>Du</label><input type="date" name="du" defaultValue={from} /></div>
      <div><label>Au</label><input type="date" name="au" defaultValue={to} /></div>
      <div>
        <label>Périmètre</label>
        <select name="perimetre" defaultValue={scope}>
          <option value="site">Site actif</option>
          {open.length > 1 && <option value="tous">Consolidé ({open.map((s) => s.code).join(" + ")})</option>}
          {open.length > 1 && open.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
        </select>
      </div>
      {extra}
      <button className="btn shrink">Afficher</button>
    </form>
  );
}
