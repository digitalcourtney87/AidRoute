# Test debriefs

Fictional operator accounts for pasting into **Debrief a trip**. Never present these as real evidence.

The rehearsed demo is canned and works offline. Everything else hits live extraction (needs an API key). Reset the demo between runs so merges do not stack.

---

## 1. Rehearsed demo (canned)

Watch: should return instantly with no API key. Corroborates FR-001, conflicts PL-004 (7t vs 5t), creates a new Polish-side registration-number claim.

```
Just back from our August run, two vans via the tunnel. The customs company tried to talk us into a bulk declaration again to save money — we insisted on line-by-line on the T1 after hearing what happened to another group, and we cleared the Polish side in about five hours, no issues. One thing though: the crossing we used told us the vehicle limit is 5 tonnes now, not 7 — the guard said it changed at the start of August. Also worth knowing: they've started asking for the recipient organisation's registration number at the Polish side, not just the Ukrainian side — we had it in the email thread luckily, but it wasn't on any checklist we'd seen.
```

## 2. Corroborate T1 itemisation

Watch: should corroborate FR-001 / FR-002 (itemise every T1 line; intermediary defaults to bulk). May also corroborate PL-006 (humanitarian queue, ~half day). No new threshold numbers, so PL-004 should be left alone.

```
Just back from the August run, two vans through the tunnel. Customs company asked again if we wanted a bulk total on the T1 because it's cheaper per line — we told them no, list every item separately, after what happened last time. No WDS, nothing extra. Polish side put us in the humanitarian queue not the lorry one and we were through in about half a day. Uneventful once the paperwork was right.
```

## 3. Name the unnamed crossing

Watch: seed PL-004 has a deliberate gap (crossing name not captured). This should create a new PL claim — or match PL-004 if the model hints it — naming Budomierz. 7t agrees with the existing threshold, so it should not conflict. Medyka still "wrong border" must not resurrect superseded PL-001.

```
August run. We used Budomierz this time — that's the third crossing people have been talking about, not Medyka (they still told a group ahead of us they were at the wrong border) and not Korczowa. Two vans well under the 7-tonne limit; it was on a board at the booth. Took maybe six hours with the paperwork in order. I'm writing the name down because it still wasn't on any checklist we'd been given.
```

## 4. Hearsay vs first-hand

Watch: first-hand — this crew stayed on the July crossing and cleared in four hours. Hearsay (must be `hearsay=true`) — another group said Medyka is taking aid vans again; lorries waiting three days. Should not upgrade anyone's confidence, and should not silently revive superseded PL-001.

```
We were through in about four hours on the same crossing we used in July, humanitarian queue, no drama. While we were filling up, a driver from another group said Medyka is letting aid vans through again as of this month — we didn't try it ourselves so I can't confirm. They also said the lorry queue was three days; I've never sat in that one, just repeating what they told us.
```

## 5. Opsec trap (omit identities)

Watch: extractor must omit the person's name, the destination city, and the future run date/load. Historical intel from this trip should survive: Ukraine-side pack (declaration, V5C, lead driver's passport), recipients still do their own declarations, acceptance letter needed chasing. Check the extracted claims for leaked identities.

```
Just back. Sarah drove the lead van. We're going again on the 25th of August with four vans of winter kit to Lviv. On this run the Ukraine side wanted the declaration, the vehicle V5C, and the lead driver's passport — we printed the pack in the UK and handed it over at the Polish border, same as last time. Recipients still do the declarations themselves; we had to chase the acceptance letter for two days after we arrived.
```

## 6. Medicines and dangerous goods

Watch: should corroborate or closely match GB-003 — check donated medicines against the UK controlled list, bin controlled items, decline oxygen concentrators as suspected dangerous goods (still uncertain). May also touch OFF-GB-002. Should not invent a classification the operator didn't claim.

```
Before we left GB we went through every donated medicine against the UK controlled list and binned two items that were on it. The rest travelled. Someone offered us oxygen concentrators again and I said no — I'm still pretty sure those count as dangerous goods, but I'm not certain, so flag that if anyone actually knows. Nothing else unusual at the UK-France crossing; T1 and GMR were already in the email thread with the customs company.
```

## 7. Border agency workaround

Watch: should corroborate PL-005 (agency at the Polish border, system down, duty manager telephoned the guard). Must stay a reported escalation path, not a recommended procedure. One-off anecdote — confidence should stay medium.

```
Agency right at the Polish border had their computer system down again. We had the paperwork, they just couldn't see it. Duty manager rang the border guard and they let us through after a couple of hours sitting there. Worked, but I wouldn't want anyone relying on that as the plan — it felt like a one-off favour.
```

## 8. New GB practice (paper GMR)

Watch: new GB_EXIT claim — paper GMR required at the UK–France crossing, not just on the phone. Rest of the pack (T1, V5C, tunnel tickets) should corroborate GB-002 rather than duplicate it. Good check that distinct facts are not merged into one claim.

```
New one at the UK-France crossing this August: they wanted the GMR printed on paper, not just on the phone. First time I've been asked for a hard copy. Rest of the pack was the usual — T1, vehicle V5C, tunnel tickets, and whatever else is in that long email with the customs company. Once they had the printout we were waved on.
```

## 9. Ukraine document pack

Watch: should corroborate UA-001 (recipients make the declarations; they need item and vehicle info; request/acceptance letters need chasing) and UA-002 (organiser hands the printed pack to drivers at the Polish border; advance email to the Polish border is advisable).

```
Same drill on the Ukraine side as July. Recipients do the declarations, not us — they needed the item list and the vehicle details from us before they could file. We still had to chase the request-letter registration on the way out and the acceptance letter after delivery. I flew to Poland, printed the Ukraine pack in the UK (declaration, V5C, lead driver's passport), and handed it to the drivers at the Polish border. Also sent the email to the Polish border in advance; they seemed to expect it.
```

## 10. Supersede T1 rule (October)

Watch: FR-001 last verified July 2026. An October bulk-T1-accepted report is more than 60 days newer, so if extraction marks it as contradicting FR-001 the merge should supersede (not conflict). Dated in the future relative to today — that is intentional, to hit the supersede window.

```
Back from the October run. Big change on the T1: they accepted a bulk total this time — we didn't itemise every line and nobody asked for a WDS. Two vans, Polish side in about three hours. Completely different from the summer, so I'm flagging it.
```

## 11. Messy dictation

Watch: voice-style transcript — repetitions, missing punctuation, mid-sentence corrections. Extractor should still split distinct facts (itemised T1, 7t limit still posted, advance email to the Polish border) and not invent a crossing name that wasn't said.

```
yeah so um just back from the august run two vans tunnel again customs wanted bulk on the T1 no we said itemise every line like last time and that that worked polish side about five hours maybe the board still said seven tonnes not five we didn't catch the name of the crossing sorry and uh we did email the polish border the docs in advance they asked for that at the booth so worth doing
```

## 12. Uneventful (no intel)

Watch: no procedural facts. Expect zero extracted claims and "0 intel items processed" — not an error. If the model forces a vague "trip went well" claim, that is a prompt miss to note.

```
Thanks — trip was uneventful. Drivers were great, weather was fine, nothing to report on the paperwork or the crossings.
```
