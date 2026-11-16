import Link from "next/link";

/** En-tête de page : titre serif, sous-titre, actions alignées à droite (filet en dessous). */
export function PageHeader({ title, subtitle, actions }: {
  title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions-bar no-print">{actions}</div>}
    </div>
  );
}

/** Carte « grand livre » : en-tête optionnel, contenu (tableau) collé aux bords. */
export function Panel({ title, code, serif, actions, children, className = "", id }: {
  title?: React.ReactNode; code?: string; serif?: boolean; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <section className={`panel ${className}`} id={id}>
      {(title || actions) && (
        <div className={`panel-head${serif ? " serif" : ""}`}>
          <h3>{code && <span className="code">{code}</span>}{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Onglets segmentés (liens). */
export function Seg({ items }: { items: { href: string; label: React.ReactNode; active: boolean; count?: number }[] }) {
  return (
    <nav className="seg no-print">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={it.active ? "active" : undefined} aria-current={it.active ? "page" : undefined}>
          {it.label}{it.count !== undefined && <span className="count">{it.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

const STATUS: Record<string, [string, string]> = {
  brouillon: ["", "À valider"],
  emise: ["info", "Émise"],
  validee: ["accent", "Validée"],
  partielle: ["info", "Partiellement réglée"],
  payee: ["ok", "Réglée"],
  annulee: ["err", "Annulée"],
  rejetee: ["err", "Rejetée"],
};

export function Status({ status }: { status: string }) {
  const [cls, label] = STATUS[status] ?? ["", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
