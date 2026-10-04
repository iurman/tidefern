"use client";

/**
 * Catches an error thrown by the root layout itself, where no stylesheet,
 * font or provider can be assumed. It renders its own document with the
 * page colors inline; the CSP allows inline styles, not inline scripts.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#F7F5EF",
          color: "#1F3530",
          fontFamily: "Georgia, serif",
        }}
      >
        <main style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontWeight: 500, fontSize: 28 }}>Something went wrong.</h1>
          <p style={{ lineHeight: 1.6 }}>
            Nothing you entered was lost on the server. You can try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: "12px 20px",
              borderRadius: 999,
              border: 0,
              background: "#2F4F46",
              color: "#F7F5EF",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
