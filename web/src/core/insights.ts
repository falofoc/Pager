/**
 * توصيات تشغيلية بقواعد شفافة. كل توصية تحمل الأرقام التي بُنيت عليها.
 */
import { AR_DAYS } from "./time";

export type HourCell = { weekday: number; hour: number; count: number; p90PrepSec: number };
export type Recommendation = { id: string; title: string; body: string; why: string[] };

export function recommend(input: {
  cells: HourCell[];
  branchP90Sec: number;
  unclaimedRate: number;
  promiseAccuracy: number | null;
  claimRate: number | null;
  prepMedianSec: number;
  pickupMedianSec: number;
}): Recommendation[] {
  const recs: Recommendation[] = [];
  const valid = input.cells.filter((c) => c.count >= 8);
  const avgCount = valid.length ? valid.reduce((a, c) => a + c.count, 0) / valid.length : 0;

  const hot = valid
    .filter((c) => input.branchP90Sec > 0 && c.p90PrepSec > 1.4 * input.branchP90Sec && c.count <= 1.2 * avgCount)
    .sort((a, b) => b.p90PrepSec - a.p90PrepSec)[0];
  if (hot) {
    const pct = Math.round((hot.p90PrepSec / input.branchP90Sec - 1) * 100);
    recs.push({
      id: "slow-hour",
      title: `${AR_DAYS[hot.weekday]} ${hot.hour}:00 أبطأ من المعتاد`,
      body: `زمن التحضير في هذه الساعة أعلى بـ ${pct}% من متوسط الفرع مع عدد طلبات قريب من المعتاد. الاختناق في التجهيز لا في الطلب. جرّب تقديم بداية الوردية أو تفعيل وضع الذروة في هذه الساعة.`,
      why: [
        `P90 للساعة: ${Math.round(hot.p90PrepSec / 60)} دقيقة`,
        `P90 للفرع: ${Math.round(input.branchP90Sec / 60)} دقيقة`,
        `طلبات الساعة: ${hot.count} مقابل متوسط ${Math.round(avgCount)}`,
      ],
    });
  }

  const busy = valid.filter((c) => c.count >= 1.6 * avgCount && c.p90PrepSec > 1.2 * input.branchP90Sec).sort((a, b) => b.count - a.count)[0];
  if (busy && (!hot || busy.weekday !== hot.weekday || busy.hour !== hot.hour)) {
    recs.push({
      id: "peak",
      title: `ذروة ${AR_DAYS[busy.weekday]} ${busy.hour}:00 تحتاج دعمًا`,
      body: "عدد الطلبات في هذه الساعة أعلى بكثير من المعتاد والتحضير يتأخر معه. موظف إضافي في هذه الساعة أو تجهيز مسبق للأصناف الأكثر طلبًا يخفّض الانتظار.",
      why: [`طلبات الساعة: ${busy.count} مقابل متوسط ${Math.round(avgCount)}`, `P90 للساعة: ${Math.round(busy.p90PrepSec / 60)} دقيقة`],
    });
  }

  if (input.pickupMedianSec > 90 && input.pickupMedianSec > input.prepMedianSec * 0.35) {
    recs.push({
      id: "slow-pickup",
      title: "العملاء يتأخرون في الاستلام",
      body: "جزء كبير من الانتظار بعد جاهزية الطلب. شجّع العملاء على تفعيل التنبيه على الجوال، واجعل نقطة الاستلام أوضح.",
      why: [`وسيط الاستجابة بعد النداء: ${Math.round(input.pickupMedianSec)} ثانية`],
    });
  }

  if (input.unclaimedRate > 0.01) {
    recs.push({
      id: "unclaimed",
      title: "طلبات جاهزة لا تُستلم",
      body: "نسبة الطلبات غير المستلمة أعلى من 1%. فعّل واتساب أو الرسائل النصية من صفحة التكاملات لتصل النداءات لمن يبتعد عن الصفحة.",
      why: [`غير المستلم: ${(input.unclaimedRate * 100).toFixed(1)}%`],
    });
  }

  if (input.promiseAccuracy !== null && input.promiseAccuracy < 0.8) {
    recs.push({
      id: "promise",
      title: "الوقت المتوقع أقصر من الواقع",
      body: "أقل من 80% من الطلبات جهزت ضمن الوقت المعروض. ارفع زمن التحضير الافتراضي في الإعدادات حتى تتراكم بيانات كافية.",
      why: [`دقة الوعد: ${Math.round(input.promiseAccuracy * 100)}%`],
    });
  }

  if (input.claimRate !== null && input.claimRate < 0.4) {
    recs.push({
      id: "claim",
      title: "قلة من العملاء يتابعون طلباتهم",
      body: "أقل من 40% من الطلبات ارتبطت بصفحة عميل. ضع رمز QR أمام الكاشير مباشرة، واستخدم زر «عرض رمز» بعد إنشاء الطلب.",
      why: [`نسبة الربط: ${Math.round(input.claimRate * 100)}%`],
    });
  }
  return recs.slice(0, 3);
}

/** أهدأ ساعتين متتاليتين (اقتراح للساعات الهادئة في الولاء). */
export function quietestWindow(cells: HourCell[], fromHour = 7, toHour = 22): { from: number; to: number } | null {
  const byHour = new Map<number, number>();
  for (const c of cells) byHour.set(c.hour, (byHour.get(c.hour) ?? 0) + c.count);
  let best: { from: number; to: number; v: number } | null = null;
  for (let h = fromHour; h < toHour - 1; h++) {
    const v = (byHour.get(h) ?? 0) + (byHour.get(h + 1) ?? 0);
    if (v === 0) continue;
    if (!best || v < best.v) best = { from: h, to: h + 2, v };
  }
  return best ? { from: best.from, to: best.to } : null;
}
