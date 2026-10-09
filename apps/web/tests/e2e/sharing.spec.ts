import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Cookie, type Page, type Route } from "@playwright/test";
import { CURRENT_SHARING_DESCRIPTION_VERSION, SHARING_DESCRIPTIONS } from "@tidefern/schemas";
import {
  MAIL_CAPTURE_PATH,
  baseOrigin,
  freshAccount,
  onboard,
  signInAccount,
  signInAs,
  type Account,
} from "./session";
import { signInRedirect, signInUrl } from "./sign-in-redirect";

/**
 * /sharing against the production build (task H6): every person and
 * category with the plain words before a switch can turn it on, revoking
 * in one step, sending and withdrawing invitations, and accepting one only
 * after sign-in, by POST, with the token kept out of every URL.
 *
 * Seeded personas show the populated views (packages/db README, "The
 * cast"): Noor's rows for Theo, Theo's read-only view of what Noor shares,
 * Mira and Lena as co-guardians, Pia with nobody to share with. Real
 * changes happen only on fresh accounts made through the mail capture
 * endpoint, or on Noor's own invitation, which the same test withdraws in
 * `finally`; refusals the seed cannot give, and every failure, are answers
 * to the browser's own calls through `page.route`, so nothing reaches the
 * shared database. Server reads cannot be routed, so a server without a
 * database shows the page's honest failure instead (the canned cookie of
 * ./session), and each test asserts that. Nothing here is tagged @smoke.
 */

const words = SHARING_DESCRIPTIONS[CURRENT_SHARING_DESCRIPTION_VERSION].categories;

const sentences = {
  loadFailed: "We could not load who you share with just now. Reload the page to try again.",
  loadFailedHolding:
    "We could not load who you share with just now. Accept the invitation above first, then reload the page.",
  empty: "You are the only one who can see this",
  server: "Tidefern had a problem on our side. Wait a moment and try again.",
  offline: "We could not reach Tidefern. Check your connection and try again.",
  freshGrant:
    "For safety, turning on a category needs a sign-in from the last ten minutes. Sign in again, then come back here.",
  freshInvite:
    "For safety, sending an invitation needs a sign-in from the last ten minutes. Sign in again, then come back here.",
  notOpen:
    "This invitation cannot be used. It may have expired or been withdrawn, or it was sent to another email address. Ask for a new one, and sign in with the address it was sent to.",
  incomplete: "This invitation link is not complete. Open the link in the email again.",
  choice:
    "You already belong to a household. Accepting moves you into the new one and out of the one you are in now.",
  handOver:
    "You own a household that other people still belong to, so you cannot move out of it yet. You can stay where you are.",
  stayed:
    "You stayed in your household. The invitation stays open until it expires, if you change your mind.",
};

/** A token shaped like the API's (32 random bytes as base64url) that no invitation holds. */
function unknownToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function problemBody(status: number, code: string, detail?: string) {
  return JSON.stringify({
    type: `urn:tidefern:problem:${code}`,
    title: "Refused",
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
  });
}

function problem(route: Route, status: number, code: string, detail?: string) {
  return route.fulfill({
    status,
    contentType: "application/problem+json",
    body: problemBody(status, code, detail),
  });
}

/** The day an instant falls on in a zone, the way the page writes it ("Jun 27"). */
function dayIn(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(
    new Date(instant),
  );
}

/** The page's honest state when the server could not read the session or the lists. */
async function expectUnavailable(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Sharing" })).toBeVisible();
  await expect(page.getByText(sentences.loadFailed)).toBeVisible();
}

/**
 * Axe in both themes at 1440 and 390 on the page as it stands (a step the
 * person reached, such as an open dialog, stays open), then no sideways
 * scroll at 390 and 320; leaves the page at 1440 in the light theme.
 *
 * Each pass reads the page scrolled to its end. Below 1024 px the shell's
 * tab bar is sticky at the bottom of the viewport, so on a page taller than
 * the screen it lies over whatever control happens to sit there at the
 * current scroll position, and axe's target-size rule (2.5.8) counts that
 * control as obscured; at the end of the page the bar rests in its own row
 * and covers nothing, which measures the page rather than a scroll offset.
 */
async function checkState(page: Page, label: string) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        window.scrollTo(0, document.documentElement.scrollHeight);
      }, theme);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations, `${label} in ${theme} at ${width}`).toEqual([]);
    }
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label} at ${width}`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    window.scrollTo(0, 0);
  });
}

/**
 * Calls the router's own refresh (what the page does after every change)
 * and returns every address it wrote back with replaceState: a token the
 * router still held would come back into the address bar here.
 */
async function addressesAfterRefresh(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const router = (window as unknown as { next: { router: { refresh(): void } } }).next.router;
    const integrated = window.history.replaceState;
    const urls: string[] = [];
    window.history.replaceState = function replaceState(data, unused, url) {
      if (url !== undefined && url !== null) urls.push(String(url));
      return integrated.call(window.history, data, unused, url);
    };
    try {
      router.refresh();
      for (let waited = 0; urls.length === 0 && waited < 10_000; waited += 50) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      window.history.replaceState = integrated;
    }
    return urls;
  });
}

/** What the page keeps in browser storage, to prove a token never lands there. */
async function storageOf(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
}

/** Records the path and query of every request the page makes: what a server and its logs see. */
function recordRequests(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    sent.push(`${request.method()} ${url.pathname}${url.search}`);
  });
  return sent;
}

/** The newest invitation link the capture holds for an address. */
async function invitationLink(page: Page, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await page.request.get(`${baseOrigin()}${MAIL_CAPTURE_PATH}`);
    expect(response.ok(), "the mail capture answers").toBe(true);
    const { messages } = (await response.json()) as {
      messages: { to: string; subject: string; link?: string }[];
    };
    const mail = messages
      .filter((message) => message.to === email && message.subject === "An invitation to Tidefern")
      .at(-1);
    if (mail?.link !== undefined) return mail.link;
    await page.waitForTimeout(250);
  }
  throw new Error(`no invitation reached ${email}`);
}

/** A page in a context of its own, for a second person in one test. */
async function secondPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: baseOrigin(),
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  return context.newPage();
}

interface Person extends Account {
  name: string;
  cookies: Cookie[];
}

/** The fresh owner and the fresh partner who accepted her invitation, once a test made them. */
let pair: { owner: Person; partner: Person } | undefined;

test("a visitor without a session is sent to sign in, and an invitation link's token reaches no server", async ({
  page,
  request,
}) => {
  const response = await request.get("/sharing", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toBe(signInRedirect("/sharing"));

  const token = unknownToken();
  const sent = recordRequests(page);
  await page.goto(`/sharing#invitation=${token}`);
  // The browser kept the fragment across the redirect; sign-in takes it out of the address bar.
  await expect(page).toHaveURL(signInUrl("/sharing"));
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  for (const line of sent) expect(line).not.toContain(token);
  expect(await storageOf(page)).not.toContain(token);
});

test("Noor sees Theo's rows with the right switches on, each with its plain words and level", async ({
  page,
}) => {
  const cookies = await signInAs(page, "noor");
  await page.goto("/sharing");
  await expect(page).toHaveTitle("Sharing | Tidefern");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  if (cookies === null) {
    await expectUnavailable(page);
    await checkState(page, "the failed read");
    return;
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sharing");

  // The day sharing began, read from the API: Theo's oldest active grant, in Noor's zone.
  const people = (await (await page.request.get(`${baseOrigin()}/api/v1/sharing`)).json()) as {
    items: { displayName: string | null; grants: { createdAt: string }[] }[];
  };
  const theoAnswer = people.items.find((person) => person.displayName === "Theo");
  const oldest = theoAnswer?.grants.map((grant) => grant.createdAt).sort()[0];
  expect(oldest, "the seed shares with Theo").toBeDefined();

  const theo = page.getByRole("article", { name: "Theo" });
  await expect(theo).toContainText(`partner, since ${dayIn(oldest ?? "", "Europe/Berlin")}`);
  const rows = [
    { category: "cycle.status", on: true, level: "Level: summary" },
    { category: "cycle.history", on: false },
    { category: "cycle.symptoms", on: true, level: "Level: read" },
    { category: "pregnancy.overview", on: false },
    { category: "pregnancy.photos", on: false },
  ] as const;
  for (const row of rows) {
    const { label, description } = words[row.category];
    const control = theo.getByRole("switch", { name: label, exact: true });
    await expect(control, label).toHaveAttribute("aria-checked", String(row.on));
    // The plain words are on the card before the switch is pressed, and read with it.
    await expect(theo.getByText(description, { exact: true })).toBeVisible();
    await expect(control).toHaveAccessibleDescription(
      "level" in row ? `${description} ${row.level}` : description,
    );
  }
  await expect(
    theo.getByRole("switch", { name: "Tell Theo when my period starts" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    theo.getByText("The message says only that there is something new in Tidefern."),
  ).toBeVisible();
  await expect(theo.getByRole("button", { name: "Remove Theo" })).toBeVisible();
  // Once per page, never once per card.
  await expect(page.getByText("Private notes are never shared.", { exact: true })).toHaveCount(1);
  await checkState(page, "Noor's people");
});

test("Noor's invitation sent through the page shows the day it was sent and is withdrawn in one step", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Sending needs a sign-in from the last ten minutes.
  const cookies = await signInAs(page, "noor", { fresh: true });
  await page.goto("/sharing");
  if (cookies === null) {
    await expectUnavailable(page);
    return;
  }
  const origin = baseOrigin();
  const email = `h6-noor-${Date.now()}@example.test`;
  let invitationId: string | undefined;
  try {
    await page.getByRole("textbox", { name: /Their email/ }).fill(email);
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(page.getByText(`Invitation sent to ${email}.`)).toBeVisible();
    const pending = (await (
      await page.request.get(`${origin}/api/v1/sharing/invitations`)
    ).json()) as { items: { id: string; inviteeEmail: string; createdAt: string }[] };
    const sent = pending.items.find((item) => item.inviteeEmail === email);
    invitationId = sent?.id;
    expect(sent, "the invitation is pending").toBeDefined();

    const card = page.getByRole("article", { name: email });
    await expect(card).toContainText(
      `Sent ${dayIn(sent?.createdAt ?? "", "Europe/Berlin")}. Waiting for ${email} to sign in and accept.`,
    );
    await expect(card.getByRole("link")).toHaveCount(0);
    await checkState(page, "a pending invitation");

    await card.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText(`The invitation to ${email} is withdrawn.`)).toBeVisible();
    await expect(page.getByRole("article", { name: email })).toHaveCount(0);
    const after = (await (
      await page.request.get(`${origin}/api/v1/sharing/invitations`)
    ).json()) as { items: { inviteeEmail: string }[] };
    expect(after.items.some((item) => item.inviteeEmail === email)).toBe(false);
  } finally {
    // Leave Noor as the seed made her: an invitation this test opened is withdrawn (404 once it is).
    if (invitationId !== undefined) {
      await page.request.delete(`${origin}/api/v1/sharing/invitations/${invitationId}`, {
        headers: { origin },
      });
    }
  }
});

test("Theo sees what Noor shares with him and has nothing of hers to change", async ({ page }) => {
  const cookies = await signInAs(page, "theo");
  await page.goto("/sharing");
  if (cookies === null) {
    await expectUnavailable(page);
    return;
  }
  const noor = page.getByRole("article", { name: "Noor" });
  await expect(noor).toContainText("household owner");
  await expect(noor.getByRole("switch")).toHaveCount(0);
  const held = noor.getByRole("region", { name: "Noor shares with you" });
  await expect(held).toContainText("Cycle status");
  await expect(held).toContainText("Level: summary");
  await expect(held).toContainText("Symptoms");
  await expect(held).toContainText("Level: read");
  await expect(held).toContainText("Only Noor can change this.");
  // A member of a household Noor owns cannot invite into it, so the page names who can instead of a form.
  await expect(
    page.getByText(
      "Only Noor can invite people into your household. Ask Noor to send the invitation.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Their email/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send the invitation" })).toHaveCount(0);
  // Never pressed here: removing the owner would take Theo out of household A.
  await expect(noor.getByRole("button", { name: "Remove Noor" })).toBeVisible();
  await checkState(page, "Theo's view");
});

test("Mira and Lena are co-guardians: removing either one is refused honestly and nothing changes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const origin = baseOrigin();
  for (const [persona, other, consequence] of [
    [
      "mira",
      "Lena",
      "Lena leaves your household and loses access to everything you share, right now.",
    ],
    ["lena", "Mira", "You leave Mira's household, and Mira loses access to everything you share"],
  ] as const) {
    await page.context().clearCookies();
    const cookies = await signInAs(page, persona);
    await page.goto("/sharing");
    if (cookies === null) {
      await expectUnavailable(page);
      return;
    }
    // The refusal is certain only while both children have exactly these two guardians.
    const children = (await (await page.request.get(`${origin}/api/v1/children`)).json()) as {
      items: { displayName: string; guardians?: string[] }[];
    };
    for (const child of children.items) expect(child.guardians, child.displayName).toHaveLength(2);

    const card = page.getByRole("article", { name: other });
    await expect(card).toContainText("co-guardian of Ilo and Sol");
    await expect(card.getByRole("switch", { name: "Ilo" })).toHaveCount(0);
    await expect(card.getByRole("switch", { name: "Sol" })).toHaveCount(0);
    if (persona === "mira") {
      // Pia, outside the household, gets one switch per child; Sol is shared with her.
      const pia = page.getByRole("article", { name: "Pia" });
      await expect(pia.getByRole("switch", { name: "Sol", exact: true })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(pia.getByRole("switch", { name: "Ilo", exact: true })).toHaveAttribute(
        "aria-checked",
        "false",
      );
    } else {
      // Lena is pregnant: no period notice to offer.
      await expect(card.getByRole("switch", { name: /when my period starts/ })).toHaveCount(0);
    }
    await checkState(page, `${persona}'s view`);

    await card.getByRole("button", { name: `Remove ${other}` }).click();
    const dialog = page.getByRole("dialog", { name: `Remove ${other}?` });
    await expect(dialog).toContainText(consequence);
    const answered = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        new URL(response.url()).pathname.startsWith("/api/v1/sharing/people/"),
    );
    await dialog.getByRole("button", { name: `Remove ${other}` }).click();
    expect((await answered).status()).toBe(409);
    await expect(
      card.getByText(
        `${other} also guards Ilo and Sol, and removing ${other} would leave at least one of them without a second guardian. Change who guards them in Family first, then remove ${other}.`,
      ),
    ).toBeVisible();
    await expect(card.getByRole("link", { name: "Go to Family" })).toHaveAttribute(
      "href",
      "/family",
    );
    await page.reload();
    await expect(page.getByRole("article", { name: other })).toBeVisible();
  }
});

test("Pia has nobody to share with: the empty state, what is shared with her, and the way to invite", async ({
  page,
}) => {
  const cookies = await signInAs(page, "pia");
  await page.goto("/sharing");
  if (cookies === null) {
    await expectUnavailable(page);
    return;
  }
  const empty = page.getByRole("region", { name: sentences.empty });
  await expect(empty).toContainText(
    "Invite a partner and choose exactly what they see, category by category.",
  );
  const shared = page.getByRole("region", { name: "Shared with you" });
  await expect(shared).toContainText("Sol");
  await expect(shared).toContainText("Level: read");
  await empty.getByRole("button", { name: "Invite a partner" }).click();
  await expect(page.getByRole("textbox", { name: /Their email/ })).toBeFocused();
  await checkState(page, "Pia's empty view");
});

test("a fresh owner invites a fresh onboarded partner through the page, and the partner accepts after sign-in", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const partnerPage = await secondPage(browser);
  try {
    // The partner first: making an account clears the capture, and the invitation must stay in it.
    const partner = await freshAccount(partnerPage, { name: "Bea", label: "h6-partner" });
    if (partner === null) {
      await partnerPage.goto("/sharing");
      await expectUnavailable(partnerPage);
      return;
    }
    await onboard(partnerPage, {
      stage: "cycle",
      timeZone: "America/New_York",
      displayName: "Bea",
    });
    const owner = await freshAccount(page, { name: "Ada", label: "h6-owner" });
    if (owner === null) throw new Error("the server made one account and not the other");
    await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Ada" });

    await page.goto("/sharing");
    await expect(page.getByRole("region", { name: sentences.empty })).toBeVisible();
    await page.getByRole("textbox", { name: /Their email/ }).fill(partner.email);
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(page.getByText(`Invitation sent to ${partner.email}.`)).toBeVisible();
    await expect(page.getByRole("article", { name: partner.email })).toBeVisible();

    const link = await invitationLink(page, partner.email);
    const token = new URL(link).hash.replace(/^#invitation=/, "");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link).toBe(`${baseOrigin()}/sharing#invitation=${token}`);

    const sent = recordRequests(partnerPage);
    await partnerPage.goto(link);
    const panel = partnerPage.getByRole("region", { name: "An invitation for you" });
    await expect(panel).toBeVisible();
    await expect(partnerPage).toHaveURL(`${baseOrigin()}/sharing`);
    const written = await addressesAfterRefresh(partnerPage);
    expect(written.length, "the refresh committed and wrote its address").toBeGreaterThan(0);
    for (const url of written) expect(url, "the address the router wrote back").not.toContain("#");
    await expect(partnerPage).toHaveURL(`${baseOrigin()}/sharing`);
    await expect(panel).toBeVisible();
    await checkState(partnerPage, "the acceptance panel");

    const accepting = partnerPage.waitForRequest((request) =>
      request.url().endsWith("/api/v1/sharing/invitations/accept"),
    );
    await panel.getByRole("button", { name: "Accept the invitation" }).click();
    const accept = await accepting;
    expect(accept.method()).toBe("POST");
    expect(accept.postDataJSON()).toEqual({ token });
    await expect(panel.getByText("You joined Ada's household.")).toBeVisible();
    await expect(partnerPage.getByRole("article", { name: "Ada" })).toContainText(
      "household owner",
    );
    // The page read itself again after accepting; the token never came back.
    await expect(partnerPage).toHaveURL(`${baseOrigin()}/sharing`);
    for (const line of sent) expect(line, "a request's path and query").not.toContain(token);
    expect(await partnerPage.title()).not.toContain(token);
    expect(await storageOf(partnerPage)).not.toContain(token);

    await page.reload();
    const bea = page.getByRole("article", { name: "Bea" });
    await expect(bea).toContainText("partner");
    await expect(bea.getByRole("switch", { name: "Cycle status", exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(page.getByRole("article", { name: partner.email })).toHaveCount(0);

    pair = {
      owner: { ...owner, name: "Ada", cookies: await page.context().cookies() },
      partner: { ...partner, name: "Bea", cookies: await partnerPage.context().cookies() },
    };
  } finally {
    await partnerPage.context().close();
  }
});

test("the owner turns a category on through the confirm step, switches the notice, and turns it off in one step", async ({
  page,
}) => {
  test.setTimeout(180_000);
  if (pair === undefined) {
    // The previous test makes the pair; without a database it cannot, and this page says so.
    await signInAs(page, "noor");
    await page.goto("/sharing");
    if (await page.getByText(sentences.loadFailed).isVisible()) {
      await expectUnavailable(page);
      return;
    }
    throw new Error("the invitation test did not leave an owner and a partner");
  }
  // Turning a category on needs a sign-in from the last ten minutes.
  await signInAccount(page, pair.owner);
  const origin = baseOrigin();
  await page.goto("/sharing");
  const bea = page.getByRole("article", { name: "Bea" });
  const status = bea.getByRole("switch", { name: "Cycle status", exact: true });
  const notify = bea.getByRole("switch", { name: "Tell Bea when my period starts" });
  // The notice means nothing until a period category is shared, and the card says so.
  await expect(notify).toBeDisabled();
  await expect(notify).toHaveAccessibleDescription(
    "The message says only that there is something new in Tidefern. Share your cycle status or cycle history with Bea first.",
  );

  await status.click();
  const dialog = page.getByRole("dialog", { name: "Share your cycle status with Bea?" });
  await expect(dialog).toContainText(words["cycle.status"].description);
  await expect(dialog).toContainText("Level: summary");
  await expect(status).toHaveAttribute("aria-checked", "false");
  await checkState(page, "the open confirm step");

  // Hold the real request so the pending state shows, then let it through.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/sharing/grants/*", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await held;
    await route.continue();
  });
  const putting = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().includes("/api/v1/sharing/grants/"),
  );
  await dialog.getByRole("button", { name: "Share with Bea" }).click();
  await expect(dialog.getByRole("button", { name: "Saving" })).toBeVisible();
  release();
  const put = await putting;
  expect(put.postDataJSON()).toEqual({
    grants: [{ category: "cycle.status", level: "summary" }],
    policyVersion: CURRENT_SHARING_DESCRIPTION_VERSION,
    descriptionVersion: CURRENT_SHARING_DESCRIPTION_VERSION,
  });
  await expect(bea.getByText("Bea can now see your cycle status.")).toBeVisible();
  await expect(status).toHaveAttribute("aria-checked", "true");
  await expect(bea.getByText("Level: summary")).toBeVisible();
  await page.unroute("**/api/v1/sharing/grants/*");

  // The partner's own session now holds it.
  const partnerSession = await page.context().browser()?.newContext({ baseURL: origin });
  if (partnerSession === undefined) throw new Error("no browser to open the partner's session in");
  try {
    await partnerSession.addCookies(pair.partner.cookies);
    const held = (await (await partnerSession.request.get(`${origin}/api/v1/me`)).json()) as {
      grants: { category: string; level: string }[];
    };
    expect(held.grants).toEqual([
      expect.objectContaining({ category: "cycle.status", level: "summary" }),
    ]);
  } finally {
    await partnerSession.close();
  }

  // The notice is its own switch, now that a period category is shared.
  await expect(notify).toBeEnabled();
  await notify.click();
  await expect(bea.getByText("Tidefern will tell Bea when your period starts.")).toBeVisible();
  await expect(notify).toHaveAttribute("aria-checked", "true");
  await notify.click();
  await expect(
    bea.getByText("Tidefern will no longer tell Bea when your period starts."),
  ).toBeVisible();
  await expect(notify).toHaveAttribute("aria-checked", "false");

  // Off is one step: no dialog, and the switch says Saving until the answer.
  let releaseOff: () => void = () => {};
  const heldOff = new Promise<void>((resolve) => {
    releaseOff = resolve;
  });
  await page.route("**/api/v1/sharing/grants/*/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    await heldOff;
    await route.continue();
  });
  await status.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(status).toHaveText(/Saving/);
  releaseOff();
  await expect(bea.getByText("Bea can no longer see your cycle status.")).toBeVisible();
  await expect(status).toHaveAttribute("aria-checked", "false");
  await page.unroute("**/api/v1/sharing/grants/*/*");
  const after = (await (await page.request.get(`${origin}/api/v1/sharing`)).json()) as {
    items: { displayName: string | null; grants: unknown[] }[];
  };
  expect(after.items.find((person) => person.displayName === "Bea")?.grants).toEqual([]);
});

test("removing the partner ends what the owner shares and the membership", async ({ page }) => {
  if (pair === undefined) {
    await signInAs(page, "noor");
    await page.goto("/sharing");
    if (await page.getByText(sentences.loadFailed).isVisible()) {
      await expectUnavailable(page);
      return;
    }
    throw new Error("the invitation test did not leave an owner and a partner");
  }
  await page.context().addCookies(pair.owner.cookies);
  await page.goto("/sharing");
  const bea = page.getByRole("article", { name: "Bea" });
  await bea.getByRole("button", { name: "Remove Bea" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Bea?" });
  await expect(dialog).toContainText(
    "Bea leaves your household and loses access to everything you share, right now. What Bea added to your record stays with you.",
  );
  await dialog.getByRole("button", { name: "Remove Bea" }).click();
  await expect(page.getByText("Bea no longer sees anything you share.")).toBeVisible();
  await expect(page.getByRole("article", { name: "Bea" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: sentences.empty })).toBeVisible();
});

test("failures say what to do next: a failed save, a sign-in that is too old, a lost connection and refused invitations", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const cookies = await signInAs(page, "noor");
  // A net under everything else here: no change from this test ever reaches the shared seed.
  await page.route(/\/api\/v1\/sharing(\/|$)/, (route) =>
    route.request().method() === "GET" ? route.fallback() : problem(route, 500, "internal"),
  );
  await page.goto("/sharing");
  if (cookies === null) {
    await expectUnavailable(page);
    return;
  }
  const theo = page.getByRole("article", { name: "Theo" });

  // A failed save keeps the step open with the next step, and nothing turns on.
  await theo.getByRole("switch", { name: "Cycle history", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your cycle history with Theo?" });
  await dialog.getByRole("button", { name: "Share with Theo" }).click();
  await expect(dialog.getByText(sentences.server)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(theo.getByRole("switch", { name: "Cycle history", exact: true })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // A session older than ten minutes: the step closes and the card offers a fresh sign-in.
  await page.route("**/api/v1/sharing/grants/*", (route) =>
    problem(route, 401, "unauthenticated", "fresh_authentication_required"),
  );
  await theo.getByRole("switch", { name: "Cycle history", exact: true }).click();
  await dialog.getByRole("button", { name: "Share with Theo" }).click();
  await expect(theo.getByText(sentences.freshGrant)).toBeVisible();
  await expect(theo.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/sign-in?next=%2Fsharing",
  );
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await checkState(page, "the sign-in-again step");

  // A revoke whose answer never came: it says so under the row, and the switch stays on.
  await page.route("**/api/v1/sharing/grants/*/*", (route) => route.abort("internetdisconnected"));
  await theo.getByRole("switch", { name: "Symptoms", exact: true }).click();
  await expect(theo.getByText(sentences.offline)).toBeVisible();
  await expect(theo.getByRole("switch", { name: "Symptoms", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // The notice has its own error line, under its own row.
  await theo.getByRole("switch", { name: "Tell Theo when my period starts" }).click();
  const notifyRow = theo
    .getByRole("listitem")
    .filter({ hasText: "Tell Theo when my period starts" });
  await expect(notifyRow.getByText(sentences.server)).toBeVisible();

  // A removal that failed says so beside the action, and leaves Theo where he is.
  await theo.getByRole("button", { name: "Remove Theo" }).click();
  await page
    .getByRole("dialog", { name: "Remove Theo?" })
    .getByRole("button", { name: "Remove Theo" })
    .click();
  await expect(theo.locator("footer").getByText(sentences.server)).toBeVisible();
  await expect(notifyRow.getByText(sentences.server)).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Theo" })).toBeVisible();

  // Invitations: each refusal names its reason, and a stale sign-in asks for a fresh one.
  const email = page.getByRole("textbox", { name: /Their email/ });
  const send = page.getByRole("button", { name: "Send the invitation" });
  await send.click();
  await expect(page.getByText("Enter their email address, like name@example.com.")).toBeVisible();
  await email.fill("jo@example.test");
  for (const [status, code, detail, sentence] of [
    [
      409,
      "conflict",
      "invitation_pending",
      "An invitation to this address is already waiting. Withdraw it to send a new one.",
    ],
    [
      409,
      "conflict",
      "member_of_another_household",
      "Only the person who started your household can invite people into it. Ask them to send the invitation.",
    ],
    [
      503,
      "internal",
      "mail_unavailable",
      "Tidefern cannot send email right now, so nothing was sent. Try again later.",
    ],
    [401, "unauthenticated", "fresh_authentication_required", sentences.freshInvite],
  ] as const) {
    await page.route("**/api/v1/sharing/invitations", (route) =>
      route.request().method() === "POST" ? problem(route, status, code, detail) : route.fallback(),
    );
    await send.click();
    await expect(page.getByText(sentence)).toBeVisible();
  }
});

test("accepting: an invitation that cannot be used, a household choice, and a link that is not complete", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const cookies = await signInAs(page, "noor");
  const token = unknownToken();
  const sent = recordRequests(page);
  await page.goto(`/sharing#invitation=${token}`);
  const panel = page.getByRole("region", { name: "An invitation for you" });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\/sharing$/);
  const written = await addressesAfterRefresh(page);
  for (const url of written) expect(url, "the address the router wrote back").not.toContain("#");
  await expect(page).toHaveURL(/\/sharing$/);
  if (cookies === null) {
    // While the panel holds the token, a reload would lose it, so the failed read asks to accept first.
    await expect(page.getByRole("heading", { level: 1, name: "Sharing" })).toBeVisible();
    await expect(page.getByText(sentences.loadFailedHolding)).toBeVisible();
    await expect(page.getByText(sentences.loadFailed)).toHaveCount(0);
    await checkState(page, "the failed read with the acceptance panel");
    return;
  }

  // An unknown token: the real answer is one 404 for every reason, and the page never says which.
  const answered = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/sharing/invitations/accept"),
  );
  await panel.getByRole("button", { name: "Accept the invitation" }).click();
  expect((await answered).status()).toBe(404);
  await expect(panel.getByText(sentences.notOpen)).toBeVisible();
  await expect(panel.getByRole("button")).toHaveCount(0);
  for (const line of sent) expect(line, "a request's path and query").not.toContain(token);

  // A household choice, answered by the browser's calls only: nothing reaches the seed.
  await page.route("**/api/v1/sharing/invitations/accept", async (route) => {
    const body = route.request().postDataJSON() as { household?: string };
    if (body.household === undefined) {
      return problem(route, 409, "conflict", "household_choice_required");
    }
    if (body.household === "move") {
      return problem(route, 409, "conflict", "household_owner_must_hand_over");
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        invitationId: "018f5e7a-5eed-7002-8000-0000000000aa",
        joined: false,
        householdId: null,
      }),
    });
  });
  await page.goto("about:blank");
  await page.goto(`/sharing#invitation=${unknownToken()}`);
  await panel.getByRole("button", { name: "Accept the invitation" }).click();
  await expect(panel.getByText(sentences.choice)).toBeVisible();
  await checkState(page, "the household choice");
  await panel.getByRole("button", { name: "Move to the new household" }).click();
  await expect(panel.getByText(sentences.handOver)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Move to the new household" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Stay where I am" }).click();
  await expect(panel.getByText(sentences.stayed)).toBeVisible();

  // A link that is not a token: said on the page, and no acceptance is sent.
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
  });
  await page.goto("about:blank");
  await page.goto("/sharing#invitation=short");
  await expect(panel.getByText(sentences.incomplete)).toBeVisible();
  await expect(page).toHaveURL(/\/sharing$/);
  await expect(panel.getByRole("button")).toHaveCount(0);
  expect(posts).not.toContain("/api/v1/sharing/invitations/accept");
});
