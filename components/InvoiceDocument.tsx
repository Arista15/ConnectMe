import { money, dateFr, SECTORS } from "@/lib/format";

export type DocSite = { name: string; city: string; sector: string; address?: string | null; rccm?: string | null; id_nat?: string | null; nif?: string | null };
export type DocLine = { description: string; quantity: number; unit_price: number; amount: number };

const BANK: [string, string][] = [
  ["Account Name", "KAFAUS BUSINESS SERVICE SARL"],
  ["Account Number", "45130-01027985101-11 / USD"],
  ["Branch Code", "45130"],
  ["Swift Code", "RAWBCDKI"],
  ["Bank Name", "RAW BANK"],
  ["Country", "REPUBLIC DEMOCRATIC OF CONGO"],
  ["Company Contacts", "00 243 996 968 868, 00 243 999 182 675"],
];

/** Facture ou devis imprimable (même mise en page que kbs-comptable.com). */
export default function InvoiceDocument({
  kind, number, issueDate, dueDate, dueLabel = "échéance", site, client, lines, currency,
  subtotal, vatRate, vatAmount, total, amountPaid = 0, notes,
}: {
  kind: "Facture" | "Devis"; number: string; issueDate: string; dueDate?: string | null; dueLabel?: string;
  site: DocSite; client?: { name: string; address?: string | null; tax_id?: string | null } | null;
  lines: DocLine[]; currency: string; subtotal: number; vatRate: number; vatAmount: number; total: number;
  amountPaid?: number; notes?: string | null;
}) {
  return (
    <article className="invoice-doc">
      <header className="inv-head">
        <div className="inv-from">
          <img src="/kbs-logo.png" alt="Logo KBS — Kafaus Business Service" />
          <div>
            <div className="inv-company">K.B.S SARL</div>
            <div className="small t-muted">{SECTORS[site.sector] ?? ""}{site.city ? ` · ${site.city}` : ""}</div>
            <div className="inv-mentions">
              {site.address && <div>Adresse : {site.address}</div>}
              {site.rccm && <div className="mono">RCCM : {site.rccm}</div>}
              {site.id_nat && <div className="mono">Id. nat. : {site.id_nat}</div>}
              {site.nif && <div className="mono">N° impôt (NIF) : {site.nif}</div>}
            </div>
          </div>
        </div>
        <div className="t-right">
          <div className="inv-kind">{kind}</div>
          <div className="mono small">{number}</div>
          <div className="mono small t-muted">{dateFr(issueDate)}{dueDate ? ` · ${dueLabel} ${dateFr(dueDate)}` : ""}</div>
        </div>
      </header>

      <section className="inv-client">
        <div className="xs t-muted" style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>Client</div>
        <div className="fw-500" style={{ marginTop: 4 }}>{client?.name ?? "—"}</div>
        {client?.address && <div>{client.address}</div>}
        {client?.tax_id && <div className="mono">NIF : {client.tax_id}</div>}
      </section>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">P.U. HT</th><th className="num">Montant</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td><td className="num">{Number(l.quantity)}</td>
                <td className="num">{money(l.unit_price, currency)}</td><td className="num">{money(l.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="inv-totals mono">
        <div><span>Total HT</span><span>{money(subtotal, currency)}</span></div>
        <div><span>TVA {Number(vatRate)}%</span><span>{money(vatAmount, currency)}</span></div>
        <div className="grand"><span>Total TTC</span><span>{money(total, currency)}</span></div>
        {kind === "Facture" && amountPaid > 0 && (
          <>
            <div><span>Acomptes / paiements reçus</span><span className="nowrap">− {money(amountPaid, currency)}</span></div>
            <div className="grand sm"><span>Reste à payer</span><span>{money(Math.max(0, total - amountPaid), currency)}</span></div>
          </>
        )}
      </div>

      {notes && <p className="small t-muted" style={{ marginTop: "2rem", whiteSpace: "pre-wrap" }}>{notes}</p>}

      <footer className="inv-bank">
        <div className="fw-600 t-muted" style={{ textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Coordonnées bancaires</div>
        <dl>
          {BANK.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt className="t-muted">{k}</dt><dd>:</dd><dd className="mono fw-500">{v}</dd>
            </div>
          ))}
        </dl>
      </footer>
    </article>
  );
}
