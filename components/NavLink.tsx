"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";

/** Lien de la barre latérale : état actif + fermeture du tiroir mobile au clic. */
export default function NavLink({ href, icon, children, exact = false }: {
  href: string; icon: IconName; children: React.ReactNode; exact?: boolean;
}) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={active ? "nav-link active" : "nav-link"}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        const t = document.getElementById("nav-toggle") as HTMLInputElement | null;
        if (t) t.checked = false;
      }}
    >
      <Icon name={icon} /> {children}
    </Link>
  );
}
