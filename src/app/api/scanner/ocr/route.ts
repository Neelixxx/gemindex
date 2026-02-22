import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";
import { runImageOcr } from "@/lib/ocr";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasFeature(user, "CARD_SCANNER_TEXT")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "CARD_SCANNER_TEXT") },
      { status: 402 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image file is required" }, { status: 400 });
  }

  const result = await runImageOcr(file);

  return NextResponse.json({
    text: result.text,
    confidence: result.confidence,
  });
}
