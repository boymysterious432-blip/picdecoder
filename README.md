# PicDecoder

## كيف تضيف Prompt جديد بدون عمل Redeploy على Vercel

هذا هو جوهر الموضوع: صفحات `/prompt/[slug]` **مش ملفات HTML موجودة في المشروع**. هي دالة Vercel Function واحدة (`api/prompt.js`) بتقرأ من جدول `prompts` في Supabase **في كل مرة حد يفتح فيها الرابط**. يعني:

- تضيف صف جديد في جدول `prompts` (سواء من الأداة نفسها، أو يدويًا من Supabase Dashboard، أو عبر `POST /api/admin/add-prompt`) → الصفحة `/prompt/<slug>` تبقى شغالة فورًا.
- ملف `sitemap.xml` (`api/sitemap.js`) نفس الفكرة: بيتولد من قاعدة البيانات في كل طلب، فأي prompt جديد يظهر في الـ sitemap تلقائيًا.
- صفحة المكتبة `library.html` بتجيب البيانات client-side من `/api/prompts`، فبرضو بتتحدث لحظيًا.

**لا يوجد أي داعٍ لعمل `git push` أو Deploy جديد عشان تضيف محتوى.** الـ Deploy مطلوب فقط لما تغيّر الكود نفسه (تصميم، منطق، ميزة جديدة).

### طريقة إضافة prompt يدويًا (محتوى تحريري/Seed)

```bash
curl -X POST https://www.picdecoder.com/api/admin/add-prompt \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: <ADMIN_SECRET من متغيرات البيئة>" \
  -d '{
    "image_url": "https://.../example.jpg",
    "prompt_text": "a cyberpunk portrait, neon rim light, rain-soaked street, cinematic, 85mm",
    "model": "midjourney",
    "style": "cyberpunk-portrait",
    "seed": "128492",
    "extraction_method": "metadata"
  }'
```

الرد بيرجعلك الرابط الجاهز فورًا: `https://www.picdecoder.com/prompt/<slug>`.

---

## خطوات النشر (أول مرة)

1. **Supabase**
   - أنشئ مشروع جديد.
   - شغّل محتوى `supabase-schema.sql` في SQL Editor.
   - في Storage: أنشئ Bucket اسمه `images` واجعله Public.
   - من Settings → API: انسخ `SUPABASE_URL` و `service_role key`.

2. **متغيرات البيئة على Vercel** (Project Settings → Environment Variables)، انسخها من `.env.example`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `ADMIN_SECRET`

3. **النشر**
   ```bash
   npm install
   vercel deploy --prod
   ```

4. **Cloudflare** (إذا كنت تستخدمه أمام Vercel): فعّل Auto Minify + Polish للصور، واترك Cache Rules افتراضية للمسارات `/api/*` (لأنها ديناميكية وتُدار بـ `Cache-Control` من الكود نفسه).

---

## هيكلة الملفات

```
index.html          — صفحة الأداة الرئيسية (بدون تسجيل دخول)
library.html         — تصفح المكتبة (يقرأ من /api/prompts)
about.html            — شرح صادق لآلية الاستخراج (metadata أولاً، AI fallback ثانيًا)
privacy.html          — سياسة خصوصية حقيقية (استبدل الأقواس المربعة)
public/style.css      — هوية بصرية "غرفة تحميض / بطاقة أدلة"
public/decoder.js      — منطق الرفع والعرض في الواجهة
api/decode.js           — يستقبل الصورة، يحاول قراءة الميتاداتا، ثم AI fallback، يحفظ في Supabase
api/prompt.js            — يبني صفحة /prompt/[slug] ديناميكيًا من Supabase (SSR)
api/prompts.js             — API قائمة المكتبة (Pagination)
api/sitemap.js               — sitemap.xml ديناميكي
api/admin/add-prompt.js       — إضافة يدوية محمية بـ secret
supabase-schema.sql            — تعريف الجدول
vercel.json                    — روابط نظيفة + Cache headers
```
