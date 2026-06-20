/**
 * 정비관리(HK) — 서버 /api/sync 공유
 * 공지·구역 객실·요청 알림·취소/사용 리스트를 PC 간 동기화
 */
(function (global) {
  var REQUEST_LOG_KEY = "lotte-hk-request-log-v1";
  var REQUEST_CANCEL_NAME_LOG_KEY = "lotte-hk-cancel-name-log-v1";
  var REQUEST_USE_LOG_KEY = "lotte-hk-use-log-v1";
  var CHANGE_LOG_KEY = "lotte-hk-change-log-v1";
  var ORDER_LOG_KEY = "lotte-hk-order-log-v1";
  var MB_INV_LOG_KEY = "lotte-hk-mb-inv-log-v1";
  var MB_CHECK_LOG_KEY = "lotte-hk-mb-check-log-v1";
  var FRONT_CHAT_KEY = "lotte-hk-front-chat-v1";

  var syncVersion = 0;
  var pollTimer = null;
  var pushTimer = null;
  var pendingPush = {};
  var isApplyingRemote = false;
  var changeListeners = [];

  var cache = {
    requestLog: [],
    cancelLog: [],
    useLog: [],
    changeLog: [],
    orderLog: [],
    mbInvLog: [],
    mbCheckLog: [],
    frontChat: [],
  };

  /** 루밍 vacRows · roomResvMap — HK 화면용 (서버 payload에서 유지) */
  var xmlSyncCache = {
    vacRows: [],
    roomResvMap: {},
  };

  function mergeXmlSyncCache(payload) {
    if (!payload || typeof payload !== "object") return;
    if (Array.isArray(payload.vacRows)) {
      xmlSyncCache.vacRows = payload.vacRows.slice();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, "roomResvMap") &&
      payload.roomResvMap &&
      typeof payload.roomResvMap === "object"
    ) {
      xmlSyncCache.roomResvMap = Object.assign({}, payload.roomResvMap);
    }
  }

  function xmlPayloadForListeners(serverPayload) {
    var p = {
      vacRows: xmlSyncCache.vacRows.slice(),
      roomResvMap: Object.assign({}, xmlSyncCache.roomResvMap),
    };
    if (serverPayload && typeof serverPayload === "object") {
      if (Array.isArray(serverPayload.vacRows)) p.vacRows = serverPayload.vacRows.slice();
      if (serverPayload.roomResvMap && typeof serverPayload.roomResvMap === "object") {
        p.roomResvMap = Object.assign({}, serverPayload.roomResvMap);
      }
    }
    return p;
  }

  function xmlChangedKeys(payload) {
    var keys = [];
    if (!payload || typeof payload !== "object") return keys;
    if (Array.isArray(payload.vacRows)) keys.push("vacRows");
    if (Object.prototype.hasOwnProperty.call(payload, "roomResvMap")) keys.push("roomResvMap");
    return keys;
  }

  function getSyncPassword() {
    return global.sessionStorage.getItem("clear_html_sync_pwd") || "74321";
  }

  function readJsonArray(key) {
    try {
      var raw = global.localStorage.getItem(key);
      if (raw) {
        var p = JSON.parse(raw);
        if (Array.isArray(p)) return p;
      }
    } catch (e) {}
    return [];
  }

  function writeJsonArray(key, arr) {
    try {
      global.localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
  }

  function loadCachesFromLocal() {
    cache.requestLog = readJsonArray(REQUEST_LOG_KEY);
    cache.cancelLog = readJsonArray(REQUEST_CANCEL_NAME_LOG_KEY);
    cache.useLog = readJsonArray(REQUEST_USE_LOG_KEY);
    cache.changeLog = readJsonArray(CHANGE_LOG_KEY);
    cache.orderLog = readJsonArray(ORDER_LOG_KEY);
    cache.mbInvLog = readJsonArray(MB_INV_LOG_KEY);
    cache.mbCheckLog = readJsonArray(MB_CHECK_LOG_KEY);
    cache.frontChat = readJsonArray(FRONT_CHAT_KEY);
  }

  function onChange(fn) {
    if (typeof fn !== "function") return;
    changeListeners.push(fn);
    var hasXml =
      xmlSyncCache.vacRows.length > 0 || Object.keys(xmlSyncCache.roomResvMap).length > 0;
    if (hasXml) {
      try {
        fn(xmlChangedKeys(xmlSyncCache), xmlPayloadForListeners(null));
      } catch (e) {}
    }
  }

  function emitChange(changed, payload) {
    changeListeners.forEach(function (fn) {
      try {
        fn(changed, payload || {});
      } catch (e) {}
    });
  }

  function schedulePush(fields) {
    if (isApplyingRemote) return;
    Object.keys(fields).forEach(function (k) {
      pendingPush[k] = true;
    });
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, 400);
  }

  function buildPushBody() {
    var body = {};
    if (pendingPush.hkStorage && global.HKStorage) {
      body.hkStorage = global.HKStorage.load();
    }
    if (pendingPush.hkRequestLog) body.hkRequestLog = cache.requestLog;
    if (pendingPush.hkCancelLog) body.hkCancelLog = cache.cancelLog;
    if (pendingPush.hkUseLog) body.hkUseLog = cache.useLog;
    if (pendingPush.hkChangeLog) body.hkChangeLog = cache.changeLog;
    if (pendingPush.hkOrderLog) body.hkOrderLog = cache.orderLog;
    if (pendingPush.hkMbInvLog) body.hkMbInvLog = cache.mbInvLog;
    if (pendingPush.hkMbCheckLog) body.hkMbCheckLog = cache.mbCheckLog;
    if (pendingPush.hkFrontChat) body.hkFrontChat = cache.frontChat;
    return body;
  }

  function postPayload(body) {
    if (!body || !Object.keys(body).length) return Promise.resolve(false);
    return fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Password": getSyncPassword(),
      },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("sync failed");
        return r.json();
      })
      .then(function (data) {
        if (data && data.version) syncVersion = data.version;
      })
      .catch(function () {
        return false;
      });
  }

  function doPush() {
    var body = buildPushBody();
    var keys = Object.keys(body);
    if (!keys.length) return;
    pendingPush = {};
    postPayload(body);
  }

  function applyRemotePayload(payload) {
    if (!payload || typeof payload !== "object") return;
    var changed = [];
    isApplyingRemote = true;

    if (payload.hkStorage && global.HKStorage) {
      global.HKStorage.applyRemote(payload.hkStorage);
      changed.push("hkStorage");
    }
    if (Array.isArray(payload.hkRequestLog)) {
      cache.requestLog = payload.hkRequestLog.slice();
      writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
      changed.push("hkRequestLog");
    }
    if (Array.isArray(payload.hkCancelLog)) {
      cache.cancelLog = payload.hkCancelLog.slice();
      writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, cache.cancelLog);
      changed.push("hkCancelLog");
    }
    if (Array.isArray(payload.hkUseLog)) {
      cache.useLog = payload.hkUseLog.slice();
      writeJsonArray(REQUEST_USE_LOG_KEY, cache.useLog);
      changed.push("hkUseLog");
    }
    if (Array.isArray(payload.hkChangeLog)) {
      cache.changeLog = payload.hkChangeLog.slice();
      writeJsonArray(CHANGE_LOG_KEY, cache.changeLog);
      changed.push("hkChangeLog");
    }
    if (Array.isArray(payload.hkOrderLog)) {
      cache.orderLog = payload.hkOrderLog.slice();
      writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
      changed.push("hkOrderLog");
    }
    if (Array.isArray(payload.hkMbInvLog)) {
      cache.mbInvLog = payload.hkMbInvLog.slice();
      writeJsonArray(MB_INV_LOG_KEY, cache.mbInvLog);
      changed.push("hkMbInvLog");
    }
    if (Array.isArray(payload.hkMbCheckLog)) {
      cache.mbCheckLog = payload.hkMbCheckLog.slice();
      writeJsonArray(MB_CHECK_LOG_KEY, cache.mbCheckLog);
      changed.push("hkMbCheckLog");
    }
    if (Array.isArray(payload.hkFrontChat)) {
      cache.frontChat = payload.hkFrontChat.slice();
      writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      changed.push("hkFrontChat");
    }
    if (Object.prototype.hasOwnProperty.call(payload, "hkLastRoomChange")) {
      changed.push("hkLastRoomChange");
    }

    mergeXmlSyncCache(payload);
    xmlChangedKeys(payload).forEach(function (k) {
      if (changed.indexOf(k) < 0) changed.push(k);
    });

    isApplyingRemote = false;
    if (changed.length) {
      emitChange(changed, Object.assign({}, payload, xmlPayloadForListeners(payload)));
    }
  }

  function pull(isPoll) {
    return fetch("/api/sync", {
      headers: { "X-Sync-Password": getSyncPassword() },
    })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data) return false;
        if (data.version != null && data.version <= syncVersion) return true;
        if (data.version != null) syncVersion = data.version;
        if (data.payload) applyRemotePayload(data.payload);
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function startPolling() {
    loadCachesFromLocal();
    pull(false).finally(function () {
      var fields = { hkStorage: true };
      if (cache.requestLog.length) fields.hkRequestLog = true;
      if (cache.cancelLog.length) fields.hkCancelLog = true;
      if (cache.useLog.length) fields.hkUseLog = true;
      if (cache.changeLog.length) fields.hkChangeLog = true;
      if (cache.orderLog.length) fields.hkOrderLog = true;
      if (cache.mbInvLog.length) fields.hkMbInvLog = true;
      if (cache.mbCheckLog.length) fields.hkMbCheckLog = true;
      if (cache.frontChat.length) fields.hkFrontChat = true;
      schedulePush(fields);
    });
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      pull(true);
    }, 3000);
  }

  global.HKSync = {
    start: startPolling,
    onChange: onChange,
    pull: pull,
    getRequestLog: function () {
      return cache.requestLog;
    },
    setRequestLog: function (entries) {
      cache.requestLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
      schedulePush({ hkRequestLog: true });
    },
    getCancelLog: function () {
      return cache.cancelLog;
    },
    prependCancelLog: function (entry) {
      cache.cancelLog.unshift(entry);
      writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, cache.cancelLog);
      schedulePush({ hkCancelLog: true });
    },
    clearCancelLog: function () {
      cache.cancelLog = [];
      writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, []);
      schedulePush({ hkCancelLog: true });
    },
    clearRequestLog: function () {
      cache.requestLog = [];
      writeJsonArray(REQUEST_LOG_KEY, []);
      schedulePush({ hkRequestLog: true });
    },
    getOrderLog: function () {
      return cache.orderLog;
    },
    setOrderLog: function (entries) {
      cache.orderLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
      schedulePush({ hkOrderLog: true });
    },
    clearOrderLog: function () {
      cache.orderLog = [];
      writeJsonArray(ORDER_LOG_KEY, []);
      schedulePush({ hkOrderLog: true });
    },
    getMbInvLog: function () {
      return cache.mbInvLog;
    },
    setMbInvLog: function (entries) {
      cache.mbInvLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(MB_INV_LOG_KEY, cache.mbInvLog);
      schedulePush({ hkMbInvLog: true });
    },
    clearMbInvLog: function () {
      cache.mbInvLog = [];
      writeJsonArray(MB_INV_LOG_KEY, []);
      schedulePush({ hkMbInvLog: true });
    },
    getMbCheckLog: function () {
      return cache.mbCheckLog;
    },
    setMbCheckLog: function (entries) {
      cache.mbCheckLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(MB_CHECK_LOG_KEY, cache.mbCheckLog);
      schedulePush({ hkMbCheckLog: true });
    },
    clearMbCheckLog: function () {
      cache.mbCheckLog = [];
      writeJsonArray(MB_CHECK_LOG_KEY, []);
      schedulePush({ hkMbCheckLog: true });
    },
    getFrontChat: function () {
      return cache.frontChat;
    },
    appendFrontChatMessage: function (entry) {
      if (!entry || typeof entry !== "object") return;
      cache.frontChat.push(entry);
      if (cache.frontChat.length > 300) {
        cache.frontChat = cache.frontChat.slice(-300);
      }
      writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      schedulePush({ hkFrontChat: true });
    },
    setFrontChat: function (entries) {
      cache.frontChat = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      schedulePush({ hkFrontChat: true });
    },
    clearFrontChat: function () {
      cache.frontChat = [];
      writeJsonArray(FRONT_CHAT_KEY, []);
      schedulePush({ hkFrontChat: true });
    },
    pushSnapshot: function (payload) {
      if (!payload || typeof payload !== "object") return Promise.resolve(false);
      if (payload.hkStorage && global.HKStorage) {
        global.HKStorage.applyRemote(payload.hkStorage);
      }
      if (Array.isArray(payload.hkRequestLog)) {
        cache.requestLog = payload.hkRequestLog.slice();
        writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
      }
      if (Array.isArray(payload.hkCancelLog)) {
        cache.cancelLog = payload.hkCancelLog.slice();
        writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, cache.cancelLog);
      }
      if (Array.isArray(payload.hkUseLog)) {
        cache.useLog = payload.hkUseLog.slice();
        writeJsonArray(REQUEST_USE_LOG_KEY, cache.useLog);
      }
      if (Array.isArray(payload.hkChangeLog)) {
        cache.changeLog = payload.hkChangeLog.slice();
        writeJsonArray(CHANGE_LOG_KEY, cache.changeLog);
      }
      if (Array.isArray(payload.hkOrderLog)) {
        cache.orderLog = payload.hkOrderLog.slice();
        writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
      }
      if (Array.isArray(payload.hkMbInvLog)) {
        cache.mbInvLog = payload.hkMbInvLog.slice();
        writeJsonArray(MB_INV_LOG_KEY, cache.mbInvLog);
      }
      if (Array.isArray(payload.hkMbCheckLog)) {
        cache.mbCheckLog = payload.hkMbCheckLog.slice();
        writeJsonArray(MB_CHECK_LOG_KEY, cache.mbCheckLog);
      }
      if (Array.isArray(payload.hkFrontChat)) {
        cache.frontChat = payload.hkFrontChat.slice();
        writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      }
      return postPayload(payload);
    },
    getChangeLog: function () {
      return cache.changeLog;
    },
    pushRoomChange: function (entry) {
      if (!entry || typeof entry !== "object") return Promise.resolve(false);
      cache.changeLog.unshift(entry);
      if (cache.changeLog.length > 100) cache.changeLog.length = 100;
      writeJsonArray(CHANGE_LOG_KEY, cache.changeLog);
      var body = {
        hkChangeLog: cache.changeLog.slice(),
        hkLastRoomChange: entry,
      };
      if (global.HKStorage) body.hkStorage = global.HKStorage.load();
      return postPayload(body);
    },
    clearChangeLog: function () {
      cache.changeLog = [];
      writeJsonArray(CHANGE_LOG_KEY, []);
      schedulePush({ hkChangeLog: true });
    },
    getUseLog: function () {
      return cache.useLog;
    },
    prependUseLog: function (entry) {
      cache.useLog.unshift(entry);
      writeJsonArray(REQUEST_USE_LOG_KEY, cache.useLog);
      schedulePush({ hkUseLog: true });
    },
    clearUseLog: function () {
      cache.useLog = [];
      writeJsonArray(REQUEST_USE_LOG_KEY, []);
      schedulePush({ hkUseLog: true });
    },
    schedulePushStorage: function () {
      schedulePush({ hkStorage: true });
    },
    getXmlPayload: function () {
      return xmlPayloadForListeners(null);
    },
  };
})(typeof window !== "undefined" ? window : this);
