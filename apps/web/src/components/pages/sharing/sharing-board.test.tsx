import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { components, Me } from "@tidefern/api-client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sharingCopy as copy } from "./copy";
import { buildSharingView, type SharingInput } from "./people";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const goTo = vi.hoisted(() => vi.fn());
vi.mock("./problems", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./problems")>()),
  goTo,
}));

const { SharingBoard } = await import("./sharing-board");

type SharingPerson = components["schemas"]["SharingPerson"];

const NOOR = "018f5e7a-5eed-7000-8000-000000000001";
const THEO = "018f5e7a-5eed-7000-8000-000000000002";
const MIRA = "018f5e7a-5eed-7000-8000-000000000003";
const LENA = "018f5e7a-5eed-7000-8000-000000000004";
const PIA = "018f5e7a-5eed-7000-8000-000000000005";
const HOUSEHOLD_A = "018f5e7a-5eed-7001-8000-000000000001";
const HOUSEHOLD_B = "018f5e7a-5eed-7001-8000-000000000002";
const ILO = "018f5e7a-5eed-7006-8000-000000000001";
const SOL = "018f5e7a-5eed-7006-8000-000000000002";
const INVITATION = "018f5e7a-5eed-7002-8000-000000000009";

function me(id: string, stage: "cycle" | "none" | "postpartum", patch: Partial<Me> = {}): Me {
  return {
    id,
    profile: {
      displayName: null,
      timeZone: "Europe/Berlin",
      stage,
      weekStart: 1,
      units: "metric",
      notificationDetail: "generic",
    },
    today: "2026-10-05",
    guardianOf: [],
    grants: [],
    session: {
      expiresAt: "2026-10-12T00:00:00.000Z",
      authenticatedAt: "2026-10-05T00:00:00.000Z",
    },
    ...patch,
  };
}

const grantBase = {
  notify: false,
  version: 1,
  createdAt: "2026-06-27T00:00:00.000Z",
  updatedAt: "2026-06-27T00:00:00.000Z",
};

const theo: SharingPerson = {
  id: THEO,
  displayName: "Theo",
  role: "partner",
  householdId: HOUSEHOLD_A,
  guardianOf: [],
  notify: true,
  version: 3,
  grants: [
    {
      ...grantBase,
      id: "018f5e7a-5eed-7004-8000-000000000001",
      category: "cycle.status",
      level: "summary",
      notify: true,
    },
    {
      ...grantBase,
      id: "018f5e7a-5eed-7004-8000-000000000002",
      category: "cycle.symptoms",
      level: "read",
    },
  ],
};

function noorView(invitations: SharingInput["invitations"] = []) {
  return buildSharingView({ me: me(NOOR, "cycle"), people: [theo], invitations, children: [] });
}

function miraView() {
  return buildSharingView({
    me: me(MIRA, "postpartum", { guardianOf: [ILO, SOL] }),
    children: [
      { id: ILO, displayName: "Ilo" },
      { id: SOL, displayName: "Sol" },
    ],
    invitations: [],
    people: [
      {
        id: LENA,
        displayName: "Lena",
        role: "partner",
        householdId: HOUSEHOLD_B,
        guardianOf: [ILO, SOL],
        notify: false,
        version: 1,
        grants: [
          {
            ...grantBase,
            id: "018f5e7a-5eed-7004-8000-000000000006",
            category: "pregnancy.overview",
            level: "summary",
          },
        ],
      },
      {
        id: PIA,
        displayName: "Pia",
        role: null,
        householdId: null,
        guardianOf: [],
        notify: false,
        version: 1,
        grants: [
          {
            ...grantBase,
            id: "018f5e7a-5eed-7004-8000-000000000005",
            category: "child",
            level: "read",
            childId: SOL,
          },
        ],
      },
    ],
  });
}

interface Call {
  path: string;
  query: string;
  ifMatch: string | null;
  body: unknown;
}

let calls: Call[] = [];
let answers: Array<() => Response>;

const problem =
  (status: number, detail?: string, code = "conflict") =>
  () =>
    Response.json(
      { type: `urn:tidefern:problem:${code}`, title: "Refused", status, code, detail },
      { status, headers: { "content-type": "application/problem+json" } },
    );

beforeAll(() => {
  // jsdom has no top layer: the modal methods flip the open attribute and fire the events a browser would.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

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
      ifMatch: request.headers.get("if-match"),
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

function card(name: string) {
  return screen.getByRole("article", { name });
}

describe("SharingBoard: turning categories on and off", () => {
  it("turns a category on only through the confirm step, which names the person, the words and the level", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    await user.click(within(card("Theo")).getByRole("switch", { name: "Cycle history" }));
    const dialog = screen.getByRole("dialog", { name: "Share your cycle history with Theo?" });
    expect(dialog).toHaveTextContent(
      "Your past periods, cycle lengths and the next period estimate.",
    );
    expect(dialog).toHaveTextContent("Level: read");
    expect(calls).toEqual([]);

    answers.push(() => Response.json({ ...theo, version: 4 }));
    await user.click(within(dialog).getByRole("button", { name: "Share with Theo" }));
    expect(await screen.findByText("Theo can now see your cycle history.")).toBeVisible();
    expect(calls).toEqual([
      {
        path: `PUT /api/v1/sharing/grants/${THEO}`,
        query: "",
        ifMatch: '"3"',
        body: {
          grants: [{ category: "cycle.history", level: "read" }],
          policyVersion: "2026-10",
          descriptionVersion: "2026-10",
        },
      },
    ]);
    expect(dialog).not.toHaveAttribute("open");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("closes the step without a request when the person keeps it off", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    await user.click(within(card("Theo")).getByRole("switch", { name: "Pregnancy photos" }));
    const dialog = screen.getByRole("dialog", { name: "Share your pregnancy photos with Theo?" });
    expect(dialog).toHaveTextContent("Photos you add to the journey (Phase 2).");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(calls).toEqual([]);
  });

  it("turns a category off in one step, with no dialog", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    answers.push(() => new Response(null, { status: 204 }));
    await user.click(within(card("Theo")).getByRole("switch", { name: "Symptoms" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Theo can no longer see your symptoms.")).toBeVisible();
    expect(calls).toEqual([
      {
        path: `DELETE /api/v1/sharing/grants/${THEO}/cycle.symptoms`,
        query: "",
        ifMatch: null,
        body: undefined,
      },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("names the child of a child grant in the query of its revoke, an id and nothing else", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={miraView()} />);
    answers.push(() => new Response(null, { status: 204 }));
    await user.click(within(card("Pia")).getByRole("switch", { name: "Sol" }));
    expect(
      await screen.findByText("Pia can no longer see everything logged for Sol."),
    ).toBeVisible();
    expect(calls[0]).toMatchObject({
      path: `DELETE /api/v1/sharing/grants/${PIA}/child`,
      query: `?childId=${SOL}`,
    });
  });

  it("closes the step and offers a fresh sign-in on the card when the API asks for one", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    await user.click(within(card("Theo")).getByRole("switch", { name: "Cycle history" }));
    answers.push(problem(401, "fresh_authentication_required", "unauthenticated"));
    await user.click(screen.getByRole("button", { name: "Share with Theo" }));
    const theoCard = card("Theo");
    expect(await within(theoCard).findByText(copy.freshAuth.grant)).toBeVisible();
    expect(within(theoCard).getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fsharing",
    );
    // The step closed: no dialog is open (a closed one has no accessible name to find it by).
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(within(theoCard).getByRole("switch", { name: "Cycle history" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(goTo).not.toHaveBeenCalled();
  });

  it("keeps the step open with the next step when the change failed", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    await user.click(within(card("Theo")).getByRole("switch", { name: "Cycle history" }));
    answers.push(problem(500, undefined, "internal"));
    await user.click(screen.getByRole("button", { name: "Share with Theo" }));
    const dialog = screen.getByRole("dialog", { name: "Share your cycle history with Theo?" });
    expect(await within(dialog).findByText(copy.failure.server)).toBeVisible();
    expect(dialog).toHaveAttribute("open");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads the page again when the person's sharing changed somewhere else", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    await user.click(within(card("Theo")).getByRole("switch", { name: "Cycle history" }));
    answers.push(problem(409, "stale_version"));
    await user.click(screen.getByRole("button", { name: "Share with Theo" }));
    expect(await screen.findByText(copy.failure.changedElsewhere)).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sends a lost session to sign in", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    answers.push(problem(401, undefined, "unauthenticated"));
    await user.click(within(card("Theo")).getByRole("switch", { name: "Symptoms" }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/sign-in"));
  });
});

describe("SharingBoard: the notify switch and removal", () => {
  it("switches the notice with its own PUT and the person's version", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={noorView()} />);
    answers.push(() => Response.json({ ...theo, notify: false, version: 5 }));
    await user.click(
      within(card("Theo")).getByRole("switch", { name: "Tell Theo when my period starts" }),
    );
    expect(await screen.findByText(copy.notify.off("Theo"))).toBeVisible();
    expect(calls).toEqual([
      {
        path: "PUT /api/v1/sharing/notify",
        query: "",
        ifMatch: '"3"',
        body: { personId: THEO, notify: false },
      },
    ]);
  });

  it("holds the notify switch back, saying why, until a period category is shared", () => {
    render(<SharingBoard view={miraView()} />);
    const notify = within(card("Pia")).getByRole("switch", {
      name: "Tell Pia when my period starts",
    });
    expect(notify).toBeDisabled();
    expect(notify).toHaveAccessibleDescription(
      `The message says only that there is something new in Tidefern. ${copy.notify.needsCycle("Pia")}`,
    );
  });

  it("shows a co-guardian's refusal honestly, with the way to Family", async () => {
    const user = userEvent.setup();
    render(<SharingBoard view={miraView()} />);
    const lena = card("Lena");
    expect(lena).toHaveTextContent("partner, co-guardian of Ilo and Sol");
    expect(within(lena).queryByRole("switch", { name: "Ilo" })).not.toBeInTheDocument();
    await user.click(within(lena).getByRole("button", { name: "Remove Lena" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Lena?" });
    expect(dialog).toHaveTextContent(copy.remove.member("Lena"));
    answers.push(problem(409, "co_guardianship_unresolved"));
    await user.click(within(dialog).getByRole("button", { name: "Remove Lena" }));
    expect(
      await within(lena).findByText(copy.remove.coGuardian("Lena", "Ilo and Sol"), {
        exact: false,
      }),
    ).toBeVisible();
    expect(within(lena).getByRole("link", { name: "Go to Family" })).toHaveAttribute(
      "href",
      "/family",
    );
    expect(calls[0]?.path).toBe(`DELETE /api/v1/sharing/people/${LENA}`);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the outcome of removing the last person after the page reads the empty list", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SharingBoard view={noorView()} />);
    await user.click(within(card("Theo")).getByRole("button", { name: "Remove Theo" }));
    expect(screen.getByRole("dialog", { name: "Remove Theo?" })).toHaveTextContent(
      copy.remove.member("Theo"),
    );
    answers.push(() => new Response(null, { status: 204 }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Remove Theo?" })).getByRole("button", {
        name: "Remove Theo",
      }),
    );
    expect(await screen.findByText(copy.remove.removed("Theo"))).toBeVisible();
    expect(calls[0]?.path).toBe(`DELETE /api/v1/sharing/people/${THEO}`);
    expect(refresh).toHaveBeenCalledTimes(1);
    // What router.refresh() brings back: nobody left.
    rerender(
      <SharingBoard
        view={buildSharingView({
          me: me(NOOR, "cycle"),
          people: [],
          invitations: [],
          children: [],
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: copy.empty.heading })).toBeVisible();
    expect(screen.getByText(copy.remove.removed("Theo"))).toBeVisible();
  });

  it("names leaving the household when the person removed owns it, and shows what she shares", async () => {
    const user = userEvent.setup();
    const view = buildSharingView({
      me: me(THEO, "none", {
        grants: [
          {
            id: "018f5e7a-5eed-7004-8000-000000000001",
            ownerId: NOOR,
            category: "cycle.status",
            level: "summary",
            createdAt: "2026-06-27T00:00:00.000Z",
          },
        ],
      }),
      people: [
        {
          id: NOOR,
          displayName: "Noor",
          role: "owner",
          householdId: HOUSEHOLD_A,
          guardianOf: [],
          notify: false,
          version: 0,
          grants: [],
        },
      ],
      invitations: [],
      children: [],
    });
    render(<SharingBoard view={view} />);
    const noor = card("Noor");
    expect(within(noor).queryAllByRole("switch")).toEqual([]);
    const received = within(noor).getByRole("region", { name: "Noor shares with you" });
    expect(received).toHaveTextContent("Cycle status");
    expect(received).toHaveTextContent("Level: summary");
    expect(received).toHaveTextContent("Only Noor can change this.");
    await user.click(within(noor).getByRole("button", { name: "Remove Noor" }));
    expect(screen.getByRole("dialog", { name: "Remove Noor?" })).toHaveTextContent(
      copy.remove.owner("Noor"),
    );
  });
});

describe("SharingBoard: empty, invitations and the page's own lines", () => {
  it("shows the empty state, moves to the invite form, and says private notes once", async () => {
    const user = userEvent.setup();
    const view = buildSharingView({
      me: me(PIA, "none", {
        grants: [
          {
            id: "018f5e7a-5eed-7004-8000-000000000005",
            ownerId: MIRA,
            category: "child",
            level: "read",
            childId: SOL,
            createdAt: "2026-03-19T00:00:00.000Z",
          },
        ],
      }),
      people: [],
      invitations: [],
      children: [{ id: SOL, displayName: "Sol" }],
    });
    render(<SharingBoard view={view} />);
    expect(screen.getByRole("heading", { name: copy.empty.heading })).toBeVisible();
    expect(screen.getByText(copy.empty.why)).toBeVisible();
    await user.click(screen.getByRole("button", { name: copy.empty.action }));
    expect(screen.getByRole("textbox", { name: /Their email/ })).toHaveFocus();
    const shared = screen.getByRole("region", { name: copy.sharedWithYou });
    expect(shared).toHaveTextContent("Sol");
    expect(shared).toHaveTextContent("Level: read");
    expect(screen.getAllByText("Private notes are never shared.")).toHaveLength(1);
  });

  it("lists a pending invitation with its sent day and withdraws it in one step", async () => {
    const user = userEvent.setup();
    render(
      <SharingBoard
        view={noorView([
          {
            id: INVITATION,
            householdId: HOUSEHOLD_A,
            inviteeEmail: "jo@example.test",
            role: "partner",
            createdAt: "2026-10-03T09:00:00.000Z",
            expiresAt: "2026-10-06T09:00:00.000Z",
          },
        ])}
      />,
    );
    const invitation = screen.getByRole("article", { name: "jo@example.test" });
    expect(invitation).toHaveTextContent("Sent Oct 3.");
    answers.push(() => new Response(null, { status: 204 }));
    await user.click(within(invitation).getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText(copy.withdraw.done("jo@example.test"))).toBeVisible();
    expect(calls[0]?.path).toBe(`DELETE /api/v1/sharing/invitations/${INVITATION}`);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says an invitation that is no longer open has expired, and reads the list again", async () => {
    const user = userEvent.setup();
    render(
      <SharingBoard
        view={noorView([
          {
            id: INVITATION,
            householdId: HOUSEHOLD_A,
            inviteeEmail: "jo@example.test",
            role: "partner",
            createdAt: "2026-10-03T09:00:00.000Z",
            expiresAt: "2026-10-06T09:00:00.000Z",
          },
        ])}
      />,
    );
    answers.push(problem(404, undefined, "not_found"));
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText("The invitation has expired. Send a new one.")).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
