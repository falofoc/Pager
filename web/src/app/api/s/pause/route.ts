import { z } from "zod";
import { staffContext } from "@/server/staff";
import { setPause } from "@/server/orders";
import { body, fail, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const c = await staffContext();
  if ("error" in c) return c.error;
  const b = await body(req, z.object({ on: z.boolean() }));
  if (!b) return fail("BAD_REQUEST");
  await setPause(c.branch.id, b.on, c.actor);
  return json({ ok: true });
}
