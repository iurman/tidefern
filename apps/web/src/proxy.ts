import { NextResponse, type NextRequest } from "next/server";
import { REQUESTED_PATH_HEADER } from "@/lib/requested-path";

/**
 * Per-request Content Security Policy with a nonce and strict-dynamic, so no
 * inline script runs without the nonce and no third-party origin is ever
 * allowed. Next.js reads the nonce from this header and applies it to its own
 * scripts; the root layout applies it to the preference script. Every page
 * is therefore rendered per request, which is the documented trade-off for a
 * nonce-based policy and the right one for a health product.
 *
 * It also hands the page's path (never its query) to the server render in
 * a request header, which the (app) layout reads to send a signed-out
 * visitor to sign in and back to the page they asked for.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes (swatches, measured sizes) need unsafe-inline for styles only; scripts never get it.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set(REQUESTED_PATH_HEADER, request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything that renders HTML. The API, static assets and metadata files set their own headers.
      source:
        "/((?!api|_next/static|_next/image|icon\\.svg|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|brand/|fonts/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
