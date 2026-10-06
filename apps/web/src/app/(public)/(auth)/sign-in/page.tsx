import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import styles from "../auth.module.css";
import { authCopy } from "../copy";
import { SignInForm } from "./sign-in-form";

const copy = authCopy.signIn;

export const metadata = pageMetadata("/sign-in", copy.title, copy.description, false);

export default function SignInPage() {
  return (
    <section className={styles.card} aria-labelledby="sign-in-title">
      <SignInForm />
      <ul className={styles.links}>
        <li>
          <TextLink href="/reset">{copy.forgot}</TextLink>
        </li>
        <li>
          <span>{copy.noAccount}</span>
          <TextLink href="/sign-up">{copy.createAccount}</TextLink>
        </li>
      </ul>
    </section>
  );
}
