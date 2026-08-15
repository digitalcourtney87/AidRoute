# Verbatim capture with a 30-day retention window

This repo's principles say research participants stay anonymous and we never
hold forward-looking convoy movements or identities — yet the capture trail
(`debriefs`, `ask_logs`) stores raw operator and asker text verbatim, which in
practice will contain names, travel dates, and forward-looking details. We
decided to store it anyway, bounded hard: raw debrief text is nulled and ask
rows are deleted after 30 days (`apply_retention()`, pg_cron), the tables are
service-role-only (RLS deny-all) and never rendered by any UI, and no request
metadata (IPs, user agents, identities) is ever captured alongside.

## Why not the alternatives

Storing nothing (derived-only) would forfeit re-extraction when prompts
improve and the gap-analysis signal from unanswered Ask questions — the
product's collection-tasking loop. Storing verbatim indefinitely would
accumulate exactly the identity-and-movement archive the principles forbid; a
breach or legal request would expose it, and stored data can't be un-leaked.
The 30-day window keeps the operational value while guaranteeing the corpus
of raw speech never grows unboundedly. The truthful sentence this buys:
"raw debriefs are deleted after 30 days; only anonymised, structured claims
persist."

## Consequences

Anything needing raw text — re-extraction, ask-question gap review — must
happen within 30 days of capture. Extending the window, adding metadata, or
rendering these tables anywhere is a revisit of this ADR, not a tweak.
