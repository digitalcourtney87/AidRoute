"use client";

import { useState } from "react";
import Link from "next/link";
import { readApiJson } from "@/lib/read-api-json";
import type { ChecklistItemType, ChecklistLeg } from "@/lib/checklist";

const TYPE_BADGES: Record<ChecklistItemType, string> = {
  do: "bg-tint-green text-tint-green-ink",
  carry: "bg-tint-blue text-tint-blue-ink",
  instruct: "bg-ink text-white",
  verify: "bg-tint-amber text-tint-amber-ink",
};

export default function ChecklistPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legs, setLegs] = useState<ChecklistLeg[] | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await readApiJson<{ legs: ChecklistLeg[] }>(res);
      setLegs(body.legs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Pre-trip checklist</h1>
      <p className="max-w-prose text-muted print:hidden">
        Generated from the corridor brief — every line cites its source. Items
        the model can&apos;t back with a stored claim are dropped, not guessed.
      </p>

      <div className="print:hidden">
        <button
          onClick={generate}
          disabled={busy}
          className="bg-action px-5 py-2 font-bold text-white shadow-[0_2px_0_#003078] hover:bg-[#003078] disabled:opacity-50"
        >
          {busy ? "Generating checklist…" : "Generate checklist"}
        </button>
      </div>

      {error && (
        <div className="max-w-prose border-l-4 border-l-tint-red-ink bg-tint-red/40 p-4 print:hidden">
          {error}
        </div>
      )}

      {legs && (
        <div className="max-w-2xl space-y-8">
          <button
            onClick={() => window.print()}
            className="border-2 border-ink bg-white px-4 py-1.5 text-sm font-bold hover:bg-tint-grey print:hidden"
          >
            Print checklist
          </button>
          {legs.map((leg) => (
            <section key={leg.leg}>
              <h2 className="border-b-2 border-ink pb-1 text-2xl font-bold">
                {leg.title || leg.leg}
              </h2>
              <ul className="mt-3 space-y-3">
                {leg.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="peer mt-1 h-5 w-5 shrink-0 accent-action"
                      aria-label={`done: ${item.text}`}
                    />
                    <div className="peer-checked:opacity-60 peer-checked:[&>span:nth-child(2)]:line-through">
                      <span
                        className={`mr-2 inline-block px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide ${TYPE_BADGES[item.type]}`}
                      >
                        {item.type}
                      </span>
                      <span>{item.text}</span>
                      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                        {item.source_ids.map((id) => (
                          <Link
                            key={id}
                            href={`/brief#${id}`}
                            className="border border-action px-1.5 text-xs text-action hover:bg-tint-blue print:border-muted print:text-muted"
                          >
                            {id}
                          </Link>
                        ))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <footer className="max-w-prose border-t border-tint-grey pt-3 text-sm text-muted">
        Navigation aid, not legal advice. Verify conflicting and stale items
        before travel.
      </footer>
    </div>
  );
}
