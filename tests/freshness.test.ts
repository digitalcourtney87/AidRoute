import { describe, expect, it } from "vitest";
import { freshness, parseStoreDate } from "@/lib/freshness";

const NOW = new Date("2026-08-15T12:00:00Z");

describe("parseStoreDate", () => {
  it("reads YYYY-MM as the first of the month", () => {
    expect(parseStoreDate("2026-07").toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("reads YYYY-MM-DD as that day", () => {
    expect(parseStoreDate("2026-08-14").toISOString()).toBe(
      "2026-08-14T00:00:00.000Z",
    );
  });
});

describe("freshness decay", () => {
  it("≤30 days is green with no warning", () => {
    expect(freshness("2026-08-14", NOW)).toEqual({ level: "green", daysSince: 1 });
    expect(freshness("2026-07-16", NOW).level).toBe("green");
  });

  it("31–90 days is amber: treat as unconfirmed", () => {
    const f = freshness("2026-07-01", NOW);
    expect(f.level).toBe("amber");
    expect(f.note).toBe("treat as unconfirmed");
  });

  it(">90 days is red: stale", () => {
    const f = freshness("2026-04-01", NOW);
    expect(f.level).toBe("red");
    expect(f.note).toBe("stale");
  });

  it("never returns negative days for same-day verification", () => {
    expect(freshness("2026-08-15", NOW).daysSince).toBe(0);
  });
});
