import { staffContext } from "@/server/staff";
import { boardSnapshot } from "@/server/orders";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await staffContext();
  if ("error" in c) return c.error;
  return json(await boardSnapshot(c.branch));
}
