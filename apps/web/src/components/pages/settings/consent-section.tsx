import { ConsentRecord } from "@/components/ui/consent-record";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCalendarDate } from "@/components/ui/format-date";
import { joinLabels, settingsCopy } from "./copy";
import type { ConsentView } from "./consent-records";
import { Help, ReadFailed } from "./settings-frame";
import type { Processor } from "./server-data";
import { WithdrawConsent } from "./withdraw-consent";
import styles from "./settings.module.css";

const copy = settingsCopy.consent;

/**
 * The consent record, read only (DESIGN.md section 4: shown again in
 * Settings), with the one withdraw action. Each record is the shared
 * `ConsentRecord` with the day she agreed and the version of the text; the
 * processors and what each receives come from the data summary. A consent
 * she withdrew says when; a guardian's consent for a child is listed
 * without any action, because the API withdraws it only with the child's
 * own records. `headingLevel` fits the page's outline: 3 under the index's
 * group headings, 2 under a screen's H1.
 */
export function ConsentSection({
  view,
  processors,
  returnTo,
  freshForMs,
  headingLevel,
}: {
  view: ConsentView | null;
  processors: Processor[] | null;
  returnTo: string;
  freshForMs: number | null;
  headingLevel: 2 | 3;
}) {
  if (view === null || processors === null) return <ReadFailed />;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const recorded = view.active.length + view.withdrawn.length + view.children.length > 0;
  if (!recorded) {
    return <EmptyState heading={copy.empty.heading} why={copy.empty.why} level={headingLevel} />;
  }
  return (
    <div className={styles.consent}>
      <Help>{copy.help}</Help>
      {view.active.map((record) => (
        <ConsentRecord
          key={record.key}
          readOnly
          categories={record.categories}
          purposes={record.purposes}
          processors={processors.map(({ name, receives }) => ({ name, receives }))}
          policyVersion={record.textVersion}
          agreedOn={record.agreedOn}
        />
      ))}
      {/* Right under her own record, so it never reads as being about a child's consent below. */}
      {view.withdrawId !== null ? (
        <WithdrawConsent consentId={view.withdrawId} returnTo={returnTo} freshForMs={freshForMs} />
      ) : null}
      {view.withdrawn.length > 0 ? (
        <section className={styles.part} aria-labelledby="settings-consent-withdrawn">
          <Heading id="settings-consent-withdrawn" className={styles.subheading}>
            {copy.withdrawnHeading}
          </Heading>
          <ul className={styles.plainList}>
            {view.withdrawn.map((record) => (
              <li key={record.key}>
                {copy.withdrawn(
                  formatCalendarDate(record.withdrawnOn ?? record.agreedOn, "full"),
                  joinLabels(record.categories),
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {view.children.length > 0 ? (
        <section className={styles.part} aria-labelledby="settings-consent-children">
          <Heading id="settings-consent-children" className={styles.subheading}>
            {copy.children.heading}
          </Heading>
          <Help>{copy.children.help}</Help>
          <ul className={styles.plainList}>
            {view.children.map((consent) => {
              const day = formatCalendarDate(consent.agreedOn, "full");
              return (
                <li key={consent.key}>
                  <span className={styles.childName}>{consent.child}</span>: {consent.purpose}
                  <span className={styles.by}>
                    {consent.byYou ? copy.children.byYou(day) : copy.children.byOther(day)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
