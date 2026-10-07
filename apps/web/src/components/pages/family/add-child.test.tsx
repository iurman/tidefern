import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CHILD_CONSENT_DISCLOSURES } from "@tidefern/schemas";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AddChild } from "./add-child";
import { fakeApi, json, openDialogs, problem } from "./test-api";

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
});

async function openSheet() {
  const user = userEvent.setup();
  render(<AddChild today={today} />);
  await user.click(screen.getByRole("button", { name: "Add a child" }));
  return { user, sheet: screen.getByRole("dialog", { name: "Add a child" }) };
}

async function fill(user: ReturnType<typeof userEvent.setup>, sheet: HTMLElement, date: string) {
  const [year, month, day] = date.split("-") as [string, string, string];
  await user.type(within(sheet).getByRole("textbox", { name: /^Name/ }), "Ada");
  await user.type(within(sheet).getByRole("textbox", { name: "Month" }), month);
  await user.type(within(sheet).getByRole("textbox", { name: "Day" }), day);
  await user.type(within(sheet).getByRole("textbox", { name: "Year" }), year);
}

describe("AddChild", () => {
  it("shows the guardian's consent in full before its one unchecked box", async () => {
    const { sheet } = await openSheet();
    expect(within(sheet).getByText(CHILD_CONSENT_DISCLOSURES["2026-10"].text)).toBeInTheDocument();
    const box = within(sheet).getByRole("checkbox", {
      name: /I agree to this on the child's behalf/,
    });
    expect(box).not.toBeChecked();
    expect(within(sheet).getByText("Consent text version 2026-10.")).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "Not set" })).toBeChecked();
  });

  it("names each missing piece and sends nothing until the box is ticked", async () => {
    const { user, sheet } = await openSheet();
    await user.click(within(sheet).getByRole("button", { name: "Add the child" }));
    expect(within(sheet).getByText("Enter the child's name.")).toBeInTheDocument();
    expect(within(sheet).getByText("Enter the date of birth.")).toBeInTheDocument();
    expect(within(sheet).getByText("Tick the box to add the child.")).toBeInTheDocument();
    await fill(user, sheet, "2026-10-05");
    await user.click(within(sheet).getByRole("button", { name: "Add the child" }));
    expect(
      within(sheet).getByText("That date is after today. Check the date."),
    ).toBeInTheDocument();
    expect(api.calls).toEqual([]);
  });

  it("sends the child with the consent version, says so, and reads the page again", async () => {
    api.route("POST /api/v1/children", json({ id: "x" }, 201));
    const { user, sheet } = await openSheet();
    await fill(user, sheet, "2026-09-24");
    await user.click(within(sheet).getByRole("radio", { name: "Female" }));
    await user.click(within(sheet).getByRole("checkbox", { name: /I agree/ }));
    await user.click(within(sheet).getByRole("button", { name: "Add the child" }));
    expect(await screen.findByText("Ada was added.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const [call] = api.calls;
    expect(call?.key).toMatch(/^[0-9a-f-]{36}$/);
    const body = call?.body as { id: string };
    expect(body).toEqual({
      displayName: "Ada",
      dateOfBirth: "2026-09-24",
      sex: "female",
      id: body.id,
      guardianConsent: { given: true, textVersion: "2026-10" },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("puts the API's refusal under its field, and a failure under the form", async () => {
    api.route(
      "POST /api/v1/children",
      problem(422, { errors: [{ path: "dateOfBirth", message: "Expected a calendar date" }] }),
    );
    api.route("POST /api/v1/children", problem(500));
    const { user, sheet } = await openSheet();
    await fill(user, sheet, "2026-09-24");
    await user.click(within(sheet).getByRole("checkbox", { name: /I agree/ }));
    await user.click(within(sheet).getByRole("button", { name: "Add the child" }));
    expect(await within(sheet).findByText("Enter the date of birth.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add the child" }));
    expect(
      await within(sheet).findByText("We could not add the child. Try again."),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
