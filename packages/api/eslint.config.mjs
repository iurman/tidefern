import { dbClientRestriction, libraryConfig, libraryRules } from "@tidefern/config/eslint/library";

// Route code reaches the database only through withActor() and withSystem();
// the raw client stays inside packages/db (task E1, packages/db/README.md).
const [, options] = libraryRules["no-restricted-imports"];

export default [
  ...libraryConfig(),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...options.paths, dbClientRestriction], patterns: options.patterns },
      ],
    },
  },
];
