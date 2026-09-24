import { requireUser } from "@/server/auth";
import { getIntegrations, smsEnabled, whatsappEnabled } from "@/server/integrations";
import { getVapid, serverOrigin } from "@/server/appconfig";
import { saveIntegrationsAction, testChannelAction } from "../actions";

export const dynamic = "force-dynamic";

function Secret({ name, label, has }: { name: string; label: string; has: boolean }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" dir="ltr" type="password" autoComplete="off" placeholder={has ? "•••••••• محفوظ. اتركه فارغًا للإبقاء عليه" : "الصق المفتاح هنا"} />
      {has && <label className="check small"><input type="checkbox" name={`clear:${name}`} /> حذف المفتاح المحفوظ</label>}
    </div>
  );
}

export default async function Integrations({ searchParams }: { searchParams: Promise<{ saved?: string; test?: string; ok?: string; msg?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const i = await getIntegrations(user.tenantId);
  const origin = await serverOrigin();
  const vapid = await getVapid();
  const smsHook = `${origin}/api/hooks/sms/${user.tenantId}?s=${i["sms.inboundSecret"]}`;
  const waHook = `${origin}/api/hooks/whatsapp/${user.tenantId}`;

  return (
    <>
      <div className="m-head">
        <div>
          <span className="eyebrow">{user.tenant.name}</span>
          <h1>التكاملات والمفاتيح</h1>
        </div>
      </div>
      <p className="hint">كل ما يحتاج مفتاحًا من مزوّد خارجي يُضاف هنا، ويُحفظ مشفّرًا. النظام يعمل كاملًا بدون أي مفتاح: الصفحة الحيّة، والإشعارات على الجوال، وتنبيه الموظف، وشاشة الأرقام. المفاتيح تضيف قنوات إضافية لسلّم النداء.</p>
      {sp.saved && <div className="ok" role="status">تم الحفظ.</div>}
      {sp.test && (sp.ok === "1" ? <div className="ok" role="status">أُرسلت رسالة التجربة بنجاح.</div> : <div className="error" role="alert">فشلت رسالة التجربة: <span className="ltr">{sp.msg}</span></div>)}

      <section className="card">
        <h3>إشعارات الجوال (Web Push)</h3>
        <span className="status-dot on">مفعّلة تلقائيًا، لا تحتاج مفتاحًا</span>
        <p className="hint">مفاتيح VAPID وُلّدت تلقائيًا وحُفظت في قاعدة البيانات. على آيفون تعمل الإشعارات بعد إضافة الصفحة إلى الشاشة الرئيسية.</p>
        <span className="code">{vapid.publicKey.slice(0, 32)}…</span>
      </section>

      <form action={saveIntegrationsAction} className="stack">
        <section className="card">
          <h3>الرسائل النصية (SMS)</h3>
          <span className={`status-dot ${smsEnabled(i) ? "on" : ""}`}>{smsEnabled(i) ? "مفعّلة" : "غير مفعّلة"}</span>
          <p className="hint">تُستخدم في سلّم النداء لمن أضاف رقمه، وفي حل «بلا إنترنت»: يرسل العميل رقم طلبه برسالة نصية ويصله النداء نصيًا.</p>
          <label className="field"><span>المزوّد</span>
            <select id="sms.provider" name="sms.provider" className="input" defaultValue={i["sms.provider"] ?? "none"}>
              <option value="none">بلا</option>
              <option value="unifonic">Unifonic</option>
              <option value="twilio">Twilio</option>
            </select>
          </label>
          <div className="form-grid">
            <Secret name="sms.unifonic.appSid" label="Unifonic · AppSid" has={!!i["sms.unifonic.appSid"]} />
            <label className="field"><span>Unifonic · SenderID</span><input id="sms.unifonic.senderId" name="sms.unifonic.senderId" className="input" dir="ltr" defaultValue={i["sms.unifonic.senderId"] ?? ""} /></label>
          </div>
          <div className="form-grid">
            <label className="field"><span>Twilio · Account SID</span><input id="sms.twilio.accountSid" name="sms.twilio.accountSid" className="input" dir="ltr" defaultValue={i["sms.twilio.accountSid"] ?? ""} /></label>
            <Secret name="sms.twilio.authToken" label="Twilio · Auth Token" has={!!i["sms.twilio.authToken"]} />
            <label className="field"><span>Twilio · رقم الإرسال</span><input id="sms.twilio.from" name="sms.twilio.from" className="input" dir="ltr" defaultValue={i["sms.twilio.from"] ?? ""} placeholder="+1..." /></label>
          </div>
          <label className="field"><span>رقم استقبال رسائل العملاء (يظهر في شاشة بلا إنترنت)</span><input id="sms.inboundNumber" name="sms.inboundNumber" className="input" dir="ltr" defaultValue={i["sms.inboundNumber"] ?? ""} placeholder="+9665xxxxxxxx" /></label>
          <div className="field"><span>رابط الرسائل الواردة (ضعه في لوحة المزوّد)</span><span className="code">{smsHook}</span></div>
        </section>

        <section className="card">
          <h3>واتساب (WhatsApp Cloud API)</h3>
          <span className={`status-dot ${whatsappEnabled(i) ? "on" : ""}`}>{whatsappEnabled(i) ? "مفعّل" : "غير مفعّل"}</span>
          <p className="hint">يضغط العميل «التنبيه عبر واتساب» فتُفتح محادثة برسالة جاهزة تحمل رمز طلبه. عند وصولها يُربط رقمه بالطلب، ويصله النداء داخل نافذة المحادثة.</p>
          <div className="form-grid">
            <Secret name="wa.token" label="Access Token" has={!!i["wa.token"]} />
            <label className="field"><span>Phone Number ID</span><input id="wa.phoneNumberId" name="wa.phoneNumberId" className="input" dir="ltr" defaultValue={i["wa.phoneNumberId"] ?? ""} /></label>
            <label className="field"><span>رقم واتساب التجاري (دولي بلا +)</span><input id="wa.businessNumber" name="wa.businessNumber" className="input" dir="ltr" defaultValue={i["wa.businessNumber"] ?? ""} placeholder="9665xxxxxxxx" /></label>
            <Secret name="wa.appSecret" label="App Secret (اختياري للتحقق من التوقيع)" has={!!i["wa.appSecret"]} />
          </div>
          <div className="field"><span>Callback URL في إعدادات Meta</span><span className="code">{waHook}</span></div>
          <div className="field"><span>Verify Token</span><span className="code">{i["wa.verifyToken"]}</span></div>
        </section>

        <div className="row"><button className="btn" type="submit">حفظ المفاتيح</button></div>
      </form>

      <section className="grid2">
        <form action={testChannelAction} className="card">
          <h3>تجربة الرسائل النصية</h3>
          <input type="hidden" name="kind" value="sms" />
          <label className="field"><span>رقم الجوال</span><input id="test-sms" name="to" className="input" dir="ltr" placeholder="05xxxxxxxx" /></label>
          <button className="btn white" type="submit" disabled={!smsEnabled(i)}>إرسال تجربة</button>
        </form>
        <form action={testChannelAction} className="card">
          <h3>تجربة واتساب</h3>
          <input type="hidden" name="kind" value="wa" />
          <label className="field"><span>رقم الجوال</span><input id="test-wa" name="to" className="input" dir="ltr" placeholder="05xxxxxxxx" /></label>
          <button className="btn white" type="submit" disabled={!whatsappEnabled(i)}>إرسال تجربة</button>
          <p className="hint">رسالة نصية حرة تصل فقط إذا راسلك الرقم خلال آخر 24 ساعة (قاعدة Meta).</p>
        </form>
      </section>

      <section className="card">
        <h3>تقييم Google</h3>
        <p className="hint">لا يحتاج مفتاحًا. أضف معرّف المكان (Place ID) لكل فرع من صفحة إعدادات الفرع.</p>
      </section>
    </>
  );
}
