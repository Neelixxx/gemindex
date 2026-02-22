import { NextRequest, NextResponse } from "next/server";

import { cleanupAuthTokens } from "@/lib/account-recovery";
import { getAuthenticatedUser, publicUser } from "@/lib/auth";
import { ensureSchedulerStarted } from "@/lib/scheduler";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ensureSchedulerStarted();
  await cleanupAuthTokens();

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: publicUser(user) });
}
