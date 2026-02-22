import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

export function createTotpSecret(): string {
  return generateSecret();
}

export function verifyTotpToken(secret: string, token: string): boolean {
  const result = verifySync({
    strategy: "totp",
    secret,
    token,
    epochTolerance: 30,
  });
  return result.valid;
}

export function buildOtpAuthUri(params: {
  userEmail: string;
  secret: string;
  issuer?: string;
}): string {
  return generateURI({
    strategy: "totp",
    label: params.userEmail,
    issuer: params.issuer ?? "Gem Index",
    secret: params.secret,
  });
}

export async function qrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}
