import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: site.description,
    id: "/",
    // Moves to /today when the authenticated home exists (task H2).
    start_url: "/",
    scope: "/",
    display: "standalone",
    // The manifest cannot switch per color scheme; it matches the light viewport color.
    background_color: "#F7F5EF",
    theme_color: "#F7F5EF",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
