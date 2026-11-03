"use client";

import { useEffect } from "react";

/** Never renders `error.message`: it can carry internal detail. The digest lets the owner find the server log line. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(JSON.stringify({ level: "error", msg: "dashboard ui error", digest: error.digest })); }, [error]);
  return (
    <div className="center-page">
      <h2>Something went wrong</h2>
      <p className="lede">This page hit an unexpected problem while it was being built. Your channel and data are untouched: Hindsight only ever reads from YouTube.</p>
      {error.digest && <p className="faint small">Reference: <span className="mono">{error.digest}</span></p>}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <a className="btn btn-ghost" href="/dashboard/demo">Open the sample</a>
      </div>
    </div>
  );
}
