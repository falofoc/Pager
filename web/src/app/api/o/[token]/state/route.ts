import { z } from "zod";
import { orderByToken } from "@/server/customer";
import { OrderError, pickUp, setCustomerState } from "@/server/orders";
import { body, fail, json } from "@/server/http";
import { clientIp, limited } from "@/server/ratelimit";
import { touch } from "@/server/presence";

export const dynamic = "force-dynamic";
const S = z.object({ state: z.enum(["PICKED_UP", "ON_MY_WAY", "STEPPED_OUT", "IN_CAR", "WRONG_ORDER"]) });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (limited(`state:${clientIp(req)}`, 30, 60000)) return fail("RATE_LIMITED", 429);
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  const b = await body(req, S);
  if (!b) return fail("BAD_REQUEST");
  touch(r.order.id);
  try {
    if (b.state === "PICKED_UP") {
      if (r.order.status !== "READY") return fail("NOT_READY", 409);
      await pickUp(r.order.id, "customer");
    } else {
      await setCustomerState(r.order.id, b.state);
    }
    return json({ ok: true });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.code, 409);
    throw e;
  }
}
