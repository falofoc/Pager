import { db } from "./db";
import { parseSettings } from "./settings";

export async function tvSnapshot(slug: string, key: string | null) {
  const branch = await db.branch.findUnique({ where: { slug }, include: { tenant: true, stations: { orderBy: { sort: "asc" } } } });
  if (!branch || !key || branch.tvKey !== key) return null;
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const orders = await db.order.findMany({
    where: { branchId: branch.id, OR: [{ status: { in: ["CREATED", "PREPARING", "READY"] } }] },
    orderBy: [{ readyAt: "desc" }, { createdAt: "asc" }],
    select: { id: true, number: true, status: true, readyAt: true, createdAt: true, kind: true },
  });
  return {
    branch: { name: branch.name, brand: branch.tenant.name, color: branch.brandColor, mode: branch.mode, paused: branch.status === "PAUSED", station: branch.stations[0]?.name ?? parseSettings(branch.settings).defaultStation, slug: branch.slug },
    ready: orders.filter((o) => o.status === "READY" && o.readyAt && o.readyAt >= since).map((o) => ({ number: o.number, readyAt: o.readyAt!.toISOString() })),
    preparing: orders.filter((o) => o.status !== "READY").map((o) => o.number),
    branchId: branch.id,
  };
}

