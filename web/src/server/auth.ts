import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

const SESSION_COOKIE = "dorak_session";
const DEVICE_COOKIE = "dorak_device";
const secure = process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https");

export async function createSession(userId: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: { include: { tenant: true } } } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** فرع يملكه المستخدم، أو أول فرع له. */
export async function requireBranch(tenantId: string, branchId?: string | null) {
  const branch = branchId
    ? await db.branch.findFirst({ where: { id: branchId, tenantId }, include: { stations: { orderBy: { sort: "asc" } } } })
    : await db.branch.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" }, include: { stations: { orderBy: { sort: "asc" } } } });
  if (!branch) redirect("/m/branches");
  return branch;
}

/* ---------- أجهزة الموظفين ---------- */
export async function setDeviceCookie(token: string) {
  (await cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 365 * 24 * 3600 });
}

export async function clearDeviceCookie() {
  (await cookies()).delete(DEVICE_COOKIE);
}

export async function currentDevice() {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const d = await db.device.findUnique({ where: { tokenHash: sha256(token) }, include: { branch: { include: { stations: { orderBy: { sort: "asc" } } } } } });
  if (!d || d.revokedAt) return null;
  if (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > 60000) {
    await db.device.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return d;
}
