export type FreshnessLevel = "green" | "amber" | "red";

export interface Freshness {
  level: FreshnessLevel;
  daysSince: number;
  note?: "treat as unconfirmed" | "stale";
}

// Dates in the store are YYYY-MM or YYYY-MM-DD. A bare month is read as its
// first day, so a claim never looks fresher than the evidence supports.
export function parseStoreDate(value: string): Date {
  const iso = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  return new Date(`${iso}T00:00:00Z`);
}

const MS_PER_DAY = 86_400_000;

export function freshness(lastVerified: string, now: Date = new Date()): Freshness {
  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - parseStoreDate(lastVerified).getTime()) / MS_PER_DAY),
  );
  if (daysSince <= 30) return { level: "green", daysSince };
  if (daysSince <= 90) return { level: "amber", daysSince, note: "treat as unconfirmed" };
  return { level: "red", daysSince, note: "stale" };
}
