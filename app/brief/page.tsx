import { formatStoreDate } from "@/lib/format";
import { freshness } from "@/lib/freshness";
import { getState } from "@/lib/store";
import type { Leg, OfficialRule, OperatorClaim, Status } from "@/lib/types";
import { LEGS_IN_JOURNEY_ORDER } from "@/lib/types";

// The brief must always reflect the live in-memory store, never a build-time
// snapshot — merges from Screen 1 have to show up here immediately.
export const dynamic = "force-dynamic";

const LEG_TITLES: Record<Leg, string> = {
  GB_EXIT: "Great Britain — exit",
  FR_TRANSIT: "France — transit",
  PL_ENTRY: "Poland — entry",
  UA_ENTRY: "Ukraine — entry",
};

const STATUS_TAGS: Record<Status, { label: string; className: string }> = {
  corroborated: { label: "CORROBORATED", className: "bg-tint-green text-tint-green-ink" },
  single_report: { label: "SINGLE REPORT", className: "bg-tint-blue text-tint-blue-ink" },
  conflicting: { label: "CONFLICTING", className: "bg-tint-red text-tint-red-ink" },
  superseded: { label: "SUPERSEDED", className: "bg-tint-grey text-tint-grey-ink" },
};

const DOT_CLASSES = {
  green: "bg-tint-green-ink",
  amber: "bg-[#f47738]",
  red: "bg-tint-red-ink",
} as const;

function StatusTag({ status }: { status: Status }) {
  const tag = STATUS_TAGS[status];
  return (
    <span className={`px-2 py-0.5 text-xs font-bold tracking-wide ${tag.className}`}>
      {tag.label}
    </span>
  );
}

function FreshnessDot({ lastVerified }: { lastVerified: string }) {
  const f = freshness(lastVerified);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${DOT_CLASSES[f.level]}`}
        aria-hidden
      />
      last verified {formatStoreDate(lastVerified)}
      {f.note && <em className="text-tint-red-ink">— {f.note}</em>}
    </span>
  );
}

function sourceLine(item: OperatorClaim | OfficialRule): string {
  if (item.source_class === "official") {
    return `Official — ${item.authority}, checked ${formatStoreDate(item.last_verified)}`;
  }
  return `Operator-reported — ${item.n_reports} report${item.n_reports === 1 ? "" : "s"}, last verified ${formatStoreDate(item.last_verified)}`;
}

function ClaimDetail({ claim }: { claim: OperatorClaim }) {
  return (
    <div className="mt-2 space-y-2 text-sm">
      {Object.entries(claim.entities).length > 0 && (
        <p>
          <span className="font-bold">Entities:</span>{" "}
          {Object.entries(claim.entities)
            .map(([key, values]) => `${key}: ${values.join("; ")}`)
            .join(" · ")}
        </p>
      )}
      {claim.verbatim_quote && (
        <blockquote className="border-l-4 border-tint-grey pl-3 italic">
          “{claim.verbatim_quote}”
        </blockquote>
      )}
      {claim.notes && (
        <p>
          <span className="font-bold">Notes:</span> {claim.notes}
        </p>
      )}
      {claim.superseded_by && (
        <p>
          <span className="font-bold">Superseded by:</span> {claim.superseded_by}
        </p>
      )}
    </div>
  );
}

function OperatorClaimCard({ claim }: { claim: OperatorClaim }) {
  return (
    <div className="border border-tint-grey p-4" id={claim.id}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag status={claim.status} />
        <span className="text-xs text-muted">{claim.id}</span>
        <FreshnessDot lastVerified={claim.last_verified} />
      </div>
      <p className="mt-2">{claim.claim}</p>
      <p className="mt-1 text-sm text-muted">{sourceLine(claim)}</p>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-action">Detail</summary>
        <ClaimDetail claim={claim} />
      </details>
    </div>
  );
}

function SupersededCard({ claim }: { claim: OperatorClaim }) {
  return (
    <details className="border border-tint-grey bg-tint-grey/30 p-4" id={claim.id}>
      <summary className="cursor-pointer">
        <span className="mr-2 inline-block align-middle">
          <StatusTag status={claim.status} />
        </span>
        <span className="text-muted line-through">{claim.claim}</span>
      </summary>
      <p className="mt-2 text-sm text-muted">{sourceLine(claim)}</p>
      <ClaimDetail claim={claim} />
    </details>
  );
}

function OfficialRuleCard({ rule }: { rule: OfficialRule }) {
  return (
    <div className="border border-tint-grey p-4" id={rule.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-ink px-2 py-0.5 text-xs font-bold tracking-wide text-white">
          OFFICIAL
        </span>
        <span className="text-xs text-muted">{rule.id}</span>
        <FreshnessDot lastVerified={rule.last_verified} />
      </div>
      <p className="mt-2">{rule.claim}</p>
      <p className="mt-1 text-sm text-muted">{sourceLine(rule)}</p>
      {rule.notes && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer text-action">Detail</summary>
          <p className="mt-2">{rule.notes}</p>
        </details>
      )}
    </div>
  );
}

// Conflicting claims cluster via conflicts_with (union of linked ids), so a
// three-way disagreement renders as one container, not orphan pairs.
function conflictClusters(claims: OperatorClaim[]): OperatorClaim[][] {
  const conflicting = claims.filter((c) => c.status === "conflicting");
  const seen = new Set<string>();
  const clusters: OperatorClaim[][] = [];
  for (const claim of conflicting) {
    if (seen.has(claim.id)) continue;
    const cluster: OperatorClaim[] = [];
    const queue = [claim.id];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const member = conflicting.find((c) => c.id === id);
      if (!member) continue;
      cluster.push(member);
      queue.push(...(member.conflicts_with ?? []));
    }
    if (cluster.length > 0) clusters.push(cluster);
  }
  return clusters;
}

export default function BriefPage() {
  const { claims, rules } = getState();

  const gaps = claims.filter(
    (c) =>
      c.status !== "superseded" &&
      Object.values(c.entities)
        .flat()
        .some((value) => value.toUpperCase().includes("VERIFY")),
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold">
          Corridor brief: GB → France → Poland → Ukraine
        </h1>
        <p className="mt-2 max-w-prose text-muted">
          Every statement below is dated and sourced — official guidance or
          operator-reported, with report counts and freshness. Honest gaps are
          flagged, not papered over.
        </p>
      </div>

      {gaps.length > 0 && (
        <aside className="max-w-prose border-l-4 border-l-tint-amber-ink bg-tint-amber/50 p-4">
          <h2 className="font-bold">Known gaps — verify next</h2>
          <ul className="mt-1 list-inside list-disc text-sm">
            {gaps.map((claim) => (
              <li key={claim.id}>
                <a href={`#${claim.id}`} className="text-action underline">
                  {claim.id}
                </a>{" "}
                — {claim.claim.slice(0, 100)}…
              </li>
            ))}
          </ul>
        </aside>
      )}

      {LEGS_IN_JOURNEY_ORDER.map((leg) => {
        const legRules = rules.filter((r) => r.leg === leg);
        const legClaims = claims.filter((c) => c.leg === leg);
        const clusters = conflictClusters(legClaims);
        const clustered = new Set(clusters.flat().map((c) => c.id));
        const active = legClaims.filter(
          (c) => c.status !== "superseded" && !clustered.has(c.id),
        );
        const superseded = legClaims.filter((c) => c.status === "superseded");

        return (
          <section key={leg} className="space-y-3">
            <h2 className="border-b-2 border-ink pb-1 text-2xl font-bold">
              {LEG_TITLES[leg]}
            </h2>

            {clusters.map((cluster) => (
              <div
                key={cluster[0].id}
                className="border-4 border-tint-red-ink p-4"
              >
                <h3 className="font-bold text-tint-red-ink">
                  Conflicting reports — verify before travel
                </h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {cluster.map((claim) => (
                    <OperatorClaimCard key={claim.id} claim={claim} />
                  ))}
                </div>
              </div>
            ))}

            {legRules.map((rule) => (
              <OfficialRuleCard key={rule.id} rule={rule} />
            ))}
            {active.map((claim) => (
              <OperatorClaimCard key={claim.id} claim={claim} />
            ))}
            {superseded.map((claim) => (
              <SupersededCard key={claim.id} claim={claim} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
