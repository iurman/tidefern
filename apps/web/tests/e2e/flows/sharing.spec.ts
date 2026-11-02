import { expect, test, type Page } from "@playwright/test";
import { freshAccount, onboard } from "../session";
import {
  agreeToTerms,
  api,
  capturedMail,
  checkState,
  confirmEmail,
  expectLimiterUntouched,
  nextStep,
  ownBrowser,
  signInThroughForm,
  signUpThroughForm,
  skipPasskey,
  stepHeading,
  zoneAndStage,
} from "./steps";
import { signInUrl } from "../sign-in-redirect";

/**
 * Sharing between two new people, across both their browsers (task J1): a
 * fresh owner invites a partner who has only just signed up; the partner
 * opens the captured invitation while signed out, signs in, is taken
 * through onboarding with the invitation held, and accepts it on the
 * sharing screen. The owner shares one category; the partner sees exactly
 * that category and nothing else, on Sharing, on Today and in what the API
 * holds for him; the owner turns it off in one step and the partner loses
 * it. Both accounts are the test's own, so no seeded persona changes; the
 * owner's sign-in is minutes old, fresh enough for the grant. Against a
 * server without a database the helper hands back the canned cookie and
 * the sharing screen says it could not load, which the test asserts.
 * Nothing here is tagged @smoke.
 */

const loadFailed = "We could not load who you share with just now. Reload the page to try again.";

interface Held {
  grants: { ownerId: string; category: string; level: string }[];
}

async function grantsHeld(page: Page): Promise<Held["grants"]> {
  return (await api<Held>(page, "/api/v1/me")).grants;
}

test("an owner invites a new partner by mail, he accepts after sign-in, sees exactly what she shares, and loses it when she stops", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240_000);
  // The owner first: making her account clears the mail capture, which then holds only what follows.
  const owner = await freshAccount(page, { label: "flow-share-owner", name: "Ada" });
  if (owner === null) {
    await page.goto("/sharing");
    await expect(page.getByText(loadFailed)).toBeVisible();
    return;
  }
  await onboard(page, { stage: "cycle", timeZone: "Europe/Berlin", displayName: "Ada" });
  const { id: ownerId } = await api<{ id: string }>(page, "/api/v1/me");

  const partnerPage = await ownBrowser(browser, info, { timezoneId: "Europe/Berlin" });
  try {
    // He signs up through the form and confirms his email, and is not signed in yet.
    const partner = await signUpThroughForm(partnerPage, "Bea", "share-partner");
    if (partner === null) throw new Error("the server made one account and not the other");
    await confirmEmail(partnerPage, partner.email);

    // She invites him from the sharing screen.
    await page.goto("/sharing");
    await page.getByRole("textbox", { name: /Their email/ }).fill(partner.email);
    await page.getByRole("button", { name: "Send the invitation" }).click();
    await expect(page.getByText(`Invitation sent to ${partner.email}.`)).toBeVisible();
    await expect(page.getByRole("article", { name: partner.email })).toBeVisible();
    const invitation = await capturedMail(partnerPage, partner.email, "An invitation to Tidefern");
    expect(new URL(invitation.link).pathname).toBe("/sharing");
    expect(new URL(invitation.link).search, "the token never travels in a query").toBe("");

    // Signed out, the link sends him to sign in, which keeps the token out of the address bar.
    await partnerPage.goto(invitation.link);
    await expect(partnerPage).toHaveURL(signInUrl("/sharing"));
    await signInThroughForm(partnerPage, partner);
    // No profile yet: onboarding holds the invitation and hands it to the sharing screen at the end.
    await expect(partnerPage).toHaveURL(/\/welcome$/);
    await zoneAndStage(partnerPage, "Europe/Berlin", "Here for someone else");
    await stepHeading(partnerPage, "Before you start");
    await agreeToTerms(partnerPage, { consent: false });
    await nextStep(partnerPage);
    await skipPasskey(partnerPage);
    const panel = partnerPage.getByRole("region", { name: "An invitation for you" });
    await expect(panel).toBeVisible();
    await expect(partnerPage).toHaveURL(/\/sharing$/);
    await checkState(partnerPage, "the invitation waiting for him");
    await panel.getByRole("button", { name: "Accept the invitation" }).click();
    await expect(panel.getByText("You joined Ada's household.")).toBeVisible();
    await expect(partnerPage.getByRole("article", { name: "Ada" })).toContainText(
      "household owner",
    );
    expect(await grantsHeld(partnerPage), "joining shares nothing by itself").toEqual([]);

    // She turns on his cycle status through the confirm step.
    await page.reload();
    const bea = page.getByRole("article", { name: "Bea" });
    await expect(bea).toContainText("partner");
    const status = bea.getByRole("switch", { name: "Cycle status", exact: true });
    await expect(status).toHaveAttribute("aria-checked", "false");
    await status.click();
    const confirm = page.getByRole("dialog", { name: "Share your cycle status with Bea?" });
    await confirm.getByRole("button", { name: "Share with Bea" }).click();
    await expect(bea.getByText("Bea can now see your cycle status.")).toBeVisible();
    await expect(status).toHaveAttribute("aria-checked", "true");

    // He sees exactly that: one category at its level, on Sharing, on Today and in what he holds.
    expect(await grantsHeld(partnerPage)).toEqual([
      expect.objectContaining({ ownerId, category: "cycle.status", level: "summary" }),
    ]);
    await partnerPage.goto("/sharing");
    const held = partnerPage
      .getByRole("article", { name: "Ada" })
      .getByRole("region", { name: "Ada shares with you" });
    await expect(held).toContainText("Cycle status");
    await expect(held).toContainText("Level: summary");
    for (const other of ["Cycle history", "Symptoms", "Private notes", "Pregnancy overview"]) {
      await expect(held, `${other} was never shared`).not.toContainText(other);
    }
    await checkState(partnerPage, "what Ada shares with him");
    await partnerPage.goto("/today");
    const card = partnerPage.getByRole("region", { name: "Ada" });
    await expect(card.getByText("Cycle status", { exact: true })).toBeVisible();

    // Off is one step: no dialog, and the switch says so.
    await page.reload();
    await status.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(bea.getByText("Bea can no longer see your cycle status.")).toBeVisible();
    await expect(status).toHaveAttribute("aria-checked", "false");

    // He loses it at once, everywhere he saw it.
    expect(await grantsHeld(partnerPage)).toEqual([]);
    await partnerPage.goto("/today");
    await expect(partnerPage.getByRole("region", { name: "Ada" })).toHaveCount(0);
    await partnerPage.goto("/sharing");
    const ada = partnerPage.getByRole("article", { name: "Ada" });
    await expect(ada).toContainText("household owner");
    await expect(ada.getByRole("region", { name: "Ada shares with you" })).toHaveCount(0);
    await expect(ada).not.toContainText("Cycle status");
    expectLimiterUntouched();
  } finally {
    await partnerPage.context().close();
  }
});
