import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { publicUser, requireUser } from "@/lib/auth";
import { attachStripeCustomerToUser, syncUserFromStripeSubscription } from "@/lib/billing-sync";
import { readDb, withDbMutation } from "@/lib/db";
import { plusDays, subscriptionStatus, subscriptionTier } from "@/lib/entitlements";
import {
  billingBaseUrl,
  priceIdForTier,
  stripeClient,
  stripeConfigured,
  stripePricesConfigured,
} from "@/lib/stripe";
import type { UserRecord } from "@/lib/types";

export const runtime = "nodejs";

const schema = z.object({
  tier: z.enum(["FREE", "PRO", "ELITE"]),
  action: z.enum(["upgrade", "downgrade", "cancel", "reactivate"]).default("upgrade"),
  userId: z.string().optional(),
});

async function loadTargetUser(actor: UserRecord, requestedUserId?: string): Promise<UserRecord> {
  const isAdmin = actor.role === "ADMIN";
  const targetUserId = isAdmin ? (requestedUserId ?? actor.id) : actor.id;
  if (!isAdmin && requestedUserId && requestedUserId !== actor.id) {
    throw new Error("FORBIDDEN");
  }

  const db = await readDb();
  const target = db.users.find((entry) => entry.id === targetUserId);
  if (!target) {
    throw new Error("NOT_FOUND");
  }
  return target;
}

async function applyManualSubscriptionChange(
  targetUser: UserRecord,
  payload: z.infer<typeof schema>,
): Promise<UserRecord | null> {
  await withDbMutation((db) => {
    const user = db.users.find((entry) => entry.id === targetUser.id);
    if (!user) {
      return;
    }

    const now = new Date();
    const statusBefore = subscriptionStatus(user);
    const tierBefore = subscriptionTier(user);

    user.subscriptionTier = payload.tier;

    if (payload.action === "cancel") {
      user.subscriptionStatus = "CANCELED";
      user.subscriptionCurrentPeriodEnd = plusDays(now, 1);
    } else if (payload.action === "reactivate") {
      user.subscriptionStatus = "ACTIVE";
      user.subscriptionCurrentPeriodEnd = plusDays(now, 30);
      user.trialEndsAt = undefined;
    } else {
      const isFree = payload.tier === "FREE";
      user.subscriptionStatus = "ACTIVE";
      user.subscriptionCurrentPeriodEnd = isFree ? plusDays(now, 3650) : plusDays(now, 30);
      user.trialEndsAt = undefined;
    }

    if (statusBefore === "TRIALING" && tierBefore === "FREE" && payload.tier !== "FREE") {
      user.trialEndsAt = undefined;
    }

    user.updatedAt = now.toISOString();
  });

  const db = await readDb(true);
  return db.users.find((entry) => entry.id === targetUser.id) ?? null;
}

async function ensureStripeCustomer(targetUser: UserRecord): Promise<string> {
  if (targetUser.stripeCustomerId) {
    return targetUser.stripeCustomerId;
  }

  const customer = await stripeClient().customers.create({
    email: targetUser.email,
    name: targetUser.name,
    metadata: { userId: targetUser.id },
  });

  await attachStripeCustomerToUser(targetUser.id, customer.id);
  return customer.id;
}

export async function POST(request: NextRequest) {
  let actor: UserRecord;
  try {
    actor = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parse = schema.safeParse(json);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
  }

  let targetUser: UserRecord;
  try {
    targetUser = await loadTargetUser(actor, parse.data.userId);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (!stripeConfigured() || !stripePricesConfigured()) {
    const updated = await applyManualSubscriptionChange(targetUser, parse.data);
    if (!updated) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({
      mode: "manual",
      user: publicUser(updated),
      subscription: {
        tier: subscriptionTier(updated),
        status: subscriptionStatus(updated),
        currentPeriodEnd: updated.subscriptionCurrentPeriodEnd,
        trialEndsAt: updated.trialEndsAt,
      },
    });
  }

  try {
    if (parse.data.tier === "FREE" || parse.data.action === "cancel") {
      if (targetUser.stripeSubscriptionId) {
        const subscription = await stripeClient().subscriptions.update(
          targetUser.stripeSubscriptionId,
          {
            cancel_at_period_end: true,
          },
        );
        const updated = await syncUserFromStripeSubscription(subscription, {
          userId: targetUser.id,
          email: targetUser.email,
        });
        if (!updated) {
          return NextResponse.json({ error: "User not found." }, { status: 404 });
        }
        return NextResponse.json({
          user: publicUser(updated),
          subscription: {
            tier: subscriptionTier(updated),
            status: subscriptionStatus(updated),
            currentPeriodEnd: updated.subscriptionCurrentPeriodEnd,
            trialEndsAt: updated.trialEndsAt,
          },
        });
      }

      const updated = await applyManualSubscriptionChange(targetUser, {
        ...parse.data,
        tier: "FREE",
        action: "cancel",
      });
      if (!updated) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      return NextResponse.json({
        user: publicUser(updated),
        subscription: {
          tier: subscriptionTier(updated),
          status: subscriptionStatus(updated),
          currentPeriodEnd: updated.subscriptionCurrentPeriodEnd,
          trialEndsAt: updated.trialEndsAt,
        },
      });
    }

    const tier = parse.data.tier as "PRO" | "ELITE";
    const priceId = priceIdForTier(tier);

    if (targetUser.stripeSubscriptionId) {
      const existing = await stripeClient().subscriptions.retrieve(targetUser.stripeSubscriptionId);
      const existingItem = existing.items.data[0];
      if (!existingItem) {
        return NextResponse.json({ error: "Subscription line item missing." }, { status: 400 });
      }

      const updatedSubscription = await stripeClient().subscriptions.update(existing.id, {
        cancel_at_period_end: false,
        items: [{ id: existingItem.id, price: priceId }],
        proration_behavior: "create_prorations",
      });

      const updated = await syncUserFromStripeSubscription(updatedSubscription, {
        userId: targetUser.id,
        email: targetUser.email,
      });
      if (!updated) {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }

      return NextResponse.json({
        user: publicUser(updated),
        subscription: {
          tier: subscriptionTier(updated),
          status: subscriptionStatus(updated),
          currentPeriodEnd: updated.subscriptionCurrentPeriodEnd,
          trialEndsAt: updated.trialEndsAt,
        },
      });
    }

    const customerId = await ensureStripeCustomer(targetUser);
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${billingBaseUrl()}/?billing=success`,
      cancel_url: `${billingBaseUrl()}/?billing=cancel`,
      metadata: {
        userId: targetUser.id,
        tier,
      },
      subscription_data: {
        metadata: {
          userId: targetUser.id,
          tier,
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Billing update failed." },
      { status: 500 },
    );
  }
}
