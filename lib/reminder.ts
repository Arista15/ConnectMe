import { today } from "@/lib/format";

const DAY = 86400_000;

/** Rappel d'échéance (rang 0 = en retard, 1 = sous 7 jours, 2 = plus tard, 3 = sans échéance). */
export function reminder(due: string | null, verb = "relancer") {
  if (!due) return { label: "Sans échéance", cls: "t-muted", rank: 3 };
  const d = Math.round((new Date(due).getTime() - new Date(today()).getTime()) / DAY);
  if (d < 0) return { label: `En retard de ${-d} j — ${verb}`, cls: "fw-600 t-danger", rank: 0 };
  if (d <= 7) return { label: d === 0 ? "Échéance aujourd'hui" : `Échéance dans ${d} j`, cls: "fw-600 t-primary", rank: 1 };
  return { label: `Dans ${d} j`, cls: "", rank: 2 };
}
