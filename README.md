# ESOLUTIONS — تطبيق إدارة حملات الميديا باينج (React + Supabase)

نسخة تطبيق من شيت **COST**: نفس المنطق (أونغليه لكل ميديا باير، أقسام ACTIF CLIENT / ENDED SUB / REMBOURSEMENT، معادلات BUDGET RESTANT و DETTE و LOW BUDGET و CATEGORIE، وصفحة COST SHEET) مع تحسينات:

| في الشيت | في التطبيق |
|---|---|
| تبويب لكل ميديا باير (ISLEM, SAMIR) | جدول `media_buyers` + صلاحيات: الغيرانت يرى الكل، كل ميديا باير يرى زبائنه فقط |
| `BUDGET INITIAL` رقم يُكتب يدوياً | مجموع **الدفعات** (`payments`) مع وسيلة الدفع والإثبات (PREUVE RECU) |
| `BUDGET RESTANT = J - N` | نفس المعادلة في العرض `v_subscriptions` |
| `DETTE = SI(O<0; -O; 0)` | نفس المعادلة، وتُحسب أيضاً للاشتراكات المنتهية |
| `ALERT SYSTEM` = LOW BUDGET فقط | LOW BUDGET + 6 تنبيهات جديدة (ON بدون ميزانية، دين، اشتراك منتهي، مدفوع ولم يُطلق، ميزانية لا تكفي حتى نهاية الاشتراك، ميزانية نائمة) |
| `CLIENT POTENTIEL` نص مثل `2708 \| 241` (لا يُجمع) | أرقام حسب النوع `{"MC":2708,"ML":241}` تُجمع ويُحسب منها تكلفة النتيجة |
| COST SHEET = مجموع صافٍ | نفس الرقم + المال غير المصروف الحقيقي + الديون + أرصدة الاشتراكات المنتهية |
| لا يوجد سجل تغييرات | `activity_log`: من غيّر ماذا ومتى |
| تجديد يدوي بنسخ السطر | زر **تجديد**: الاشتراك القديم ينتقل إلى المنتهية ورصيده (أو دينه) يُرحَّل تلقائياً |

## 1) تجربة سريعة بدون Supabase (وضع تجريبي)

```bash
npm install
npm run dev
```
يفتح على http://localhost:5173 ببيانات الشيت كما كانت يوم 30/10/2026 (ملف `src/demo/seed.json`). التعديلات تُحفظ في المتصفح فقط.

## 2) ربط Supabase (الإنتاج)

1. أنشئ مشروعاً في https://supabase.com
2. **SQL Editor** ← الصق محتوى `supabase/migrations/20261030000000_init.sql` ← Run
3. ثم الصق `supabase/seed.sql` ← Run (يستورد 56 اشتراكاً و107 زبائن من الشيت)
4. اربط البريد الإلكتروني لكل ميديا باير:
   ```sql
   update media_buyers set email = 'islem@exemple.com' where name = 'ISLEM';
   update media_buyers set email = 'samir@exemple.com' where name = 'SAMIR';
   ```
   كل شخص ينشئ حسابه من صفحة الدخول بنفس البريد ← يُربط تلقائياً بتبويبه.
   (إذا كان الحساب موجوداً قبل هذه الخطوة:)
   ```sql
   update media_buyers mb set user_id = u.id from auth.users u where lower(u.email) = lower(mb.email);
   ```
5. انسخ `.env.example` إلى `.env` وضع `Project URL` و `Publishable key` (من Project Settings ← API)
6. `npm run dev`

بالـ Supabase CLI بدل الخطوتين 2 و3: `supabase link` ثم `supabase db push` ثم شغّل `seed.sql`.

**ميديا باير جديد:** `insert into media_buyers (name, email) values ('YACINE', 'yacine@exemple.com');`

## 3) تحديث البيانات من الشيت (أثناء فترة الانتقال)

1. في Google Sheets: كل تبويب ← File ← Download ← CSV ← ضعه في `data/islem.csv` و `data/samir.csv`
2. `npm run sheet:sql` ← يولّد `supabase/seed.sql` (أضف `--reset` داخل الأمر في package.json لمسح الزبائن والاشتراكات قبل الاستيراد)
3. `npm run sheet:demo` ← يحدّث بيانات الوضع التجريبي

السكريبت يتعرّف على الأعمدة **بأسمائها** (ترتيب الأعمدة مختلف بين تبويب ISLEM و SAMIR ولا مشكلة)، ويتجاهل الأسطر الفارغة النموذجية (CLEINT 18, CLIENT 05…).

## 4) النشر

Vercel أو Netlify: أمر البناء `npm run build`، مجلد الإخراج `dist`، ومتغيرا البيئة `VITE_SUPABASE_URL` و `VITE_SUPABASE_PUBLISHABLE_KEY`.
أضف رابط الموقع في Supabase ← Authentication ← URL Configuration.

## ⚠️ بيانات الزبائن

`data/*.csv` و `supabase/seed.sql` و `src/demo/seed.json` فيها أسماء وأرقام هواتف الزبائن. هي مستثناة في `.gitignore`: لا ترفعها إلى مستودع عام، ولا تنشر الوضع التجريبي على الإنترنت.

## بنية المشروع

```
supabase/migrations/…_init.sql   الجداول، المعادلات (views)، الصلاحيات (RLS)، التجديد، الوقت الحقيقي
scripts/sheet-to-sql.mjs         تحويل CSV الشيت إلى SQL / JSON
src/lib/api-supabase.ts          الوصول إلى Supabase (+ Realtime: كل تعديل يظهر عند الجميع فوراً)
src/lib/api-demo.ts, compute.ts  الوضع التجريبي (نفس قواعد SQL مكتوبة بـ TypeScript)
src/pages/Dashboard.tsx          «Aujourd’hui» : ما يجب معالجته اليوم + COST SHEET
src/pages/BuyerSheet.tsx         تبويب الميديا باير (تعديل مباشر للمصروف، ON/OFF، الحالة…)
src/components/SubscriptionPanel.tsx  بطاقة الزبون: تعديل، دفعات، تجديد، سجل التغييرات
```
