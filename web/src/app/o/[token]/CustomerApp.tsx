"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicView } from "@/server/orders";
import { Bell } from "@/components/Bell";
import { Game } from "@/components/Game";
import { b64ToUint8, chime, deviceKey, fmtMin, post, unlockAudio, vibrate } from "@/lib/client";

type Card = {
  enabled: boolean; goal: number; reward: string; stamps: number; redeemed: number; quietNow: boolean;
  entries: { value: number; reason: string; at: string; number: string }[];
};
type Extra = "none" | "game" | "review" | "card";

const REASON: Record<string, string> = { PICKUP: "استلام", QUIET_HOUR: "ساعة هادئة", FAST_PICKUP: "استلام خلال دقيقة", PROMISE_BROKEN: "اعتذار عن التأخير" };
const BAD_REASONS = ["التأخير", "الطلب نفسه", "الخدمة", "النداء", "أخرى"];

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone);
}

export function CustomerApp({ initial, vapidKey }: { initial: PublicView; vapidKey: string }) {
  const [v, setV] = useState<PublicView>(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const [extra, setExtra] = useState<Extra>("none");
  const [now, setNow] = useState(() => Date.now());
  const [pushState, setPushState] = useState<"idle" | "busy" | "on" | "denied" | "unsupported" | "ios">("idle");
  const [smsOpen, setSmsOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [card, setCard] = useState<Card | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const prevStatus = useRef(initial.status);
  const callCount = useRef(0);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = v.token;
  const cacheKey = `dorak:order:${token}`;

  const apply = useCallback(
    (nv: PublicView) => {
      setV(nv);
      setFetchedAt(Date.now());
      setOffline(false);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ view: nv, at: Date.now() }));
        localStorage.setItem(`dorak:last:${nv.branch.slug}`, JSON.stringify({ token: nv.token, number: nv.number, at: Date.now() }));
      } catch {}
    },
    [cacheKey],
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/o/${token}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      apply(await res.json());
    } catch {
      setOffline(true);
    }
  }, [token, apply]);

  /* ---------- live connection ---------- */
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      es = new EventSource(`/api/o/${token}/stream`);
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === "order" && d.view) apply(d.view);
          else if (d.type === "tick") {
            if (refetchTimer.current) clearTimeout(refetchTimer.current);
            refetchTimer.current = setTimeout(refetch, 600);
          }
        } catch {}
      };
      es.onerror = () => {
        es?.close();
        void refetch();
        retry = setTimeout(open, 4000);
      };
    };
    open();
    const poll = setInterval(refetch, 30000);
    const on = () => void refetch();
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
      clearInterval(poll);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [token, apply, refetch]);

  /* ربط الجهاز عند فتح الصفحة من رمز التابلت */
  useEffect(() => {
    if (typeof window === "undefined" || !location.search.includes("claim=1")) return;
    void post(`/api/c/${initial.branch.slug}/claim`, { number: initial.number, deviceKey: deviceKey() }).then(() => {
      history.replaceState(null, "", location.pathname);
      void refetch();
    });
  }, [initial.branch.slug, initial.number, refetch]);

  /* heartbeat + clock */
  useEffect(() => {
    const hb = setInterval(() => {
      if (document.visibilityState === "visible") void post(`/api/o/${token}/heartbeat`);
    }, 15000);
    const clk = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(hb);
      clearInterval(clk);
    };
  }, [token]);

  /* service worker + push state */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setPushState(isIos() ? "ios" : "unsupported");
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!("PushManager" in window) || !("Notification" in window)) {
      setPushState(isIos() ? "ios" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") setPushState("denied");
    else if (initial.channels.webpush && Notification.permission === "granted") setPushState("on");
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [initial.channels.webpush]);

  /* wake lock keeps the page alive while waiting */
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const active = v.status === "CREATED" || v.status === "PREPARING" || v.status === "READY";
    const req = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (active && wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch {}
    };
    void req();
    document.addEventListener("visibilitychange", req);
    return () => {
      document.removeEventListener("visibilitychange", req);
      void lock?.release().catch(() => {});
    };
  }, [v.status]);

  /* the call moment */
  useEffect(() => {
    const becameReady = v.status === "READY" && prevStatus.current !== "READY";
    const firstLoadCall = v.status === "READY" && callCount.current === 0 && typeof window !== "undefined" && location.search.includes("call=1");
    prevStatus.current = v.status;
    if (becameReady || firstLoadCall) {
      callCount.current = 0;
      setExtra("none");
    }
    if (v.status !== "READY" || v.customerState === "ON_MY_WAY" || v.customerState === "STEPPED_OUT") return;
    const ring = () => {
      if (callCount.current >= 5) return;
      callCount.current += 1;
      chime();
      vibrate([200, 100, 200, 100, 600]);
    };
    if (becameReady || firstLoadCall || callCount.current === 0) ring();
    const t = setInterval(ring, 20000);
    let flip = false;
    const title = document.title;
    const tt = setInterval(() => {
      if (document.visibilityState === "hidden") document.title = (flip = !flip) ? "حان دورك" : title;
      else document.title = title;
    }, 1000);
    return () => {
      clearInterval(t);
      clearInterval(tt);
      document.title = title;
    };
  }, [v.status, v.customerState]);

  /* after pickup: card + art */
  useEffect(() => {
    if (v.status !== "PICKED_UP") return;
    try {
      setArt(sessionStorage.getItem(`dorak:art:${token}:png`));
    } catch {}
    if (v.branch.loyaltyEnabled)
      fetch(`/api/o/${token}/card?k=${encodeURIComponent(deviceKey())}`)
        .then((r) => r.json())
        .then(setCard)
        .catch(() => {});
  }, [v.status, v.branch.loyaltyEnabled, token]);

  /* ---------- actions ---------- */
  async function enablePush() {
    if (isIos() && !("PushManager" in window)) return setPushState("ios");
    setPushState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPushState(perm === "denied" ? "denied" : "idle");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey) }));
      const r = await post(`/api/o/${token}/channel`, { kind: "WEBPUSH", subscription: sub.toJSON() });
      setPushState(r.ok ? "on" : "idle");
    } catch {
      setPushState("idle");
    }
  }

  async function sendState(state: string, text: string) {
    unlockAudio();
    const r = await post(`/api/o/${token}/state`, { state });
    if (r.ok) setMsg(text);
    void refetch();
  }

  async function addSms() {
    const r = await post<{ error?: string }>(`/api/o/${token}/channel`, { kind: "SMS", phone });
    if (r.ok) {
      setSmsOpen(false);
      setMsg("سنرسل لك رسالة نصية عندما يحين دورك.");
      void refetch();
    } else setMsg(r.data.error === "BAD_PHONE" ? "رقم الجوال غير صحيح." : "تعذّر تفعيل الرسائل النصية.");
  }

  async function sendFeedback(s: number, rsn?: string | null, n?: string) {
    setScore(s);
    await post(`/api/o/${token}/feedback`, { score: s, reason: rsn ?? undefined, note: n });
  }

  async function redeem() {
    const r = await post<{ code?: string; expiresAt?: string; error?: string }>(`/api/o/${token}/card`, { deviceKey: deviceKey() });
    if (r.ok && r.data.code) setCode({ code: r.data.code, expiresAt: r.data.expiresAt! });
    else setMsg("لا تكفي الأختام بعد.");
  }

  const openCard = () => {
    setExtra("card");
    fetch(`/api/o/${token}/card?k=${encodeURIComponent(deviceKey())}`)
      .then((r) => r.json())
      .then(setCard)
      .catch(() => {});
  };

  /* ---------- derived ---------- */
  const L = v.label;
  const active = v.status === "CREATED" || v.status === "PREPARING";
  const sinceFetch = (now - fetchedAt) / 1000;
  const eta = v.eta ? { low: Math.max(v.eta.lowSec - sinceFetch, 0), high: Math.max(v.eta.highSec - sinceFetch, 60) } : null;
  const etaText = eta ? (eta.high <= 90 ? "أقل من دقيقة" : `${fmtMin(eta.low)}–${fmtMin(eta.high)} دقائق`) : "خلال دقائق قليلة";
  const aheadText = v.queueAhead === 0 ? "أنت التالي" : v.queueAhead === 1 ? "أمامك طلب واحد" : v.queueAhead === 2 ? "أمامك طلبان" : `أمامك ${v.queueAhead} طلبات`;
  const queueBars = Math.min(v.queueAhead, 7);
  const style = { ["--brand" as string]: v.branch.color };
  const showBell = v.branch.showMascot;

  const screen = useMemo(() => {
    if (offline && active) return "offline";
    if (v.status === "READY") return "call";
    if (v.status === "PICKED_UP") return extra === "review" ? "review" : extra === "card" ? "card" : "done";
    if (v.status === "UNCLAIMED") return "unclaimed";
    if (v.status === "CANCELLED") return "cancelled";
    if (extra === "card") return "card";
    if (v.branch.paused) return "pause";
    if (extra === "game") return "game";
    if (v.promiseBroken) return "delay";
    if (v.status === "PREPARING" && v.queueAhead === 0) return "near";
    return "wait";
  }, [offline, active, v.status, v.branch.paused, v.promiseBroken, v.queueAhead, extra]);

  const bar = (
    <header className="cx-bar">
      <span className="cx-logo">{v.branch.brand.trim().split(/\s+/).pop()?.charAt(0)}</span>
      <div>
        <b>{v.branch.brand}</b>
        <small>{v.branch.name}</small>
      </div>
    </header>
  );

  const alerts = (
    <>
      {pushState !== "unsupported" && (
        <button type="button" className="cx-opt" onClick={enablePush} disabled={pushState === "busy" || pushState === "on" || pushState === "denied" || pushState === "ios"}>
          <span>التنبيه على الجوال</span>
          <span className={pushState === "on" ? "on" : ""}>
            {pushState === "on" ? "مفعّل" : pushState === "denied" ? "مرفوض في الإعدادات" : pushState === "ios" ? "يتطلب إضافة الصفحة" : pushState === "busy" ? "…" : "تفعيل"}
          </span>
        </button>
      )}
      {pushState === "ios" && <p className="cx-hint">على آيفون: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، وافتح الصفحة من هناك لتصلك الإشعارات. أو اختر واتساب أو رسالة نصية.</p>}
      {v.branch.whatsappNumber && !v.channels.whatsapp && (
        <a
          className="cx-opt"
          style={{ textDecoration: "none" }}
          href={`https://wa.me/${v.branch.whatsappNumber}?text=${encodeURIComponent(`تنبيهي عند جاهزية ${L} ${v.number} · DK-${token}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          <span>التنبيه عبر واتساب</span>
          <span>إرسال رسالة</span>
        </a>
      )}
      {v.channels.whatsapp && <div className="cx-opt"><span>واتساب</span><span className="on">مفعّل</span></div>}
      {v.branch.smsEnabled && !v.channels.sms && !smsOpen && (
        <button type="button" className="cx-opt" onClick={() => setSmsOpen(true)}>
          <span>التنبيه برسالة نصية</span>
          <span>إضافة رقم</span>
        </button>
      )}
      {smsOpen && (
        <form
          className="cx-card"
          onSubmit={(e) => {
            e.preventDefault();
            void addSms();
          }}
        >
          <label className="field">
            <span>رقم الجوال</span>
            <input id="sms-phone" className="input" inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <small>يُحذف الرقم تلقائيًا بعد 24 ساعة.</small>
          <button className="btn" type="submit">تفعيل</button>
        </form>
      )}
      {v.channels.sms && <div className="cx-opt"><span>رسالة نصية</span><span className="on">مفعّلة</span></div>}
    </>
  );

  const etaCard = (title = "الوقت المتوقع") => (
    <div className="cx-card">
      <small>{title}</small>
      <span className="big">{etaText.includes("–") ? <span className="ltr">{etaText.split(" ")[0]}</span> : etaText}{etaText.includes("–") ? " دقائق" : ""}</span>
      <div className="queue" aria-hidden="true">
        {Array.from({ length: queueBars }).map((_, i) => <i key={i} className="ahead" />)}
        <i className="me" />
      </div>
      <small>{aheadText}</small>
    </div>
  );

  /* ---------- screens ---------- */
  let content: React.ReactNode;
  let cls = "s-wait";
  switch (screen) {
    case "offline": {
      cls = "s-offline";
      content = (
        <>
          {bar}
          <div className="cx-banner gray">لا يوجد اتصال. سنُحدّث الحالة عند عودته.</div>
          {showBell && <div className="cx-bell sm"><Bell tone="offline" face="dash" anim="none" /></div>}
          <span className="cx-lbl">آخر حالة معروفة · قبل {Math.max(1, Math.round(sinceFetch / 60))} د</span>
          <div className="cx-num ltr">{v.number}</div>
          {etaCard("الوقت المتوقع يستمر محليًا")}
          {v.branch.smsNumber && (
            <a className="cx-opt" style={{ textDecoration: "none" }} href={`sms:${v.branch.smsNumber}?body=${encodeURIComponent(v.number)}`}>
              <span>أرسل <span className="ltr">{v.number}</span> برسالة نصية</span>
              <span className="ltr">{v.branch.smsNumber}</span>
            </a>
          )}
          {v.branch.wifiSsid && (
            <div className="cx-opt">
              <span>اتصل بشبكة الفرع</span>
              <span>امسح الرمز على الكاونتر · {v.branch.wifiSsid}</span>
            </div>
          )}
          <p className="cx-hint">إن لم يصلك شيء، رقمك سيظهر على شاشة الأرقام في الفرع.</p>
        </>
      );
      break;
    }
    case "call": {
      cls = "s-call";
      const replied = v.customerState === "ON_MY_WAY" || v.customerState === "STEPPED_OUT" || v.customerState === "IN_CAR";
      content = (
        <>
          <div className="rings" aria-hidden="true"><i /><i /><i /></div>
          {bar}
          {showBell && <div className="cx-bell"><Bell tone="white" face="wide" anim={replied ? "sway" : "ring"} /></div>}
          <h1 className="call-word">حان دورك</h1>
          <div className="call-num ltr">{v.number}</div>
          <span className="where">{v.station}</span>
          {replied && <p className="cx-hint">{v.customerState === "ON_MY_WAY" ? "أبلغنا الموظف أنك في الطريق." : v.customerState === "IN_CAR" ? "أبلغنا الموظف أنك في السيارة." : "أبلغنا الموظف أنك ستتأخر قليلًا. طلبك محفوظ."}</p>}
          <div className="cx-fill" />
          <button type="button" className="btn block" onClick={() => sendState("PICKED_UP", "")}>استلمت {L === "دور" ? "الخدمة" : "الطلب"}</button>
          {!replied && <button type="button" className="btn white block" onClick={() => sendState("ON_MY_WAY", "أبلغنا الموظف أنك في الطريق.")}>في الطريق</button>}
          <div className="row" style={{ justifyContent: "center", position: "relative", zIndex: 2 }}>
            <button type="button" className="btn ghost" onClick={() => sendState("STEPPED_OUT", "")}>سأتأخر قليلًا</button>
            <button type="button" className="btn ghost" onClick={() => sendState("IN_CAR", "")}>أنا في السيارة</button>
            <button type="button" className="btn ghost" onClick={() => sendState("WRONG_ORDER", "أبلغنا الموظف. راجع الكاونتر.")}>ليس {L === "دور" ? "دوري" : "طلبي"}</button>
          </div>
        </>
      );
      break;
    }
    case "done": {
      cls = "s-done";
      const stampsNow = card?.stamps ?? 0;
      content = (
        <>
          {bar}
          {showBell && <div className="cx-bell sm"><Bell tone="done" face="happy" /></div>}
          <h1 className="cx-h">شكرًا لك</h1>
          {v.waitedSec !== null && <p>مدة الانتظار <b className="ltr">{fmtMin(v.waitedSec)}</b> دقائق</p>}
          {art && <img className="art-thumb" src={art} alt="زخرفتك أثناء الانتظار" />}
          <div className="cx-card">
            <small>كيف كانت التجربة؟</small>
            <div className="faces" role="group" aria-label="التقييم">
              {([
                [1, "غير جيدة", "delay", "sorry"],
                [2, "جيدة", "wait", "look"],
                [3, "ممتازة", "done", "happy"],
              ] as const).map(([s, t, tone, face]) => (
                <button key={s} type="button" className="face" aria-pressed={score === s} onClick={() => void sendFeedback(s)}>
                  <Bell tone={tone} face={face} anim="none" />
                  {t}
                </button>
              ))}
            </div>
            {score === 1 && (
              <>
                <small>ما الذي لم يعجبك؟</small>
                <div className="chips">
                  {BAD_REASONS.map((r) => (
                    <button key={r} type="button" className="chip-btn" aria-pressed={reason === r} onClick={() => { setReason(r); void sendFeedback(1, r); }}>{r}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          {card?.enabled && <span className="cx-tag"><i />بطاقتك: <span className="ltr">{stampsNow}</span> من <span className="ltr">{card.goal}</span> أختام</span>}
          <div className="cx-fill" />
          <button type="button" className="btn block" onClick={() => (v.branch.reviewUrl ? setExtra("review") : v.branch.loyaltyEnabled ? openCard() : setExtra("review"))}>متابعة</button>
        </>
      );
      break;
    }
    case "review": {
      cls = "s-plain";
      content = (
        <>
          {bar}
          {showBell && <div className="cx-bell sm"><Bell tone="bell" face="happy" /></div>}
          <h1 className="cx-h">يسعدنا أن يعرف الآخرون</h1>
          {v.branch.reviewUrl ? (
            <>
              <p className="cx-hint">تقييمك على خرائط Google يساعد {v.branch.brand}، ويُعرض للجميع كما هو.</p>
              <a className="btn white block" href={v.branch.reviewUrl} target="_blank" rel="noreferrer" onClick={() => void post(`/api/o/${token}/review`)}>
                <GoogleG /> قيّم على خرائط Google
              </a>
            </>
          ) : (
            <p className="cx-hint">شاركنا ملاحظتك مباشرة مع إدارة الفرع.</p>
          )}
          <form
            className="cx-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              void sendFeedback(score ?? 2, reason, note).then(() => {
                setNote("");
                setMsg("وصلت ملاحظتك إلى إدارة الفرع.");
              });
            }}
          >
            <label className="field">
              <span>ملاحظة خاصة إلى إدارة الفرع</span>
              <textarea id="private-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn white" type="submit" disabled={!note.trim()}>إرسال</button>
          </form>
          <div className="cx-fill" />
          <button type="button" className="btn block" onClick={() => (v.branch.loyaltyEnabled ? openCard() : setExtra("none"))}>{v.branch.loyaltyEnabled ? "بطاقة الأختام" : "تم"}</button>
        </>
      );
      break;
    }
    case "card": {
      cls = "s-plain";
      const goal = card?.goal ?? 10;
      const st = card?.stamps ?? 0;
      content = (
        <>
          {bar}
          <h1 className="cx-h">بطاقة {v.branch.brand}</h1>
          {!card ? (
            <p className="hint">جارٍ التحميل…</p>
          ) : !card.enabled ? (
            <p className="hint">برنامج الأختام غير مفعّل في هذا الفرع.</p>
          ) : (
            <>
              <div className="lcard">
                <b><span className="ltr">{st}</span> من <span className="ltr">{goal}</span> أختام</b>
                <div className="stamps">
                  {Array.from({ length: Math.min(goal, 20) }).map((_, i) => (
                    <i key={i} className={i + 1 <= st ? "on" : i < st ? "half" : i === Math.ceil(st) && card.quietNow ? "x2" : ""} />
                  ))}
                </div>
                <small>المكافأة: {card.reward} · تُصرف برمز عند الكاونتر</small>
              </div>
              {card.quietNow && <span className="cx-tag"><i />الفرع هادئ الآن: الختم التالي مضاعف</span>}
              {code ? (
                <div className="cx-card" style={{ textAlign: "center", justifyItems: "center" }}>
                  <small>أعطِ هذا الرمز للموظف خلال 10 دقائق</small>
                  <div className="code-big">{code.code}</div>
                </div>
              ) : (
                st >= goal && <button type="button" className="btn block brand" onClick={redeem}>صرف المكافأة</button>
              )}
              {card.entries.length > 0 && (
                <div className="cx-card">
                  <small>سجل الأختام</small>
                  {card.entries.map((e, i) => (
                    <div key={i} className="kv">
                      <span>{REASON[e.reason] ?? e.reason} · {L} <span className="ltr">{e.number}</span></span>
                      <b className="ltr">+{e.value}</b>
                    </div>
                  ))}
                </div>
              )}
              <p className="hint">البطاقة محفوظة على هذا الجهاز. كل {L} تتابعه من هنا يُضاف ختمه تلقائيًا عند الاستلام.</p>
            </>
          )}
          <div className="cx-fill" />
          <button type="button" className="btn white block" onClick={() => setExtra("none")}>العودة</button>
        </>
      );
      break;
    }
    case "unclaimed":
      cls = "s-plain";
      content = (
        <>
          {bar}
          {showBell && <div className="cx-bell sm"><Bell tone="delay" face="sorry" /></div>}
          <h1 className="cx-h">لم يُستلم {L === "دور" ? "الدور" : "الطلب"} في الوقت المحدد</h1>
          <div className="cx-num ltr">{v.number}</div>
          <p className="cx-hint">راجع الموظف عند {v.station}.</p>
        </>
      );
      break;
    case "cancelled":
      cls = "s-plain";
      content = (
        <>
          {bar}
          <h1 className="cx-h">أُلغي هذا {L}</h1>
          <div className="cx-num ltr">{v.number}</div>
          <p className="cx-hint">إن كان هذا خطأ، راجع الكاشير.</p>
        </>
      );
      break;
    case "pause":
      cls = "s-pause";
      content = (
        <>
          <span className="moon" aria-hidden="true" />
          {bar}
          <div className="cx-fill" style={{ flex: 0.4 }} />
          {showBell && <div className="cx-bell"><Bell tone="white" face="sleep" /></div>}
          <h1 className="cx-h">توقف مؤقت للصلاة</h1>
          <p className="cx-hint">سنستأنف بعد الصلاة، و{L}ك محفوظ.</p>
          <div className="cx-card"><small>{L} <span className="ltr">{v.number}</span></small><b>المؤقت متوقف</b></div>
          <div className="cx-fill" />
        </>
      );
      break;
    case "game":
      cls = "s-plain";
      content = (
        <>
          {bar}
          <div className="cx-opt" style={{ background: "var(--sand)" }}>
            <span>{L} <span className="ltr">{v.number}</span> · قيد التحضير</span>
            <b>{etaText}</b>
          </div>
          <Game color={v.branch.color} storageKey={`dorak:art:${token}`} />
          <p className="hint">المس اللوحة. كل لمسة تنعكس ثماني مرات. تتوقف الزخرفة عند النداء.</p>
          <button type="button" className="btn white block" onClick={() => setExtra("none")}>العودة إلى {L}ي</button>
        </>
      );
      break;
    case "delay":
      cls = "s-delay";
      content = (
        <>
          {bar}
          <div className="cx-banner">{L === "دور" ? "دورك" : "طلبك"} متأخر عن الوقت المتوقع. نعتذر.</div>
          {showBell && <div className="cx-bell sm"><Bell tone="delay" face="sorry" /></div>}
          <span className="cx-lbl">{L}</span>
          <div className="cx-num ltr">{v.number}</div>
          <span className="pill"><i />قيد التحضير</span>
          {etaCard("الوقت المحدّث")}
          {v.branch.loyaltyEnabled && <span className="cx-tag"><i />سيُضاف ختم اعتذار عند الاستلام</span>}
          {alerts}
        </>
      );
      break;
    case "near":
      cls = "s-near";
      content = (
        <>
          {bar}
          {showBell && <div className="cx-bell"><Bell tone="bell" face="wide" /></div>}
          <span className="cx-lbl">{L}</span>
          <div className="cx-num ltr">{v.number}</div>
          <span className="pill"><i style={{ background: "var(--near)" }} />بدأ تحضير {L === "دور" ? "دورك" : "طلبك"}</span>
          {etaCard()}
          <p className="cx-hint">يمكنك التوجه إلى {v.station}.</p>
          {alerts}
        </>
      );
      break;
    default:
      cls = "s-wait";
      content = (
        <>
          {bar}
          {showBell && <div className="cx-bell"><Bell tone="white" face="look" /></div>}
          <span className="cx-lbl">{L}</span>
          <div className="cx-num ltr">{v.number}</div>
          <span className="pill" style={{ color: "var(--ink)" }}><i />{v.status === "PREPARING" ? "قيد التحضير" : "بانتظار التحضير"}</span>
          {etaCard()}
          {alerts}
          <button type="button" className="cx-opt" onClick={() => setExtra("game")}>
            <span>ارسم زخرفة أثناء الانتظار</span>
            <span aria-hidden="true">✦</span>
          </button>
          {v.branch.loyaltyEnabled && (
            <button type="button" className="cx-opt" onClick={openCard}>
              <span>بطاقة الأختام</span>
              <span aria-hidden="true">←</span>
            </button>
          )}
          {v.branch.waitingLine && <p className="cx-hint">{v.branch.waitingLine}</p>}
          <p className="cx-hint">يمكنك الانتظار حيث تشاء. سنُعلمك هنا.</p>
          <button type="button" className="btn ghost" onClick={() => sendState("WRONG_ORDER", "أبلغنا الموظف. راجع الكاونتر.")}>هذا ليس {L === "دور" ? "دوري" : "طلبي"}</button>
        </>
      );
  }

  return (
    <main className={`cx ${cls}`} style={style} onPointerDown={() => unlockAudio()}>
      <div className="cx-inner">{content}</div>
      {msg && (
        <div className="toast" role="status" onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}
      <AutoHide msg={msg} clear={() => setMsg(null)} />
    </main>
  );
}

function AutoHide({ msg, clear }: { msg: string | null; clear: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(clear, 4000);
    return () => clearTimeout(t);
  }, [msg, clear]);
  return null;
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.8 19.8 8.1 22 12 22z" />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1C2.4 8.8 2 10.4 2 12s.4 3.2 1.1 4.6L6.4 14z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.8 4.2 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" />
    </svg>
  );
}
