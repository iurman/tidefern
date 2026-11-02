"use client";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/ui/inline-feedback";
import { sharingCopy as copy } from "./copy";
import { SIGN_IN_AGAIN_PATH } from "./problems";
import styles from "./sharing.module.css";

/**
 * The next step after the API's ten-minute rule refused a change
 * (architecture 6.1, `fresh_authentication_required`): say why, and offer a
 * sign-in that comes back to /sharing. Never a retry, which would be
 * refused the same way.
 */
export function FreshSignIn({ sentence }: { sentence: string }) {
  return (
    <div className={styles.freshAuth}>
      <InlineFeedback tone="error" cue>
        {sentence}
      </InlineFeedback>
      <div className={styles.actions}>
        <Button href={SIGN_IN_AGAIN_PATH} variant="secondary">
          {copy.freshAuth.action}
        </Button>
      </div>
    </div>
  );
}
