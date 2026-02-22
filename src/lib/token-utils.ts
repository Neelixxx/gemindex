import crypto from "node:crypto";

export function createOpaqueToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}
