"use client";

import Icon from "./Icon";

export default function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return (
    <button type="button" className="btn ghost no-print" onClick={() => window.print()}>
      <Icon name="printer" /> {label}
    </button>
  );
}
