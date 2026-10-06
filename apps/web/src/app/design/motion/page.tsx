import { designTokens } from "@tidefern/design-tokens";
import { ChapterFoot, ChapterHead } from "@/components/design/chapter-nav";
import { easingPath, parseEasing } from "@/components/design/curves";
import { EasingRace, MotionDemo } from "@/components/design/motion-demo";
import { ReducedMotionStatus } from "@/components/design/reduced-motion-status";
import { TideDemo } from "@/components/design/tide-demo";
import { CopyCode } from "@/components/ui/copy-code";
import { durations, easings, LONGEST_AUTOMATIC_MOTION_MS } from "@/lib/motion-tokens";
import { pageMetadata } from "@/lib/site";
import styles from "./page.module.css";

export const metadata = pageMetadata(
  "/design/motion",
  "Motion",
  "The four durations and four easings as replayable demos read from the motion tokens, the curves compared, the finite tide, and what reduced motion changes.",
  false,
);

const anchors = [
  { id: "contract", label: "The contract" },
  { id: "durations", label: "Durations" },
  { id: "easings", label: "Easings" },
  { id: "tide", label: "The tide" },
  { id: "reduced", label: "Reduced motion" },
  { id: "rules", label: "Rules" },
];

const motionUse = new Map(designTokens.motion.map((token) => [token.name, token.use ?? ""]));

const durationRows = [
  { key: "feedback", token: "duration-feedback" },
  { key: "disclosure", token: "duration-disclosure" },
  { key: "settle", token: "duration-settle" },
  { key: "tide", token: "duration-tide" },
] as const;

const easingRows = [
  { key: "interface", token: "ease-interface" },
  { key: "settle", token: "ease-settle" },
  { key: "disclosure", token: "ease-disclosure" },
  { key: "tide", token: "ease-tide" },
] as const;

const CURVE_SIZE = 120;

const scriptUsage = `import { durations, easings, prefersReducedMotion } from "@/lib/motion-tokens";

// Motion driven from script reads the same values the stylesheet uses,
// and skips straight to the end state when reduced motion is on.
element.animate(keyframes, {
  duration: prefersReducedMotion() ? 0 : durations.disclosure,
  easing: easings.disclosure,
});`;

const styleUsage = `/* In a module stylesheet the same values are custom properties. */
.sheet {
  animation: rise var(--duration-disclosure) var(--ease-disclosure);
}

@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation-duration: 0ms;
  }
}`;

export default function MotionPage() {
  return (
    <div className="design wrap">
      <ChapterHead anchors={anchors} />
      <header className="design-title">
        <p className="eyebrow">Motion</p>
        <h1>Four durations, four curves, one finite tide.</h1>
        <p className="intro">
          Every duration and easing in the product comes from <code>motion-tokens.ts</code>, which
          reads them from the token file. The demos on this page import the same module, print its
          values beside them and re-read them on every replay, so the chapter cannot drift from the
          stylesheet. Nothing here, and nothing on any route, animates forever.
        </p>
      </header>

      <section className="design-section" aria-labelledby="contract">
        <h2 id="contract">The contract</h2>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Value</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {durationRows.map((row) => (
              <tr key={row.token}>
                <th scope="row">
                  <code>--{row.token}</code>
                </th>
                <td className="tabular">{durations[row.key]} ms</td>
                <td>{motionUse.get(row.token)}</td>
              </tr>
            ))}
            {easingRows.map((row) => (
              <tr key={row.token}>
                <th scope="row">
                  <code>--{row.token}</code>
                </th>
                <td>
                  <code>{easings[row.key]}</code>
                </td>
                <td>{motionUse.get(row.token)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption">
          Durations are numbers in milliseconds in the module and time strings in the stylesheet; a
          renamed token throws at import, so the build fails instead of falling back.
        </p>
      </section>

      <section className="design-section" aria-labelledby="durations">
        <h2 id="durations">Durations</h2>
        <p className="muted-note">
          Three of the four, each as the move the product makes with it. Replay restarts the demo
          from the module&apos;s current values. The fourth, the tide, has its own section below
          because it is the only one longer than the automatic-motion limit.
        </p>
        <div className={styles.demos}>
          <MotionDemo
            id="demo-feedback"
            title="Feedback: the month cross-fades"
            duration="feedback"
            easing="interface"
            move="fade"
            note="The calendar grid fades when the month changes; hover and press feedback use the same pair."
          />
          <MotionDemo
            id="demo-disclosure"
            title="Disclosure: the sheet rises"
            duration="disclosure"
            easing="disclosure"
            move="rise"
            note="The quick-log sheet and dialogs rise and fade in, and the scrim fades with them."
          />
          <MotionDemo
            id="demo-settle"
            title="Settle: the ring arrives"
            duration="settle"
            easing="settle"
            move="settle"
            note="The cycle ring's arc settles once after a navigation the person started, transform and opacity only."
          />
        </div>
      </section>

      <section className="design-section" aria-labelledby="easings">
        <h2 id="easings">Easings</h2>
        <p className="muted-note">
          Time runs right, progress runs up. The handles show the control points the stylesheet
          declares; the keywords are drawn with the values CSS defines for them.
        </p>
        <ul className={styles.curves}>
          {easingRows.map((row) => {
            const value = easings[row.key];
            const curve = parseEasing(value);
            return (
              <li key={row.token} className={styles.curve}>
                <h3 className={styles.curveTitle}>
                  <code>--{row.token}</code>
                </h3>
                {curve ? (
                  <svg
                    className={styles.curveSvg}
                    viewBox={`-8 -8 ${CURVE_SIZE + 16} ${CURVE_SIZE + 16}`}
                    role="img"
                    aria-label={`${row.token}: ${value}`}
                  >
                    <rect
                      className={styles.curveBox}
                      x="0"
                      y="0"
                      width={CURVE_SIZE}
                      height={CURVE_SIZE}
                    />
                    <line
                      className={styles.curveHandle}
                      x1="0"
                      y1={CURVE_SIZE}
                      x2={curve.x1 * CURVE_SIZE}
                      y2={(1 - curve.y1) * CURVE_SIZE}
                    />
                    <line
                      className={styles.curveHandle}
                      x1={CURVE_SIZE}
                      y1="0"
                      x2={curve.x2 * CURVE_SIZE}
                      y2={(1 - curve.y2) * CURVE_SIZE}
                    />
                    <path className={styles.curvePath} d={easingPath(curve, CURVE_SIZE)} />
                    <circle
                      className={styles.curvePoint}
                      cx={curve.x1 * CURVE_SIZE}
                      cy={(1 - curve.y1) * CURVE_SIZE}
                      r="3"
                    />
                    <circle
                      className={styles.curvePoint}
                      cx={curve.x2 * CURVE_SIZE}
                      cy={(1 - curve.y2) * CURVE_SIZE}
                      r="3"
                    />
                  </svg>
                ) : null}
                <p className="caption">
                  <code>{value}</code>
                  {curve && !value.startsWith("cubic-bezier") ? (
                    <>
                      {" "}
                      = cubic-bezier({curve.x1}, {curve.y1}, {curve.x2}, {curve.y2})
                    </>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
        <EasingRace />
      </section>

      <section className="design-section" aria-labelledby="tide">
        <h2 id="tide">The tide</h2>
        <p className="muted-note">
          The one decorative motion in the product: the hairline wave drifts in by one wavelength
          and rests. On the marketing page it runs once after load. Here it waits for you.
        </p>
        <TideDemo />
      </section>

      <section className="design-section" aria-labelledby="reduced">
        <h2 id="reduced">Reduced motion</h2>
        <ReducedMotionStatus />
        <p className="muted-note">What the preference changes, everywhere in the product:</p>
        <ul className={styles.rules}>
          <li>
            Every transition and animation goes to <code>0ms</code> in the module stylesheets, so
            each element reaches its final state immediately. Nothing waits on an animation
            finishing and nothing is hidden: reduced motion degrades to instant, never to absent.
          </li>
          <li>
            The demos on this page follow the same rule: with the preference set they arrive
            complete, the printed durations still describe what other visitors see, and Replay still
            re-reads the constants.
          </li>
          <li>
            The app reads the preference through one function, <code>prefersReducedMotion()</code>{" "}
            in <code>motion-tokens.ts</code>, which is also what the sentence above uses.
          </li>
        </ul>
      </section>

      <section className="design-section" aria-labelledby="rules">
        <h2 id="rules">Rules</h2>
        <ul className={styles.rules}>
          <li>
            One orchestrated entrance per page, with named beats, limited to content above the fold,
            transform and opacity only.
          </li>
          <li>
            Transitions may change background, color, border color, transform, opacity and filter,
            never a layout property. <code>transition: all</code> fails <code>pnpm css:check</code>.
          </li>
          <li>
            Nothing automatic lasts longer than{" "}
            <span className="tabular">{LONGEST_AUTOMATIC_MOTION_MS / 1000} s</span> and nothing
            repeats forever (WCAG 2.2.2); the browser suite checks every route for an infinite
            iteration count.
          </li>
          <li>
            No scroll hijacking, custom cursors, animate-on-scroll reveals, glass panels, blurred
            orbs, gradient text or decorative status dots. Sections render at their final state on
            the server, so print, find-in-page and tall windows see everything.
          </li>
          <li>
            Features with uneven support (relative color syntax, <code>corner-shape</code>,
            scroll-driven animations) sit behind <code>@supports</code> with the static fallback
            declared first, or are not used.
          </li>
        </ul>
        <div className={styles.usage}>
          <CopyCode code={scriptUsage} label="Usage in script" language="tsx" />
          <CopyCode code={styleUsage} label="Usage in a stylesheet" language="css" />
        </div>
      </section>

      <ChapterFoot
        previous={{ href: "/design/components", label: "Components" }}
        next={{ href: "/design/foundations", label: "Foundations" }}
      />
    </div>
  );
}
