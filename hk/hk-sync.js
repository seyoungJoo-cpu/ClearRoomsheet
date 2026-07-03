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
  var ROOMING_XML_LS_KEY = "lotte-hk-rooming-xml-v1";
  var ROOMING_EXTRA_KEYS = [
    "blockMap",
    "allStatusRooms",
    "extendedStayRooms",
    "blockDisplayAliases",
    "uploadSummary",
    "roomingClearedAt",
  ];
  var ROOMING_FASN_KEYS = [
    "fasnVacRows",
    "fasnAllStatusRooms",
    "fasnBlockMap",
    "fasnUploadSummary",
  ];

  var syncVersion = 0;
  var lastAppliedSyncUpdatedAt = "";
  var pollTimer = null;
  var pushTimer = null;
  var pendingPush = {};
  var PUSH_MIN_INTERVAL_MS = 1000;
  var PUSH_DEBOUNCE_MS = 400;
  var pushGapTimer = null;
  var pushTaskQueue = [];
  var pushTaskRunning = false;
  var lastPushCompletedAt = 0;
  var pendingLastRoomChange = null;
  var pendingScheduledFlushPromise = null;
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

  function getRoomingXmlSnapshot() {
    var snap = {
      vacRows: xmlSyncCache.vacRows.slice(),
      roomResvMap: Object.assign({}, xmlSyncCache.roomResvMap),
    };
    if (lastServerPayload && typeof lastServerPayload === "object") {
      ROOMING_EXTRA_KEYS.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(lastServerPayload, key)) {
          snap[key] = lastServerPayload[key];
        }
      });
      ROOMING_FASN_KEYS.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(lastServerPayload, key)) {
          snap[key] = lastServerPayload[key];
        }
      });
    }
    return snap;
  }

  function hasRoomingData(snapshot) {
    snapshot = snapshot || getRoomingXmlSnapshot();
    if (Array.isArray(snapshot.vacRows) && snapshot.vacRows.length) return true;
    if (snapshot.roomResvMap && Object.keys(snapshot.roomResvMap).length) return true;
    if (snapshot.blockMap && Object.keys(snapshot.blockMap).length) return true;
    if (Array.isArray(snapshot.allStatusRooms) && snapshot.allStatusRooms.length) return true;
    if (Array.isArray(snapshot.fasnVacRows) && snapshot.fasnVacRows.length) return true;
    if (snapshot.fasnBlockMap && Object.keys(snapshot.fasnBlockMap).length) return true;
    if (Array.isArray(snapshot.fasnAllStatusRooms) && snapshot.fasnAllStatusRooms.length) return true;
    try {
      var raw = global.localStorage.getItem(ROOMING_XML_LS_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      if (Array.isArray(parsed.vacRows) && parsed.vacRows.length) return true;
      if (parsed.roomResvMap && Object.keys(parsed.roomResvMap).length) return true;
      if (parsed.blockMap && Object.keys(parsed.blockMap).length) return true;
      if (Array.isArray(parsed.allStatusRooms) && parsed.allStatusRooms.length) return true;
      if (Array.isArray(parsed.fasnVacRows) && parsed.fasnVacRows.length) return true;
      if (parsed.fasnBlockMap && Object.keys(parsed.fasnBlockMap).length) return true;
      if (Array.isArray(parsed.fasnAllStatusRooms) && parsed.fasnAllStatusRooms.length) return true;
    } catch (e) {}
    return false;
  }

  function saveRoomingXmlToLocal() {
    if (!hasRoomingData()) return;
    try {
      global.localStorage.setItem(ROOMING_XML_LS_KEY, JSON.stringify(getRoomingXmlSnapshot()));
    } catch (e) {}
  }

  function loadRoomingXmlFromLocal() {
    try {
      var raw = global.localStorage.getItem(ROOMING_XML_LS_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") mergeRoomingPayload(parsed);
    } catch (e) {}
  }

  function pickNonEmptyStr(incoming, fallback) {
    var s = incoming != null ? String(incoming).trim() : "";
    if (s) return s;
    return fallback != null ? String(fallback).trim() : "";
  }

  /** 서버/루밍 동기화 시 객실별 roomType 등 빈 필드는 기존 캐시 값 유지 */
  function mergeVacRowsIncoming(incoming, existing) {
    var prevByRoom = {};
    (existing || []).forEach(function (r) {
      if (r && r.room) prevByRoom[String(r.room)] = r;
    });
    return (incoming || [])
      .filter(function (r) {
        return r && r.room;
      })
      .map(function (r) {
        var key = String(r.room);
        var old = prevByRoom[key] || {};
        return {
          room: key,
          status: pickNonEmptyStr(r.status, old.status),
          resvStatus: pickNonEmptyStr(r.resvStatus, old.resvStatus),
          blockCode: pickNonEmptyStr(r.blockCode, old.blockCode),
          foStatus: pickNonEmptyStr(r.foStatus, old.foStatus),
          roomType: pickNonEmptyStr(r.roomType, old.roomType),
        };
      });
  }

  function isRoomingResetPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(payload, "vacRows") || !Array.isArray(payload.vacRows)) {
      return false;
    }
    if (payload.vacRows.length > 0) return false;
    var map =
      payload.roomResvMap && typeof payload.roomResvMap === "object" ? payload.roomResvMap : {};
    if (Object.keys(map).length > 0) return false;
    var blk = payload.blockMap && typeof payload.blockMap === "object" ? payload.blockMap : {};
    if (Object.keys(blk).length > 0) return false;
    var rooms = Array.isArray(payload.allStatusRooms) ? payload.allStatusRooms : [];
    if (rooms.length > 0) return false;
    return true;
  }

  function applyRoomingReset(payload) {
    xmlSyncCache.vacRows = [];
    xmlSyncCache.roomResvMap = {};
    var cleared = {
      vacRows: [],
      roomResvMap: {},
      allStatusRooms: [],
      blockMap: {},
      extendedStayRooms: {},
      uploadSummary: "",
      fasnVacRows: [],
      fasnAllStatusRooms: [],
      fasnBlockMap: {},
      fasnUploadSummary: "",
      roomingClearedAt:
        payload && payload.roomingClearedAt
          ? String(payload.roomingClearedAt)
          : new Date().toISOString(),
    };
    lastServerPayload = Object.assign({}, lastServerPayload || {}, cleared);
    try {
      global.localStorage.removeItem(ROOMING_XML_LS_KEY);
      global.localStorage.removeItem("makeroom-fasn-local-v1");
    } catch (e) {}
    return true;
  }

  function mergeRoomingPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (isRoomingResetPayload(payload)) {
      return applyRoomingReset(payload);
    }
    var touched = false;
    if (Object.prototype.hasOwnProperty.call(payload, "vacRows") && Array.isArray(payload.vacRows)) {
      if (payload.vacRows.length > 0 || isRoomingResetPayload(payload) || !hasRoomingData()) {
        xmlSyncCache.vacRows =
          payload.vacRows.length > 0
            ? mergeVacRowsIncoming(payload.vacRows, [])
            : [];
        touched = true;
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, "roomResvMap") &&
      payload.roomResvMap &&
      typeof payload.roomResvMap === "object"
    ) {
      var resvKeys = Object.keys(payload.roomResvMap);
      if (resvKeys.length > 0 || !hasRoomingData()) {
        xmlSyncCache.roomResvMap = Object.assign({}, payload.roomResvMap);
        touched = true;
      }
    }
    ROOMING_EXTRA_KEYS.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) return;
      var val = payload[key];
      var isEmpty =
        val == null ||
        (Array.isArray(val) && !val.length) ||
        (typeof val === "object" && !Array.isArray(val) && !Object.keys(val).length);
      if (!isEmpty || !hasRoomingData()) {
        lastServerPayload = Object.assign({}, lastServerPayload || {});
        lastServerPayload[key] = val;
        touched = true;
      }
    });
    ROOMING_FASN_KEYS.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) return;
      var val = payload[key];
      var isEmpty =
        val == null ||
        (Array.isArray(val) && !val.length) ||
        (typeof val === "object" && !Array.isArray(val) && !Object.keys(val).length);
      if (!isEmpty || !hasRoomingData()) {
        lastServerPayload = Object.assign({}, lastServerPayload || {});
        lastServerPayload[key] = val;
        touched = true;
      }
    });
    if (touched) {
      lastServerPayload = Object.assign({}, lastServerPayload || {}, {
        vacRows: xmlSyncCache.vacRows.slice(),
        roomResvMap: Object.assign({}, xmlSyncCache.roomResvMap),
      });
      if (
        (Array.isArray(payload.vacRows) && payload.vacRows.length > 0) ||
        (Array.isArray(payload.fasnVacRows) && payload.fasnVacRows.length > 0)
      ) {
        delete lastServerPayload.roomingClearedAt;
      }
      saveRoomingXmlToLocal();
    }
    return touched;
  }

  function mergeXmlSyncCache(payload) {
    return mergeRoomingPayload(payload);
  }

  function xmlPayloadForListeners() {
    return getRoomingXmlSnapshot();
  }

  function xmlChangedKeys(payload) {
    var keys = [];
    if (!payload || typeof payload !== "object") return keys;
    if (Array.isArray(payload.vacRows)) keys.push("vacRows");
    if (Object.prototype.hasOwnProperty.call(payload, "roomResvMap")) keys.push("roomResvMap");
    ROOMING_EXTRA_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) keys.push(key);
    });
    ROOMING_FASN_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) keys.push(key);
    });
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

  var LOCAL_CACHE_KEYS = [
    REQUEST_LOG_KEY,
    REQUEST_CANCEL_NAME_LOG_KEY,
    REQUEST_USE_LOG_KEY,
    CHANGE_LOG_KEY,
    ORDER_LOG_KEY,
    MB_INV_LOG_KEY,
    MB_CHECK_LOG_KEY,
    FRONT_CHAT_KEY,
    SYNC_VERSION_KEY,
    CLOSE_DAY_KEY,
  ];

  function loadCachesFromLocal() {
    cache.requestLog = readJsonArray(REQUEST_LOG_KEY);
    cache.cancelLog = readJsonArray(REQUEST_CANCEL_NAME_LOG_KEY);
    cache.useLog = readJsonArray(REQUEST_USE_LOG_KEY);
    cache.changeLog = readJsonArray(CHANGE_LOG_KEY);
    cache.orderLog = readJsonArray(ORDER_LOG_KEY);
    cache.mbInvLog = readJsonArray(MB_INV_LOG_KEY);
    cache.mbCheckLog = readJsonArray(MB_CHECK_LOG_KEY);
    cache.frontChat = readJsonArray(FRONT_CHAT_KEY);
    loadRoomingXmlFromLocal();
  }

  /** HK 오더·요청 등 로컬 캐시만 삭제 — opts.preserveRooming 시 루밍 XML 유지 */
  function clearLocalCaches(opts) {
    opts = opts || {};
    LOCAL_CACHE_KEYS.forEach(function (key) {
      try {
        global.localStorage.removeItem(key);
      } catch (e) {}
    });
    if (global.HKStorage && global.HKStorage.key) {
      try {
        global.localStorage.removeItem(global.HKStorage.key);
      } catch (e) {}
    }
    syncVersion = 0;
    if (!opts.preserveRooming) {
      lastServerPayload = null;
      xmlSyncCache.vacRows = [];
      xmlSyncCache.roomResvMap = {};
      try {
        global.localStorage.removeItem(ROOMING_XML_LS_KEY);
      } catch (e) {}
    } else {
      lastServerPayload = null;
    }
    cache.requestLog = [];
    cache.cancelLog = [];
    cache.useLog = [];
    cache.changeLog = [];
    cache.orderLog = [];
    cache.mbInvLog = [];
    cache.mbCheckLog = [];
    cache.frontChat = [];
    clearAllDirty();
    pendingPush = {};
    pendingLastRoomChange = null;
    pendingScheduledFlushPromise = null;
    pushTaskQueue = [];
    pushTaskRunning = false;
    lastPushCompletedAt = 0;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (pushGapTimer) {
      clearTimeout(pushGapTimer);
      pushGapTimer = null;
    }
    if (opts.preserveRooming) {
      loadRoomingXmlFromLocal();
    }
  }

  function onChange(fn) {
    if (typeof fn !== "function") return;
    changeListeners.push(fn);
    var hasXml =
      xmlSyncCache.vacRows.length > 0 || Object.keys(xmlSyncCache.roomResvMap).length > 0;
    if (hasXml) {
      try {
        fn(xmlChangedKeys(xmlSyncCache), xmlPayloadForListeners());
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
    pushTimer = setTimeout(function () {
      pushTimer = null;
      queueScheduledFlush();
    }, PUSH_DEBOUNCE_MS);
  }

  function hasPendingPushWork() {
    return Object.keys(pendingPush).some(function (k) {
      return pendingPush[k] && dirty[k];
    });
  }

  function enqueuePushTask(taskFn) {
    return new Promise(function (resolve) {
      pushTaskQueue.push({ taskFn: taskFn, resolve: resolve });
      pumpPushTaskQueue();
    });
  }

  function pumpPushTaskQueue() {
    if (pushTaskRunning || pushTaskQueue.length === 0) return;

    var gapMs =
      lastPushCompletedAt > 0 ? PUSH_MIN_INTERVAL_MS - (Date.now() - lastPushCompletedAt) : 0;
    if (gapMs > 0) {
      if (!pushGapTimer) {
        pushGapTimer = setTimeout(function () {
          pushGapTimer = null;
          pumpPushTaskQueue();
        }, gapMs);
      }
      return;
    }

    pushTaskRunning = true;
    var item = pushTaskQueue.shift();
    Promise.resolve()
      .then(function () {
        return item.taskFn();
      })
      .then(function (result) {
        item.resolve(result);
      })
      .catch(function () {
        item.resolve(false);
      })
      .finally(function () {
        pushTaskRunning = false;
        lastPushCompletedAt = Date.now();
        pumpPushTaskQueue();
      });
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

  function postPayloadNow(body) {
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
        if (data && data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
        return data;
      })
      .catch(function () {
        return false;
      });
  }

  function postPayload(body) {
    if (!body || !Object.keys(body).length) return Promise.resolve(false);
    return enqueuePushTask(function () {
      return postPayloadNow(body);
    });
  }

  function runScheduledFlush() {
    var body = buildPushBody();
    if (pendingLastRoomChange) {
      body.hkLastRoomChange = pendingLastRoomChange;
      pendingLastRoomChange = null;
    }
    var keys = Object.keys(body);
    if (!keys.length) {
      pendingPush = {};
      return Promise.resolve(false);
    }
    pendingPush = {};
    return postPayloadNow(body).then(function (data) {
      if (data && data.version != null) {
        keys.forEach(function (key) {
          clearDirty(key);
        });
      }
      return data;
    });
  }

  function queueScheduledFlush() {
    if (!pendingScheduledFlushPromise) {
      pendingScheduledFlushPromise = enqueuePushTask(runScheduledFlush).finally(function () {
        pendingScheduledFlushPromise = null;
        if (hasPendingPushWork()) {
          queueScheduledFlush();
        }
      });
    }
    return pendingScheduledFlushPromise;
  }

  function pushStorageNow() {
    if (isApplyingRemote || !global.HKStorage) return Promise.resolve(false);
    markDirty("hkStorage");
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    pendingPush.hkStorage = true;
    return queueScheduledFlush();
  }

  function applyRemotePayload(payload) {
    if (!payload || typeof payload !== "object") return;
    lastServerPayload = Object.assign({}, lastServerPayload || {}, payload);
    var changed = [];
    var prevCloseDayAt = "";
    try {
      prevCloseDayAt = global.localStorage.getItem(CLOSE_DAY_KEY) || "";
    } catch (e) {}
    if (payload.hkCloseDayAt) {
      applyCloseDayMarker(payload);
      if (String(payload.hkCloseDayAt) !== prevCloseDayAt) {
        changed.push("hkCloseDayAt");
      }
    }
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
      emitChange(changed, Object.assign({}, payload, xmlPayloadForListeners()));
    }
  }

  function emitLocalCacheHydrate() {
    var changed = [
      "hkRequestLog",
      "hkOrderLog",
      "hkMbInvLog",
      "hkMbCheckLog",
      "hkFrontChat",
      "hkCancelLog",
      "hkUseLog",
    ];
    if (hasRoomingData()) {
      changed.push("vacRows");
      changed.push("roomResvMap");
    }
    emitChange(
      changed,
      Object.assign(
        {
          hkRequestLog: cache.requestLog.slice(),
          hkOrderLog: cache.orderLog.slice(),
          hkMbInvLog: cache.mbInvLog.slice(),
          hkMbCheckLog: cache.mbCheckLog.slice(),
          hkFrontChat: cache.frontChat.slice(),
          hkCancelLog: cache.cancelLog.slice(),
          hkUseLog: cache.useLog.slice(),
        },
        xmlPayloadForListeners()
      )
    );
  }

  function hydrateFromLocal() {
    loadCachesFromLocal();
    emitLocalCacheHydrate();
  }

  function shouldApplyRemoteSync(data) {
    if (!data) return false;
    var serverVer = data.version != null ? data.version : 0;
    if (serverVer > syncVersion) return true;
    if (serverVer < syncVersion) return true;
    if (data.updatedAt && data.updatedAt !== lastAppliedSyncUpdatedAt) return true;
    return false;
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
        if (!data.payload) {
          if (data.version != null && data.version < syncVersion) {
            saveSyncVersion(data.version);
            if (data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
          }
          if (!isPoll) {
            loadCachesFromLocal();
            emitLocalCacheHydrate();
          }
          return false;
        }
        if (shouldApplyRemoteSync(data) || (!isPoll && !lastAppliedSyncUpdatedAt)) {
          if (data.version != null) saveSyncVersion(data.version);
          if (data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
          applyRemotePayload(data.payload);
          return true;
        }
        if (!isPoll) {
          loadCachesFromLocal();
          if (data.payload) mergeRoomingPayload(data.payload);
          emitLocalCacheHydrate();
        }
        return true;
      })
      .catch(function () {
        if (!isPoll) {
          loadCachesFromLocal();
          emitLocalCacheHydrate();
        }
        return false;
      });
  }

  function startPolling() {
    loadSyncVersionFromLocal();
    loadCachesFromLocal();
    var pullPromise = pull(false);
    if (!pollTimer) {
      pollTimer = setInterval(function () {
        pull(true);
      }, 3000);
    }
    return pullPromise.then(function () {
      loadCachesFromLocal();
      emitLocalCacheHydrate();
    });
  }

  loadSyncVersionFromLocal();
  loadCachesFromLocal();

  global.HKSync = {
    start: startPolling,
    onChange: onChange,
    pull: pull,
    hydrateFromLocal: hydrateFromLocal,
    clearLocalCaches: clearLocalCaches,
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
      pendingLastRoomChange = entry;
      if (pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
      }
      pendingPush.hkChangeLog = true;
      pendingPush.hkStorage = true;
      return queueScheduledFlush();
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
      return getRoomingXmlSnapshot();
    },
    getLastServerPayload: function () {
      return lastServerPayload ? Object.assign({}, lastServerPayload) : null;
    },
    clearRoomingXml: function () {
      var clearedAt = new Date().toISOString();
      xmlSyncCache.vacRows = [];
      xmlSyncCache.roomResvMap = {};
      try {
        global.localStorage.removeItem(ROOMING_XML_LS_KEY);
        global.localStorage.removeItem("makeroom-fasn-local-v1");
      } catch (e) {}
      var cleared = {
        vacRows: [],
        roomResvMap: {},
        allStatusRooms: [],
        blockMap: {},
        extendedStayRooms: {},
        uploadSummary: "",
        fasnVacRows: [],
        fasnAllStatusRooms: [],
        fasnBlockMap: {},
        fasnUploadSummary: "",
        roomingClearedAt: clearedAt,
      };
      if (lastServerPayload) {
        Object.assign(lastServerPayload, cleared);
      } else {
        lastServerPayload = Object.assign({}, cleared);
      }
      return postPayload(cleared).then(function () {
        emitChange(
          [
            "vacRows",
            "roomResvMap",
            "allStatusRooms",
            "blockMap",
            "extendedStayRooms",
            "uploadSummary",
            "fasnVacRows",
            "fasnAllStatusRooms",
            "fasnBlockMap",
            "fasnUploadSummary",
            "roomingClearedAt",
          ],
          Object.assign({}, lastServerPayload || {}, xmlPayloadForListeners())
        );
        return true;
      });
    },
  };
})(typeof window !== "undefined" ? window : this);
