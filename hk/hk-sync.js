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
  var SYNC_VERSION_KEY = "lotte-hk-sync-version-v1";
  var CLOSE_DAY_KEY = "lotte-hk-close-day-at-v1";

  var syncVersion = 0;
  var pollTimer = null;
  var pushTimer = null;
  var pendingPush = {};
  var isApplyingRemote = false;
  var changeListeners = [];
  var dirty = {
    hkStorage: false,
    hkRequestLog: false,
    hkCancelLog: false,
    hkUseLog: false,
    hkChangeLog: false,
    hkOrderLog: false,
    hkMbInvLog: false,
    hkMbCheckLog: false,
    hkFrontChat: false,
  };

  function markDirty(field) {
    if (Object.prototype.hasOwnProperty.call(dirty, field)) dirty[field] = true;
  }

  function clearDirty(field) {
    if (Object.prototype.hasOwnProperty.call(dirty, field)) dirty[field] = false;
  }

  function clearAllDirty() {
    Object.keys(dirty).forEach(function (field) {
      dirty[field] = false;
    });
  }

  function loadSyncVersionFromLocal() {
    try {
      var raw = global.localStorage.getItem(SYNC_VERSION_KEY);
      if (raw == null || raw === "") return;
      var v = parseInt(raw, 10);
      if (!isNaN(v) && v >= 0) syncVersion = v;
    } catch (e) {}
  }

  function saveSyncVersion(version) {
    if (version == null || isNaN(version)) return;
    syncVersion = version;
    try {
      global.localStorage.setItem(SYNC_VERSION_KEY, String(version));
    } catch (e) {}
  }

  function applyCloseDayMarker(payload) {
    if (!payload || !payload.hkCloseDayAt) return;
    try {
      global.localStorage.setItem(CLOSE_DAY_KEY, String(payload.hkCloseDayAt));
    } catch (e) {}
  }

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

  /** @type {object | null} */
  var lastServerPayload = null;

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
    if (pendingPush.hkStorage && dirty.hkStorage && global.HKStorage) {
      body.hkStorage = global.HKStorage.load();
    }
    if (pendingPush.hkRequestLog && dirty.hkRequestLog) {
      body.hkRequestLog = cache.requestLog;
    }
    if (pendingPush.hkCancelLog && dirty.hkCancelLog) {
      body.hkCancelLog = cache.cancelLog;
    }
    if (pendingPush.hkUseLog && dirty.hkUseLog) {
      body.hkUseLog = cache.useLog;
    }
    if (pendingPush.hkChangeLog && dirty.hkChangeLog) {
      body.hkChangeLog = cache.changeLog;
    }
    if (pendingPush.hkOrderLog && dirty.hkOrderLog) {
      body.hkOrderLog = cache.orderLog;
    }
    if (pendingPush.hkMbInvLog && dirty.hkMbInvLog) {
      body.hkMbInvLog = cache.mbInvLog;
    }
    if (pendingPush.hkMbCheckLog && dirty.hkMbCheckLog) {
      body.hkMbCheckLog = cache.mbCheckLog;
    }
    if (pendingPush.hkFrontChat && dirty.hkFrontChat) {
      body.hkFrontChat = cache.frontChat;
    }
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
        if (data && data.version != null) saveSyncVersion(data.version);
        return data;
      })
      .catch(function () {
        return false;
      });
  }

  function doPush() {
    var body = buildPushBody();
    var keys = Object.keys(body);
    if (!keys.length) {
      pendingPush = {};
      return Promise.resolve(false);
    }
    pendingPush = {};
    return postPayload(body).then(function (data) {
      if (data && data.version != null) {
        keys.forEach(function (key) {
          clearDirty(key);
        });
      }
      return data;
    });
  }

  function pushStorageNow() {
    if (isApplyingRemote || !global.HKStorage) return Promise.resolve(false);
    markDirty("hkStorage");
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    pendingPush.hkStorage = true;
    return doPush();
  }

  function applyRemotePayload(payload) {
    if (!payload || typeof payload !== "object") return;
    lastServerPayload = Object.assign({}, lastServerPayload || {}, payload);
    applyCloseDayMarker(payload);
    var changed = [];
    isApplyingRemote = true;

    if (payload.hkStorage && global.HKStorage) {
      global.HKStorage.applyRemote(payload.hkStorage);
      changed.push("hkStorage");
      clearDirty("hkStorage");
    }
    if (Array.isArray(payload.hkRequestLog)) {
      cache.requestLog = payload.hkRequestLog.slice();
      writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
      changed.push("hkRequestLog");
      clearDirty("hkRequestLog");
    }
    if (Array.isArray(payload.hkCancelLog)) {
      cache.cancelLog = payload.hkCancelLog.slice();
      writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, cache.cancelLog);
      changed.push("hkCancelLog");
      clearDirty("hkCancelLog");
    }
    if (Array.isArray(payload.hkUseLog)) {
      cache.useLog = payload.hkUseLog.slice();
      writeJsonArray(REQUEST_USE_LOG_KEY, cache.useLog);
      changed.push("hkUseLog");
      clearDirty("hkUseLog");
    }
    if (Array.isArray(payload.hkChangeLog)) {
      cache.changeLog = payload.hkChangeLog.slice();
      writeJsonArray(CHANGE_LOG_KEY, cache.changeLog);
      changed.push("hkChangeLog");
      clearDirty("hkChangeLog");
    }
    if (Array.isArray(payload.hkOrderLog)) {
      cache.orderLog = payload.hkOrderLog.slice();
      writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
      changed.push("hkOrderLog");
      clearDirty("hkOrderLog");
    }
    if (Array.isArray(payload.hkMbInvLog)) {
      cache.mbInvLog = payload.hkMbInvLog.slice();
      writeJsonArray(MB_INV_LOG_KEY, cache.mbInvLog);
      changed.push("hkMbInvLog");
      clearDirty("hkMbInvLog");
    }
    if (Array.isArray(payload.hkMbCheckLog)) {
      cache.mbCheckLog = payload.hkMbCheckLog.slice();
      writeJsonArray(MB_CHECK_LOG_KEY, cache.mbCheckLog);
      changed.push("hkMbCheckLog");
      clearDirty("hkMbCheckLog");
    }
    if (Array.isArray(payload.hkFrontChat)) {
      cache.frontChat = payload.hkFrontChat.slice();
      writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      changed.push("hkFrontChat");
      clearDirty("hkFrontChat");
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
        if (data.version != null) saveSyncVersion(data.version);
        if (data.payload) applyRemotePayload(data.payload);
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function startPolling() {
    loadSyncVersionFromLocal();
    loadCachesFromLocal();
    pull(false);
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
      markDirty("hkRequestLog");
      schedulePush({ hkRequestLog: true });
    },
    getCancelLog: function () {
      return cache.cancelLog;
    },
    prependCancelLog: function (entry) {
      cache.cancelLog.unshift(entry);
      writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, cache.cancelLog);
      markDirty("hkCancelLog");
      schedulePush({ hkCancelLog: true });
    },
    clearCancelLog: function () {
      cache.cancelLog = [];
      writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, []);
      markDirty("hkCancelLog");
      schedulePush({ hkCancelLog: true });
    },
    clearRequestLog: function () {
      cache.requestLog = [];
      writeJsonArray(REQUEST_LOG_KEY, []);
      markDirty("hkRequestLog");
      schedulePush({ hkRequestLog: true });
    },
    getOrderLog: function () {
      return cache.orderLog;
    },
    setOrderLog: function (entries) {
      cache.orderLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
      markDirty("hkOrderLog");
      schedulePush({ hkOrderLog: true });
    },
    clearOrderLog: function () {
      cache.orderLog = [];
      writeJsonArray(ORDER_LOG_KEY, []);
      markDirty("hkOrderLog");
      schedulePush({ hkOrderLog: true });
    },
    getMbInvLog: function () {
      return cache.mbInvLog;
    },
    setMbInvLog: function (entries) {
      cache.mbInvLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(MB_INV_LOG_KEY, cache.mbInvLog);
      markDirty("hkMbInvLog");
      schedulePush({ hkMbInvLog: true });
    },
    clearMbInvLog: function () {
      cache.mbInvLog = [];
      writeJsonArray(MB_INV_LOG_KEY, []);
      markDirty("hkMbInvLog");
      schedulePush({ hkMbInvLog: true });
    },
    getMbCheckLog: function () {
      return cache.mbCheckLog;
    },
    setMbCheckLog: function (entries) {
      cache.mbCheckLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(MB_CHECK_LOG_KEY, cache.mbCheckLog);
      markDirty("hkMbCheckLog");
      schedulePush({ hkMbCheckLog: true });
    },
    clearMbCheckLog: function () {
      cache.mbCheckLog = [];
      writeJsonArray(MB_CHECK_LOG_KEY, []);
      markDirty("hkMbCheckLog");
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
      markDirty("hkFrontChat");
      schedulePush({ hkFrontChat: true });
    },
    setFrontChat: function (entries) {
      cache.frontChat = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      markDirty("hkFrontChat");
      schedulePush({ hkFrontChat: true });
    },
    clearFrontChat: function () {
      cache.frontChat = [];
      writeJsonArray(FRONT_CHAT_KEY, []);
      markDirty("hkFrontChat");
      schedulePush({ hkFrontChat: true });
    },
    pushSnapshot: function (payload) {
      if (!payload || typeof payload !== "object") return Promise.resolve(false);
      if (!payload.hkCloseDayAt) {
        payload = Object.assign({}, payload, {
          hkCloseDayAt: new Date().toISOString(),
        });
      }
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
      applyCloseDayMarker(payload);
      clearAllDirty();
      return postPayload(payload).then(function (data) {
        if (data && data.version != null) saveSyncVersion(data.version);
        return data;
      });
    },
    getChangeLog: function () {
      return cache.changeLog;
    },
    pushRoomChange: function (entry) {
      if (!entry || typeof entry !== "object") return Promise.resolve(false);
      cache.changeLog.unshift(entry);
      if (cache.changeLog.length > 100) cache.changeLog.length = 100;
      writeJsonArray(CHANGE_LOG_KEY, cache.changeLog);
      markDirty("hkChangeLog");
      markDirty("hkStorage");
      var body = {
        hkChangeLog: cache.changeLog.slice(),
        hkLastRoomChange: entry,
      };
      if (global.HKStorage) body.hkStorage = global.HKStorage.load();
      return postPayload(body).then(function (data) {
        if (data && data.version != null) {
          clearDirty("hkChangeLog");
          clearDirty("hkStorage");
          saveSyncVersion(data.version);
        }
        return data;
      });
    },
    clearChangeLog: function () {
      cache.changeLog = [];
      writeJsonArray(CHANGE_LOG_KEY, []);
      markDirty("hkChangeLog");
      schedulePush({ hkChangeLog: true });
    },
    getUseLog: function () {
      return cache.useLog;
    },
    prependUseLog: function (entry) {
      cache.useLog.unshift(entry);
      writeJsonArray(REQUEST_USE_LOG_KEY, cache.useLog);
      markDirty("hkUseLog");
      schedulePush({ hkUseLog: true });
    },
    clearUseLog: function () {
      cache.useLog = [];
      writeJsonArray(REQUEST_USE_LOG_KEY, []);
      markDirty("hkUseLog");
      schedulePush({ hkUseLog: true });
    },
    schedulePushStorage: function () {
      markDirty("hkStorage");
      schedulePush({ hkStorage: true });
    },
    pushStorageNow: pushStorageNow,
    getXmlPayload: function () {
      return xmlPayloadForListeners(lastServerPayload);
    },
    getLastServerPayload: function () {
      return lastServerPayload ? Object.assign({}, lastServerPayload) : null;
    },
    clearRoomingXml: function () {
      xmlSyncCache.vacRows = [];
      xmlSyncCache.roomResvMap = {};
      if (lastServerPayload) {
        lastServerPayload.vacRows = [];
        lastServerPayload.roomResvMap = {};
        lastServerPayload.allStatusRooms = [];
        lastServerPayload.blockMap = {};
        lastServerPayload.extendedStayRooms = {};
        lastServerPayload.uploadSummary = "";
      }
      return postPayload({
        vacRows: [],
        roomResvMap: {},
        allStatusRooms: [],
        blockMap: {},
        extendedStayRooms: {},
        uploadSummary: "",
      }).then(function () {
        emitChange(
          [
            "vacRows",
            "roomResvMap",
            "allStatusRooms",
            "blockMap",
            "extendedStayRooms",
            "uploadSummary",
          ],
          Object.assign({}, lastServerPayload || {}, xmlPayloadForListeners(lastServerPayload))
        );
        return true;
      });
    },
  };
})(typeof window !== "undefined" ? window : this);
