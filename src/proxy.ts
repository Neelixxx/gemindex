import { NextRequest, NextResponse } from "next/server";

import { generateRequestId, REQUEST_ID_HEADER } from "@/lib/observability";

export function proxy(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? generateRequestId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
