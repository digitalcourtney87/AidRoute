// The rehearsed scenario's debrief text, for the "Use the sample debrief"
// button on /. Held as a literal rather than imported from
// data/seed-data.json so the client bundle carries one paragraph instead of
// the whole seed file. FICTIONAL and anonymised, like the rest of the seed.
//
// It must stay byte-identical to seed-data.json → demo_debrief_2.raw_text:
// the canned extraction is frozen against this exact text, and one character
// of drift sends the guided path off the rehearsed route.
// tests/demo-sample.test.ts pins it.
export const SAMPLE_DEBRIEF =
  "Just back from our August run, two vans via the tunnel. The customs company tried to talk us into a bulk declaration again to save money — we insisted on line-by-line on the T1 after hearing what happened to another group, and we cleared the Polish side in about five hours, no issues. One thing though: the crossing we used told us the vehicle limit is 5 tonnes now, not 7 — the guard said it changed at the start of August. Also worth knowing: they've started asking for the recipient organisation's registration number at the Polish side, not just the Ukrainian side — we had it in the email thread luckily, but it wasn't on any checklist we'd seen.";
