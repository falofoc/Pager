import { branchBySlug } from "@/server/customer";
import { recentUnclaimed } from "@/server/orders";
import { fail, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const branch = await branchBySlug((await params).slug);
  if (!branch) return fail("NOT_FOUND", 404);
  return json({ orders: await recentUnclaimed(branch.id), numbering: branch.numbering });
}
