import { z } from "zod";
import { staffContext } from "@/server/staff";
import { OrderError, redeemCode } from "@/server/orders";
import { body, fail, json } from "@/server/http";
import { limited } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const c = await staffContext();
  if ("error" in c) return c.error;
  if (limited(`sredeem:${c.device.id}`, 10, 60000)) return fail("RATE_LIMITED", 429);
  const b = await body(req, z.object({ code: z.string().regex(/^\d{4}$/) }));
  if (!b) return fail("BAD_REQUEST");
  try {
    return json(await redeemCode(c.branch, b.code, c.actor));
  } catch (e) {
    if (e instanceof OrderError) return fail(e.code, 409);
    throw e;
  }
}
