import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { filterZones, offsetFor, TimeZoneCombobox } from "./time-zone-combobox";

const zones = [
  "America/New_York",
  "America/North_Dakota/New_Salem",
  "Europe/Berlin",
  "Europe/London",
  "Asia/Tokyo",
  "Pacific/Auckland",
  "UTC",
];

const now = "2026-10-05T12:00:00Z";

describe("time zone filtering", () => {
  it("matches every word against the name with separators read as spaces", () => {
    expect(filterZones(zones, "new york")).toEqual(["America/New_York"]);
    expect(filterZones(zones, "york")).toEqual(["America/New_York"]);
    expect(filterZones(zones, "new")).toEqual([
      "America/New_York",
      "America/North_Dakota/New_Salem",
    ]);
    expect(filterZones(zones, "nowhere")).toEqual([]);
  });

  it("returns everything for an empty query and sorts prefix matches first", () => {
    expect(filterZones(zones, "  ")).toEqual(zones);
    expect(filterZones(zones, "lon")).toEqual(["Europe/London"]);
    expect(filterZones(zones, "a")[0]).toBe("America/New_York");
  });

  it("reads the offset at the given instant and never the machine clock", () => {
    expect(offsetFor("Europe/Berlin", "2026-07-01T12:00:00Z")).toBe("GMT+02:00");
    expect(offsetFor("Europe/Berlin", "2026-12-01T12:00:00Z")).toBe("GMT+01:00");
    expect(offsetFor("Asia/Kolkata", now)).toBe("GMT+05:30");
    expect(offsetFor("UTC", now)).toBe("GMT+00:00");
    expect(offsetFor("Atlantis/Nowhere", now)).toBeNull();
  });
});

describe("TimeZoneCombobox", () => {
  it("filters as the person types and chooses with the arrow keys and Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeZoneCombobox label="Time zone" zones={zones} now={now} onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Time zone" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.click(input);
    await user.keyboard("berl");
    const list = screen.getByRole("listbox");
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("Europe/Berlin");
    expect(input).toHaveValue("Europe/Berlin");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Europe/Berlin is at GMT+02:00 right now.")).toBeInTheDocument();
  });

  it("restores the chosen zone on Escape and says when nothing matches", async () => {
    const user = userEvent.setup();
    render(
      <TimeZoneCombobox label="Time zone" zones={zones} now={now} defaultValue="Asia/Tokyo" />,
    );
    const input = screen.getByRole("combobox", { name: "Time zone" });
    await user.click(input);
    await user.clear(input);
    await user.keyboard("nowhere");
    expect(screen.getByText(/No time zone matches "nowhere"/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("Asia/Tokyo");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("starts blank without a value, so the machine's zone is never assumed", () => {
    render(<TimeZoneCombobox label="Time zone" zones={zones} now={now} />);
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveValue("");
    expect(screen.queryByText(/right now/)).not.toBeInTheDocument();
  });
});
