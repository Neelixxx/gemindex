import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { attachStripeCustomerToUser } from "@/lib/billing-sync";
import { readDb } from "@/lib/db";
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
  tier: z.enum(["PRO", "ELITE"]),
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

async function ensureStripeCustomer(user: UserRecord): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripeClient().customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });
  await attachStripeCustomerToUser(user.id, customer.id);
  return customer.id;
}

export async function POST(request: NextRequest) {
  let actor: UserRecord;
  try {
    actor = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripeConfigured() || !stripePricesConfigured()) {
    return NextResponse.json(
      { error: "Stripe billing is not fully configured in this environment." },
      { status: 503 },
    );
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

  try {
    const customerId = await ensureStripeCustomer(targetUser);
    const priceId = priceIdForTier(parse.data.tier);
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${billingBaseUrl()}/?billing=success`,
      cancel_url: `${billingBaseUrl()}/?billing=cancel`,
      metadata: {
        userId: targetUser.id,
        tier: parse.data.tier,
      },
      subscription_data: {
        metadata: {
          userId: targetUser.id,
          tier: parse.data.tier,
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
      { error: error instanceof Error ? error.message : "Could not create checkout session." },
      { status: 500 },
    );
  }
}
