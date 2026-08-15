import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { Nav } from "./nav";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-ui",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AidRoute Debrief",
  description:
    "Living corridor intel for humanitarian convoys — GB to Ukraine. Every statement dated and sourced.",
};

function CorridorMark() {
  return (
    <svg
      width="28"
      height="14"
      viewBox="0 0 28 14"
      aria-hidden
      className="text-action"
    >
      <path
        d="M2 11 L8 4 L14 8 L20 3 L26 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="2" cy="11" r="1.6" fill="currentColor" />
      <circle cx="26" cy="9" r="1.6" fill="currentColor" />
    </svg>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${plex.variable} ${serif.variable} font-sans min-h-screen bg-slate text-cream antialiased`}
      >
        <header className="chrome sticky top-0 z-10 bg-slate print:hidden">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-5">
            <Link
              href="/"
              className="flex items-center gap-2 text-cream no-underline"
            >
              <CorridorMark />
              <span className={`${serif.className} text-2xl tracking-tight`}>
                AidRoute
              </span>
              <span className="text-sm text-muted-slate">Debrief</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-3 pb-10">
          <div className="sheet rounded bg-paper px-4 py-8 text-ink sm:px-8 sm:py-10">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
