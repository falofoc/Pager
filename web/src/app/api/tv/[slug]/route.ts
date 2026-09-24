import { fail, json } from "@/server/http";
import { tvSnapshot } from "@/server/tv";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const snap = await tvSnapshot((await params).slug, new URL(req.url).searchParams.get("key"));
  if (!snap) return fail("NOT_FOUND", 404);
  return json(snap);
}
