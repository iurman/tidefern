import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sharingCopy } from "./copy";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { InviteForm, invitableEmail } = await import("./invite-form");

const copy = sharingCopy.invite;

interface Call {
  path: string;
  key: string | null;
  body: unknown;
}

let calls: Call[] = [];
let answers: Array<() => Response>;

beforeEach(() => {
  calls = [];
  answers = [];
  refresh.mockClear();
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.text();
    calls.push({
      path: `${request.method} ${url.pathname}${url.search}`,
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
});

const problem =
  (status: number, detail?: string, code = "conflict") =>
  () =>
    Response.json(
      { type: `urn:tidefern:problem:${code}`, title: "Refused", status, code, detail },
      { status, headers: { "content-type": "application/problem+json" } },
    );

function email() {
  return screen.getByRole("textbox", { name: /Their email/ });
}

describe("InviteForm", () => {
  it("says what the invitation does before anything is sent, and asks for an address", async () => {
    const user = userEvent.setup();
    render(<InviteForm />);
    expect(email()).toHaveAccessibleDescription(copy.email.help);
    expect(email()).toHaveAttribute("autocomplete", "off");
    await user.type(email(), "not an address");
    await user.click(screen.getByRole("button", { name: copy.submit }));
    expect(screen.getByText(copy.emailInvalid)).toBeVisible();
    expect(email()).toHaveFocus();
    expect(email()).toHaveAttribute("aria-invalid", "true");
    expect(calls).toEqual([]);
    expect(invitableEmail("jo@example.test")).toBe(true);
  });

  it("sends the address and the role in the body, says it was sent and reads the page again", async () => {
    const user = userEvent.setup();
    render(<InviteForm />);
    await user.type(email(), " Jo@Example.test ");
    await user.click(screen.getByRole("radio", { name: "Guardian" }));
    answers.push(() =>
      Response.json(
        {
          id: "018f5e7a-5eed-7002-8000-000000000009",
          householdId: "018f5e7a-5eed-7001-8000-000000000001",
          inviteeEmail: "jo@example.test",
          role: "guardian",
          createdAt: "2026-10-07T09:00:00.000Z",
          expiresAt: "2026-10-10T09:00:00.000Z",
        },
        { status: 201 },
      ),
    );
    await user.click(screen.getByRole("button", { name: copy.submit }));
    expect(await screen.findByText(copy.sent("jo@example.test"))).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: "POST /api/v1/sharing/invitations",
      body: { inviteeEmail: "Jo@Example.test", role: "guardian" },
    });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(email()).toHaveValue("");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("names why an invitation was refused", async () => {
    const user = userEvent.setup();
    render(<InviteForm />);
    await user.type(email(), "jo@example.test");
    answers.push(problem(409, "invitation_pending"));
    await user.click(screen.getByRole("button", { name: copy.submit }));
    expect(await screen.findByText(copy.pendingAlready)).toBeVisible();
    answers.push(problem(503, "mail_unavailable", "internal"));
    await user.click(screen.getByRole("button", { name: copy.submit }));
    expect(await screen.findByText(copy.mailUnavailable)).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers a fresh sign-in when the API asks for one, never a retry", async () => {
    const user = userEvent.setup();
    render(<InviteForm />);
    await user.type(email(), "jo@example.test");
    answers.push(problem(401, "fresh_authentication_required", "unauthenticated"));
    await user.click(screen.getByRole("button", { name: copy.submit }));
    expect(await screen.findByText(sharingCopy.freshAuth.invite)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fsharing",
    );
  });
});
