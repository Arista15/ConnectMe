import "server-only";
import { getActiveSite, getOpenSites } from "@/lib/session";
import { isDate, monthBounds } from "@/lib/format";

/** Lit du/au/perimetre dans l'URL et renvoie les sites concernés (toujours parmi les sites ouverts). */
export async function resolveScope(sp: Record<string, string | undefined>) {
  const site = await getActiveSite();
  const open = await getOpenSites();
  const mb = monthBounds();
  const from = isDate(sp.du) ? sp.du : mb.from;
  const to = isDate(sp.au) ? sp.au : mb.to;
  const scope = sp.perimetre ?? "site";
  let sites = [site];
  if (scope === "tous") sites = open;
  else if (scope !== "site") sites = open.filter((s) => s.id === scope).slice(0, 1);
  if (sites.length === 0) sites = [site];
  const title = sites.length > 1 ? `Consolidé (${sites.map((s) => s.code).join(" + ")})` : `${sites[0].code} – ${sites[0].name}`;
  return { site, open, from, to, scope, sites, siteIds: sites.map((s) => s.id), title };
}
