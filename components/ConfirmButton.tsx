"use client";

/** Bouton d'envoi qui demande confirmation avant de soumettre le formulaire. */
export default function ConfirmButton({ message, className = "btn plain sm", title, children }: {
  message: string; className?: string; title?: string; children: React.ReactNode;
}) {
  return (
    <button className={className} title={title} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
