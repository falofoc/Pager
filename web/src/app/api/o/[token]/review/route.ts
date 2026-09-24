import { orderByToken } from "@/server/customer";
import { db } from "@/server/db";
import { fail, json } from "@/server/http";

export const dynamic = "force-dynamic";

/** يسجّل النقر على زر تقييم Google فقط. لا مكافأة مرتبطة به. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  if (!r.order.reviewClicked) {
    await db.order.update({ where: { id: r.order.id }, data: { reviewClicked: true } });
    await db.orderEvent.create({ data: { orderId: r.order.id, branchId: r.order.branchId, type: "REVIEW_CLICK", actor: "customer" } });
  }
  return json({ ok: true });
}
