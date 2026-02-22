import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { publicUser, requireUser } from "@/lib/auth";
import { readDb, withDbMutation } from "@/lib/db";
import { plusDays, subscriptionStatus, subscriptionTier } from "@/lib/entitlements";

export const runtime = "nodejs";

const schema = z.object({
  tier: z.enum(["FREE", "PRO", "ELITE"]),
  action: z.enum(["upgrade", "downgrade", "cancel", "reactivate"]).default("upgrade"),
  userId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let actor;
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

  const isAdmin = actor.role === "ADMIN";
  const targetUserId = isAdmin ? (parse.data.userId ?? actor.id) : actor.id;

  await withDbMutation((db) => {
    const user = db.users.find((entry) => entry.id === targetUserId);
    if (!user) {
      throw new Error("NOT_FOUND");
    }

    if (!isAdmin && parse.data.userId && parse.data.userId !== actor.id) {
      throw new Error("FORBIDDEN");
    }

    const now = new Date();
    const statusBefore = subscriptionStatus(user);
    const tierBefore = subscriptionTier(user);

    user.subscriptionTier = parse.data.tier;

    if (parse.data.action === "cancel") {
      user.subscriptionStatus = "CANCELED";
      user.subscriptionCurrentPeriodEnd = plusDays(now, 1);
    } else if (parse.data.action === "reactivate") {
      user.subscriptionStatus = "ACTIVE";
      user.subscriptionCurrentPeriodEnd = plusDays(now, 30);
      user.trialEndsAt = undefined;
    } else {
      const isFree = parse.data.tier === "FREE";
      user.subscriptionStatus = isFree ? "ACTIVE" : "ACTIVE";
      user.subscriptionCurrentPeriodEnd = isFree ? plusDays(now, 3650) : plusDays(now, 30);
      user.trialEndsAt = undefined;
    }

    if (statusBefore === "TRIALING" && tierBefore === "FREE" && parse.data.tier !== "FREE") {
      user.trialEndsAt = undefined;
    }

    user.updatedAt = now.toISOString();
  });

  const db = await readDb(true);
  const target = db.users.find((entry) => entry.id === targetUserId);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    user: publicUser(target),
    subscription: {
      tier: subscriptionTier(target),
      status: subscriptionStatus(target),
      currentPeriodEnd: target.subscriptionCurrentPeriodEnd,
      trialEndsAt: target.trialEndsAt,
    },
  });
}
