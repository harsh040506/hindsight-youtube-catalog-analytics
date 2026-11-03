import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="app">
      <header className="toolbar"><Link href="/" className="brand"><Logo /> <span>Hindsight</span></Link></header>
      <main className="scroller"><div className="page is-narrow"><div className="center-page">
        <h1>That page doesn’t exist</h1>
        <p className="lede">The link may be old or mistyped.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Link href="/" className="btn btn-primary">Go home</Link>
          <Link href="/dashboard/demo" className="btn btn-ghost">Open the sample channel</Link>
        </div>
      </div></div></main>
    </div>
  );
}
