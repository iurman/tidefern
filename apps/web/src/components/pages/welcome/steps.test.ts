import { CONSENT_DISCLOSURES, DataCategory, Stage } from "@tidefern/schemas";
import { describe, expect, it } from "vitest";
import { CONSENT_CATEGORIES, asksConsent, currentConsentVersion, processorsFor } from "./consent";
import {
  CATEGORY_LABELS,
  consentFacts,
  hasDatesStep,
  stepAfter,
  stepBefore,
  stepName,
  stepsFor,
} from "./steps";

describe("the steps a stage has", () => {
  it("counts the dates step before a stage is chosen, and for every stage core asks about", () => {
    expect(stepsFor(null, true)).toEqual(["zone", "stage", "dates", "consent", "passkey"]);
    for (const stage of ["cycle", "pregnancy", "postpartum"] as const) {
      expect(hasDatesStep(stage)).toBe(true);
      expect(stepsFor(stage, true)).toHaveLength(5);
    }
  });

  it("drops the dates step for here for someone else, whom core never asks about her body", () => {
    expect(hasDatesStep("none")).toBe(false);
    expect(stepsFor("none", true)).toEqual(["zone", "stage", "consent", "passkey"]);
  });

  it("drops the passkey step when the browser has no WebAuthn", () => {
    expect(stepsFor("cycle", false)).toEqual(["zone", "stage", "dates", "consent"]);
    expect(stepsFor("none", false)).toEqual(["zone", "stage", "consent"]);
  });

  it("walks forward and back, and stops at either end", () => {
    const steps = stepsFor("pregnancy", true);
    expect(stepAfter(steps, "zone")).toBe("stage");
    expect(stepAfter(steps, "consent")).toBe("passkey");
    expect(stepAfter(steps, "passkey")).toBeNull();
    expect(stepBefore(steps, "dates")).toBe("stage");
    expect(stepBefore(steps, "zone")).toBeNull();
    // Without WebAuthn the consent step is the last one, so it finishes.
    expect(stepAfter(stepsFor("pregnancy", false), "consent")).toBeNull();
  });

  it("names the steps as DESIGN.md 3.2 does, and the agreement step Terms when nothing is collected", () => {
    expect(stepsFor("cycle", true).map((step) => stepName(step, "cycle"))).toEqual([
      "Time zone",
      "Stage",
      "Dates",
      "Consent",
      "Passkey",
    ]);
    expect(stepName("consent", null)).toBe("Consent");
    expect(stepName("consent", "none")).toBe("Terms");
  });
});

describe("the collection consent per stage", () => {
  it("lists only real categories, each once, and none for here for someone else", () => {
    for (const stage of Stage.options) {
      const categories = CONSENT_CATEGORIES[stage];
      for (const category of categories) expect(DataCategory.options).toContain(category);
      expect(new Set(categories).size).toBe(categories.length);
    }
    expect(CONSENT_CATEGORIES.none).toEqual([]);
    expect(asksConsent("none")).toBe(false);
    expect(asksConsent("cycle")).toBe(true);
  });

  it("never asks for a status card or photos at onboarding: those are consents for sharing", () => {
    for (const stage of Stage.options) {
      expect(CONSENT_CATEGORIES[stage]).not.toContain("cycle.status");
      expect(CONSENT_CATEGORIES[stage]).not.toContain("pregnancy.photos");
      expect(CONSENT_CATEGORIES[stage]).not.toContain("child");
    }
  });

  it("shows each category by its sharing name, and the catalog's own purpose beside it", () => {
    const facts = consentFacts("pregnancy");
    expect(facts.categories).toEqual(["Pregnancy overview", "Symptoms", "Private notes"]);
    const disclosure = CONSENT_DISCLOSURES[currentConsentVersion()];
    expect(facts.purposes).toEqual([
      disclosure.categories["pregnancy.overview"].purpose,
      disclosure.categories["cycle.symptoms"].purpose,
      disclosure.categories["journal.private"].purpose,
    ]);
    for (const category of DataCategory.options) {
      expect(CATEGORY_LABELS[category]).toMatch(/^[A-Z][a-z ]+$/);
    }
  });

  it("shows the newest consent text version", () => {
    expect(currentConsentVersion()).toBe("2026-10");
  });
});

describe("the processors the consent names", () => {
  const summary = [
    { name: "Cloudflare", receives: "DNS queries" },
    { name: "Resend", receives: "Email addresses" },
    { name: "GitHub", receives: "Source code" },
    { name: "Neon (Databricks, Inc.)", receives: "The database" },
    { name: "Vercel", receives: "The application" },
  ];

  it("follows the catalog's order, each with what the data summary says it receives", () => {
    const listed = processorsFor(summary);
    expect(listed?.map((processor) => processor.name)).toEqual(
      CONSENT_DISCLOSURES[currentConsentVersion()].processors,
    );
    expect(listed?.[0]).toEqual({ name: "Vercel", receives: "The application" });
  });

  it("is null when the summary leaves one out, so the consent never names fewer", () => {
    expect(processorsFor(summary.filter((processor) => processor.name !== "Resend"))).toBeNull();
    expect(processorsFor([])).toBeNull();
  });
});
