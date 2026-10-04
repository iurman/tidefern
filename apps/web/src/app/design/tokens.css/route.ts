import { readFile } from "node:fs/promises";

export const dynamic = "force-static";

export async function GET() {
  const css = await readFile(new URL("../../tokens.css", import.meta.url), "utf8");
  return new Response(css, {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
