export type LoyaltySettings = {
  enabled: boolean;
  goal: number;
  reward: string;
  dailyMax: number;
  quietHours: { from: string; to: string }[];
  fastPickupBonus: boolean;
  apologyStamp: boolean;
};

export type StampReason = "PICKUP" | "QUIET_HOUR" | "FAST_PICKUP" | "PROMISE_BROKEN";

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

export function isQuietTime(minutesOfDay: number, ranges: { from: string; to: string }[]): boolean {
  return ranges.some((r) => {
    const a = toMinutes(r.from);
    const b = toMinutes(r.to);
    if (a === null || b === null) return false;
    return a <= b ? minutesOfDay >= a && minutesOfDay < b : minutesOfDay >= a || minutesOfDay < b;
  });
}

export function stampsFor(
  ctx: { quiet: boolean; fastPickup: boolean; promiseBroken: boolean },
  s: LoyaltySettings,
): { value: number; reason: StampReason }[] {
  if (!s.enabled) return [];
  const out: { value: number; reason: StampReason }[] = [
    ctx.quiet ? { value: 2, reason: "QUIET_HOUR" } : { value: 1, reason: "PICKUP" },
  ];
  if (ctx.fastPickup && s.fastPickupBonus) out.push({ value: 0.5, reason: "FAST_PICKUP" });
  if (ctx.promiseBroken && s.apologyStamp) out.push({ value: 1, reason: "PROMISE_BROKEN" });
  return out;
}

/** يقص الأختام بحيث لا يتجاوز مجموع اليوم الحد الأقصى. */
export function capDaily<T extends { value: number }>(entries: T[], alreadyToday: number, dailyMax: number): T[] {
  let room = Math.max(dailyMax - alreadyToday, 0);
  const out: T[] = [];
  for (const e of entries) {
    if (room <= 0) break;
    const v = Math.min(e.value, room);
    out.push({ ...e, value: v });
    room -= v;
  }
  return out;
}
