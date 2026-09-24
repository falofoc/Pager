const g = globalThis as unknown as { __dorakPresence?: Map<string, number> };
const seen = g.__dorakPresence ?? new Map<string, number>();
g.__dorakPresence = seen;

export function touch(orderId: string) {
  seen.set(orderId, Date.now());
}

export function isViewing(orderId: string, withinMs = 30000) {
  const t = seen.get(orderId);
  return !!t && Date.now() - t < withinMs;
}

export function sweepPresence() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of seen) if (v < cutoff) seen.delete(k);
}
