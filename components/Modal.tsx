"use client";

import { useRef } from "react";
import Icon, { type IconName } from "./Icon";

/**
 * Bouton + fenêtre modale native (<dialog>), comme les « Nouvelle … » de kbs-comptable.com.
 * Les formulaires enfants (actions serveur) ferment la fenêtre à l'envoi,
 * sauf ceux marqués data-keep-open (ex. analyse d'un reçu).
 */
export default function Modal({
  label, title, children, variant = "", size = "", icon, triggerTitle,
}: {
  label: React.ReactNode; title: React.ReactNode; children: React.ReactNode;
  variant?: string; size?: "" | "lg" | "xl"; icon?: IconName; triggerTitle?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={`btn ${variant}`} title={triggerTitle} onClick={() => ref.current?.showModal()}>
        {icon && <Icon name={icon} />}{label}
      </button>
      <dialog
        ref={ref}
        className={`modal ${size}`}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        onSubmit={(e) => {
          const form = e.target as HTMLFormElement;
          if (form.dataset.keepOpen === undefined) setTimeout(() => ref.current?.close(), 0);
        }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-x" aria-label="Fermer" onClick={() => ref.current?.close()}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </dialog>
    </>
  );
}
