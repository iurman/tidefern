import type { CSSProperties } from "react";
import { designTokens } from "@tidefern/design-tokens";
import { ChapterFoot, ChapterHead } from "@/components/design/chapter-nav";
import { describeGates } from "@/components/design/gates";
import { Button } from "@/components/ui/button";
import { CopyCode } from "@/components/ui/copy-code";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { pageMetadata } from "@/lib/site";
import rootManifest from "../../../../../../package.json";
import styles from "./page.module.css";

export const metadata = pageMetadata(
  "/design/foundations",
  "Foundations",
  "Layout, spacing and breakpoints from the tokens, the accessibility targets and the axe tags CI runs, the copy and privacy rules, and every gate pnpm check runs.",
  false,
);

const repositoryFile = "https://github.com/iurman/tidefern/blob/main/";

const anchors = [
  { id: "layout", label: "Layout and breakpoints" },
  { id: "spacing", label: "Spacing scale" },
  { id: "radius", label: "Radius and elevation" },
  { id: "accessibility", label: "Accessibility targets" },
  { id: "copy", label: "Copy rules" },
  { id: "privacy", label: "Privacy rules" },
  { id: "checklist", label: "Development checklist" },
];

const gutters = [
  { width: "Desktop", value: "64px", token: "space-16" },
  { width: "Tablet", value: "32px", token: "space-8" },
  { width: "Phone", value: "24px", token: "space-6" },
];

/** The tag set every axe run in the browser suite passes (apps/web/tests/e2e/axe.ts). */
const axeTags = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

const targets = [
  ["Structure", "Landmarks, one H1 per page and a skip link to the main content."],
  [
    "Focus",
    "Visible focus that nothing sticky covers (2.4.11), drawn in the focus role at 3:1 or better.",
  ],
  [
    "Targets",
    "At least 24 by 24 px (2.5.8); controls are 44 px tall and primary actions 48 px wherever practical.",
  ],
  ["Dragging", "Nothing is drag-only (2.5.7); every drag has a tap or keyboard path."],
  [
    "Sign-in",
    "Accessible authentication (3.3.8): passkeys and password-manager-friendly fields, no CAPTCHA, nothing to solve, recall or transcribe.",
  ],
  ["Zoom and reflow", "200 percent zoom and 320 px reflow without horizontal scrolling."],
  ["Contrast", "4.5:1 for text and 3:1 for non-text, measured in both themes."],
  ["Names", "Every control has an accessible name."],
  ["Motion", "Reduced motion makes every move instant, never absent."],
  [
    "Forced colors",
    "forced-color-adjust: auto everywhere; focus uses the system Highlight color; data marks keep their dashed and outlined distinctions.",
  ],
] as const;

const voice = [
  {
    state: "Pending",
    rule: "Say what is happening, keep the control's width",
    example: "Saving. Sending the invitation. Checking your passkey.",
  },
  {
    state: "Failure",
    rule: "Say what to do next, never only that something failed",
    example: "We could not save this day. Try again.",
  },
  {
    state: "Empty",
    rule: "Say what would be here, why it is not, and the one action",
    example: "See the specimen below.",
  },
  {
    state: "Success",
    rule: "Short, with the undo where one exists",
    example: "Saved for Sunday, Oct 5. Undo",
  },
  {
    state: "Destructive",
    rule: "Name the consequence and the undo window",
    example:
      "Closing your account locks it now and deletes it in 7 days. Signing in again before then cancels this.",
  },
];

const privacyRules = [
  "Health data never travels in URLs, query strings, page titles, logs, job names, notification text or email subjects. Route names stay neutral.",
  "Access decisions happen only in can() in packages/core. A route handler never compares ids itself.",
  "Calendar facts are YYYY-MM-DD strings plus the profile's time zone, never timestamps.",
  "Clients never import the database, the auth server code or the crypto package; the API never imports Next.js or React. ESLint enforces both boundaries.",
  "No third-party analytics, pixels, session replay or ad SDKs anywhere.",
];

const habits = [
  "Never write a version number from memory. Resolve it from the registry and respect the pins in pnpm-lock.yaml.",
  "Design light and dark independently with the semantic tokens; never invert a page or an image.",
  "Every interactive element gets sound and haptic feedback through the shared SoundProvider, never through one component.",
  "Tests protect real behavior. Never weaken a test to pass, and label an environment failure separately from an application defect.",
  "After editing tokens.json run pnpm tokens:generate; after changing routes or schemas run pnpm openapi:generate; after changing a brand SVG run pnpm --filter web brand:sync.",
];

const gates = describeGates(rootManifest.scripts.check);

const phone = designTokens.breakpoint.find((token) => token.name === "breakpoint-phone")?.value;

const breakpointQuery = `.layout {\n  padding-inline: var(--space-16);\n}\n\n/* --breakpoint-phone, as a value */\n@media (max-width: ${phone ?? "600px"}) {\n  .layout {\n    padding-inline: var(--space-6);\n  }\n}`;

export default function FoundationsPage() {
  return (
    <div className="design wrap">
      <ChapterHead anchors={anchors} />
      <header className="design-title">
        <p className="eyebrow">Foundations</p>
        <h1>The rules every screen is built on.</h1>
        <p className="intro">
          Layout and spacing come from the token file; the accessibility targets, copy rules and
          privacy rules come from the architecture record and the repository guidance. The checklist
          at the end is read from the root <code>check</code> script, so it names the gates the
          build actually runs.
        </p>
      </header>

      <section className="design-section" aria-labelledby="layout">
        <h2 id="layout">Layout and breakpoints</h2>
        <p className="muted-note">
          Pages center in a 1200 px container; reading passages stay inside a 720 px column. The
          gutter narrows at each breakpoint, and the app swaps its bottom tab bar for a left rail
          from 1024 px.
        </p>
        <div className={styles.split}>
          <table className="token-table">
            <caption className={styles.caption}>Breakpoints</caption>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Value</th>
                <th scope="col">Use</th>
              </tr>
            </thead>
            <tbody>
              {designTokens.breakpoint.map((token) => (
                <tr key={token.name}>
                  <th scope="row">
                    <code>--{token.name}</code>
                  </th>
                  <td className="tabular">{token.value}</td>
                  <td>{token.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="token-table">
            <caption className={styles.caption}>Sizes</caption>
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Value</th>
                <th scope="col">Use</th>
              </tr>
            </thead>
            <tbody>
              {designTokens.size.map((token) => (
                <tr key={token.name}>
                  <th scope="row">
                    <code>--{token.name}</code>
                  </th>
                  <td className="tabular">{token.value}</td>
                  <td>{token.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={styles.gutters}>
          {gutters.map((gutter) => (
            <li key={gutter.width}>
              <span className={styles.gutterFrame} aria-hidden="true">
                <span
                  className={styles.gutterBar}
                  style={{ "--gutter": `var(--${gutter.token})` } as CSSProperties}
                />
              </span>
              <span>
                {gutter.width} gutter <span className="tabular">{gutter.value}</span>{" "}
                <code>--{gutter.token}</code>
              </span>
            </li>
          ))}
        </ul>
        <CopyCode code={breakpointQuery} label="A breakpoint in a module" language="css" />
      </section>

      <section className="design-section" aria-labelledby="spacing">
        <h2 id="spacing">Spacing scale</h2>
        <p className="muted-note">
          Nine steps from 4 to 96 px. Each bar below is drawn at its own token, so the bar is
          whatever the stylesheet says.
        </p>
        <ol className={styles.scale}>
          {designTokens.spacing.map((token) => (
            <li key={token.name}>
              <code>--{token.name}</code>
              <span className="tabular">{token.value}</span>
              <span
                className={styles.bar}
                style={{ "--bar": `var(--${token.name})` } as CSSProperties}
                aria-hidden="true"
              />
              <span className={styles.use}>{token.use}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="design-section" aria-labelledby="radius">
        <h2 id="radius">Radius and elevation</h2>
        <p className="muted-note">
          Four radii, and no drop shadows anywhere. Layers separate by surface tier, a 1 px soft
          border and, behind dialogs and sheets, a scrim of the page color.
        </p>
        <ul className={styles.radii}>
          {designTokens.radius.map((token) => (
            <li key={token.name}>
              <span
                className={styles.radiusSample}
                style={{ "--sample-radius": `var(--${token.name})` } as CSSProperties}
                aria-hidden="true"
              />
              <code>--{token.name}</code>
              <span className="tabular">{token.value}</span>
              <span className={styles.use}>{token.use}</span>
            </li>
          ))}
        </ul>
        <ol className={styles.tiers} aria-label="Surface tiers, back to front">
          {["page", "surface", "panel", "overlay"].map((tier) => (
            <li
              key={tier}
              className={styles.tier}
              style={{ "--tier": `var(--${tier})` } as CSSProperties}
            >
              <code>--{tier}</code>
            </li>
          ))}
        </ol>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Value</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {designTokens.elevation.map((token) => (
              <tr key={token.name}>
                <th scope="row">
                  <code>--{token.name}</code>
                </th>
                <td className="tabular">{token.value}</td>
                <td>{token.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="design-section" aria-labelledby="accessibility">
        <h2 id="accessibility">Accessibility targets</h2>
        <p className="muted-note">
          WCAG 2.2 AA throughout. Axe runs on every route in both themes in the browser suite with
          the tags below. Manual keyboard passes will be recorded in <code>docs/design/QA.md</code>{" "}
          (task J3).
        </p>
        <ul className={styles.tags} aria-label="Axe tags">
          {axeTags.map((tag) => (
            <li key={tag}>
              <code>{tag}</code>
            </li>
          ))}
        </ul>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Area</th>
              <th scope="col">Target</th>
            </tr>
          </thead>
          <tbody>
            {targets.map(([area, target]) => (
              <tr key={area}>
                <th scope="row">{area}</th>
                <td>{target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="design-section" aria-labelledby="copy">
        <h2 id="copy">Copy rules</h2>
        <p className="muted-note">
          Page titles in Title Case, everything else in sentence case. Second person, active voice,
          numerals for numbers, no em dashes. Predictions use the templates in the architecture
          record word for word. Every state follows one voice table, kept in{" "}
          <TextLink href={`${repositoryFile}docs/design/CONTENT.md`} external>
            CONTENT.md
          </TextLink>
          .
        </p>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col">Rule</th>
              <th scope="col">Example</th>
            </tr>
          </thead>
          <tbody>
            {voice.map((row) => (
              <tr key={row.state}>
                <th scope="row">{row.state}</th>
                <td>{row.rule}</td>
                <td>{row.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className={styles.subhead}>The empty-state formula</h3>
        <p className="muted-note">
          What would be here, why it is not, and the one action that changes that. Never &quot;No
          results&quot; on its own. The specimen is the shared component with the calendar&apos;s
          real heading and reason. In the calendar its action is &quot;Log today&quot;; here the
          action opens the component&apos;s specimen with every state.
        </p>
        <div className={styles.specimen}>
          <EmptyState
            level={3}
            heading="Nothing logged this month"
            why="Days you log show here with their flow and symptoms."
            action={
              <Button variant="secondary" href="/design/components/actions#specimen-empty-state">
                See every state
              </Button>
            }
          />
        </div>
      </section>

      <section className="design-section" aria-labelledby="privacy">
        <h2 id="privacy">Privacy rules</h2>
        <p className="muted-note">
          These hold in every pull request, from the repository guidance in{" "}
          <TextLink href={`${repositoryFile}AGENTS.md`} external>
            AGENTS.md
          </TextLink>
          .
        </p>
        <ul className={styles.rules}>
          {privacyRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="design-section" aria-labelledby="checklist">
        <h2 id="checklist">Development checklist</h2>
        <p className="muted-note">
          <code>pnpm check</code> runs these gates in order and stops at the first failure. CI runs
          the same chain, then the browser suite against the production build.
        </p>
        <ol className={styles.gates} data-gates={gates.length}>
          {gates.map((gate) => (
            <li key={gate.command}>
              <code>{gate.command}</code>
              <span>{gate.holds}</span>
            </li>
          ))}
        </ol>
        <h3 className={styles.subhead}>Habits no gate can hold</h3>
        <ul className={styles.rules}>
          {habits.map((habit) => (
            <li key={habit}>{habit}</li>
          ))}
        </ul>
        <CopyCode
          code={"pnpm install --frozen-lockfile\npnpm check\npnpm test:e2e"}
          label="Before a pull request"
          language="sh"
        />
      </section>

      <ChapterFoot previous={{ href: "/design/motion", label: "Motion" }} />
    </div>
  );
}
