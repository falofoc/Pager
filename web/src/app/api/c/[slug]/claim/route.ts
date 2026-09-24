import { z } from "zod";
import { branchBySlug, validDeviceKey } from "@/server/customer";
import { claim, OrderError } from "@/server/orders";
import { body, fail, json } from "@/server/http";
import { clientIp, limited } from "@/server/ratelimit";

export const dynamic = "force-dynamic";
const S = z.object({ number: z.string().min(1).max(8), deviceKey: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (limited(`claim:${clientIp(req)}`, 15, 60000)) return fail("RATE_LIMITED", 429);
  const branch = await branchBySlug((await params).slug);
  if (!branch) return fail("NOT_FOUND", 404);
  const b = await body(req, S);
  if (!b || !validDeviceKey(b.deviceKey)) return fail("BAD_REQUEST");
  try {
    const order = await claim(branch, b.number, b.deviceKey);
    return json({ token: order.token });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.code, e.code === "NOT_FOUND" ? 404 : 400);
    throw e;
  }
}
