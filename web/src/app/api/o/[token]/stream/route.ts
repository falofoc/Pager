import { orderByToken } from "@/server/customer";
import { publicView } from "@/server/orders";
import { fail } from "@/server/http";
import { sseResponse } from "@/server/sse";
import { ch } from "@/server/hub";
import { touch } from "@/server/presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  const { order, branch } = r;
  touch(order.id);
  return sseResponse(req, [ch.order(order.id), ch.tick(branch.id)], {
    initial: async () => ({ type: "order", view: await publicView(order, branch) }),
  });
}
