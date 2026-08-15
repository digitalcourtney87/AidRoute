// Canned demo fixtures per handoff §Demo reliability: known demo inputs are
// served frozen, pre-verified responses instantly; the live LLM path exists
// for unrehearsed input only. Files are read per-request (they're tiny) so a
// freshly frozen fixture needs no server restart in production.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ChecklistLeg } from "./checklist";
import type { ExtractedClaim, OperatorClaim } from "./types";

const CANNED_DIR = path.join(process.cwd(), "data", "canned");

interface ExtractionFixture {
  input_startswith: string;
  extracted: ExtractedClaim[];
}

interface ChecklistFixture {
  store_fingerprint: string;
  legs: ChecklistLeg[];
}

function loadJson<T>(file: string): T | null {
  const p = path.join(CANNED_DIR, file);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

// State identity for the checklist fixture: the canned checklist only serves
// when the store is exactly the post-demo-merge state it was frozen against.
export function storeFingerprint(claims: OperatorClaim[]): string {
  return claims
    .map((c) => `${c.id}:${c.status}:${c.n_reports}`)
    .sort()
    .join("|");
}

export function getCannedExtraction(text: string): ExtractedClaim[] | null {
  const fixture = loadJson<ExtractionFixture>("extraction.json");
  if (!fixture) return null;
  return text.trim().startsWith(fixture.input_startswith)
    ? fixture.extracted
    : null;
}

interface AskFixture {
  answers: Array<{
    question: string;
    answer: string;
    cited_ids: string[];
    no_verified_intel: boolean;
  }>;
}

// Ask fixtures match on the exact (trimmed, case-insensitive) question — the
// three suggested chips send these verbatim. Store-state independent.
export function getCannedAsk(question: string) {
  const fixture = loadJson<AskFixture>("ask.json");
  if (!fixture) return null;
  const q = question.trim().toLowerCase();
  return (
    fixture.answers.find((a) => a.question.trim().toLowerCase() === q) ?? null
  );
}

export function getCannedChecklist(
  claims: OperatorClaim[],
): ChecklistLeg[] | null {
  const fixture = loadJson<ChecklistFixture>("checklist.json");
  if (!fixture) return null;
  return storeFingerprint(claims) === fixture.store_fingerprint
    ? fixture.legs
    : null;
}
