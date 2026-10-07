"use client";
import { useEffect } from "react";
import { takeInvitationFragment } from "@/lib/invitation-fragment";

/**
 * Takes an `#invitation=` fragment out of the address bar on a page that
 * cannot act on it, and forgets the token. That page is /closing: the (app)
 * layout sends an account that is closing there, and the redirect keeps
 * the fragment of the invitation link the person opened. The API refuses a
 * closing account everything but the closure, the export and the consents,
 * so nothing could accept the invitation. Renders nothing.
 */
export function DropInvitationFragment() {
  useEffect(() => {
    takeInvitationFragment();
  }, []);
  return null;
}
