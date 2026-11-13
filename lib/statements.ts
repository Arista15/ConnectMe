/** Construction du compte de résultat et du bilan (présentation SYSCOHADA simplifiée) à partir de la balance. */

export type TBRow = {
  account_code: string; label: string; class: number;
  opening_debit: number; opening_credit: number;
  period_debit: number; period_credit: number;
  closing_debit: number; closing_credit: number;
};

export type Line = { label: string; value: number; kind?: "subtotal" | "total" };

const N = (x: unknown) => Number(x ?? 0);
const starts = (code: string, prefixes: string[]) => prefixes.some((p) => code.startsWith(p));

/** Charges (débit − crédit) ou produits (crédit − débit) sur la période */
function periodSum(rows: TBRow[], prefixes: string[], side: "charge" | "produit") {
  return rows.filter((r) => starts(r.account_code, prefixes))
    .reduce((s, r) => s + (side === "charge" ? N(r.period_debit) - N(r.period_credit) : N(r.period_credit) - N(r.period_debit)), 0);
}

export function incomeStatement(rows: TBRow[]) {
  const ca = periodSum(rows, ["70"], "produit");
  const otherOp = periodSum(rows, ["71", "72", "73", "75", "78", "79"], "produit");
  const purchases = periodSum(rows, ["60"], "charge");
  const transport = periodSum(rows, ["61"], "charge");
  const external = periodSum(rows, ["62", "63"], "charge");
  const taxes = periodSum(rows, ["64"], "charge");
  const otherCh = periodSum(rows, ["65"], "charge");
  const staff = periodSum(rows, ["66"], "charge");
  const depr = periodSum(rows, ["68", "69"], "charge");
  const finProd = periodSum(rows, ["77"], "produit");
  const finCh = periodSum(rows, ["67"], "charge");
  const haoProd = periodSum(rows, ["82", "84", "86", "88"], "produit");
  const haoCh = periodSum(rows, ["81", "83", "85", "87"], "charge");
  const tax = periodSum(rows, ["89"], "charge");

  const va = ca + otherOp - purchases - transport - external - taxes - otherCh;
  const ebe = va - staff;
  const re = ebe - depr;
  const rf = finProd - finCh;
  const rao = re + rf;
  const hao = haoProd - haoCh;
  const net = rao + hao - tax;

  const lines: Line[] = [
    { label: "Chiffre d'affaires (70)", value: ca },
    { label: "Autres produits d'exploitation", value: otherOp },
    { label: "Achats consommés (60)", value: -purchases },
    { label: "Transports (61)", value: -transport },
    { label: "Services extérieurs (62-63)", value: -external },
    { label: "Impôts et taxes (64)", value: -taxes },
    { label: "Autres charges (65)", value: -otherCh },
    { label: "Valeur ajoutée", value: va, kind: "subtotal" },
    { label: "Charges de personnel (66)", value: -staff },
    { label: "Excédent brut d'exploitation", value: ebe, kind: "subtotal" },
    { label: "Dotations aux amortissements et provisions (68-69)", value: -depr },
    { label: "Résultat d'exploitation", value: re, kind: "subtotal" },
    { label: "Produits financiers et gains de change (77)", value: finProd },
    { label: "Frais financiers et pertes de change (67)", value: -finCh },
    { label: "Résultat financier", value: rf, kind: "subtotal" },
    { label: "Résultat des activités ordinaires", value: rao, kind: "subtotal" },
    { label: "Résultat hors activités ordinaires", value: hao },
    { label: "Impôt sur le résultat (89)", value: -tax },
    { label: "Résultat net", value: net, kind: "total" },
  ];
  return { lines, net, ca };
}

/** Bilan à la date de fin : soldes cumulés classes 1 à 5 + résultat de l'exercice en cours */
export function balanceSheet(rows: TBRow[]) {
  const debitBal = (r: TBRow) => N(r.closing_debit) - N(r.closing_credit);
  const filt = (prefixes: string[]) => rows.filter((r) => starts(r.account_code, prefixes));
  const sumD = (rs: TBRow[]) => rs.reduce((s, r) => s + Math.max(debitBal(r), 0), 0);
  const sumC = (rs: TBRow[]) => rs.reduce((s, r) => s + Math.max(-debitBal(r), 0), 0);
  const net = (rs: TBRow[]) => rs.reduce((s, r) => s + debitBal(r), 0);

  const immoBrut = net(rows.filter((r) => r.class === 2 && !starts(r.account_code, ["28", "29"])));
  const amort = -net(filt(["28", "29"]));
  const stocks = net(rows.filter((r) => r.class === 3));
  const clients = sumD(filt(["41"]));
  const autresCreances = sumD(rows.filter((r) => r.class === 4 && !starts(r.account_code, ["41"])));
  const tresoActif = sumD(rows.filter((r) => r.class === 5));

  const result = rows.filter((r) => r.class >= 6 && r.class <= 8)
    .reduce((s, r) => s + (N(r.closing_credit) - N(r.closing_debit)), 0);
  const capital = -net(filt(["10", "11", "12", "13", "14", "15"]));
  const dettesFin = -net(filt(["16", "17", "18", "19"]));
  const fournisseurs = sumC(filt(["40"]));
  const fiscSoc = sumC(filt(["42", "43", "44"]));
  const autresDettes = sumC(rows.filter((r) => r.class === 4 && !starts(r.account_code, ["40", "42", "43", "44"])));
  const tresoPassif = sumC(rows.filter((r) => r.class === 5));

  const actif: Line[] = [
    { label: "Immobilisations brutes", value: immoBrut },
    { label: "Amortissements et dépréciations", value: -amort },
    { label: "Actif immobilisé net", value: immoBrut - amort, kind: "subtotal" },
    { label: "Stocks", value: stocks },
    { label: "Clients", value: clients },
    { label: "Autres créances (dont TVA récupérable)", value: autresCreances },
    { label: "Actif circulant", value: stocks + clients + autresCreances, kind: "subtotal" },
    { label: "Trésorerie – actif (banques, caisses)", value: tresoActif },
  ];
  const totalActif = immoBrut - amort + stocks + clients + autresCreances + tresoActif;
  actif.push({ label: "Total actif", value: totalActif, kind: "total" });

  const passif: Line[] = [
    { label: "Capital, réserves et report à nouveau", value: capital },
    { label: "Résultat de l'exercice en cours", value: result },
    { label: "Capitaux propres", value: capital + result, kind: "subtotal" },
    { label: "Dettes financières", value: dettesFin },
    { label: "Fournisseurs", value: fournisseurs },
    { label: "Dettes fiscales et sociales", value: fiscSoc },
    { label: "Autres dettes", value: autresDettes },
    { label: "Passif circulant", value: fournisseurs + fiscSoc + autresDettes, kind: "subtotal" },
    { label: "Trésorerie – passif (découverts)", value: tresoPassif },
  ];
  const totalPassif = capital + result + dettesFin + fournisseurs + fiscSoc + autresDettes + tresoPassif;
  passif.push({ label: "Total passif", value: totalPassif, kind: "total" });

  return { actif, passif, totalActif, totalPassif, balanced: Math.abs(totalActif - totalPassif) < 0.01 };
}
