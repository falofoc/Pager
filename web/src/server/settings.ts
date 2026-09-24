import type { LoyaltySettings } from "@/core/loyalty";
import type { EscalationSettings } from "@/core/escalation";

export type BranchSettings = {
  showMascot: boolean;
  defaultPrepMin: number;
  nearNotify: boolean;
  numberDigits: number;
  defaultStation: string;
  waitingLine: string;
  googlePlaceId: string;
  wifi: { ssid: string; password: string; security: "WPA" | "WEP" | "nopass" };
  escalation: EscalationSettings;
  loyalty: LoyaltySettings;
};

export const DEFAULT_SETTINGS: BranchSettings = {
  showMascot: true,
  defaultPrepMin: 5,
  nearNotify: true,
  numberDigits: 3,
  defaultStation: "نقطة الاستلام",
  waitingLine: "",
  googlePlaceId: "",
  wifi: { ssid: "", password: "", security: "WPA" },
  escalation: { waAfterSec: 60, smsAfterSec: 120, staffAlertAfterSec: 180, unclaimedAfterSec: 600 },
  loyalty: {
    enabled: true,
    goal: 10,
    reward: "مشروب من اختيارك",
    dailyMax: 3,
    quietHours: [],
    fastPickupBonus: true,
    apologyStamp: true,
  },
};

export function parseSettings(json: string | null | undefined): BranchSettings {
  let raw: Partial<BranchSettings> = {};
  try {
    raw = json ? JSON.parse(json) : {};
  } catch {}
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    wifi: { ...DEFAULT_SETTINGS.wifi, ...(raw.wifi ?? {}) },
    escalation: { ...DEFAULT_SETTINGS.escalation, ...(raw.escalation ?? {}) },
    loyalty: { ...DEFAULT_SETTINGS.loyalty, ...(raw.loyalty ?? {}) },
  };
}
