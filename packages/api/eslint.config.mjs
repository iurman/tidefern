import { dbClientRestriction, libraryConfig, libraryRules } from "@tidefern/config/eslint/library";

// Route code reaches the database only through withActor(), the job runner
// through withSystem(); the raw client stays inside packages/db (task E1,
// packages/db/README.md).
const [, options] = libraryRules["no-restricted-imports"];
const restricted = { paths: [...options.paths, dbClientRestriction], patterns: options.patterns };

// A request runs on the app role, where withSystem() gets no system context
// (architecture 7.2): sign-up (D3) and closure (E10) both failed on real
// Postgres that way while PGlite, a superuser, passed. Request code acts as
// the person (withActor) or calls a narrow SECURITY DEFINER function; the job
// runner and the seed keep withSystem on the owner connection.
const noSystemInRequests = {
  name: "@tidefern/db",
  importNames: ["withSystem"],
  message:
    "A request runs as tidefern_app, where withSystem() has no system context (architecture 7.2; D3, E10). Use withActor(), or a narrow SECURITY DEFINER function.",
};

export default [
  ...libraryConfig(),
  {
    rules: {
      "no-restricted-imports": ["error", restricted],
    },
  },
  {
    // A later entry replaces the rule's options for the files it matches, so it repeats them.
    files: ["src/routes/**/*.ts", "src/middleware/**/*.ts", "src/*.ts"],
    ignores: ["**/*.test.ts", "src/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...restricted.paths, noSystemInRequests], patterns: restricted.patterns },
      ],
    },
  },
];
