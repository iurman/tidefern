/**
 * The development checklist on /design/foundations: the gates `pnpm check`
 * runs, named one by one. The list is parsed from the root `check` script
 * itself, so the chapter shows the chain the repository actually runs; the
 * descriptions are the only hand-written part, and `gates.test.ts` fails
 * when the script gains a step this file does not describe.
 */

export interface Gate {
  /** The command as a person would type it, `pnpm <name>` or `turbo run <task>`. */
  command: string;
  /** What the gate holds, in one sentence. */
  holds: string;
}

/** What each step of the chain holds. Keys are the command as `checkGates` prints it. */
export const gateDescriptions: Record<string, string> = {
  "pnpm prose:check": "No em dash in any tracked text file: code, copy, docs, metadata.",
  "pnpm skills:check":
    "Every project skill matches the Agent Skills format and is linked from .claude/skills.",
  "pnpm css:check":
    "No transition: all, no removed focus outline in a module, and no raw color in a module: every color is a semantic token.",
  "pnpm tokens:check":
    "The generated tokens.css in the app matches tokens.json, so nobody edits the output by hand.",
  "pnpm tokens:contrast":
    "Every color role reaches its threshold on every surface it names, in both themes.",
  "pnpm --filter web brand:check":
    "The brand files the app serves from public/brand match the canonical copies beside the tokens.",
  "pnpm openapi:check": "The committed OpenAPI document matches the API routes and schemas.",
  "pnpm growth:check": "The growth data JSON matches the vendored CSV tables it is built from.",
  "pnpm format:check": "Prettier agrees with every file.",
  "turbo run lint":
    "ESLint in every package, including the import boundaries: the API never imports Next.js or React, and clients never import db, auth server code or crypto.",
  "turbo run typecheck": "TypeScript in strict mode across every package.",
  "turbo run test": "The unit tests in every package, run with Vitest.",
  "turbo run build": "Every package builds, and the web app builds for production.",
};

/**
 * Splits a `&&` chain into its commands, expanding a multi-task
 * `turbo run a b c` into one entry per task so each gate is named on its own.
 */
export function checkGates(script: string): string[] {
  return script
    .split("&&")
    .map((step) => step.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .flatMap((step) => {
      const turbo = /^turbo run (.+)$/.exec(step);
      if (!turbo?.[1]) return [step];
      const tasks = turbo[1].split(" ").filter((task) => !task.startsWith("-"));
      return tasks.map((task) => `turbo run ${task}`);
    });
}

/** The chain with a description for every step; a step without one is reported, never dropped. */
export function describeGates(script: string): Gate[] {
  return checkGates(script).map((command) => ({
    command,
    holds: gateDescriptions[command] ?? "Not yet described on this page.",
  }));
}
