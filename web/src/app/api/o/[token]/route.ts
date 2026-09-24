import { orderByToken } from "@/server/customer";
import { publicView } from "@/server/orders";
import { fail, json } from "@/server/http";
import { touch } from "@/server/presence";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  touch(r.order.id);
  return json(await publicView(r.order, r.branch));
}
