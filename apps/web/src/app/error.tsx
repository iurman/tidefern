"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="section wrap narrow">
      <h1>Something went wrong.</h1>
      <p>Nothing you entered was lost on the server. You can try again.</p>
      <button className="action" type="button" onClick={() => reset()}>
        Try again
      </button>
    </section>
  );
}
