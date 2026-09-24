import { db } from "./db";
import { isViewing, sweepPresence } from "./presence";
import { emit, loadBranch, markUnclaimed } from "./orders";
import { sendToOrderChannels, recordAttempt } from "./notify";
import { etaFor } from "./eta";
import { skipPaidChannels, shouldAlertStaff } from "@/core/escalation";
import { callMessage, label } from "@/core/copy";
import { parseSettings } from "./settings";
import { ACTIVE } from "@/core/states";

const g = globalThis as unknown as { __dorakScheduler?: NodeJS.Timeout; __dorakTickRunning?: boolean };
let lastPromise = 0;
let lastCleanup = 0;

export function startScheduler() {
  if (g.__dorakScheduler) return;
  g.__dorakScheduler = setInterval(() => void tick(), 2000);
  console.info("[dorak] scheduler started");
}

async function tick() {
  if (g.__dorakTickRunning) return;
  g.__dorakTickRunning = true;
  try {
    await runDueJobs();
    if (Date.now() - lastPromise > 5000) {
      lastPromise = Date.now();
      await checkPromises();
    }
    if (Date.now() - lastCleanup > 10 * 60 * 1000) {
      lastCleanup = Date.now();
      await cleanup();
    }
  } catch (e) {
    console.error("[dorak] scheduler", e);
  } finally {
    g.__dorakTickRunning = false;
  }
}

async function runDueJobs() {
  const jobs = await db.escalationJob.findMany({ where: { doneAt: null, runAt: { lte: new Date() } }, orderBy: { runAt: "asc" }, take: 50 });
  for (const job of jobs) {
    const claimed = await db.escalationJob.updateMany({ where: { id: job.id, doneAt: null }, data: { doneAt: new Date() } });
    if (claimed.count === 0) continue;
    const order = await db.order.findUnique({ where: { id: job.orderId } });
    if (!order || order.status !== "READY") continue;
    const branch = await loadBranch(order.branchId);
    if (!branch) continue;
    const ctx = { viewing: isViewing(order.id), customerState: order.customerState, acked: false };
    const station = branch.stations.find((s) => s.id === order.stationId)?.name ?? branch.stations[0]?.name ?? parseSettings(branch.settings).defaultStation;
    const text = callMessage({ kind: order.kind, number: order.number, station, branchName: branch.tenant.name });

    switch (job.step) {
      case "WHATSAPP":
      case "SMS": {
        if (skipPaidChannels(ctx)) {
          await recordAttempt(order.id, job.step, job.step, "SKIPPED", ctx.viewing ? "VIEWING" : order.customerState);
          break;
        }
        const sent = await sendToOrderChannels(order.id, branch.tenantId, job.step, job.step, text);
        if (sent) await emit(order.id);
        break;
      }
      case "STAFF_ALERT": {
        if (!shouldAlertStaff(ctx)) break;
        await db.order.update({ where: { id: order.id }, data: { noResponse: true } });
        await recordAttempt(order.id, "STAFF", "STAFF_ALERT", "SENT");
        await db.orderEvent.create({ data: { orderId: order.id, branchId: order.branchId, type: "NO_RESPONSE", actor: "system" } });
        await emit(order.id);
        break;
      }
      case "UNCLAIMED": {
        await markUnclaimed(order.id, "system", "NO_SHOW");
        break;
      }
    }
    void label;
  }
}

async function checkPromises() {
  const orders = await db.order.findMany({
    where: { status: { in: ACTIVE }, promiseBroken: false, etaFirstHighSec: { not: null } },
    take: 500,
  });
  const now = Date.now();
  const branches = new Map<string, Awaited<ReturnType<typeof loadBranch>>>();
  for (const o of orders) {
    if (!branches.has(o.branchId)) branches.set(o.branchId, await loadBranch(o.branchId));
    const b = branches.get(o.branchId);
    if (!b || b.status === "PAUSED") continue;
    const elapsed = (now - o.createdAt.getTime()) / 1000 - o.pausedSec;
    if (elapsed <= (o.etaFirstHighSec ?? Infinity)) continue;
    const eta = await etaFor(b, { createdAt: o.createdAt, queue: o.queueAtCreate, pausedSec: o.pausedSec });
    await db.order.update({ where: { id: o.id }, data: { promiseBroken: true, etaLowSec: eta.lowSec, etaHighSec: eta.highSec } });
    await db.orderEvent.create({ data: { orderId: o.id, branchId: o.branchId, type: "PROMISE_BROKEN", actor: "system", meta: JSON.stringify({ elapsed }) } });
    await emit(o.id);
  }
}

async function cleanup() {
  const now = new Date();
  await db.channel.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.redeemCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000) }, usedAt: null } });
  await db.escalationJob.deleteMany({ where: { doneAt: { lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } } });
  sweepPresence();
}
