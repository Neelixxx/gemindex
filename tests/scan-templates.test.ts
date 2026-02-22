import { describe, expect, it } from "vitest";

import { findSealedDetailsFromScan, findSlabDetailsFromScan } from "../src/lib/scan";

describe("scan templates", () => {
  it("detects slab grader and grade from label text", () => {
    const slab = findSlabDetailsFromScan("PSA GEM MINT 10 Charizard 4/102 UPC 123456789012");
    expect(slab.grader).toBe("PSA");
    expect(slab.grade).toBe(10);
    expect(slab.barcode).toBe("123456789012");
  });

  it("detects sealed product type from label keywords", () => {
    const sealed = findSealedDetailsFromScan("Scarlet and Violet Elite Trainer Box Pokemon");
    expect(sealed).toBeTruthy();
    expect(sealed?.productType).toBe("ELITE_TRAINER_BOX");
  });
});
