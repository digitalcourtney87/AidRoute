// Journey Span (CONTEXT.md): the operator-declared extent of one trip — a
// start point and destination selecting a contiguous run of the corridor's
// legs. Starting inside a country skips that country's entry leg, so
// Poland→Poland selects no legs and is invalid.
import { LEGS_IN_JOURNEY_ORDER, type Leg } from "./types";

export type StartPoint = "UK" | "FR" | "PL";
export type Destination = "PL" | "UA";

export const START_POINTS: Array<{ value: StartPoint; label: string }> = [
  { value: "UK", label: "United Kingdom" },
  { value: "FR", label: "France" },
  { value: "PL", label: "Poland" },
];

export const DESTINATIONS: Array<{ value: Destination; label: string }> = [
  { value: "PL", label: "Poland" },
  { value: "UA", label: "Ukraine" },
];

// Index of the first leg each start point still faces. Starting in France
// keeps FR_TRANSIT (you transit France regardless of where you began);
// starting in Poland skips PL_ENTRY (there is no border left to clear).
const FIRST_LEG_INDEX: Record<StartPoint, number> = {
  UK: LEGS_IN_JOURNEY_ORDER.indexOf("GB_EXIT"),
  FR: LEGS_IN_JOURNEY_ORDER.indexOf("FR_TRANSIT"),
  PL: LEGS_IN_JOURNEY_ORDER.indexOf("UA_ENTRY"),
};

const LAST_LEG_INDEX: Record<Destination, number> = {
  PL: LEGS_IN_JOURNEY_ORDER.indexOf("PL_ENTRY"),
  UA: LEGS_IN_JOURNEY_ORDER.indexOf("UA_ENTRY"),
};

// The contiguous leg span for a start/destination pair, in journey order.
// Empty means the pair is invalid (Poland→Poland) — callers must treat an
// empty span as unselectable, never as "generate nothing".
export function legsForSpan(start: StartPoint, destination: Destination): Leg[] {
  const first = FIRST_LEG_INDEX[start];
  const last = LAST_LEG_INDEX[destination];
  return first > last ? [] : LEGS_IN_JOURNEY_ORDER.slice(first, last + 1);
}

// Fallback section titles for legs rendered without a model call (honest-gap
// sections). Mirrors the brief page's leg headings.
export const LEG_TITLES: Record<Leg, string> = {
  GB_EXIT: "Great Britain — exit",
  FR_TRANSIT: "France — transit",
  PL_ENTRY: "Poland — entry",
  UA_ENTRY: "Ukraine — entry",
};
