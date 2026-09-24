import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { Bell } from "@/components/Bell";
import { loginAction } from "../m/actions";

export const metadata: Metadata = { title: "دخول المدير" };
export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await currentUser()) redirect("/m");
  const e = (await searchParams).e;
  return (
    <main className="auth">
      <form action={loginAction} className="auth-card">
        <Bell tone="wait" face="look" />
        <h1>دخول المدير</h1>
        {e && <div className="error" role="alert">البريد أو كلمة المرور غير صحيحة.</div>}
        <label className="field"><span>البريد الإلكتروني</span><input id="email" name="email" type="email" className="input" dir="ltr" autoComplete="email" required /></label>
        <label className="field"><span>كلمة المرور</span><input id="password" name="password" type="password" className="input" dir="ltr" autoComplete="current-password" required /></label>
        <button className="btn block" type="submit">دخول</button>
        <p className="hint">منشأة جديدة؟ <Link href="/start">أنشئ حسابًا</Link></p>
      </form>
    </main>
  );
}
