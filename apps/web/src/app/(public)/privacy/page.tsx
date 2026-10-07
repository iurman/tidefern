import {
  FactList,
  OwnerInput,
  PolicyDocument,
  PolicySection,
} from "@/components/public/policy-document";
import { TextLink } from "@/components/ui/text-link";
import { pageMetadata, SOUND_KEY, THEME_KEY } from "@/lib/site";

export const metadata = pageMetadata(
  "/privacy",
  "Privacy",
  "What Tidefern stores about your account and how long.",
  false,
);

const contents = [
  { id: "account", label: "Your account data" },
  { id: "device", label: "Stored on your device" },
  { id: "email", label: "Email we send" },
  { id: "processors", label: "Who processes it for us" },
  { id: "retention", label: "How long we keep it" },
  { id: "rights", label: "Your choices" },
  { id: "contact", label: "Contact" },
];

/**
 * The general privacy policy: account data, device storage with each
 * key's basis and how to stop storing it, email, the processor list from
 * architecture 9.5 and the retention schedule from section 11. Health data
 * has its own page, kept separate on purpose (architecture 9.6). Every
 * fact here comes from the architecture record or is marked as an owner
 * input; nothing is promised that the build does not do.
 */
export default function PrivacyPage() {
  return (
    <PolicyDocument
      eyebrow="Policy"
      title="Privacy"
      updated={<OwnerInput>date</OwnerInput>}
      draft
      contents={contents}
    >
      <p className="intro">
        This page covers your account: what Tidefern stores to sign you in and run the service, what
        it keeps on your device, the email it sends, who processes data on its behalf and for how
        long. What happens to your health data is on its own page, the{" "}
        <TextLink href="/health-privacy">Consumer Health Data Privacy Policy</TextLink>, and nothing
        there is repeated here.
      </p>

      <PolicySection id="account" heading="Your account data">
        <p>Tidefern stores the following about your account, and nothing more.</p>
        <FactList
          items={[
            {
              term: "Email address",
              detail:
                "To sign you in, to confirm it is yours and to send the mail described below. Whether it has been confirmed is stored with it.",
            },
            {
              term: "Name",
              detail: "The name you give at sign-up and the display name you choose.",
            },
            {
              term: "Sign-in credentials",
              detail:
                "A password is stored as a hash, never as the password itself. A passkey is stored as its public key. If you turn on two-step sign-in, its secret and backup codes are stored for that purpose only.",
            },
            {
              term: "Sessions",
              detail:
                "When each session started, the IP address and browser it came from, so you can see and sign out other devices.",
            },
            {
              term: "Profile settings",
              detail:
                "Your time zone, units, the day your week starts, the stage you chose, how much detail a notification may carry, and the date you attested you are 18 or older. No date of birth is stored.",
            },
            {
              term: "Activity",
              detail:
                "Sign-ins, devices, sharing changes and exports, so you can see what happened on your account. Never your health records.",
            },
            {
              term: "Usage counts",
              detail:
                "Daily counts of how the product is used, with no record of who. There is no third-party analytics, advertising or session recording.",
            },
          ]}
        />
      </PolicySection>

      <PolicySection id="device" heading="Stored on your device">
        <p>
          Tidefern keeps four things in your browser, each for a reason, and nothing else. There are
          no cookies beyond the two named here, so there is no cookie banner.
        </p>
        <FactList
          items={[
            {
              term: "Session cookie",
              detail:
                "Strictly necessary: it keeps you signed in. It is removed when you sign out, or when it expires. Without it nothing on your account can be reached.",
            },
            {
              term: "Two-step sign-in cookie",
              detail:
                "Strictly necessary, and only if you turned two-step sign-in on: it carries you from the password step to the code step and is removed when sign-in completes.",
            },
            {
              term: THEME_KEY,
              detail:
                "Appearance: stored only when you pick light or dark with the theme control, so the choice holds across visits. Leave it unset and the site follows your system. To stop storing it, choose Follow system under Theme in Settings.",
            },
            {
              term: SOUND_KEY,
              detail:
                "Appearance: stored only when you change the interface sound level with the sound control. To stop storing it, clear this site's data in your browser.",
            },
          ]}
        />
      </PolicySection>

      <PolicySection id="email" heading="Email we send">
        <p>
          Tidefern emails you to confirm your address, to reset your password, and, if you turn it
          on, to tell you something new is waiting. Every message is generic: a notification says
          only that there is something new in Tidefern, and no subject line or body ever names a
          health fact. Mail is sent through Resend, listed below.
        </p>
      </PolicySection>

      <PolicySection id="processors" heading="Who processes it for us">
        <p>
          These are the companies that run parts of Tidefern on its behalf. None of them may use
          your data for anything else, and none receives it to sell or to advertise.
        </p>
        <FactList
          items={[
            {
              term: "Vercel",
              detail:
                "Runs the application. It processes data in memory while it serves a request, holds the secrets the service needs, and keeps short-lived request logs that never contain health data.",
            },
            {
              term: "Neon (Databricks, Inc.)",
              detail:
                "Hosts the database. Free text such as notes is encrypted before it is stored, with a key made for you.",
            },
            {
              term: "Resend",
              detail:
                "Sends the email described above. It receives your email address and the generic messages, never health data.",
            },
            {
              term: "GitHub",
              detail:
                "Holds the source code and runs the checks on it. It receives no user data; the test data is synthetic.",
            },
            {
              term: "Cloudflare",
              detail: "Answers DNS queries for the domain and receives nothing else.",
            },
          ]}
        />
      </PolicySection>

      <PolicySection id="retention" heading="How long we keep it">
        <FactList
          items={[
            {
              term: "Your account",
              detail:
                "Until you close it. Closing locks it at once and deletes it after a 7-day undo window; the database history that could restore it ages out within 7 days after that.",
            },
            {
              term: "A closure record",
              detail:
                "A keyed hash of the email and the dates, kept 30 days so a closure can be honored if a request about it arrives.",
            },
            { term: "Sessions", detail: "Until they expire or you sign them out." },
            { term: "Invitations", detail: "72 hours." },
            { term: "Activity", detail: "One year, or until the account involved is closed." },
            { term: "Usage counts", detail: "90 days." },
            {
              term: "Email logs at Resend",
              detail:
                "Per Resend's own retention. Your contact there is deleted when you close your account.",
            },
          ]}
        />
      </PolicySection>

      <PolicySection id="rights" heading="Your choices">
        <p>
          Your settings let you change your profile, see and sign out your devices, export your data
          after signing in again, and close your account. Closing is described on{" "}
          <TextLink href="/account/delete">Delete your account</TextLink>. The rights the Washington
          My Health My Data Act gives you over health data, and how to use them, are on the{" "}
          <TextLink href="/health-privacy">Consumer Health Data Privacy Policy</TextLink>.
        </p>
        <p>
          If you do not have an account, for example because someone invited you, write to the inbox
          below. Requests are answered within 45 days.
        </p>
      </PolicySection>

      <PolicySection id="contact" heading="Contact">
        <p>
          Questions and requests go to <OwnerInput>inbox address</OwnerInput>. This service is
          operated by <OwnerInput>legal entity name and address</OwnerInput>.
        </p>
      </PolicySection>
    </PolicyDocument>
  );
}
