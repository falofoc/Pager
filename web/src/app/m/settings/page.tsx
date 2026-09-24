import { requireBranch, requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { parseSettings } from "@/server/settings";
import { serverOrigin } from "@/server/appconfig";
import { BranchPicker } from "@/components/BranchPicker";
import { ColorSync } from "./ColorSync";
import { regenerateJoinCodeAction, regenerateTvKeyAction, revokeDeviceAction, saveBranchAction } from "../actions";

export const dynamic = "force-dynamic";

const COLORS = ["#1F5F73", "#2E4A6B", "#2F6B4F", "#8C5A2B", "#7A2E3E", "#4A4E57"];
const ERR: Record<string, string> = {
  slug: "رابط الفرع يجب أن يكون من 3 إلى 30 حرفًا لاتينيًا صغيرًا أو أرقامًا أو شرطة.",
  "slug-taken": "رابط الفرع مستخدم لفرع آخر.",
  color: "اللون يجب أن يكون بصيغة #RRGGBB.",
};

export default async function Settings({ searchParams }: { searchParams: Promise<{ b?: string; saved?: string; e?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const branch = await requireBranch(user.tenantId, sp.b);
  const s = parseSettings(branch.settings);
  const devices = await db.device.findMany({ where: { branchId: branch.id, revokedAt: null }, orderBy: { createdAt: "desc" } });
  const origin = await serverOrigin();
  const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });

  return (
    <>
      <div className="m-head">
        <div>
          <span className="eyebrow">{branch.name}</span>
          <h1>إعدادات الفرع</h1>
        </div>
        <BranchPicker tenantId={user.tenantId} current={branch.id} path="/m/settings" />
      </div>
      {sp.saved && <div className="ok" role="status">تم الحفظ.</div>}
      {sp.e && <div className="error" role="alert">{ERR[sp.e] ?? "تعذّر الحفظ."}</div>}

      <section className="card" id="devices">
        <h3>الأجهزة والروابط</h3>
        <div className="grid2">
          <div className="stack">
            <div className="kv"><span>رمز ربط أجهزة الموظفين</span><b className="num-font ltr" style={{ fontSize: 24 }}>{branch.joinCode}</b></div>
            <p className="hint">افتح <span className="code">{origin}/s/join</span> على التابلت وأدخل الرمز.</p>
            <form action={regenerateJoinCodeAction}><input type="hidden" name="branchId" value={branch.id} /><button className="btn white" type="submit">توليد رمز جديد</button></form>
          </div>
          <div className="stack">
            <div className="field"><span>صفحة العملاء (رمز QR)</span><span className="code">{origin}/c/{branch.slug}</span></div>
            <div className="field"><span>شاشة الأرقام</span><span className="code">{origin}/tv/{branch.slug}?key={branch.tvKey}</span></div>
            <form action={regenerateTvKeyAction}><input type="hidden" name="branchId" value={branch.id} /><button className="btn white" type="submit">تغيير مفتاح الشاشة</button></form>
          </div>
        </div>
        <table className="table">
          <thead><tr><th>الجهاز</th><th>آخر نشاط</th><th /></tr></thead>
          <tbody>
            {devices.length === 0 && <tr><td colSpan={3} className="hint">لا أجهزة مرتبطة بعد.</td></tr>}
            {devices.map((d) => (
              <tr key={d.id}>
                <td>{d.label}</td>
                <td className="ltr">{d.lastSeenAt ? d.lastSeenAt.toLocaleString("en-GB", { timeZone: branch.timezone }) : "—"}</td>
                <td>
                  <form action={revokeDeviceAction}>
                    <input type="hidden" name="branchId" value={branch.id} />
                    <input type="hidden" name="deviceId" value={d.id} />
                    <button className="btn ghost" type="submit">فصل</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form action={saveBranchAction} className="stack">
        <input type="hidden" name="branchId" value={branch.id} />

        <section className="card">
          <h3>الهوية</h3>
          <div className="form-grid">
            <label className="field"><span>اسم العلامة</span><input id="brand" name="brand" className="input" defaultValue={tenant?.name} required /></label>
            <label className="field"><span>اسم الفرع</span><input id="name" name="name" className="input" defaultValue={branch.name} required /></label>
            <label className="field"><span>رابط الفرع (لاتيني)</span><input id="slug" name="slug" className="input" dir="ltr" defaultValue={branch.slug} pattern="[a-z0-9\-]{3,30}" required /></label>
            <label className="field"><span>المنطقة الزمنية</span><input id="timezone" name="timezone" className="input" dir="ltr" defaultValue={branch.timezone} /></label>
          </div>
          <div className="field">
            <span>لون العلامة (يملأ شاشة النداء)</span>
            <div className="swatches">
              {COLORS.map((c) => (
                <label key={c} className="swatch-opt">
                  <input type="radio" name="brandColorPick" value={c} defaultChecked={branch.brandColor.toUpperCase() === c} />
                  <span style={{ background: c }} />
                  <span className="sr">{c}</span>
                </label>
              ))}
              <input id="brandColor" name="brandColor" className="input" dir="ltr" style={{ width: 130 }} defaultValue={branch.brandColor} pattern="#[0-9A-Fa-f]{6}" aria-label="لون مخصص" />
            </div>
            <span className="hint">اختر لونًا داكنًا بحيث يُقرأ النص الأبيض فوقه بوضوح. الحقل النصي هو القيمة المحفوظة؛ اختيار دائرة يملؤه تلقائيًا.</span>
          </div>
          <label className="check"><input type="checkbox" name="showMascot" defaultChecked={s.showMascot} /> إظهار الجرس في شاشات العميل</label>
          <label className="field"><span>سطر اختياري في شاشة الانتظار</span><input id="waitingLine" name="waitingLine" className="input" defaultValue={s.waitingLine} maxLength={140} placeholder="قهوة اليوم: إثيوبيا، تحميص فاتح" /></label>
        </section>

        <section className="card">
          <h3>التشغيل</h3>
          <div className="form-grid">
            <label className="field"><span>النوع</span>
              <select id="mode" name="mode" className="input" defaultValue={branch.mode}>
                <option value="ORDER">طلبات (مقهى، مطعم)</option>
                <option value="TICKET">أدوار (عيادة، مركز خدمة)</option>
              </select>
            </label>
            <label className="field"><span>ترقيم الطلبات</span>
              <select id="numbering" name="numbering" className="input" defaultValue={branch.numbering}>
                <option value="CHECKSUM">تلقائي مقاوم للخطأ (موصى به)</option>
                <option value="MANUAL">يدوي من فاتورة نقطة البيع</option>
              </select>
            </label>
            <label className="field"><span>عدد خانات الرقم التلقائي</span><input id="numberDigits" name="numberDigits" type="number" min={3} max={5} className="input" defaultValue={s.numberDigits} /></label>
            <label className="field"><span>زمن التحضير الافتراضي (دقائق)</span><input id="defaultPrepMin" name="defaultPrepMin" type="number" min={1} max={60} className="input" defaultValue={s.defaultPrepMin} /></label>
          </div>
          <label className="field"><span>نقاط الاستلام (سطر لكل نقطة)</span><textarea id="stations" name="stations" className="input" defaultValue={branch.stations.map((x) => x.name).join("\n")} /></label>
          <input type="hidden" name="defaultStation" value={s.defaultStation} />
          <label className="check"><input type="checkbox" name="nearNotify" defaultChecked={s.nearNotify} /> إشعار خفيف للعميل عند «بدأ التحضير»</label>
          <p className="hint">الوقت المتوقع يُحسب من بيانات الفرع الفعلية بعد تراكم 30 طلبًا. قبل ذلك يُستخدم زمن التحضير الافتراضي.</p>
        </section>

        <section className="card">
          <h3>سلّم النداء</h3>
          <p className="hint">عند الضغط على «جاهز» تُنادى الصفحة والإشعار فورًا. إن لم يستجب العميل تتصاعد القنوات بالترتيب. القنوات المدفوعة تُتخطى إن كان العميل يشاهد الصفحة.</p>
          <div className="form-grid">
            <label className="field"><span>واتساب بعد (ثانية)</span><input id="waAfterSec" name="waAfterSec" type="number" className="input" defaultValue={s.escalation.waAfterSec} /></label>
            <label className="field"><span>رسالة نصية بعد (ثانية)</span><input id="smsAfterSec" name="smsAfterSec" type="number" className="input" defaultValue={s.escalation.smsAfterSec} /></label>
            <label className="field"><span>تنبيه الموظف بعد (ثانية)</span><input id="staffAlertAfterSec" name="staffAlertAfterSec" type="number" className="input" defaultValue={s.escalation.staffAlertAfterSec} /></label>
            <label className="field"><span>غير مستلم بعد (ثانية)</span><input id="unclaimedAfterSec" name="unclaimedAfterSec" type="number" className="input" defaultValue={s.escalation.unclaimedAfterSec} /></label>
          </div>
        </section>

        <section className="card">
          <h3>الولاء: بطاقة تُختم وحدها</h3>
          <label className="check"><input type="checkbox" name="loyaltyEnabled" defaultChecked={s.loyalty.enabled} /> تفعيل الأختام</label>
          <div className="form-grid">
            <label className="field"><span>عدد الأختام للمكافأة</span><input id="loyaltyGoal" name="loyaltyGoal" type="number" min={2} max={50} className="input" defaultValue={s.loyalty.goal} /></label>
            <label className="field"><span>المكافأة</span><input id="loyaltyReward" name="loyaltyReward" className="input" defaultValue={s.loyalty.reward} /></label>
            <label className="field"><span>الحد الأقصى للأختام يوميًا لكل بطاقة</span><input id="loyaltyDailyMax" name="loyaltyDailyMax" type="number" min={1} max={20} className="input" defaultValue={s.loyalty.dailyMax} /></label>
          </div>
          <label className="field"><span>الساعات الهادئة (ختم مضاعف). سطر لكل فترة بصيغة 15:00-17:00</span><textarea id="quietHours" name="quietHours" className="input" dir="ltr" defaultValue={s.loyalty.quietHours.map((q) => `${q.from}-${q.to}`).join("\n")} /></label>
          <label className="check"><input type="checkbox" name="fastPickupBonus" defaultChecked={s.loyalty.fastPickupBonus} /> نصف ختم إضافي عند الاستلام خلال دقيقة من النداء</label>
          <label className="check"><input type="checkbox" name="apologyStamp" defaultChecked={s.loyalty.apologyStamp} /> ختم اعتذار عند تجاوز الوقت المتوقع</label>
        </section>

        <section className="card">
          <h3>تقييم Google وشبكة الفرع</h3>
          <label className="field"><span>معرّف المكان في خرائط Google (Place ID)</span><input id="googlePlaceId" name="googlePlaceId" className="input" dir="ltr" defaultValue={s.googlePlaceId} placeholder="ChIJ..." /></label>
          <p className="hint">يظهر زر «قيّم على خرائط Google» لكل العملاء بعد الاستلام، بلا فرز وبلا مكافأة، التزامًا بسياسات Google. يمكن إيجاد المعرّف عبر أداة Place ID Finder من Google.</p>
          <div className="form-grid">
            <label className="field"><span>اسم شبكة الواي فاي (اختياري)</span><input id="wifiSsid" name="wifiSsid" className="input" dir="ltr" defaultValue={s.wifi.ssid} /></label>
            <label className="field"><span>كلمة مرور الشبكة</span><input id="wifiPassword" name="wifiPassword" className="input" dir="ltr" defaultValue={s.wifi.password} /></label>
            <label className="field"><span>التشفير</span>
              <select id="wifiSecurity" name="wifiSecurity" className="input" defaultValue={s.wifi.security}>
                <option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">بلا كلمة مرور</option>
              </select>
            </label>
          </div>
          <p className="hint">تُطبع الشبكة كرمز QR في صفحة الطباعة، ليتصل بها من انقطع عنه الإنترنت.</p>
        </section>

        <div className="row"><button className="btn" type="submit">حفظ الإعدادات</button></div>
      </form>
      <ColorSync />
    </>
  );
}
