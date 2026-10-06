import Link from "next/link";
import { designTokens } from "@tidefern/design-tokens";
import { SoundLevelControl } from "@/app/settings/sound/level-control";
import { SoundContextState } from "@/components/design/sound-context-state";
import { SoundCueButton } from "@/components/design/sound-cue-button";
import { SoundHaptics } from "@/components/design/sound-haptics";
import { SoundMeter } from "@/components/design/sound-meter";
import { CopyCode } from "@/components/ui/copy-code";
import { SoundToggle } from "@/components/ui/sound-toggle";
import {
  CUE_ORDER,
  cueLength,
  cuePeakGain,
  cueSpec,
  envelopeGainAt,
  hapticSpec,
  MASTER_BUS_GAIN,
  toDecibels,
  toneLength,
  type CueSpec,
  type ToneSpec,
} from "@/lib/sound";
import { pageMetadata } from "@/lib/site";
import styles from "./sound.module.css";

export const metadata = pageMetadata(
  "/design/sound",
  "Sound and touch",
  "Every interface cue playable from a real button with its pitch, level and envelope from the tokens, the unlock rule live, the level meter, the mute, the three levels and the haptic patterns.",
  false,
);

const soundTokens = designTokens.sound.filter((token) => token.name.startsWith("sound-"));
const hapticTokens = designTokens.sound.filter((token) => token.name.startsWith("haptic-"));

/** The sound group as the custom properties `tokens.css` already serves, for copying. */
const tokensAsCss = [
  ":root {",
  ...designTokens.sound.map((token) => `  --${token.name}: ${token.value};`),
  "}",
].join("\n");

const usage = `import { play } from "@/lib/sound";

// Beside visible text only; the provider already covers hover and press.
play("success");`;

const ENVELOPE_WIDTH = 320;
const ENVELOPE_HEIGHT = 72;
const ENVELOPE_SAMPLES = 96;

function milliseconds(seconds: number): string {
  return `${Math.round(seconds * 1000)} ms`;
}

function hertz(value: number): string {
  return `${Math.round(value * 100) / 100} Hz`;
}

/** The envelope of one tone as SVG points, scaled to the cue's loudest tone and total length. */
function envelopePoints(tone: ToneSpec, spec: CueSpec): string {
  const total = cueLength(spec);
  const loudest = Math.max(...spec.tones.map((entry) => entry.gain));
  const length = toneLength(tone);
  const points: string[] = [];
  for (let index = 0; index <= ENVELOPE_SAMPLES; index += 1) {
    const seconds = (length * index) / ENVELOPE_SAMPLES;
    const x = ((tone.delay + seconds) / total) * ENVELOPE_WIDTH;
    const y =
      ENVELOPE_HEIGHT - (envelopeGainAt(seconds, tone) / loudest) * (ENVELOPE_HEIGHT - 4) - 2;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
}

function CueCard({ spec }: { spec: CueSpec }) {
  const peakDb = toDecibels(cuePeakGain(spec));
  return (
    <li className={styles.cueCard} id={`cue-${spec.cue}`}>
      <h3>{spec.label}</h3>
      <p className={styles.cueWhen}>{spec.when}</p>
      <svg
        className={styles.envelope}
        viewBox={`0 0 ${ENVELOPE_WIDTH} ${ENVELOPE_HEIGHT}`}
        role="img"
        aria-label={`Envelope of the ${spec.label.toLowerCase()} over ${milliseconds(cueLength(spec))}`}
      >
        <line
          className={styles.envelopeFloor}
          x1="0"
          y1={ENVELOPE_HEIGHT - 2}
          x2={ENVELOPE_WIDTH}
          y2={ENVELOPE_HEIGHT - 2}
        />
        {spec.tones.map((tone, index) => (
          <polyline
            key={index}
            className={
              index === 0 ? styles.envelopeLine : `${styles.envelopeLine} ${styles.envelopeSecond}`
            }
            points={envelopePoints(tone, spec)}
          />
        ))}
      </svg>
      <table className={styles.cueTable}>
        <thead>
          <tr>
            <th scope="col">Tone</th>
            <th scope="col">Wave</th>
            <th scope="col">Pitch</th>
            <th scope="col">Attack</th>
            <th scope="col">Decay</th>
            <th scope="col">Peak</th>
          </tr>
        </thead>
        <tbody>
          {spec.tones.map((tone, index) => (
            <tr key={index}>
              <th scope="row">{tone.delay > 0 ? `+${milliseconds(tone.delay)}` : "Start"}</th>
              <td>{tone.type}</td>
              <td>
                {hertz(tone.frequency)}
                {tone.endFrequency ? ` to ${hertz(tone.endFrequency)}` : ""}
              </td>
              <td>{milliseconds(tone.attack)}</td>
              <td>{milliseconds(tone.decay)}</td>
              <td>{Math.round(tone.gain * 1000) / 1000}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.cueTokens}>
        Output peak {peakDb} dBFS after the {MASTER_BUS_GAIN} bus; pitch jitters plus or minus three
        percent per play. From{" "}
        {spec.tokens.map((token, index) => (
          <span key={token}>
            {index > 0 ? ", " : ""}
            <code>--{token}</code>
          </span>
        ))}
        .
      </p>
      <SoundCueButton cue={spec.cue} label={spec.label} />
    </li>
  );
}

export default function SoundPage() {
  return (
    <div className="design wrap">
      <nav className="chapter-nav" aria-label="Chapters">
        <Link href="/design" prefetch={false}>
          Design system
        </Link>
      </nav>
      <header className="design-title">
        <p className="eyebrow">Sound and touch</p>
        <h1>Short, quiet, and only when you act.</h1>
        <p className="intro">
          Every cue is synthesized in the browser from the numbers in the token file: no audio
          files, no library, nothing downloaded. A cue answers something the person just did, lasts
          well under a second, and sits beside visible text, so sound never carries meaning alone.
          The decisions are in the architecture record (section 14); this chapter plays them.
        </p>
      </header>

      <section className="design-section" aria-labelledby="unlock">
        <h2 id="unlock">The unlock rule</h2>
        <p className="muted-note">
          Browsers let a page make sound only inside an activation-granting input: mouse pointer
          down, touch pointer up or touch end, a key down other than Escape, and click. One shared
          context is created or resumed inside the first of those, so the first hover on a fresh
          page is silent by design. The state below is read from the library, not assumed; it
          changes the moment the context does.
        </p>
        <SoundContextState />
      </section>

      <section className="design-section" aria-labelledby="cues">
        <h2 id="cues">The cues</h2>
        <p className="muted-note">
          Each envelope rises from a positive floor with an exponential ramp and decays toward it
          with a time constant of a third of the decay, because the Web Audio specification forbids
          an exponential ramp to zero. The curve drawn is the one the audio graph schedules, from
          the same function the unit tests check. Press a button to play the cue; the sentence under
          it says what happened.
        </p>
        <ul className={styles.cueGrid}>
          {CUE_ORDER.map((cue) => (
            <CueCard key={cue} spec={cueSpec(cue)} />
          ))}
        </ul>
      </section>

      <section className="design-section" aria-labelledby="meter">
        <h2 id="meter">Level meter</h2>
        <p className="muted-note">
          The master bus sits at the token value and every cue peaks below it. While a cue sounds,
          an analyser after the master gain reports the live peak; between cues the meter rests and
          nothing samples.
        </p>
        <SoundMeter />
      </section>

      <section className="design-section" aria-labelledby="levels">
        <h2 id="levels">Levels, the mute and quiet hours</h2>
        <p className="muted-note">
          Three levels: all (with the hover tick on a mouse), actions only, and off. These are the
          real controls: the header&apos;s mute and the setting from{" "}
          <Link href="/settings/sound" prefetch={false}>
            Settings
          </Link>
          , writing the same choice to the root attribute and to this device. Quiet hours, a start
          and an end time in the person&apos;s day, live in Settings too and silence every cue
          between them, including the settle cue.
        </p>
        <div className={styles.controls}>
          <SoundLevelControl />
          <div className={styles.controlNote}>
            <span>The header control, which flips between off and all:</span>
            <SoundToggle />
          </div>
        </div>
      </section>

      <section className="design-section" aria-labelledby="touch">
        <h2 id="touch">Touch</h2>
        <p className="muted-note">
          Haptics use <code>navigator.vibrate</code> with the patterns below, on touch where the
          platform supports it, which today means Chromium browsers on Android. Safari has no web
          vibration API, so iOS stays still; the only iOS web haptic, the switch control inside a
          trusted tap, is a post-launch experiment, never a dependency. On iOS, Web Audio plays on
          the ambient session and the Ring/Silent switch mutes it, which is what Apple expects of
          sound effects.
        </p>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Pattern (ms on, off)</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {hapticTokens.map((token) => (
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
        <p className="caption">
          The library reads them as {hapticSpec("tap").join(", ")} (tap),{" "}
          {hapticSpec("select").join(", ")} (select), {hapticSpec("success").join(", ")} (success)
          and {hapticSpec("error").join(", ")} (error).
        </p>
        <SoundHaptics />
      </section>

      <section className="design-section" aria-labelledby="tokens">
        <h2 id="tokens">Tokens</h2>
        <p className="muted-note">
          Every pitch, level, gap and pattern is a token, so this chapter, the library and any
          future client read the same values. The CSS form below is what{" "}
          <code>/design/tokens.css</code> already serves.
        </p>
        <table className="token-table">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Value</th>
              <th scope="col">Use</th>
            </tr>
          </thead>
          <tbody>
            {soundTokens.map((token) => (
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
        <CopyCode code={tokensAsCss} label="Sound tokens as CSS" language="css" />
        <CopyCode code={usage} label="Playing a cue" language="tsx" />
      </section>

      <section className="design-section" aria-labelledby="rules">
        <h2 id="rules">What sound never does</h2>
        <ul className={styles.rules}>
          <li>Carry meaning alone: every success or error cue sits beside visible text.</li>
          <li>
            Play on its own: never on back, forward, reload, redirect, page load, a toast arriving
            or a timer. The settle cue follows a click or Enter on a link, once, within 600 ms, and
            stays silent when the next view takes longer.
          </li>
          <li>
            Last long: every cue ends well under a second, far below the three seconds of WCAG
            1.4.2.
          </li>
          <li>
            Load anything: no file, no network request, no analytics. The choice of level and the
            quiet hours are the only things sound stores, and only on this device.
          </li>
        </ul>
      </section>

      <nav className="chapter-nav chapter-nav-foot" aria-label="Chapters, previous and next">
        <Link href="/design/components" prefetch={false}>
          Previous: Components
        </Link>
      </nav>
    </div>
  );
}
