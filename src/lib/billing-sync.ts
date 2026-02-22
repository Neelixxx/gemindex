import type Stripe from "stripe";

import { readDb, withDbMutation } from "./db";
import {
  appStatusFromStripeStatus,
  subscriptionPrimaryPriceId,
  tierFromStripePriceId,
  unixToIso,
} from "./stripe";
import type { UserRecord } from "./types";

type SyncTarget = {
  userId?: string;
  customerId?: string;
  email?: string;
};

export async function syncUserFromStripeSubscription(
  subscription: Stripe.Subscription,
  target?: SyncTarget,
): Promise<UserRecord | null> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const subscriptionId = subscription.id;
  const mappedStatus = appStatusFromStripeStatus(subscription.status);
  const priceId = subscriptionPrimaryPriceId(subscription);
  const mappedTier = tierFromStripePriceId(priceId);
  const currentPeriodEnd = subscription.items.data[0]?.current_period_end;

  let resolvedUserId: string | null = null;

  await withDbMutation((db) => {
    const user =
      (target?.userId && db.users.find((entry) => entry.id === target.userId)) ||
      (customerId && db.users.find((entry) => entry.stripeCustomerId === customerId)) ||
      db.users.find((entry) => entry.stripeSubscriptionId === subscriptionId) ||
      (target?.email &&
        db.users.find((entry) => entry.email.toLowerCase() === target.email?.toLowerCase()));

    if (!user) {
      return;
    }

    user.stripeCustomerId = customerId ?? user.stripeCustomerId;
    user.stripeSubscriptionId = subscriptionId;
    user.subscriptionStatus = mappedStatus;
    user.subscriptionTier =
      mappedStatus === "CANCELED" ? "FREE" : mappedTier ?? user.subscriptionTier ?? "FREE";
    user.subscriptionCurrentPeriodEnd = unixToIso(currentPeriodEnd);
    user.trialEndsAt = unixToIso(subscription.trial_end);
    user.updatedAt = new Date().toISOString();

    resolvedUserId = user.id;
  });

  if (!resolvedUserId) {
    return null;
  }

  const db = await readDb(true);
  return db.users.find((entry) => entry.id === resolvedUserId) ?? null;
}

export async function attachStripeCustomerToUser(
  userId: string,
  customerId: string,
): Promise<void> {
  await withDbMutation((db) => {
    const user = db.users.find((entry) => entry.id === userId);
    if (!user) {
      return;
    }
    user.stripeCustomerId = customerId;
    user.updatedAt = new Date().toISOString();
  });
}
