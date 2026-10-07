import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat config for workspace libraries. Apps that use Next.js compose
 * eslint-config-next instead and only borrow the rules object below.
 */
export const libraryRules = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        { name: "next", message: "Workspace packages must stay framework neutral." },
        { name: "next/server", message: "Workspace packages must stay framework neutral." },
        { name: "next/headers", message: "Workspace packages must stay framework neutral." },
        { name: "next/navigation", message: "Workspace packages must stay framework neutral." },
      ],
      patterns: ["next/*", "react", "react-dom", "react/*"],
    },
  ],
  "@typescript-eslint/consistent-type-imports": "error",
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
};

/**
 * A no-restricted-imports path entry for packages that talk to the database.
 * The raw db and pool live behind "@tidefern/db/client"; route code reaches
 * them only through withActor(), and the job runner and the seed through
 * withSystem(). Task E1 adds this to the api package's rule;
 * packages/db/README.md shows the composition.
 */
export const dbClientRestriction = {
  name: "@tidefern/db/client",
  message:
    'Route code goes through withActor() from "@tidefern/db" (the job runner and the seed use withSystem()); the raw db and pool stay inside packages/db.',
};

export function libraryConfig({ allowReact = false } = {}) {
  const rules = { ...libraryRules };
  if (allowReact) {
    rules["no-restricted-imports"] = [
      "error",
      { paths: libraryRules["no-restricted-imports"][1].paths, patterns: ["next/*"] },
    ];
  }
  return tseslint.config(
    { ignores: ["dist/**", "coverage/**", "node_modules/**"] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: { globals: { ...globals.node, ...globals.es2023 } },
      rules,
    },
  );
}
