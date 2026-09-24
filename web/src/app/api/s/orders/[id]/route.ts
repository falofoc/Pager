import { z } from "zod";
import { db } from "@/server/db";
import { staffContext } from "@/server/staff";
import { cancel, markPreparing, markReady, markUnclaimed, OrderError, pickUp, recall, resolveConflict } from "@/server/orders";
import { body, fail, json } from "@/server/http";

export const dynamic = "force-dynamic";
const S = z.object({
  action: z.enum(["preparing", "ready", "picked", "cancel", "recall", "unclaimed", "keep-first", "unlink"]),
  reason: z.string().max(60).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await staffContext();
  if ("error" in c) return c.error;
  const id = (await params).id;
  const b = await body(req, S);
  if (!b) return fail("BAD_REQUEST");
  const order = await db.order.findFirst({ where: { id, branchId: c.branch.id } });
  if (!order) return fail("NOT_FOUND", 404);
  try {
    switch (b.action) {
      case "preparing": await markPreparing(id, c.actor); break;
      case "ready": await markReady(id, c.actor); break;
      case "picked": await pickUp(id, c.actor); break;
      case "cancel": await cancel(id, c.actor, b.reason); break;
      case "recall": await recall(id, c.actor); break;
      case "unclaimed": await markUnclaimed(id, c.actor, b.reason); break;
      case "keep-first": await resolveConflict(id, "first", c.actor); break;
      case "unlink": await resolveConflict(id, "none", c.actor); break;
    }
    return json({ ok: true });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.code, 409, e.extra);
    throw e;
  }
}
