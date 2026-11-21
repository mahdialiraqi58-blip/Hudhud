/* sw.js — هدهد */
const VERSION = 'v3';
const STATIC_CACHE = `hudhud-static-${VERSION}`;
const RUNTIME_CACHE = `hudhud-runtime-${VERSION}`;
const FILES_CACHE = `hudhud-files-${VERSION}`;
const MAX_RUNTIME = 80;
const MAX_FILES = 30;

const PRECACHE = ['./', './index.html', './manifest.json'];

const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'www.gstatic.com',
  'cdn-icons-png.flaticon.com'
];

/* لا نخزّن أبداً: المصادقة وقاعدة البيانات (التطبيق يخزّنها بنفسه) */
const NEVER_CACHE = [
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseio.com',
  'firebaseapp.com/__/auth',
  'accounts.google.com',
  'cloudfunctions.net',
  'run.app'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [STATIC_CACHE, RUNTIME_CACHE, FILES_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('hudhud-') && !keep.includes(n)).map(n => caches.delete(n)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable().catch(() => {});
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then(ns => Promise.all(ns.filter(n => n.startsWith('hudhud-')).map(n => caches.delete(n)))));
  }
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
  }
}

/* الصفحة: الشبكة أولاً (دائماً أحدث نسخة) مع بديل من الكاش عند انقطاع النت */
async function handleNavigation(event) {
  try {
    const preload = await event.preloadResponse;
    const res = preload || await fetch(event.request);
    if (res && res.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put('./index.html', res.clone());
    }
    return res;
  } catch (e) {
    const cache = await caches.open(STATIC_CACHE);
    return (await cache.match('./index.html')) || (await cache.match('./')) ||
      new Response('<h2 style="font-family:sans-serif;text-align:center;margin-top:40px" dir="rtl">لا يوجد اتصال بالإنترنت 📡</h2>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/* قديم-مع-تحديث: يعرض الكاش فوراً ويحدّثه بالخلفية */
async function staleWhileRevalidate(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(request, res.clone()).then(() => trimCache(cacheName, max));
    }
    return res;
  }).catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (NEVER_CACHE.some(h => url.href.includes(h))) return;
  if (url.searchParams.has('auth')) return;
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  /* ملفات الدروس الكبيرة من Firebase Storage */
  if (url.hostname === 'firebasestorage.googleapis.com' || url.hostname.endsWith('.firebasestorage.app')) {
    event.respondWith(staleWhileRevalidate(req, FILES_CACHE, MAX_FILES));
    return;
  }

  /* ملفات الموقع نفسه */
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE, MAX_RUNTIME));
    return;
  }

  /* مكتبات وخطوط خارجية */
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE, MAX_RUNTIME));
  }
});
