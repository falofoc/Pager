import Link from "next/link";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { createBranchAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Branches({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const branches = await db.branch.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { devices: { where: { revokedAt: null } } } } } });
  return (
    <>
      <div className="m-head"><h1>الفروع</h1></div>
      {sp.e && <div className="error" role="alert">اكتب اسمًا للفرع من حرفين على الأقل.</div>}
      <section className="card">
        <table className="table">
          <thead><tr><th>الفرع</th><th>الرابط</th><th>النوع</th><th>الأجهزة</th><th /></tr></thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td><b>{b.name}</b></td>
                <td className="ltr">/c/{b.slug}</td>
                <td>{b.mode === "TICKET" ? "أدوار" : "طلبات"}</td>
                <td className="ltr">{b._count.devices}</td>
                <td className="row">
                  <Link href={`/m?b=${b.id}`}>اليوم</Link>
                  <Link href={`/m/settings?b=${b.id}`}>الإعدادات</Link>
                  <Link href={`/m/print?b=${b.id}`}>الطباعة</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form action={createBranchAction} className="card">
        <h3>فرع جديد</h3>
        <label className="field"><span>اسم الفرع</span><input id="new-branch" name="name" className="input" required minLength={2} placeholder="فرع الملقا" /></label>
        <button className="btn" type="submit">إنشاء الفرع</button>
      </form>
    </>
  );
}
