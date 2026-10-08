import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileFields, ProfileSnapshot, PutAnswer } from "./profile-input";
import type { ProfileTransport } from "./profile-store";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), goTo: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: nav.refresh }) }));
vi.mock("./navigate", () => ({ goTo: nav.goTo }));

const { NotificationsControl, ProfileForm, UnitsControl } = await import("./profile-groups");
const { ProfileProvider } = await import("./profile-state");

const saved: ProfileSnapshot = {
  displayName: "Noor",
  timeZone: "Europe/Berlin",
  stage: "cycle",
  weekStart: 1,
  units: "metric",
  notificationDetail: "generic",
  version: 3,
};

/** A transport that answers each PUT from `answers` in turn, saving like the route when none is left. */
function transport(answers: PutAnswer[] = []) {
  const puts: { body: ProfileFields; version: number }[] = [];
  const fake: ProfileTransport = {
    async put(body, version) {
      puts.push({ body, version });
      return answers.shift() ?? { kind: "saved", profile: { ...body, version: version + 1 } };
    },
    async read() {
      return null;
    },
  };
  return { fake, puts };
}

beforeEach(() => {
  nav.refresh.mockReset();
  nav.goTo.mockReset();
});

describe("the profile group", () => {
  it("saves a new name with every other field resent and If-Match from the profile read", async () => {
    const user = userEvent.setup();
    const { fake, puts } = transport();
    render(
      <ProfileProvider initial={saved} transport={fake}>
        <ProfileForm />
      </ProfileProvider>,
    );
    const save = screen.getByRole("button", { name: "Save profile" });
    expect(save).toBeDisabled();
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "  Noor B  ");
    await user.click(save);
    expect(await screen.findByText("Saved.")).toBeVisible();
    expect(puts).toEqual([
      {
        version: 3,
        body: {
          displayName: "Noor B",
          timeZone: "Europe/Berlin",
          stage: "cycle",
          weekStart: 1,
          units: "metric",
          notificationDetail: "generic",
        },
      },
    ]);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Noor B");
  });

  it("keeps the chosen stage and points to Journey when the API says a pregnancy starts there", async () => {
    const user = userEvent.setup();
    const { fake } = transport([{ kind: "refused", status: 422, detail: "stage_needs_record" }]);
    render(
      <ProfileProvider initial={saved} transport={fake}>
        <ProfileForm />
      </ProfileProvider>,
    );
    await user.click(screen.getByRole("radio", { name: "Pregnant" }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/with a due date or your last period/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Journey" })).toHaveAttribute("href", "/journey");
    expect(screen.getByRole("radio", { name: "Pregnant" })).toBeChecked();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("sends a person whose session is gone to sign in", async () => {
    const user = userEvent.setup();
    const { fake } = transport([{ kind: "refused", status: 401 }]);
    render(
      <ProfileProvider initial={saved} transport={fake}>
        <ProfileForm />
      </ProfileProvider>,
    );
    await user.click(screen.getByRole("radio", { name: "Here for someone else" }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await vi.waitFor(() => expect(nav.goTo).toHaveBeenCalledWith("/sign-in"));
  });

  it("says its read failed instead of showing controls with nothing behind them", () => {
    render(
      <ProfileProvider initial={null}>
        <ProfileForm />
      </ProfileProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("We could not load this just now.");
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
  });
});

describe("units and notification detail", () => {
  it("saves units as soon as they are chosen, keeping the detail level and the week start", async () => {
    const user = userEvent.setup();
    const { fake, puts } = transport();
    render(
      <ProfileProvider
        initial={{ ...saved, notificationDetail: "detailed", weekStart: 7 }}
        transport={fake}
      >
        <UnitsControl />
      </ProfileProvider>,
    );
    await user.click(screen.getByRole("radio", { name: "Imperial" }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    expect(puts[0]?.body).toMatchObject({
      units: "imperial",
      notificationDetail: "detailed",
      weekStart: 7,
    });
    expect(screen.getByRole("radio", { name: "Imperial" })).toBeChecked();
  });

  it("shows the preview for the level on screen and returns to the saved one when a save fails", async () => {
    const user = userEvent.setup();
    const { fake } = transport([{ kind: "refused", status: 503 }]);
    render(
      <ProfileProvider initial={saved} transport={fake}>
        <NotificationsControl />
      </ProfileProvider>,
    );
    expect(screen.getByText("You have a reminder in Tidefern.")).toBeVisible();
    expect(screen.getByText("Emails always stay generic.")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Gentle" }));
    expect(await screen.findByText(/problem on our side/)).toBeVisible();
    expect(screen.getByRole("radio", { name: "Generic" })).toBeChecked();
    expect(screen.getByText("You have a reminder in Tidefern.")).toBeVisible();
  });

  it("marks the gentle wording as the owner's to write", async () => {
    const user = userEvent.setup();
    const { fake } = transport();
    render(
      <ProfileProvider initial={saved} transport={fake}>
        <NotificationsControl />
      </ProfileProvider>,
    );
    await user.click(screen.getByRole("radio", { name: "Gentle" }));
    expect(await screen.findByText("Saved.")).toBeVisible();
    expect(screen.getByText(/^\[OWNER\] The gentle reminder wording$/)).toBeVisible();
  });
});
