import Link from "next/link";
import type { Metadata } from "next";
import { Bell } from "@/components/Bell";
import { registerAction } from "../m/actions";

export const metadata: Metadata = { title: "ابدأ مع دورك" };

const ERR: Record<string, string> = { invalid: "تأكد من الحقول: كلمة المرور 8 أحرف على الأقل، والبريد صحيح.", exists: "هذا البريد مسجّل. سجّل الدخول بدلًا من ذلك." };

export default async function Start({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const e = (await searchParams).e;
  return (
    <main className="auth">
      <form action={registerAction} className="auth-card">
        <Bell tone="bell" face="wide" />
        <h1>ابدأ مع دورك</h1>
        <p className="hint">تركيب في دقائق. بلا أجهزة. تعمل الصفحة الحيّة والإشعارات فورًا بدون أي مفتاح.</p>
        {e && <div className="error" role="alert">{ERR[e] ?? "تعذّر إنشاء الحساب."}</div>}
        <label className="field"><span>اسم العلامة</span><input id="brand" name="brand" className="input" required placeholder="مقهى سدرة" /></label>
        <label className="field"><span>اسم الفرع الأول</span><input id="branch" name="branch" className="input" required placeholder="فرع العليا" /></label>
        <label className="field"><span>اسمك</span><input id="name" name="name" className="input" required autoComplete="name" /></label>
        <label className="field"><span>البريد الإلكتروني</span><input id="email" name="email" type="email" className="input" dir="ltr" required autoComplete="email" /></label>
        <label className="field"><span>كلمة المرور</span><input id="password" name="password" type="password" className="input" dir="ltr" minLength={8} required autoComplete="new-password" /></label>
        <button className="btn block" type="submit">إنشاء الحساب</button>
        <p className="hint">لديك حساب؟ <Link href="/login">سجّل الدخول</Link></p>
      </form>
    </main>
  );
}
