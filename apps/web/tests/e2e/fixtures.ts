import {
  test as base,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { baseOrigin, signInAs, type Persona } from "./session";

export { expect } from "@playwright/test";

/**
 * One sign-in per worker for each seeded persona, handed out as a
 * `storageState` (architecture 15; task J1).
 *
 * A spec asks for `noor`, `theo`, `mira`, `lena` or `pia` and gets a page
 * of its own, in a context of its own made with the project's options and
 * that persona's storage state. It never signs in itself. The worker keeps
 * one storage state per persona: the first test that asks for a persona
 * signs it in through `signInAs` (./session.ts), which shares its kept
 * cookies with every spec that still calls the helper directly, so a
 * persona costs one sign-in per worker however it is reached. Each later
 * test gets the kept state; its session is checked with GET /api/v1/me (a
 * read, which no limiter counts) and signed in again only when a spec
 * signed it out in between.
 *
 * `asPersona(name)` does the same for a persona chosen at run time (the
 * route sweep walks them in a loop); every context it opens is closed at
 * the end of the test.
 *
 * On a server without a database the sign-in answers 5xx, the helper adds
 * the canned session cookie instead, and the page renders its honest
 * failed-read state; `serverHasDatabase()` in ./session.ts says which. A
 * mutation behind fresh authentication still signs in again with
 * `signInAs(page, persona, { fresh: true })` on the page the fixture gave.
 *
 * Nothing that imports this file may carry the `@smoke` tag: these
 * fixtures authenticate. The storage states live in memory only, never on
 * disk, so nothing here can be committed.
 */

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** What the worker keeps: each persona's storage state from its one sign-in. */
export interface PersonaStates {
  get(persona: Persona): StorageState | undefined;
  set(persona: Persona, state: StorageState): void;
}

export interface PersonaFixtures {
  noor: Page;
  theo: Page;
  mira: Page;
  lena: Page;
  pia: Page;
  /** A page signed in as any persona, in a context of its own for this test. */
  asPersona: (persona: Persona, options?: BrowserContextOptions) => Promise<Page>;
}

export interface WorkerFixtures {
  personaStates: PersonaStates;
}

/** The project's context options a page made by hand would otherwise lose. */
type ProjectOptions = BrowserContextOptions;

async function openAs(
  browser: Browser,
  project: ProjectOptions,
  states: PersonaStates,
  persona: Persona,
  extra: BrowserContextOptions = {},
): Promise<Page> {
  const kept = states.get(persona);
  const context = await browser.newContext({
    ...project,
    ...extra,
    ...(kept === undefined ? {} : { storageState: kept }),
  });
  const page = await context.newPage();
  if (kept !== undefined) {
    const answer = await page.request.get(`${baseOrigin()}/api/v1/me`);
    if (answer.status() !== 401) return page;
  }
  // First use in this worker, or a kept session a spec signed out since: one sign-in.
  await signInAs(page, persona);
  states.set(persona, await context.storageState());
  return page;
}

export const test = base.extend<PersonaFixtures, WorkerFixtures>({
  personaStates: [
    async ({}, provide) => {
      const states = new Map<Persona, StorageState>();
      await provide({
        get: (persona) => states.get(persona),
        set: (persona, state) => {
          states.set(persona, state);
        },
      });
    },
    { scope: "worker" },
  ],

  asPersona: async (
    {
      browser,
      personaStates,
      baseURL,
      viewport,
      colorScheme,
      reducedMotion,
      timezoneId,
      locale,
      extraHTTPHeaders,
      contextOptions,
    },
    provide,
  ) => {
    const project: ProjectOptions = {
      ...contextOptions,
      baseURL,
      viewport,
      colorScheme,
      reducedMotion,
      timezoneId,
      locale,
      extraHTTPHeaders,
    };
    const opened: Page[] = [];
    await provide(async (persona, extra) => {
      const page = await openAs(browser, project, personaStates, persona, extra);
      opened.push(page);
      return page;
    });
    for (const page of opened) await page.context().close();
  },

  noor: async ({ asPersona }, provide) => provide(await asPersona("noor")),
  theo: async ({ asPersona }, provide) => provide(await asPersona("theo")),
  mira: async ({ asPersona }, provide) => provide(await asPersona("mira")),
  lena: async ({ asPersona }, provide) => provide(await asPersona("lena")),
  pia: async ({ asPersona }, provide) => provide(await asPersona("pia")),
});
