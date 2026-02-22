export interface OcrResult {
  text: string;
  confidence: number;
}

export async function runImageOcr(file: File): Promise<OcrResult> {
  const [{ recognize }] = await Promise.all([import("tesseract.js")]);
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const result = await recognize(buffer, "eng", {
    logger: () => undefined,
  });

  const rawText = result.data.text ?? "";
  return {
    text: rawText.replace(/\s+/g, " ").trim(),
    confidence: result.data.confidence ?? 0,
  };
}
