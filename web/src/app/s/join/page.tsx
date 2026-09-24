import type { Metadata } from "next";
import { JoinForm } from "./JoinForm";
import { Bell } from "@/components/Bell";

export const metadata: Metadata = { title: "ربط جهاز الموظف" };

export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <Bell tone="bell" face="look" />
        <h1>ربط جهاز الموظف</h1>
        <p className="hint">أدخل رمز الربط الظاهر في لوحة المدير ضمن إعدادات الفرع. يُربط الجهاز مرة واحدة ويبقى متصلًا.</p>
        <JoinForm code={(await searchParams).code ?? ""} />
      </div>
    </main>
  );
}
