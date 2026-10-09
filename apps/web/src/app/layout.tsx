import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { SoundProvider } from "@/components/sound-provider";
import { ThemeSync } from "@/components/theme-sync";
import { indexingAllowed, preferenceScript, site } from "@/lib/site";
import "./globals.css";

// The opsz file carries both axes so 16 px headings get the sturdier cut and the
// display sizes get the higher contrast one; browsers apply it automatically.
// next/font preloads every file of a call on every route, so the two roman files
// are each their own call and the only preloads (task J2b, docs/design/PERFORMANCE.md).
const newsreader = localFont({
  src: [{ path: "../../public/fonts/newsreader-latin-opsz-normal.woff2", style: "normal" }],
  variable: "--font-newsreader",
  display: "swap",
  weight: "200 800",
  fallback: ["Georgia", "Times New Roman"],
  adjustFontFallback: "Times New Roman",
});

// The estimate sentence, the one italic in the product (`.estimate` in globals.css).
// Not preloaded: the browser fetches it when a page sets that sentence.
const newsreaderItalic = localFont({
  src: [{ path: "../../public/fonts/newsreader-latin-wght-italic.woff2", style: "italic" }],
  variable: "--font-newsreader-italic",
  display: "swap",
  weight: "200 800",
  preload: false,
  fallback: ["Georgia", "Times New Roman"],
  adjustFontFallback: "Times New Roman",
});

// No Figtree italic ships: no style sets Figtree in italic (task J2b).
const figtree = localFont({
  src: [{ path: "../../public/fonts/figtree-latin-wght-normal.woff2", style: "normal" }],
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
      className={`${newsreader.variable} ${newsreaderItalic.variable} ${figtree.variable}`}
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
        {/* Each route group draws its own chrome around `<main id="main">`: (public) the header
            and footer, (app) the shell. A header or footer inside main would lose its landmark. */}
        {children}
      </body>
    </html>
  );
}
