import type { Metadata } from "next";
import { brand } from "@tidefern/design-tokens";
import { HERO_MARK_PATH, MARK_DARK, MARK_LIGHT } from "./brand-mark";

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

/**
 * The social card at the app root (`src/app/opengraph-image.png`). Next
 * applies a file-based card only to pages in its own segment, and the home
 * page sits in the (public) route group, whose own openGraph would hide it,
 * so the home page names the card here. Moving the file into the group
 * would change its URL to a hashed one.
 */
const socialCard = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${site.name}. ${site.tagline}.`,
};

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
      ...(path === "/" ? { images: [socialCard] } : {}),
    },
    twitter: { card: "summary", title, description },
  };
}

export const THEME_KEY = "tidefern-theme-v1";
export const SOUND_KEY = "tidefern-sound-v1";

/**
 * Runs before paint. Reads two functional preferences only: an explicit theme
 * choice (light or dark; absent means follow the system) and the sound level
 * (all, actions or off; absent means all). Without JavaScript the stylesheet's
 * prefers-color-scheme block already renders the system theme.
 *
 * On the hero page, a stored theme that differs from the system theme also gets
 * a high-priority preload for the mark it shows: the hero's own preloads follow
 * prefers-color-scheme, which cannot see the stored choice (task J2b).
 */
export const preferenceScript = `(function(){var r=document.documentElement;r.dataset.js="true";var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";r.dataset.themeSource="system"}else{r.dataset.themeSource="user"}r.dataset.theme=t;if(r.dataset.themeSource==="user"&&location.pathname==="${HERO_MARK_PATH}"){var d=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(d!==t){var l=document.createElement("link");l.setAttribute("rel","preload");l.setAttribute("as","image");l.setAttribute("href",t==="dark"?"${MARK_DARK}":"${MARK_LIGHT}");l.setAttribute("fetchpriority","high");document.head.appendChild(l)}}var s="all";try{var v=localStorage.getItem("${SOUND_KEY}");if(v==="off"||v==="actions"){s=v}}catch(e){}r.dataset.sound=s;})();`;
