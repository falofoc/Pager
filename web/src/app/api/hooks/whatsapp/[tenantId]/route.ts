import crypto from "node:crypto";
import { db } from "@/server/db";
import { getIntegrations } from "@/server/integrations";
import { addChannel } from "@/server/orders";
import { sendWhatsApp } from "@/server/notify";
import { normalizePhone } from "@/server/customer";
import { label } from "@/core/copy";

export const dynamic = "force-dynamic";

/** تحقق Meta عند إعداد الـwebhook */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const i = await getIntegrations((await params).tenantId);
  const u = new URL(req.url).searchParams;
  if (u.get("hub.mode") === "subscribe" && u.get("hub.verify_token") === i["wa.verifyToken"]) return new Response(u.get("hub.challenge") ?? "", { status: 200 });
  return new Response("forbidden", { status: 403 });
}

type WaPayload = { entry?: { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] } }[] }[] };

/** رسالة واردة من العميل تحتوي رمز الطلب DK-xxxx: تُربط قناة واتساب بالطلب. */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const tenantId = (await params).tenantId;
  const i = await getIntegrations(tenantId);
  const raw = await req.text();
  if (i["wa.appSecret"]) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", i["wa.appSecret"]).update(raw).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return new Response("bad signature", { status: 401 });
  }
  let payload: WaPayload = {};
  try {
    payload = JSON.parse(raw);
  } catch {}
  const messages = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];
  for (const m of messages) {
    const body = m.text?.body ?? "";
    const token = /DK-([A-Za-z0-9_-]{12})/.exec(body)?.[1];
    const from = normalizePhone(m.from ?? "");
    if (!token || !from) continue;
    const order = await db.order.findFirst({ where: { token, branch: { tenantId } } });
    if (!order || !["CREATED", "PREPARING", "READY"].includes(order.status)) continue;
    await addChannel(order.id, "WHATSAPP", from);
    await db.orderEvent.create({ data: { orderId: order.id, branchId: order.branchId, type: "CHANNEL:WHATSAPP", actor: "customer" } });
    await sendWhatsApp(i, from, order.status === "READY" ? `${label(order.kind)} ${order.number} جاهز الآن.` : `تم. سنرسل لك هنا عندما يجهز ${label(order.kind)} ${order.number}.`);
  }
  return new Response("ok");
}
