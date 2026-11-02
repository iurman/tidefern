import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EndPregnancy } from "./end-pregnancy";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const PREGNANCY = "018f5e7a-5eed-7300-8000-000000000001";
const today = "2026-10-04";
const start = "2026-05-03";

interface Call {
  method: string;
  path: string;
  key: string | null;
  body: unknown;
}

let calls: Call[] = [];
let answers: Array<() => Response | Promise<Response>> = [];

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

beforeAll(() => {
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
      path: url.pathname + url.search,
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

function renderEnd(sharedWith: string[] | null = ["Mira"]) {
  const navigate = vi.fn();
  render(
    <EndPregnancy
      pregnancyId={PREGNANCY}
      today={today}
      start={start}
      sharedWith={sharedWith}
      navigate={navigate}
    />,
  );
  return navigate;
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  expect(screen.getByText("Something changed?")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "My pregnancy ended" }));
  return screen.getByRole("dialog", { name: "My pregnancy ended" });
}

async function fillDay(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, day: string) {
  const [year, month, date] = day.split("-") as [string, string, string];
  await user.type(within(dialog).getByRole("textbox", { name: "Month" }), month);
  await user.type(within(dialog).getByRole("textbox", { name: "Day" }), date);
  await user.type(within(dialog).getByRole("textbox", { name: "Year" }), year);
}

describe("the ending dialog", () => {
  it("caps the day at today and asks what happened before anything is sent", async () => {
    const user = userEvent.setup();
    renderEnd();
    const dialog = await open(user);
    await fillDay(user, dialog, "2026-10-05");
    await user.click(within(dialog).getByRole("button", { name: "Record the ending" }));
    expect(
      within(dialog).getByText("That day has not happened yet. Enter today or an earlier day."),
    ).toBeVisible();
    expect(within(dialog).getByText("Choose what happened.")).toBeVisible();
    // Focus lands on the first field to fix: the day comes before the reason.
    expect(within(dialog).getByRole("textbox", { name: "Month" })).toHaveFocus();
    expect(calls).toHaveLength(0);
  });

  it("lands on the reason when the day is fine and the reason is missing", async () => {
    const user = userEvent.setup();
    renderEnd();
    const dialog = await open(user);
    await fillDay(user, dialog, today);
    await user.click(within(dialog).getByRole("button", { name: "Record the ending" }));
    expect(within(dialog).getByRole("radio", { name: "Birth" })).toHaveFocus();
  });

  it("says the reason stays hers and asks for her word only after a loss, then uses it", async () => {
    const user = userEvent.setup();
    renderEnd();
    const dialog = await open(user);
    expect(
      within(dialog).getByText("Only you can see this. Nobody you share with ever does."),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("group", { name: "The word you want Tidefern to use" }),
    ).toBeNull();
    expect(within(dialog).getByText(/^Support, if you want it:/)).toBeVisible();
    await user.click(within(dialog).getByRole("radio", { name: "Loss" }));
    const word = within(dialog).getByRole("group", { name: "The word you want Tidefern to use" });
    expect(within(word).getByRole("radio", { name: "Pregnancy" })).toBeChecked();
    expect(within(dialog).getByText(/^Support after a pregnancy loss:/)).toBeVisible();
    await user.click(within(word).getByRole("radio", { name: "Baby" }));
    expect(within(dialog).getByText(/^Support after losing a baby:/)).toBeVisible();
    // The one resources link is the owner's to give; it is marked, never invented.
    expect(within(dialog).getByText(/\[OWNER\] one resources link/)).toBeVisible();
  });

  it("names who will see it paused and that nobody is notified", async () => {
    const user = userEvent.setup();
    renderEnd(["Mira", "Alex"]);
    const dialog = await open(user);
    expect(
      within(dialog).getByText(
        "Mira and Alex will see it as paused, with no week or dates. Tidefern does not notify anyone.",
      ),
    ).toBeVisible();
  });

  it("says only that nobody is notified when she shares it with nobody", async () => {
    const user = userEvent.setup();
    renderEnd([]);
    const dialog = await open(user);
    expect(within(dialog).getByText("Tidefern does not notify anyone.")).toBeVisible();
  });

  it("speaks of anyone she shares with when the names are not known", async () => {
    const user = userEvent.setup();
    renderEnd(null);
    const dialog = await open(user);
    expect(
      within(dialog).getByText(
        "Anyone you share it with will see it as paused, with no week or dates. Tidefern does not notify anyone.",
      ),
    ).toBeVisible();
  });

  it("sends the day and the reason, never the word, and lands on a quiet Today", async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    answers.push(() => new Promise<Response>((resolve) => (release = resolve)));
    const navigate = renderEnd();
    const dialog = await open(user);
    await fillDay(user, dialog, today);
    await user.click(within(dialog).getByRole("radio", { name: "Loss" }));
    await user.click(within(dialog).getByRole("radio", { name: "Baby" }));
    const confirm = within(dialog).getByRole("button", { name: "Record the ending" });
    await user.click(confirm);
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(calls).toEqual([
      {
        method: "POST",
        path: `/api/v1/pregnancies/${PREGNANCY}/end`,
        key: expect.stringMatching(/^[0-9a-f-]{36}$/),
        body: { endedAt: today, reason: "loss" },
      },
    ]);
    release(Response.json({ id: PREGNANCY, status: "ended" }, { status: 200 }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/today"));
  });

  it("shows a stale sign-in as the next step, with the way back here, and closes the dialog", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "unauthenticated", detail: "fresh_authentication_required" }, 401));
    const navigate = renderEnd();
    const dialog = await open(user);
    await fillDay(user, dialog, today);
    await user.click(within(dialog).getByRole("radio", { name: "Birth" }));
    await user.click(within(dialog).getByRole("button", { name: "Record the ending" }));
    expect(
      await screen.findByText(
        "For safety, this needs a sign-in from the last ten minutes. Sign in again, then come back here.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/sign-in?next=/journey",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("puts the API's refusal of a day that has not come beside the field", async () => {
    const user = userEvent.setup();
    answers.push(
      json(
        {
          code: "validation_failed",
          errors: [{ path: "endedAt", message: "Not a day that has happened yet." }],
        },
        422,
      ),
    );
    renderEnd();
    const dialog = await open(user);
    await fillDay(user, dialog, today);
    await user.click(within(dialog).getByRole("radio", { name: "Other" }));
    await user.click(within(dialog).getByRole("button", { name: "Record the ending" }));
    expect(
      await within(dialog).findByText(
        "That day has not happened yet. Enter today or an earlier day.",
      ),
    ).toBeVisible();
  });

  it("says an ending recorded elsewhere and reads the page again", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "conflict", detail: "pregnancy_ended" }, 409));
    renderEnd();
    const dialog = await open(user);
    await fillDay(user, dialog, today);
    await user.click(within(dialog).getByRole("radio", { name: "Birth" }));
    await user.click(within(dialog).getByRole("button", { name: "Record the ending" }));
    expect(
      await within(dialog).findByText(
        "This pregnancy is already marked as ended. Reload the page to see it.",
      ),
    ).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("starts each opening fresh, under a new key", async () => {
    const user = userEvent.setup();
    answers.push(json({ code: "internal" }, 500));
    answers.push(json({ code: "internal" }, 500));
    renderEnd();
    let dialog = await open(user);
    await fillDay(user, dialog, today);
    await user.click(within(dialog).getByRole("radio", { name: "Birth" }));
    await user.click(within(dialog).getByRole("button", { name: "Record the ending" }));
    await within(dialog).findByText("We could not save this. Try again.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    dialog = await open(user);
    expect(within(dialog).getByRole("textbox", { name: "Month" })).toHaveValue("");
    expect(within(dialog).getByRole("radio", { name: "Birth" })).not.toBeChecked();
    await fillDay(user, dialog, today);
    await user.click(within(dialog).getByRole("radio", { name: "Birth" }));
    await user.click(within(dialog).getByRole("button", { name: "Record the ending" }));
    await within(dialog).findByText("We could not save this. Try again.");
    expect(calls[1]?.key).not.toBe(calls[0]?.key);
  });
});
