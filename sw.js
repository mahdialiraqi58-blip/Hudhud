const CACHE_NAME = 'hudhud-cache-v2-2026-11-21';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// تثبيت النسخة الجديدة وتفعيلها فوراً دون انتظار
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
});

// حذف جميع إصدارات الكاش القديمة والاستحواذ على الصفحات المفتوحة فوراً
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// استقبال أمر التحديث الفوري من واجهة التطبيق
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// جلب أحدث نسخة من الشبكة أولاً، مع التخزين للكاش والرجوع إليه عند عدم وجود إنترنت
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // عدم اعتراض طلبات قاعدة بيانات Firebase أو المصادقة
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com/identitytoolkit')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
