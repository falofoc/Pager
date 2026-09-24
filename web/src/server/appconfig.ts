import webpush from "web-push";
import { db } from "./db";

const g = globalThis as unknown as { __dorakVapid?: { publicKey: string; privateKey: string } };

/** مفاتيح VAPID لإشعارات الويب: تُولَّد تلقائيًا أول مرة وتُحفظ في قاعدة البيانات. لا تحتاج مفتاحًا من أي مزوّد. */
export async function getVapid() {
  if (g.__dorakVapid) return g.__dorakVapid;
  const row = await db.appConfig.findUnique({ where: { key: "vapid" } });
  if (row) {
    g.__dorakVapid = JSON.parse(row.value);
  } else {
    const keys = webpush.generateVAPIDKeys();
    await db.appConfig.upsert({ where: { key: "vapid" }, create: { key: "vapid", value: JSON.stringify(keys) }, update: {} });
    const fresh = await db.appConfig.findUnique({ where: { key: "vapid" } });
    g.__dorakVapid = JSON.parse(fresh!.value);
  }
  return g.__dorakVapid!;
}

export function appUrl(req?: Request): string {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  if (req) {
    const u = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
    const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

/** أصل الموقع داخل مكوّنات الخادم */
export async function serverOrigin(): Promise<string> {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
}
