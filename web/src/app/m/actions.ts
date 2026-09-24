"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { createSession, destroySession, requireUser } from "@/server/auth";
import { hashPassword, randomCode, randomToken, verifyPassword } from "@/server/crypto";
import { parseSettings, DEFAULT_SETTINGS, type BranchSettings } from "@/server/settings";
import { getIntegrations, INTEGRATION_KEYS, invalidateIntegrations, isSecretKey, setIntegration, type IntegrationKey } from "@/server/integrations";
import { sendSms, sendWhatsApp } from "@/server/notify";
import { normalizePhone } from "@/server/customer";
import { invalidateEta } from "@/server/eta";
import { emitBranch } from "@/server/orders";
import { toMinutes } from "@/core/loyalty";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, min: number, max: number, def: number) => {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : def;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on";

async function newBranchData(tenantId: string, name: string) {
  let slug = randomCode(6).toLowerCase();
  while (await db.branch.findUnique({ where: { slug } })) slug = randomCode(6).toLowerCase();
  return {
    tenantId,
    name,
    slug,
    joinCode: randomCode(6),
    tvKey: randomToken(12),
    settings: JSON.stringify(DEFAULT_SETTINGS),
    stations: { create: [{ name: "نقطة الاستلام", sort: 0 }] },
  };
}

/* ---------- auth ---------- */
export async function registerAction(fd: FormData) {
  const S = z.object({
    brand: z.string().min(2).max(60),
    branch: z.string().min(2).max(60),
    name: z.string().min(2).max(60),
    email: z.string().email().max(120),
    password: z.string().min(8).max(200),
  });
  const r = S.safeParse({ brand: str(fd, "brand"), branch: str(fd, "branch"), name: str(fd, "name"), email: str(fd, "email").toLowerCase(), password: String(fd.get("password") ?? "") });
  if (!r.success) redirect("/start?e=invalid");
  if (await db.user.findUnique({ where: { email: r.data.email } })) redirect("/start?e=exists");
  const tenant = await db.tenant.create({ data: { name: r.data.brand } });
  await db.user.create({ data: { tenantId: tenant.id, email: r.data.email, name: r.data.name, passwordHash: hashPassword(r.data.password) } });
  await db.branch.create({ data: await newBranchData(tenant.id, r.data.branch) });
  const user = await db.user.findUnique({ where: { email: r.data.email } });
  await createSession(user!.id);
  redirect("/m?welcome=1");
}

export async function loginAction(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(String(fd.get("password") ?? ""), user.passwordHash)) redirect("/login?e=bad");
  await createSession(user.id);
  redirect("/m");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/* ---------- branches ---------- */
async function ownBranch(branchId: string) {
  const user = await requireUser();
  const branch = await db.branch.findFirst({ where: { id: branchId, tenantId: user.tenantId } });
  if (!branch) redirect("/m/branches");
  return { user, branch };
}

export async function createBranchAction(fd: FormData) {
  const user = await requireUser();
  const name = str(fd, "name");
  if (name.length < 2) redirect("/m/branches?e=name");
  const b = await db.branch.create({ data: await newBranchData(user.tenantId, name.slice(0, 60)) });
  redirect(`/m/settings?b=${b.id}&saved=1`);
}

export async function saveBranchAction(fd: FormData) {
  const { branch } = await ownBranch(str(fd, "branchId"));
  const back = (q: string) => redirect(`/m/settings?b=${branch.id}&${q}`);

  const slug = str(fd, "slug").toLowerCase();
  if (!/^[a-z0-9-]{3,30}$/.test(slug)) back("e=slug");
  if (slug !== branch.slug && (await db.branch.findUnique({ where: { slug } }))) back("e=slug-taken");
  const color = str(fd, "brandColor");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) back("e=color");

  const quietHours = str(fd, "quietHours")
    .split(/\n|,/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [from, to] = l.split(/\s*[-–]\s*/);
      return { from: from ?? "", to: to ?? "" };
    })
    .filter((r) => toMinutes(r.from) !== null && toMinutes(r.to) !== null);

  const old = parseSettings(branch.settings);
  const settings: BranchSettings = {
    ...old,
    showMascot: bool(fd, "showMascot"),
    nearNotify: bool(fd, "nearNotify"),
    defaultPrepMin: num(fd, "defaultPrepMin", 1, 60, 5),
    numberDigits: num(fd, "numberDigits", 3, 5, 3),
    defaultStation: str(fd, "defaultStation") || old.defaultStation,
    waitingLine: str(fd, "waitingLine").slice(0, 140),
    googlePlaceId: str(fd, "googlePlaceId").slice(0, 200),
    wifi: { ssid: str(fd, "wifiSsid").slice(0, 64), password: str(fd, "wifiPassword").slice(0, 64), security: (["WPA", "WEP", "nopass"].includes(str(fd, "wifiSecurity")) ? str(fd, "wifiSecurity") : "WPA") as "WPA" },
    escalation: {
      waAfterSec: num(fd, "waAfterSec", 15, 1800, 60),
      smsAfterSec: num(fd, "smsAfterSec", 15, 1800, 120),
      staffAlertAfterSec: num(fd, "staffAlertAfterSec", 30, 1800, 180),
      unclaimedAfterSec: num(fd, "unclaimedAfterSec", 120, 7200, 600),
    },
    loyalty: {
      enabled: bool(fd, "loyaltyEnabled"),
      goal: num(fd, "loyaltyGoal", 2, 50, 10),
      reward: str(fd, "loyaltyReward").slice(0, 80) || old.loyalty.reward,
      dailyMax: num(fd, "loyaltyDailyMax", 1, 20, 3),
      quietHours,
      fastPickupBonus: bool(fd, "fastPickupBonus"),
      apologyStamp: bool(fd, "apologyStamp"),
    },
  };

  const stationNames = str(fd, "stations")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const existing = await db.station.findMany({ where: { branchId: branch.id } });
  for (const st of existing) if (!stationNames.includes(st.name)) await db.station.delete({ where: { id: st.id } });
  for (const [i, name] of stationNames.entries()) {
    const e = existing.find((x) => x.name === name);
    if (e) await db.station.update({ where: { id: e.id }, data: { sort: i } });
    else await db.station.create({ data: { branchId: branch.id, name, sort: i } });
  }

  await db.branch.update({
    where: { id: branch.id },
    data: {
      name: str(fd, "name").slice(0, 60) || branch.name,
      slug,
      brandColor: color.toUpperCase(),
      mode: str(fd, "mode") === "TICKET" ? "TICKET" : "ORDER",
      numbering: str(fd, "numbering") === "MANUAL" ? "MANUAL" : "CHECKSUM",
      timezone: str(fd, "timezone") || branch.timezone,
      settings: JSON.stringify(settings),
    },
  });
  const brand = str(fd, "brand");
  if (brand.length >= 2) await db.tenant.update({ where: { id: branch.tenantId }, data: { name: brand.slice(0, 60) } });
  invalidateEta(branch.id);
  await emitBranch(branch.id);
  back("saved=1");
}

export async function regenerateJoinCodeAction(fd: FormData) {
  const { branch } = await ownBranch(str(fd, "branchId"));
  await db.branch.update({ where: { id: branch.id }, data: { joinCode: randomCode(6) } });
  redirect(`/m/settings?b=${branch.id}&saved=1#devices`);
}

export async function regenerateTvKeyAction(fd: FormData) {
  const { branch } = await ownBranch(str(fd, "branchId"));
  await db.branch.update({ where: { id: branch.id }, data: { tvKey: randomToken(12) } });
  redirect(`/m/settings?b=${branch.id}&saved=1#devices`);
}

export async function revokeDeviceAction(fd: FormData) {
  const { branch } = await ownBranch(str(fd, "branchId"));
  await db.device.updateMany({ where: { id: str(fd, "deviceId"), branchId: branch.id }, data: { revokedAt: new Date() } });
  redirect(`/m/settings?b=${branch.id}&saved=1#devices`);
}

/* ---------- integrations ---------- */
export async function saveIntegrationsAction(fd: FormData) {
  const user = await requireUser();
  for (const key of INTEGRATION_KEYS) {
    if (key === "sms.inboundSecret" || key === "wa.verifyToken") continue;
    if (!fd.has(key)) continue;
    const v = String(fd.get(key) ?? "").trim();
    if (isSecretKey(key) && v === "" && !bool(fd, `clear:${key}`)) continue; // يبقى المفتاح الحالي
    let value = v;
    if (key === "sms.inboundNumber" && v) value = normalizePhone(v) ?? v;
    if (key === "wa.businessNumber" && v) value = v.replace(/[^\d]/g, "");
    await setIntegration(user.tenantId, key as IntegrationKey, value);
  }
  invalidateIntegrations(user.tenantId);
  redirect("/m/integrations?saved=1");
}

export async function testChannelAction(fd: FormData) {
  const user = await requireUser();
  const kind = str(fd, "kind");
  const to = normalizePhone(str(fd, "to"));
  if (!to) redirect(`/m/integrations?test=${kind}&ok=0&msg=${encodeURIComponent("رقم غير صحيح")}`);
  const i = await getIntegrations(user.tenantId);
  const text = "رسالة تجربة من دورك. الإعداد يعمل.";
  const r = kind === "sms" ? await sendSms(i, to, text) : await sendWhatsApp(i, to, text);
  redirect(`/m/integrations?test=${kind}&ok=${r.ok ? 1 : 0}${r.ok ? "" : `&msg=${encodeURIComponent(r.error.slice(0, 160))}`}`);
}
