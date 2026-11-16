import { COMPANY, mentions, type SiteMentions } from "@/lib/company";

/**
 * En-tête officiel des documents imprimés : logo, raison sociale, activités,
 * adresse, RCCM, Id. nat. et NIF. À droite : titre du document et références.
 */
export default function Letterhead({ site, title, meta, className = "" }: {
  site?: SiteMentions | null; title?: React.ReactNode; meta?: React.ReactNode; className?: string;
}) {
  const m = mentions(site);
  return (
    <header className={`letterhead ${className}`}>
      <div className="lh-brand">
        <img src="/kbs-logo.png" alt="Logo KBS — Kafaus Business Service" />
        <div>
          <div className="lh-name">{COMPANY.short}</div>
          <div className="lh-legal">{COMPANY.legal}</div>
          <div className="lh-activities">{COMPANY.activities}</div>
        </div>
      </div>
      {(title || meta) && (
        <div className="lh-doc">
          {title && <div className="lh-title">{title}</div>}
          {meta && <div className="lh-meta">{meta}</div>}
        </div>
      )}
      <div className="lh-ids">
        {m.address && <span><b>Adresse</b> {m.address}</span>}
        <span><b>RCCM</b> {m.rccm}</span>
        <span><b>Id. nat.</b> {m.idNat}</span>
        <span><b>N° impôt (NIF)</b> {m.nif}</span>
        <span><b>Tél.</b> {COMPANY.phones}</span>
      </div>
    </header>
  );
}
