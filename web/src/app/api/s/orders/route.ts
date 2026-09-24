import { z } from "zod";
import { staffContext } from "@/server/staff";
import { createOrder, OrderError, staffView } from "@/server/orders";
import { body, fail, json } from "@/server/http";

export const dynamic = "force-dynamic";
const S = z.object({
  number: z.string().max(8).optional(),
  summary: z.string().max(80).optional(),
  itemCount: z.number().int().min(1).max(50).optional(),
  force: z.boolean().optional(),
  stationId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const c = await staffContext();
  if ("error" in c) return c.error;
  const b = await body(req, S);
  if (!b) return fail("BAD_REQUEST");
  if (c.branch.numbering === "MANUAL" && c.branch.mode !== "TICKET" && !b.number) return fail("NUMBER_REQUIRED");
  try {
    const order = await createOrder(c.branch, { ...b, stationId: b.stationId ?? c.device.stationId }, c.actor);
    return json({ order: await staffView(order) });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.code, 409, e.extra);
    throw e;
  }
}
