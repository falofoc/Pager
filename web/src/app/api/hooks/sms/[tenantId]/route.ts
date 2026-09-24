import { db } from "@/server/db";
import { getIntegrations } from "@/server/integrations";
import { normalizePhone } from "@/server/customer";
import { addChannel } from "@/server/orders";
import { sendSms } from "@/server/notify";
import { label } from "@/core/copy";

export const dynamic = "force-dynamic";

const twiml = () => new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "Content-Type": "text/xml" } });

/**
 * رسالة نصية واردة من عميل بلا إنترنت: نصها رقم الطلب.
 * يُضبط هذا الرابط في لوحة مزوّد الرسائل (Twilio أو Unifonic) مع المعامل s السري.
 */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const tenantId = (await params).tenantId;
  const url = new URL(req.url);
  const i = await getIntegrations(tenantId);
  if (!i["sms.inboundSecret"] || url.searchParams.get("s") !== i["sms.inboundSecret"]) return new Response("forbidden", { status: 403 });

  let fields: Record<string, string> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) fields = (await req.json().catch(() => ({}))) as Record<string, string>;
  else fields = Object.fromEntries((await req.formData().catch(() => new FormData())).entries()) as Record<string, string>;
  const from = normalizePhone(String(fields.From ?? fields.from ?? fields.sender ?? fields.Sender ?? fields.msisdn ?? ""));
  const text = String(fields.Body ?? fields.body ?? fields.text ?? fields.message ?? fields.Message ?? "");
  const number = text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d{1,6}/)?.[0];
  if (!from || !number) return twiml();

  const order = await db.order.findFirst({
    where: { number, branch: { tenantId }, createdAt: { gte: new Date(Date.now() - 3600 * 1000) }, status: { in: ["CREATED", "PREPARING", "READY"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    await sendSms(i, from, `لم نجد ${number} ضمن الطلبات الحالية. تأكد من الرقم المطبوع على الفاتورة.`);
    return twiml();
  }
  await addChannel(order.id, "SMS", from);
  await db.orderEvent.create({ data: { orderId: order.id, branchId: order.branchId, type: "CHANNEL:SMS_INBOUND", actor: "customer" } });
  await sendSms(i, from, order.status === "READY" ? `${label(order.kind)} ${order.number} جاهز الآن.` : `تم. سنرسل لك رسالة عندما يجهز ${label(order.kind)} ${order.number}.`);
  return twiml();
}
