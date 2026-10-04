import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { SoundProvider } from "@/components/sound-provider";
import { ThemeSync } from "@/components/theme-sync";
import { indexingAllowed, preferenceScript, site } from "@/lib/site";
import "./globals.css";

// The opsz file carries both axes so 16 px headings get the sturdier cut and the
// display sizes get the higher contrast one; browsers apply it automatically.
const newsreader = localFont({
  src: [
    { path: "../../public/fonts/newsreader-latin-opsz-normal.woff2", style: "normal" },
    { path: "../../public/fonts/newsreader-latin-wght-italic.woff2", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  weight: "200 800",
  fallback: ["Georgia", "Times New Roman"],
  adjustFontFallback: "Times New Roman",
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
  colorScheme: "light dark",
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
      suppressHydrationWarning
      className={`${newsreader.variable} ${figtree.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: preferenceScript }} />
      </head>
      <body>
        <SoundProvider />
        <ThemeSync />
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
