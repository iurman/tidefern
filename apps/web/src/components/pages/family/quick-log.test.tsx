import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ILO_ID, event } from "./fixtures";
import { QuickLog, UNDO_WINDOW_MS } from "./quick-log";
import { fakeApi, json, openDialogs, problem, type Call } from "./test-api";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const today = "2026-10-04";
let api: ReturnType<typeof fakeApi>;

beforeAll(openDialogs);

beforeEach(() => {
  refresh.mockClear();
  api = fakeApi();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function quickLog(overrides: Partial<Parameters<typeof QuickLog>[0]> = {}) {
  return render(
    <QuickLog
      childId={ILO_ID}
      childName="Ilo"
      today={today}
      units="metric"
      canDelete
      ongoingSleep={null}
      ongoingSince={null}
      {...overrides}
    />,
  );
}

const posts = (calls: Call[]) => calls.filter((call) => call.method === "POST");

describe("QuickLog", () => {
  it("logs a diaper with its contents, closes the sheet, offers Undo and reads the page again", async () => {
    const user = userEvent.setup();
    api.route(`POST /api/v1/children/${ILO_ID}/events`, json({ id: "x" }, 201));
    quickLog();
    await user.click(screen.getByRole("button", { name: "Diaper for Ilo" }));
    const sheet = screen.getByRole("dialog", { name: "Log a diaper for Ilo" });
    await user.click(within(sheet).getByRole("radio", { name: "Wet and dirty" }));
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Diaper saved.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const [post] = posts(api.calls);
    expect(post?.path).toBe(`/api/v1/children/${ILO_ID}/events`);
    expect(post?.query).toBe("");
    expect(post?.key).toMatch(/^[0-9a-f-]{36}$/);
    const body = post?.body as { id: string };
    expect(body).toEqual({ kind: "diaper", date: today, diaperContents: "mixed", id: body.id });
    expect(refresh).toHaveBeenCalledTimes(1);

    api.route(`DELETE /api/v1/children/${ILO_ID}/events/${body.id}`, json(undefined, 204));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("That entry was removed.")).toBeInTheDocument();
    expect(api.calls.at(-1)).toMatchObject({
      method: "DELETE",
      path: `/api/v1/children/${ILO_ID}/events/${body.id}`,
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("takes the Undo away after ten seconds, and never offers it to someone who cannot delete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.route(`POST /api/v1/children/${ILO_ID}/events`, json({ id: "x" }, 201));
    const { unmount } = quickLog();
    await user.click(screen.getByRole("button", { name: "Diaper for Ilo" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    vi.advanceTimersByTime(UNDO_WINDOW_MS + 10);
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Undo" })).toBeNull());
    expect(screen.getByText("Diaper saved.")).toBeInTheDocument();
    unmount();

    api.route(`POST /api/v1/children/${ILO_ID}/events`, json({ id: "y" }, 201));
    quickLog({ canDelete: false });
    await user.click(screen.getByRole("button", { name: "Diaper for Ilo" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Diaper saved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("keeps the sheet open with what to do next, and retries the same body with the same id and key", async () => {
    const user = userEvent.setup();
    api.route(`POST /api/v1/children/${ILO_ID}/events`, problem(503));
    api.route(`POST /api/v1/children/${ILO_ID}/events`, json({ id: "x" }, 201));
    quickLog();
    await user.click(screen.getByRole("button", { name: "Diaper for Ilo" }));
    const sheet = screen.getByRole("dialog", { name: "Log a diaper for Ilo" });
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(
      await within(sheet).findByText("We could not save this diaper. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Diaper saved.")).toBeInTheDocument();
    const [first, second] = posts(api.calls);
    expect(second?.key).toBe(first?.key);
    expect((second?.body as { id: string }).id).toBe((first?.body as { id: string }).id);
  });

  it("asks how a feed was given before it sends anything, and stores a bottle in millilitres", async () => {
    const user = userEvent.setup();
    api.route(`POST /api/v1/children/${ILO_ID}/events`, json({ id: "x" }, 201));
    quickLog({ units: "imperial" });
    await user.click(screen.getByRole("button", { name: "Feed for Ilo" }));
    const sheet = screen.getByRole("dialog", { name: "Log a feed for Ilo" });
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(sheet).getByText("Choose breast, bottle or solids.")).toBeInTheDocument();
    expect(api.calls).toEqual([]);
    await user.click(within(sheet).getByRole("radio", { name: "Bottle" }));
    expect(within(sheet).getByRole("radio", { name: "Fluid ounces" })).toBeChecked();
    await user.type(within(sheet).getByRole("textbox", { name: "Amount" }), "3");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Feed saved.")).toBeInTheDocument();
    expect(posts(api.calls)[0]?.body).toMatchObject({
      kind: "feed",
      date: today,
      feedMethod: "bottle",
      quantityMl: 89,
    });
  });

  it("times a breast feed on the client and posts it once, at Stop, with both instants", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-04T21:00:00.000Z"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    api.route(`POST /api/v1/children/${ILO_ID}/events`, json({ id: "x" }, 201));
    quickLog();
    await user.click(screen.getByRole("button", { name: "Feed for Ilo" }));
    const sheet = screen.getByRole("dialog", { name: "Log a feed for Ilo" });
    await user.click(within(sheet).getByRole("radio", { name: "Breast" }));
    await user.click(within(sheet).getByRole("radio", { name: "Right" }));
    await user.click(within(sheet).getByRole("button", { name: "Start timer" }));
    vi.advanceTimersByTime(12 * 60_000);
    expect(await within(sheet).findByRole("timer")).toHaveTextContent(/^12:0\d$/);
    expect(api.calls).toEqual([]);
    await user.click(within(sheet).getByRole("button", { name: "Stop and save" }));
    expect(await screen.findByText("Feed saved.")).toBeInTheDocument();
    const body = posts(api.calls)[0]?.body as Record<string, string>;
    expect(body).toMatchObject({ kind: "feed", feedMethod: "breast", side: "right", date: today });
    const minutes =
      (Date.parse(body.endedAt as string) - Date.parse(body.startedAt as string)) / 60_000;
    expect(Math.round(minutes)).toBe(12);
    expect(posts(api.calls)).toHaveLength(1);
  });

  it("starts a sleep now, and ends a sleep that is going on with the whole event", async () => {
    const user = userEvent.setup();
    api.route(`POST /api/v1/children/${ILO_ID}/events`, json({ id: "x" }, 201));
    const { unmount } = quickLog();
    await user.click(screen.getByRole("button", { name: "Sleep for Ilo" }));
    await user.click(screen.getByRole("button", { name: "Start sleep" }));
    expect(await screen.findByText("Sleep started.")).toBeInTheDocument();
    expect(posts(api.calls)[0]?.body).toMatchObject({ kind: "sleep", date: today });
    expect((posts(api.calls)[0]?.body as { startedAt?: string }).startedAt).toMatch(/Z$/);
    unmount();

    const asleep = event({
      kind: "sleep",
      startedAt: "2026-10-04T21:15:00.000Z",
      note: "Down after the bath.",
      version: 2,
    });
    api.route(`PUT /api/v1/children/${ILO_ID}/events/${asleep.id}`, json(asleep, 200));
    quickLog({ ongoingSleep: asleep, ongoingSince: "2:15 PM" });
    await user.click(screen.getByRole("button", { name: "End sleep for Ilo" }));
    const sheet = screen.getByRole("dialog", { name: "End Ilo's sleep" });
    expect(within(sheet).getByText("Asleep since 2:15 PM.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "End sleep" }));
    expect(await screen.findByText("Sleep ended.")).toBeInTheDocument();
    const put = api.calls.at(-1);
    expect(put).toMatchObject({ method: "PUT", ifMatch: "2" });
    expect(put?.body).toMatchObject({
      kind: "sleep",
      startedAt: "2026-10-04T21:15:00.000Z",
      note: "Down after the bath.",
    });
  });

  it("says a sleep that moved on elsewhere, and says offline without sending", async () => {
    const user = userEvent.setup();
    const asleep = event({ kind: "sleep", startedAt: "2026-10-04T21:15:00.000Z" });
    api.route(`PUT /api/v1/children/${ILO_ID}/events/${asleep.id}`, problem(409));
    quickLog({ ongoingSleep: asleep, ongoingSince: "2:15 PM" });
    await user.click(screen.getByRole("button", { name: "End sleep for Ilo" }));
    await user.click(screen.getByRole("button", { name: "End sleep" }));
    expect(
      await screen.findByText("This sleep changed somewhere else. Reload the page to see it."),
    ).toBeInTheDocument();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const before = api.calls.length;
    await user.click(screen.getByRole("button", { name: "End sleep" }));
    expect(
      await screen.findByText("You are offline. Connect, then try again."),
    ).toBeInTheDocument();
    expect(api.calls).toHaveLength(before);
  });
});
