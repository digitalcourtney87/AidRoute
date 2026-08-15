import { describe, expect, it } from "vitest";
import {
  isStoreFailure,
  publicErrorMessage,
  STORE_UNAVAILABLE_MESSAGE,
} from "@/lib/store-errors";

describe("store error copy", () => {
  it("classifies RPC and header failures as store failures", () => {
    expect(
      isStoreFailure(new Error("get_corridor_state failed: boom")),
    ).toBe(true);
    expect(
      isStoreFailure(
        new Error('Headers.set: "token" is an invalid header value.'),
      ),
    ).toBe(true);
    expect(isStoreFailure(new Error("model output was not JSON"))).toBe(false);
  });

  it("does not tell the operator to rephrase a store outage", () => {
    const message = publicErrorMessage(
      new Error("get_corridor_state failed: boom"),
      "Check the connection and try again — or rephrase the account.",
    );
    expect(message).toBe(STORE_UNAVAILABLE_MESSAGE);
    expect(message).not.toMatch(/rephrase/i);
  });
});
