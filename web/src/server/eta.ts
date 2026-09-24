import type { Branch } from "@prisma/client";
import { db } from "./db";
import { estimate, lateThresholdSec, type EtaSample } from "@/core/eta";
import { localParts } from "@/core/time";
import { parseSettings } from "./settings";

type Profile = { samples: EtaSample[]; at: number };
const g = globalThis as unknown as { __dorakEta?: Map<string, Profile> };
const cache = g.__dorakEta ?? new Map<string, Profile>();
g.__dorakEta = cache;

const TTL = 5 * 60 * 1000;

export async function samplesFor(branch: Branch): Promise<EtaSample[]> {
  const hit = cache.get(branch.id);
  if (hit && Date.now() - hit.at < TTL) return hit.samples;
  const since = new Date(Date.now() - 28 * 24 * 3600 * 1000);
  const rows = await db.order.findMany({
    where: { branchId: branch.id, createdAt: { gte: since }, readyAt: { not: null } },
    select: { createdAt: true, readyAt: true, pausedSec: true, queueAtCreate: true },
  });
  const samples = rows
    .map((r) => ({
      prepSec: (r.readyAt!.getTime() - r.createdAt.getTime()) / 1000 - r.pausedSec,
      hour: localParts(r.createdAt, branch.timezone).hour,
      queue: r.queueAtCreate,
    }))
    .filter((s) => s.prepSec > 5 && s.prepSec < 3 * 3600);
  cache.set(branch.id, { samples, at: Date.now() });
  return samples;
}

export function invalidateEta(branchId: string) {
  cache.delete(branchId);
}

export async function etaFor(branch: Branch, o: { createdAt: Date; queue: number; pausedSec: number }, now = new Date()) {
  const s = parseSettings(branch.settings);
  const samples = await samplesFor(branch);
  const pausedNow = branch.status === "PAUSED" && branch.pausedAt ? (now.getTime() - branch.pausedAt.getTime()) / 1000 : 0;
  const elapsed = Math.max((now.getTime() - o.createdAt.getTime()) / 1000 - o.pausedSec - pausedNow, 0);
  return estimate(samples, {
    hour: localParts(o.createdAt, branch.timezone).hour,
    queue: o.queue,
    elapsedSec: elapsed,
    defaultPrepMin: s.defaultPrepMin,
  });
}

export async function lateThreshold(branch: Branch) {
  return lateThresholdSec(await samplesFor(branch), parseSettings(branch.settings).defaultPrepMin);
}
