export type EscalationSettings = {
  waAfterSec: number;
  smsAfterSec: number;
  staffAlertAfterSec: number;
  unclaimedAfterSec: number;
};
export type EscalationStep = "WHATSAPP" | "SMS" | "STAFF_ALERT" | "UNCLAIMED";

export function plan(readyAt: Date, s: EscalationSettings): { step: EscalationStep; runAt: Date }[] {
  const at = (sec: number) => new Date(readyAt.getTime() + sec * 1000);
  return [
    { step: "WHATSAPP" as const, runAt: at(s.waAfterSec) },
    { step: "SMS" as const, runAt: at(s.smsAfterSec) },
    { step: "STAFF_ALERT" as const, runAt: at(s.staffAlertAfterSec) },
    { step: "UNCLAIMED" as const, runAt: at(s.unclaimedAfterSec) },
  ].sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
}

/** هل نتخطى القنوات المدفوعة؟ العميل يشاهد الصفحة الآن أو أخبرنا بحاله. */
export function skipPaidChannels(ctx: { viewing: boolean; customerState: string; acked: boolean }): boolean {
  return ctx.acked || ctx.viewing || ctx.customerState === "ON_MY_WAY" || ctx.customerState === "STEPPED_OUT";
}

export function shouldAlertStaff(ctx: { customerState: string; acked: boolean }): boolean {
  return !ctx.acked && ctx.customerState !== "ON_MY_WAY" && ctx.customerState !== "STEPPED_OUT";
}
