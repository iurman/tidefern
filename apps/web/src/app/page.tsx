import Link from "next/link";
import { brand } from "@tidefern/design-tokens";
import { Mark } from "@/components/logo";
import { pageMetadata, site } from "@/lib/site";

export const metadata = pageMetadata("/", site.name, site.description);

const chapters = [
  {
    name: "Cycles",
    text: "Log a day in a few taps, see where you are in your cycle, and keep notes that stay yours.",
  },
  {
    name: "Pregnancy",
    text: "Week by week, with appointments, milestones and the people you choose to bring along.",
  },
  {
    name: "Childhood",
    text: "Feeds, sleep, growth and firsts, shared with every guardian and nobody else.",
  },
];

const principles = [
  {
    title: "Yours by default",
    text: "Nothing is shared until you share it, category by category, and you can take it back.",
  },
  {
    title: "Nothing watching",
    text: "No analytics, advertising or session recording anywhere in the product.",
  },
  {
    title: "Private notes stay private",
    text: "Free text is encrypted with a key that belongs to you alone.",
  },
  {
    title: "Delete means delete",
    text: "Closing your account removes your data, including from backups.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">{brand.name}</p>
          <h1 id="hero-title">{brand.tagline}.</h1>
          <p className="intro">{brand.description}</p>
          <p>
            Tidefern is in development. This site is the working home for its design, its API
            contract and its build.
          </p>
          <div className="actions">
            <Link className="action" href="/design" prefetch={false}>
              Explore the design system
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <div className="tide" aria-hidden="true" />
          <Mark size={240} className="hero-mark" />
        </div>
      </section>

      <section className="section wrap" aria-labelledby="chapters-title">
        <h2 id="chapters-title">Every chapter, one quiet place.</h2>
        <ol className="chapter-list">
          {chapters.map((chapter, index) => (
            <li key={chapter.name}>
              <span className="chapter-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{chapter.name}</h3>
                <p>{chapter.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section wrap panel" aria-labelledby="principles-title">
        <h2 id="principles-title">Built to be trusted.</h2>
        <dl className="principles">
          {principles.map((principle) => (
            <div key={principle.title}>
              <dt>{principle.title}</dt>
              <dd>{principle.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
