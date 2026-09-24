import type { Branch, Order, Station, Tenant } from "@prisma/client";
import { db } from "./db";
import { ch, publish } from "./hub";
import { encrypt, randomCode, randomDigits, randomToken, sha256 } from "./crypto";
import { etaFor, invalidateEta, lateThreshold } from "./eta";
import { parseSettings } from "./settings";
import { isViewing } from "./presence";
import { pushToOrder, recordAttempt } from "./notify";
import { getIntegrationsCached, smsEnabled, whatsappEnabled } from "./integrations";
import { canTransition, ACTIVE, OPEN, type CustomerState, type OrderStatus } from "@/core/states";
import { nextChecksumNumber, nextSequentialNumber, isValidChecksumNumber } from "@/core/numbering";
import { dayKey, localParts } from "@/core/time";
import { plan } from "@/core/escalation";
import { capDaily, isQuietTime, stampsFor } from "@/core/loyalty";
import { callMessage, label } from "@/core/copy";

export type BranchFull = Branch & { stations: Station[]; tenant: Tenant };

export class OrderError extends Error {
  constructor(public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function loadBranch(id: string): Promise<BranchFull | null> {
  return db.branch.findUnique({ where: { id }, include: { stations: { orderBy: { sort: "asc" } }, tenant: true } });
}

async function loadOrderWithBranch(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new OrderError("NOT_FOUND");
  const branch = await loadBranch(order.branchId);
  if (!branch) throw new OrderError("NOT_FOUND");
  return { order, branch };
}

async function log(order: Pick<Order, "id" | "branchId">, type: string, actor: string, meta?: Record<string, unknown>) {
  await db.orderEvent.create({ data: { orderId: order.id, branchId: order.branchId, type, actor, meta: meta ? JSON.stringify(meta) : null } });
}

const stationName = (branch: BranchFull, stationId: string | null) =>
  branch.stations.find((s) => s.id === stationId)?.name ?? branch.stations[0]?.name ?? parseSettings(branch.settings).defaultStation;

/* ================= Views ================= */

export type StaffOrder = {
  id: string;
  number: string;
  token: string;
  kind: string;
  summary: string | null;
  itemCount: number | null;
  status: string;
  customerState: string;
  noResponse: boolean;
  conflict: boolean;
  claimed: boolean;
  viewing: boolean;
  promiseBroken: boolean;
  createdAt: string;
  readyAt: string | null;
  pausedSec: number;
  reached: string[];
  stationId: string | null;
};

export async function staffView(order: Order): Promise<StaffOrder> {
  const attempts = order.readyAt
    ? await db.notificationAttempt.findMany({ where: { orderId: order.id, result: "SENT" }, select: { kind: true } })
    : [];
  const keys: string[] = JSON.parse(order.claimKeys || "[]");
  return {
    id: order.id,
    number: order.number,
    token: order.token,
    kind: order.kind,
    summary: order.summary,
    itemCount: order.itemCount,
    status: order.status,
    customerState: order.customerState,
    noResponse: order.noResponse,
    conflict: order.conflict,
    claimed: keys.length > 0,
    viewing: isViewing(order.id),
    promiseBroken: order.promiseBroken,
    createdAt: order.createdAt.toISOString(),
    readyAt: order.readyAt?.toISOString() ?? null,
    pausedSec: order.pausedSec,
    reached: [...new Set(attempts.map((a) => a.kind))],
    stationId: order.stationId,
  };
}

export type PublicView = {
  token: string;
  number: string;
  kind: string;
  label: string;
  status: string;
  customerState: string;
  promiseBroken: boolean;
  createdAt: string;
  readyAt: string | null;
  pickedUpAt: string | null;
  waitedSec: number | null;
  eta: { lowSec: number; highSec: number } | null;
  queueAhead: number;
  station: string;
  feedbackGiven: boolean;
  channels: { webpush: boolean; sms: boolean; whatsapp: boolean };
  branch: {
    name: string;
    brand: string;
    slug: string;
    color: string;
    showMascot: boolean;
    paused: boolean;
    waitingLine: string;
    reviewUrl: string | null;
    smsNumber: string | null;
    smsEnabled: boolean;
    whatsappNumber: string | null;
    wifiSsid: string | null;
    loyaltyEnabled: boolean;
  };
  serverTime: string;
};

export async function publicView(order: Order, branch: BranchFull): Promise<PublicView> {
  const s = parseSettings(branch.settings);
  const i = await getIntegrationsCached(branch.tenantId);
  const active = (ACTIVE as string[]).includes(order.status);
  const queueAhead = active
    ? await db.order.count({ where: { branchId: branch.id, status: { in: ACTIVE }, createdAt: { lt: order.createdAt } } })
    : 0;
  const eta = active ? await etaFor(branch, { createdAt: order.createdAt, queue: order.queueAtCreate, pausedSec: order.pausedSec }) : null;
  const [channels, feedback] = await Promise.all([
    db.channel.findMany({ where: { orderId: order.id, expiresAt: { gt: new Date() } }, select: { kind: true } }),
    db.feedback.findUnique({ where: { orderId: order.id }, select: { id: true } }),
  ]);
  const kinds = new Set(channels.map((c) => c.kind));
  return {
    token: order.token,
    number: order.number,
    kind: order.kind,
    label: label(order.kind),
    status: order.status,
    customerState: order.customerState,
    promiseBroken: order.promiseBroken,
    createdAt: order.createdAt.toISOString(),
    readyAt: order.readyAt?.toISOString() ?? null,
    pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    waitedSec: order.pickedUpAt ? Math.round((order.pickedUpAt.getTime() - order.createdAt.getTime()) / 1000) : null,
    eta: eta ? { lowSec: eta.lowSec, highSec: eta.highSec } : null,
    queueAhead,
    station: stationName(branch, order.stationId),
    feedbackGiven: !!feedback,
    channels: { webpush: kinds.has("WEBPUSH"), sms: kinds.has("SMS"), whatsapp: kinds.has("WHATSAPP") },
    branch: {
      name: branch.name,
      brand: branch.tenant.name,
      slug: branch.slug,
      color: branch.brandColor,
      showMascot: s.showMascot,
      paused: branch.status === "PAUSED",
      waitingLine: s.waitingLine,
      reviewUrl: s.googlePlaceId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(s.googlePlaceId)}` : null,
      smsNumber: smsEnabled(i) && i["sms.inboundNumber"] ? i["sms.inboundNumber"]! : null,
      smsEnabled: smsEnabled(i),
      whatsappNumber: whatsappEnabled(i) ? i["wa.businessNumber"]! : null,
      wifiSsid: s.wifi.ssid || null,
      loyaltyEnabled: s.loyalty.enabled,
    },
    serverTime: new Date().toISOString(),
  };
}

/** يبث تغيّر الطلب إلى الموظف والعميل وشاشة الأرقام. */
export async function emit(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const branch = await loadBranch(order.branchId);
  if (!branch) return;
  publish(ch.branch(branch.id), { type: "order", order: await staffView(order) });
  publish(ch.order(order.id), { type: "order", view: await publicView(order, branch) });
  publish(ch.tick(branch.id), { type: "tick" });
}

export async function emitBranch(branchId: string) {
  const b = await db.branch.findUnique({ where: { id: branchId } });
  if (!b) return;
  publish(ch.branch(branchId), { type: "branch", status: b.status, pausedAt: b.pausedAt?.toISOString() ?? null });
  publish(ch.tick(branchId), { type: "tick" });
}

/* ================= Create ================= */

export async function createOrder(
  branch: BranchFull,
  input: { number?: string; summary?: string; itemCount?: number; force?: boolean; stationId?: string | null },
  actor: string,
) {
  const s = parseSettings(branch.settings);
  const now = new Date();
  const recentSince = new Date(now.getTime() - 2 * 3600 * 1000);
  const recent = await db.order.findMany({
    where: { branchId: branch.id, createdAt: { gte: recentSince }, status: { not: "CANCELLED" } },
    select: { id: true, number: true, status: true, createdAt: true },
  });
  const taken = new Set(recent.map((r) => r.number));

  let number = input.number?.trim();
  let cursor = branch.numberCursor;
  if (!number) {
    const r =
      branch.numbering === "CHECKSUM"
        ? nextChecksumNumber(cursor, s.numberDigits, (n) => taken.has(n))
        : nextSequentialNumber(cursor, s.numberDigits, (n) => taken.has(n));
    number = r.number;
    cursor = r.cursor;
  } else {
    if (!/^[0-9A-Za-z-]{1,8}$/.test(number)) throw new OrderError("BAD_NUMBER");
    const dup = recent.find((r) => r.number === number);
    if (dup && !input.force) {
      throw new OrderError("DUPLICATE", { minutesAgo: Math.round((now.getTime() - dup.createdAt.getTime()) / 60000), status: dup.status });
    }
  }

  const queue = await db.order.count({ where: { branchId: branch.id, status: { in: ACTIVE } } });
  const eta = await etaFor(branch, { createdAt: now, queue, pausedSec: 0 }, now);
  const stationId = input.stationId && branch.stations.some((st) => st.id === input.stationId) ? input.stationId : null;

  const order = await db.order.create({
    data: {
      branchId: branch.id,
      number,
      token: randomToken(9),
      kind: branch.mode === "TICKET" ? "TICKET" : "ORDER",
      summary: input.summary?.slice(0, 80) || null,
      itemCount: input.itemCount ?? null,
      dayKey: dayKey(now, branch.timezone),
      queueAtCreate: queue,
      createdAt: now,
      etaLowSec: eta.lowSec,
      etaHighSec: eta.highSec,
      etaFirstHighSec: eta.highSec,
      stationId,
      source: actor.startsWith("device:") ? "TABLET" : "API",
    },
  });
  if (cursor !== branch.numberCursor) await db.branch.update({ where: { id: branch.id }, data: { numberCursor: cursor } });
  await log(order, "CREATED", actor, { queue, eta });
  await emit(order.id);
  return order;
}

/* ================= Transitions ================= */

function assertTransition(order: Order, to: OrderStatus) {
  if (!canTransition(order.status, to)) throw new OrderError("BAD_TRANSITION", { from: order.status, to });
}

export async function markPreparing(orderId: string, actor: string) {
  const { order, branch } = await loadOrderWithBranch(orderId);
  if (order.status === "PREPARING") return order;
  assertTransition(order, "PREPARING");
  const updated = await db.order.update({ where: { id: order.id }, data: { status: "PREPARING", preparingAt: new Date() } });
  await log(order, "PREPARING", actor);
  await emit(order.id);
  if (parseSettings(branch.settings).nearNotify) {
    void pushToOrder(order.id, "NEAR", {
      title: `بدأ تحضير ${label(order.kind)} ${order.number}`,
      body: `يمكنك التوجه إلى ${stationName(branch, order.stationId)}.`,
      url: `/o/${order.token}`,
      tag: `dorak-${order.id}-near`,
    });
  }
  return updated;
}

async function scheduleEscalation(order: Order, branch: BranchFull, from: Date) {
  await db.escalationJob.updateMany({ where: { orderId: order.id, doneAt: null }, data: { doneAt: new Date() } });
  const steps = plan(from, parseSettings(branch.settings).escalation);
  await db.escalationJob.createMany({ data: steps.map((s) => ({ orderId: order.id, step: s.step, runAt: s.runAt })) });
}

async function cancelEscalation(orderId: string, steps?: string[]) {
  await db.escalationJob.updateMany({
    where: { orderId, doneAt: null, ...(steps ? { step: { in: steps } } : {}) },
    data: { doneAt: new Date() },
  });
}

async function callNow(order: Order, branch: BranchFull, step: string) {
  await recordAttempt(order.id, "PAGE", step, isViewing(order.id) ? "SENT" : "SKIPPED", isViewing(order.id) ? undefined : "NOT_VIEWING");
  await pushToOrder(order.id, step, {
    title: `حان دورك · ${label(order.kind)} ${order.number}`,
    body: callMessage({ kind: order.kind, number: order.number, station: stationName(branch, order.stationId), branchName: branch.tenant.name }),
    url: `/o/${order.token}?call=1`,
    tag: `dorak-${order.id}-call`,
  });
}

export async function markReady(orderId: string, actor: string) {
  const { order, branch } = await loadOrderWithBranch(orderId);
  if (order.status === "READY") return order;
  assertTransition(order, "READY");
  const now = new Date();
  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: "READY", readyAt: now, notifiedAt: now, noResponse: false, preparingAt: order.preparingAt ?? null },
  });
  await log(order, "READY", actor);
  await scheduleEscalation(updated, branch, now);
  invalidateEta(branch.id);
  await emit(order.id);
  void callNow(updated, branch, "CALL").then(() => emit(order.id));
  return updated;
}

export async function recall(orderId: string, actor: string) {
  const { order, branch } = await loadOrderWithBranch(orderId);
  if (order.status !== "READY" && order.status !== "UNCLAIMED") throw new OrderError("BAD_TRANSITION");
  const now = new Date();
  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: "READY", notifiedAt: now, noResponse: false, closedAt: null, unclaimedReason: null },
  });
  await log(order, "RECALL", actor);
  await scheduleEscalation(updated, branch, now);
  await emit(order.id);
  void callNow(updated, branch, "RECALL").then(() => emit(order.id));
  return updated;
}

export async function pickUp(orderId: string, actor: string) {
  const { order, branch } = await loadOrderWithBranch(orderId);
  if (order.status === "PICKED_UP") return order;
  if (order.status === "CREATED" || order.status === "PREPARING") {
    // الموظف سلّم مباشرة بلا نداء: نسجّل الجاهزية أولًا
    await db.order.update({ where: { id: order.id }, data: { status: "READY", readyAt: new Date(), notifiedAt: new Date() } });
    await log(order, "READY", actor, { implicit: true });
  } else {
    assertTransition(order, "PICKED_UP");
  }
  const now = new Date();
  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: "PICKED_UP", pickedUpAt: now, closedAt: now, ackAt: order.ackAt ?? now, noResponse: false },
  });
  await cancelEscalation(order.id);
  await log(order, "PICKED_UP", actor);
  await awardStamps(updated, branch).catch((e) => console.error("[dorak] stamps", e));
  invalidateEta(branch.id);
  await emit(order.id);
  return updated;
}

export async function cancel(orderId: string, actor: string, reason?: string) {
  const { order } = await loadOrderWithBranch(orderId);
  if (order.status === "CANCELLED") return order;
  assertTransition(order, "CANCELLED");
  const updated = await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED", closedAt: new Date(), cancelReason: reason ?? null } });
  await cancelEscalation(order.id);
  await log(order, "CANCELLED", actor, { reason });
  await emit(order.id);
  return updated;
}

export async function markUnclaimed(orderId: string, actor: string, reason?: string) {
  const { order } = await loadOrderWithBranch(orderId);
  if (order.status !== "READY") return order;
  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: "UNCLAIMED", closedAt: new Date(), unclaimedReason: reason ?? "NO_SHOW" },
  });
  await cancelEscalation(order.id);
  await log(order, "UNCLAIMED", actor, { reason });
  await emit(order.id);
  return updated;
}

export async function setCustomerState(orderId: string, state: CustomerState) {
  const { order, branch } = await loadOrderWithBranch(orderId);
  if (!(OPEN as string[]).includes(order.status)) throw new OrderError("CLOSED");
  const data: Partial<Order> = { customerState: state };
  if (order.status === "READY" && (state === "ON_MY_WAY" || state === "STEPPED_OUT" || state === "IN_CAR")) {
    data.ackAt = order.ackAt ?? new Date();
    data.noResponse = false;
    await cancelEscalation(order.id, ["WHATSAPP", "SMS", "STAFF_ALERT"]);
    if (state === "STEPPED_OUT") {
      // نمدّد مهلة عدم الاستلام بدل أن نعلّم الطلب
      await cancelEscalation(order.id, ["UNCLAIMED"]);
      const extra = parseSettings(branch.settings).escalation.unclaimedAfterSec;
      await db.escalationJob.create({ data: { orderId: order.id, step: "UNCLAIMED", runAt: new Date(Date.now() + extra * 1000) } });
    }
  }
  await db.order.update({ where: { id: order.id }, data });
  await log(order, `CUSTOMER:${state}`, "customer");
  await emit(order.id);
}

/* ================= Claim ================= */

export async function recentUnclaimed(branchId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db.order.findMany({
    where: { branchId, createdAt: { gte: since }, status: { in: OPEN }, claimKeys: "[]" },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { number: true, itemCount: true, createdAt: true, kind: true },
  });
  return rows.map((r) => ({ number: r.number, itemCount: r.itemCount, ageSec: Math.round((Date.now() - r.createdAt.getTime()) / 1000), kind: r.kind }));
}

export async function claim(branch: BranchFull, number: string, deviceKey: string) {
  const n = number.trim();
  if (branch.numbering === "CHECKSUM" && /^\d+$/.test(n) && !isValidChecksumNumber(n)) throw new OrderError("INVALID_NUMBER");
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const order = await db.order.findFirst({
    where: { branchId: branch.id, number: n, createdAt: { gte: since }, status: { in: [...OPEN, "PICKED_UP"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!order) throw new OrderError("NOT_FOUND");
  const keys: string[] = JSON.parse(order.claimKeys || "[]");
  if (keys.includes(deviceKey)) return order;
  if (order.status === "PICKED_UP") throw new OrderError("NOT_FOUND");
  keys.push(deviceKey);
  const conflict = keys.length > 1;
  await db.order.update({
    where: { id: order.id },
    data: { claimKeys: JSON.stringify(keys.slice(0, 5)), claimedAt: order.claimedAt ?? new Date(), conflict },
  });
  await log(order, conflict ? "CLAIM_CONFLICT" : "CLAIMED", "customer", { devices: keys.length });
  await emit(order.id);
  return order;
}

/** يحل تعارض الربط: يبقي الجهاز الأول (keep=first) أو يفك الربط كله ليُعاد المسح (keep=none). */
export async function resolveConflict(orderId: string, keep: "first" | "none", actor: string) {
  const { order } = await loadOrderWithBranch(orderId);
  const keys: string[] = JSON.parse(order.claimKeys || "[]");
  const next = keep === "first" ? keys.slice(0, 1) : [];
  await db.order.update({ where: { id: order.id }, data: { claimKeys: JSON.stringify(next), conflict: false } });
  await log(order, "CLAIM_RESOLVED", actor, { keep });
  await emit(order.id);
}

export async function addChannel(orderId: string, kind: "WEBPUSH" | "SMS" | "WHATSAPP", address: string) {
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const existing = await db.channel.findMany({ where: { orderId, kind } });
  if (existing.length >= 3) await db.channel.delete({ where: { id: existing[0].id } });
  await db.channel.create({ data: { orderId, kind, address: encrypt(address), expiresAt } });
  await emit(orderId);
}

/* ================= Ticket mode ================= */

export async function callNext(branch: BranchFull, actor: string) {
  const next = await db.order.findFirst({ where: { branchId: branch.id, status: { in: ACTIVE } }, orderBy: { createdAt: "asc" } });
  if (!next) throw new OrderError("QUEUE_EMPTY");
  return markReady(next.id, actor);
}

/* ================= Prayer pause ================= */

export async function setPause(branchId: string, on: boolean, actor: string) {
  const branch = await db.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new OrderError("NOT_FOUND");
  if (on && branch.status !== "PAUSED") {
    await db.branch.update({ where: { id: branchId }, data: { status: "PAUSED", pausedAt: new Date() } });
  } else if (!on && branch.status === "PAUSED") {
    const pausedSec = branch.pausedAt ? Math.round((Date.now() - branch.pausedAt.getTime()) / 1000) : 0;
    const active = await db.order.findMany({ where: { branchId, status: { in: ACTIVE } }, select: { id: true, pausedSec: true, createdAt: true } });
    for (const o of active) {
      const sec = Math.min(pausedSec, Math.round((Date.now() - o.createdAt.getTime()) / 1000));
      await db.order.update({ where: { id: o.id }, data: { pausedSec: o.pausedSec + sec } });
    }
    await db.branch.update({ where: { id: branchId }, data: { status: "OPEN", pausedAt: null } });
  }
  console.info(`[dorak] branch ${branchId} ${on ? "paused" : "resumed"} by ${actor}`);
  await emitBranch(branchId);
  const open = await db.order.findMany({ where: { branchId, status: { in: OPEN } }, select: { id: true } });
  for (const o of open) publish(ch.order(o.id), { type: "tick" });
}

/* ================= Loyalty ================= */

async function awardStamps(order: Order, branch: BranchFull) {
  const s = parseSettings(branch.settings).loyalty;
  if (!s.enabled) return;
  const keys: string[] = JSON.parse(order.claimKeys || "[]");
  if (keys.length === 0) return;
  const keyHash = sha256(keys[0]);
  const card = await db.loyaltyCard.upsert({
    where: { tenantId_keyHash: { tenantId: branch.tenantId, keyHash } },
    create: { tenantId: branch.tenantId, keyHash },
    update: {},
  });
  const local = localParts(order.createdAt, branch.timezone);
  const fast = !!order.notifiedAt && !!order.pickedUpAt && order.pickedUpAt.getTime() - order.notifiedAt.getTime() <= 60000;
  const entries = stampsFor({ quiet: isQuietTime(local.minutesOfDay, s.quietHours), fastPickup: fast, promiseBroken: order.promiseBroken }, s);
  const nowLocal = localParts(new Date(), branch.timezone);
  const dayStart = new Date(Date.now() - nowLocal.minutesOfDay * 60000);
  const today = await db.stampEntry.aggregate({ where: { cardId: card.id, at: { gte: dayStart }, value: { gt: 0 } }, _sum: { value: true } });
  const capped = capDaily(entries, today._sum.value ?? 0, s.dailyMax);
  let total = 0;
  for (const e of capped) {
    try {
      await db.stampEntry.create({ data: { cardId: card.id, orderId: order.id, value: e.value, reason: e.reason } });
      total += e.value;
    } catch {
      /* مكرر */
    }
  }
  if (total > 0) await db.loyaltyCard.update({ where: { id: card.id }, data: { stamps: { increment: total } } });
}

export async function cardFor(branch: BranchFull, deviceKey: string) {
  const s = parseSettings(branch.settings).loyalty;
  const card = await db.loyaltyCard.findUnique({
    where: { tenantId_keyHash: { tenantId: branch.tenantId, keyHash: sha256(deviceKey) } },
    include: { entries: { orderBy: { at: "desc" }, take: 8, include: { order: { select: { number: true } } } } },
  });
  const local = localParts(new Date(), branch.timezone);
  return {
    enabled: s.enabled,
    goal: s.goal,
    reward: s.reward,
    stamps: card?.stamps ?? 0,
    redeemed: card?.redeemed ?? 0,
    quietNow: isQuietTime(local.minutesOfDay, s.quietHours),
    quietHours: s.quietHours,
    entries: (card?.entries ?? []).map((e) => ({ value: e.value, reason: e.reason, at: e.at.toISOString(), number: e.order.number })),
  };
}

export async function createRedeemCode(branch: BranchFull, deviceKey: string) {
  const s = parseSettings(branch.settings).loyalty;
  const card = await db.loyaltyCard.findUnique({ where: { tenantId_keyHash: { tenantId: branch.tenantId, keyHash: sha256(deviceKey) } } });
  if (!s.enabled || !card || card.stamps < s.goal) throw new OrderError("NOT_ENOUGH_STAMPS");
  let code = randomDigits(4);
  for (let i = 0; i < 5; i++) {
    const clash = await db.redeemCode.findFirst({ where: { branchId: branch.id, code, usedAt: null, expiresAt: { gt: new Date() } } });
    if (!clash) break;
    code = randomDigits(4);
  }
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.redeemCode.create({ data: { cardId: card.id, branchId: branch.id, code, expiresAt } });
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function redeemCode(branch: BranchFull, code: string, actor: string) {
  const s = parseSettings(branch.settings).loyalty;
  const rc = await db.redeemCode.findFirst({
    where: { branchId: branch.id, code, usedAt: null, expiresAt: { gt: new Date() } },
    include: { card: true },
  });
  if (!rc) throw new OrderError("CODE_INVALID");
  if (rc.card.stamps < s.goal) throw new OrderError("NOT_ENOUGH_STAMPS");
  await db.$transaction([
    db.redeemCode.update({ where: { id: rc.id }, data: { usedAt: new Date() } }),
    db.loyaltyCard.update({ where: { id: rc.cardId }, data: { stamps: { decrement: s.goal }, redeemed: { increment: 1 } } }),
  ]);
  console.info(`[dorak] reward redeemed at ${branch.slug} by ${actor}`);
  return { reward: s.reward };
}

/* ================= Staff snapshot ================= */

export async function boardSnapshot(branch: BranchFull) {
  const since = new Date(Date.now() - 20 * 60 * 1000);
  const orders = await db.order.findMany({
    where: {
      branchId: branch.id,
      OR: [{ status: { in: OPEN } }, { status: "UNCLAIMED", closedAt: { gte: since } }],
    },
    orderBy: { createdAt: "asc" },
  });
  const today = dayKey(new Date(), branch.timezone);
  const done = await db.order.findMany({
    where: { branchId: branch.id, dayKey: today, readyAt: { not: null } },
    select: { createdAt: true, readyAt: true, pausedSec: true, status: true },
  });
  const prep = done.map((o) => (o.readyAt!.getTime() - o.createdAt.getTime()) / 1000 - o.pausedSec).sort((a, b) => a - b);
  const todayCount = await db.order.count({ where: { branchId: branch.id, dayKey: today, status: { not: "CANCELLED" } } });
  const unclaimedToday = done.filter((o) => o.status === "UNCLAIMED").length;
  return {
    branch: {
      id: branch.id,
      name: branch.name,
      brand: branch.tenant.name,
      color: branch.brandColor,
      mode: branch.mode,
      numbering: branch.numbering,
      status: branch.status,
      pausedAt: branch.pausedAt?.toISOString() ?? null,
      stations: branch.stations.map((s) => ({ id: s.id, name: s.name })),
      loyaltyEnabled: parseSettings(branch.settings).loyalty.enabled,
    },
    orders: await Promise.all(orders.map(staffView)),
    stats: {
      today: todayCount,
      medianPrepSec: prep.length ? prep[Math.floor(prep.length / 2)] : null,
      unclaimedToday,
      lateThresholdSec: await lateThreshold(branch),
    },
    serverTime: new Date().toISOString(),
  };
}

export { randomCode };
