"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { chime } from "@/lib/client";

type Snap = { branch: { name: string; brand: string; color: string; mode: string; paused: boolean; station: string }; ready: { number: string; readyAt: string }[]; preparing: string[] };

export function TvApp({ initial, slug, tvKey, claimUrl }: { initial: Snap; slug: string; tvKey: string; claimUrl: string }) {
  const [s, setS] = useState(initial);
  const [sound, setSound] = useState(false);
  const known = useRef(new Set(initial.ready.map((r) => r.number)));
  const load = useCallback(async () => {
    try {
      const d: Snap = await (await fetch(`/api/tv/${slug}?key=${encodeURIComponent(tvKey)}`, { cache: "no-store" })).json();
      const fresh = d.ready.some((r) => !known.current.has(r.number));
      known.current = new Set(d.ready.map((r) => r.number));
      setS(d);
      if (fresh && sound) chime();
    } catch {}
  }, [slug, tvKey, sound]);
  useEffect(() => {
    let es: EventSource | null = null;
    let t: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      es = new EventSource(`/api/tv/${slug}/stream?key=${encodeURIComponent(tvKey)}`);
      es.onmessage = () => void load();
      es.onerror = () => {
        es?.close();
        t = setTimeout(open, 4000);
      };
    };
    open();
    const poll = setInterval(load, 20000);
    return () => {
      es?.close();
      if (t) clearTimeout(t);
      clearInterval(poll);
    };
  }, [slug, tvKey, load]);
  const newest = s.ready[0]?.number;
  return (
    <main className="tv" style={{ ["--brand" as string]: s.branch.color }} onClick={() => setSound(true)}>
      <section className="tv-main">
        <h1>{s.branch.paused ? "توقف مؤقت للصلاة" : s.branch.mode === "TICKET" ? "حان دور" : "جاهز للاستلام"}</h1>
        <div className="tv-tiles">
          {s.ready.slice(0, 12).map((r) => (
            <span key={r.number} className={`tv-tile ${r.number === newest ? "new" : ""}`}><span className="ltr">{r.number}</span></span>
          ))}
        </div>
        <div className="tv-foot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/qr?d=${encodeURIComponent(claimUrl)}`} alt="" />
          <span>امسح الرمز لمتابعة {s.branch.mode === "TICKET" ? "دورك" : "طلبك"} من الجوال · {s.branch.station}{!sound ? " · المس الشاشة لتفعيل الصوت" : ""}</span>
        </div>
      </section>
      <aside className="tv-side">
        <h2>{s.branch.mode === "TICKET" ? "في الانتظار" : "قيد التحضير"}</h2>
        {s.preparing.slice(0, 14).map((n) => <span key={n} className="ltr">{n}</span>)}
      </aside>
    </main>
  );
}
