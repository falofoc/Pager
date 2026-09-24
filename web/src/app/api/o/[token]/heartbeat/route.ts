import { orderByToken } from "@/server/customer";
import { fail, json } from "@/server/http";
import { touch } from "@/server/presence";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  touch(r.order.id);
  return json({ ok: true });
}
