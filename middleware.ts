import { NextRequest, NextResponse } from "next/server";
import { retryAfter } from "./app/api/rate-limit";

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") return NextResponse.next();
  const seconds = retryAfter(request);
  if (seconds) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍等片刻后重试。" },
      {
        status: 429,
        headers: {
          "Retry-After": String(seconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
