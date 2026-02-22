import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "../src/lib/rate-limit";

describe("rate-limit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks requests over the limit until the window resets", () => {
    const now = vi.spyOn(Date, "now");
    const key = `login:test:${Math.random().toString(36).slice(2)}`;

    now.mockReturnValue(1_000);
    expect(
      checkRateLimit({
        key,
        limit: 2,
        windowMs: 1_000,
      }).allowed,
    ).toBe(true);
    expect(
      checkRateLimit({
        key,
        limit: 2,
        windowMs: 1_000,
      }).allowed,
    ).toBe(true);

    now.mockReturnValue(1_500);
    const blocked = checkRateLimit({
      key,
      limit: 2,
      windowMs: 1_000,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    now.mockReturnValue(2_100);
    const reset = checkRateLimit({
      key,
      limit: 2,
      windowMs: 1_000,
    });
    expect(reset.allowed).toBe(true);
  });
});
