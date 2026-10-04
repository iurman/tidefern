"use client";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="section wrap narrow">
      <h1>Something went wrong.</h1>
      <p>Nothing you entered was lost on the server. You can try again.</p>
      <button className="action" type="button" onClick={() => retry()}>
        Try again
      </button>
    </section>
  );
}
