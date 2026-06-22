/* House Keeping — Web Push (오더 알림) */
self.addEventListener("push", function (event) {
  var payload = {
    title: "오더 알림",
    body: "새 오더가 접수되었습니다.",
    tag: "hk-order-alert",
    url: "/hk/front.html",
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

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url =
    (event.notification.data && event.notification.data.url) || "/hk/front.html";
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
