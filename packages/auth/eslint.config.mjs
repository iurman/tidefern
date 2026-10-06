import { libraryConfig } from "@tidefern/config/eslint/library";

export default [
  ...libraryConfig(),
  {
    // The browser client entry (task C3) builds on "better-auth/react", which the shared
    // gitignore-style "react" pattern would otherwise match by its last segment. The allowance
    // is scoped to this one file so the rest of the package, and every other workspace package,
    // keeps the shared rule: nothing else here imports React or anything that loads it.
    files: ["src/client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "next", message: "Workspace packages must stay framework neutral." },
            { name: "next/server", message: "Workspace packages must stay framework neutral." },
            { name: "next/headers", message: "Workspace packages must stay framework neutral." },
            { name: "next/navigation", message: "Workspace packages must stay framework neutral." },
          ],
          patterns: ["next/*", "react", "react-dom", "react/*", "!better-auth/react"],
        },
      ],
    },
  },
];
