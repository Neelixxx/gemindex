import Stripe from "stripe";

import type { SubscriptionStatus, SubscriptionTier } from "./types";

let stripeSingleton: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripePricesConfigured(): boolean {
  return Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY && process.env.STRIPE_PRICE_ELITE_MONTHLY);
}

export function stripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(secretKey);
  }

  return stripeSingleton;
}

export function billingBaseUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function stripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

export function priceIdForTier(tier: "PRO" | "ELITE"): string {
  const priceId =
    tier === "PRO"
      ? process.env.STRIPE_PRICE_PRO_MONTHLY
      : process.env.STRIPE_PRICE_ELITE_MONTHLY;

  if (!priceId) {
    throw new Error(
      `Stripe price id missing for ${tier}. Configure ${
        tier === "PRO" ? "STRIPE_PRICE_PRO_MONTHLY" : "STRIPE_PRICE_ELITE_MONTHLY"
      }.`,
    );
  }

  return priceId;
}

export function tierFromStripePriceId(priceId?: string | null): SubscriptionTier | null {
  if (!priceId) {
    return null;
  }
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) {
    return "PRO";
  }
  if (priceId === process.env.STRIPE_PRICE_ELITE_MONTHLY) {
    return "ELITE";
  }
  return null;
}

export function appStatusFromStripeStatus(status?: Stripe.Subscription.Status): SubscriptionStatus {
  if (!status) {
    return "CANCELED";
  }
  if (status === "trialing") {
    return "TRIALING";
  }
  if (status === "active") {
    return "ACTIVE";
  }
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return "PAST_DUE";
  }
  return "CANCELED";
}

export function unixToIso(seconds?: number | null): string | undefined {
  if (typeof seconds !== "number") {
    return undefined;
  }
  return new Date(seconds * 1000).toISOString();
}

export function subscriptionPrimaryPriceId(subscription: Stripe.Subscription): string | undefined {
  return subscription.items.data[0]?.price?.id;
}
