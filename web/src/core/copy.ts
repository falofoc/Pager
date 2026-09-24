import type { OrderKind } from "./states";

export const label = (kind: OrderKind | string) => (kind === "TICKET" ? "دور" : "طلب");

export const CUSTOMER_STATE_TEXT: Record<string, string> = {
  NONE: "",
  ON_MY_WAY: "في الطريق",
  STEPPED_OUT: "سيتأخر قليلًا",
  IN_CAR: "في السيارة",
  WRONG_ORDER: "ليس طلبي",
};

export const STATUS_TEXT: Record<string, string> = {
  CREATED: "تم الاستلام",
  PREPARING: "قيد التحضير",
  READY: "جاهز",
  PICKED_UP: "تم الاستلام",
  UNCLAIMED: "لم يُستلم",
  CANCELLED: "أُلغي",
};

export function callMessage(p: { kind: string; number: string; station: string; branchName: string }) {
  return `حان دورك. ${label(p.kind)} ${p.number} جاهز في ${p.station}. ${p.branchName}`;
}
