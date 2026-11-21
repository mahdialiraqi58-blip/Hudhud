/* هدهد Service Worker
 * - الصفحات: الشبكة أولاً، وإذا ماكو نت تفتح من الكاش (أوفلاين)
 * - مكتبات CDN والخطوط: من الكاش أولاً مع تحديث بالخلفية
 * - Firebase وأي طلب ثاني: يمر مباشرة بدون تدخل
 * غيّر VERSION كل ما تريد تجبر المتصفحات على تحديث الكاش
 */
const VERSION = 'v2';
const STATIC_CACHE = `hudhud-static-${VERSION}`;
const RUNTIME_CACHE = `hudhud-runtime-${VERSION}`;
const MAX_RUNTIME_ENTRIES = 60;

const SHELL = ['./', './index.html', './manifest.json'];
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [STATIC_CACHE, RUNTIME_CACHE];
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('hudhud-') && !keep.includes(k)).map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}

function isCacheable(res, allowOpaque) {
  if (!res) return false;
  if (res.status === 206) return false;
  if (res.ok) return true;
  return allowOpaque && res.type === 'opaque';
}

async function networkFirst(event, cacheName, fallbackUrls = []) {
  const cache = await caches.open(cacheName);
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const res = preload || await fetch(event.request);
    if (isCacheable(res, false)) cache.put(event.request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(event.request) || await caches.match(event.request);
    if (cached) return cached;
    for (const url of fallbackUrls) {
      const fb = await caches.match(url);
      if (fb) return fb;
    }
    return new Response('أنت بوضع عدم الاتصال ولا توجد نسخة محفوظة من هذه الصفحة.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (isCacheable(res, true)) {
        cache.put(event.request, res.clone()).then(() => trimCache(cacheName, MAX_RUNTIME_ENTRIES));
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const fresh = await refresh;
  return fresh || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // صفحات الموقع
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(event, STATIC_CACHE, ['./index.html', './']));
    return;
  }

  // ملفات الموقع نفسه
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(event, STATIC_CACHE));
    return;
  }

  // مكتبات وخطوط خارجية معروفة
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
    return;
  }

  // Firebase وغيره: بدون تدخل
});
