import { libraryConfig, libraryRules } from "@tidefern/config/eslint/library";

// The client's runtime source also runs in the browser and, from Phase 3, in
// Expo, and apps/web imports it: it never reaches the database, the auth
// server, key material, the API's own code or Node built-ins. Scripts and
// tests run in Node and keep the library rules.
const [, { paths, patterns }] = libraryRules["no-restricted-imports"];

export default [
  ...libraryConfig(),
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths,
          patterns: [
            { group: patterns },
            {
              group: ["@tidefern/db", "@tidefern/db/*", "@tidefern/auth", "@tidefern/auth/*"],
              message: "A client talks to the API over HTTP, never to the database or auth server.",
            },
            {
              group: ["@tidefern/crypto", "@tidefern/crypto/*"],
              message: "Key material stays inside the API.",
            },
            {
              group: ["@tidefern/api", "@tidefern/api/*"],
              message: "The client reads the contract from openapi/v1.json, not the API's code.",
            },
            {
              group: ["node:*"],
              message: "Client source runs in browsers and Expo; use Web APIs.",
            },
          ],
        },
      ],
    },
  },
];
