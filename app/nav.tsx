"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Debrief a trip" },
  { href: "/brief", label: "Corridor brief" },
  { href: "/checklist", label: "Pre-trip checklist" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-6 text-sm">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 pb-0.5 text-white underline-offset-4 hover:underline ${
              active ? "border-white font-bold" : "border-transparent"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
