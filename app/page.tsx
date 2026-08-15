export default function DebriefPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Debrief a trip</h1>
      <p className="max-w-prose text-muted">
        Just back from a run? Five minutes here makes the next convoy&apos;s
        checklist better. Extraction and merge land with the Screen 1 ticket —
        this is the scaffold stub.
      </p>
      <textarea
        rows={12}
        disabled
        className="w-full max-w-prose border-2 border-ink p-3"
        placeholder="Tell us about the trip — which crossing, what they asked for, what surprised you…"
      />
    </div>
  );
}
