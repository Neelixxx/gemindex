import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { Jimp } from "jimp";

export interface BarcodeDetection {
  value: string;
  format: string;
}

function readerWithHints(): MultiFormatReader {
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader;
}

function bitmapFromJimp(image: any): BinaryBitmap {
  const { data, width, height } = image.bitmap;
  const luminances = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i += 1) {
    luminances[i] = data[i * 4];
  }
  return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, width, height)));
}

function decodeOne(reader: MultiFormatReader, image: any): BarcodeDetection | null {
  try {
    const decoded = reader.decode(bitmapFromJimp(image));
    const value = decoded.getText()?.trim();
    if (!value) {
      return null;
    }
    return {
      value,
      format: decoded.getBarcodeFormat().toString(),
    };
  } catch {
    return null;
  }
}

export async function detectBarcodesFromImage(file: File): Promise<BarcodeDetection[]> {
  const bytes = await file.arrayBuffer();
  const source = await Jimp.read(Buffer.from(bytes));
  const reader = readerWithHints();

  const variants: any[] = [
    source.clone(),
    source.clone().greyscale(),
    source.clone().greyscale().contrast(0.15),
    source.clone().greyscale().contrast(0.35),
    source.clone().rotate(90),
    source.clone().rotate(270),
    source.clone().greyscale().resize({ w: Math.floor(source.bitmap.width * 1.25) }),
  ];

  const seen = new Set<string>();
  const out: BarcodeDetection[] = [];
  for (const variant of variants) {
    const decoded = decodeOne(reader, variant);
    if (!decoded) {
      continue;
    }
    const key = `${decoded.format}:${decoded.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(decoded);
  }

  return out;
}
