/* House Keeping — Web Push (오더 알림 · 1:1 알럿) */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

function tryFocusFrontClients(kind) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    var jobs = [];
    var i;
    var client;
    for (i = 0; i < list.length; i++) {
      client = list[i];
      if (client.url.indexOf("/hk/front") < 0) continue;
      try {
        if (client.postMessage) {
          client.postMessage({ type: "HK_DIRECT_ALERT", kind: kind || "" });
        }
      } catch (e) {}
      if ("focus" in client) {
        jobs.push(
          Promise.resolve(client.focus()).catch(function () {
            return null;
          })
        );
      }
    }
    return Promise.all(jobs);
  });
}

self.addEventListener("push", function (event) {
  var payload = {
    title: "오더 알림",
    body: "새 오더가 접수되었습니다.",
    tag: "hk-order-alert",
    url: "/hk/front.html?from=push",
  };
  try {
    if (event.data) {
      var incoming = event.data.json();
      if (incoming && typeof incoming === "object") {
        if (incoming.title) payload.title = incoming.title;
        if (incoming.body) payload.body = incoming.body;
        if (incoming.tag) payload.tag = incoming.tag;
        if (incoming.url) payload.url = incoming.url;
      }
    }
  } catch (e) {}

  var isDirect = String(payload.tag || "").indexOf("hk-direct-") === 0;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        renotify: true,
        requireInteraction: isDirect,
        silent: isDirect,
        data: { url: payload.url, kind: isDirect ? "direct" : "order" },
      }),
      isDirect ? tryFocusFrontClients("direct") : Promise.resolve(),
    ])
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url =
    (event.notification.data && event.notification.data.url) || "/hk/front.html?from=push";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i];
        if (client.url.indexOf("/hk/front") >= 0 && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
