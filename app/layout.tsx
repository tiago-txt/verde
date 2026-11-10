import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Verde — Finanças da família",
    template: "%s · Verde",
  },
  description:
    "Controle de finanças pessoais e familiares, self-hosted. Lançamentos, contas, cartões, orçamentos e relatórios.",
  applicationName: "Verde",
  authors: [{ name: "Verde" }],
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080d0a" },
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
  ],
};

const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("verde-theme");
    var root = document.documentElement;
    if (stored === "light") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
