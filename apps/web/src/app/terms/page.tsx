import { OwnerInput, PolicyDocument, PolicySection } from "@/components/public/policy-document";
import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/terms",
  "Terms",
  "The terms for using Tidefern. A draft until the owner approves it.",
  false,
);

const contents = [
  { id: "service", label: "What Tidefern is" },
  { id: "account", label: "Your account" },
  { id: "content", label: "Your content" },
  { id: "ending", label: "Ending the agreement" },
  { id: "legal", label: "The legal text" },
  { id: "contact", label: "Contact" },
];

/**
 * A draft until the owner's attorney reviews it. The sentences here state
 * what the product already does (architecture 8.4, 9.6, 11); the binding
 * legal text is an owner input and is marked as one.
 */
export default function TermsPage() {
  return (
    <PolicyDocument
      eyebrow="Policy"
      title="Terms"
      updated={<OwnerInput>date</OwnerInput>}
      draft
      contents={contents}
    >
      <p className="intro">
        These are the terms for using Tidefern. They are short on purpose, and the legal text that
        makes them binding is still to be written and reviewed.
      </p>

      <PolicySection id="service" heading="What Tidefern is">
        <p>
          Tidefern is a general wellness app for keeping your own records about cycles, pregnancy
          and early childhood, and for sharing chosen parts of them with people you pick.
        </p>
        <p>
          Tidefern gives estimates from what you log. It does not provide medical advice, diagnosis
          or treatment, and is not a form of birth control. Talk with your doctor or midwife before
          making health decisions.
        </p>
      </PolicySection>

      <PolicySection id="account" heading="Your account">
        <p>
          Tidefern is for adults. At sign-up you attest that you are 18 or older; an account found
          to belong to a minor is closed. A child never gets a login; a parent or guardian keeps the
          child&apos;s record.
        </p>
      </PolicySection>

      <PolicySection id="content" heading="Your content">
        <p>
          What you log is yours. Tidefern holds it only to run the service for you and the people
          you grant, as the <TextLink href="/privacy">Privacy</TextLink> page and the{" "}
          <TextLink href="/health-privacy">Consumer Health Data Privacy Policy</TextLink> describe,
          and claims no other right to it.
        </p>
      </PolicySection>

      <PolicySection id="ending" heading="Ending the agreement">
        <p>
          You can close your account at any time;{" "}
          <TextLink href="/account/delete">Delete your account</TextLink> says what closing does and
          when.
        </p>
      </PolicySection>

      <PolicySection id="legal" heading="The legal text">
        <p>
          The governing law, limitation of liability, warranty, dispute, account sharing, suspension
          and termination sections are an owner input and are not written yet:{" "}
          <OwnerInput>legal text, after attorney review</OwnerInput>. Until they are, nothing on
          this page is an operative agreement.
        </p>
      </PolicySection>

      <PolicySection id="contact" heading="Contact">
        <p>
          Questions about these terms go to <OwnerInput>inbox address</OwnerInput>. This service is
          operated by <OwnerInput>legal entity name and address</OwnerInput>.
        </p>
      </PolicySection>
    </PolicyDocument>
  );
}
