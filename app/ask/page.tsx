"use client";

import { useState } from "react";
import Link from "next/link";
import { readApiJson } from "@/lib/read-api-json";
import type { AskResponse } from "@/lib/ask";
import { SUGGESTED_QUESTIONS } from "@/lib/ask";

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setQuestion(q);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = await readApiJson<AskResponse>(res);
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Ask the corridor</h1>
      <p className="max-w-prose text-muted">
        Answers come only from the verified claim store — dated and sourced.
        Where the store is silent, it says so. It never guesses.
      </p>

      <div className="flex max-w-prose gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(question)}
          placeholder="e.g. Which crossing takes 7-tonne vehicles?"
          className="w-full border-2 border-ink p-2"
        />
        <button
          onClick={() => ask(question)}
          disabled={busy || !question.trim()}
          className="shrink-0 bg-action px-5 py-2 font-bold text-white shadow-[0_2px_0_#003078] hover:bg-[#003078] disabled:opacity-50"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </div>

      <div className="flex max-w-prose flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            disabled={busy}
            className="border border-action px-3 py-1 text-sm text-action hover:bg-tint-blue disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="max-w-prose border-l-4 border-l-tint-red-ink bg-tint-red/40 p-4">
          {error}
        </div>
      )}

      {result &&
        (result.no_verified_intel ? (
          <div className="max-w-prose border-4 border-tint-amber-ink bg-tint-amber/60 p-5">
            <p className="font-bold">Honest gap — no verified intel</p>
            <p className="mt-2">{result.answer}</p>
            <p className="mt-3 text-sm text-muted">
              This is the product working as designed: nothing in the corridor
              brief covers it yet, and the next debrief that does will close
              the gap.
            </p>
          </div>
        ) : (
          <div className="max-w-prose border border-tint-grey p-5">
            <p>{result.answer}</p>
            {result.cited_ids.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-1 text-sm">
                <span className="mr-1 text-muted">Sources:</span>
                {result.cited_ids.map((id) => (
                  <Link
                    key={id}
                    href={`/brief#${id}`}
                    className="border border-action px-1.5 text-xs text-action hover:bg-tint-blue"
                  >
                    {id}
                  </Link>
                ))}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
