import { buildCatalog } from "@/lib/design-catalog";

export const dynamic = "force-static";

export function GET() {
  return Response.json(buildCatalog(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
