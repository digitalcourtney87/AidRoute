import { describe, expect, it } from "vitest";
import { formatStoreDate } from "@/lib/format";

describe("formatStoreDate", () => {
  it("renders YYYY-MM-DD as day month year", () => {
    expect(formatStoreDate("2026-08-14")).toBe("14 Aug 2026");
  });

  it("renders YYYY-MM as month year", () => {
    expect(formatStoreDate("2026-07")).toBe("Jul 2026");
  });

  it("passes through unknown formats untouched", () => {
    expect(formatStoreDate("unknown")).toBe("unknown");
  });
});
