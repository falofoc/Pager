"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export function JoinForm({ code: initial }: { code: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await post<{ error?: string }>("/api/s/join", { code, label });
        setBusy(false);
        if (r.ok) router.replace("/s");
        else setErr(r.data.error === "BAD_CODE" ? "الرمز غير صحيح. تأكد منه في لوحة المدير." : r.data.error === "RATE_LIMITED" ? "محاولات كثيرة. انتظر قليلًا." : "تعذّر الربط.");
      }}
    >
      <label className="field">
        <span>رمز الربط</span>
        <input id="join-code" className="input num-font" dir="ltr" autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={4} />
      </label>
      <label className="field">
        <span>اسم الجهاز (اختياري)</span>
        <input id="join-label" className="input" placeholder="تابلت الكاشير" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
      </label>
      {err && <div className="error" role="alert">{err}</div>}
      <button className="btn block" type="submit" disabled={busy}>ربط الجهاز</button>
    </form>
  );
}
