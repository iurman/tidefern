import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section wrap narrow">
      <h1>That page is not here.</h1>
      <p>The address may have changed, or it never existed.</p>
      <Link className="action" href="/">
        Back to the start
      </Link>
    </section>
  );
}
