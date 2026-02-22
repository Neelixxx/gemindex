import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { featureErrorMessage, hasFeature } from "@/lib/entitlements";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasFeature(user, "CARD_SCANNER_OCR")) {
    return NextResponse.json(
      { error: featureErrorMessage(user, "CARD_SCANNER_OCR") },
      { status: 402 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image file is required" }, { status: 400 });
  }

  const [{ recognize }] = await Promise.all([import("tesseract.js")]);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const result = await recognize(buffer, "eng", {
    logger: () => undefined,
  });

  const rawText = result.data.text ?? "";
  const cleanedText = rawText.replace(/\s+/g, " ").trim();

  return NextResponse.json({
    text: cleanedText,
    confidence: result.data.confidence ?? 0,
  });
}
