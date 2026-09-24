"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isValidChecksumNumber } from "@/core/numbering";
import { deviceKey, post } from "@/lib/client";

type Recent = { number: string; itemCount: number | null; ageSec: number; kind: string };

const ago = (s: number) => (s < 20 ? "الآن" : s < 60 ? "قبل أقل من دقيقة" : s < 120 ? "قبل دقيقة" : s < 180 ? "قبل دقيقتين" : `قبل ${Math.round(s / 60)} دقائق`);
const items = (n: number | null) => (n === null ? "" : n === 1 ? "صنف واحد" : n === 2 ? "صنفان" : `${n} أصناف`);

export function ClaimApp(p: { slug: string; brand: string; name: string; color: string; numbering: string; mode: string; digits: number; prefill: string }) {
  const router = useRouter();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState(p.prefill.replace(/\D/g, "").slice(0, 6));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ token: string; number: string } | null>(null);
  const word = p.mode === "TICKET" ? "دورك" : "طلبك";

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/c/${p.slug}/recent`)
        .then((r) => r.json())
        .then((d) => alive && setRecent(d.orders ?? []))
        .catch(() => {});
    load();
    const t = setInterval(load, 8000);
    try {
      const l = JSON.parse(localStorage.getItem(`dorak:last:${p.slug}`) ?? "null");
      if (l && Date.now() - l.at < 90 * 60000) setLast(l);
    } catch {}
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [p.slug]);

  const checksum = p.numbering === "CHECKSUM";
  const typedInvalid = useMemo(() => checksum && typed.length >= p.digits && !isValidChecksumNumber(typed), [checksum, typed, p.digits]);
  const number = picked ?? (typed && !typedInvalid && (!checksum || typed.length === p.digits) ? typed : null);
  const pickedInfo = recent?.find((r) => r.number === number);

  const press = (d: string) => {
    setErr(null);
    setPicked(null);
    setTyped((t) => (d === "del" ? t.slice(0, -1) : (t + d).slice(0, checksum ? p.digits : 6)));
  };

  async function confirm() {
    if (!number) return;
    setBusy(true);
    setErr(null);
    const r = await post<{ token?: string; error?: string }>(`/api/c/${p.slug}/claim`, { number, deviceKey: deviceKey() });
    setBusy(false);
    if (r.ok && r.data.token) {
      try {
        localStorage.setItem(`dorak:last:${p.slug}`, JSON.stringify({ token: r.data.token, number, at: Date.now() }));
      } catch {}
      router.push(`/o/${r.data.token}`);
      return;
    }
    setErr(
      r.data.error === "NOT_FOUND"
        ? `لم نجد ${number} ضمن طلبات آخر ساعة في هذا الفرع. تأكد من الرقم أو اسأل الكاشير.`
        : r.data.error === "INVALID_NUMBER"
          ? `${number} ليس رقمًا صالحًا في هذا الفرع.`
          : r.data.error === "RATE_LIMITED"
            ? "محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة."
            : "تعذّر الاتصال. أعد المحاولة.",
    );
  }

  return (
    <main className="cx s-plain" style={{ ["--brand" as string]: p.color }}>
      <div className="cx-inner">
        <header className="cx-bar">
          <span className="cx-logo">{p.brand.trim().split(/\s+/).pop()?.charAt(0)}</span>
          <div>
            <b>{p.brand}</b>
            <small>{p.name}</small>
          </div>
        </header>

        {last && (
          <a className="cx-opt" href={`/o/${last.token}`} style={{ textDecoration: "none" }}>
            <span>العودة إلى {p.mode === "TICKET" ? "دور" : "طلب"} <span className="ltr">{last.number}</span></span>
            <span aria-hidden="true">←</span>
          </a>
        )}

        <h1 className="cx-h">اختر {word}</h1>
        <p className="hint">{p.mode === "TICKET" ? "الأرقام الأخيرة التي صدرت ولم تُتابع بعد" : "آخر الطلبات في هذا الفرع التي لم تُتابع بعد"}</p>

        <div className="claim-list" role="list">
          {recent === null && <p className="hint">جارٍ التحميل…</p>}
          {recent?.length === 0 && <p className="hint">لا توجد طلبات حديثة غير مرتبطة. اكتب الرقم بالأسفل.</p>}
          {recent?.map((r) => (
            <button
              key={r.number}
              type="button"
              role="listitem"
              className="claim-item"
              aria-pressed={picked === r.number}
              onClick={() => {
                setPicked(r.number);
                setTyped("");
                setErr(null);
              }}
            >
              <b className="ltr">{r.number}</b>
              <small>{[items(r.itemCount), ago(r.ageSec)].filter(Boolean).join(" · ")}</small>
              <span aria-hidden="true">{picked === r.number ? "✓" : ""}</span>
            </button>
          ))}
        </div>

        <p className="hint">أو اكتب الرقم المطبوع على الفاتورة</p>
        <div className={`digits ${typedInvalid ? "bad" : ""}`} aria-live="polite" aria-label={`الرقم المكتوب ${typed}`}>
          {(checksum ? Array.from({ length: p.digits }, (_, i) => typed[i] ?? "") : typed ? typed.split("") : [""]).map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        {typedInvalid && <p className="hint" style={{ color: "var(--delay)" }}><span className="ltr">{typed}</span> ليس رقمًا صالحًا. راجع الأرقام على الفاتورة.</p>}
        <div className="keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"].map((k) =>
            k === "ok" ? (
              <span key={k} />
            ) : (
              <button key={k} type="button" onClick={() => press(k)} aria-label={k === "del" ? "حذف" : k}>
                {k === "del" ? "⌫" : k}
              </button>
            ),
          )}
        </div>

        {err && <div className="error" role="alert" style={{ alignSelf: "stretch" }}>{err}</div>}
        <div className="cx-fill" />
        <button type="button" className="btn block" disabled={!number || busy} onClick={confirm}>
          {number ? <>تأكيد {p.mode === "TICKET" ? "الدور" : "الطلب"} <span className="ltr">{number}</span>{pickedInfo?.itemCount ? ` · ${items(pickedInfo.itemCount)}` : ""}</> : "اختر رقمك أولًا"}
        </button>
        <p className="hint">بلا تطبيق وبلا تسجيل</p>
      </div>
    </main>
  );
}
