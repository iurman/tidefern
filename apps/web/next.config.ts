import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The app lives in a workspace; tracing from the repository root keeps workspace packages in the output.
const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../");

// Production indexing is an explicit opt in, and previews never index.
const indexable = process.env.SITE_INDEXABLE === "true" && process.env.VERCEL_ENV === "production";

// HTML routes receive a per-request nonce policy from src/proxy.ts. The API serves no HTML.
const apiCsp = "default-src 'none'; frame-ancestors 'none'";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: repositoryRoot,
  transpilePackages: [
    "@tidefern/api",
    "@tidefern/core",
    "@tidefern/design-tokens",
    "@tidefern/schemas",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Vercel sets a bare max-age on custom domains; subdomains (a future api.) are covered here. No preload until the domain is final.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          ...(indexable ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Content-Security-Policy", value: apiCsp },
        ],
      },
      {
        source: "/design/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default config;
