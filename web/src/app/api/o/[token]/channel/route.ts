import { z } from "zod";
import { normalizePhone, orderByToken } from "@/server/customer";
import { addChannel } from "@/server/orders";
import { body, fail, json } from "@/server/http";
import { clientIp, limited } from "@/server/ratelimit";
import { getIntegrationsCached, smsEnabled } from "@/server/integrations";

export const dynamic = "force-dynamic";
const S = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("WEBPUSH"), subscription: z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }) }),
  z.object({ kind: z.literal("SMS"), phone: z.string().max(20) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (limited(`channel:${clientIp(req)}`, 10, 60000)) return fail("RATE_LIMITED", 429);
  const r = await orderByToken((await params).token);
  if (!r) return fail("NOT_FOUND", 404);
  const b = await body(req, S);
  if (!b) return fail("BAD_REQUEST");
  if (b.kind === "WEBPUSH") {
    await addChannel(r.order.id, "WEBPUSH", JSON.stringify(b.subscription));
  } else {
    if (!smsEnabled(await getIntegrationsCached(r.branch.tenantId))) return fail("SMS_NOT_CONFIGURED", 409);
    const phone = normalizePhone(b.phone);
    if (!phone) return fail("BAD_PHONE");
    await addChannel(r.order.id, "SMS", phone);
  }
  return json({ ok: true });
}
