import type { NextConfig } from "next";

// Production indexing is an explicit opt in, and previews never index.
const indexable = process.env.SITE_INDEXABLE === "true" && process.env.VERCEL_ENV === "production";

// HTML routes receive a per-request nonce policy from src/proxy.ts. The API serves no HTML.
const apiCsp = "default-src 'none'; frame-ancestors 'none'";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
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
