// The public deployment runs the rehearsed demo only (docs/adr/0005): no key,
// no live model calls, no running cost. Live calls are an explicit opt-in —
// the flag AND a key — so a key re-added to Vercel by accident cannot quietly
// reopen spend. Server-side only; never bundled into the client.
export function isLiveLlmEnabled(): boolean {
  return (
    process.env.AIDROUTE_LIVE_LLM === "on" &&
    Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

// Demo-mode copy for the §3.2 response contract. Every message names the
// rehearsed path that does work — a dead end with no way forward is the one
// thing a guided demo cannot afford.
export const DEMO_ONLY_EXTRACT_MESSAGE =
  "Live extraction is switched off in this public demo. Load the sample debrief to see how it works.";

export const DEMO_ONLY_ASK_MESSAGE =
  "Free-typed questions are switched off in this public demo. Try one of the suggested questions.";

export const DEMO_ONLY_CHECKLIST_MESSAGE =
  "This section is built from the merged brief. Run the sample debrief first.";
