import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The web app is a client of the API. It never reaches the database, auth server code or key material.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tidefern/db", "@tidefern/db/*"],
              message: "The web app talks to the API, never to the database.",
            },
            {
              group: ["@tidefern/crypto", "@tidefern/crypto/*"],
              message: "Key material stays inside the API.",
            },
            {
              group: ["@tidefern/auth", "@tidefern/auth/server", "@tidefern/auth/server/*"],
              message: "Use the auth client, not the server config.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
