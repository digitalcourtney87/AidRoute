"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DESTINATIONS,
  LEG_TITLES,
  START_POINTS,
  legsForSpan,
  type Destination,
  type StartPoint,
} from "@/lib/journey-span";
import { readApiJson } from "@/lib/read-api-json";
import type { ChecklistItemType, ChecklistLeg } from "@/lib/checklist";
import type { Leg } from "@/lib/types";

const TYPE_BADGES: Record<ChecklistItemType, string> = {
  do: "bg-tint-green text-tint-green-ink",
  carry: "bg-tint-blue text-tint-blue-ink",
  instruct: "bg-ink text-white",
  verify: "bg-tint-amber text-tint-amber-ink",
};

// One leg's fetch state. Sections are generated per-leg and in parallel, so
// each one renders the moment it lands rather than waiting for the slowest.
type LegState =
  | { status: "loading" }
  | { status: "done"; section: ChecklistLeg }
  | { status: "error"; message: string };

export default function ChecklistPage() {
  const [start, setStart] = useState<StartPoint>("UK");
  const [destination, setDestination] = useState<Destination>("UA");
  const [spanLegs, setSpanLegs] = useState<Leg[] | null>(null);
  const [legStates, setLegStates] = useState<Partial<Record<Leg, LegState>>>({});

  const selectedLegs = legsForSpan(start, destination);
  const invalidSpan = selectedLegs.length === 0;
  const busy = Object.values(legStates).some((s) => s?.status === "loading");

  // Fetch one leg's section, tracking its state independently so a failure
  // degrades to a retry on that section alone, not the whole checklist.
  async function loadLeg(leg: Leg) {
    setLegStates((prev) => ({ ...prev, [leg]: { status: "loading" } }));
    try {
      const res = await fetch("/api/checklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ legs: [leg] }),
      });
      const body = await readApiJson<{ legs: ChecklistLeg[] }>(res);
      const section = body.legs[0];
      if (!section) throw new Error("No section returned for this leg.");
      setLegStates((prev) => ({ ...prev, [leg]: { status: "done", section } }));
    } catch (err) {
      setLegStates((prev) => ({
        ...prev,
        [leg]: {
          status: "error",
          message: err instanceof Error ? err.message : "Something went wrong",
        },
      }));
    }
  }

  function generate() {
    if (invalidSpan) return;
    setSpanLegs(selectedLegs);
    setLegStates({});
    // Fan out: every leg starts at once, so wall-clock is the slowest single
    // leg rather than the sum of all of them.
    for (const leg of selectedLegs) void loadLeg(leg);
  }

  // A changed span invalidates what's on screen — clear it rather than leave
  // sections from a journey the operator is no longer taking.
  function changeSpan(next: { start?: StartPoint; destination?: Destination }) {
    if (next.start) setStart(next.start);
    if (next.destination) setDestination(next.destination);
    setSpanLegs(null);
    setLegStates({});
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Pre-trip checklist</h1>
      <p className="max-w-prose text-muted print:hidden">
        Tell us where you&apos;re travelling and we&apos;ll build the checklist
        for those legs only — every line cites its source. Items the model
        can&apos;t back with a stored claim are dropped, not guessed.
      </p>

      <div className="max-w-2xl space-y-4 print:hidden">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-bold">Starting from</span>
            <select
              value={start}
              onChange={(e) =>
                changeSpan({ start: e.target.value as StartPoint })
              }
              className="border-2 border-ink bg-white px-3 py-2"
            >
              {START_POINTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-bold">Destination</span>
            <select
              value={destination}
              onChange={(e) =>
                changeSpan({ destination: e.target.value as Destination })
              }
              className="border-2 border-ink bg-white px-3 py-2"
            >
              {DESTINATIONS.map((d) => (
                <option
                  key={d.value}
                  value={d.value}
                  // Starting inside Poland leaves no Polish border to clear,
                  // so Poland → Poland covers no legs at all.
                  disabled={start === "PL" && d.value === "PL"}
                >
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {invalidSpan ? (
          <p className="max-w-prose border-l-4 border-l-tint-amber-ink bg-tint-amber/40 p-3 text-sm">
            That start and destination cover no legs of the corridor. Choose a
            destination further along the route.
          </p>
        ) : (
          <p className="text-sm text-muted">
            {selectedLegs.length} leg{selectedLegs.length === 1 ? "" : "s"}:{" "}
            {selectedLegs.map((l) => LEG_TITLES[l]).join(" → ")}
          </p>
        )}

        <button
          onClick={generate}
          disabled={busy || invalidSpan}
          className="bg-action px-5 py-2 font-bold text-white shadow-[0_2px_0_#003078] hover:bg-[#003078] disabled:opacity-50"
        >
          {busy ? "Generating checklist…" : "Generate checklist"}
        </button>
      </div>

      {spanLegs && (
        <div className="max-w-2xl space-y-8">
          <button
            onClick={() => window.print()}
            className="border-2 border-ink bg-white px-4 py-1.5 text-sm font-bold hover:bg-tint-grey print:hidden"
          >
            Print checklist
          </button>

          {spanLegs.map((leg) => {
            const state = legStates[leg];
            return (
              <section key={leg}>
                <h2 className="border-b-2 border-ink pb-1 text-2xl font-bold">
                  {state?.status === "done"
                    ? state.section.title || LEG_TITLES[leg]
                    : LEG_TITLES[leg]}
                </h2>

                {state?.status === "loading" && (
                  <p className="mt-3 text-muted print:hidden">Generating…</p>
                )}

                {state?.status === "error" && (
                  <div className="mt-3 border-l-4 border-l-tint-red-ink bg-tint-red/40 p-4 print:hidden">
                    <p>{state.message}</p>
                    <button
                      onClick={() => void loadLeg(leg)}
                      className="mt-2 border-2 border-ink bg-white px-3 py-1 text-sm font-bold hover:bg-tint-grey"
                    >
                      Retry this leg
                    </button>
                  </div>
                )}

                {state?.status === "done" && state.section.gap && (
                  <p className="mt-3 border-l-4 border-l-tint-grey bg-tint-grey/40 p-4">
                    No verified intel for this leg yet. Nothing here is a
                    guess — debrief after your trip to fill the gap.
                  </p>
                )}

                {state?.status === "done" && !state.section.gap && (
                  <ul className="mt-3 space-y-3">
                    {state.section.items.map((item, i) => (
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
                )}
              </section>
            );
          })}
        </div>
      )}

      <footer className="max-w-prose border-t border-tint-grey pt-3 text-sm text-muted">
        Navigation aid, not legal advice. Verify conflicting and stale items
        before travel.
      </footer>
    </div>
  );
}
