import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth-client";
import {
  categoryLabels,
  categoryOrder,
  joinLabels,
  settingsCopy,
  settingsPaths,
  signInAgainHref,
} from "./copy";

describe("the settings copy", () => {
  it("returns from a fresh sign-in to the screen it was asked on, by a path the sign-in accepts", () => {
    const href = signInAgainHref(settingsPaths.export);
    expect(href).toBe("/sign-in?next=%2Fsettings%2Fexport");
    const next = new URLSearchParams(href.split("?")[1]).get("next");
    expect(safeNextPath(next)).toBe("/settings/export");
    expect(
      safeNextPath(new URLSearchParams(signInAgainHref("/closing").split("?")[1]).get("next")),
    ).toBe("/closing");
  });

  it("names every data category in the vocabulary's order, private notes included", () => {
    expect(categoryOrder).toEqual([
      "cycle.status",
      "cycle.history",
      "cycle.symptoms",
      "journal.private",
      "pregnancy.overview",
      "pregnancy.photos",
      "child",
    ]);
    expect(categoryLabels["journal.private"]).toBe("Private notes");
  });

  it("joins category labels into a sentence", () => {
    expect(joinLabels([])).toBe("");
    expect(joinLabels(["Symptoms"])).toBe("symptoms");
    expect(joinLabels(["Cycle history", "Symptoms", "Private notes"])).toBe(
      "cycle history, symptoms and private notes",
    );
  });

  it("words the destructive line with the explicit undo, never the sign-in alone", () => {
    const line = settingsCopy.close.consequence["undo-window"];
    expect(line).toContain("locks it now and deletes it in 7 days");
    expect(line).toContain("sign in and undo it");
    expect(line).not.toMatch(/Signing in again before then cancels/);
  });

  it("marks the lock-screen wording the owner has not written yet, and keeps email generic", () => {
    const body = settingsCopy.notifications.preview.body;
    expect(body.generic).toBe("You have a reminder in Tidefern.");
    expect(body.gentle).toMatch(/^\[OWNER\]/);
    expect(body.detailed).toMatch(/^\[OWNER\]/);
    expect(settingsCopy.notifications.email).toBe("Emails always stay generic.");
  });

  it("keeps every settings path neutral and under /settings, except activity's own route", () => {
    for (const [key, path] of Object.entries(settingsPaths)) {
      if (key === "activity") expect(path).toBe("/activity");
      else expect(path).toMatch(/^\/settings(\/[a-z-]+)?$/);
    }
  });
});
