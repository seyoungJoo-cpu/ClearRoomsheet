/**
 * House Keeping — Web Push 구독 (오더 알림, 앱 백그라운드·화면 꺼짐)
 */
(function (global) {
  var SW_URL = "/hk/sw.js";
  var SW_SCOPE = "/hk/";
  var ORDER_PUSH_ENABLED_LS = "lotte-hk-order-push-enabled-v1";

  function getSyncPassword() {
    try {
      return global.sessionStorage.getItem("clear_html_sync_pwd") || "74321";
    } catch (e) {
      return "74321";
    }
  }

  function isOrderPushEnabledPreference() {
    try {
      return global.localStorage.getItem(ORDER_PUSH_ENABLED_LS) === "1";
    } catch (e) {
      return false;
    }
  }

  function setOrderPushEnabledPreference(enabled) {
    try {
      global.localStorage.setItem(ORDER_PUSH_ENABLED_LS, enabled ? "1" : "0");
    } catch (e) {}
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = global.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function isSupported() {
    return (
      "serviceWorker" in global.navigator &&
      "PushManager" in global &&
      typeof global.Notification !== "undefined"
    );
  }

  function registerServiceWorker() {
    return global.navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  }

  function postSubscription(subscription) {
    return fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Password": getSyncPassword(),
      },
      body: JSON.stringify(subscription),
    }).then(function (r) {
      if (!r.ok) throw new Error("subscribe failed");
      return r.json();
    });
  }

  function postUnsubscription(endpoint) {
    return fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Password": getSyncPassword(),
      },
      body: JSON.stringify({ endpoint: endpoint }),
    }).then(function (r) {
      if (!r.ok) throw new Error("unsubscribe failed");
      return r.json();
    });
  }

  function getActiveSubscription() {
    if (!isSupported()) return Promise.resolve(null);
    return registerServiceWorker()
      .then(function (reg) {
        if (!reg) return null;
        return global.navigator.serviceWorker.ready.then(function () {
          return reg.pushManager.getSubscription();
        });
      })
      .catch(function () {
        return null;
      });
  }

  function getOrderPushStatus() {
    if (!isSupported()) return Promise.resolve("unsupported");
    if (global.Notification.permission === "denied") return Promise.resolve("denied");
    if (!isOrderPushEnabledPreference()) return Promise.resolve("off");
    return getActiveSubscription().then(function (sub) {
      return sub ? "on" : "off";
    });
  }

  function ensureOrderPushSubscription() {
    if (!isSupported()) return Promise.resolve(false);
    if (!isOrderPushEnabledPreference()) return Promise.resolve(false);

    return Promise.resolve()
      .then(function () {
        if (global.Notification.permission === "granted") return "granted";
        if (global.Notification.permission === "denied") return "denied";
        return global.Notification.requestPermission();
      })
      .then(function (perm) {
        if (perm !== "granted") {
          if (perm === "denied") setOrderPushEnabledPreference(false);
          return false;
        }
        setOrderPushEnabledPreference(true);
        return registerServiceWorker();
      })
      .then(function (reg) {
        if (!reg) return false;
        return global.navigator.serviceWorker.ready.then(function () {
          return reg;
        });
      })
      .then(function (reg) {
        if (!reg) return false;
        return fetch("/api/push/vapid-public-key", {
          headers: { "X-Sync-Password": getSyncPassword() },
        }).then(function (r) {
          if (!r.ok) throw new Error("vapid key failed");
          return r.json().then(function (data) {
            return { reg: reg, publicKey: data.publicKey };
          });
        });
      })
      .then(function (ctx) {
        if (!ctx || !ctx.publicKey) return false;
        return ctx.reg.pushManager.getSubscription().then(function (existing) {
          if (existing) return existing;
          return ctx.reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(ctx.publicKey),
          });
        });
      })
      .then(function (sub) {
        if (!sub) return false;
        return postSubscription(sub.toJSON ? sub.toJSON() : sub).then(function () {
          return true;
        });
      })
      .catch(function () {
        return false;
      });
  }

  function unsubscribeOrderPush() {
    if (!isSupported()) return Promise.resolve(false);
    setOrderPushEnabledPreference(false);

    return getActiveSubscription()
      .then(function (sub) {
        if (!sub) return true;
        var endpoint = sub.endpoint;
        return sub.unsubscribe().then(function () {
          return postUnsubscription(endpoint).then(function () {
            return true;
          });
        });
      })
      .catch(function () {
        return false;
      });
  }

  function enableOrderPush() {
    if (!isSupported()) return Promise.resolve(false);
    setOrderPushEnabledPreference(true);
    return ensureOrderPushSubscription();
  }

  function disableOrderPush() {
    return unsubscribeOrderPush();
  }

  function toggleOrderPush() {
    if (!isSupported()) return Promise.resolve("unsupported");
    if (isOrderPushEnabledPreference()) {
      return disableOrderPush().then(function () {
        return "off";
      });
    }
    return enableOrderPush().then(function (ok) {
      if (ok) return "on";
      if (global.Notification.permission === "denied") return "denied";
      return "off";
    });
  }

  global.HKPush = {
    isSupported: isSupported,
    isOrderPushEnabledPreference: isOrderPushEnabledPreference,
    ensureOrderPushSubscription: ensureOrderPushSubscription,
    unsubscribeOrderPush: unsubscribeOrderPush,
    enableOrderPush: enableOrderPush,
    disableOrderPush: disableOrderPush,
    toggleOrderPush: toggleOrderPush,
    getOrderPushStatus: getOrderPushStatus,
  };
})(typeof window !== "undefined" ? window : this);
