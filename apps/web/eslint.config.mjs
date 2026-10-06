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
              // The browser client at "@tidefern/auth/client" is the one entry the app may import
              // (task C3). The root entry and every other subpath, the server config above all,
              // stay blocked; a regex because a gitignore-style group cannot re-include one child
              // once the package root matches.
              regex: "^@tidefern/auth(?!/client$)",
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
