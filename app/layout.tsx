import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Nav } from "./nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AidRoute Debrief",
  description:
    "Living corridor intel for humanitarian convoys — GB to Ukraine. Every statement dated and sourced.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen antialiased`}>
        <header className="border-b-[10px] border-action bg-ink text-white print:hidden">
          <div className="mx-auto flex max-w-4xl items-baseline gap-8 px-4 py-4">
            <span className="text-xl font-bold">AidRoute Debrief</span>
            <Nav />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
