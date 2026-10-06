import { pageMetadata } from "@/lib/site";
import styles from "../../auth.module.css";
import { authCopy } from "../../copy";
import { NewPasswordForm } from "./new-password-form";

const copy = authCopy.newPassword;

export const metadata = pageMetadata("/reset", copy.title, copy.description, false);

/**
 * The second half of a reset: the token from the link, taken off the path
 * and handed to the form, which sends it with the new password. The server
 * decides whether it is still good; an expired one shows the failure state
 * with the way back to a fresh link.
 */
export default async function NewPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <section className={styles.card} aria-labelledby="new-password-title">
      <h1 id="new-password-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <p className={styles.lede}>{copy.lede}</p>
      <NewPasswordForm token={decodeURIComponent(token)} />
    </section>
  );
}
