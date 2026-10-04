import type { MetadataRoute } from "next";
import { indexingAllowed, site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexingAllowed()) return [];
  return [{ url: new URL("/", site.url).href, changeFrequency: "weekly", priority: 1 }];
}
