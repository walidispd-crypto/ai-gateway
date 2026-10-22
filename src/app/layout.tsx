import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { themeBootstrapScript } from "@/lib/theme";
import "./globals.css";

// Nonce-based CSP from middleware needs per-request HTML; this app has no static pages worth caching.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Gateway",
  description: "Chat AI pribadi untuk coding dan pertanyaan umum.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#111312" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // React strips unknown attributes on inline scripts unless the nonce is passed explicitly,
  // and the CSP only allows inline scripts that carry the middleware nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="id"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
