import { describe, it, expect } from "vitest";
import { checkDigit, isValidChecksumNumber, nextChecksumNumber, nextSequentialNumber } from "./numbering";
import { canTransition } from "./states";
import { estimate, quantile, queueBucket, lateThresholdSec } from "./eta";
import { isQuietTime, stampsFor, capDaily, type LoyaltySettings } from "./loyalty";
import { plan, skipPaidChannels } from "./escalation";
import { dayKey, localParts } from "./time";
import { recommend } from "./insights";

describe("numbering", () => {
  it("generates numbers that validate", () => {
    let cursor = 0;
    const used = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = nextChecksumNumber(cursor, 3, (n) => used.has(n));
      expect(isValidChecksumNumber(r.number)).toBe(true);
      used.add(r.number);
      cursor = r.cursor;
      if (used.size >= 70) used.clear();
    }
  });
  it("detects every single-digit error and adjacent swap for all 3-digit numbers", () => {
    for (let b = 10; b <= 99; b++) {
      const c = checkDigit(String(b));
      if (c === null) continue;
      const num = `${b}${c}`;
      for (let pos = 0; pos < 3; pos++) {
        for (let d = 0; d <= 9; d++) {
          if (String(d) === num[pos]) continue;
          const bad = num.slice(0, pos) + d + num.slice(pos + 1);
          expect(isValidChecksumNumber(bad)).toBe(false);
        }
      }
      for (let pos = 0; pos < 2; pos++) {
        if (num[pos] === num[pos + 1]) continue;
        const sw = num.slice(0, pos) + num[pos + 1] + num[pos] + num.slice(pos + 2);
        expect(isValidChecksumNumber(sw)).toBe(false);
      }
    }
  });
  it("skips taken numbers and wraps", () => {
    const first = nextChecksumNumber(0, 3, () => false);
    const second = nextChecksumNumber(first.cursor, 3, (n) => n === first.number);
    expect(second.number).not.toBe(first.number);
    expect(() => nextChecksumNumber(0, 3, () => true)).toThrow();
  });
  it("sequential numbering wraps", () => {
    expect(nextSequentialNumber(0, 3, () => false).number).toBe("1");
    expect(nextSequentialNumber(999, 3, () => false).number).toBe("1");
  });
});

describe("states", () => {
  it("allows the golden path and blocks going back", () => {
    expect(canTransition("CREATED", "READY")).toBe(true);
    expect(canTransition("READY", "PICKED_UP")).toBe(true);
    expect(canTransition("PICKED_UP", "READY")).toBe(false);
    expect(canTransition("CANCELLED", "READY")).toBe(false);
  });
});

describe("eta", () => {
  const samples = Array.from({ length: 200 }, (_, i) => ({ prepSec: 180 + (i % 10) * 30, hour: 9, queue: i % 4 }));
  it("returns a range in whole minutes with high > low", () => {
    const r = estimate(samples, { hour: 9, queue: 1, elapsedSec: 0, defaultPrepMin: 5 });
    expect(r.highSec).toBeGreaterThan(r.lowSec);
    expect(r.lowSec % 60).toBe(0);
    expect(r.basis).toBe("hour+queue");
  });
  it("shrinks as time passes", () => {
    const a = estimate(samples, { hour: 9, queue: 1, elapsedSec: 0, defaultPrepMin: 5 });
    const b = estimate(samples, { hour: 9, queue: 1, elapsedSec: 240, defaultPrepMin: 5 });
    expect(b.highSec).toBeLessThanOrEqual(a.highSec);
  });
  it("falls back to default without data", () => {
    const r = estimate([], { hour: 9, queue: 0, elapsedSec: 0, defaultPrepMin: 5 });
    expect(r.basis).toBe("default");
    expect(r.lowSec).toBeGreaterThanOrEqual(180);
  });
  it("helpers", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(queueBucket(0)).toBe(0);
    expect(queueBucket(12)).toBe(3);
    expect(lateThresholdSec([], 5)).toBe(540);
  });
});

describe("loyalty", () => {
  const s: LoyaltySettings = { enabled: true, goal: 10, reward: "", dailyMax: 3, quietHours: [{ from: "15:00", to: "17:00" }], fastPickupBonus: true, apologyStamp: true };
  it("quiet time windows incl. overnight", () => {
    expect(isQuietTime(15 * 60 + 30, s.quietHours)).toBe(true);
    expect(isQuietTime(17 * 60, s.quietHours)).toBe(false);
    expect(isQuietTime(60, [{ from: "23:00", to: "02:00" }])).toBe(true);
  });
  it("stamps", () => {
    const e = stampsFor({ quiet: true, fastPickup: true, promiseBroken: true }, s);
    expect(e.reduce((a, x) => a + x.value, 0)).toBe(3.5);
    expect(stampsFor({ quiet: false, fastPickup: false, promiseBroken: false }, { ...s, enabled: false })).toEqual([]);
  });
  it("caps daily", () => {
    const capped = capDaily([{ value: 2 }, { value: 1 }, { value: 1 }], 1, 3);
    expect(capped.reduce((a, x) => a + x.value, 0)).toBe(2);
  });
});

describe("escalation", () => {
  it("plans in order and skips paid channels when viewing", () => {
    const p = plan(new Date(0), { waAfterSec: 60, smsAfterSec: 120, staffAlertAfterSec: 180, unclaimedAfterSec: 600 });
    expect(p.map((x) => x.step)).toEqual(["WHATSAPP", "SMS", "STAFF_ALERT", "UNCLAIMED"]);
    expect(skipPaidChannels({ viewing: true, customerState: "NONE", acked: false })).toBe(true);
    expect(skipPaidChannels({ viewing: false, customerState: "NONE", acked: false })).toBe(false);
  });
});

describe("time", () => {
  it("uses the branch time zone", () => {
    const d = new Date("2026-09-24T21:30:00Z"); // 00:30 in Riyadh next day
    expect(dayKey(d, "Asia/Riyadh")).toBe("2026-09-25");
    expect(localParts(d, "Asia/Riyadh").hour).toBe(0);
  });
});

describe("insights", () => {
  it("flags a slow hour with normal volume", () => {
    const cells = [
      ...Array.from({ length: 10 }, (_, h) => ({ weekday: 1, hour: 8 + h, count: 20, p90PrepSec: 400 })),
      { weekday: 4, hour: 17, count: 20, p90PrepSec: 700 },
    ];
    const r = recommend({ cells, branchP90Sec: 420, unclaimedRate: 0, promiseAccuracy: 0.9, claimRate: 0.7, prepMedianSec: 300, pickupMedianSec: 40 });
    expect(r[0]?.id).toBe("slow-hour");
  });
});
