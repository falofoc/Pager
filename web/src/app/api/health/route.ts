import { db } from "@/server/db";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  await db.$queryRaw`SELECT 1`;
  return json({ ok: true, time: new Date().toISOString() });
}
