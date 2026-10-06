import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site";
import styles from "../auth.module.css";
import { authCopy } from "../copy";
import { readVerifyOutcome, type VerifyOutcome } from "./outcome";

const copy = authCopy.verify;

export const metadata = pageMetadata("/verify", copy.title, copy.description, false);

const outcomes: Record<VerifyOutcome, { heading: string; lede: string }> = {
  confirmed: { heading: copy.confirmedHeading, lede: copy.confirmedLede },
  failed: { heading: copy.failedHeading, lede: copy.failedLede },
  none: { heading: copy.heading, lede: copy.lede },
};

/**
 * Where the link in a confirmation mail lands. Better Auth verifies the
 * token itself and redirects here: to the callback as the sign-up sent it
 * (`/verify?done=1`) on success, with `?error=` appended when the token is
 * missing, used or expired. This page only reads which. Without either
 * marker nobody was sent here, so a direct visit or a stale bookmark sees
 * the reminder to open the mail rather than a result that never happened.
 * It never signs the person in (that stays off, C1 decision 8), so the one
 * action is the sign-in.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const outcome = outcomes[readVerifyOutcome(await searchParams)];
  return (
    <section className={styles.card} aria-labelledby="verify-title">
      <h1 id="verify-title" className={styles.heading}>
        {outcome.heading}
      </h1>
      <p className={styles.lede}>{outcome.lede}</p>
      <div className={styles.actions}>
        <Button href="/sign-in">{copy.signIn}</Button>
      </div>
    </section>
  );
}
