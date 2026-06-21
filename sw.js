// =====================================================================
// Taipei Metro Adventure — Service Worker
// 快取版本號：更新 HTML/CSS/JS 後請同步升級 STATIC_VER，舊快取會自動清除
// =====================================================================

const STATIC_VER = 'v3';

const STATIC_CACHE = `metro-static-${STATIC_VER}`;
const CDN_CACHE    = 'metro-cdn-v1';
const API_CACHE    = 'metro-api-v1';
const TILE_CACHE   = 'metro-tiles-v1';
const IMG_CACHE    = 'metro-images-v1';

const ALL_CACHES   = [STATIC_CACHE, CDN_CACHE, API_CACHE, TILE_CACHE, IMG_CACHE];

const TILE_LIMIT   = 600;   // 地圖圖磚最多快取幾張
const IMG_LIMIT    = 300;   // Drive 圖片最多快取幾張

// 預先快取的本地靜態資源
const PRECACHE_URLS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './stamps.html',
    './timeline.html',
    './profile.html',
    './login.html',
    './admin.html',
    './manifest.json',
];

// ── Install：預快取靜態資源 ───────────────────────────────────────────
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ── Activate：清除舊版快取 ────────────────────────────────────────────
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch：依來源路由到對應策略 ───────────────────────────────────────
self.addEventListener('fetch', e => {
    const { request } = e;
    const url = new URL(request.url);

    // POST/PUT/DELETE 一律直接放行，不快取
    if (request.method !== 'GET') {
        e.respondWith(fetch(request));
        return;
    }

    // GAS API：stale-while-revalidate，第二次起秒開（先顯示快取，背景更新）
    if (url.hostname === 'script.google.com') {
        e.respondWith(staleWhileRevalidate(request, API_CACHE));
        return;
    }

    // 地圖圖磚（CartoDB）：cache-first + 數量上限
    if (url.hostname.includes('basemaps.cartocdn.com')) {
        e.respondWith(cacheFirstLimited(request, TILE_CACHE, TILE_LIMIT));
        return;
    }

    // Drive 圖片：cache-first + 數量上限
    if (url.hostname === 'drive.google.com' || url.hostname.endsWith('.googleusercontent.com')) {
        e.respondWith(cacheFirstLimited(request, IMG_CACHE, IMG_LIMIT));
        return;
    }

    // Leaflet CDN：cache-first（版本固定，不會變）
    if (url.hostname === 'unpkg.com') {
        e.respondWith(cacheFirst(request, CDN_CACHE));
        return;
    }

    // 本地靜態檔案：stale-while-revalidate
    if (url.origin === self.location.origin) {
        e.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
        return;
    }

    e.respondWith(fetch(request));
});

// ── 策略函式 ──────────────────────────────────────────────────────────

// network-first：嘗試網路取得並更新快取，失敗時回傳快取
async function networkFirst(request, cacheName) {
    try {
        const res = await fetch(request);
        if (res.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, res.clone());
        }
        return res;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // 完全沒有快取才回傳錯誤（首次離線使用時）
        return new Response(
            JSON.stringify({ error: '目前離線，且尚無本地快取資料' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// cache-first：有快取直接回傳，沒有才下載
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, res.clone());
    }
    return res;
}

// cache-first + 數量上限：超過上限時刪最舊的
async function cacheFirstLimited(request, cacheName, maxEntries) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, res.clone());
        const keys = await cache.keys();
        if (keys.length > maxEntries) {
            await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
        }
    }
    return res;
}

// stale-while-revalidate：立即回傳快取，背景更新
async function staleWhileRevalidate(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);
    const update = fetch(request).then(res => {
        if (res.ok) cache.put(request, res.clone());
        return res;
    }).catch(() => null);
    return cached || (await update);
}
