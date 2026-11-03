"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf9f5", color: "#1f1e1d", display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ maxWidth: 440, padding: 24 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Something went wrong</h1>
          <p>Please reload the page. If it keeps happening, try again in a few minutes.</p>
          <button onClick={reset} style={{ height: 36, padding: "0 16px", borderRadius: 8, border: 0, background: "#0b0b0b", color: "#fff", fontSize: 14 }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
