import type { NextRequest } from "next/server";

export const REQUEST_ID_HEADER = "x-request-id";

export function generateRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function requestIdFromRequest(request: NextRequest): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? generateRequestId();
}
