import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coinpresso Agent | Pexalo",
  description:
    "Research, draft and review crypto PR to Coinpresso's house style. Powered by Pexalo.",
  robots: { index: false, follow: false },
};

/**
 * Applied before first paint. Without it every load renders dark and then snaps
 * to light, which reads worse than not offering the choice at all.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('pexalo.theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
