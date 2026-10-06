import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import { twoFactorCopy as copy } from "./copy";
import { TwoFactorForm } from "./two-factor-form";
import styles from "./two-factor.module.css";

export const metadata = pageMetadata("/settings/two-factor", copy.title, copy.description, false);

/**
 * Two-step sign-in (architecture 6.1: TOTP with single-use backup codes,
 * never a remembered device). The server renders the heading and the
 * frame; the state and every step are the client's, because the secret
 * and the backup codes come back from Better Auth to the browser's own
 * cookie and are shown there once.
 */
export default function TwoFactorPage() {
  return (
    <section className={styles.page} aria-labelledby="two-factor-title">
      <h1 id="two-factor-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <p className={styles.lede}>{copy.lede}</p>
      <TwoFactorForm />
      <p className={styles.related}>
        <TextLink href="/settings/devices">{copy.devicesLink}</TextLink>
      </p>
    </section>
  );
}
