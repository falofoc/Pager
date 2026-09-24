import Link from "next/link";
import { Bell } from "@/components/Bell";

export default function NotFound() {
  return (
    <main className="auth">
      <div className="auth-card" style={{ textAlign: "center", justifyItems: "center" }}>
        <Bell tone="offline" face="dash" anim="none" />
        <h1>الصفحة غير موجودة</h1>
        <p className="hint">قد يكون الرابط قديمًا أو انتهت صلاحية الطلب. اطلب من الكاشير رمزًا جديدًا.</p>
        <Link className="btn" href="/">الرئيسية</Link>
      </div>
    </main>
  );
}
