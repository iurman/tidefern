import { headers } from "next/headers";
import { PolicyDocument } from "@/components/public/policy-document";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { CLOSING_PATH } from "@/lib/auth-client";
import { pageMetadata } from "@/lib/site";
import { readSession } from "./session";

export const metadata = pageMetadata(
  "/account/delete",
  "Delete your account",
  "What closing your Tidefern account deletes, when, and where to do it.",
  false,
);

// The action depends on the session, so the page renders per request and is never cached.
export const dynamic = "force-dynamic";

const copy = {
  paragraph:
    "Closing your account locks it now and deletes it in 7 days. Until then, you can sign in and undo it. Locking ends every session and every grant at once, so nobody you shared with can see anything from the moment you confirm. After the 7 days your records, your notes and the key that encrypted them are deleted, and the database history that could restore them ages out within 7 more days. The processors that hold your email address are told to delete it.",
  signedOut: {
    lede: "Closing happens from your account, so sign in first.",
    action: "Sign in to continue",
  },
  signedIn: {
    lede: "The closure lives in Settings, where you confirm it after signing in again.",
    action: "Close my account",
  },
  closing: {
    lede: "Your account is already closing. Its own page says what happens next and what you can still do.",
    action: "See your account",
  },
  failed: "We could not check whether you are signed in. Try again.",
};

/**
 * The public entry point for account closure (architecture 11, required by
 * Google Play later): one paragraph that says what closing deletes and
 * when, then one action that depends on the session. Signed out, the
 * action goes to sign in; signed in, to Settings, where the destructive
 * confirmation lives; already closing, to the locked view at /closing. No
 * warmth surface.
 */
export default async function DeleteAccountPage() {
  const session = await readSession(await headers());
  const state =
    session === "closing" ? copy.closing : session === "signed-in" ? copy.signedIn : copy.signedOut;
  const href =
    session === "closing" ? CLOSING_PATH : session === "signed-in" ? "/settings" : "/sign-in";
  return (
    <PolicyDocument eyebrow="Account" title="Delete your account">
      <p className="intro">{copy.paragraph}</p>
      {session === "failed" ? <InlineFeedback tone="error">{copy.failed}</InlineFeedback> : null}
      <p>{state.lede}</p>
      <Button href={href}>{state.action}</Button>
    </PolicyDocument>
  );
}
