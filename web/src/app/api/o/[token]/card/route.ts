import { z } from "zod";
import { orderByToken, validDeviceKey } from "@/server/customer";
import { cardFor, createRedeemCode, OrderError } from "@/server/orders";
import { body, fail, json } from "@/server/http";
import { clientIp, limited } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  const k = new URL(req.url).searchParams.get("k");
  if (!validDeviceKey(k)) return fail("BAD_REQUEST");
  return json(await cardFor(r.branch, k));
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (limited(`redeem:${clientIp(req)}`, 5, 60000)) return fail("RATE_LIMITED", 429);
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  const b = await body(req, z.object({ deviceKey: z.string() }));
  if (!b || !validDeviceKey(b.deviceKey)) return fail("BAD_REQUEST");
  try {
    return json(await createRedeemCode(r.branch, b.deviceKey));
  } catch (e) {
    if (e instanceof OrderError) return fail(e.code, 409);
    throw e;
  }
}
