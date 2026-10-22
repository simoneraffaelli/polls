import type { Metadata } from "next";
import Link from "next/link";
import { siteOrigin } from "@/composition/catalog";
import { homePath } from "@/platform/catalog";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: "Polls", template: "%s | Polls" },
  description:
    "Hub di osservazione degli eventi elettorali. Le fonti sono in verifica.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <a className="skip-link" href="#main-content">
          Vai al contenuto
        </a>
        <header className="site-header">
          <div className="site-header-inner">
            <Link
              href={homePath}
              className="wordmark"
              aria-label="Polls, torna alla homepage"
            >
              polls.
            </Link>
            <span className="header-note">Osservatorio in preparazione</span>
          </div>
        </header>
        <main className="shell" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="site-footer-inner">
            Polls · Fonti e dati in verifica
          </div>
        </footer>
      </body>
    </html>
  );
}
