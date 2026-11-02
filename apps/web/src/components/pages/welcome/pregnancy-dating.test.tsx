import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { dateEntryIn } from "./date-entry";
import { EMPTY_DATING, type DatingDraft } from "./dates";
import { PregnancyDating, datingDateKey } from "./pregnancy-dating";

function Harness({ onChange }: { onChange?: (draft: DatingDraft) => void }) {
  const [value, setValue] = useState<DatingDraft>(EMPTY_DATING);
  return (
    <PregnancyDating
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      errors={{}}
      order="mdy"
      today="2026-10-05"
    />
  );
}

describe("pregnancy dating", () => {
  it("asks the method first and offers no weeks-and-days-as-of-a-date method", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "How was your due date worked out?" })).toBeVisible();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "lmp",
      "ultrasound",
      "transfer",
      "manual",
    ]);
    expect(screen.queryByRole("group", { name: /Due date/ })).toBeNull();
  });

  it("shows only the chosen method's fields, each date with an example line", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: "From a scan" }));
    expect(screen.getByRole("group", { name: /Date of the scan/ })).toBeVisible();
    expect(screen.getByText("For example, 08 31 2026")).toBeVisible();
    expect(screen.getByRole("group", { name: "How far along the scan measured" })).toBeVisible();
    await userEvent.click(screen.getByRole("radio", { name: "I was given a due date" }));
    expect(screen.queryByRole("group", { name: /Date of the scan/ })).toBeNull();
    expect(screen.getByRole("group", { name: /Due date/ })).toBeVisible();
    expect(screen.getByText("For example, 03 13 2027")).toBeVisible();
  });

  it("keeps digits only in the numbers, and the typed date for a later read", async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "From an embryo transfer" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Embryo's age/ }), "5x");
    expect(screen.getByRole("textbox", { name: /Embryo's age/ })).toHaveValue("5");
    await userEvent.type(screen.getByLabelText("Month"), "09");
    expect(dateEntryIn(container, datingDateKey("transferDate"))).toBe("partial");
    await userEvent.type(screen.getByLabelText("Day"), "05");
    await userEvent.type(screen.getByLabelText("Year"), "2026");
    expect(dateEntryIn(container, datingDateKey("transferDate"))).toBe("complete");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: "transfer",
        transferDate: "2026-09-05",
        embryoAgeDays: "5",
      }),
    );
  });
});
