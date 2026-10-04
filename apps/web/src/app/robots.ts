import type { MetadataRoute } from "next";
import { indexingAllowed, site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/design"] },
    sitemap: new URL("/sitemap.xml", site.url).href,
  };
}
