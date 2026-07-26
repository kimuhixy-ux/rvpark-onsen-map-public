// STABLE_ASSETS(ライブラリ等ほぼ変更しないファイル)の中身を変えたときだけこの番号を上げる。
// index.html/css/style.css/js/app.js/data/spots.jsonはnetwork-firstなので、
// これらを変更してもCACHE_NAMEを上げる必要はない(オンラインなら常に最新を取得する)。
const CACHE_NAME = "rvpark-onsen-map-v9";

// 開発中ほぼ変更しない資産。cache-first(取得済みならキャッシュを即返す)にして
// 表示速度とオフライン耐性を優先する。中身を変えた場合はCACHE_NAMEを上げること。
const STABLE_ASSETS = [
  "./manifest.json",
  "./js/config.js",
  "./js/donate.js",
  "./js/ads.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/markercluster/MarkerCluster.css",
  "./vendor/markercluster/MarkerCluster.Default.css",
  "./vendor/markercluster/leaflet.markercluster.js",
];

// デプロイのたびに変わりうる資産。cache-firstにするとCACHE_NAMEを上げるまで
// 古い内容を掴み続けてしまうため、network-first(オンラインなら常に最新を取得し、
// オフライン時のみキャッシュにフォールバック)にする。
const NETWORK_FIRST_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./data/spots.json",
  "./about.html",
  "./privacy.html",
];

const ALL_ASSETS = [...STABLE_ASSETS, ...NETWORK_FIRST_ASSETS];

// fetch時にpathnameで判定するため、"./"などの相対URLを絶対pathnameに解決しておく。
const NETWORK_FIRST_PATHS = new Set(
  NETWORK_FIRST_ASSETS.map((url) => new URL(url, self.location.href).pathname)
);

// Cloudflare Access配下だとレスポンスがリダイレクトを経由することがあり、
// response.redirected=trueのままキャッシュするとホーム画面起動時(navigationリクエスト)に
// 「Response served by service worker has redirections」でページが開けなくなる。
// bodyだけを取り出して素のResponseを作り直すことでredirectedフラグを落とす。
async function putStripped(cache, request, response) {
  if (response.redirected) {
    const body = await response.clone().arrayBuffer();
    response = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  return cache.put(request, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ALL_ASSETS.map((url) =>
          fetch(url).then((response) => putStripped(cache, url, response))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 地図タイルなど外部ホストへのリクエストはキャッシュしない
  if (url.origin !== self.location.origin) {
    return;
  }

  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => putStripped(cache, event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => putStripped(cache, event.request, clone));
        }
        return response;
      });
    })
  );
});
