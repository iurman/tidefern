import type { Metadata } from "next";
import { brand } from "@tidefern/design-tokens";

function resolveSiteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const site = {
  name: brand.name,
  tagline: brand.tagline,
  description: brand.description,
  url: resolveSiteUrl(),
};

export function indexingAllowed(): boolean {
  return process.env.SITE_INDEXABLE === "true" && process.env.VERCEL_ENV === "production";
}

export function pageMetadata(
  path: string,
  title: string,
  description: string,
  eligible = true,
): Metadata {
  const index = eligible && indexingAllowed();
  const canonical = new URL(path, site.url).href;
  return {
    title: {
      absolute: title === site.name ? `${site.name} | ${site.tagline}` : `${title} | ${site.name}`,
    },
    description,
    alternates: { canonical },
    robots: { index, follow: index },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: site.name,
      title,
      description,
      url: canonical,
    },
    twitter: { card: "summary", title, description },
  };
}

export const THEME_KEY = "tidefern-theme-v1";
export const SOUND_KEY = "tidefern-sound-v1";

/**
 * Runs before paint. Reads two functional preferences only: an explicit theme
 * choice (light or dark; absent means follow the system) and the sound setting.
 */
export const preferenceScript = `(function(){var r=document.documentElement;r.dataset.js="true";var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";r.dataset.themeSource="system"}else{r.dataset.themeSource="user"}r.dataset.theme=t;var s="on";try{s=localStorage.getItem("${SOUND_KEY}")==="off"?"off":"on"}catch(e){}r.dataset.sound=s;})();`;
