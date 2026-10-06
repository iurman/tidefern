import { Button } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site";
import styles from "../auth.module.css";
import { authCopy } from "../copy";

const copy = authCopy.verify;

export const metadata = pageMetadata("/verify", copy.title, copy.description, false);

/**
 * Where the link in a confirmation mail lands. Better Auth verifies the
 * token itself and redirects here, plain on success and with `?error=` when
 * the token is missing, used or expired; this page only reads which. It
 * never signs the person in (that stays off, C1 decision 8), so the one
 * action is the sign-in.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  const failed = typeof error === "string" && error.length > 0;
  return (
    <section className={styles.card} aria-labelledby="verify-title">
      <h1 id="verify-title" className={styles.heading}>
        {failed ? copy.failedHeading : copy.heading}
      </h1>
      <p className={styles.lede}>{failed ? copy.failedLede : copy.lede}</p>
      <div className={styles.actions}>
        <Button href="/sign-in">{copy.signIn}</Button>
      </div>
    </section>
  );
}
