import { designTokens } from "@tidefern/design-tokens";

export const dynamic = "force-static";

export function GET() {
  return Response.json(designTokens, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
