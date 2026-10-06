import { addDays, predictCycle, type CalendarDate } from "@tidefern/core";
import type { DayMark, DayWindow } from "../calendar-dates";
import { DateRangeSelection } from "../date-range-selection";
import { DayCell, daySampleClassNames, dayCellClassNames } from "../day-cell";
import { DayList, type DayListItem } from "../day-list";
import { MonthGrid } from "../month-grid";
import type { ComponentState, SpecimenGroup } from "../specimen";
import { WeekStrip } from "../week-strip";

/**
 * The calendar chapter's data. Today is fixed so the page renders the same on
 * every visit and in every zone; the windows come from the real predictor in
 * packages/core over three logged period starts, never from the component.
 */
export const today: CalendarDate = "2026-10-05";

const periodStarts = [{ date: "2026-08-04" }, { date: "2026-09-02" }, { date: "2026-10-01" }];
const prediction = predictCycle(periodStarts);

export const windows: DayWindow[] = [
  { start: "2026-10-01", end: "2026-10-04", texture: "logged", words: "period logged" },
];
if (prediction?.nextPeriodStart) {
  windows.push({
    start: prediction.nextPeriodStart,
    end: addDays(prediction.nextPeriodStart, 4),
    texture: "predicted",
    words: "period expected",
  });
}
if (prediction?.fertileWindow) {
  windows.push({
    start: prediction.fertileWindow.start,
    end: prediction.fertileWindow.end,
    texture: "estimated",
    words: "fertile window estimated",
  });
}

export const points: DayMark[] = prediction?.ovulation
  ? [{ date: prediction.ovulation, words: "ovulation estimated" }]
  : [];

export const noted: DayMark[] = [
  { date: "2026-10-01" },
  { date: "2026-10-02" },
  { date: "2026-10-03" },
  { date: "2026-10-04" },
  { date: today, words: "light flow and cramps logged" },
];

export const days: DayListItem[] = [
  { date: "2026-10-01", summary: "Period started, medium flow", href: "/log/2026-10-01" },
  { date: "2026-10-03", summary: "Medium flow, headache", href: "/log/2026-10-03" },
  { date: "2026-10-02", summary: "Heavy flow, low mood", href: "/log/2026-10-02" },
  { date: today, summary: "Light flow, cramps", href: `/log/${today}` },
  { date: "2026-10-04", summary: "Light flow", href: "/log/2026-10-04" },
];

const monthEmpty = (
  <>
    <strong>Nothing logged this month</strong>
    <span>Days you log show here with their flow and symptoms.</span>
    <button type="button">Log today</button>
  </>
);

const listEmpty = {
  heading: "Nothing logged yet",
  why: "Days you log show up here as a list you can scan.",
  action: <button type="button">Log today</button>,
};

function dataProps(state: ComponentState) {
  return {
    disabled: state === "disabled",
    loading: state === "loading",
    error: state === "error" ? "We could not load this month. Try again." : undefined,
  };
}

const textureSamples = [
  { name: "Logged, solid", texture: "logged", number: 3, noted: true },
  { name: "Predicted, dashed", texture: "predicted", number: 30 },
  { name: "Estimated, dotted", texture: "estimated", number: 12 },
  { name: "Ovulation point and noted dot", number: 16, point: true, noted: true },
  { name: "Today", number: 5, today: true, noted: true },
] as const;

export const specimens: SpecimenGroup = {
  slug: "calendar",
  title: "Calendar",
  lede: "Every day is a YYYY-MM-DD string and today is a prop. A logged fact is solid, a prediction is dashed and an estimate is dotted; color never changes with certainty.",
  specimens: [
    {
      name: "Day cell textures",
      source: "apps/web/src/components/ui/day-cell.tsx",
      usage:
        '<td className={dayCellClassNames({ texture: "logged", edge: "start" })}>\n  <DayCell number={3} noted />\n</td>',
      keyboard:
        "None of its own: the cell is content inside the grid's button or the strip's item, which carry the name and the focus.",
      states: {
        hover: "none",
        "focus-visible": "none",
        active: "none",
        disabled: "none",
        loading: "none",
        error: "none",
      },
      render: (state) =>
        state === "empty" ? (
          <ol className={daySampleClassNames.list} aria-label="Day cell with nothing logged">
            <li className={`${daySampleClassNames.item} ${dayCellClassNames({})}`}>
              <span className="sr-only">Plain day</span>
              <span aria-hidden="true">
                <DayCell number={7} />
              </span>
            </li>
          </ol>
        ) : (
          <ol className={daySampleClassNames.list} aria-label="Day cell textures">
            {textureSamples.map((sample) => (
              <li
                key={sample.name}
                className={`${daySampleClassNames.item} ${dayCellClassNames({
                  texture: "texture" in sample ? sample.texture : undefined,
                  edge: "single",
                  today: "today" in sample ? sample.today : undefined,
                })}`}
              >
                <span className="sr-only">{sample.name}</span>
                <span aria-hidden="true">
                  <DayCell
                    number={sample.number}
                    point={"point" in sample ? sample.point : undefined}
                    noted={"noted" in sample ? sample.noted : undefined}
                  />
                </span>
              </li>
            ))}
          </ol>
        ),
    },
    {
      name: "Month grid",
      source: "apps/web/src/components/ui/month-grid.tsx",
      usage:
        "<MonthGrid\n  today={today}\n  defaultMonth={today}\n  weekStart={1}\n  windows={windows}\n  points={points}\n  noted={noted}\n  showLegend\n  onDaySelect={(date) => openDaySheet(date)}\n/>",
      keyboard:
        "Tab reaches the previous and next month buttons and today. Arrow keys move by day and week, Home and End to the week's first and last day, Page Up and Page Down by month, Shift with them by year. Enter or Space opens the day.",
      render: (state) => (
        <MonthGrid
          today={today}
          defaultMonth={today}
          weekStart={1}
          windows={state === "empty" ? [] : windows}
          points={state === "empty" ? [] : points}
          noted={state === "empty" ? [] : noted}
          showLegend={state !== "empty"}
          emptyMessage={monthEmpty}
          {...dataProps(state)}
        />
      ),
    },
    {
      name: "Date range selection",
      source: "apps/web/src/components/ui/date-range-selection.tsx",
      usage:
        '<DateRangeSelection\n  label="Days to share"\n  today={today}\n  defaultValue={{ start: "2026-10-07", end: "2026-10-09" }}\n  onChange={(range) => setRange(range)}\n/>',
      keyboard:
        "The grid's keys move the focus; Enter or Space is the tap. The first tap starts the range, the second ends it, swapped if earlier; a third tap starts over. The sentence above the grid reads the value and is announced when it changes.",
      states: { empty: "none" },
      render: (state) => (
        <DateRangeSelection
          label="Days to share"
          today={today}
          defaultValue={{ start: "2026-10-07", end: "2026-10-09" }}
          {...dataProps(state)}
        />
      ),
    },
    {
      name: "Week strip",
      source: "apps/web/src/components/ui/week-strip.tsx",
      usage:
        "<WeekStrip today={today} weekStart={1} windows={windows} points={points} noted={noted} />",
      keyboard:
        "None: the strip is a reading of the week above the list, and today sits on the warmth surface, which never hosts a control. The rows below open each day.",
      states: {
        hover: "none",
        "focus-visible": "none",
        active: "none",
        disabled: "none",
        loading: "none",
        error: "none",
      },
      render: (state) => (
        <WeekStrip
          today={today}
          weekStart={1}
          windows={state === "empty" ? [] : windows}
          points={state === "empty" ? [] : points}
          noted={state === "empty" ? [] : noted}
        />
      ),
    },
    {
      name: "Day list",
      source: "apps/web/src/components/ui/day-list.tsx",
      usage:
        '<DayList\n  today={today}\n  items={days}\n  empty={{ heading: "Nothing logged yet", why: "Days you log show up here as a list you can scan.", action: <Link href="/log/today">Log today</Link> }}\n/>',
      keyboard: "Tab moves through the rows, which are links; Enter opens the day.",
      states: { disabled: "none" },
      render: (state) => (
        <DayList
          today={today}
          items={state === "empty" ? [] : days}
          loading={state === "loading"}
          error={state === "error" ? "We could not load these days. Try again." : undefined}
          empty={listEmpty}
        />
      ),
    },
  ],
};
