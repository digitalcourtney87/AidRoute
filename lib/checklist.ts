// Citation validation for the generated checklist — the code half of "the
// model may rephrase, never invent". Items citing nothing that exists in the
// store are dropped and logged, never rendered. Generation is per-leg
// (docs/adr/0004), so the validator checks one leg's section at a time.
import type { Leg } from "./types";

export type ChecklistItemType = "do" | "carry" | "instruct" | "verify";

export interface ChecklistItem {
  text: string;
  type: ChecklistItemType;
  source_ids: string[];
}

export interface ChecklistLeg {
  leg: Leg | string;
  title: string;
  items: ChecklistItem[];
  // True when the leg had no active claims or rules, so no model call was
  // made — the UI renders an honest gap, never a guess.
  gap?: boolean;
}

export interface ValidatedChecklistLeg {
  section: ChecklistLeg;
  dropped: Array<{ text: string; reason: string }>;
}

const ITEM_TYPES: ChecklistItemType[] = ["do", "carry", "instruct", "verify"];

// Validates one leg's model output. The leg is pinned by the caller — a
// section claiming to be for a different leg is corrected, not trusted.
export function validateChecklistLeg(
  value: unknown,
  leg: Leg,
  validIds: Set<string>,
): ValidatedChecklistLeg {
  if (typeof value !== "object" || value === null) {
    throw new Error("Checklist leg output must be an object");
  }
  const record = value as Record<string, unknown>;
  const dropped: ValidatedChecklistLeg["dropped"] = [];
  const items: ChecklistItem[] = [];

  for (const rawItem of Array.isArray(record.items) ? record.items : []) {
    if (typeof rawItem !== "object" || rawItem === null) continue;
    const item = rawItem as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) continue;

    if (
      typeof item.type !== "string" ||
      !ITEM_TYPES.includes(item.type as ChecklistItemType)
    ) {
      dropped.push({ text, reason: `unknown item type "${String(item.type)}"` });
      continue;
    }

    const cited = Array.isArray(item.source_ids)
      ? item.source_ids.filter(
          (id): id is string => typeof id === "string" && validIds.has(id),
        )
      : [];
    if (cited.length === 0) {
      dropped.push({
        text,
        reason: "cites no source that exists in the store",
      });
      continue;
    }

    items.push({ text, type: item.type as ChecklistItemType, source_ids: cited });
  }

  return {
    section: {
      leg,
      title: typeof record.title === "string" ? record.title : "",
      items,
    },
    dropped,
  };
}
