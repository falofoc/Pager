import Link from "next/link";
import { Bell } from "@/components/Bell";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const demo = await db.branch.findUnique({ where: { slug: "sidra" } }).catch(() => null);
  return (
    <main className="land">
      <section className="land-hero">
        <h1>دورك</h1>
        <p>نظام نداء وانتظار بلا أجهزة وبلا تطبيق. وقت متوقع صادق، نداء يتصاعد حتى يصل، ورد من العميل بلمسة.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn white" href="/start">ابدأ مجانًا</Link>
          <Link className="btn" href="/login" style={{ background: "rgba(0,0,0,.25)" }}>دخول المدير</Link>
        </div>
        <Bell tone="white" face="look" />
      </section>
      <div className="land-body">
        <div className="land-grid">
          <Link href="/m" className="card" style={{ textDecoration: "none" }}><b>لوحة المدير</b><span className="hint">أين ومتى ولماذا يتأخر الفرع، والإعدادات والمفاتيح.</span></Link>
          <Link href="/s" className="card" style={{ textDecoration: "none" }}><b>لوحة الموظف</b><span className="hint">ضغطة واحدة لكل حدث. تُربط بالفرع برمز من لوحة المدير.</span></Link>
          {demo && (
            <>
              <Link href={`/c/${demo.slug}`} className="card" style={{ textDecoration: "none" }}><b>صفحة العميل (تجريبي)</b><span className="hint">كما يراها العميل بعد مسح الرمز.</span></Link>
              <Link href={`/tv/${demo.slug}?key=${demo.tvKey}`} className="card" style={{ textDecoration: "none" }}><b>شاشة الأرقام (تجريبي)</b><span className="hint">لمن لا يمسح الرمز.</span></Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
