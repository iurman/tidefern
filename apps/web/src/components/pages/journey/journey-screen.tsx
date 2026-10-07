import type { ReactNode } from "react";
import { TideLine } from "@/components/public/tide-line";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDaySpan, formatDayWithYear } from "@/components/ui/marks-format";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { WeekCard, datingMethodLabels } from "@/components/ui/week-card";
import { journeyCopy as copy } from "./copy";
import { EndPregnancy } from "./end-pregnancy";
import { AddEventButtons, EditEventButton, EventEditor } from "./event-editor";
import type {
  ActivePregnancy,
  EventRow,
  HistoryRow,
  JourneyView,
  OwnView,
  Read,
  SharedView,
} from "./view";
import type { WeekGroup } from "./weeks";
import styles from "./journey.module.css";

/**
 * /journey as DESIGN.md 3.5 draws it: her week card on warmth, the tide line
 * marking this week in the week-by-week list, the add buttons, her due
 * date history and "Something changed?" last; after a birth the child's age
 * and no week; and each pregnancy shared with her under its owner's name,
 * at the level her grant holds. Server rendered from the view; the forms
 * are the only client parts.
 */

/** The anchor of her due date history, which the week card's History link opens. */
export const HISTORY_ID = "dating-history";

/** The page frame: one column and the one H1. */
export function JourneyFrame({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{copy.heading}</h1>
      {children}
    </div>
  );
}

/** Where "Log a period" leads: today's day sheet. */
function logToday(today: string): string {
  return `/log/${today}`;
}

function rowItem(row: EventRow, canEdit: boolean): TimelineItem {
  return {
    key: row.id,
    date: row.date,
    title: row.title,
    ...(row.note === null ? {} : { detail: row.note }),
    expected: row.expected,
    ...(canEdit
      ? {
          action: (
            <EditEventButton
              event={{
                id: row.id,
                kind: row.kind,
                date: row.date,
                detail: row.detail,
                version: row.version,
                title: row.title,
              }}
            />
          ),
        }
      : {}),
  };
}

function WeekItems({ groups, canEdit }: { groups: WeekGroup<EventRow>[]; canEdit: boolean }) {
  return (
    <ol className={styles.weeks}>
      {groups.map((group) => (
        <li
          key={group.week}
          className={[styles.week, group.items.length === 0 ? styles.quietWeek : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={styles.weekHead}>
            <h4 className={styles.weekTitle}>{copy.weeks.week(group.week)}</h4>
            <span className={styles.weekRange}>{formatDaySpan(group.start, group.end)}</span>
          </div>
          {group.items.length > 0 ? (
            <Timeline
              className={styles.events}
              label={copy.weeks.listLabel(group.week)}
              items={group.items.map((row) => rowItem(row, canEdit))}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function WeekList({ pregnancy }: { pregnancy: ActivePregnancy }) {
  const weeks = pregnancy.weeks;
  return (
    <div className={styles.block}>
      <h3 className={styles.subheading}>{copy.weeks.heading}</h3>
      {weeks === null ? (
        <p className={styles.notice}>{copy.weeks.failed}</p>
      ) : (
        <>
          {weeks.earlier.length > 0 ? (
            <Disclosure
              className={styles.earlier}
              summary={
                <>
                  {copy.weeks.earlier}{" "}
                  <span className={styles.count}>
                    {copy.weeks.entries(
                      weeks.earlier.reduce((sum, group) => sum + group.items.length, 0),
                    )}
                  </span>
                </>
              }
            >
              <WeekItems groups={weeks.earlier} canEdit={pregnancy.canEdit} />
            </Disclosure>
          ) : null}
          {/* The week marker: the tide line, named in words because the line itself is hidden. */}
          <div className={styles.marker}>
            <span className={styles.markerLabel}>{copy.weeks.thisWeek}</span>
            <TideLine className={styles.markerTide} />
          </div>
          <WeekItems groups={weeks.ahead} canEdit={pregnancy.canEdit} />
          {weeks.ahead.every((group) => group.items.length === 0) ? (
            <p className={styles.quiet}>{copy.weeks.nothingAhead}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The week list, with the add buttons and the edit form wherever she may write. */
function Weeks({ pregnancy }: { pregnancy: ActivePregnancy }) {
  if (!pregnancy.canAdd && !pregnancy.canEdit) return <WeekList pregnancy={pregnancy} />;
  return (
    <EventEditor pregnancyId={pregnancy.id} canDelete={pregnancy.canDelete} today={pregnancy.today}>
      <WeekList pregnancy={pregnancy} />
      {pregnancy.canAdd ? <AddEventButtons /> : null}
    </EventEditor>
  );
}

function History({ history }: { history: Read<HistoryRow[]> }) {
  return (
    <div id={HISTORY_ID} className={styles.block}>
      <h3 className={styles.subheading}>{copy.history.heading}</h3>
      <p className={styles.help}>{copy.history.lede}</p>
      {!history.ok ? (
        <p className={styles.notice}>{copy.history.failed}</p>
      ) : history.value.length === 0 ? (
        <p className={styles.quiet}>{copy.history.empty}</p>
      ) : (
        <Timeline
          label={copy.history.label}
          items={history.value.map((row) => ({
            key: row.id,
            date: row.changedOn,
            title: copy.history.change(formatDayWithYear(row.from), formatDayWithYear(row.to)),
            detail: datingMethodLabels[row.method],
          }))}
        />
      )}
    </div>
  );
}

function OwnSection({ own, today }: { own: OwnView; today: string }) {
  switch (own.kind) {
    case "failed":
      return (
        <section className={styles.section} aria-labelledby="own-heading">
          <h2 id="own-heading" className="sr-only">
            {copy.own.heading}
          </h2>
          <p className={styles.notice}>{copy.own.failed}</p>
        </section>
      );
    case "active": {
      const pregnancy = own.pregnancy;
      return (
        <section className={styles.section} aria-labelledby="own-heading">
          <h2 id="own-heading" className="sr-only">
            {copy.own.heading}
          </h2>
          <WeekCard
            today={today}
            dueDate={pregnancy.dueDate}
            {...(pregnancy.method === undefined ? {} : { method: pregnancy.method })}
            historyHref={`#${HISTORY_ID}`}
          />
          <Weeks pregnancy={pregnancy} />
          <History history={own.history} />
          <EndPregnancy
            pregnancyId={pregnancy.id}
            today={today}
            start={pregnancy.start}
            sharedWith={own.sharedWith}
          />
        </section>
      );
    }
    case "postpartum": {
      const paused = own.predictionsPaused;
      return (
        <section className={styles.section} aria-labelledby="own-heading">
          <h2 id="own-heading" className="sr-only">
            {copy.own.postpartumHeading}
          </h2>
          {own.child !== null ? (
            <p className={styles.child}>
              <span className={styles.childName}>{own.child.name}</span>{" "}
              <span className={styles.childAge}>{own.child.age}</span>
            </p>
          ) : null}
          {own.childrenFailed ? (
            <p className={styles.notice}>{copy.postpartum.childrenFailed}</p>
          ) : null}
          {paused ? (
            <EmptyState
              level={3}
              heading={copy.postpartum.heading}
              why={copy.postpartum.why}
              action={<Button href={logToday(today)}>{copy.postpartum.action}</Button>}
            />
          ) : null}
          {!paused && own.child === null && !own.childrenFailed ? (
            <EmptyState
              level={3}
              heading={copy.noneInProgress.heading}
              why={copy.noneInProgress.why}
            />
          ) : null}
        </section>
      );
    }
    case "after-ending":
      return own.predictionsPaused ? (
        <EmptyState
          heading={copy.afterEnding.heading}
          why={copy.afterEnding.why}
          action={<Button href={logToday(today)}>{copy.afterEnding.action}</Button>}
        />
      ) : (
        <EmptyState heading={copy.noneInProgress.heading} why={copy.noneInProgress.why} />
      );
    case "empty":
      return <EmptyState heading={copy.empty.heading} why={copy.empty.why} />;
    case "nothing-shared":
      return <EmptyState heading={copy.nothingShared.heading} why={copy.nothingShared.why} />;
  }
}

function SharedSection({ shared, today }: { shared: SharedView; today: string }) {
  const headingId = `shared-${shared.ownerId}`;
  let body: ReactNode;
  switch (shared.kind) {
    case "failed":
      body = <p className={styles.notice}>{copy.shared.failed}</p>;
      break;
    case "none":
      body = <p className={styles.quiet}>{copy.shared.none}</p>;
      break;
    case "paused":
      // The neutral card of architecture 8.4 rule 2: no week, no due date, no dates, never why.
      body = <WeekCard today={today} paused />;
      break;
    case "active":
      body = (
        <>
          <WeekCard
            today={shared.pregnancy.today}
            dueDate={shared.pregnancy.dueDate}
            historyHref={null}
            highlight={shared.highlight}
          />
          <Weeks pregnancy={shared.pregnancy} />
        </>
      );
      break;
  }
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.sectionHeading}>
        {copy.shared.heading(shared.name)}
      </h2>
      {body}
    </section>
  );
}

export function JourneyScreen({ view }: { view: JourneyView }) {
  return (
    <JourneyFrame>
      {view.own !== null ? <OwnSection own={view.own} today={view.today} /> : null}
      {view.shared.map((shared) => (
        <SharedSection key={shared.ownerId} shared={shared} today={view.today} />
      ))}
    </JourneyFrame>
  );
}
