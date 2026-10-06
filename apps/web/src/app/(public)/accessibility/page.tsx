import { OwnerInput, PolicyDocument, PolicySection } from "@/components/public/policy-document";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/accessibility",
  "Accessibility",
  "The accessibility target Tidefern builds to, what is in place, the gaps it knows about and how to report one.",
  false,
);

const contents = [
  { id: "target", label: "The target" },
  { id: "in-place", label: "What is in place" },
  { id: "gaps", label: "Known gaps" },
  { id: "report", label: "Report a problem" },
];

/**
 * A draft statement. The target is architecture 13.9; what is in place and
 * the gaps are what the repository's checks and reviews show today, not
 * aspirations, so this page changes as the build does.
 */
export default function AccessibilityPage() {
  return (
    <PolicyDocument
      eyebrow="Policy"
      title="Accessibility"
      updated={<OwnerInput>date</OwnerInput>}
      draft
      contents={contents}
    >
      <p className="intro">
        Tidefern is built to be usable by everyone, with a keyboard, a screen reader, a magnifier or
        a high contrast theme. This page says what that means in practice and where the work is not
        finished.
      </p>

      <PolicySection id="target" heading="The target">
        <p>
          The target is the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA, on every
          page and in both themes.
        </p>
      </PolicySection>

      <PolicySection id="in-place" heading="What is in place">
        <ul>
          <li>
            Light and dark themes designed separately, with every text and control color pair
            measured for contrast before a build can pass.
          </li>
          <li>
            A skip link, landmarks, one heading per page at the top of the outline, and a visible
            focus ring on every control that is never removed.
          </li>
          <li>
            Native controls throughout: links, buttons, inputs, selects, dialogs and disclosures, so
            keyboard and assistive technology behavior comes from the browser.
          </li>
          <li>
            Controls at least 44 pixels tall, and nothing that needs a drag or a precise gesture.
          </li>
          <li>
            Sign-in never asks you to solve, recall or transcribe anything: passkeys and password
            managers work, and there is no CAPTCHA.
          </li>
          <li>
            Every public page reflows at 320 pixels without sideways scrolling, and a check for that
            runs before a change can merge.
          </li>
          <li>
            Motion that respects the reduced motion setting, and nothing on any page that animates
            forever.
          </li>
          <li>
            Automated WCAG 2.2 AA checks run on every public page in both themes before a change can
            merge.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="gaps" heading="Known gaps">
        <p>These are the gaps the build knows about today. Each one is tracked and has an owner.</p>
        <ul>
          <li>
            On screens narrower than 600 pixels the header hides its navigation links and offers no
            replacement yet; the pages they lead to are still reachable from the footer.
          </li>
          <li>
            Manual keyboard and screen reader passes have not been recorded yet. The automated
            checks catch many problems but not every one, and the record that will hold the manual
            results does not exist yet.
          </li>
          <li>
            Windows high contrast mode is designed for in the components, but it is not yet covered
            by the browser tests, so it may not hold on every page.
          </li>
        </ul>
      </PolicySection>

      <PolicySection id="report" heading="Report a problem">
        <p>
          If something on Tidefern does not work for you, write to{" "}
          <OwnerInput>contact address</OwnerInput> and say which page, which browser or assistive
          technology, and what happened. Reports are answered, and a fix is scheduled with the next
          build.
        </p>
      </PolicySection>
    </PolicyDocument>
  );
}
