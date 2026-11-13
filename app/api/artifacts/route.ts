import { handle } from "../proxy";

// Conversation exports stay in the browser; no Cloudflare KV is required.
export const GET = handle;
export const POST = handle;
export const runtime = "edge";
