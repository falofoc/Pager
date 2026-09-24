import QRCode from "qrcode";
import { requireBranch, requireUser } from "@/server/auth";
import { parseSettings } from "@/server/settings";
import { serverOrigin } from "@/server/appconfig";
import { db } from "@/server/db";
import { Bell } from "@/components/Bell";
import { BranchPicker } from "@/components/BranchPicker";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/([\;,:"])/g, "\\$1");

export default async function Print({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const user = await requireUser();
  const branch = await requireBranch(user.tenantId, (await searchParams).b);
  const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });
  const s = parseSettings(branch.settings);
  const origin = await serverOrigin();
  const url = `${origin}/c/${branch.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1C1B1A", light: "#FFFFFF" } });
  const wifi = s.wifi.ssid
    ? await QRCode.toString(`WIFI:T:${s.wifi.security};S:${esc(s.wifi.ssid)};P:${esc(s.wifi.password)};;`, { type: "svg", margin: 1, color: { dark: "#1C1B1A", light: "#FFFFFF" } })
    : null;
  const word = branch.mode === "TICKET" ? "دورك" : "طلبك";
  return (
    <>
      <div className="m-head no-print">
        <h1>رموز الطباعة</h1>
        <div className="row">
          <BranchPicker tenantId={user.tenantId} current={branch.id} path="/m/print" />
          <PrintButton />
        </div>
      </div>
      <p className="hint no-print">اطبع البطاقة وضعها أمام الكاشير. يمكن أيضًا برمجة ملصق NFC بالرابط نفسه: <span className="code">{url}</span></p>
      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <article style={{ background: branch.brandColor, color: "#fff", borderRadius: 28, padding: 28, display: "grid", gap: 14, justifyItems: "center", textAlign: "center", breakInside: "avoid" }}>
          <div style={{ width: 80 }}><Bell tone="white" face="look" anim="none" /></div>
          <h2 style={{ fontFamily: "var(--f-display)", fontWeight: 800, fontSize: 30 }}>تابع {word} من جوالك</h2>
          <p style={{ opacity: 0.9 }}>امسح الرمز واختر رقمك. سنُعلمك حين يحين دورك. بلا تطبيق.</p>
          <div style={{ background: "#fff", borderRadius: 20, padding: 14, width: 240 }} dangerouslySetInnerHTML={{ __html: qr }} />
          <b style={{ fontSize: 18 }}>{tenant?.name} · {branch.name}</b>
        </article>
        {wifi && (
          <article style={{ background: "#fff", borderRadius: 28, padding: 28, display: "grid", gap: 14, justifyItems: "center", textAlign: "center", breakInside: "avoid" }}>
            <h2 style={{ fontFamily: "var(--f-display)", fontWeight: 800, fontSize: 26 }}>لا يوجد إنترنت؟</h2>
            <p className="muted">امسح هذا الرمز للاتصال بشبكة الفرع، ثم امسح رمز المتابعة.</p>
            <div style={{ width: 200 }} dangerouslySetInnerHTML={{ __html: wifi }} />
            <b className="ltr">{s.wifi.ssid}</b>
          </article>
        )}
      </section>
    </>
  );
}
