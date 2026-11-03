import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/jetbrains-mono";
import "../styles/tokens.css";
import "../styles/ui.css";
import "../styles/app.css";
import { THEME_INIT } from "@/components/theme";
import { Toaster, TooltipLayer } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "Hindsight — what actually moves your YouTube numbers", template: "%s · Hindsight" },
  description: "Connect your YouTube channel and Hindsight reads your back catalog, finds which upload choices genuinely moved performance, and designs the next experiment.",
  icons: { icon: "/favicon.svg" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before React loads. */}
      <body suppressHydrationWarning>
        {/* First in <body>, not in <head>: it still runs before first paint, but React then has no element of its own
            to match by position in <head>. Next can insert a preconnect <link> there before hydration, and an
            inline script after it made the whole document fail to hydrate (dropping data-theme). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
        <div id="layer" />
        <TooltipLayer />
        <Toaster />
      </body>
    </html>
  );
}
