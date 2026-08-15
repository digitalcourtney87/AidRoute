"use client";

import { useState } from "react";
import Link from "next/link";
import type { MergeLogEntry, OperatorClaim } from "@/lib/types";

interface MergeResponse {
  log: MergeLogEntry[];
  claims: OperatorClaim[];
}

function cardStyle(action: MergeLogEntry["action"]): string {
  switch (action) {
    case "corroborated":
      return "border-l-tint-green-ink bg-tint-green/40";
    case "conflict":
      return "border-l-tint-red-ink bg-tint-red/40";
    case "superseded":
      return "border-l-tint-grey-ink bg-tint-grey/40";
    default:
      return "border-l-tint-blue-ink bg-tint-blue/40";
  }
}

function cardTitle(entry: MergeLogEntry, claims: OperatorClaim[]): string {
  const target = claims.find((c) => c.id === entry.targetId);
  switch (entry.action) {
    case "corroborated":
      return `Corroborates ${entry.targetId}${target ? ` (now ${target.n_reports} reports)` : ""}`;
    case "conflict":
      return `CONFLICT with ${entry.targetId} — both shown in the brief`;
    case "superseded":
      return `Supersedes ${entry.targetId} — older claim kept in history`;
    default:
      return "New claim created";
  }
}

export default function DebriefPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResponse | null>(null);

  async function extractIntel() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const extractBody = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractBody.error ?? "Extraction failed");

      const mergeRes = await fetch("/api/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extracted: extractBody.extracted }),
      });
      const mergeBody = await mergeRes.json();
      if (!mergeRes.ok) throw new Error(mergeBody.error ?? "Merge failed");

      setResult(mergeBody as MergeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    await fetch("/api/reset", { method: "POST" });
    setText("");
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold">Debrief a trip</h1>
        <button
          onClick={resetDemo}
          className="text-sm text-muted underline underline-offset-2 hover:text-ink"
        >
          Reset demo
        </button>
      </div>
      <p className="max-w-prose text-muted">
        Just back from a run? Five minutes here makes the next convoy&apos;s
        checklist better.
      </p>

      <textarea
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full max-w-prose border-2 border-ink p-3"
        placeholder="Tell us about the trip — which crossing, what they asked for, what surprised you…"
      />

      <div>
        <button
          onClick={extractIntel}
          disabled={busy || !text.trim()}
          className="bg-action px-5 py-2 font-bold text-white shadow-[0_2px_0_#003078] hover:bg-[#003078] disabled:opacity-50"
        >
          {busy ? "Extracting intel…" : "Extract intel"}
        </button>
      </div>

      {error && (
        <div className="max-w-prose border-l-4 border-l-tint-red-ink bg-tint-red/40 p-4">
          {error}
        </div>
      )}

      {result && (
        <div className="max-w-prose space-y-3">
          <h2 className="text-xl font-bold">
            {result.log.length} intel item{result.log.length === 1 ? "" : "s"}{" "}
            processed
          </h2>
          {result.log.map((entry, i) => (
            <div
              key={i}
              className={`border-l-4 p-4 ${cardStyle(entry.action)}`}
            >
              <p className="font-bold">{cardTitle(entry, result.claims)}</p>
              <p className="mt-1 text-sm">{entry.extracted.claim}</p>
            </div>
          ))}
          <Link
            href="/brief"
            className="inline-block bg-action px-5 py-2 font-bold text-white shadow-[0_2px_0_#003078] hover:bg-[#003078]"
          >
            View corridor brief →
          </Link>
        </div>
      )}
    </div>
  );
}
