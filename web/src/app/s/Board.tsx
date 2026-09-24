"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffOrder } from "@/server/orders";
import { fmtClock, post, unlockAudio, chime } from "@/lib/client";

type Snapshot = {
  branch: { id: string; name: string; brand: string; color: string; mode: string; numbering: string; status: string; pausedAt: string | null; stations: { id: string; name: string }[]; loyaltyEnabled: boolean };
  orders: StaffOrder[];
  stats: { today: number; medianPrepSec: number | null; unclaimedToday: number; lateThresholdSec: number };
  serverTime: string;
};
type Modal = null | { kind: "new" } | { kind: "qr"; order: StaffOrder; until: number } | { kind: "redeem" } | { kind: "dup"; payload: NewOrder; minutesAgo: number } | { kind: "menu"; order: StaffOrder };
type NewOrder = { number?: string; itemCount?: number; summary?: string; stationId?: string | null; force?: boolean };
type Queued = { url: string; body: unknown; label: string };

const REACH: Record<string, string> = { PAGE: "الصفحة", WEBPUSH: "الإشعار", WHATSAPP: "واتساب", SMS: "رسالة نصية", STAFF: "تنبيه الموظف" };
const CS: Record<string, [string, string]> = {
  ON_MY_WAY: ["c-way", "في الطريق"],
  STEPPED_OUT: ["c-step", "سيتأخر قليلًا"],
  IN_CAR: ["c-way", "في السيارة"],
  WRONG_ORDER: ["c-conf", "العميل: ليس طلبي"],
};
const QUICK = ["قهوة", "حار", "بارد", "مخبوزات", "حلى"];

export function Board({ initial, deviceLabel, slug, origin }: { initial: Snapshot; deviceLabel: string; slug: string; origin: string }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [orders, setOrders] = useState<Map<string, StaffOrder>>(() => new Map(initial.orders.map((o) => [o.id, o])));
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(() => Date.now() - new Date(initial.serverTime).getTime());
  const [rush, setRush] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const lastNoResp = useRef<Set<string>>(new Set());
  const b = snap.branch;
  const ticket = b.mode === "TICKET";
  const L = ticket ? "دور" : "طلب";

  const say = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? null : x)), 3500);
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/s/board", { cache: "no-store" });
      if (res.status === 401) {
        location.href = "/s/join";
        return;
      }
      const d: Snapshot = await res.json();
      setSnap(d);
      setOrders(new Map(d.orders.map((o) => [o.id, o])));
      setSkew(Date.now() - new Date(d.serverTime).getTime());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  /* live */
  useEffect(() => {
    try {
      setRush(localStorage.getItem("dorak:rush") === "1");
      setQueue(JSON.parse(localStorage.getItem("dorak:queue") ?? "[]"));
    } catch {}
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      es = new EventSource("/api/s/stream");
      es.onopen = () => setOffline(false);
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === "order") {
            const o: StaffOrder = d.order;
            setOrders((m) => {
              const n = new Map(m);
              if (o.status === "PICKED_UP" || o.status === "CANCELLED") n.delete(o.id);
              else n.set(o.id, o);
              return n;
            });
            if (o.noResponse && !lastNoResp.current.has(o.id)) {
              lastNoResp.current.add(o.id);
              chime();
            }
          } else if (d.type === "branch") {
            setSnap((s) => ({ ...s, branch: { ...s.branch, status: d.status, pausedAt: d.pausedAt } }));
          }
        } catch {}
      };
      es.onerror = () => {
        es?.close();
        setOffline(true);
        retry = setTimeout(() => {
          void reload();
          open();
        }, 3000);
      };
    };
    open();
    const poll = setInterval(reload, 15000);
    const clk = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
      clearInterval(poll);
      clearInterval(clk);
    };
  }, [reload]);

  /* offline queue */
  const saveQueue = (q: Queued[]) => {
    setQueue(q);
    try {
      localStorage.setItem("dorak:queue", JSON.stringify(q));
    } catch {}
  };
  useEffect(() => {
    if (queue.length === 0) return;
    const t = setInterval(async () => {
      const [head, ...rest] = queue;
      const r = await post(head.url, head.body);
      if (r.status !== 0) {
        saveQueue(rest);
        void reload();
      }
    }, 4000);
    return () => clearInterval(t);
  }, [queue, reload]);

  async function act(order: StaffOrder, action: string, extra: Record<string, unknown> = {}) {
    unlockAudio();
    const url = `/api/s/orders/${order.id}`;
    const r = await post<{ error?: string }>(url, { action, ...extra });
    if (r.status === 0) {
      saveQueue([...queue, { url, body: { action, ...extra }, label: `${action} ${order.number}` }]);
      setOffline(true);
      say("لا يوجد اتصال. سيُرسل الإجراء عند عودة الشبكة.");
      return;
    }
    if (!r.ok) say(r.data.error === "BAD_TRANSITION" ? "لا يمكن تنفيذ هذا الإجراء على هذه الحالة." : "تعذّر التنفيذ.");
  }

  async function create(payload: NewOrder) {
    const r = await post<{ order?: StaffOrder; error?: string; minutesAgo?: number }>("/api/s/orders", payload);
    if (r.ok && r.data.order) {
      setModal({ kind: "qr", order: r.data.order, until: Date.now() + 15000 });
      setOrders((m) => new Map(m).set(r.data.order!.id, r.data.order!));
      return;
    }
    if (r.data.error === "DUPLICATE") return setModal({ kind: "dup", payload, minutesAgo: r.data.minutesAgo ?? 0 });
    say(r.data.error === "NUMBER_REQUIRED" ? "أدخل رقم الطلب." : r.status === 0 ? "لا يوجد اتصال." : "تعذّر إنشاء الطلب.");
  }

  async function batchReady() {
    const ids = [...selected];
    const r = await post<{ done?: number }>("/api/s/batch", { ids });
    if (r.ok) say(`تم نداء ${r.data.done} ${ticket ? "أدوار" : "طلبات"}.`);
    setSelected(new Set());
    setSelecting(false);
  }

  async function togglePause() {
    await post("/api/s/pause", { on: b.status !== "PAUSED" });
    void reload();
  }

  async function callNext() {
    const r = await post<{ error?: string }>("/api/s/next");
    if (!r.ok) say(r.data.error === "QUEUE_EMPTY" ? "لا يوجد أحد في الانتظار." : "تعذّر النداء.");
  }

  const toggleRush = () => {
    setRush((x) => {
      try {
        localStorage.setItem("dorak:rush", x ? "0" : "1");
      } catch {}
      return !x;
    });
  };

  const list = useMemo(() => [...orders.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [orders]);
  const active = list.filter((o) => o.status === "CREATED" || o.status === "PREPARING");
  const ready = list.filter((o) => o.status === "READY" || o.status === "UNCLAIMED").sort((a, b) => (a.readyAt ?? "").localeCompare(b.readyAt ?? ""));
  const serverNow = now - skew;
  const pausedExtra = b.status === "PAUSED" && b.pausedAt ? (serverNow - new Date(b.pausedAt).getTime()) / 1000 : 0;
  const elapsed = (o: StaffOrder) => (serverNow - new Date(o.createdAt).getTime()) / 1000 - o.pausedSec - pausedExtra;
  const sinceReady = (o: StaffOrder) => (o.readyAt ? (serverNow - new Date(o.readyAt).getTime()) / 1000 : 0);

  const card = (o: StaffOrder) => {
    const isActive = o.status === "CREATED" || o.status === "PREPARING";
    const t = isActive ? elapsed(o) : sinceReady(o);
    const late = isActive ? t > snap.stats.lateThresholdSec : o.status === "READY" && t > 180;
    const sel = selected.has(o.id);
    return (
      <article
        key={o.id}
        className={`o-card ${o.noResponse && o.status === "READY" ? "alert" : ""} ${sel ? "selected" : ""}`}
        onClick={selecting && isActive ? () => setSelected((s) => { const n = new Set(s); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); return n; }) : undefined}
        aria-label={`${L} ${o.number}`}
      >
        <span className="o-num ltr">#{o.number}</span>
        <span className={`timer ${late ? "late" : ""}`}><span className="ltr">{fmtClock(t)}</span></span>
        {(o.summary || o.itemCount) && <span className="o-sum">{[o.itemCount ? `${o.itemCount} ${o.itemCount === 1 ? "صنف" : "أصناف"}` : "", o.summary].filter(Boolean).join(" · ")}</span>}
        <div className="chiprow">
          {o.status === "UNCLAIMED" && <span className="chip c-noresp">لم يُستلم</span>}
          {o.conflict && <span className="chip c-conf">تعارض ربط · جهازان</span>}
          {o.customerState !== "NONE" && CS[o.customerState] && <span className={`chip ${CS[o.customerState][0]}`}>{CS[o.customerState][1]}</span>}
          {o.noResponse && o.status === "READY" && <span className="chip c-noresp">لم يستجب</span>}
          {o.viewing ? <span className="chip c-watch">يشاهد الصفحة</span> : !o.claimed ? <span className="chip c-none">لم يرتبط</span> : null}
          {o.promiseBroken && isActive && <span className="chip c-late">تجاوز الوقت المتوقع</span>}
        </div>
        {o.status === "READY" && o.noResponse && (
          <p className="o-sub">وصله: {o.reached.length ? o.reached.map((k) => REACH[k] ?? k).join("، ") : "لا شيء"}. نداء صوتي لـ{L} <span className="ltr">{o.number}</span>.</p>
        )}
        {!selecting && (
          <div className="o-acts">
            {o.conflict && (
              <>
                <button type="button" className="o-btn warn" onClick={() => act(o, "keep-first")}>إبقاء الأول</button>
                <button type="button" className="o-btn sec" onClick={() => act(o, "unlink")}>فك الربط</button>
              </>
            )}
            {isActive && !o.claimed && <button type="button" className="o-btn sec" onClick={() => setModal({ kind: "qr", order: o, until: Date.now() + 15000 })}>عرض رمز</button>}
            {o.status === "CREATED" && !rush && !ticket && <button type="button" className="o-btn sec" onClick={() => act(o, "preparing")}>بدأ التحضير</button>}
            {isActive && <button type="button" className="o-btn" onClick={() => act(o, "ready")}>{ticket ? "نداء" : "جاهز"}</button>}
            {(o.status === "READY" || o.status === "UNCLAIMED") && (
              <>
                <button type="button" className="o-btn sec" onClick={() => act(o, "recall")}>إعادة النداء</button>
                <button type="button" className="o-btn ok" onClick={() => act(o, "picked")}>{ticket ? "تمت الخدمة" : "تم الاستلام"}</button>
              </>
            )}
            <button type="button" className="o-btn sec" aria-label="المزيد" onClick={() => setModal({ kind: "menu", order: o })}>⋯</button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className={`board ${rush ? "rush" : ""}`} style={{ ["--brand" as string]: b.color }}>
      <div>
        <header className="board-head">
          <div className="cx-bar">
            <span className="cx-logo">{b.brand.trim().split(/\s+/).pop()?.charAt(0)}</span>
            <div>
              <b>{b.brand}</b>
              <small>{b.name} · {deviceLabel}</small>
            </div>
          </div>
          <div className="b-actions">
            {ticket ? (
              <>
                <button type="button" className="b-btn ink" onClick={() => create({})}>+ إصدار دور</button>
                <button type="button" className="b-btn ink" onClick={callNext}>استدعاء التالي</button>
              </>
            ) : (
              <button type="button" className="b-btn ink" onClick={() => (b.numbering === "MANUAL" ? setModal({ kind: "new" }) : setModal({ kind: "new" }))}>+ طلب جديد</button>
            )}
            {selecting ? (
              <>
                <button type="button" className="b-btn ink" disabled={selected.size === 0} onClick={batchReady}>{ticket ? "نداء" : "جاهز"} للمحدد ({selected.size})</button>
                <button type="button" className="b-btn" onClick={() => { setSelecting(false); setSelected(new Set()); }}>إلغاء التحديد</button>
              </>
            ) : (
              <button type="button" className="b-btn" onClick={() => setSelecting(true)}>تحديد متعدد</button>
            )}
            <button type="button" className={`b-btn ${rush ? "on" : ""}`} onClick={toggleRush} aria-pressed={rush}><span className="k" style={{ background: "var(--delay)" }} />وضع الذروة</button>
            <button type="button" className={`b-btn ${b.status === "PAUSED" ? "on" : ""}`} onClick={togglePause} aria-pressed={b.status === "PAUSED"}><span className="k" style={{ background: "var(--pause)" }} />{b.status === "PAUSED" ? "استئناف" : "إيقاف للصلاة"}</button>
            {b.loyaltyEnabled && <button type="button" className="b-btn" onClick={() => setModal({ kind: "redeem" })}>صرف مكافأة</button>}
          </div>
        </header>
        {b.status === "PAUSED" && (
          <div className="paused-bar">
            <span>الفرع في توقف مؤقت للصلاة. المؤقتات متوقفة والعملاء يرون ذلك.</span>
            <button type="button" className="b-btn" onClick={togglePause}>استئناف</button>
          </div>
        )}
        {(offline || queue.length > 0) && <div className="offline-bar" role="status">{offline ? "لا يوجد اتصال. " : ""}{queue.length ? `إجراءات بانتظار الإرسال: ${queue.length}` : "نحاول إعادة الاتصال…"}</div>}
      </div>

      <main className="b-cols">
        <section className="b-col" aria-label="قيد التحضير">
          <h2>{ticket ? "في الانتظار" : "قيد التحضير"} <span>{active.length}</span></h2>
          {active.length === 0 && <p className="b-empty">لا {ticket ? "أدوار" : "طلبات"} الآن.</p>}
          {active.map(card)}
        </section>
        <section className="b-col" aria-label="جاهز">
          <h2>{ticket ? "تم النداء" : "جاهز · بانتظار العميل"} <span>{ready.length}</span></h2>
          {ready.length === 0 && <p className="b-empty">لا شيء بانتظار الاستلام.</p>}
          {ready.map(card)}
        </section>
        <aside className="b-side" aria-label="أرقام اليوم">
          <div className="stat"><small>{ticket ? "أدوار" : "طلبات"} اليوم</small><b className="ltr">{snap.stats.today}</b></div>
          <div className="stat"><small>الوسيط اليوم</small><b className="ltr">{snap.stats.medianPrepSec ? fmtClock(snap.stats.medianPrepSec) : "—"}</b></div>
          <div className="stat warn"><small>متأخر الآن</small><b className="ltr">{active.filter((o) => elapsed(o) > snap.stats.lateThresholdSec).length}</b></div>
          <div className="stat"><small>غير مستلم اليوم</small><b className="ltr">{snap.stats.unclaimedToday}</b></div>
          <button type="button" className="btn ghost small" onClick={async () => { await post("/api/s/logout"); location.href = "/s/join"; }}>فصل هذا الجهاز</button>
          <a className="btn ghost small" href={`/c/${slug}`} target="_blank" rel="noreferrer">صفحة العملاء</a>
        </aside>
      </main>

      {modal && (
        <div className="modal-back" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          {modal.kind === "new" && <NewOrderModal manual={b.numbering === "MANUAL"} stations={b.stations} onCancel={() => setModal(null)} onCreate={create} />}
          {modal.kind === "qr" && <QrModal order={modal.order} until={modal.until} origin={origin} label={L} onClose={() => setModal(null)} />}
          {modal.kind === "dup" && (
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dup-title">
              <h2 id="dup-title">الرقم <span className="ltr">{modal.payload.number}</span> مستخدم</h2>
              <p>أُنشئ طلب بهذا الرقم قبل {modal.minutesAgo} دقيقة. هل هذا طلب جديد فعلًا؟</p>
              <div className="row">
                <button type="button" className="btn grow" onClick={() => create({ ...modal.payload, force: true })}>نعم، طلب جديد</button>
                <button type="button" className="btn white grow" onClick={() => setModal(null)}>تراجع</button>
              </div>
            </div>
          )}
          {modal.kind === "redeem" && <RedeemModal onClose={() => setModal(null)} onDone={(r) => { setModal(null); say(`صُرفت المكافأة: ${r}`); }} />}
          {modal.kind === "menu" && (
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="menu-title">
              <h2 id="menu-title">{L} <span className="ltr">{modal.order.number}</span></h2>
              <div className="stack">
                {(modal.order.status === "CREATED" || modal.order.status === "PREPARING") && (
                  <button type="button" className="btn white" onClick={() => { void act(modal.order, "picked"); setModal(null); }}>سُلّم مباشرة (بلا نداء)</button>
                )}
                {modal.order.status === "READY" && (
                  <button type="button" className="btn white" onClick={() => { void act(modal.order, "unclaimed", { reason: "NO_SHOW" }); setModal(null); }}>تعليم كغير مستلم</button>
                )}
                {!modal.order.claimed && modal.order.status !== "UNCLAIMED" && (
                  <button type="button" className="btn white" onClick={() => setModal({ kind: "qr", order: modal.order, until: Date.now() + 15000 })}>عرض رمز الربط</button>
                )}
                <button type="button" className="btn danger" onClick={() => { void act(modal.order, "cancel", { reason: "STAFF" }); setModal(null); }}>إلغاء ال{L}</button>
                <button type="button" className="btn ghost" onClick={() => setModal(null)}>إغلاق</button>
              </div>
            </div>
          )}
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function NewOrderModal({ manual, stations, onCancel, onCreate }: { manual: boolean; stations: { id: string; name: string }[]; onCancel: () => void; onCreate: (p: NewOrder) => void }) {
  const [num, setNum] = useState("");
  const [count, setCount] = useState(1);
  const [summary, setSummary] = useState<string[]>([]);
  const [station, setStation] = useState<string>(stations[0]?.id ?? "");
  const submit = () => onCreate({ number: manual ? num : undefined, itemCount: count, summary: summary.join(" · ") || undefined, stationId: station || null });
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-title">
      <h2 id="new-title">طلب جديد</h2>
      {manual ? (
        <>
          <label className="field"><span>رقم الطلب من الفاتورة</span></label>
          <div className="digits" aria-live="polite">{(num || " ").split("").map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", ""].map((k, i) =>
              k ? <button key={i} type="button" onClick={() => setNum((n) => (k === "del" ? n.slice(0, -1) : (n + k).slice(0, 6)))} aria-label={k === "del" ? "حذف" : k}>{k === "del" ? "⌫" : k}</button> : <span key={i} />,
            )}
          </div>
        </>
      ) : (
        <p className="hint">يُولَّد رقم مقاوم للخطأ تلقائيًا، ويظهر للعميل مع رمز QR.</p>
      )}
      <div className="field">
        <span>عدد الأصناف</span>
        <div className="stepper">
          <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="إنقاص">−</button>
          <b className="ltr">{count}</b>
          <button type="button" onClick={() => setCount((c) => Math.min(20, c + 1))} aria-label="زيادة">+</button>
        </div>
      </div>
      <div className="field">
        <span>وصف مختصر (اختياري)</span>
        <div className="chips">
          {QUICK.map((q) => (
            <button key={q} type="button" className="chip-btn" aria-pressed={summary.includes(q)} onClick={() => setSummary((s) => (s.includes(q) ? s.filter((x) => x !== q) : [...s, q]))}>{q}</button>
          ))}
        </div>
      </div>
      {stations.length > 1 && (
        <label className="field">
          <span>نقطة الاستلام</span>
          <select id="new-station" className="input" value={station} onChange={(e) => setStation(e.target.value)}>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <div className="row">
        <button type="button" className="btn grow" disabled={manual && !num} onClick={submit}>إنشاء</button>
        <button type="button" className="btn white grow" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}

function QrModal({ order, until, origin, label, onClose }: { order: StaffOrder; until: number; origin: string; label: string; onClose: () => void }) {
  const [left, setLeft] = useState(Math.ceil((until - Date.now()) / 1000));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.ceil((until - Date.now()) / 1000);
      setLeft(l);
      if (l <= 0) onClose();
    }, 500);
    return () => clearInterval(t);
  }, [until, onClose]);
  const url = `${origin}/o/${order.token}?claim=1`;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" style={{ textAlign: "center", justifyItems: "center" }}>
      <h2 id="qr-title">{label} <span className="ltr">{order.number}</span></h2>
      <div className="qr-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/qr?d=${encodeURIComponent(url)}`} alt={`رمز متابعة ${label} ${order.number}`} />
        <span className="hint">اطلب من العميل مسح الرمز لمتابعة {label}ه</span>
      </div>
      <p className="hint">يُغلق تلقائيًا بعد <span className="ltr">{Math.max(left, 0)}</span> ثانية</p>
      <button type="button" className="btn white block" onClick={onClose}>إغلاق</button>
    </div>
  );
}

function RedeemModal({ onClose, onDone }: { onClose: () => void; onDone: (reward: string) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = async (c: string) => {
    const r = await post<{ reward?: string; error?: string }>("/api/s/redeem", { code: c });
    if (r.ok && r.data.reward) onDone(r.data.reward);
    else {
      setErr(r.data.error === "CODE_INVALID" ? "الرمز غير صحيح أو منتهي." : r.data.error === "NOT_ENOUGH_STAMPS" ? "الأختام لا تكفي." : "تعذّر الصرف.");
      setCode("");
    }
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rd-title">
      <h2 id="rd-title">صرف مكافأة</h2>
      <p className="hint">أدخل الرمز المكوّن من 4 أرقام الظاهر في بطاقة العميل.</p>
      <div className="digits">{Array.from({ length: 4 }, (_, i) => <span key={i}>{code[i] ?? ""}</span>)}</div>
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", ""].map((k, i) =>
          k ? (
            <button
              key={i}
              type="button"
              aria-label={k === "del" ? "حذف" : k}
              onClick={() => {
                setErr(null);
                const n = k === "del" ? code.slice(0, -1) : (code + k).slice(0, 4);
                setCode(n);
                if (n.length === 4) void submit(n);
              }}
            >
              {k === "del" ? "⌫" : k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      {err && <div className="error" role="alert">{err}</div>}
      <button type="button" className="btn white" onClick={onClose}>إغلاق</button>
    </div>
  );
}
