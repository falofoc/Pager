import { z } from "zod";
import { orderByToken } from "@/server/customer";
import { db } from "@/server/db";
import { body, fail, json } from "@/server/http";
import { clientIp, limited } from "@/server/ratelimit";

export const dynamic = "force-dynamic";
const S = z.object({ score: z.number().int().min(1).max(3), reason: z.string().max(40).optional(), note: z.string().max(500).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (limited(`fb:${clientIp(req)}`, 10, 60000)) return fail("RATE_LIMITED", 429);
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  if (r.order.status !== "PICKED_UP") return fail("NOT_PICKED_UP", 409);
  const b = await body(req, S);
  if (!b) return fail("BAD_REQUEST");
  await db.feedback.upsert({
    where: { orderId: r.order.id },
    create: { orderId: r.order.id, score: b.score, reason: b.reason, note: b.note?.trim() || null },
    update: { score: b.score, reason: b.reason, ...(b.note !== undefined ? { note: b.note.trim() || null } : {}) },
  });
  return json({ ok: true });
}
