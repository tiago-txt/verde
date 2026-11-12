import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Verde",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1510" },
    { media: "(prefers-color-scheme: light)", color: "#f6f1e4" },
  ],
};

const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("verde-theme");
    var root = document.documentElement;
    var dark = stored !== "light";
    if (stored === "system") {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    var decorations = localStorage.getItem("verde-decorations");
    if (decorations === "on") decorations = "sutis";
    root.dataset.decorations = decorations === "off" || decorations === "normais" ? decorations : "sutis";
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-background font-body antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
