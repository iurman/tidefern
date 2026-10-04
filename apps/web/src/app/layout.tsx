import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { SoundProvider } from "@/components/sound-provider";
import { indexingAllowed, preferenceScript, site } from "@/lib/site";
import "./globals.css";

const newsreader = localFont({
  src: [
    { path: "../../public/fonts/newsreader-latin-wght-normal.woff2", style: "normal" },
    { path: "../../public/fonts/newsreader-latin-wght-italic.woff2", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  weight: "200 800",
  fallback: ["Georgia", "Times New Roman"],
});

const figtree = localFont({
  src: [
    { path: "../../public/fonts/figtree-latin-wght-normal.woff2", style: "normal" },
    { path: "../../public/fonts/figtree-latin-wght-italic.woff2", style: "italic" },
  ],
  variable: "--font-figtree",
  display: "swap",
  weight: "300 900",
  fallback: ["Arial"],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  robots: { index: indexingAllowed(), follow: indexingAllowed() },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1A17" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by src/proxy.ts; reading it also makes every page render per request, which the nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      data-theme="light"
      data-sound="on"
      suppressHydrationWarning
      className={`${newsreader.variable} ${figtree.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: preferenceScript }} />
      </head>
      <body>
        <SoundProvider />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
