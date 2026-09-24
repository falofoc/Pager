import { staffContext } from "@/server/staff";
import { sseResponse } from "@/server/sse";
import { ch } from "@/server/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const c = await staffContext();
  if ("error" in c) return c.error;
  return sseResponse(req, [ch.branch(c.branch.id)], { initial: async () => ({ type: "hello" }) });
}
