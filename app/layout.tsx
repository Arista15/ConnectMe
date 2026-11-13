import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KBS Comptable", template: "%s · KBS Comptable" },
  description:
    "Comptabilité SYSCOHADA multi-sites en USD et CDF : écritures, factures, dépenses, trésorerie et états financiers.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
