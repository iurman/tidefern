import Link from "next/link";
import { AppShell } from "@/components/ui/app-shell";
import { ComponentsChapterNav } from "@/components/ui/specimen-frame";
import { OverlayDemo, StructureSpecimens } from "@/components/ui/specimens/structure";
import { pageMetadata } from "@/lib/site";

// The specimens module is a client module, so its group object is a client
// reference on the server; the title and lede are written here as well.
const title = "Structure and overlays";
const lede =
  "The authenticated frame, the two overlays, and the cards that carry sharing, consent and devices. Every control is a native element; nothing here depends on a drag, a hover or a sound.";

export const metadata = pageMetadata(
  "/design/components/structure",
  title,
  "The app shell with its tab bar and rail, the dialog and bottom sheet, and the sharing, consent and device cards in every state and both themes.",
  false,
);

export default function StructurePage() {
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
        <h1>{title}</h1>
        <p className="intro">{lede}</p>
      </header>

      <section className="design-section" aria-labelledby="shell-demo-heading" id="shell-demo">
        <h2 id="shell-demo-heading">The shell at full width</h2>
        <p className="muted-note">
          The frame answers to its own width: the rail appears from 1024 px and the tab bar below
          it. This profile has a pregnancy and a child, so both Journey and Family are listed.
          Resize the window to see it switch.
        </p>
        <AppShell stage="pregnancy" hasChild current="today" fit="content">
          <p className="muted-note">The route renders here, between the rail and the bar.</p>
        </AppShell>
      </section>

      <section className="design-section" aria-labelledby="overlays-heading" id="overlay-demo">
        <h2 id="overlays-heading">Live overlays</h2>
        <p className="muted-note">
          Both open in the top layer behind the 40 percent scrim. Escape closes either one and focus
          returns to the button that opened it. The sheet rises from the bottom edge below 1024 px
          and is a centered dialog from there.
        </p>
        <OverlayDemo />
      </section>

      <section className="design-section" aria-labelledby="specimens-heading">
        <h2 id="specimens-heading">Every component, every state</h2>
        <StructureSpecimens />
      </section>

      <ComponentsChapterNav
        previous={{ href: "/design/components/forms", label: "Forms" }}
        next={{ href: "/design/components/calendar", label: "Calendar" }}
      />
    </div>
  );
}
