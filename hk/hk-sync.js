/**
 * 정비관리(HK) — 서버 /api/sync 공유
 * 공지·구역 객실·요청 알림·취소/사용 리스트를 PC 간 동기화
 */
(function (global) {
  var REQUEST_LOG_KEY = "lotte-hk-request-log-v1";
  var REQUEST_CANCEL_NAME_LOG_KEY = "lotte-hk-cancel-name-log-v1";
  var REQUEST_USE_LOG_KEY = "lotte-hk-use-log-v1";

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
  };

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
  }

  function onChange(fn) {
    if (typeof fn === "function") changeListeners.push(fn);
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
    if (payload.vacRows && payload.vacRows.length) {
      changed.push("vacRows");
    }

    isApplyingRemote = false;
    if (changed.length) emitChange(changed, payload);
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
      return postPayload(payload);
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
  };
})(typeof window !== "undefined" ? window : this);
