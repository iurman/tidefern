import Link from "next/link";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/privacy",
  "Privacy",
  "How Tidefern handles account data, device storage and email. A draft until the owner approves it.",
  false,
);

export default function PrivacyPage() {
  return (
    <article className="wrap narrow section" aria-labelledby="privacy-title">
      <p className="eyebrow">Draft, not yet reviewed</p>
      <h1 id="privacy-title">Privacy</h1>
      <p className="intro">
        This page will describe how Tidefern handles account data, what the app stores on your
        device, and the email it sends. It is a placeholder while the product is built for one
        household, and it carries no operative promise until the owner approves it.
      </p>
      <p>
        Health data has its own page, kept separate on purpose:{" "}
        <Link href="/health-privacy" prefetch={false}>
          Consumer Health Data Privacy Policy
        </Link>
        .
      </p>
    </article>
  );
}
