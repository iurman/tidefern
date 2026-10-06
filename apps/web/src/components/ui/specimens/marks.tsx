import { CycleRing } from "../cycle-ring";
import { MeasurementChart } from "../measurement-chart";
import type { ComponentState, SpecimenGroup } from "../specimen";
import { Timeline, type TimelineItem } from "../timeline";
import { WeekCard } from "../week-card";

/**
 * The marks group: cycle ring, pregnancy week card, timeline and the
 * measurement chart. Every date below is a fixed YYYY-MM-DD string and
 * `today` is always passed, so the page renders the same on every visit and
 * nothing here reads the machine's clock or time zone. The ring, the card and
 * the chart are images with the sentences beside them, so hover, focus-visible
 * and active have no meaning on their roots and are declared none; the
 * chart's range pills are the one interactive part and the chart's root
 * decides that those states show on its first pill. Disabled is none for all
 * four because none of them is a control.
 */

const today = "2026-10-05";

const ringError = "We could not load your cycle. Try again.";

/** Four completed cycles of 28 days, the latest start on Sep 24, so today is day 12. */
const regularStarts = [
  { date: "2026-06-04" },
  { date: "2026-07-02" },
  { date: "2026-07-30" },
  { date: "2026-08-27" },
  { date: "2026-09-24" },
];

const loggedDays = ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];

const notInteractive: Partial<Record<ComponentState, "none">> = {
  hover: "none",
  "focus-visible": "none",
  active: "none",
  disabled: "none",
};

const defaultOnly: Partial<Record<ComponentState, "none">> = {
  ...notInteractive,
  loading: "none",
  error: "none",
  empty: "none",
};

const childItems: TimelineItem[] = [
  {
    key: "checkup",
    date: "2026-11-02",
    title: "9 month check-up",
    detail: "With the pediatrician",
    expected: true,
  },
  {
    key: "rolled",
    date: "2026-10-02",
    title: "Rolled over",
    detail: "Back to front, on the rug",
    href: "/family/child/milestones",
  },
  { key: "smile", date: "2026-05-14", title: "First smile", href: "/family/child/milestones" },
  { key: "home", date: "2026-02-12", title: "Came home" },
];

const journeyItems: TimelineItem[] = [
  { key: "scan", date: "2026-11-20", title: "Growth scan", expected: true },
  { key: "glucose", date: "2026-10-16", title: "Glucose test", expected: true },
  { key: "anatomy", date: "2026-09-04", title: "Anatomy scan", detail: "All as expected" },
  { key: "dating", date: "2026-06-12", title: "Dating scan", detail: "Due date confirmed" },
];

const weights = [
  { date: "2026-02-10", value: 3200 },
  { date: "2026-03-12", value: 4100 },
  { date: "2026-04-14", value: 5000 },
  { date: "2026-06-16", value: 6300 },
  { date: "2026-08-18", value: 7200 },
  { date: "2026-09-29", value: 7700 },
];

const lowWeights = [
  { date: "2026-02-10", value: 3100 },
  { date: "2026-04-14", value: 4600 },
  { date: "2026-06-16", value: 5300 },
  { date: "2026-09-29", value: 5400 },
];

export const specimens: SpecimenGroup = {
  slug: "marks",
  title: "Marks and charts",
  lede: "The cycle ring, the pregnancy week card, the timeline and the growth chart. Each is an image whose facts are also sentences beside it: logged is solid, predicted is dashed, estimated is dotted, and the color never changes with certainty.",
  specimens: [
    {
      name: "Cycle ring",
      source: "apps/web/src/components/ui/cycle-ring.tsx",
      usage: `<CycleRing
  today="2026-10-05"
  periodStarts={starts}
  loggedDays={loggedDays}
  logHref="/log"
/>`,
      keyboard:
        "Not interactive. The ring is an image named by its cycle day; the sentences beside it carry the estimate, the fertile days and the disclaimer. The empty state's action is a link.",
      states: notInteractive,
      render: (state) => (
        <CycleRing
          today={today}
          periodStarts={state === "empty" ? [] : regularStarts}
          loggedDays={loggedDays}
          loading={state === "loading"}
          error={state === "error" ? ringError : undefined}
        />
      ),
    },
    {
      name: "Cycle ring, first guess",
      source: "apps/web/src/components/ui/cycle-ring.tsx",
      usage: `<CycleRing
  today="2026-10-05"
  periodStarts={[oneStart]}
/>`,
      keyboard:
        "Not interactive. One logged period: the dashed and dotted arcs only, the 28 day default and the first-guess copy.",
      states: defaultOnly,
      render: () => <CycleRing today={today} periodStarts={[{ date: "2026-09-24" }]} />,
    },
    {
      name: "Cycle ring, not enough regular cycles",
      source: "apps/web/src/components/ui/cycle-ring.tsx",
      usage: `<CycleRing
  today="2026-10-05"
  periodStarts={farApart}
  loggedDays={loggedDays}
/>`,
      keyboard:
        "Not interactive. Periods logged but no completed cycle inside 21 to 45 days: the track and the logged arc only, no dashed or dotted arcs, and the sentence says why.",
      states: defaultOnly,
      render: () => (
        <CycleRing
          today={today}
          periodStarts={[{ date: "2026-06-04" }, { date: "2026-09-24" }]}
          loggedDays={loggedDays}
        />
      ),
    },
    {
      name: "Pregnancy week card",
      source: "apps/web/src/components/ui/week-card.tsx",
      usage: `<WeekCard
  today="2026-10-05"
  dueDate="2027-01-23"
  method="ultrasound"
  historyHref="/journey/dating"
/>`,
      keyboard:
        "Tab reaches the History link; Enter follows it. The card itself is not a control. The empty state's action is a link.",
      states: notInteractive,
      render: (state) => (
        <WeekCard
          today={today}
          dueDate={state === "empty" ? undefined : "2027-01-23"}
          method="ultrasound"
          loading={state === "loading"}
          error={state === "error" ? "We could not load this week. Try again." : undefined}
        />
      ),
    },
    {
      name: "Pregnancy week card, paused",
      source: "apps/web/src/components/ui/week-card.tsx",
      usage: `<WeekCard today="2026-10-05" paused />`,
      keyboard:
        "Not interactive. The partner's card once the pregnancy has ended: it says updates are paused and never why.",
      states: defaultOnly,
      render: () => <WeekCard today={today} paused />,
    },
    {
      name: "Timeline",
      source: "apps/web/src/components/ui/timeline.tsx",
      usage: `<Timeline
  label="Milestones"
  highlightNewest
  items={milestones}
/>`,
      keyboard:
        "Tab moves between the rows that link somewhere; Enter follows a link. Rows without a link are plain text. On /family/[childId] the newest logged row is on warmth; expected rows carry the word and a dashed connector.",
      states: notInteractive,
      render: (state) => (
        <Timeline
          label="Milestones"
          highlightNewest
          items={state === "empty" ? [] : childItems}
          loading={state === "loading"}
          error={state === "error" ? "We could not load the timeline. Try again." : undefined}
          empty={{
            heading: "Nothing marked yet",
            why: "Most children do these by the ages shown. This is not a screening tool; your pediatrician is.",
            action: { label: "Mark a milestone", href: "/family/child/milestones" },
          }}
        />
      ),
    },
    {
      name: "Timeline, no warmth",
      source: "apps/web/src/components/ui/timeline.tsx",
      usage: `<Timeline
  label="Appointments"
  items={appointments}
/>`,
      keyboard:
        "As the timeline. On /journey every row is plain because the week card is the screen's warmth.",
      states: defaultOnly,
      render: () => <Timeline label="Appointments" items={journeyItems} />,
    },
    {
      name: "Measurement chart",
      source: "apps/web/src/components/ui/measurement-chart.tsx",
      usage: `<MeasurementChart
  sex="female"
  indicator="weightForAge"
  birthDate="2026-02-10"
  today="2026-10-05"
  units="metric"
  viewer="owner"
  measurements={weights}
/>`,
      keyboard:
        "Tab reaches the range group; arrow keys move between Since birth, Last 3 months and Last year and swap the chart in place; nothing navigates. The chart is an image named by its latest reading; the readings beneath carry every value.",
      states: { disabled: "none" },
      render: (state) => (
        <MeasurementChart
          sex="female"
          indicator="weightForAge"
          birthDate="2026-02-10"
          today={today}
          measurements={state === "empty" ? [] : weights}
          loading={state === "loading"}
          error={state === "error" ? "We could not load the measurements. Try again." : undefined}
        />
      ),
    },
    {
      name: "Measurement chart, beyond the band",
      source: "apps/web/src/components/ui/measurement-chart.tsx",
      usage: `<MeasurementChart
  sex="female"
  indicator="weightForAge"
  birthDate="2026-02-10"
  today="2026-10-05"
  viewer="owner"
  measurements={lowWeights}
/>`,
      keyboard:
        "As the measurement chart. A reading beyond plus or minus 2 SD adds the pointing-to-care sentence beneath the chart on the owner's view and never on a partner's.",
      states: defaultOnly,
      render: () => (
        <MeasurementChart
          sex="female"
          indicator="weightForAge"
          birthDate="2026-02-10"
          today={today}
          measurements={lowWeights}
        />
      ),
    },
    {
      name: "Measurement chart, partner's view in US units",
      source: "apps/web/src/components/ui/measurement-chart.tsx",
      usage: `<MeasurementChart
  sex="female"
  indicator="weightForAge"
  birthDate="2026-02-10"
  today="2026-10-05"
  units="us"
  viewer="partner"
  measurements={lowWeights}
/>`,
      keyboard:
        "As the measurement chart. The same low readings in pounds, without the pointing-to-care sentence because a partner is viewing.",
      states: defaultOnly,
      render: () => (
        <MeasurementChart
          sex="female"
          indicator="weightForAge"
          birthDate="2026-02-10"
          today={today}
          units="us"
          viewer="partner"
          measurements={lowWeights}
        />
      ),
    },
  ],
};
