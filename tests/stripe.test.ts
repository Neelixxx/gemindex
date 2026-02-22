import { afterEach, describe, expect, it } from "vitest";

import {
  appStatusFromStripeStatus,
  tierFromStripePriceId,
} from "../src/lib/stripe";

describe("stripe helpers", () => {
  const originalPro = process.env.STRIPE_PRICE_PRO_MONTHLY;
  const originalElite = process.env.STRIPE_PRICE_ELITE_MONTHLY;

  afterEach(() => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = originalPro;
    process.env.STRIPE_PRICE_ELITE_MONTHLY = originalElite;
  });

  it("maps stripe statuses to app statuses", () => {
    expect(appStatusFromStripeStatus("trialing")).toBe("TRIALING");
    expect(appStatusFromStripeStatus("active")).toBe("ACTIVE");
    expect(appStatusFromStripeStatus("past_due")).toBe("PAST_DUE");
    expect(appStatusFromStripeStatus("unpaid")).toBe("PAST_DUE");
    expect(appStatusFromStripeStatus("canceled")).toBe("CANCELED");
  });

  it("resolves app tier from Stripe price ids", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_123";
    process.env.STRIPE_PRICE_ELITE_MONTHLY = "price_elite_123";

    expect(tierFromStripePriceId("price_pro_123")).toBe("PRO");
    expect(tierFromStripePriceId("price_elite_123")).toBe("ELITE");
    expect(tierFromStripePriceId("price_other")).toBeNull();
  });
});
