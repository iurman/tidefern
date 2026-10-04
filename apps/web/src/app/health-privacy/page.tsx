import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata(
  "/health-privacy",
  "Consumer Health Data Privacy Policy",
  "What health data Tidefern collects, why, where it comes from, who receives it and how to exercise your rights. A draft until the owner approves it.",
  false,
);

const sections = [
  {
    title: "Categories of consumer health data collected",
    text: "Cycle dates and flow, symptoms and moods, pregnancy dates and events, child measurements and events, notes and photos you choose to add.",
  },
  {
    title: "Purposes, and how the data is used",
    text: "To show your own records back to you, to estimate your next period from your logged dates, and to show the people you grant exactly the categories you grant. Nothing else.",
  },
  {
    title: "Sources",
    text: "You, and contributions from a partner or guardian you invited. No other source.",
  },
  {
    title: "Categories shared, and with whom",
    text: "No consumer health data is sold or shared with third parties. Processors that store or send data on our behalf are listed by name here once the owner approves the list.",
  },
  {
    title: "How to exercise your rights",
    text: "Confirm, access, export, correct, withdraw consent, delete, and appeal a refused request. The contact method and the appeal path are listed here once the owner approves them.",
  },
];

export default function HealthPrivacyPage() {
  return (
    <article className="wrap narrow section" aria-labelledby="health-privacy-title">
      <p className="eyebrow">Draft, not yet reviewed</p>
      <h1 id="health-privacy-title">Consumer Health Data Privacy Policy</h1>
      <p className="intro">
        This page contains only what Washington&apos;s My Health My Data Act requires it to contain.
        It is a draft while the product is built for one household, and it carries no operative
        promise until the owner and their attorney approve it.
      </p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <p>{section.text}</p>
        </section>
      ))}
    </article>
  );
}
