import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { featureSnapshot, subscriptionStatus, subscriptionTier } from "@/lib/entitlements";

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
    features: featureSnapshot(user),
  });
}
