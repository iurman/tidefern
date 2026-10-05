import Link from "next/link";
import { componentStates, type Specimen, type SpecimenGroup } from "./specimen";
import { SpecimenShell } from "./specimen-shell";
import styles from "./specimen-frame.module.css";

const themes = ["light", "dark"] as const;

const forcedStates = new Set(["hover", "focus-visible", "active"]);

const repositoryFile = "https://github.com/iurman/tidefern/blob/main/";

/**
 * Renders a group's specimens for a /design/components page: every
 * component in the eight states, once per theme, with the source link, the
 * keyboard note and the usage snippet. The shell's width control resizes the
 * frame, never the page, and nothing here writes to storage or touches
 * production tokens.
 */
export function SpecimenFrame({ group }: { group: SpecimenGroup }) {
  return (
    <SpecimenShell>
      {group.specimens.map((specimen) => (
        <SpecimenCard key={specimen.name} specimen={specimen} />
      ))}
    </SpecimenShell>
  );
}

function SpecimenCard({ specimen }: { specimen: Specimen }) {
  const id = specimen.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section className={styles.card} aria-labelledby={`specimen-${id}`}>
      <header className={styles.head}>
        <h2 id={`specimen-${id}`}>{specimen.name}</h2>
        <a className={styles.source} href={`${repositoryFile}${specimen.source}`}>
          <code>{specimen.source}</code>
        </a>
      </header>
      {themes.map((theme) => (
        <div key={theme} className={styles.theme} data-theme={theme}>
          <p className={styles.themeLabel}>{theme === "light" ? "Light" : "Dark"}</p>
          <ol className={styles.states}>
            {componentStates.map((state) => (
              <li key={state} className={styles.state}>
                <p className={styles.stateLabel}>{state}</p>
                {specimen.states?.[state] === "none" ? (
                  <p className={styles.none}>none</p>
                ) : (
                  <div
                    className={styles.stage}
                    data-specimen-state={forcedStates.has(state) ? state : undefined}
                  >
                    {specimen.render(state)}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <dl className={styles.notes}>
        <dt>Keyboard</dt>
        <dd>{specimen.keyboard}</dd>
        <dt>Usage</dt>
        <dd>
          <pre className={styles.usage}>
            <code>{specimen.usage}</code>
          </pre>
        </dd>
      </dl>
    </section>
  );
}

/** The chapter rail every group page shares: previous and next, and the index. */
export function ComponentsChapterNav({
  previous,
  next,
}: {
  previous?: { href: string; label: string };
  next?: { href: string; label: string };
}) {
  return (
    <nav className="chapter-nav chapter-nav-foot" aria-label="Chapters, previous and next">
      {previous ? (
        <Link href={previous.href} prefetch={false}>
          Previous: {previous.label}
        </Link>
      ) : null}
      <Link href="/design/components" prefetch={false}>
        All components
      </Link>
      {next ? (
        <Link href={next.href} prefetch={false}>
          Next: {next.label}
        </Link>
      ) : null}
    </nav>
  );
}
