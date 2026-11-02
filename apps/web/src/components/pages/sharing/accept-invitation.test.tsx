import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharingCopy } from "./copy";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const goTo = vi.hoisted(() => vi.fn());
vi.mock("./problems", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./problems")>()),
  goTo,
}));

const { AcceptInvitation, acceptableToken } = await import("./accept-invitation");

const copy = sharingCopy.accept;
/** A token shaped like the API's: 32 random bytes as base64url, 43 characters. */
const token = "q3Zr7Hc1-_b9Kx0LmN2pQ4sT6uV8wY0aB1cD3eF5gH7";
const household = "018f5e7a-5eed-7001-8000-000000000001";
const invitationId = "018f5e7a-5eed-7002-8000-000000000002";

interface Call {
  path: string;
  query: string;
  key: string | null;
  body: unknown;
}

let calls: Call[] = [];
let answers: Array<() => Response>;

beforeEach(() => {
  calls = [];
  answers = [];
  refresh.mockClear();
  goTo.mockClear();
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.text();
    calls.push({
      path: `${request.method} ${url.pathname}`,
      query: url.search,
      key: request.headers.get("idempotency-key"),
      body: text === "" ? undefined : JSON.parse(text),
    });
    const next = answers.shift();
    if (next === undefined) throw new Error(`unexpected ${request.method} ${url.pathname}`);
    return next();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

function openedAt(hash: string) {
  window.history.replaceState(null, "", `/sharing${hash}`);
}

const problem = (status: number, detail?: string) => () =>
  Response.json(
    { type: "urn:tidefern:problem:conflict", title: "Refused", status, code: "conflict", detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );

/** What the API answers from a stored idempotency row: the status and code, never the detail. */
const replayed = (status: number) => () =>
  Response.json(
    { type: "urn:tidefern:problem:conflict", title: "Conflict", status, code: "conflict" },
    {
      status,
      headers: { "content-type": "application/problem+json", "Idempotency-Replayed": "true" },
    },
  );

describe("AcceptInvitation", () => {
  it("renders nothing and calls nothing when the page was not opened from a link", async () => {
    openedAt("");
    const { container } = render(<AcceptInvitation householdOwners={{}} />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container).toBeEmptyDOMElement();
    expect(calls).toEqual([]);
  });

  it("takes the token out of the address bar and accepts it only on a press, in the body", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{ [household]: "Noor" }} />);
    expect(await screen.findByRole("heading", { name: copy.heading })).toBeVisible();
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.pathname).toBe("/sharing");
    expect(calls).toEqual([]);

    answers.push(() => Response.json({ invitationId, joined: true, householdId: household }));
    await user.click(screen.getByRole("button", { name: copy.action }));
    expect(await screen.findByText("You joined Noor's household.")).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: "POST /api/v1/sharing/invitations/accept",
      query: "",
      body: { token },
    });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refuses a token of the wrong shape on the page, with no request", async () => {
    openedAt("#invitation=abc");
    render(<AcceptInvitation householdOwners={{}} />);
    expect(await screen.findByText(copy.incomplete)).toBeVisible();
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
    expect(acceptableToken("abc")).toBe(false);
    expect(acceptableToken(token)).toBe(true);
  });

  it("asks someone in another household to move or stay, and stays on the second call", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{}} />);
    answers.push(problem(409, "household_choice_required"));
    await user.click(await screen.findByRole("button", { name: copy.action }));
    expect(await screen.findByText(copy.choice)).toBeVisible();
    expect(screen.getByRole("button", { name: copy.move })).toBeVisible();

    answers.push(() => Response.json({ invitationId, joined: false, householdId: null }));
    await user.click(screen.getByRole("button", { name: copy.stay }));
    expect(await screen.findByText(copy.stayed)).toBeVisible();
    expect(calls.map((call) => call.body)).toEqual([{ token }, { token, household: "stay" }]);
    expect(calls[0]?.key).not.toBe(calls[1]?.key);
  });

  it("offers only staying to someone who owns a household others still belong to", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{}} />);
    answers.push(problem(409, "household_choice_required"));
    await user.click(await screen.findByRole("button", { name: copy.action }));
    answers.push(problem(409, "household_owner_must_hand_over"));
    await user.click(await screen.findByRole("button", { name: copy.move }));
    expect(await screen.findByText(copy.handOver)).toBeVisible();
    expect(screen.queryByRole("button", { name: copy.move })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.stay })).toBeVisible();
  });

  it("says an invitation cannot be used without saying why, and forgets the token", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{}} />);
    answers.push(problem(404));
    await user.click(await screen.findByRole("button", { name: copy.action }));
    expect(await screen.findByText(copy.notOpen)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("retries a press whose answer never came with the same key, so the server can replay it", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{}} />);
    answers.push(() => {
      throw new TypeError("Failed to fetch");
    });
    await user.click(await screen.findByRole("button", { name: copy.action }));
    expect(await screen.findByText(sharingCopy.failure.offline)).toBeVisible();
    // A replay of a finished acceptance carries no body.
    answers.push(() => new Response(null, { status: 200 }));
    await user.click(screen.getByRole("button", { name: copy.action }));
    expect(await screen.findByText("You joined the household.")).toBeVisible();
    expect(calls[0]?.key).toBe(calls[1]?.key);
  });

  it("asks again under a new key when a lost answer's refusal comes back as a replay without its detail", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{}} />);
    // The server stored a household choice for the first press, and the answer never arrived.
    answers.push(() => {
      throw new TypeError("Failed to fetch");
    });
    await user.click(await screen.findByRole("button", { name: copy.action }));
    expect(await screen.findByText(sharingCopy.failure.offline)).toBeVisible();
    // The retry gets the stored refusal back without its detail, so the panel asks once more.
    answers.push(replayed(409));
    answers.push(problem(409, "household_choice_required"));
    await user.click(screen.getByRole("button", { name: copy.action }));
    expect(await screen.findByText(copy.choice)).toBeVisible();
    expect(screen.queryByText(copy.failed)).not.toBeInTheDocument();
    expect(calls.map((call) => call.body)).toEqual([{ token }, { token }, { token }]);
    expect(calls[1]?.key).toBe(calls[0]?.key);
    expect(calls[2]?.key).not.toBe(calls[1]?.key);
  });

  it("sends the next press of a step under a new key once the server answered the last one", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{ [household]: "Noor" }} />);
    answers.push(problem(429));
    await user.click(await screen.findByRole("button", { name: copy.action }));
    expect(await screen.findByText(sharingCopy.failure.tooMany)).toBeVisible();
    answers.push(() => Response.json({ invitationId, joined: true, householdId: household }));
    await user.click(screen.getByRole("button", { name: copy.action }));
    expect(await screen.findByText("You joined Noor's household.")).toBeVisible();
    expect(calls[1]?.key).not.toBe(calls[0]?.key);
  });

  it("under a failed read, asks for the acceptance before a reload while it holds a token", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{}} readFailed />);
    expect(await screen.findByText(sharingCopy.loadFailedHolding)).toBeVisible();
    expect(screen.queryByText(sharingCopy.loadFailed)).not.toBeInTheDocument();
    // Once the token is spent, a reload loses nothing.
    answers.push(problem(404));
    await user.click(screen.getByRole("button", { name: copy.action }));
    expect(await screen.findByText(copy.notOpen)).toBeVisible();
    expect(screen.getByText(sharingCopy.loadFailed)).toBeVisible();
    expect(screen.queryByText(sharingCopy.loadFailedHolding)).not.toBeInTheDocument();
  });

  it("says only the failed read when the page was not opened from a link", async () => {
    openedAt("");
    render(<AcceptInvitation householdOwners={{}} readFailed />);
    expect(screen.getByText(sharingCopy.loadFailed)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText(sharingCopy.loadFailed)).toBeVisible();
    expect(calls).toEqual([]);
  });

  it("sends a lost session back through sign-in with the token in the fragment, never a query", async () => {
    const user = userEvent.setup();
    openedAt(`#invitation=${token}`);
    render(<AcceptInvitation householdOwners={{}} />);
    answers.push(() =>
      Response.json(
        {
          type: "urn:tidefern:problem:unauthenticated",
          title: "Sign in",
          status: 401,
          code: "unauthenticated",
        },
        { status: 401 },
      ),
    );
    await user.click(await screen.findByRole("button", { name: copy.action }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(`/sign-in#invitation=${token}`));
  });
});
