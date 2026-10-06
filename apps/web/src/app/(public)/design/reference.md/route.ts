import { renderReference } from "@/lib/design-catalog";

export const dynamic = "force-static";

export function GET() {
  return new Response(renderReference(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
