// Citation validation for the generated checklist — the code half of "the
// model may rephrase, never invent". Items citing nothing that exists in the
// store are dropped and logged, never rendered.
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
}

export interface ValidatedChecklist {
  legs: ChecklistLeg[];
  dropped: Array<{ text: string; reason: string }>;
}

const ITEM_TYPES: ChecklistItemType[] = ["do", "carry", "instruct", "verify"];

export function validateChecklist(
  value: unknown,
  validIds: Set<string>,
): ValidatedChecklist {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray((value as { legs?: unknown }).legs)
  ) {
    throw new Error("Checklist output must be an object with a legs array");
  }

  const dropped: ValidatedChecklist["dropped"] = [];
  const legs: ChecklistLeg[] = [];

  for (const rawLeg of (value as { legs: unknown[] }).legs) {
    if (typeof rawLeg !== "object" || rawLeg === null) continue;
    const legRecord = rawLeg as Record<string, unknown>;
    const items: ChecklistItem[] = [];

    for (const rawItem of Array.isArray(legRecord.items) ? legRecord.items : []) {
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

    legs.push({
      leg: typeof legRecord.leg === "string" ? legRecord.leg : "",
      title: typeof legRecord.title === "string" ? legRecord.title : "",
      items,
    });
  }

  return { legs, dropped };
}
