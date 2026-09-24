import Link from "next/link";
import { requireBranch, requireUser } from "@/server/auth";
import { loadBranch } from "@/server/orders";
import { dashboard, HEAT_HOURS } from "@/server/analytics";
import { serverOrigin } from "@/server/appconfig";
import { AR_DAYS, fmtDuration, localParts } from "@/core/time";
import { BranchPicker } from "@/components/BranchPicker";

export const dynamic = "force-dynamic";

const HEAT = ["#E9E5DC", "#EBD39A", "#D9A85B", "#C4763B", "#9E4A24"];
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const dur = (s: number | null) => (s === null ? "—" : fmtDuration(s));

function Delta({ now, prev, lowerIsBetter = true, fmt }: { now: number | null; prev: number | null; lowerIsBetter?: boolean; fmt: (d: number) => string }) {
  if (now === null || prev === null) return null;
  const d = now - prev;
  if (Math.abs(d) < 1e-9) return <em className="muted">بلا تغيير</em>;
  const better = lowerIsBetter ? d < 0 : d > 0;
  return <em className={better ? "down-good" : "up-bad"}>{d > 0 ? "▲" : "▼"} <span className="ltr">{fmt(Math.abs(d))}</span></em>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ b?: string; welcome?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const b0 = await requireBranch(user.tenantId, sp.b);
  const branch = (await loadBranch(b0.id))!;
  const d = await dashboard(branch);
  const origin = await serverOrigin();
  const lp = localParts(new Date(), branch.timezone);
  const maxP90 = Math.max(...d.cells.map((c) => c.p90PrepSec), 1);
  const heatIdx = (v: number, count: number) => (count === 0 ? -1 : Math.min(4, Math.floor((v / maxP90) * 5)));
  const w = d.week;
  const pw = d.prevWeek;
  const splitTotal = (w.medianPrep ?? 0) + (w.medianPickup ?? 0);

  return (
    <>
      <div className="m-head">
        <div>
          <span className="eyebrow">{branch.name}</span>
          <h1>اليوم · {AR_DAYS[lp.weekday]} <span className="ltr">{lp.d}/{lp.m}</span></h1>
        </div>
        <div className="row no-print">
          <BranchPicker tenantId={user.tenantId} current={branch.id} path="/m" />
          <a className="btn white" href={`/tv/${branch.slug}?key=${branch.tvKey}`} target="_blank" rel="noreferrer">شاشة الأرقام</a>
          <a className="btn" href="/s" target="_blank" rel="noreferrer">لوحة الموظف</a>
        </div>
      </div>

      {(sp.welcome || !d.hasData) && (
        <section className="card">
          <h3>ابدأ في 4 خطوات</h3>
          <ol className="stack" style={{ margin: 0, paddingInlineStart: 20 }}>
            <li>افتح <b>لوحة الموظف</b> على تابلت الكاشير من الرابط <span className="code">{origin}/s/join</span> وأدخل رمز الربط <b className="num-font ltr">{branch.joinCode}</b>.</li>
            <li>اطبع <Link href={`/m/print?b=${branch.id}`}>رمز QR للعملاء</Link> وضعه أمام الكاشير.</li>
            <li>افتح <a href={`/tv/${branch.slug}?key=${branch.tvKey}`} target="_blank" rel="noreferrer">شاشة الأرقام</a> على أي شاشة في الفرع (اختياري).</li>
            <li>أضف مفاتيح واتساب والرسائل النصية من <Link href="/m/integrations">التكاملات</Link> متى أردت. النظام يعمل بدونها بالإشعارات والصفحة الحيّة.</li>
          </ol>
        </section>
      )}

      <section className="tiles" aria-label="أرقام اليوم">
        <div className="tile"><small>الطلبات</small><b className="ltr">{d.today.count}</b></div>
        <div className="tile"><small>وسيط التحضير</small><b className="ltr">{dur(d.today.medianPrep)}</b></div>
        <div className="tile"><small>P90 التحضير</small><b className="ltr">{dur(d.today.p90Prep)}</b><Delta now={d.today.p90Prep} prev={d.today.p90LastWeek} fmt={fmtDuration} /></div>
        <div className="tile"><small>غير مستلم</small><b className="ltr">{d.today.unclaimed}</b></div>
        <div className="tile"><small>دقة الوعد</small><b className="ltr">{pct(d.today.promiseAccuracy)}</b></div>
        <div className="tile"><small>نسبة المتابعة من الجوال</small><b className="ltr">{pct(d.today.claimRate)}</b></div>
      </section>

      <div className="now">
        الآن: <b className="ltr">{d.today.activeNow}</b> {branch.mode === "TICKET" ? "في الانتظار" : "قيد التحضير"}
        {d.today.longestNumber && <>، أطولها <span className="ltr">{d.today.longestNumber}</span> منذ <span className="ltr">{dur(d.today.longestSec)}</span></>}.
        {branch.status === "PAUSED" && " الفرع في توقف مؤقت للصلاة."}
      </div>

      {d.recs.length > 0 && (
        <section className="grid2" aria-label="توصيات">
          {d.recs.map((r) => (
            <article key={r.id} className="rec">
              <b>توصية</b>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
              <details>
                <summary>لماذا؟</summary>
                <ul>{r.why.map((x) => <li key={x}>{x}</li>)}</ul>
              </details>
            </article>
          ))}
        </section>
      )}

      <section className="grid2">
        <div className="card">
          <h3>متى يحدث التأخير؟</h3>
          <p className="hint">زمن التحضير P90 حسب اليوم والساعة، آخر 4 أسابيع. الخلايا الفارغة بلا طلبات.</p>
          <div className="heat-wrap">
            <div className="heat">
              <span />
              {HEAT_HOURS.map((h) => <span key={h} className="h">{h % 2 ? "" : h}</span>)}
              {AR_DAYS.map((day, wd) => (
                <div key={day} style={{ display: "contents" }}>
                  <span className="d">{day}</span>
                  {HEAT_HOURS.map((h) => {
                    const c = d.cells.find((x) => x.weekday === wd && x.hour === h)!;
                    const i = heatIdx(c.p90PrepSec, c.count);
                    return <i key={h} style={{ background: i < 0 ? "transparent" : HEAT[i], boxShadow: i < 0 ? "inset 0 0 0 1px var(--sand)" : undefined }} title={`${day} ${h}:00 · ${c.count} طلب · P90 ${fmtDuration(c.p90PrepSec)}`} />;
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="legend"><span>أسرع</span>{HEAT.map((c) => <i key={c} style={{ background: c }} />)}<span>أبطأ</span></div>
          {d.quietest && <p className="hint">أهدأ ساعتين عادةً: <span className="ltr">{d.quietest.from}:00–{d.quietest.to}:00</span>. مناسبة للأختام المضاعفة.</p>}
        </div>

        <div className="stack">
          <div className="card">
            <h3>أين يذهب وقت الانتظار؟</h3>
            <p className="hint">وسيط آخر 7 أيام</p>
            <div className="bar2" aria-hidden="true">
              <i style={{ width: `${splitTotal ? ((w.medianPrep ?? 0) / splitTotal) * 100 : 50}%`, background: "var(--delay)" }} />
              <i style={{ width: `${splitTotal ? ((w.medianPickup ?? 0) / splitTotal) * 100 : 50}%`, background: "var(--wait)" }} />
            </div>
            <div className="kv"><span><span className="dot" style={{ background: "var(--delay)" }} />التحضير</span><b className="ltr">{dur(w.medianPrep)}</b></div>
            <div className="kv"><span><span className="dot" style={{ background: "var(--wait)" }} />استجابة العميل بعد النداء</span><b className="ltr">{dur(w.medianPickup)}</b></div>
            <p className="hint">{(w.medianPickup ?? 0) > (w.medianPrep ?? 0) * 0.35 ? "جزء كبير من الوقت بعد الجاهزية: النداء أو نقطة الاستلام تحتاج تحسينًا." : "الاختناق في التحضير لا في الاستلام."}</p>
          </div>
          <div className="card">
            <h3>هل تحسّن الأداء؟</h3>
            <p className="hint">آخر 7 أيام مقارنة بالأسبوع الذي قبله</p>
            <div className="kv"><span>وسيط الانتظار الكلي</span><span><b className="ltr">{dur(w.medianTotal)}</b> <Delta now={w.medianTotal} prev={pw.medianTotal} fmt={fmtDuration} /></span></div>
            <div className="kv"><span>غير المستلم</span><span><b className="ltr">{pct(w.unclaimedRate)}</b> <Delta now={w.unclaimedRate} prev={pw.unclaimedRate} fmt={(x) => `${(x * 100).toFixed(1)}%`} /></span></div>
            <div className="kv"><span>دقة الوعد</span><span><b className="ltr">{pct(w.promiseAccuracy)}</b> <Delta now={w.promiseAccuracy} prev={pw.promiseAccuracy} lowerIsBetter={false} fmt={(x) => `${Math.round(x * 100)}%`} /></span></div>
            <div className="kv"><span>المتابعة من الجوال</span><span><b className="ltr">{pct(w.claimRate)}</b> <Delta now={w.claimRate} prev={pw.claimRate} lowerIsBetter={false} fmt={(x) => `${Math.round(x * 100)}%`} /></span></div>
            <div className="kv"><span>نقرات تقييم Google</span><span><b className="ltr">{w.reviewClicks}</b> <Delta now={w.reviewClicks} prev={pw.reviewClicks} lowerIsBetter={false} fmt={(x) => String(x)} /></span></div>
          </div>
        </div>
      </section>

      <section className="grid2">
        <div className="card">
          <h3>رأي العملاء (7 أيام)</h3>
          <div className="kv"><span>ممتازة</span><b className="ltr">{d.feedback.great}</b></div>
          <div className="kv"><span>جيدة</span><b className="ltr">{d.feedback.ok}</b></div>
          <div className="kv"><span>غير جيدة</span><b className="ltr">{d.feedback.bad}</b></div>
          {d.feedback.badLongWaitShare !== null && <p className="hint"><span className="ltr">{pct(d.feedback.badLongWaitShare)}</span> من التقييمات السلبية كانت بعد انتظار أطول من 10 دقائق.</p>}
          {d.feedback.reasons.length > 0 && <p className="hint">الأسباب: {d.feedback.reasons.map(([r, n]) => `${r} (${n})`).join("، ")}</p>}
          {d.feedback.notes.length > 0 && (
            <>
              <h3>ملاحظات خاصة</h3>
              {d.feedback.notes.map((n, i) => <p key={i} className="hint">«{n.note}»</p>)}
            </>
          )}
        </div>
        <div className="card">
          <h3>الأختام (7 أيام)</h3>
          <div className="kv"><span>أختام صدرت</span><b className="ltr">{d.loyalty.issued}</b></div>
          <div className="kv"><span>في ساعات هادئة</span><b className="ltr">{d.loyalty.quiet}</b></div>
          <div className="kv"><span>أختام اعتذار (وعد لم نفِ به)</span><b className="ltr">{d.loyalty.apology}</b></div>
          <div className="kv"><span>مكافآت صُرفت</span><b className="ltr">{d.loyalty.redeemed}</b></div>
        </div>
        <div className="card">
          <h3>لم يُستلم (آخر 24 ساعة)</h3>
          {d.unclaimedList.length === 0 ? (
            <p className="hint">لا شيء. كل الطلبات الجاهزة استُلمت.</p>
          ) : (
            <table className="table">
              <thead><tr><th>الرقم</th><th>جهز</th><th>السبب</th></tr></thead>
              <tbody>
                {d.unclaimedList.map((u, i) => (
                  <tr key={i}>
                    <td className="num-font ltr">{u.number}</td>
                    <td className="ltr">{u.readyAt ? new Date(u.readyAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: branch.timezone }) : "—"}</td>
                    <td>{u.reason === "NO_SHOW" ? "لم يحضر" : u.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <p className="hint">الأرقام تُحسب من أحداث الطلبات الفعلية: الإنشاء، الجاهزية، النداء، الاستلام. فترات إيقاف الصلاة لا تُحسب في زمن التحضير.</p>
    </>
  );
}
