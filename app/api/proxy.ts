import { NextResponse } from "next/server";

// Client-selected upstreams are intentionally unavailable in this deployment.
// Never forward a server key to an x-base-url supplied by a caller.
export async function handle() {
  return NextResponse.json(
    { error: true, msg: "This endpoint is not available" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
