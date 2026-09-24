import { db } from "@/server/db";

/** اختيار الفرع عبر نموذج GET بسيط، يظهر عند وجود أكثر من فرع. */
export async function BranchPicker({ tenantId, current, path }: { tenantId: string; current: string; path: string }) {
  const branches = await db.branch.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (branches.length < 2) return null;
  return (
    <form method="get" action={path} className="row no-print">
      <label className="sr" htmlFor="branch-pick">الفرع</label>
      <select id="branch-pick" name="b" className="input" defaultValue={current} style={{ width: "auto" }}>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <button className="btn white" type="submit">عرض</button>
    </form>
  );
}
