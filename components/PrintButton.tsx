"use client";

export default function PrintButton({ label = "Imprimer / PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn ghost no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
