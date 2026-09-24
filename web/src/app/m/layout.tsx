import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { Bell } from "@/components/Bell";
import { NavLinks } from "./NavLinks";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "لوحة المدير" };

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="m-shell">
      <nav className="m-nav" aria-label="القائمة">
        <div className="m-brand"><Bell tone="wait" face="look" anim="none" />دورك</div>
        <Suspense><NavLinks /></Suspense>
        <div className="m-foot">
          <span>{user.tenant.name}</span>
          <span className="small">{user.email}</span>
          <form action={logoutAction}><button className="btn white" type="submit">تسجيل الخروج</button></form>
        </div>
      </nav>
      <div>
        <nav className="m-mobile-nav" aria-label="القائمة"><Suspense><NavLinks /></Suspense></nav>
        <main className="m-main">{children}</main>
      </div>
    </div>
  );
}
