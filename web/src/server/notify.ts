import webpush from "web-push";
import { db } from "./db";
import { decrypt } from "./crypto";
import { getVapid } from "./appconfig";
import { getIntegrations, type Integrations } from "./integrations";

type Result = { ok: true } | { ok: false; error: string };

async function record(orderId: string, kind: string, step: string, r: Result | { skipped: string }) {
  const result = "skipped" in r ? "SKIPPED" : r.ok ? "SENT" : "FAILED";
  const error = "skipped" in r ? r.skipped : r.ok ? null : r.error;
  await db.notificationAttempt.create({ data: { orderId, kind, step, result, error } });
}

/* ---------- Web Push (بلا مفاتيح خارجية) ---------- */
export async function pushToOrder(orderId: string, step: string, payload: { title: string; body: string; url: string; tag?: string }) {
  const channels = await db.channel.findMany({ where: { orderId, kind: "WEBPUSH", expiresAt: { gt: new Date() } } });
  if (channels.length === 0) return false;
  const vapid = await getVapid();
  let any = false;
  for (const c of channels) {
    const raw = decrypt(c.address);
    if (!raw) continue;
    try {
      await webpush.sendNotification(JSON.parse(raw), JSON.stringify(payload), {
        vapidDetails: { subject: "mailto:ops@dorak.app", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: 600,
        urgency: "high",
      });
      any = true;
      await record(orderId, "WEBPUSH", step, { ok: true });
    } catch (e: unknown) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.channel.delete({ where: { id: c.id } }).catch(() => {});
      await record(orderId, "WEBPUSH", step, { ok: false, error: `push ${status ?? ""} ${(e as Error).message ?? ""}`.slice(0, 300) });
    }
  }
  return any;
}

/* ---------- SMS ---------- */
export async function sendSms(i: Integrations, to: string, text: string): Promise<Result> {
  try {
    if (i["sms.provider"] === "twilio") {
      const sid = i["sms.twilio.accountSid"]!;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${i["sms.twilio.authToken"]}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: i["sms.twilio.from"]!, Body: text }),
      });
      if (!res.ok) return { ok: false, error: `twilio ${res.status}: ${(await res.text()).slice(0, 200)}` };
      return { ok: true };
    }
    if (i["sms.provider"] === "unifonic") {
      const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          AppSid: i["sms.unifonic.appSid"]!,
          SenderID: i["sms.unifonic.senderId"] ?? "",
          Recipient: to.replace(/^\+/, ""),
          Body: text,
        }),
      });
      const body = await res.text();
      if (!res.ok || /"success"\s*:\s*"?false/.test(body)) return { ok: false, error: `unifonic ${res.status}: ${body.slice(0, 200)}` };
      return { ok: true };
    }
    return { ok: false, error: "SMS_NOT_CONFIGURED" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/* ---------- WhatsApp Cloud API ---------- */
export async function sendWhatsApp(i: Integrations, to: string, text: string): Promise<Result> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(i["wa.phoneNumberId"]!)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${i["wa.token"]}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: text } }),
    });
    if (!res.ok) return { ok: false, error: `whatsapp ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** يرسل على كل قنوات الطلب من نوع معيّن (WHATSAPP أو SMS). */
export async function sendToOrderChannels(orderId: string, tenantId: string, kind: "WHATSAPP" | "SMS", step: string, text: string) {
  const channels = await db.channel.findMany({ where: { orderId, kind, expiresAt: { gt: new Date() } } });
  if (channels.length === 0) return false;
  const i = await getIntegrations(tenantId);
  let any = false;
  for (const c of channels) {
    const to = decrypt(c.address);
    if (!to) continue;
    const r = kind === "SMS" ? await sendSms(i, to, text) : await sendWhatsApp(i, to, text);
    await record(orderId, kind, step, r);
    if (r.ok) any = true;
  }
  return any;
}

export async function recordAttempt(orderId: string, kind: string, step: string, result: "SENT" | "SKIPPED" | "FAILED", error?: string) {
  await db.notificationAttempt.create({ data: { orderId, kind, step, result, error } });
}
