# دورك — التمهيد التقني لتطبيق Full-Stack

> هذه الوثيقة تحوّل الـBlueprint إلى قرارات هندسية جاهزة للتنفيذ في `03-mvp-backlog.md`. كل قرار هنا قابل للمراجعة، لكن الافتراضي هو ما هو مكتوب ما لم يُقرَّر غير ذلك.

## 1. مبادئ هندسية

1. **بلا تطبيق أصلي.** كل الأسطح ويب. صفحة العميل تعمل على أي متصفح هاتف من أول ثانية.
2. **RTL أولًا، ثنائية اللغة من اليوم الأول.** العربية هي الأساس، والإنجليزية متوازية.
3. **الضغطة الواحدة للموظف مقدّسة.** أي ميزة تضيف ضغطة للمسار الأساسي تُرفض.
4. **الأحداث مصدر الحقيقة.** حالة الطلب مشتقة من سجل أحداث لا يُعدَّل (append-only). التقارير تُحسب من الأحداث.
5. **النداء لا يعتمد على قناة واحدة.** كل قناة طبقة في سلّم، وكل درجة تُسجَّل: أُرسلت، وصلت، أُقرّت.
6. **يعمل على شبكة سيئة.** الصفحة خفيفة (أقل من 150KB أولي)، SSE مع إعادة اتصال، واستطلاع كاحتياط.
7. **متعدد المستأجرين من اليوم الأول.** كل صف مرتبط بـ`tenant_id`، وكل استعلام مقيّد به.
8. **البيانات الشخصية في الحد الأدنى.** لا اسم، لا هاتف إلا باختيار العميل، وحذف تلقائي.

## 2. الأسطح (Surfaces)

| السطح | المسار | المستخدم | الجهاز | المصادقة |
|---|---|---|---|---|
| **Customer** | `/o/:token` و`/c/:branchSlug` | العميل | هاتف | لا شيء؛ الرمز في الرابط هو المفتاح |
| **Staff Board** | `/s` | الباريستا/الكاشير | تابلت | ربط الجهاز بالفرع مرة واحدة (Join code) + PIN اختياري |
| **TV Board** | `/tv/:branchSlug?key=` | الجميع في الفرع | شاشة/متصفح | مفتاح عرض فقط |
| **Manager** | `/m` | المالك/المدير | جوال/لابتوب | بريد + رمز OTP (Magic link/OTP) |
| **Onboarding** | `/start` | المالك | أي | إنشاء حساب |

## 3. المكدّس المقترح (MVP)

| الطبقة | الاختيار | لماذا |
|---|---|---|
| اللغة | TypeScript من طرف لطرف | فريق صغير، نماذج مشتركة |
| الإطار | Next.js (App Router) تطبيق واحد للأسطح الأربعة | سرعة تنفيذ، SSR لصفحة العميل الخفيفة، API Routes لخدمة MVP |
| قاعدة البيانات | PostgreSQL + Prisma | علاقات واضحة، تقارير SQL، نضج |
| المهام المؤجّلة | Redis + BullMQ | سلّم التصعيد يحتاج مهامًا مؤقتة قابلة للإلغاء |
| اللحظي | Server-Sent Events عبر Redis Pub/Sub | أبسط من WebSocket، يكفي للاتجاه خادم→عميل، والردود تُرسل بـHTTP عادي |
| Push | Web Push (VAPID) عبر مكتبة `web-push` + Service Worker | مجاني، بلا وسيط |
| واتساب (V2) | WhatsApp Cloud API (Meta) بمهايئ مستقل | تكلفة وقيود واضحة |
| SMS (V2) | مزوّد محلي (مثل Unifonic) أو Twilio بمهايئ مستقل | قابلية الاستبدال |
| المصادقة | Auth.js (OTP بالبريد) للمدير؛ رموز أجهزة للوحة الموظف | لا كلمات مرور |
| الواجهة | Tailwind + مكوّنات بسيطة، خط عربي (IBM Plex Sans Arabic) | تحكم كامل بالـRTL والحركة |
| i18n | `next-intl` أو ما يعادله، ملفات `ar`/`en` | |
| المراقبة | Sentry + سجلات منظّمة + مقاييس السلّم | |
| الاستضافة | حاويات في منطقة خليجية (مثلًا GCP Dammam أو AWS الخليج) للبيانات؛ يمكن البدء على منصة مدارة ثم الانتقال | PDPL |
| الفوترة (V2) | Moyasar/Tap محليًا، Stripe عالميًا | مدى + بطاقات |

**ملاحظة:** يمكن بدء الـMVP كتطبيق Next.js واحد مع Monorepo جاهز للفصل لاحقًا (`apps/web`, `packages/*`)، دون تقسيم مبكر إلى خدمات.

## 4. هيكل المستودع (Monorepo)

```
Pager/
├── apps/
│   └── web/                      # Next.js: العميل، الموظف، TV، المدير، الـAPI
│       ├── app/
│       │   ├── (customer)/o/[token]/     # صفحة الطلب الحيّة
│       │   ├── (customer)/c/[branch]/    # الربط برقم الطلب
│       │   ├── (staff)/s/                # لوحة الموظف
│       │   ├── (tv)/tv/[branch]/         # لوحة الأرقام
│       │   ├── (manager)/m/              # لوحة المدير
│       │   ├── start/                    # التهيئة
│       │   └── api/                      # Route handlers
│       ├── workers/                      # BullMQ workers (escalation, eta, rollups)
│       ├── sw.ts                         # Service Worker (push + offline shell)
│       └── messages/{ar,en}.json
├── packages/
│   ├── db/            # Prisma schema + migrations + seed
│   ├── core/          # آلة الحالات، سلّم التصعيد، ETA، أنواع مشتركة (بلا اعتماد على Next)
│   ├── notify/        # مهايئات: webpush, whatsapp, sms (واجهة موحّدة)
│   └── ui/            # مكوّنات مشتركة (نداء، بطاقة طلب، أرقام ضخمة)
├── docs/
├── .env.example
├── package.json       # pnpm workspaces
└── turbo.json
```

## 5. نموذج البيانات (Prisma sketch)

```prisma
model Tenant {
  id         String   @id @default(cuid())
  name       String
  plan       Plan     @default(FREE)
  createdAt  DateTime @default(now())
  branches   Branch[]
  users      User[]
}

model Branch {
  id            String   @id @default(cuid())
  tenantId      String
  slug          String   @unique          // للـQR الثابت: /c/:slug
  name          String
  timezone      String   @default("Asia/Riyadh")
  brand         Json                       // { color, logoUrl, chime, tone, waitingLine }
  settings      Json                       // { escalation: {...}, prayerPause: bool, showQueuePosition: bool }
  tvKey         String   @unique
  status        BranchStatus @default(OPEN) // OPEN | PAUSED_PRAYER | CLOSED
  stations      Station[]
  devices       Device[]
  orders        Order[]
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
}

model Station {            // محطة استلام (يمين/يسار/سيارة)
  id        String @id @default(cuid())
  branchId  String
  name      String
  color     String?
  branch    Branch @relation(fields: [branchId], references: [id])
}

model Device {             // تابلت الموظف
  id         String   @id @default(cuid())
  branchId   String
  stationId  String?
  label      String
  token      String   @unique   // يُخزَّن hashed
  lastSeenAt DateTime?
  branch     Branch   @relation(fields: [branchId], references: [id])
}

model User {               // المدير/المالك
  id       String @id @default(cuid())
  tenantId String
  email    String @unique
  role     Role   @default(OWNER)   // OWNER | MANAGER | VIEWER
  tenant   Tenant @relation(fields: [tenantId], references: [id])
}

model Order {
  id            String      @id @default(cuid())
  branchId      String
  stationId     String?
  number        String                      // "247" كما يراه العميل
  token         String      @unique         // 10 أحرف عشوائية للرابط /o/:token
  summary       String?                     // "لاتيه + كرواسون" اختياري
  itemCount     Int?
  status        OrderStatus @default(CREATED)
  createdAt     DateTime    @default(now())
  preparingAt   DateTime?
  readyAt       DateTime?
  notifiedAt    DateTime?
  pickedUpAt    DateTime?
  closedAt      DateTime?
  etaLowSec     Int?
  etaHighSec    Int?
  etaComputedAt DateTime?
  customerState CustomerState @default(NONE) // NONE|VIEWING|ON_MY_WAY|STEPPED_OUT|IN_CAR|WRONG_ORDER
  claimedAt     DateTime?                   // متى ربط العميل الصفحة
  source        OrderSource @default(TABLET) // TABLET | POS | API
  kind          OrderKind   @default(ORDER)  // ORDER (طلب) | TICKET (دور): نفس الآلة، تختلف التسميات وزر الموظف
  unclaimedReason String?
  events        OrderEvent[]
  channels      Channel[]
  attempts      NotificationAttempt[]
  feedback      Feedback?
  branch        Branch      @relation(fields: [branchId], references: [id])

  @@unique([branchId, number, createdAt])
  @@index([branchId, status])
}

model OrderEvent {         // سجل لا يُعدَّل
  id        String   @id @default(cuid())
  orderId   String
  type      String   // CREATED, PREPARING, READY, NOTIFIED:<channel>, ACK, CUSTOMER:<state>, PICKED_UP, UNCLAIMED, CANCELLED, PRAYER_PAUSE, ...
  actor     String   // device:<id> | customer | system | user:<id>
  at        DateTime @default(now())
  meta      Json?
  order     Order    @relation(fields: [orderId], references: [id])
  @@index([orderId, at])
}

model Channel {            // قنوات التنبيه التي اختارها العميل لهذا الطلب
  id        String      @id @default(cuid())
  orderId   String
  kind      ChannelKind // LIVE | WEBPUSH | WHATSAPP | SMS
  address   String?     // push subscription JSON (مشفّر) أو رقم هاتف (مشفّر)
  createdAt DateTime    @default(now())
  expiresAt DateTime    // حذف تلقائي (24 ساعة بعد الإغلاق)
  order     Order       @relation(fields: [orderId], references: [id])
}

model NotificationAttempt {
  id        String   @id @default(cuid())
  orderId   String
  kind      ChannelKind
  step      Int              // درجة السلّم
  sentAt    DateTime @default(now())
  result    String           // SENT | DELIVERED | FAILED | SKIPPED
  error     String?
  order     Order    @relation(fields: [orderId], references: [id])
}

model Feedback {
  id        String   @id @default(cuid())
  orderId   String   @unique
  score     Int      // 1..3
  reason    String?
  createdAt DateTime @default(now())
  order     Order    @relation(fields: [orderId], references: [id])
}

model BranchHourlyStat {   // تجميع للتقارير (يُحسب بمهمة دورية)
  id             String   @id @default(cuid())
  branchId       String
  hourStart      DateTime
  orders         Int
  prepP50Sec     Int?
  prepP90Sec     Int?
  pickupP50Sec   Int?
  unclaimed      Int
  promiseKeptPct Float?
  @@unique([branchId, hourStart])
}
```

## 6. آلة حالات الطلب

```
CREATED ──(staff: preparing, اختياري)──▶ PREPARING ──(staff: READY)──▶ READY
   │                                        │                            │
   └──────────(staff: READY)────────────────┘                            │
                                                                         ▼
                                    ┌──────────── NOTIFIED (تلقائي فور READY)
                                    │                    │
                         (customer/staff: picked)   (10 دقائق بلا استلام)
                                    │                    │
                                    ▼                    ▼
                                PICKED_UP            UNCLAIMED ──(staff: picked/cancel)──▶ PICKED_UP | CANCELLED
أي حالة ──(staff: cancel)──▶ CANCELLED
```

- `customerState` مستقل عن `status` ويُحدَّث بردود العميل، ويظهر كشريحة على البطاقة.
- `PRAYER_PAUSE` حدث على مستوى الفرع يجمّد المؤقتات: عند الاستئناف تُضاف مدة التوقف لكل ETA نشط، وتُستثنى من حساب زمن التحضير في التقارير.

## 7. سلّم التصعيد (Escalation Ladder)

يبدأ عند `READY`. كل درجة مهمة BullMQ مؤجّلة تُلغى عند `ACK` أو `PICKED_UP`.

| الدرجة | الوقت من READY | الشرط | الفعل |
|---|---|---|---|
| 0 | 0s | دائمًا | بث SSE: الصفحة تتحوّل لحالة النداء + صوت/اهتزاز (يتكرر كل 20s حتى 5 مرات) |
| 1 | 0s | يوجد اشتراك Web Push | إرسال Push |
| 2 | 60s | لا إقرار، ولا مشاهدة حيّة خلال آخر 30s، ويوجد واتساب | رسالة واتساب (V2) |
| 3 | 120s | لا إقرار، ويوجد هاتف، والخطة تسمح | SMS (V2) |
| 4 | 180s | لا إقرار | بطاقة الموظف تنبض: "نداء صوتي للطلب 247" + تُعرض القنوات التي وصلت |
| 5 | 600s | لا استلام | `UNCLAIMED` + طلب سبب من الموظف |

**"مشاهدة حيّة"** = اتصال SSE نشط أو نبضة `heartbeat` من الصفحة خلال آخر 30 ثانية. إذا كان العميل يشاهد فعليًا، نتخطى القنوات المدفوعة.

**تسجيل الوصول:** كل درجة تُسجَّل في `NotificationAttempt`، وتُعرض على بطاقة الموظف ("وصله: صفحة ✓، Push ✓، واتساب ✗").

## 8. الوعد الزمني (ETA V1)

بلا تعلّم آلي. لكل فرع:

1. أخذ آخر 4 أسابيع من الطلبات المكتملة (باستثناء فترات الصلاة والإلغاء).
2. التجميع حسب `(يوم الأسبوع، ساعة، دلو حجم الطابور)` حيث دلو الطابور = عدد الطلبات قيد التحضير وقت الإنشاء: `0-2`, `3-5`, `6-9`, `10+`.
3. حساب P50 وP80 لزمن التحضير لكل مجموعة. يُعرض `etaLow = P50`, `etaHigh = P80`.
4. إذا كانت المجموعة أقل من 20 عيّنة → التراجع للمجموعة الأوسع (نفس الساعة بلا يوم → نفس دلو الطابور بلا ساعة → الفرع كله). إذا أقل من 30 عيّنة إجمالًا → لا رقم؛ تُعرض "خلال دقائق قليلة".
5. يُعاد الحساب كل 30 ثانية للطلبات النشطة بناءً على الزمن المنقضي (توزيع مشروط بأن الطلب لم يجهز بعد) كي لا يظهر "1–2 دقيقة" ثم يبقى.
6. تُحسب "دقة الوعد" = نسبة الطلبات التي جهزت قبل `etaHigh` الأول المعروض.

القيم تُحسب بمهمة دورية كل 10 دقائق وتُخزَّن في جدول صغير لكل فرع (`EtaProfile`) لتكون قراءة الصفحة رخيصة.

## 9. واجهات الـAPI (MVP)

كل المسارات تحت `/api`. الموظف يرسل `Authorization: Device <token>`، والمدير عبر جلسة Auth.js، والعميل عبر الرمز في المسار.

```
POST   /staff/orders                 {number, summary?, itemCount?, stationId?} → Order
POST   /staff/orders/:id/preparing
POST   /staff/orders/:id/ready       {batch?: string[]}
POST   /staff/orders/:id/picked
POST   /staff/orders/:id/cancel      {reason}
POST   /staff/orders/:id/recall      # إعادة النداء يدويًا
POST   /staff/orders/:id/unclaimed   {reason}
POST   /staff/branch/pause           {kind: "PRAYER"}   / POST /staff/branch/resume
GET    /staff/board/stream           # SSE: كل تغييرات الفرع
GET    /staff/board                  # لقطة أولية

POST   /c/:branchSlug/claim          {number} → {token, preview}   # ربط العميل، محدود بمعدّل + نافذة 60 دقيقة
GET    /o/:token                     # حالة الطلب (JSON)
GET    /o/:token/stream              # SSE للطلب الواحد
POST   /o/:token/channels            {kind: "WEBPUSH", subscription}
POST   /o/:token/ack                 # "استلمته" أو إقرار النداء
POST   /o/:token/state               {state: ON_MY_WAY|STEPPED_OUT|IN_CAR|WRONG_ORDER}
POST   /o/:token/heartbeat
POST   /o/:token/feedback            {score, reason?}

GET    /tv/:branchSlug/stream?key=   # SSE للوحة TV

GET    /m/branches/:id/today
GET    /m/branches/:id/week?start=
GET    /m/branches/:id/orders?status=UNCLAIMED
PATCH  /m/branches/:id/brand | /settings | /stations
POST   /m/branches/:id/qr.pdf        # توليد PDF للطباعة
POST   /m/devices/join               {joinCode} → deviceToken
```

**أمان الربط:** رقم الطلب وحده لا يكفي لكشف بيانات حساسة (لا توجد بيانات حساسة أصلًا)، لكن لتفادي العبث: الربط يتطلب رقمًا أُنشئ في آخر 60 دقيقة في هذا الفرع، وحدّ معدل لكل IP، والرمز `token` الناتج هو ما يُستخدم بعدها.

## 10. اللحظي (Realtime)

- **قناة الفرع:** `branch:{id}` تنشر كل تغيير طلب (JSON صغير). لوحة الموظف وTV تشتركان.
- **قناة الطلب:** `order:{id}` للعميل.
- **الخادم:** مسار SSE واحد يشترك في Redis ويبثّ. عند انقطاع العميل يُعاد الاتصال مع `Last-Event-ID` ويُرسل snapshot.
- **الاحتياط:** إذا فشل SSE (بعض الشبكات المؤسسية)، الصفحة تستطلع كل 5 ثوانٍ.
- **الحضور:** `heartbeat` كل 15 ثانية من صفحة العميل تُحدّث `lastSeenAt` في Redis، ومنه تُشتق شريحة 👀.

## 11. صفحة العميل: Push وService Worker

- **الطلب الذكي للإذن:** لا نطلب إذن Push فور الفتح. نعرض الزر "تنبيه على الجوال"، وعند الضغط نطلب الإذن. على iOS بدون تثبيت: الزر يشرح "أضف الصفحة للشاشة الرئيسية لتصلك التنبيهات" أو يعرض واتساب كبديل (V2).
- **Service Worker:** يستقبل Push ويعرض إشعارًا بعنوان "حان دورك طلب 247 جاهز" ويفتح `/o/:token?call=1` عند الضغط.
- **الصوت:** يُحمَّل مسبقًا بعد أول تفاعل للمستخدم (قيود التشغيل التلقائي). إذا لم يتفاعل، نعتمد البصري.
- **الاهتزاز:** `navigator.vibrate([200,100,200,100,600])` حيث يُدعم.
- **الوضع الصامت:** يحفظ التفضيل في `localStorage` لهذا الجهاز.

## 12. التقارير

- مهمة كل ساعة تُحدّث `BranchHourlyStat` من `OrderEvent`.
- "اليوم" يُحسب لحظيًا من الطلبات النشطة والمغلقة اليوم (حجم صغير).
- "الأسبوع" يُقرأ من الجدول المجمّع.
- التوصيات (V1) قواعد: مثال قاعدة "ذروة مختنقة": إذا `prepP90` لساعة معيّنة > 1.4 × متوسط الفرع مع عدد طلبات ≤ 1.2 × المتوسط لثلاثة أسابيع متتالية → توصية "الاختناق في التجهيز".

## 13. الأمن والامتثال (PDPL)

- تشفير عناوين القنوات (اشتراكات Push، أرقام) في العمود، وحذفها بعد `expiresAt` بمهمة يومية.
- لا تخزين لاسم العميل. رقم الطلب والرمز لا يحدّدان هوية.
- سجل وصول للمدير، وأدوار واضحة.
- رموز الأجهزة تُخزَّن hashed وتُلغى من لوحة المدير.
- الاستضافة والنسخ الاحتياطي في المنطقة، وسياسة احتفاظ: أحداث الطلب 13 شهرًا للتقارير ثم تجميع.
- حدود معدل على `claim` و`state` و`feedback`.

## 14. الجودة والمراقبة

- اختبارات وحدة على `packages/core`: آلة الحالات، السلّم، ETA (مع بيانات اصطناعية).
- اختبار E2E واحد على المسار الذهبي: إنشاء → ربط → READY → نداء → إقرار → استلام.
- مقاييس: زمن `READY→ACK`، نسبة وصول كل قناة، نسبة `UNCLAIMED`، أخطاء SSE، زمن استجابة الصفحة.
- تنبيه داخلي إذا فشل Push لأكثر من 20% خلال ساعة.

## 15. متغيرات البيئة (`.env.example`)

```
DATABASE_URL=
REDIS_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
EMAIL_SERVER=            # لإرسال OTP
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:ops@example.com
CHANNEL_ENCRYPTION_KEY=  # لتشفير عناوين القنوات
WHATSAPP_TOKEN=          # V2
WHATSAPP_PHONE_ID=       # V2
SMS_PROVIDER=            # V2
SMS_API_KEY=             # V2
SENTRY_DSN=
```

## 16. قرارات مفتوحة (تُحسم في الأسبوع الأول)

1. استضافة مدارة سريعة (Vercel + Neon + Upstash) للـMVP ثم انتقال إلى منطقة خليجية، أم البدء مباشرة في المنطقة؟ **الافتراضي:** البدء المدار للسرعة، مع عدم تخزين أرقام هواتف قبل الانتقال.
2. رقم واتساب موحّد لدورك أم رقم لكل مقهى؟ **الافتراضي V2:** رقم موحّد باسم دورك مع ذكر المقهى في الرسالة.
3. هل نطلب من الكاشير إدخال ملخّص المشروب؟ **الافتراضي:** اختياري بأزرار اختصار، لا حقل نصّي.
4. هل تُعرض "أمامك N طلبات"؟ **الافتراضي:** نعم إذا N ≤ 7، وإلا تُخفى.
