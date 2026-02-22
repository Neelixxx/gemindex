import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { withDbMutation } from "@/lib/db";
import { buildOtpAuthUri, createTotpSecret, qrDataUrl } from "@/lib/totp";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let userId: string;
  let userEmail: string;

  try {
    const user = await requireAdmin(request);
    userId = user.id;
    userEmail = user.email;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = createTotpSecret();
  const otpauthUrl = buildOtpAuthUri({ userEmail, secret, issuer: "Gem Index" });
  const qr = await qrDataUrl(otpauthUrl);

  await withDbMutation((db) => {
    const user = db.users.find((entry) => entry.id === userId);
    if (!user) {
      return;
    }
    user.totpSecret = secret;
    user.totpEnabled = false;
    user.updatedAt = new Date().toISOString();
  });

  return NextResponse.json({
    otpauthUrl,
    qrDataUrl: qr,
    secret,
  });
}
