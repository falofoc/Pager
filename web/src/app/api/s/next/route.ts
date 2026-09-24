import { staffContext } from "@/server/staff";
import { callNext, OrderError, staffView } from "@/server/orders";
import { fail, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST() {
  const c = await staffContext();
  if ("error" in c) return c.error;
  try {
    const o = await callNext(c.branch, c.actor);
    return json({ order: await staffView(o) });
  } catch (e) {
    if (e instanceof OrderError) return fail(e.code, 409);
    throw e;
  }
}
