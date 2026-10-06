import { redirect } from "next/navigation";
import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import styles from "../auth.module.css";
import { authCopy } from "../copy";
import { RequestResetForm } from "./request-form";

const copy = authCopy.reset;

export const metadata = pageMetadata("/reset", copy.title, copy.description, false);

/**
 * Asks for the email a reset link goes to. Better Auth answers the link in
 * that mail by redirecting here with `?token=` when it is valid, so a valid
 * token moves on to /reset/[token] where the new password is set, and
 * `?error=` when it is not, which this page shows above the form.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, error } = await searchParams;
  if (typeof token === "string" && token.length > 0) {
    redirect(`/reset/${encodeURIComponent(token)}`);
  }
  const expired = typeof error === "string" && error.length > 0;
  return (
    <section className={styles.card} aria-labelledby="reset-title">
      <h1 id="reset-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <p className={styles.lede}>{copy.lede}</p>
      <RequestResetForm expired={expired} />
      <ul className={styles.links}>
        <li>
          <TextLink href="/sign-in">{copy.backToSignIn}</TextLink>
        </li>
      </ul>
    </section>
  );
}
