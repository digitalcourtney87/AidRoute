import { getState } from "@/lib/store";

// The brief must always reflect the live in-memory store, never a build-time
// snapshot — merges from Screen 1 have to show up here immediately.
export const dynamic = "force-dynamic";

export default function BriefPage() {
  const { claims, rules } = getState();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">
        Corridor brief: GB → France → Poland → Ukraine
      </h1>
      <p className="max-w-prose text-muted">
        Store loaded: {rules.length} official rules and {claims.length}{" "}
        operator-reported claims. Full leg-by-leg rendering lands with the
        corridor-brief ticket — this is the scaffold stub.
      </p>
    </div>
  );
}
