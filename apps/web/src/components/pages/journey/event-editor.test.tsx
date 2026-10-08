import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AddEventButtons, EditEventButton, EventEditor, type EditableEvent } from "./event-editor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const PREGNANCY = "018f5e7a-5eed-7300-8000-000000000001";
const glucose: EditableEvent = {
  id: "018f5e7a-5eed-7400-8000-000000000004",
  kind: "appointment",
  date: "2026-11-01",
  detail: "Glucose screening",
  version: 3,
  title: "Glucose screening",
};

interface Call {
  method: string;
  path: string;
  query: string;
  ifMatch: string | null;
  key: string | null;
  body: unknown;
}

let calls: Call[] = [];
let answers: Array<() => Response | Promise<Response>> = [];

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status, headers: { "content-type": "application/problem+json" } });

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
  vi.spyOn(window, "fetch").mockImplementation(async (input) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.text();
    calls.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      ifMatch: request.headers.get("if-match"),
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

function renderEditor(canDelete = true) {
  return render(
    <EventEditor
      pregnancyId={PREGNANCY}
      canDelete={canDelete}
      today="2026-10-04"
      start="2026-05-03"
    >
      <EditEventButton event={glucose} />
      <AddEventButtons />
    </EventEditor>,
  );
}

async function typeDate(
  user: ReturnType<typeof userEvent.setup>,
  month: string,
  day: string,
  year: string,
) {
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByRole("textbox", { name: "Month" }), month);
  await user.type(within(dialog).getByRole("textbox", { name: "Day" }), day);
  await user.type(within(dialog).getByRole("textbox", { name: "Year" }), year);
}

describe("adding an appointment or a milestone", () => {
  it("sends the kind, the day and the detail in the body, never in the address, then refreshes", async () => {
    const user = userEvent.setup();
    answers.push(json({ id: "018f5e7a-5eed-7400-8000-000000000009" }, 201));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add a milestone" }));
    const dialog = screen.getByRole("dialog", { name: "Add a milestone" });
    expect(within(dialog).getByRole("radio", { name: "Milestone" })).toBeChecked();
    await typeDate(user, "10", "20", "2026");
    await user.type(within(dialog).getByRole("textbox", { name: "Details" }), "  First hiccups ");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved for Oct 20.")).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/api/v1/pregnancies/${PREGNANCY}/events`,
      query: "",
      body: { kind: "milestone", date: "2026-10-20", detail: "First hiccups" },
    });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for a date before it sends anything", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add an appointment" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter the date as month, day and year.")).toBeVisible();
    // Focus lands on what to fix, so the refusal is heard where it is.
    expect(screen.getByRole("textbox", { name: "Month" })).toHaveFocus();
    expect(calls).toHaveLength(0);
  });

  it("refuses a date before the pregnancy began without sending it", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add an appointment" }));
    await typeDate(user, "3", "2", "2025");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByText("That day is before this pregnancy began. Check the date."),
    ).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it("keeps her input on a failure and retries the same body under the same key", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "internal" }, 500));
    answers.push(json({ id: "018f5e7a-5eed-7400-8000-000000000009" }, 201));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add an appointment" }));
    await typeDate(user, "11", "15", "2026");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("We could not save this. Try again.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Month" })).toHaveValue("11");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved for Nov 15.")).toBeVisible();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.key).toBe(calls[0]?.key);
  });

  it("takes a new key once the body changed, since the API refuses a key reused with another body", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "internal" }, 500));
    answers.push(json({ id: "018f5e7a-5eed-7400-8000-000000000009" }, 201));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add an appointment" }));
    await typeDate(user, "11", "15", "2026");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("We could not save this. Try again.");
    await user.type(screen.getByRole("textbox", { name: "Details" }), "Midwife");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved for Nov 15.");
    expect(calls[1]?.key).not.toBe(calls[0]?.key);
  });

  it("says Saving at the same width while the request is out, and ignores a second press", async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    answers.push(() => new Promise<Response>((resolve) => (release = resolve)));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add an appointment" }));
    await typeDate(user, "11", "15", "2026");
    const save = screen.getByRole("button", { name: "Save" });
    await user.click(save);
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(within(save).getByText("Saving")).toBeInTheDocument();
    await user.click(save);
    expect(calls).toHaveLength(1);
    release(Response.json({ id: "018f5e7a-5eed-7400-8000-000000000009" }, { status: 201 }));
    expect(await screen.findByText("Saved for Nov 15.")).toBeVisible();
  });

  it("puts a refused date beside the field", async () => {
    const user = userEvent.setup();
    answers.push(
      json(
        { code: "validation_failed", errors: [{ path: "date", message: "Not a calendar day." }] },
        422,
      ),
    );
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add an appointment" }));
    await typeDate(user, "11", "15", "2026");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("That date does not exist. Check the day and the month."),
    ).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("editing", () => {
  it("replaces the event behind If-Match and resends the detail it opened with", async () => {
    const user = userEvent.setup();
    answers.push(json({ ...glucose, version: 4 }, 200));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit Glucose screening, Nov 1" }));
    const dialog = screen.getByRole("dialog", { name: "Edit the appointment" });
    expect(within(dialog).getByRole("textbox", { name: "Details" })).toHaveValue(
      "Glucose screening",
    );
    expect(within(dialog).getByRole("textbox", { name: "Month" })).toHaveValue("11");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved for Nov 1.");
    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: `/api/v1/pregnancies/${PREGNANCY}/events/${glucose.id}`,
      ifMatch: "3",
      body: { kind: "appointment", date: "2026-11-01", detail: "Glucose screening" },
    });
  });

  it("leaves the detail out when she empties it, which is how it is cleared", async () => {
    const user = userEvent.setup();
    answers.push(json({ ...glucose, detail: null, version: 4 }, 200));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit Glucose screening, Nov 1" }));
    await user.clear(screen.getByRole("textbox", { name: "Details" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved for Nov 1.");
    expect(calls[0]?.body).toEqual({ kind: "appointment", date: "2026-11-01" });
  });

  it("says when it changed elsewhere and reads the page again", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "conflict", detail: "stale_version" }, 409));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit Glucose screening, Nov 1" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "This changed since you opened it. Close it and open it again to see the latest.",
      ),
    ).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("tells a grantee only that updates are paused, never that it ended", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "conflict", detail: "pregnancy_paused" }, 409));
    renderEditor(false);
    await user.click(screen.getByRole("button", { name: "Edit Glucose screening, Nov 1" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Updates to this pregnancy are paused, so this was not saved."),
    ).toBeVisible();
    expect(screen.queryByText(/ended/)).not.toBeInTheDocument();
  });
});

describe("deleting", () => {
  it("is offered on her own page only, after a confirmation, behind If-Match", async () => {
    const user = userEvent.setup();
    answers.push(() => new Response(null, { status: 204 }));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit Glucose screening, Nov 1" }));
    await user.click(screen.getByRole("button", { name: "Delete this appointment" }));
    const confirm = screen.getByRole("dialog", { name: "Delete this appointment?" });
    expect(confirm).toHaveAccessibleDescription(
      "It is gone for you and for everyone who can see your pregnancy. This cannot be undone.",
    );
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted.")).toBeVisible();
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      path: `/api/v1/pregnancies/${PREGNANCY}/events/${glucose.id}`,
      ifMatch: "3",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("is not offered to a contributor, whom the API refuses", async () => {
    const user = userEvent.setup();
    renderEditor(false);
    await user.click(screen.getByRole("button", { name: "Edit Glucose screening, Nov 1" }));
    expect(
      screen.queryByRole("button", { name: "Delete this appointment" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the confirmation open with what to do when the delete fails", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "internal" }, 500));
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit Glucose screening, Nov 1" }));
    await user.click(screen.getByRole("button", { name: "Delete this appointment" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("We could not delete this. Try again.")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Delete this appointment?" })).toBeInTheDocument();
  });
});
