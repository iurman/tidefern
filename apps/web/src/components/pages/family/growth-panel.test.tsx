import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ILO_ID, SOL_ID, measurement } from "./fixtures";
import { GrowthPanel, chartSeries } from "./growth-panel";
import { fakeApi, json, openDialogs, problem, words } from "./test-api";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const CARE = "This is worth mentioning to your doctor or midwife.";
let api: ReturnType<typeof fakeApi>;

beforeAll(openDialogs);

beforeEach(() => {
  refresh.mockClear();
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
  it("keys each reading by its measurement and carries the API's flag only where the answer has it", () => {
    expect(chartSeries(solWeights, "headCircumferenceForAge")).toEqual([
      { id: "m-1", date: "2026-04-04", value: 375, pointToCare: false },
    ]);
    const grantee = solWeights.map(({ pointToCare, ...rest }) => {
      void pointToCare;
      return rest;
    });
    expect(chartSeries(grantee, "weightForAge")[2]).toEqual({
      id: "m-3",
      date: "2026-10-03",
      value: 10500,
    });
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
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Measurement added.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const body = api.calls.at(-1)?.body as Record<string, unknown>;
    expect(body).toMatchObject({ date: "2026-10-04", weightGrams: 13608, lengthMillimetres: 919 });
    expect(body).not.toHaveProperty("headMillimetres");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
