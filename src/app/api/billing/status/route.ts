import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { featureSnapshot, subscriptionStatus, subscriptionTier } from "@/lib/entitlements";
import { stripeConfigured, stripePricesConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    subscription: {
      tier: subscriptionTier(user),
      status: subscriptionStatus(user),
      currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      trialEndsAt: user.trialEndsAt,
    },
    provider: stripeConfigured() && stripePricesConfigured() ? "STRIPE" : "MANUAL",
    features: featureSnapshot(user),
  });
}
