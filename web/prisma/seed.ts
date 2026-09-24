/**
 * بيانات تجريبية: منشأة «مقهى سدرة» بفرع واحد، و4 أسابيع من الطلبات لتظهر لوحة المدير بأرقام حقيقية الشكل.
 * الدخول: demo@dorak.app / dorak1234 · رمز ربط الجهاز: DEMO01 · شاشة الأرقام: /tv/sidra?key=demo-tv-key
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { nextChecksumNumber } from "../src/core/numbering";

const db = new PrismaClient();
const TZ_OFFSET_H = 3; // Asia/Riyadh

function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${h.toString("base64url")}`;
}
const tok = () => crypto.randomBytes(9).toString("base64url");

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

const HOURLY = [0, 0, 0, 0, 0, 0, 0, 14, 30, 26, 16, 14, 18, 20, 16, 14, 16, 26, 32, 28, 22, 16, 10, 4];

async function main() {
  const existing = await db.user.findUnique({ where: { email: "demo@dorak.app" } });
  if (existing) {
    console.log("Demo data already exists. Use `npm run db:reset` to recreate.");
    return;
  }
  const tenant = await db.tenant.create({ data: { name: "مقهى سدرة" } });
  await db.user.create({ data: { tenantId: tenant.id, email: "demo@dorak.app", name: "مدير تجريبي", passwordHash: hashPassword("dorak1234") } });
  const branch = await db.branch.create({
    data: {
      tenantId: tenant.id,
      name: "فرع العليا",
      slug: "sidra",
      joinCode: "DEMO01",
      tvKey: "demo-tv-key",
      brandColor: "#1F5F73",
      settings: JSON.stringify({
        showMascot: true,
        defaultPrepMin: 5,
        nearNotify: true,
        numberDigits: 3,
        defaultStation: "نقطة الاستلام",
        waitingLine: "قهوة اليوم: إثيوبيا، تحميص فاتح",
        googlePlaceId: "",
        wifi: { ssid: "Sidra-Guest", password: "sidra2026", security: "WPA" },
        escalation: { waAfterSec: 60, smsAfterSec: 120, staffAlertAfterSec: 180, unclaimedAfterSec: 600 },
        loyalty: { enabled: true, goal: 10, reward: "مشروب من اختيارك", dailyMax: 3, quietHours: [{ from: "15:00", to: "17:00" }], fastPickupBonus: true, apologyStamp: true },
      }),
      stations: { create: [{ name: "نقطة الاستلام اليمنى", sort: 0 }, { name: "نافذة السيارات", sort: 1 }] },
    },
  });

  const now = Date.now();
  const todayLocal = new Date(now + TZ_OFFSET_H * 3600e3);
  const rows: Prisma.OrderCreateManyInput[] = [];
  let cursor = 0;
  const fb: { token: string; score: number; reason?: string }[] = [];

  for (let dayAgo = 28; dayAgo >= 1; dayAgo--) {
    const d = new Date(Date.UTC(todayLocal.getUTCFullYear(), todayLocal.getUTCMonth(), todayLocal.getUTCDate() - dayAgo));
    const weekday = d.getUTCDay();
    const dayKey = d.toISOString().slice(0, 10);
    const dayFactor = weekday === 4 || weekday === 5 ? 1.25 : weekday === 6 ? 0.9 : 1;
    const used = new Set<string>();
    for (let h = 7; h < 23; h++) {
      const n = Math.round(HOURLY[h] * dayFactor * (0.85 + rnd() * 0.3));
      for (let k = 0; k < n; k++) {
        const createdAt = new Date(d.getTime() + (h - TZ_OFFSET_H) * 3600e3 + Math.floor(rnd() * 3600e3));
        const queue = Math.max(0, Math.round(n / 6 + gauss() * 1.5));
        let prep = 200 + queue * 22 + gauss() * 55;
        if (weekday === 4 && (h === 17 || h === 18)) prep *= 1.55; // ذروة الخميس المختنقة
        if (h === 8) prep *= 1.15;
        prep = Math.max(70, prep);
        const readyAt = new Date(createdAt.getTime() + prep * 1000);
        const r = rnd();
        const unclaimed = r < 0.006;
        const claimed = rnd() < 0.66;
        const pickup = claimed ? 25 + Math.abs(gauss()) * 45 : 60 + Math.abs(gauss()) * 90;
        const pickedUpAt = unclaimed ? null : new Date(readyAt.getTime() + pickup * 1000);
        const etaHigh = Math.ceil((260 + queue * 25) / 60) * 60 + 60;
        if (used.size > 70) used.clear();
        const num = nextChecksumNumber(cursor, 3, (x) => used.has(x));
        cursor = num.cursor;
        used.add(num.number);
        const token = tok();
        rows.push({
          branchId: branch.id,
          number: num.number,
          token,
          status: unclaimed ? "UNCLAIMED" : "PICKED_UP",
          customerState: "NONE",
          dayKey,
          queueAtCreate: queue,
          createdAt,
          readyAt,
          notifiedAt: readyAt,
          ackAt: pickedUpAt,
          pickedUpAt,
          closedAt: pickedUpAt ?? new Date(readyAt.getTime() + 600e3),
          etaLowSec: etaHigh - 120,
          etaHighSec: etaHigh,
          etaFirstHighSec: etaHigh,
          promiseBroken: prep > etaHigh,
          claimKeys: claimed ? JSON.stringify([`seed_${token}`]) : "[]",
          claimedAt: claimed ? createdAt : null,
          reviewClicked: claimed && !unclaimed && rnd() < 0.1,
          unclaimedReason: unclaimed ? "NO_SHOW" : null,
          itemCount: 1 + Math.floor(rnd() * 3),
        });
        if (claimed && !unclaimed && dayAgo <= 7 && rnd() < 0.25) {
          const wait = prep + pickup;
          const score = wait > 600 ? (rnd() < 0.55 ? 1 : 2) : rnd() < 0.72 ? 3 : rnd() < 0.8 ? 2 : 1;
          fb.push({ token, score, reason: score === 1 ? (wait > 600 ? "التأخير" : "الطلب نفسه") : undefined });
        }
      }
    }
  }
  for (let i = 0; i < rows.length; i += 500) await db.order.createMany({ data: rows.slice(i, i + 500) });
  const byToken = new Map((await db.order.findMany({ where: { branchId: branch.id }, select: { id: true, token: true } })).map((o) => [o.token, o.id]));
  await db.feedback.createMany({ data: fb.map((f) => ({ orderId: byToken.get(f.token)!, score: f.score, reason: f.reason })) });

  // بطاقة ولاء تجريبية لبعض الطلبات
  const card = await db.loyaltyCard.create({ data: { tenantId: tenant.id, keyHash: crypto.createHash("sha256").update("seed_card").digest("hex"), stamps: 0 } });
  const recent = await db.order.findMany({ where: { branchId: branch.id, status: "PICKED_UP" }, orderBy: { createdAt: "desc" }, take: 60 });
  let stamps = 0;
  for (const o of recent.filter((_, i) => i % 6 === 0)) {
    await db.stampEntry.create({ data: { cardId: card.id, orderId: o.id, value: 1, reason: "PICKUP", at: o.pickedUpAt! } });
    stamps += 1;
  }
  await db.loyaltyCard.update({ where: { id: card.id }, data: { stamps } });

  console.log(`Seeded ${rows.length} historical orders and ${fb.length} feedback entries.`);
  console.log("Manager login: demo@dorak.app / dorak1234");
  console.log("Staff device join code: DEMO01");
  console.log("Customer page: /c/sidra · TV: /tv/sidra?key=demo-tv-key");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
