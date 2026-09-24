/**
 * الوقت المتوقع V1: إحصاء بلا تعلّم آلي.
 * العيّنات: زمن التحضير الفعلي (ready - created - pause) مع ساعة الإنشاء وحجم الطابور وقتها.
 * نبحث عن أضيق مجموعة فيها عيّنات كافية، ثم نحسب التوزيع المشروط بالزمن المنقضي.
 */
export type EtaSample = { prepSec: number; hour: number; queue: number };
export type EtaResult = { lowSec: number; highSec: number; basis: "hour+queue" | "queue" | "hour" | "all" | "default" };

export function queueBucket(q: number): number {
  if (q <= 2) return 0;
  if (q <= 5) return 1;
  if (q <= 9) return 2;
  return 3;
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function pickGroup(samples: EtaSample[], hour: number, queue: number) {
  const b = queueBucket(queue);
  const byHQ = samples.filter((s) => s.hour === hour && queueBucket(s.queue) === b);
  if (byHQ.length >= 20) return { group: byHQ, basis: "hour+queue" as const };
  const byQ = samples.filter((s) => queueBucket(s.queue) === b);
  if (byQ.length >= 20) return { group: byQ, basis: "queue" as const };
  const byH = samples.filter((s) => s.hour === hour);
  if (byH.length >= 20) return { group: byH, basis: "hour" as const };
  if (samples.length >= 30) return { group: samples, basis: "all" as const };
  return null;
}

const MIN = 60;

export function estimate(
  samples: EtaSample[],
  ctx: { hour: number; queue: number; elapsedSec: number; defaultPrepMin: number },
): EtaResult {
  const picked = pickGroup(samples, ctx.hour, ctx.queue);
  if (!picked) {
    // لا بيانات كافية: نطاق حول الافتراضي الذي حدده المدير، مع أثر بسيط للطابور.
    const base = ctx.defaultPrepMin * MIN * (1 + Math.min(ctx.queue, 12) * 0.08);
    const low = Math.max(base * 0.75 - ctx.elapsedSec, 30);
    const high = Math.max(base * 1.3 - ctx.elapsedSec, low + MIN);
    return round({ lowSec: low, highSec: high, basis: "default" });
  }
  const remaining = picked.group
    .map((s) => s.prepSec)
    .filter((p) => p > ctx.elapsedSec)
    .map((p) => p - ctx.elapsedSec)
    .sort((a, b) => a - b);
  if (remaining.length < 5) return round({ lowSec: 30, highSec: 2 * MIN, basis: picked.basis });
  const low = quantile(remaining, 0.5);
  const high = Math.max(quantile(remaining, 0.8), low + MIN);
  return round({ lowSec: low, highSec: high, basis: picked.basis });
}

function round(r: EtaResult): EtaResult {
  const low = Math.max(MIN * Math.floor(r.lowSec / MIN), 30);
  const high = Math.max(MIN * Math.ceil(r.highSec / MIN), low + MIN);
  return { ...r, lowSec: low, highSec: high };
}

/** العتبة التي يُعتبر بعدها الطلب متأخرًا على لوحة الموظف. */
export function lateThresholdSec(samples: EtaSample[], defaultPrepMin: number): number {
  if (samples.length < 30) return Math.round(defaultPrepMin * 1.8 * MIN);
  const sorted = samples.map((s) => s.prepSec).sort((a, b) => a - b);
  return Math.round(quantile(sorted, 0.9));
}
