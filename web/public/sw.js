/* دورك — Service Worker: إشعارات النداء + عمل الصفحة بلا اتصال */
const CACHE = "dorak-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "دورك", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "دورك", {
      body: data.body || "",
      tag: data.tag || "dorak",
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 600],
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/" },
      dir: "rtl",
      lang: "ar",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url.split("?")[0]) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

/* صفحات الطلب: من الشبكة أولًا، ومن الذاكرة عند الانقطاع */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  const isPage = req.mode === "navigate" && (url.pathname.startsWith("/o/") || url.pathname.startsWith("/c/"));
  const isAsset = url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg";
  if (!isPage && !isAsset) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || new Response("لا يوجد اتصال", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })))
  );
});
