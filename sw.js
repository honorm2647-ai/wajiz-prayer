/* sw.js — دعم العمل دون اتصال لموقع الوجيز في أحكام الصلاة
 * الاستراتيجيات:
 *  - الصفحات (التنقل): الشبكة أولًا ثم الكاش ثم صفحة offline.html
 *  - الملفات الثابتة (أيقونات/PDF/manifest): التخزين أولًا ثم الشبكة مع التحديث
 *  - خطوط Google: stale-while-revalidate
 *  - يُستثنى: طلبات غير GET ومسارات تسجيل الدخول وروابط OAuth
 * الإصدار: v1 — بتاريخ 2026-10-13
 */
const VERSION = 'v1-2026-10-13';
const CORE_CACHE = 'wagiz-core-' + VERSION;
const STATIC_CACHE = 'wagiz-static-' + VERSION;
const FONT_CACHE = 'wagiz-fonts-' + VERSION;

const CORE_ASSETS = [
  './',
  './index.html',
  './quiz.html',
  './book.html',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];
const PDF_URL = './wagizsalat.pdf';

// مسارات لا يتدخل فيها عامل الخدمة (لا توجد في الموقع حاليًا — حماية مستقبلية)
const EXCLUDED_PATHS = [/\/login(\/|$|\?)/i, /\/signin(\/|$|\?)/i, /\/oauth(\/|$|\?)/i, /\/auth(\/|$|\?)/i];

function isExcluded(url) {
  return EXCLUDED_PATHS.some((re) => re.test(url.pathname));
}

function toURL(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const core = await caches.open(CORE_CACHE);
      await core.addAll(CORE_ASSETS.map(toURL));
      // ملف PDF كبير (3.5MB): يُخزّن عند التثبيت إن أمكن دون إفشال التثبيت
      try {
        const st = await caches.open(STATIC_CACHE);
        await st.add(toURL(PDF_URL));
      } catch (e) { /* يُخزّن لاحقًا عند أول طلب */ }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [CORE_CACHE, STATIC_CACHE, FONT_CACHE];
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('wagiz-') && !keep.includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CORE_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: false })
      || await cache.match(toURL('./index.html'));
    if (hit) return hit;
    return caches.match(toURL('./offline.html'));
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) {
    // تحديث في الخلفية دون تأخير الاستجابة
    fetch(request).then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    }).catch(() => {});
    return hit;
  }
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    return cache.match(request);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = cache.match(request);
  const net = fetch(request).then((fresh) => {
    if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
  }).catch(() => hit);
  const cached = await hit;
  return cached || net;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (isExcluded(url)) return; // تسجيل الدخول / OAuth: يترك للشبكة دائمًا

  // 1) التنقل بين الصفحات: الشبكة أولًا
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) خطوط Google: stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 3) الملفات الثابتة (ذات الأسماء الثابتة هنا — تعامل معاملة المتغيرة): التخزين أولًا
  const p = url.pathname.toLowerCase();
  const isStatic =
    url.origin === self.location.origin &&
    (p.endsWith('.png') || p.endsWith('.pdf') || p.endsWith('.webmanifest') ||
     p.endsWith('.css') || p.endsWith('.js') || req.destination === 'image' || req.destination === 'font');
  if (isStatic) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // 4) أي طلب آخر من نفس الأصل: الشبكة أولًا مع fallback للكاش
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }
});
