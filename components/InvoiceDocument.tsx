import Letterhead from "./Letterhead";
import { COMPANY } from "@/lib/company";
import { money, dateFr } from "@/lib/format";

export type DocSite = { name: string; city: string; sector: string; address?: string | null; rccm?: string | null; id_nat?: string | null; nif?: string | null };
export type DocLine = { description: string; quantity: number; unit_price: number; amount: number };

/** Facture ou devis au format A4 : en-tête officiel, client, lignes, totaux, banque, signature. */
export default function InvoiceDocument({
  kind, number, issueDate, dueDate, dueLabel = "Échéance", site, client, lines, currency,
  subtotal, vatRate, vatAmount, total, amountPaid = 0, notes, status,
}: {
  kind: "Facture" | "Devis"; number: string; issueDate: string; dueDate?: string | null; dueLabel?: string;
  site: DocSite; client?: { name: string; address?: string | null; tax_id?: string | null } | null;
  lines: DocLine[]; currency: string; subtotal: number; vatRate: number; vatAmount: number; total: number;
  amountPaid?: number; notes?: string | null; status?: string;
}) {
  const rest = Math.max(0, total - amountPaid);
  const stamp = kind === "Facture"
    ? status === "annulee" ? ["Annulée", "void"] : status === "payee" || (amountPaid > 0 && rest <= 0.004) ? ["Payée", "paid"] : null
    : status === "accepte" ? ["Accepté", "paid"] : status === "refuse" ? ["Refusé", "void"] : null;

  return (
    <article className="invoice-doc">
      <Letterhead
        site={site}
        title={kind}
        meta={<>
          <div><span>N°</span><b className="mono">{number}</b></div>
          <div><span>Date</span><b className="mono">{dateFr(issueDate)}</b></div>
          {dueDate && <div><span>{dueLabel}</span><b className="mono">{dateFr(dueDate)}</b></div>}
          <div><span>Site</span><b>{site.name}{site.city && site.city.toLowerCase() !== site.name.toLowerCase() ? ` · ${site.city}` : ""}</b></div>
        </>}
      />

      <section className="inv-parties">
        <div className="inv-box">
          <div className="inv-label">{kind === "Devis" ? "Devis établi pour" : "Facturé à"}</div>
          <div className="inv-client-name">{client?.name ?? "—"}</div>
          {client?.address && <div>{client.address}</div>}
          {client?.tax_id && <div className="mono">NIF / RCCM : {client.tax_id}</div>}
        </div>
        <div className="inv-box inv-sum">
          <div className="inv-label">{kind === "Facture" && amountPaid > 0 ? "Reste à payer" : "Montant TTC"}</div>
          <div className="inv-big mono">{money(kind === "Facture" && amountPaid > 0 ? rest : total, currency)}</div>
          <div className="xs t-muted">Devise : {currency === "CDF" ? "Franc congolais (FC)" : "Dollar américain (USD)"}</div>
        </div>
      </section>

      <table className="inv-table">
        <thead><tr><th style={{ width: "2.5rem" }}>#</th><th>Désignation</th><th className="num">Qté</th><th className="num">P.U. HT</th><th className="num">Montant HT</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="mono t-muted">{String(i + 1).padStart(2, "0")}</td>
              <td>{l.description}</td>
              <td className="num">{Number(l.quantity).toLocaleString("fr-FR")}</td>
              <td className="num">{money(l.unit_price, currency)}</td>
              <td className="num">{money(l.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="inv-bottom">
        <div className="inv-notes">
          {stamp && <div className={`inv-stamp ${stamp[1]}`}>{stamp[0]}</div>}
          {notes && (<><div className="inv-label">Observations</div><p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{notes}</p></>)}
          {kind === "Devis" && <p className="xs t-muted" style={{ marginTop: 8 }}>Devis valable jusqu&apos;à la date indiquée. Toute commande vaut acceptation des conditions ci-dessus.</p>}
        </div>
        <div className="inv-totals mono">
          <div><span>Total HT</span><span>{money(subtotal, currency)}</span></div>
          <div><span>TVA {Number(vatRate)} %</span><span>{money(vatAmount, currency)}</span></div>
          <div className="grand"><span>Total TTC</span><span>{money(total, currency)}</span></div>
          {kind === "Facture" && amountPaid > 0 && (
            <>
              <div><span>Acomptes / paiements reçus</span><span className="nowrap">− {money(amountPaid, currency)}</span></div>
              <div className="due"><span>Reste à payer</span><span>{money(rest, currency)}</span></div>
            </>
          )}
        </div>
      </section>

      <section className="inv-foot">
        <div className="inv-bank">
          <div className="inv-label">Coordonnées bancaires</div>
          <dl>
            {COMPANY.bank.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd className="mono">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="inv-sign">
          <div className="inv-label">Pour {COMPANY.short}</div>
          <div className="inv-sign-zone">Signature et cachet</div>
        </div>
      </section>

      <footer className="inv-legal">
        {COMPANY.legal} · RCCM {site.rccm || COMPANY.rccm} · Id. nat. {site.id_nat || COMPANY.idNat} · NIF {site.nif || COMPANY.nif} · {COMPANY.phones}
      </footer>
    </article>
  );
}
