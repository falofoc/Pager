import { z } from "zod";
import { db } from "@/server/db";
import { staffContext } from "@/server/staff";
import { markReady, OrderError } from "@/server/orders";
import { body, fail, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const c = await staffContext();
  if ("error" in c) return c.error;
  const b = await body(req, z.object({ ids: z.array(z.string()).min(1).max(30) }));
  if (!b) return fail("BAD_REQUEST");
  const orders = await db.order.findMany({ where: { id: { in: b.ids }, branchId: c.branch.id } });
  let done = 0;
  for (const o of orders) {
    try {
      await markReady(o.id, c.actor);
      done++;
    } catch (e) {
      if (!(e instanceof OrderError)) throw e;
    }
  }
  return json({ done });
}
