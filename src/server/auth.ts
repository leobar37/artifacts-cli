import type { Context, Next } from "hono";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Constant-time shared-token bearer check against ARTIFACT_BROKER_TOKEN. */
export function isAuthorizedBearer(authHeader: string | null | undefined): boolean {
  const token = (process.env.ARTIFACT_BROKER_TOKEN ?? "").trim();
  if (!token) return false;
  if (!authHeader) return false;
  const m = /^Bearer (.+)$/.exec(authHeader.trim());
  if (!m) return false;
  return safeEqual(m[1].trim(), token);
}

export async function requireBrokerToken(c: Context, next: Next) {
  if (!isAuthorizedBearer(c.req.header("authorization"))) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }
  await next();
}
