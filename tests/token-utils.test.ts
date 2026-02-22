import { describe, expect, it } from "vitest";

import { addMinutes, createOpaqueToken, hashOpaqueToken } from "../src/lib/token-utils";

describe("token-utils", () => {
  it("creates opaque tokens with entropy", () => {
    const a = createOpaqueToken();
    const b = createOpaqueToken();

    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
    expect(b.length).toBeGreaterThan(20);
  });

  it("hashes opaque tokens consistently", () => {
    const token = "abc123";
    const hash = hashOpaqueToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
    expect(hashOpaqueToken(token)).toBe(hash);
  });

  it("adds minutes to a date", () => {
    const base = new Date("2026-02-22T12:00:00.000Z");
    const out = addMinutes(base, 30);

    expect(out).toBe("2026-02-22T12:30:00.000Z");
  });
});
