import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import styles from "../auth.module.css";
import { authCopy } from "../copy";
import { SignUpForm } from "./sign-up-form";

const copy = authCopy.signUp;

export const metadata = pageMetadata("/sign-up", copy.title, copy.description, false);

export default function SignUpPage() {
  return (
    <section className={styles.card} aria-labelledby="sign-up-title">
      <h1 id="sign-up-title" className={styles.heading}>
        {copy.heading}
      </h1>
      <p className={styles.lede}>{copy.lede}</p>
      <SignUpForm />
      <ul className={styles.links}>
        <li>
          <span>{copy.haveAccount}</span>
          <TextLink href="/sign-in">{copy.signIn}</TextLink>
        </li>
      </ul>
    </section>
  );
}
