import {
  FactList,
  OwnerInput,
  PolicyDocument,
  PolicySection,
} from "@/components/public/policy-document";
import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/health-privacy",
  "Consumer Health Data Privacy Policy",
  "What this page contains is what the Washington My Health My Data Act, RCW 19.373, requires it to contain.",
  false,
);

const contents = [
  { id: "collected", label: "What is collected and why" },
  { id: "sources", label: "Where it comes from" },
  { id: "shared", label: "What is shared and with whom" },
  { id: "rights", label: "How to exercise your rights" },
  { id: "appeal", label: "If a request is refused" },
  { id: "contact", label: "Contact" },
];

/**
 * Only the RCW 19.373.020 items (categories collected and purposes,
 * sources, categories shared and the processors by name, how to exercise
 * each right) plus the request and appeal path, as architecture 9.6 and
 * section 11 record them. The page is linked from every public page as
 * "Consumer Health Data Privacy Policy" and carries nothing else.
 */
export default function HealthPrivacyPage() {
  return (
    <PolicyDocument
      eyebrow="Policy"
      title="Consumer Health Data Privacy Policy"
      updated={<OwnerInput>date</OwnerInput>}
      draft
      contents={contents}
    >
      <p className="intro">
        This page is the notice the Washington My Health My Data Act (RCW 19.373) requires, and it
        contains only what that notice must contain. Account data that is not health data is covered
        on the <TextLink href="/privacy">Privacy</TextLink> page.
      </p>

      <PolicySection id="collected" heading="What is collected and why">
        <p>
          Tidefern collects these categories of consumer health data, each for the purpose beside it
          and for no other use.
        </p>
        <FactList
          items={[
            {
              term: "Cycle dates, flow, symptoms and moods",
              detail:
                "To show your own records back to you and to estimate your next period and fertile days from the dates you log.",
            },
            {
              term: "Pregnancy dates, appointments and milestones",
              detail: "To show the week you are in and what is coming.",
            },
            {
              term: "A child's feeds, sleep, measurements and milestones",
              detail:
                "To keep a child's record for every guardian and to draw growth against a reference band. A child's data entered by a parent is treated as the child's health data.",
            },
            {
              term: "Notes",
              detail:
                "To keep them for you. Notes are encrypted with a key made for you and private notes are never shared.",
            },
          ]}
        />
        <p>
          The only other use is to show a person you have granted exactly the categories you
          granted, which you can change or take back at any time. Nothing is used to advertise, and
          nothing is sold.
        </p>
      </PolicySection>

      <PolicySection id="sources" heading="Where it comes from">
        <p>
          From you, and from a partner or guardian you invited and who contributes to your record or
          to a child&apos;s. There is no other source: no device integration, no purchase, no
          inference from your behavior.
        </p>
      </PolicySection>

      <PolicySection id="shared" heading="What is shared and with whom">
        <p>
          No consumer health data is sold, and none is shared with a third party for its own
          purposes. It reaches two kinds of recipient.
        </p>
        <FactList
          items={[
            {
              term: "People you grant",
              detail:
                "A partner or guardian sees the categories you turned on for them, described in plain words before each one can be turned on, and nothing else. A child's record is seen by the child's guardians.",
            },
            {
              term: "Vercel",
              detail:
                "A processor. It runs the application and handles your data in memory while serving your requests.",
            },
            {
              term: "Neon (Databricks, Inc.)",
              detail:
                "A processor. It hosts the database that stores your records; notes are stored encrypted.",
            },
          ]}
        />
        <p>
          Resend sends the email described on the Privacy page and receives your email address only;
          GitHub and Cloudflare receive no health data. Affiliates:{" "}
          <OwnerInput>none, or the list</OwnerInput>.
        </p>
      </PolicySection>

      <PolicySection id="rights" heading="How to exercise your rights">
        <p>
          Each right has a place in the product once you are signed in; the inbox below works for
          every one of them too, including for people without an account. Requests are answered
          within 45 days, which may be extended once by 45 days when a request is complex.
        </p>
        <FactList
          items={[
            {
              term: "Confirm and access",
              detail:
                "Once signed in, your account can show you the categories held about you, every processor above with its contact, and every person who holds a grant; the export gives you the data itself after you sign in again.",
            },
            {
              term: "Withdraw consent",
              detail:
                "Settings has one control for the collection consent. Because Tidefern cannot run without collecting, withdrawing it closes your account.",
            },
            {
              term: "Delete",
              detail: (
                <>
                  Delete a note or an entry at any time, or close your account from Settings, which
                  is described on <TextLink href="/account/delete">Delete your account</TextLink>.
                  Processors are told to delete what they hold.
                </>
              ),
            },
            {
              term: "Take back a grant",
              detail:
                "Turn a category off for a person in Sharing and it stops at their next request.",
            },
          ]}
        />
      </PolicySection>

      <PolicySection id="appeal" heading="If a request is refused">
        <p>
          A refused request gets a written reason. You can appeal by replying to the inbox below;
          the appeal is decided in writing within 45 days. If the appeal is denied, the answer tells
          you how to contact the Washington State Attorney General.
        </p>
      </PolicySection>

      <PolicySection id="contact" heading="Contact">
        <p>
          Requests and appeals go to <OwnerInput>inbox address</OwnerInput>. This service is
          operated by <OwnerInput>legal entity name and address</OwnerInput>. Attorney review of
          this policy: <OwnerInput>attorney review date</OwnerInput>.
        </p>
      </PolicySection>
    </PolicyDocument>
  );
}
