import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Processor } from "@/components/ui/consent-record";

const leave = vi.hoisted(() => vi.fn());
vi.mock("./leave", () => ({ leaveTo: leave }));

const auth = vi.hoisted(() => ({ getSession: vi.fn(), addPasskey: vi.fn() }));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...actual,
    authClient: { getSession: auth.getSession, passkey: { addPasskey: auth.addPasskey } },
  };
});

// The browser's own zone, as a Berlin browser reports it.
vi.mock("./zone-step", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./zone-step")>();
  return { ...actual, browserZone: () => "Europe/Berlin" };
});

const { WelcomeFlow } = await import("./welcome-flow");

const now = "2026-10-05T10:00:00.000Z";
const processors: Processor[] = [
  { name: "Vercel", receives: "Runs the application" },
  { name: "Neon (Databricks, Inc.)", receives: "Hosts the database" },
];

interface Call {
  method: string;
  path: string;
  key: string | null;
  body: unknown;
}

let calls: Call[] = [];
let routes: Map<string, Array<() => Response>>;

function route(key: string, ...answers: Array<() => Response>) {
  routes.set(key, [...(routes.get(key) ?? []), ...answers]);
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });
const problem = (status: number, detail?: string) => () =>
  new Response(JSON.stringify({ type: "urn:tidefern:problem:x", title: "x", status, detail }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
/** A request that never gets an answer, as when the connection drops. */
const dropped = () => {
  throw new TypeError("Failed to fetch");
};

beforeEach(() => {
  calls = [];
  routes = new Map();
  leave.mockReset();
  auth.getSession.mockReset().mockResolvedValue({ data: { user: { name: "Sam" } }, error: null });
  auth.addPasskey.mockReset();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.history.replaceState(null, "", "/welcome");
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.text();
    calls.push({
      method: request.method,
      path: url.pathname,
      key: request.headers.get("idempotency-key"),
      body: text === "" ? undefined : JSON.parse(text),
    });
    const next = routes.get(`${request.method} ${url.pathname}`)?.shift();
    if (next === undefined) throw new Error(`unexpected ${request.method} ${url.pathname}`);
    return next();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
});

const user = () => userEvent.setup();

async function press(name: RegExp | string) {
  await user().click(screen.getByRole("button", { name }));
}

async function typeDate(group: RegExp, iso: string) {
  const fieldset = screen.getByRole("group", { name: group });
  const [year, month, day] = iso.split("-") as [string, string, string];
  await user().type(within(fieldset).getByLabelText("Month"), month);
  await user().type(within(fieldset).getByLabelText("Day"), day);
  await user().type(within(fieldset).getByLabelText("Year"), year);
}

async function throughZoneAndStage(stage: string) {
  await press("Use Europe/Berlin");
  await press("Continue");
  await user().click(screen.getByRole("radio", { name: stage }));
  await press("Continue");
}

async function agree({ consent = true } = {}) {
  if (consent)
    await user().click(screen.getByRole("checkbox", { name: /I agree to Tidefern collecting/ }));
  await user().click(screen.getByRole("checkbox", { name: /I accept the terms of use/ }));
  await user().click(screen.getByRole("checkbox", { name: /I am 18 or older/ }));
}

/** Answers for a cycle path that saves a period start. */
function cycleAnswers() {
  route("POST /api/v1/me/consents", json({ id: "0199b0a0-0000-7000-8000-000000000001" }, 201));
  route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
  route("PUT /api/v1/cycle/entries/2026-09-23", json({ id: "e", version: 1 }));
}

async function throughCycleDates() {
  await throughZoneAndStage("Cycle");
  await typeDate(/When did your last period start/, "2026-09-23");
  await press("Continue");
}

describe("onboarding", () => {
  it("offers the browser's zone without choosing it, and asks for one before going on", async () => {
    render(<WelcomeFlow now={now} processors={processors} />);
    expect(screen.getByRole("heading", { level: 2, name: "Where are you?" })).toBeVisible();
    expect(screen.getByText("Your device is set to Europe/Berlin.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: /Time zone/ })).toHaveValue("");
    expect(screen.getByText(/Nothing is saved until you agree to the terms/)).toBeVisible();

    await press("Continue");
    expect(screen.getByText("Choose a zone from the list.")).toBeVisible();
    // Focus would open the zone list over that line, so it stays on Continue and the list stays shut.
    expect(screen.getByRole("combobox", { name: /Time zone/ })).not.toHaveFocus();
    expect(screen.getByRole("combobox", { name: /Time zone/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(calls).toEqual([]);

    await press("Use Europe/Berlin");
    expect(screen.getByRole("combobox", { name: /Time zone/ })).toHaveValue("Europe/Berlin");
    expect(screen.getByText(/Europe\/Berlin is at GMT\+02:00 right now/)).toBeVisible();
  });

  it("walks the cycle path and writes the consent, then the profile, then the period start", async () => {
    cycleAnswers();
    render(<WelcomeFlow now={now} processors={processors} />);
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    await throughZoneAndStage("Cycle");
    expect(screen.getByRole("heading", { level: 2, name: "Your dates" })).toHaveFocus();
    // Medium is chosen and can be changed before saving (the wave's period ruling).
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
    await typeDate(/When did your last period start/, "2026-09-23");
    await user().click(screen.getByRole("radio", { name: "Heavy" }));
    await press("Continue");

    expect(screen.getByRole("heading", { level: 2, name: "Your consent" })).toBeVisible();
    for (const category of ["Cycle history", "Symptoms", "Private notes"]) {
      expect(screen.getByText(category)).toBeVisible();
    }
    expect(
      screen.getByRole("checkbox", { name: /I agree to Tidefern collecting/ }),
    ).not.toBeChecked();
    await agree();
    expect(calls).toEqual([]);
    await press("Finish");

    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/v1/me/consents",
      "PUT /api/v1/me/profile",
      "PUT /api/v1/cycle/entries/2026-09-23",
    ]);
    expect(calls[0]?.body).toEqual({
      categories: ["cycle.history", "cycle.symptoms", "journal.private"],
      textVersion: "2026-10",
      termsVersion: "2026-10",
    });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]?.body).toMatchObject({
      displayName: "Sam",
      timeZone: "Europe/Berlin",
      stage: "cycle",
      ageAttested: true,
    });
    expect(calls[2]?.body).toEqual({ flow: "heavy" });
  });

  it("says the consent did not land, and tries again with the same key", async () => {
    route("POST /api/v1/me/consents", problem(500), json({ id: "x" }, 201));
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    route("PUT /api/v1/cycle/entries/2026-09-23", json({ id: "e", version: 1 }));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughCycleDates();
    await agree();
    await press("Finish");

    expect(
      await screen.findByText("We could not record your consent. Wait a moment and try again."),
    ).toBeVisible();
    expect(leave).not.toHaveBeenCalled();
    await press("Try again");
    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    const consents = calls.filter((call) => call.path === "/api/v1/me/consents");
    expect(consents).toHaveLength(2);
    expect(consents[1]?.key).toBe(consents[0]?.key);
  });

  it("puts a failure away when she goes back before the profile is saved, and resumes on return", async () => {
    route("POST /api/v1/me/consents", problem(503), json({ id: "x" }, 201));
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    route("PUT /api/v1/cycle/entries/2026-09-23", json({ id: "e", version: 1 }));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughCycleDates();
    await agree();
    await press("Finish");
    expect(await screen.findByText(/We could not record your consent/)).toBeVisible();

    await press("Back");
    expect(screen.getByRole("heading", { level: 2, name: "Your dates" })).toBeVisible();
    expect(screen.queryByText(/We could not record your consent/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await press("Continue");
    await press("Finish");
    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    const consents = calls.filter((call) => call.path === "/api/v1/me/consents");
    expect(consents[1]?.key).toBe(consents[0]?.key);
  });

  it("resumes at the profile after it failed, never recording the consent twice", async () => {
    route("POST /api/v1/me/consents", json({ id: "x" }, 201));
    route("PUT /api/v1/me/profile", dropped, json({ version: 1 }, 201));
    route("PUT /api/v1/cycle/entries/2026-09-23", json({ id: "e", version: 1 }));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughCycleDates();
    await agree();
    await press("Finish");

    expect(
      await screen.findByText(
        "We could not save your profile. Check your connection and try again.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Saved so far: your consent.")).toBeVisible();
    // The consent is recorded, so its box stays ticked and still.
    expect(screen.getByRole("checkbox", { name: /I agree to Tidefern collecting/ })).toBeDisabled();
    await press("Try again");
    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    expect(calls.filter((call) => call.path === "/api/v1/me/consents")).toHaveLength(1);
  });

  it("settles the earlier steps once the profile is saved, and lets a fact be skipped", async () => {
    route("POST /api/v1/me/consents", json({ id: "x" }, 201));
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    route("PUT /api/v1/cycle/entries/2026-09-23", problem(503));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughCycleDates();
    await agree();
    await press("Finish");

    expect(
      await screen.findByText("We could not save your period start. Wait a moment and try again."),
    ).toBeVisible();
    expect(screen.getByText("Saved so far: your consent and your profile.")).toBeVisible();
    expect(screen.getByText("You can log it later from Today.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await press("Skip for now");
    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    expect(calls.filter((call) => call.path.startsWith("/api/v1/cycle/entries"))).toHaveLength(1);
  });

  it("sends a person whose session ended to sign in again instead of retrying", async () => {
    route("POST /api/v1/me/consents", problem(401));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughCycleDates();
    await agree();
    await press("Finish");
    expect(
      await screen.findByText("Your session has ended. Sign in again to finish."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("asks here for someone else nothing about her body and records no consent", async () => {
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughZoneAndStage("Here for someone else");

    expect(screen.getByRole("heading", { level: 2, name: "Before you start" })).toBeVisible();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /I agree to Tidefern collecting/ })).toBeNull();
    await press("Finish");
    expect(screen.getByText("Accept the terms to continue.")).toBeVisible();
    expect(screen.getByText("Confirm you are 18 or older to continue.")).toBeVisible();
    await agree({ consent: false });
    await press("Finish");

    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["PUT /api/v1/me/profile"]);
    expect(calls[0]?.body).toMatchObject({ stage: "none", ageAttested: true });
  });

  it("dates a pregnancy from a scan, method first, and retries with the same id and key", async () => {
    route("POST /api/v1/me/consents", json({ id: "x" }, 201));
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    route("POST /api/v1/pregnancies", problem(500), json({ id: "p" }, 201));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughZoneAndStage("Pregnancy");
    await press("Continue");
    expect(screen.getByText("Choose how your due date was worked out.")).toBeVisible();

    await user().click(screen.getByRole("radio", { name: "From a scan" }));
    await typeDate(/Date of the scan/, "2026-09-21");
    await user().type(screen.getByRole("textbox", { name: /^Weeks/ }), "12");
    await user().type(screen.getByRole("textbox", { name: /^Days/ }), "3");
    await press("Continue");
    await agree();
    await press("Finish");

    expect(
      await screen.findByText("We could not save your pregnancy. Wait a moment and try again."),
    ).toBeVisible();
    await press("Try again");
    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    const starts = calls.filter((call) => call.path === "/api/v1/pregnancies");
    expect(starts).toHaveLength(2);
    expect(starts[0]?.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      dating: { method: "ultrasound", scanDate: "2026-09-21", weeks: 12, days: 3 },
    });
    expect(starts[1]?.body).toEqual(starts[0]?.body);
    expect(starts[1]?.key).toBe(starts[0]?.key);
    expect(calls[1]?.body).toMatchObject({ stage: "pregnancy" });
  });

  it("adds the baby with the guardian's consent, then the period since", async () => {
    route("POST /api/v1/me/consents", json({ id: "x" }, 201));
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    route("POST /api/v1/children", json({ id: "c" }, 201));
    route("PUT /api/v1/cycle/entries/2026-09-28", json({ id: "e", version: 1 }));
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughZoneAndStage("Postpartum");
    expect(screen.getByText(/On the child's behalf, you agree that Tidefern keeps/)).toBeVisible();

    await user().type(screen.getByRole("textbox", { name: /Your baby's name/ }), "Ilo");
    await typeDate(/When was the birth/, "2026-08-20");
    await typeDate(/If a period has come since/, "2026-09-28");
    await press("Continue");
    expect(screen.getByText("Tick the box to add your baby.")).toBeVisible();
    await user().click(screen.getByRole("checkbox", { name: /I agree on my baby's behalf/ }));
    await press("Continue");
    await agree();
    await press("Finish");

    await waitFor(() => expect(leave).toHaveBeenCalledWith("/today"));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/v1/me/consents",
      "PUT /api/v1/me/profile",
      "POST /api/v1/children",
      "PUT /api/v1/cycle/entries/2026-09-28",
    ]);
    expect(calls[2]?.body).toMatchObject({
      displayName: "Ilo",
      dateOfBirth: "2026-08-20",
      guardianConsent: { given: true, textVersion: "2026-10" },
    });
    expect(calls[3]?.body).toEqual({ flow: "medium" });
  });

  it("refuses a day still to come and half a date, before anything is sent", async () => {
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughZoneAndStage("Cycle");
    await typeDate(/When did your last period start/, "2027-11-20");
    await press("Continue");
    expect(screen.getByText("Choose a day up to today.")).toBeVisible();
    const fieldset = screen.getByRole("group", { name: /When did your last period start/ });
    await user().clear(within(fieldset).getByLabelText("Year"));
    await press("Continue");
    expect(screen.getByText("Finish the date, or clear it to skip.")).toBeVisible();
    expect(calls).toEqual([]);
  });

  it("goes back without losing what she entered, and counts the steps again for a new stage", async () => {
    render(<WelcomeFlow now={now} processors={processors} />);
    await throughZoneAndStage("Cycle");
    await typeDate(/When did your last period start/, "2026-09-23");
    await press("Continue");
    await press("Back");
    const fieldset = screen.getByRole("group", { name: /When did your last period start/ });
    expect(within(fieldset).getByLabelText("Day")).toHaveValue("23");
    await press("Back");
    expect(screen.getByRole("radio", { name: "Cycle" })).toBeChecked();
    await user().click(screen.getByRole("radio", { name: "Here for someone else" }));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("forwards an invitation it arrived with to the sharing screen, and drops it from the address", async () => {
    window.history.replaceState(null, "", "/welcome#invitation=abc");
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    render(<WelcomeFlow now={now} processors={processors} />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    await throughZoneAndStage("Here for someone else");
    await agree({ consent: false });
    await press("Finish");
    await waitFor(() => expect(leave).toHaveBeenCalledWith("/sharing#invitation=abc"));
  });

  it("offers a passkey after the writes when the browser has WebAuthn, with Not now", async () => {
    (window as { PublicKeyCredential?: unknown }).PublicKeyCredential =
      function PublicKeyCredential() {};
    route("PUT /api/v1/me/profile", json({ version: 1 }, 201));
    auth.addPasskey
      .mockResolvedValueOnce({
        data: null,
        error: { code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", status: 400 },
      })
      .mockResolvedValueOnce({ data: { id: "passkey" }, error: null });
    render(<WelcomeFlow now={now} processors={processors} />);
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    await throughZoneAndStage("Here for someone else");
    await agree({ consent: false });
    await press("Continue");

    expect(await screen.findByRole("heading", { level: 2, name: "Add a passkey" })).toBeVisible();
    expect(screen.getByText("Your account is set up.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Not now" })).toBeVisible();
    await press("Add a passkey");
    expect(
      await screen.findByText("The passkey prompt was closed. Try again, or choose Not now."),
    ).toBeVisible();
    await press("Add a passkey");
    expect(await screen.findByText("Your passkey is saved.")).toBeVisible();
    // No name and no context: both would travel in the options request's query.
    expect(auth.addPasskey).toHaveBeenCalledWith();
    await press("Finish");
    expect(leave).toHaveBeenCalledWith("/today");
  });
});
