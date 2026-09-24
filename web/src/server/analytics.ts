import { db } from "./db";
import type { BranchFull } from "./orders";
import { quantile } from "@/core/eta";
import { dayKey, localParts } from "@/core/time";
import { recommend, quietestWindow, type HourCell } from "@/core/insights";

const DAY = 24 * 3600 * 1000;
const med = (xs: number[]) => (xs.length ? quantile([...xs].sort((a, b) => a - b), 0.5) : null);
const p90 = (xs: number[]) => (xs.length ? quantile([...xs].sort((a, b) => a - b), 0.9) : null);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export const HEAT_HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

export async function dashboard(branch: BranchFull) {
  const tz = branch.timezone;
  const now = new Date();
  const rows = await db.order.findMany({
    where: { branchId: branch.id, createdAt: { gte: new Date(now.getTime() - 35 * DAY) }, status: { not: "CANCELLED" } },
    select: {
      number: true, status: true, createdAt: true, readyAt: true, notifiedAt: true, pickedUpAt: true, pausedSec: true,
      etaFirstHighSec: true, claimKeys: true, reviewClicked: true, promiseBroken: true, unclaimedReason: true, dayKey: true, closedAt: true,
    },
  });
  const orders = rows.map((o) => {
    const lp = localParts(o.createdAt, tz);
    const prep = o.readyAt ? (o.readyAt.getTime() - o.createdAt.getTime()) / 1000 - o.pausedSec : null;
    const pickup = o.pickedUpAt && o.notifiedAt ? (o.pickedUpAt.getTime() - o.notifiedAt.getTime()) / 1000 : null;
    const total = o.pickedUpAt ? (o.pickedUpAt.getTime() - o.createdAt.getTime()) / 1000 - o.pausedSec : null;
    const kept = prep !== null && o.etaFirstHighSec ? prep <= o.etaFirstHighSec : null;
    return { ...o, lp, prep, pickup, total, kept, claimed: o.claimKeys !== "[]" };
  });

  const todayKey = dayKey(now, tz);
  const lastWeekKey = dayKey(new Date(now.getTime() - 7 * DAY), tz);
  const today = orders.filter((o) => o.dayKey === todayKey);
  const sameDayLastWeek = orders.filter((o) => o.dayKey === lastWeekKey && o.lp.minutesOfDay <= localParts(now, tz).minutesOfDay);
  const within = (from: number, to: number) => orders.filter((o) => o.createdAt.getTime() >= now.getTime() - from * DAY && o.createdAt.getTime() < now.getTime() - to * DAY);
  const last7 = within(7, 0);
  const prev7 = within(14, 7);
  const last28 = within(28, 0);

  const prepsOf = (xs: typeof orders) => xs.map((o) => o.prep).filter((x): x is number => x !== null && x > 0);
  const keptOf = (xs: typeof orders) => {
    const k = xs.map((o) => o.kept).filter((x): x is boolean => x !== null);
    return k.length ? k.filter(Boolean).length / k.length : null;
  };
  const summary = (xs: typeof orders) => ({
    count: xs.length,
    medianPrep: med(prepsOf(xs)),
    p90Prep: p90(prepsOf(xs)),
    medianTotal: med(xs.map((o) => o.total).filter((x): x is number => x !== null)),
    medianPickup: med(xs.map((o) => o.pickup).filter((x): x is number => x !== null)),
    unclaimed: xs.filter((o) => o.status === "UNCLAIMED").length,
    unclaimedRate: ratio(xs.filter((o) => o.status === "UNCLAIMED").length, xs.filter((o) => o.readyAt).length) ?? 0,
    promiseAccuracy: keptOf(xs),
    claimRate: ratio(xs.filter((o) => o.claimed).length, xs.length),
    reviewClicks: xs.filter((o) => o.reviewClicked).length,
  });

  const active = await db.order.findMany({ where: { branchId: branch.id, status: { in: ["CREATED", "PREPARING"] } }, orderBy: { createdAt: "asc" } });
  const longest = active[0];

  // الخريطة الحرارية: 7 أيام × 16 ساعة
  const cells: HourCell[] = [];
  for (let wd = 0; wd < 7; wd++) {
    for (const h of HEAT_HOURS) {
      const xs = last28.filter((o) => o.lp.weekday === wd && o.lp.hour === h);
      cells.push({ weekday: wd, hour: h, count: xs.length, p90PrepSec: p90(prepsOf(xs)) ?? 0 });
    }
  }
  const branchP90 = p90(prepsOf(last28)) ?? 0;

  const fb = await db.feedback.findMany({
    where: { order: { branchId: branch.id }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
    include: { order: { select: { createdAt: true, pickedUpAt: true, pausedSec: true } } },
  });
  const waitOf = (f: (typeof fb)[number]) => (f.order.pickedUpAt ? (f.order.pickedUpAt.getTime() - f.order.createdAt.getTime()) / 1000 - f.order.pausedSec : null);
  const bad = fb.filter((f) => f.score === 1);
  const feedback = {
    total: fb.length,
    bad: bad.length,
    ok: fb.filter((f) => f.score === 2).length,
    great: fb.filter((f) => f.score === 3).length,
    badLongWaitShare: ratio(bad.filter((f) => (waitOf(f) ?? 0) > 600).length, bad.length),
    reasons: Object.entries(
      bad.reduce<Record<string, number>>((a, f) => {
        if (f.reason) a[f.reason] = (a[f.reason] ?? 0) + 1;
        return a;
      }, {}),
    ).sort((a, b) => b[1] - a[1]),
    notes: fb.filter((f) => f.note).slice(-5).map((f) => ({ note: f.note!, score: f.score, at: f.createdAt.toISOString() })),
  };

  const stamps = await db.stampEntry.findMany({ where: { order: { branchId: branch.id }, at: { gte: new Date(now.getTime() - 7 * DAY) } }, select: { value: true, reason: true } });
  const redeemed = await db.redeemCode.count({ where: { branchId: branch.id, usedAt: { gte: new Date(now.getTime() - 7 * DAY) } } });
  const loyalty = {
    issued: stamps.reduce((a, s) => a + s.value, 0),
    apology: stamps.filter((s) => s.reason === "PROMISE_BROKEN").length,
    quiet: stamps.filter((s) => s.reason === "QUIET_HOUR").length,
    redeemed,
  };

  const w = summary(last7);
  const recs = recommend({
    cells,
    branchP90Sec: branchP90,
    unclaimedRate: w.unclaimedRate,
    promiseAccuracy: w.promiseAccuracy,
    claimRate: w.claimRate,
    prepMedianSec: w.medianPrep ?? 0,
    pickupMedianSec: w.medianPickup ?? 0,
  });

  const unclaimedList = orders
    .filter((o) => o.status === "UNCLAIMED" && o.createdAt.getTime() > now.getTime() - DAY)
    .map((o) => ({ number: o.number, readyAt: o.readyAt?.toISOString() ?? null, reason: o.unclaimedReason }));

  return {
    today: {
      ...summary(today),
      activeNow: active.length,
      longestSec: longest ? (now.getTime() - longest.createdAt.getTime()) / 1000 - longest.pausedSec : null,
      longestNumber: longest?.number ?? null,
      p90LastWeek: summary(sameDayLastWeek).p90Prep,
    },
    week: w,
    prevWeek: summary(prev7),
    cells,
    branchP90,
    feedback,
    loyalty,
    recs,
    unclaimedList,
    quietest: quietestWindow(cells),
    hasData: last28.length > 0,
  };
}
