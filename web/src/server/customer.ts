import { db } from "./db";
import { loadBranch } from "./orders";

export async function orderByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) return null;
  const order = await db.order.findUnique({ where: { token } });
  if (!order) return null;
  const branch = await loadBranch(order.branchId);
  if (!branch) return null;
  return { order, branch };
}

export async function branchBySlug(slug: string) {
  const b = await db.branch.findUnique({ where: { slug }, select: { id: true } });
  return b ? loadBranch(b.id) : null;
}

export const validDeviceKey = (k: unknown): k is string => typeof k === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(k);

/** يوحّد رقم الجوال بصيغة دولية. الأرقام السعودية المحلية (05xxxxxxxx) تُحوَّل إلى +9665xxxxxxxx */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^05\d{8}$/.test(d)) return "+966" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "+966" + d;
  if (/^9665\d{8}$/.test(d)) return "+" + d;
  if (/^\+\d{8,15}$/.test(d)) return d;
  if (/^00\d{8,15}$/.test(d)) return "+" + d.slice(2);
  return null;
}
