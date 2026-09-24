import { cookies } from "next/headers";
import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { clearDeviceCookie } from "@/server/auth";
import { json } from "@/server/http";

export async function POST() {
  const token = (await cookies()).get("dorak_device")?.value;
  if (token) await db.device.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  await clearDeviceCookie();
  return json({ ok: true });
}
