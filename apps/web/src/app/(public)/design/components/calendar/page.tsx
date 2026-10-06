import Link from "next/link";
import { DayList } from "@/components/ui/day-list";
import { MonthGrid } from "@/components/ui/month-grid";
import { ComponentsChapterNav, SpecimenFrame } from "@/components/ui/specimen-frame";
import { days, noted, points, specimens, today, windows } from "@/components/ui/specimens/calendar";
import { WeekStrip } from "@/components/ui/week-strip";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/design/components/calendar",
  "Calendar",
  "The month grid, the date range selection, the day cell textures, the week strip and the day list, in every state and both themes.",
  false,
);

export default function CalendarComponentsPage() {
  return (
    <div className="design wrap">
      <nav className="chapter-nav" aria-label="Chapters">
        <Link href="/design" prefetch={false}>
          Design system
        </Link>
        <Link href="/design/components" prefetch={false}>
          Components
        </Link>
      </nav>
      <header className="design-title">
        <p className="eyebrow">Components</p>
        <h1>Calendar</h1>
        <p className="intro">{specimens.lede}</p>
      </header>

      <section className="design-section" aria-labelledby="month-view">
        <h2 id="month-view">Month view</h2>
        <p className="muted-note">
          October 2026 with three logged period starts behind it. The solid pill is the logged
          period, the dashed pill the predicted one, the dotted pill the estimated fertile window;
          the outlined dot is the estimated ovulation day and the small dot marks a day with an
          entry. The tide line runs under today&apos;s row. Every day carries its own name.
        </p>
        <div className="narrow specimen">
          <MonthGrid
            today={today}
            defaultMonth={today}
            weekStart={1}
            windows={windows}
            points={points}
            noted={noted}
            showLegend
          />
        </div>
      </section>

      <section className="design-section" aria-labelledby="list-view">
        <h2 id="list-view">List view</h2>
        <p className="muted-note">
          The week strip reads the same textures with today on the warmth surface; the rows below
          are the days, newest first, each with what was logged in words and a chevron to its sheet.
        </p>
        <div className="narrow specimen">
          <WeekStrip today={today} weekStart={1} windows={windows} points={points} noted={noted} />
        </div>
        <div className="narrow specimen">
          <DayList today={today} items={days} />
        </div>
      </section>

      <section className="design-section" aria-labelledby="states">
        <h2 id="states">Every state, both themes</h2>
        <SpecimenFrame group={specimens} />
      </section>

      <ComponentsChapterNav
        previous={{ href: "/design/components/structure", label: "Structure and overlays" }}
        next={{ href: "/design/components/marks", label: "Marks and charts" }}
      />
    </div>
  );
}
