import { db } from "@/server/db";
import { fail } from "@/server/http";
import { sseResponse } from "@/server/sse";
import { ch } from "@/server/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const branch = await db.branch.findUnique({ where: { slug: (await params).slug } });
  const key = new URL(req.url).searchParams.get("key");
  if (!branch || branch.tvKey !== key) return fail("NOT_FOUND", 404);
  return sseResponse(req, [ch.tick(branch.id)], { initial: async () => ({ type: "tick" }) });
}
