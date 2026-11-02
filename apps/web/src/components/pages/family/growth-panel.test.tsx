import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ILO_ID, SOL_ID, measurement } from "./fixtures";
import { GrowthPanel, chartSeries, pointsToCare } from "./growth-panel";
import { fakeApi, json, openDialogs, problem, scrollSpy, words } from "./test-api";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const play = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sound")>()),
  play,
}));

const CARE = "This is worth mentioning to your doctor or midwife.";
let api: ReturnType<typeof fakeApi>;

beforeAll(openDialogs);

beforeEach(() => {
  refresh.mockClear();
  play.mockReset();
  api = fakeApi();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Sol's seeded weights as a guardian's answer has them: the newest beyond 2 SD, flagged. */
const solWeights = [
  measurement({
    id: "m-1",
    childId: SOL_ID,
    date: "2026-04-04",
    weightGrams: 12500,
    pointToCare: false,
  }),
  measurement({
    id: "m-2",
    childId: SOL_ID,
    date: "2026-09-29",
    weightGrams: 13600,
    headMillimetres: null,
    pointToCare: false,
  }),
  measurement({
    id: "m-3",
    childId: SOL_ID,
    date: "2026-10-03",
    weightGrams: 10500,
    lengthMillimetres: null,
    headMillimetres: null,
    pointToCare: true,
  }),
];

function sol(overrides: Partial<Parameters<typeof GrowthPanel>[0]> = {}) {
  return render(
    <GrowthPanel
      childId={SOL_ID}
      childName="Sol"
      sex="male"
      dateOfBirth="2024-04-04"
      today="2026-10-04"
      units="metric"
      measurements={solWeights}
      canWrite
      viewer="owner"
      {...overrides}
    />,
  );
}

describe("chartSeries", () => {
  it("keys each reading by its measurement and leaves the session-wide flag out", () => {
    expect(chartSeries(solWeights, "headCircumferenceForAge")).toEqual([
      { id: "m-1", date: "2026-04-04", value: 375 },
    ]);
    expect(chartSeries(solWeights, "weightForAge")[2]).toEqual({
      id: "m-3",
      date: "2026-10-03",
      value: 10500,
    });
  });
});

describe("pointsToCare", () => {
  it("follows the API's flag on a guardian's view and never shows on a partner's", () => {
    expect(pointsToCare(solWeights, "owner")).toBe(true);
    expect(pointsToCare(solWeights, "partner")).toBe(false);
    expect(pointsToCare(solWeights.slice(0, 2), "owner")).toBe(false);
    const grantee = solWeights.map(({ pointToCare, ...rest }) => {
      void pointToCare;
      return rest;
    });
    expect(pointsToCare(grantee, "owner")).toBe(false);
  });
});

describe("GrowthPanel", () => {
  it("draws the chart with the care sentence the API flagged, and the attribution SOURCES.md asks for", () => {
    sol();
    expect(
      screen.getByRole("img", { name: /^Weight for age, since birth: 3 measurements/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(CARE)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Source: CDC. Reference to CDC materials does not imply endorsement by CDC, ATSDR, HHS or the United States Government of Tidefern, its company, products or services.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "www.cdc.gov/growthcharts/who-data-files.htm" }),
    ).toHaveAttribute("href", "https://www.cdc.gov/growthcharts/who-data-files.htm");
  });

  it("says the care sentence once for the panel, never under a chart whose readings are all in band", async () => {
    const user = userEvent.setup();
    // One session: a weight far below the band and a length well inside it; the API flags the session.
    sol({
      measurements: [
        measurement({
          id: "m-9",
          childId: SOL_ID,
          date: "2026-10-03",
          weightGrams: 9000,
          lengthMillimetres: 880,
          headMillimetres: null,
          pointToCare: true,
        }),
      ],
    });
    await user.click(screen.getByRole("radio", { name: "Length" }));
    expect(screen.getByRole("img", { name: /^Length for age/ })).toBeInTheDocument();
    const sentences = screen.getAllByText(CARE);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.closest("figure")).toBeNull();
  });

  it("never shows the care sentence on a partner's view, and offers her no measurement", () => {
    const grantee = solWeights.map(({ pointToCare, ...rest }) => {
      void pointToCare;
      return rest;
    });
    sol({ measurements: grantee, viewer: "partner", canWrite: false, units: "imperial" });
    expect(screen.queryByText(CARE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a measurement" })).toBeNull();
    expect(words(screen.getByRole("list", { name: "Readings" }).textContent)).toContain("27.6 lb");
  });

  it("converts at the edge when the unit toggle moves, the stored grams unchanged", async () => {
    const user = userEvent.setup();
    sol();
    const readings = screen.getByRole("list", { name: "Readings" });
    expect(words(readings.textContent)).toContain("13.6 kg");
    await user.click(screen.getByRole("radio", { name: "lb" }));
    expect(words(screen.getByRole("list", { name: "Readings" }).textContent)).toContain("30.0 lb");
    await user.click(screen.getByRole("radio", { name: "Length" }));
    expect(screen.getByRole("radio", { name: "in" })).toBeChecked();
  });

  it("says the band needs the child's sex instead of drawing it, as a marked owner line", () => {
    sol({ sex: null });
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByText(/^\[OWNER\] line that the percentile band needs the child's sex/),
    ).toBeInTheDocument();
    expect(words(screen.getByRole("list", { name: "Readings" }).textContent)).toContain(
      "Weight 10.5 kg",
    );
  });

  it("follows the empty state formula, its action only for someone who can add one", () => {
    const { rerender } = render(
      <GrowthPanel
        childId={ILO_ID}
        childName="Ilo"
        sex="female"
        dateOfBirth="2026-08-23"
        today="2026-10-04"
        units="metric"
        measurements={[]}
        canWrite={false}
        viewer="partner"
      />,
    );
    const empty = screen.getByRole("region", { name: "No measurements yet" });
    expect(
      within(empty).getByText(
        "Add a weight or length and the chart draws the percentile band around it.",
      ),
    ).toBeInTheDocument();
    expect(within(empty).queryByRole("button")).toBeNull();
    rerender(
      <GrowthPanel
        childId={ILO_ID}
        childName="Ilo"
        sex="female"
        dateOfBirth="2026-08-23"
        today="2026-10-04"
        units="metric"
        measurements={[]}
        canWrite
        viewer="owner"
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "No measurements yet" })).getByRole("button", {
        name: "Add a measurement",
      }),
    ).toBeInTheDocument();
  });

  it("adds a measurement in SI integers from one unit control, and puts a date before birth under the date", async () => {
    const user = userEvent.setup();
    api.route(
      `POST /api/v1/children/${SOL_ID}/measurements`,
      problem(422, {
        errors: [{ path: "date", message: "A measurement is never dated before the birth." }],
      }),
    );
    api.route(`POST /api/v1/children/${SOL_ID}/measurements`, json({ id: "x" }, 201));
    sol();
    await user.click(screen.getByRole("button", { name: "Add a measurement" }));
    const sheet = screen.getByRole("dialog", { name: "Add a measurement for Sol" });
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(sheet).getByText("Enter at least one measurement.")).toBeInTheDocument();
    expect(within(sheet).getByRole("textbox", { name: "Weight" })).toHaveFocus();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("error");
    expect(api.calls).toEqual([]);
    await user.click(within(sheet).getByRole("radio", { name: "lb and in" }));
    expect(
      within(sheet).queryAllByRole("radio", { name: /^(Kilograms|Pounds and ounces)$/ }),
    ).toEqual([]);
    await user.type(within(sheet).getByRole("textbox", { name: "Weight" }), "30");
    await user.type(within(sheet).getByRole("textbox", { name: "Length" }), "36.2");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(
      await within(sheet).findByText("That date is before Sol was born. Check the date."),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("textbox", { name: "Month" })).toHaveFocus();
    expect(play).toHaveBeenCalledTimes(2);
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Measurement added.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const body = api.calls.at(-1)?.body as Record<string, unknown>;
    expect(body).toMatchObject({ date: "2026-10-04", weightGrams: 13608, lengthMillimetres: 919 });
    expect(body).not.toHaveProperty("headMillimetres");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps Save in view when a failure line lands above it", async () => {
    const spy = scrollSpy();
    try {
      const user = userEvent.setup();
      api.route(`POST /api/v1/children/${SOL_ID}/measurements`, problem(500));
      sol();
      await user.click(screen.getByRole("button", { name: "Add a measurement" }));
      const sheet = screen.getByRole("dialog", { name: "Add a measurement for Sol" });
      await user.type(within(sheet).getByRole("textbox", { name: "Weight" }), "13.9");
      await user.click(within(sheet).getByRole("button", { name: "Save" }));
      expect(
        await within(sheet).findByText("We could not save this measurement. Try again."),
      ).toBeInTheDocument();
      expect(spy.scroll).toHaveBeenLastCalledWith({ block: "nearest" });
      expect(spy.targets().at(-1)).toContainElement(
        within(sheet).getByRole("button", { name: "Save" }),
      );
    } finally {
      spy.restore();
    }
  });
});
