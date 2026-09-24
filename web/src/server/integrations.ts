import { db } from "./db";
import { decrypt, encrypt, randomToken } from "./crypto";

/** مفاتيح التكاملات التي يُدخلها المدير. تُخزَّن مشفّرة لكل منشأة. */
export const INTEGRATION_KEYS = [
  "sms.provider", // none | twilio | unifonic
  "sms.twilio.accountSid",
  "sms.twilio.authToken",
  "sms.twilio.from",
  "sms.unifonic.appSid",
  "sms.unifonic.senderId",
  "sms.inboundNumber", // رقم يستقبل رسائل العملاء (يُعرض في صفحة بلا إنترنت)
  "sms.inboundSecret", // يُولَّد تلقائيًا ويُضاف لرابط الـwebhook
  "wa.token",
  "wa.phoneNumberId",
  "wa.businessNumber", // الرقم الذي يراسله العميل، بصيغة دولية بلا +
  "wa.verifyToken", // يُولَّد تلقائيًا
  "wa.appSecret", // اختياري للتحقق من توقيع Meta
] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];
export type Integrations = Partial<Record<IntegrationKey, string>>;

const SECRET_KEYS: IntegrationKey[] = ["sms.twilio.authToken", "sms.unifonic.appSid", "wa.token", "wa.appSecret"];
export const isSecretKey = (k: string) => (SECRET_KEYS as string[]).includes(k);

export async function getIntegrations(tenantId: string): Promise<Integrations> {
  const rows = await db.integrationSetting.findMany({ where: { tenantId } });
  const out: Integrations = {};
  for (const r of rows) {
    const v = decrypt(r.value);
    if (v !== null) out[r.key as IntegrationKey] = v;
  }
  let changed = false;
  if (!out["sms.inboundSecret"]) {
    out["sms.inboundSecret"] = randomToken(12);
    changed = true;
  }
  if (!out["wa.verifyToken"]) {
    out["wa.verifyToken"] = randomToken(12);
    changed = true;
  }
  if (changed) {
    await setIntegration(tenantId, "sms.inboundSecret", out["sms.inboundSecret"]!);
    await setIntegration(tenantId, "wa.verifyToken", out["wa.verifyToken"]!);
  }
  return out;
}

export async function setIntegration(tenantId: string, key: IntegrationKey, value: string) {
  if (!value) {
    await db.integrationSetting.deleteMany({ where: { tenantId, key } });
    return;
  }
  await db.integrationSetting.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value: encrypt(value) },
    update: { value: encrypt(value) },
  });
}

export const smsEnabled = (i: Integrations) =>
  (i["sms.provider"] === "twilio" && !!i["sms.twilio.accountSid"] && !!i["sms.twilio.authToken"] && !!i["sms.twilio.from"]) ||
  (i["sms.provider"] === "unifonic" && !!i["sms.unifonic.appSid"]);

export const whatsappEnabled = (i: Integrations) => !!i["wa.token"] && !!i["wa.phoneNumberId"] && !!i["wa.businessNumber"];

const gi = globalThis as unknown as { __dorakInt?: Map<string, { v: Integrations; at: number }> };
const icache = gi.__dorakInt ?? new Map<string, { v: Integrations; at: number }>();
gi.__dorakInt = icache;

export async function getIntegrationsCached(tenantId: string): Promise<Integrations> {
  const hit = icache.get(tenantId);
  if (hit && Date.now() - hit.at < 30000) return hit.v;
  const v = await getIntegrations(tenantId);
  icache.set(tenantId, { v, at: Date.now() });
  return v;
}

export function invalidateIntegrations(tenantId: string) {
  icache.delete(tenantId);
}
