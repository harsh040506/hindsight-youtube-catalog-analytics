"use client";

import { useEffect } from "react";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(JSON.stringify({ level: "error", msg: "ui error", digest: error.digest })); }, [error]);
  return (
    <div className="app"><main className="scroller"><div className="page is-narrow"><div className="center-page">
      <h1>Something went wrong</h1>
      <p className="lede">We hit an unexpected problem. Your data is safe: Hindsight only ever reads from YouTube.</p>
      {error.digest && <p className="faint small">Reference: <span className="mono">{error.digest}</span></p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <a className="btn btn-ghost" href="/">Go home</a>
      </div>
    </div></div></main></div>
  );
}
