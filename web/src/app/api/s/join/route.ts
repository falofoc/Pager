import { z } from "zod";
import { db } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import { setDeviceCookie } from "@/server/auth";
import { body, fail, json } from "@/server/http";
import { clientIp, limited } from "@/server/ratelimit";

export const dynamic = "force-dynamic";
const S = z.object({ code: z.string().min(4).max(12), label: z.string().max(40).optional(), stationId: z.string().optional() });

export async function POST(req: Request) {
  if (limited(`join:${clientIp(req)}`, 10, 10 * 60000)) return fail("RATE_LIMITED", 429);
  const b = await body(req, S);
  if (!b) return fail("BAD_REQUEST");
  const branch = await db.branch.findUnique({ where: { joinCode: b.code.trim().toUpperCase() }, include: { stations: true } });
  if (!branch) return fail("BAD_CODE", 404);
  const token = randomToken(32);
  const count = await db.device.count({ where: { branchId: branch.id } });
  await db.device.create({
    data: {
      branchId: branch.id,
      label: b.label?.trim() || `جهاز ${count + 1}`,
      tokenHash: sha256(token),
      stationId: branch.stations.some((s) => s.id === b.stationId) ? b.stationId : null,
      lastSeenAt: new Date(),
    },
  });
  await setDeviceCookie(token);
  return json({ ok: true });
}
