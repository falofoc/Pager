export type OrderStatus = "CREATED" | "PREPARING" | "READY" | "PICKED_UP" | "UNCLAIMED" | "CANCELLED";
export type CustomerState = "NONE" | "ON_MY_WAY" | "STEPPED_OUT" | "IN_CAR" | "WRONG_ORDER";
export type OrderKind = "ORDER" | "TICKET";

export const ACTIVE: OrderStatus[] = ["CREATED", "PREPARING"];
export const OPEN: OrderStatus[] = ["CREATED", "PREPARING", "READY"];
export const CLOSED: OrderStatus[] = ["PICKED_UP", "CANCELLED", "UNCLAIMED"];

const T: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["PICKED_UP", "UNCLAIMED", "CANCELLED"],
  UNCLAIMED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: OrderStatus): boolean {
  return (T[from as OrderStatus] ?? []).includes(to);
}

export const CUSTOMER_STATES: CustomerState[] = ["ON_MY_WAY", "STEPPED_OUT", "IN_CAR", "WRONG_ORDER"];

export function isCustomerState(s: string): s is CustomerState {
  return (CUSTOMER_STATES as string[]).includes(s);
}
