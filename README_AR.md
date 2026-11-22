# هدهد Level MAX — نسخة المرحلة الثالثة بعد مراجعة الجودة

## مكونات الحزمة
- `index.html`: واجهة المنصة مع مساحة الأدوار.
- `web/`: واجهات الأدوار وواجهة API للصفوف.
- `functions/`: وظائف Firebase Callable Functions.
- `database/database.rules.json`: قواعد Realtime Database المقترحة.
- `scripts/`: أداة تعيين الدور الأول من بيئة موثوقة.
- `tests/smoke-check.sh`: فحوص تركيبية محلية.

## تنبيه قبل النشر
هذه الحزمة لم تُختبر على Firebase Emulator أو مشروع Firebase الحقيقي. لا تنشر القواعد أو الوظائف إلى مشروع الإنتاج قبل إعداد Emulator واختبار سيناريوهات المدير والمعلم والطالب. لا تضع مفاتيح Service Account داخل المستودع أو ملفات الويب.

## تشغيل الفحص المحلي
من جهاز يحتوي Node.js:
```bash
bash tests/smoke-check.sh
```

## ملاحظات أمنية
- الصلاحيات الحساسة تُنفذ عبر Callable Functions وتُراجع من Custom Claims.
- قواعد RTDB مغلقة افتراضياً على مستوى الجذر.
- أُضيفت صلاحية قراءة فهرس `memberships/{uid}` لصاحبه حتى يستطيع الطالب تحميل صفوفه، مع منع الكتابة المباشرة.
- تعيين أول مدير يجب أن يتم من بيئة موثوقة باستخدام Firebase Admin SDK.
- لا ترفع مجلد `functions` إلى GitHub Pages؛ انشره فقط عبر Firebase CLI بعد الاختبار.
