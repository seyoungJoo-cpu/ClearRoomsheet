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
  var TEAM_CHAT_KEY = "lotte-hk-team-chat-v1";
  var ADMIN_INQUIRY_KEY = "lotte-hk-admin-inquiries-v1";
  var SYNC_VERSION_KEY = "lotte-hk-sync-version-v1";
  var APPLIED_PARTS_KEY = "lotte-hk-sync-parts-v1";
  var CLOSE_DAY_KEY = "lotte-hk-close-day-at-v1";
  var ROOMING_XML_LS_KEY = "lotte-hk-rooming-xml-v1";
  var SYNC_PART_FIELDS = {
    rooming: [
      "blockMap",
      "vacRows",
      "roomResvMap",
      "excelResvMap",
      "arrResvTotals",
      "allStatusRooms",
      "extendedStayRooms",
      "extendedStayUpdatedAt",
      "blockDisplayAliases",
      "uploadSummary",
      "roomingUploadedAt",
      "fasnBlockMap",
      "fasnVacRows",
      "fasnAllStatusRooms",
      "fasnUploadSummary",
      "fasnUploadedAt",
      "roomingClearedAt",
    ],
    hkStorage: ["hkStorage"],
    hkRequestLog: ["hkRequestLog"],
    hkOrderLog: ["hkOrderLog"],
    hkCancelLog: ["hkCancelLog"],
    hkUseLog: ["hkUseLog"],
    hkChangeLog: ["hkChangeLog"],
    hkMbInvLog: ["hkMbInvLog"],
    hkMbCheckLog: ["hkMbCheckLog"],
    hkFrontChat: ["hkFrontChat"],
    hkTeamChat: ["hkTeamChat"],
    hkAdminInquiries: ["hkAdminInquiries"],
    hkMeta: ["hkCloseDayAt", "hkLastRoomChange", "hkAutoOrderState"],
  };
  var ROOMING_EXTRA_KEYS = [
    "blockMap",
    "allStatusRooms",
    "extendedStayRooms",
    "blockDisplayAliases",
    "uploadSummary",
    "roomingUploadedAt",
    "roomingClearedAt",
  ];
  var ROOMING_FASN_KEYS = [
    "fasnVacRows",
    "fasnAllStatusRooms",
    "fasnBlockMap",
    "fasnUploadSummary",
  ];

  var syncVersion = 0;
  var appliedPartVersions = {};
  var catchUpPull = null;
  var closeDayFullPull = null;
  var lastAppliedSyncUpdatedAt = "";
  var lastPresenceIdent = "";
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
    hkTeamChat: false,
    hkAdminInquiries: false,
  };
  var dirtyVersion = {};
  Object.keys(dirty).forEach(function (field) {
    dirtyVersion[field] = 0;
  });

  function markDirty(field) {
    if (Object.prototype.hasOwnProperty.call(dirty, field)) {
      dirty[field] = true;
      dirtyVersion[field] = (dirtyVersion[field] || 0) + 1;
    }
  }

  function clearDirty(field) {
    if (Object.prototype.hasOwnProperty.call(dirty, field)) dirty[field] = false;
  }

  function clearAllDirty() {
    Object.keys(dirty).forEach(function (field) {
      dirty[field] = false;
    });
  }

  /** 요청 로그 id별 최신 updatedAt 유지 (처리·예정 시간 입력이 옛 캐시에 덮이지 않게) */
  function mergeRequestLogEntries(prevArr, incomingArr) {
    var byId = {};
    function hasSched(entry) {
      return !!(entry && entry.sched != null && String(entry.sched).trim());
    }
    function isCancelled(entry) {
      return !!(entry && (entry.cancelled === true || entry.canceled === true));
    }
    function consider(entry) {
      if (!entry || typeof entry !== "object") return;
      var id = entry.id != null ? String(entry.id) : "";
      if (!id) return;
      var cur = byId[id];
      if (!cur) {
        byId[id] = entry;
        return;
      }
      var ta = new Date(cur.updatedAt || cur.at || 0).getTime();
      var tb = new Date(entry.updatedAt || entry.at || 0).getTime();
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      if (tb > ta) {
        var newer = entry;
        var older = cur;
        var mergedReq = Object.assign({}, older, newer);
        mergedReq.chat = mergeOrderChats(older.chat, newer.chat);
        byId[id] = mergedReq;
        return;
      }
      if (ta > tb) {
        var mergedKeep = Object.assign({}, entry, cur);
        mergedKeep.chat = mergeOrderChats(entry.chat, cur.chat);
        byId[id] = mergedKeep;
        return;
      }
      if (isCancelled(entry) && !isCancelled(cur)) {
        var mCancel = Object.assign({}, cur, entry);
        mCancel.chat = mergeOrderChats(cur.chat, entry.chat);
        byId[id] = mCancel;
        return;
      }
      if (!isCancelled(entry) && isCancelled(cur)) {
        var mKeepCancel = Object.assign({}, entry, cur);
        mKeepCancel.chat = mergeOrderChats(entry.chat, cur.chat);
        byId[id] = mKeepCancel;
        return;
      }
      if (hasSched(entry) && !hasSched(cur)) {
        var mSched = Object.assign({}, cur, entry);
        mSched.chat = mergeOrderChats(cur.chat, entry.chat);
        byId[id] = mSched;
        return;
      }
      if (!hasSched(entry) && hasSched(cur)) {
        var mKeepSched = Object.assign({}, entry, cur);
        mKeepSched.chat = mergeOrderChats(entry.chat, cur.chat);
        byId[id] = mKeepSched;
        return;
      }
      var mEq = Object.assign({}, cur, entry);
      mEq.chat = mergeOrderChats(cur.chat, entry.chat);
      byId[id] = mEq;
    }
    (Array.isArray(prevArr) ? prevArr : []).forEach(consider);
    (Array.isArray(incomingArr) ? incomingArr : []).forEach(consider);
    return Object.keys(byId).map(function (id) {
      return byId[id];
    });
  }

  function adminInquiryHasReply(entry) {
    if (!entry) return false;
    if (entry.replyAt != null && String(entry.replyAt).trim()) return true;
    if (entry.reply != null && String(entry.reply).trim()) return true;
    return String(entry.status || "") === "answered";
  }

  /** 서버와 동일: 답변 없는 옛 목록이 답변을 덮어쓰지 않도록 병합 */
  function mergeAdminInquiriesLocal(prev, incoming) {
    if (!Array.isArray(incoming)) {
      return Array.isArray(prev) ? prev.slice() : [];
    }
    var map = {};
    (Array.isArray(prev) ? prev : []).forEach(function (entry) {
      if (entry && entry.id) map[entry.id] = entry;
    });
    incoming.forEach(function (entry) {
      if (!entry || !entry.id) return;
      var prevEntry = map[entry.id];
      if (!prevEntry) {
        map[entry.id] = entry;
        return;
      }
      var merged = Object.assign({}, prevEntry, entry);
      var prevHasReply = adminInquiryHasReply(prevEntry);
      var incHasReply = adminInquiryHasReply(entry);
      if (prevHasReply && !incHasReply) {
        merged.reply = prevEntry.reply;
        merged.replyAt = prevEntry.replyAt;
        merged.replyBy = prevEntry.replyBy;
        merged.status = prevEntry.status || "answered";
      } else if (prevHasReply && incHasReply) {
        var prevReplyAt = prevEntry.replyAt != null ? String(prevEntry.replyAt) : "";
        var incReplyAt = entry.replyAt != null ? String(entry.replyAt) : "";
        if (prevReplyAt && incReplyAt && incReplyAt < prevReplyAt) {
          merged.reply = prevEntry.reply;
          merged.replyAt = prevEntry.replyAt;
          merged.replyBy = prevEntry.replyBy;
          merged.status = prevEntry.status;
        }
      }
      var prevAt = prevEntry.at != null ? String(prevEntry.at) : "";
      var incAt = entry.at != null ? String(entry.at) : "";
      if (prevAt && incAt && incAt < prevAt) {
        merged.at = prevEntry.at;
        merged.by = prevEntry.by;
        merged.text = prevEntry.text;
      }
      map[entry.id] = merged;
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        var ta = new Date(a.at || 0).getTime();
        var tb = new Date(b.at || 0).getTime();
        if (isNaN(ta)) ta = 0;
        if (isNaN(tb)) tb = 0;
        return tb - ta;
      });
  }

  function orderEntryClock(entry) {
    if (!entry || typeof entry !== "object") return 0;
    var max = 0;
    Object.keys(entry).forEach(function (key) {
      if (!/At$/.test(key) || !entry[key]) return;
      var t = new Date(entry[key]).getTime();
      if (!isNaN(t) && t > max) max = t;
    });
    (Array.isArray(entry.chat) ? entry.chat : []).forEach(function (msg) {
      if (!msg) return;
      var t = new Date(msg.at || msg.updatedAt || 0).getTime();
      if (!isNaN(t) && t > max) max = t;
    });
    return max;
  }

  function orderPhaseRank(entry) {
    if (!entry) return 0;
    if (entry.issueOpen === true || String(entry.phase || "") === "issue") return 3;
    var p = String(entry.phase || "alert");
    if (p === "cancelled") return 5;
    if (p === "doorhandle") return 4;
    if (p === "deployed") return 4;
    if (p === "unavailable") return 3;
    if (p === "accepted") return 2;
    return 1;
  }

  function mergeChatReactions(ra, rb) {
    var out = {};
    [ra, rb].forEach(function (src) {
      if (!src || typeof src !== "object") return;
      Object.keys(src).forEach(function (emoji) {
        var list = Array.isArray(src[emoji]) ? src[emoji] : [];
        if (!out[emoji]) out[emoji] = [];
        list.forEach(function (name) {
          var n = name != null ? String(name) : "";
          if (!n) return;
          if (out[emoji].indexOf(n) < 0) out[emoji].push(n);
        });
        if (!out[emoji].length) delete out[emoji];
      });
    });
    return out;
  }

  function mergeOrderChats(a, b) {
    var out = [];
    var seen = {};
    [a, b].forEach(function (list) {
      (Array.isArray(list) ? list : []).forEach(function (msg) {
        if (!msg) return;
        var key =
          (msg.id != null ? String(msg.id) : "") ||
          [msg.at || "", msg.by || "", msg.text || msg.message || ""].join("|");
        if (Object.prototype.hasOwnProperty.call(seen, key)) {
          var existing = out[seen[key]];
          if (!existing) return;
          existing.reactions = mergeChatReactions(existing.reactions, msg.reactions);
          if (!existing.id && msg.id) existing.id = msg.id;
          if (msg.updatedAt && (!existing.updatedAt || String(msg.updatedAt) > String(existing.updatedAt))) {
            existing.updatedAt = msg.updatedAt;
          }
          return;
        }
        seen[key] = out.length;
        var copy = Object.assign({}, msg);
        if (copy.reactions && typeof copy.reactions === "object") {
          copy.reactions = mergeChatReactions(copy.reactions, null);
        }
        out.push(copy);
      });
    });
    out.sort(function (x, y) {
      return new Date(x.at || 0).getTime() - new Date(y.at || 0).getTime();
    });
    return out;
  }

  function applyNewerMemoFields(merged, a, b) {
    if (!merged) return merged;
    function memoClock(entry) {
      if (!entry) return 0;
      var t = new Date(entry.memoUpdatedAt || 0).getTime();
      return isNaN(t) ? 0 : t;
    }
    var ta = memoClock(a);
    var tb = memoClock(b);
    var src = null;
    if (tb > ta) src = b;
    else if (ta > tb) src = a;
    if (!src) return merged;
    if (src.memo != null) merged.memo = src.memo;
    if (Object.prototype.hasOwnProperty.call(src, "memoImage")) merged.memoImage = src.memoImage;
    merged.memoUpdatedAt = src.memoUpdatedAt;
    return merged;
  }

  /** 동시 편집 시 새 오더/접수/투입완료가 서로 지워지지 않도록 ID 기준 병합 */
  function mergeOrderLogsLocal(local, remote) {
    var map = {};
    (Array.isArray(remote) ? remote : []).forEach(function (entry) {
      if (entry && entry.id) map[entry.id] = entry;
    });
    (Array.isArray(local) ? local : []).forEach(function (entry) {
      if (!entry || !entry.id) return;
      var other = map[entry.id];
      if (!other) {
        map[entry.id] = entry;
        return;
      }
      var localClock = orderEntryClock(entry);
      var remoteClock = orderEntryClock(other);
      var localWins =
        localClock > remoteClock ||
        (localClock === remoteClock && orderPhaseRank(entry) >= orderPhaseRank(other));
      var merged = localWins
        ? Object.assign({}, other, entry)
        : Object.assign({}, entry, other);
      merged.chat = mergeOrderChats(other.chat, entry.chat);
      applyNewerMemoFields(merged, other, entry);
      map[entry.id] = merged;
    });
    return Object.keys(map)
      .map(function (id) {
        return map[id];
      })
      .sort(function (a, b) {
        return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
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

  function loadAppliedPartVersions() {
    try {
      var raw = global.localStorage.getItem(APPLIED_PARTS_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        appliedPartVersions = parsed;
      }
    } catch (e) {}
  }

  function persistAppliedPartVersions() {
    try {
      global.localStorage.setItem(APPLIED_PARTS_KEY, JSON.stringify(appliedPartVersions));
    } catch (e) {}
  }

  function markAppliedPartsFromPayload(payload, partVersions, version, partial) {
    if (!payload || typeof payload !== "object") return;
    var pv = partVersions && typeof partVersions === "object" ? partVersions : {};
    var ver = version != null ? Number(version) : syncVersion;
    Object.keys(SYNC_PART_FIELDS).forEach(function (part) {
      var keys = SYNC_PART_FIELDS[part];
      var hit = false;
      for (var i = 0; i < keys.length; i++) {
        if (Object.prototype.hasOwnProperty.call(payload, keys[i])) {
          hit = true;
          break;
        }
      }
      if (!hit) return;
      var n = pv[part] != null ? Number(pv[part]) : ver;
      if (isFinite(n)) appliedPartVersions[part] = n;
    });
    if (!partial && pv && Object.keys(pv).length) {
      Object.keys(pv).forEach(function (part) {
        var n = Number(pv[part]);
        if (isFinite(n)) appliedPartVersions[part] = n;
      });
    }
    persistAppliedPartVersions();
  }

  function missedPartsSince(serverParts) {
    if (!serverParts || typeof serverParts !== "object") return null;
    var minLv = Infinity;
    var missed = false;
    Object.keys(serverParts).forEach(function (part) {
      var sv = Number(serverParts[part]);
      if (!isFinite(sv)) return;
      var lv = Number(appliedPartVersions[part]);
      if (!isFinite(lv)) lv = 0;
      if (sv > lv) {
        missed = true;
        if (lv < minLv) minLv = lv;
      }
    });
    if (!missed) return null;
    return isFinite(minLv) ? minLv : 0;
  }

  var EMBED_STATE_KEYS = [
    "hk-dd-embed-state-v1",
    "hk-inven-embed-state-v1",
    "hk-chichi-embed-state-v1",
  ];

  var DAY_CACHE_KEYS = [
    REQUEST_LOG_KEY,
    REQUEST_CANCEL_NAME_LOG_KEY,
    REQUEST_USE_LOG_KEY,
    CHANGE_LOG_KEY,
    ORDER_LOG_KEY,
    MB_INV_LOG_KEY,
    MB_CHECK_LOG_KEY,
  ];

  function getCloseDayAtLocal() {
    try {
      return global.localStorage.getItem(CLOSE_DAY_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function localCloseDayAtCombined() {
    var best = getCloseDayAtLocal() || "";
    try {
      if (global.HKStorage && typeof global.HKStorage.load === "function") {
        var d = global.HKStorage.load();
        var cd = d && d.closeDayAt != null ? String(d.closeDayAt).trim() : "";
        if (cd && (!best || cd > best)) best = cd;
      }
    } catch (eLoc) {}
    return best;
  }

  function pickCloseDayAtFromData(data) {
    var best = "";
    function consider(v) {
      var s = v != null ? String(v).trim() : "";
      if (s && (!best || s > best)) best = s;
    }
    if (!data || typeof data !== "object") return "";
    consider(data.hkCloseDayAt);
    if (data.payload && typeof data.payload === "object") {
      consider(data.payload.hkCloseDayAt);
      if (data.payload.hkStorage && typeof data.payload.hkStorage === "object") {
        consider(data.payload.hkStorage.closeDayAt);
      }
    }
    return best;
  }

  function pullFullForCloseDay() {
    if (closeDayFullPull) return closeDayFullPull;
    closeDayFullPull = pull(false, { full: true, catchUp: true }).finally(function () {
      closeDayFullPull = null;
    });
    return closeDayFullPull;
  }

  function filterArrAfterCloseDay(arr, closeAt) {
    if (!Array.isArray(arr)) return [];
    if (!closeAt) return arr.slice();
    if (
      global.HKStorage &&
      typeof global.HKStorage.filterLogEntriesAfterCloseDay === "function"
    ) {
      return global.HKStorage.filterLogEntriesAfterCloseDay(arr, closeAt);
    }
    var closeMs = new Date(closeAt).getTime();
    if (isNaN(closeMs) || closeMs <= 0) return arr.slice();
    return arr.filter(function (entry) {
      if (!entry || typeof entry !== "object") return false;
      var at = entry.updatedAt || entry.at || entry.createdAt || "";
      var ms = new Date(at).getTime();
      return !isNaN(ms) && ms >= closeMs;
    });
  }

  function stripPreCloseRoomsFromStorage(storage, closeAt) {
    if (!storage || typeof storage !== "object" || !closeAt) return storage;
    if (!storage.rooms || typeof storage.rooms !== "object") return storage;
    Object.keys(storage.rooms).forEach(function (zone) {
      storage.rooms[zone] = (storage.rooms[zone] || []).filter(function (room) {
        if (!room || !room.number) return false;
        var at =
          typeof global.HKStorage !== "undefined" &&
          typeof global.HKStorage.roomActivityAt === "function"
            ? global.HKStorage.roomActivityAt(room)
            : room.updatedAt || room.createdAt || "";
        // 스탬프 없거나 마감 이전이면 제외 (마감 후 되살림 방지)
        if (!at) return false;
        return String(at) >= String(closeAt);
      });
    });
    return storage;
  }

  /**
   * 마감 신호: 당일 업무용 localStorage·dirty 푸시를 비운다.
   * 채팅·관리자문의·마감시각·루밍 XML은 유지.
   */
  function clearDayLocalCachesOnCloseDay(payload) {
    var closeAt =
      (payload && payload.hkCloseDayAt && String(payload.hkCloseDayAt)) ||
      getCloseDayAtLocal() ||
      "";
    if (closeAt) {
      try {
        global.localStorage.setItem(CLOSE_DAY_KEY, closeAt);
      } catch (eCd) {}
      try {
        global.localStorage.setItem("lotte-hk-wipe-epoch-v1", closeAt);
      } catch (eEp) {}
    }

    DAY_CACHE_KEYS.forEach(function (key) {
      try {
        global.localStorage.removeItem(key);
      } catch (e) {}
    });
    EMBED_STATE_KEYS.forEach(function (key) {
      try {
        global.localStorage.removeItem(key);
      } catch (e) {}
    });
    // Extra day UI caches / drafts so stale local data cannot revive
    [
      "lotte-hk-zone-status-filters-v2",
      "hk-inven-notify-draft-v6",
      "hk-dd-embed-state-v1",
      "hk-inven-embed-state-v1",
      "hk-chichi-embed-state-v1",
    ].forEach(function (key) {
      try {
        global.localStorage.removeItem(key);
      } catch (eXtra) {}
    });

    cache.requestLog = Array.isArray(payload && payload.hkRequestLog)
      ? payload.hkRequestLog.slice()
      : [];
    cache.cancelLog = Array.isArray(payload && payload.hkCancelLog)
      ? payload.hkCancelLog.slice()
      : [];
    cache.useLog = Array.isArray(payload && payload.hkUseLog)
      ? payload.hkUseLog.slice()
      : [];
    cache.changeLog = Array.isArray(payload && payload.hkChangeLog)
      ? payload.hkChangeLog.slice()
      : [];
    cache.orderLog = Array.isArray(payload && payload.hkOrderLog)
      ? payload.hkOrderLog.slice()
      : [];
    cache.mbInvLog = Array.isArray(payload && payload.hkMbInvLog)
      ? payload.hkMbInvLog.slice()
      : [];
    cache.mbCheckLog = Array.isArray(payload && payload.hkMbCheckLog)
      ? payload.hkMbCheckLog.slice()
      : [];

    // Drop any log rows older than closeAt (ignore revived stale timestamps)
    if (closeAt) {
      cache.requestLog = filterArrAfterCloseDay(cache.requestLog, closeAt);
      cache.cancelLog = filterArrAfterCloseDay(cache.cancelLog, closeAt);
      cache.useLog = filterArrAfterCloseDay(cache.useLog, closeAt);
      cache.changeLog = filterArrAfterCloseDay(cache.changeLog, closeAt);
      cache.orderLog = filterOrdersAfterCloseDay(cache.orderLog, closeAt);
      cache.mbInvLog = filterArrAfterCloseDay(cache.mbInvLog, closeAt);
      cache.mbCheckLog = filterArrAfterCloseDay(cache.mbCheckLog, closeAt);
    }

    writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
    writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, cache.cancelLog);
    writeJsonArray(REQUEST_USE_LOG_KEY, cache.useLog);
    writeJsonArray(CHANGE_LOG_KEY, cache.changeLog);
    writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
    writeJsonArray(MB_INV_LOG_KEY, cache.mbInvLog);
    writeJsonArray(MB_CHECK_LOG_KEY, cache.mbCheckLog);

    [
      "hkStorage",
      "hkRequestLog",
      "hkCancelLog",
      "hkUseLog",
      "hkChangeLog",
      "hkOrderLog",
      "hkMbInvLog",
      "hkMbCheckLog",
    ].forEach(function (field) {
      clearDirty(field);
      delete pendingPush[field];
    });
    pendingLastRoomChange = null;
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
    teamChat: [],
    adminInquiries: [],
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
      extendedStayUpdatedAt:
        payload && payload.roomingClearedAt
          ? String(payload.roomingClearedAt)
          : new Date().toISOString(),
      uploadSummary: "",
      roomingUploadedAt: "",
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
      return true;
    } catch (e) {
      return false;
    }
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
    TEAM_CHAT_KEY,
    ADMIN_INQUIRY_KEY,
    SYNC_VERSION_KEY,
    CLOSE_DAY_KEY,
  ];

  function loadCachesFromLocal() {
    var closeAt = getCloseDayAtLocal();
    cache.requestLog = filterArrAfterCloseDay(readJsonArray(REQUEST_LOG_KEY), closeAt);
    cache.cancelLog = filterArrAfterCloseDay(
      readJsonArray(REQUEST_CANCEL_NAME_LOG_KEY),
      closeAt
    );
    cache.useLog = filterArrAfterCloseDay(readJsonArray(REQUEST_USE_LOG_KEY), closeAt);
    cache.changeLog = filterArrAfterCloseDay(readJsonArray(CHANGE_LOG_KEY), closeAt);
    cache.orderLog = filterOrdersAfterCloseDay(readJsonArray(ORDER_LOG_KEY), closeAt);
    cache.mbInvLog = filterArrAfterCloseDay(readJsonArray(MB_INV_LOG_KEY), closeAt);
    cache.mbCheckLog = filterArrAfterCloseDay(readJsonArray(MB_CHECK_LOG_KEY), closeAt);
    cache.frontChat = readJsonArray(FRONT_CHAT_KEY);
    cache.teamChat = readJsonArray(TEAM_CHAT_KEY);
    cache.adminInquiries = readJsonArray(ADMIN_INQUIRY_KEY);
    loadRoomingXmlFromLocal();
  }

  function hasLocalHkHydration() {
    try {
      if (xmlSyncCache.vacRows && xmlSyncCache.vacRows.length) return true;
      if (xmlSyncCache.roomResvMap && Object.keys(xmlSyncCache.roomResvMap).length) return true;
      if (cache.requestLog && cache.requestLog.length) return true;
      if (cache.orderLog && cache.orderLog.length) return true;
      if (cache.frontChat && cache.frontChat.length) return true;
      if (cache.teamChat && cache.teamChat.length) return true;
      if (global.HKStorage && typeof global.HKStorage.load === "function") {
        var d = global.HKStorage.load();
        if (d && d.rooms && typeof d.rooms === "object") {
          var zones = Object.keys(d.rooms);
          for (var i = 0; i < zones.length; i++) {
            if (Array.isArray(d.rooms[zones[i]]) && d.rooms[zones[i]].length) return true;
          }
        }
      }
    } catch (eHydrate) {}
    return false;
  }

  function orderSurvivesCloseDay(entry, closeAt) {
    if (!entry) return false;
    if (!closeAt) return true;
    var at = entry.updatedAt || entry.at || entry.createdAt || "";
    var ms = new Date(at).getTime();
    var closeMs = new Date(closeAt).getTime();
    if (!isNaN(ms) && !isNaN(closeMs) && ms >= closeMs) return true;
    var p = entry.phase != null ? String(entry.phase).trim() : "";
    if (
      p === "cancelled" ||
      p === "deployed" ||
      p === "doorhandle" ||
      p === "unavailable" ||
      p === "issue" ||
      p === "accepted"
    ) {
      return false;
    }
    if (entry.issueOpen === true) return false;
    return true;
  }

  function filterOrdersAfterCloseDay(arr, closeAt) {
    if (!Array.isArray(arr)) return [];
    if (!closeAt) return arr.slice();
    return arr.filter(function (entry) {
      return orderSurvivesCloseDay(entry, closeAt);
    });
  }

  /** HK 오더·요청 등 로컬 캐시만 삭제 — opts.preserveRooming 시 루밍 XML 유지.
   * 인벤통보·DD/인벤/취향(frontEmbedStates)은 마감 전까지 로컬에서도 보존한다.
   */
  function clearLocalCaches(opts) {
    opts = opts || {};
    var preservedInvenNotify = null;
    var preservedFrontEmbed = null;
    try {
      if (global.HKStorage && typeof global.HKStorage.load === "function") {
        var snap = global.HKStorage.load();
        if (snap && typeof snap === "object") {
          if (snap.invenNotify != null) preservedInvenNotify = snap.invenNotify;
          if (snap.frontEmbedStates != null) preservedFrontEmbed = snap.frontEmbedStates;
        }
      }
    } catch (eSnap) {}
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
    try {
      if (
        (preservedInvenNotify != null || preservedFrontEmbed != null) &&
        global.HKStorage &&
        typeof global.HKStorage.save === "function"
      ) {
        var restore = global.HKStorage.load() || {};
        if (preservedInvenNotify != null) restore.invenNotify = preservedInvenNotify;
        if (preservedFrontEmbed != null) restore.frontEmbedStates = preservedFrontEmbed;
        global.HKStorage.save(restore, { skipSync: true });
      }
    } catch (eRest) {}
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
    cache.teamChat = [];
    cache.adminInquiries = [];
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
    Object.keys(fields).forEach(function (k) {
      pendingPush[k] = true;
    });
    if (isApplyingRemote) return;
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
    var closeAt = getCloseDayAtLocal();
    if (pendingPush.hkStorage && dirty.hkStorage && global.HKStorage) {
      body.hkStorage = global.HKStorage.load();
      try {
        if (closeAt && body.hkStorage && typeof body.hkStorage === "object") {
          body.hkStorage.closeDayAt = closeAt;
          stripPreCloseRoomsFromStorage(body.hkStorage, closeAt);
        }
        if (closeAt) body.hkCloseDayAt = closeAt;
      } catch (eCd) {}
    }
    if (pendingPush.hkRequestLog && dirty.hkRequestLog) {
      body.hkRequestLog = filterArrAfterCloseDay(cache.requestLog, closeAt);
    }
    if (pendingPush.hkCancelLog && dirty.hkCancelLog) {
      body.hkCancelLog = filterArrAfterCloseDay(cache.cancelLog, closeAt);
    }
    if (pendingPush.hkUseLog && dirty.hkUseLog) {
      body.hkUseLog = filterArrAfterCloseDay(cache.useLog, closeAt);
    }
    if (pendingPush.hkChangeLog && dirty.hkChangeLog) {
      body.hkChangeLog = filterArrAfterCloseDay(cache.changeLog, closeAt);
    }
    if (pendingPush.hkOrderLog && dirty.hkOrderLog) {
      // 오더 알림은 마감 후 일부 유지 — close 필터로 지우지 않음
      body.hkOrderLog = cache.orderLog;
    }
    if (pendingPush.hkMbInvLog && dirty.hkMbInvLog) {
      body.hkMbInvLog = filterArrAfterCloseDay(cache.mbInvLog, closeAt);
    }
    if (pendingPush.hkMbCheckLog && dirty.hkMbCheckLog) {
      body.hkMbCheckLog = filterArrAfterCloseDay(cache.mbCheckLog, closeAt);
    }
    if (pendingPush.hkFrontChat && dirty.hkFrontChat) {
      body.hkFrontChat = cache.frontChat;
    }
    if (pendingPush.hkTeamChat && dirty.hkTeamChat) {
      body.hkTeamChat = cache.teamChat;
    }
    if (pendingPush.hkAdminInquiries && dirty.hkAdminInquiries) {
      body.hkAdminInquiries = cache.adminInquiries;
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
        // POST는 보낸 필드만 echo 하므로 여기서 version을 올리면
        // 그 사이 올라온 루밍 XML 등을 since 폴링이 건너뛴다.
        if (data && data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
        if (data && data.payload) {
          applyPostEchoPayload(data.payload, data.partVersions, data.version);
        }
        return data;
      })
      .catch(function () {
        return false;
      });
  }

  /** POST 응답에 실려 온 서버 merge 결과를 로컬에 적용 */
  function applyPostEchoPayload(payload, partVersions, version) {
    if (!payload || typeof payload !== "object") return;
    var changed = [];
    isApplyingRemote = true;
    try {
      if (Array.isArray(payload.hkAdminInquiries)) {
        cache.adminInquiries = payload.hkAdminInquiries.slice();
        writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
        changed.push("hkAdminInquiries");
      }
      if (Array.isArray(payload.hkRequestLog)) {
        cache.requestLog = mergeRequestLogEntries(cache.requestLog, payload.hkRequestLog);
        writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
        changed.push("hkRequestLog");
      }
      if (Array.isArray(payload.hkOrderLog)) {
        cache.orderLog = mergeOrderLogsLocal(cache.orderLog, payload.hkOrderLog);
        writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
        changed.push("hkOrderLog");
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
        cache.frontChat = mergeOrderChats(cache.frontChat, payload.hkFrontChat);
        if (cache.frontChat.length > 300) cache.frontChat = cache.frontChat.slice(-300);
        writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
        changed.push("hkFrontChat");
      }
      if (Array.isArray(payload.hkTeamChat)) {
        cache.teamChat = mergeOrderChats(cache.teamChat, payload.hkTeamChat);
        if (cache.teamChat.length > 300) cache.teamChat = cache.teamChat.slice(-300);
        writeJsonArray(TEAM_CHAT_KEY, cache.teamChat);
        changed.push("hkTeamChat");
      }
    } finally {
      isApplyingRemote = false;
    }
    markAppliedPartsFromPayload(payload, partVersions, version, true);
    if (changed.length) emitChange(changed, payload);
  }

  /** 버전 동일해도 서버에 있는 1:1 알럿이 로컬에 빠지지 않게 병합 */
  function reconcileStaffBroadcastsFromRemote(payload) {
    if (!payload || !payload.hkStorage || !global.HKStorage) return false;
    if (typeof global.HKStorage.mergeStaffBroadcasts !== "function") return false;
    var remotePack = payload.hkStorage.staffBroadcasts;
    if (!remotePack || typeof remotePack !== "object") return false;
    try {
      var data = global.HKStorage.load();
      var prev = JSON.stringify((data && data.staffBroadcasts) || {});
      var merged = global.HKStorage.mergeStaffBroadcasts(
        data && data.staffBroadcasts,
        remotePack
      );
      if (JSON.stringify(merged) === prev) return false;
      data.staffBroadcasts = merged;
      global.localStorage.setItem(global.HKStorage.key, JSON.stringify(data));
      return true;
    } catch (eReconBc) {
      return false;
    }
  }
  function reconcileAdminInquiriesFromRemote(remoteList) {
    if (!Array.isArray(remoteList)) return false;
    var merged = mergeAdminInquiriesLocal(cache.adminInquiries, remoteList);
    var beforeSig = "";
    var afterSig = "";
    try {
      beforeSig = JSON.stringify(cache.adminInquiries || []);
      afterSig = JSON.stringify(merged || []);
    } catch (e) {
      beforeSig = String((cache.adminInquiries && cache.adminInquiries.length) || 0);
      afterSig = String((merged && merged.length) || 0);
    }
    if (beforeSig === afterSig) return false;
    cache.adminInquiries = merged;
    writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
    return true;
  }

  function postPayload(body) {
    if (!body || !Object.keys(body).length) return Promise.resolve(false);
    return enqueuePushTask(function () {
      return postPayloadNow(body);
    });
  }

  function runScheduledFlush() {
    var body = buildPushBody();
    var sentVersions = {};
    if (pendingLastRoomChange) {
      body.hkLastRoomChange = pendingLastRoomChange;
      pendingLastRoomChange = null;
    }
    var keys = Object.keys(body);
    if (!keys.length) {
      pendingPush = {};
      return Promise.resolve(false);
    }
    keys.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(dirtyVersion, key)) {
        sentVersions[key] = dirtyVersion[key] || 0;
      }
    });
    var sentLastRoomChange = body.hkLastRoomChange || null;
    pendingPush = {};
    return postPayloadNow(body).then(function (data) {
      if (data && data.version != null) {
        keys.forEach(function (key) {
          if (
            Object.prototype.hasOwnProperty.call(dirtyVersion, key) &&
            (dirtyVersion[key] || 0) === sentVersions[key]
          ) {
            clearDirty(key);
          } else if (Object.prototype.hasOwnProperty.call(dirty, key)) {
            pendingPush[key] = true;
          }
        });
      } else {
        keys.forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(dirty, key)) pendingPush[key] = true;
        });
        if (sentLastRoomChange && !pendingLastRoomChange) {
          pendingLastRoomChange = sentLastRoomChange;
        }
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
    if (!global.HKStorage) return Promise.resolve(false);
    markDirty("hkStorage");
    pendingPush.hkStorage = true;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (isApplyingRemote) return Promise.resolve(true);
    return queueScheduledFlush();
  }

  function applyRemotePayload(payload, meta) {
    if (!payload || typeof payload !== "object") return;
    meta = meta || {};
    lastServerPayload = Object.assign({}, lastServerPayload || {}, payload);
    var changed = [];
    var prevCloseDayAt = "";
    try {
      prevCloseDayAt = global.localStorage.getItem(CLOSE_DAY_KEY) || "";
    } catch (e) {}
    var localStorageCdEarly = "";
    try {
      if (global.HKStorage && typeof global.HKStorage.load === "function") {
        var localEarly = global.HKStorage.load();
        localStorageCdEarly =
          localEarly && localEarly.closeDayAt != null
            ? String(localEarly.closeDayAt).trim()
            : "";
      }
    } catch (eEarlyCd) {}
    var payloadCloseAt =
      (payload.hkCloseDayAt && String(payload.hkCloseDayAt).trim()) ||
      (payload.hkStorage && payload.hkStorage.closeDayAt
        ? String(payload.hkStorage.closeDayAt).trim()
        : "") ||
      (meta.closeDayAt ? String(meta.closeDayAt).trim() : "") ||
      "";
    if (payloadCloseAt && String(payloadCloseAt) !== String(payload.hkCloseDayAt || "")) {
      payload = Object.assign({}, payload, { hkCloseDayAt: payloadCloseAt });
    }
    var localCloseAt =
      prevCloseDayAt && localStorageCdEarly
        ? String(prevCloseDayAt) >= String(localStorageCdEarly)
          ? String(prevCloseDayAt)
          : String(localStorageCdEarly)
        : String(prevCloseDayAt || localStorageCdEarly || "");
    isApplyingRemote = true;
    try {
    var isCloseDayReplace = payload.hkCloseDayReset === true || meta.forceCloseDay === true;
    var isNewCloseDay =
      !!payloadCloseAt && String(payloadCloseAt) > String(localCloseAt || "");
    var remoteStorageCdEarly =
      payload.hkStorage && payload.hkStorage.closeDayAt != null
        ? String(payload.hkStorage.closeDayAt).trim()
        : "";
    var storageEpochNewerEarly =
      !!remoteStorageCdEarly &&
      (!localStorageCdEarly || String(remoteStorageCdEarly) > String(localStorageCdEarly));
    // 웹앱이 꺼져 있던 PC·증분 폴링에서도 새 마감이면 당일 캐시를 비움
    var clearLocalSignal =
      isNewCloseDay ||
      isCloseDayReplace ||
      storageEpochNewerEarly ||
      (payload.hkClearLocalCaches === true && isNewCloseDay);

    if (clearLocalSignal) {
      // 마감/초기화: dirty·대기 푸시 취소 후 당일 캐시 비움 (전날 데이터 재푸시 방지)
      clearDayLocalCachesOnCloseDay(payload);
      if (changed.indexOf("hkClearLocalCaches") < 0) {
        changed.push("hkClearLocalCaches");
      }
      if (changed.indexOf("hkCloseDayAt") < 0) changed.push("hkCloseDayAt");
      if (changed.indexOf("hkRequestLog") < 0) changed.push("hkRequestLog");
      if (changed.indexOf("hkOrderLog") < 0) changed.push("hkOrderLog");
      if (changed.indexOf("hkMbInvLog") < 0) changed.push("hkMbInvLog");
      if (changed.indexOf("hkMbCheckLog") < 0) changed.push("hkMbCheckLog");
      if (changed.indexOf("hkCancelLog") < 0) changed.push("hkCancelLog");
      if (changed.indexOf("hkUseLog") < 0) changed.push("hkUseLog");
      if (changed.indexOf("hkChangeLog") < 0) changed.push("hkChangeLog");
    }

    if (payload.hkCloseDayAt) {
      applyCloseDayMarker(payload);
      if (String(payload.hkCloseDayAt) !== prevCloseDayAt) {
        if (changed.indexOf("hkCloseDayAt") < 0) changed.push("hkCloseDayAt");
      }
    }

    if (payload.hkStorage && global.HKStorage) {
      var remoteStorageCd =
        payload.hkStorage.closeDayAt != null
          ? String(payload.hkStorage.closeDayAt).trim()
          : "";
      var localStorageCd = "";
      try {
        var localData = global.HKStorage.load();
        localStorageCd =
          localData && localData.closeDayAt != null
            ? String(localData.closeDayAt).trim()
            : "";
      } catch (eLocalCd) {}
      var storageEpochNewer =
        !!remoteStorageCd &&
        (!localStorageCd || String(remoteStorageCd) > String(localStorageCd));
      var sameCloseEpoch =
        !!remoteStorageCd &&
        !!localStorageCd &&
        String(remoteStorageCd) === String(localStorageCd);
      // 마감 직후 같은 closeDayAt 인데 로컬에 미전송 특이객실 등록이 있으면
      // 서버에 남은 hkCloseDayReset 빈 저장소로 덮어쓰지 않는다.
      // (새 마감/클리어 신호는 예외 — 항상 교체)
      var skipStaleCloseDayClobber =
        !clearLocalSignal &&
        !!dirty.hkStorage &&
        sameCloseEpoch &&
        !isNewCloseDay &&
        !storageEpochNewer;
      // 로컬 미전송 변경이 있으면 원격으로 덮어쓰지 않음 — 단, 새 마감/더 최신 closeDay는 강제 반영
      if (
        !skipStaleCloseDayClobber &&
        (isCloseDayReplace ||
          isNewCloseDay ||
          clearLocalSignal ||
          storageEpochNewer ||
          !dirty.hkStorage)
      ) {
        if (
          (isCloseDayReplace || isNewCloseDay || clearLocalSignal || storageEpochNewer) &&
          typeof global.HKStorage.replaceRemote === "function"
        ) {
          global.HKStorage.replaceRemote(payload.hkStorage);
        } else {
          global.HKStorage.applyRemote(payload.hkStorage);
        }
        changed.push("hkStorage");
        clearDirty("hkStorage");
      } else if (dirty.hkStorage && payload.hkStorage) {
        // 다른 필드 dirty여도 알럿·투표·임베드 초기화는 원격과 합친다
        try {
          var localPartial = global.HKStorage.load();
          var wrotePartial = false;
          if (
            payload.hkStorage.frontEmbedStates &&
            typeof global.HKStorage.mergeFrontEmbedStates === "function"
          ) {
            var prevEmbed = JSON.stringify(
              (localPartial && localPartial.frontEmbedStates) || {}
            );
            var mergedEmbed = global.HKStorage.mergeFrontEmbedStates(
              localPartial.frontEmbedStates,
              payload.hkStorage.frontEmbedStates
            );
            if (JSON.stringify(mergedEmbed) !== prevEmbed) {
              localPartial.frontEmbedStates = mergedEmbed;
              wrotePartial = true;
              changed.push("frontEmbedStates");
            }
          }
          if (
            Object.prototype.hasOwnProperty.call(payload.hkStorage, "staffBroadcasts") &&
            typeof global.HKStorage.mergeStaffBroadcasts === "function"
          ) {
            var prevBroadcast = JSON.stringify(
              (localPartial && localPartial.staffBroadcasts) || {}
            );
            var mergedBroadcast = global.HKStorage.mergeStaffBroadcasts(
              localPartial.staffBroadcasts,
              payload.hkStorage.staffBroadcasts
            );
            if (JSON.stringify(mergedBroadcast) !== prevBroadcast) {
              localPartial.staffBroadcasts = mergedBroadcast;
              wrotePartial = true;
              changed.push("staffBroadcasts");
            }
          }
          if (wrotePartial) {
            global.localStorage.setItem(
              global.HKStorage.key,
              JSON.stringify(localPartial)
            );
            changed.push("hkStorage");
          }
        } catch (ePartialMerge) {}
      }
    }
    if (Array.isArray(payload.hkRequestLog)) {
      var closeResetReq =
        clearLocalSignal ||
        isNewCloseDay ||
        (!!payload.hkCloseDayAt &&
          String(payload.hkCloseDayAt) !== String(prevCloseDayAt || ""));
      if (closeResetReq || (!dirty.hkRequestLog && payload.hkRequestLog.length === 0)) {
        // 마감·빈 요청로그: 병합하지 않고 교체 (옛 정비등록 되살림 방지)
        cache.requestLog = payload.hkRequestLog.slice();
        writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
        clearDirty("hkRequestLog");
        changed.push("hkRequestLog");
      } else if (!dirty.hkRequestLog) {
        cache.requestLog = mergeRequestLogEntries(cache.requestLog, payload.hkRequestLog);
        cache.requestLog = filterArrAfterCloseDay(
          cache.requestLog,
          payload.hkCloseDayAt || getCloseDayAtLocal()
        );
        writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
        changed.push("hkRequestLog");
        clearDirty("hkRequestLog");
      } else {
        // dirty여도 원격에만 있는 새 요청은 합치고, 로컬이 더 최신이면 유지
        cache.requestLog = mergeRequestLogEntries(cache.requestLog, payload.hkRequestLog);
        cache.requestLog = filterArrAfterCloseDay(
          cache.requestLog,
          payload.hkCloseDayAt || getCloseDayAtLocal()
        );
        writeJsonArray(REQUEST_LOG_KEY, cache.requestLog);
        changed.push("hkRequestLog");
      }
    }
    if (Array.isArray(payload.hkCancelLog) && (!dirty.hkCancelLog || clearLocalSignal)) {
      cache.cancelLog = payload.hkCancelLog.slice();
      writeJsonArray(REQUEST_CANCEL_NAME_LOG_KEY, cache.cancelLog);
      changed.push("hkCancelLog");
      clearDirty("hkCancelLog");
    }
    if (Array.isArray(payload.hkUseLog) && (!dirty.hkUseLog || clearLocalSignal)) {
      cache.useLog = payload.hkUseLog.slice();
      writeJsonArray(REQUEST_USE_LOG_KEY, cache.useLog);
      changed.push("hkUseLog");
      clearDirty("hkUseLog");
    }
    if (Array.isArray(payload.hkChangeLog) && (!dirty.hkChangeLog || clearLocalSignal)) {
      cache.changeLog = payload.hkChangeLog.slice();
      writeJsonArray(CHANGE_LOG_KEY, cache.changeLog);
      changed.push("hkChangeLog");
      clearDirty("hkChangeLog");
    }
    if (Array.isArray(payload.hkOrderLog)) {
      if (clearLocalSignal) {
        cache.orderLog = payload.hkOrderLog.slice();
        clearDirty("hkOrderLog");
        delete pendingPush.hkOrderLog;
      } else if (dirty.hkOrderLog) {
        cache.orderLog = mergeOrderLogsLocal(cache.orderLog, payload.hkOrderLog);
        pendingPush.hkOrderLog = true;
      } else {
        cache.orderLog = payload.hkOrderLog.slice();
        clearDirty("hkOrderLog");
      }
      cache.orderLog = filterOrdersAfterCloseDay(
        cache.orderLog,
        payload.hkCloseDayAt || getCloseDayAtLocal()
      );
      writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
      changed.push("hkOrderLog");
    }
    if (Array.isArray(payload.hkMbInvLog) && (!dirty.hkMbInvLog || clearLocalSignal)) {
      cache.mbInvLog = payload.hkMbInvLog.slice();
      writeJsonArray(MB_INV_LOG_KEY, cache.mbInvLog);
      changed.push("hkMbInvLog");
      clearDirty("hkMbInvLog");
    }
    if (Array.isArray(payload.hkMbCheckLog) && (!dirty.hkMbCheckLog || clearLocalSignal)) {
      cache.mbCheckLog = payload.hkMbCheckLog.slice();
      writeJsonArray(MB_CHECK_LOG_KEY, cache.mbCheckLog);
      changed.push("hkMbCheckLog");
      clearDirty("hkMbCheckLog");
    }
    if (Array.isArray(payload.hkFrontChat) && !dirty.hkFrontChat) {
      cache.frontChat = mergeOrderChats(cache.frontChat, payload.hkFrontChat);
      if (cache.frontChat.length > 300) cache.frontChat = cache.frontChat.slice(-300);
      writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      changed.push("hkFrontChat");
      clearDirty("hkFrontChat");
    }
    if (Array.isArray(payload.hkTeamChat) && !dirty.hkTeamChat) {
      cache.teamChat = mergeOrderChats(cache.teamChat, payload.hkTeamChat);
      if (cache.teamChat.length > 300) cache.teamChat = cache.teamChat.slice(-300);
      writeJsonArray(TEAM_CHAT_KEY, cache.teamChat);
      changed.push("hkTeamChat");
      clearDirty("hkTeamChat");
    }
    // 레거시 front→team 복사는 하지 않음 (두 채팅 완전 분리)
    if (Array.isArray(payload.hkAdminInquiries)) {
      if (dirty.hkAdminInquiries) {
        // 로컬에 미전송 문의/답변이 있으면 서버와 병합 (답변 유실 방지)
        cache.adminInquiries = mergeAdminInquiriesLocal(
          cache.adminInquiries,
          payload.hkAdminInquiries
        );
      } else {
        cache.adminInquiries = payload.hkAdminInquiries.slice();
        clearDirty("hkAdminInquiries");
      }
      writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
      changed.push("hkAdminInquiries");
    }
    if (Object.prototype.hasOwnProperty.call(payload, "hkLastRoomChange")) {
      changed.push("hkLastRoomChange");
    }

    mergeXmlSyncCache(payload);
    xmlChangedKeys(payload).forEach(function (k) {
      if (changed.indexOf(k) < 0) changed.push(k);
    });
    } finally {
      isApplyingRemote = false;
    }
    markAppliedPartsFromPayload(payload, meta.partVersions, meta.version, meta.partial);
    if (hasPendingPushWork()) queueScheduledFlush();
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
      "hkTeamChat",
      "hkAdminInquiries",
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
          hkTeamChat: cache.teamChat.slice(),
          hkAdminInquiries: cache.adminInquiries.slice(),
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

  function applyPresenceAlive(sids) {
    var alive = {};
    (Array.isArray(sids) ? sids : []).forEach(function (sid) {
      var id = String(sid || "").trim();
      if (id) alive[id] = true;
    });
    if (!lastServerPayload) lastServerPayload = {};
    if (!lastServerPayload.hkStorage) lastServerPayload.hkStorage = {};
    var prev = lastServerPayload.hkStorage.staffBroadcasts;
    if (!prev || typeof prev !== "object") prev = {};
    var prevMap = prev.presence && typeof prev.presence === "object" ? prev.presence : {};
    var nextMap = {};
    var now = new Date().toISOString();
    Object.keys(alive).forEach(function (sid) {
      var row = prevMap[sid];
      if (!row || typeof row !== "object") return;
      nextMap[sid] = Object.assign({}, row, { at: now });
    });
    lastServerPayload.hkStorage.staffBroadcasts = Object.assign({}, prev, {
      presence: nextMap,
    });
    return true;
  }

  function applyPresenceFromSyncResponse(data) {
    if (!data || typeof data !== "object") return false;
    if (data.presenceIdent) lastPresenceIdent = String(data.presenceIdent);
    if (data.staffPresence) return applyStaffPresenceFromSync(data);
    if (Array.isArray(data.presenceAlive)) return applyPresenceAlive(data.presenceAlive);
    return false;
  }

  function applyStaffPresenceFromSync(data) {
    var sp = data && data.staffPresence;
    if (!sp || typeof sp !== "object") return false;
    if (!lastServerPayload) lastServerPayload = {};
    if (!lastServerPayload.hkStorage) lastServerPayload.hkStorage = {};
    var prev = lastServerPayload.hkStorage.staffBroadcasts;
    if (!prev || typeof prev !== "object") prev = {};
    var next = Object.assign({}, prev);
    if (sp.presence && typeof sp.presence === "object") next.presence = sp.presence;
    if (sp.presenceKicks && typeof sp.presenceKicks === "object") {
      next.presenceKicks = sp.presenceKicks;
    }
    lastServerPayload.hkStorage.staffBroadcasts = next;
    return true;
  }

  function pushPresence(opts) {
    opts = opts || {};
    var sid = String(opts.sid || "").trim();
    if (!sid) return Promise.resolve(false);
    var body = { sid: sid };
    if (opts.leave) {
      body.leave = true;
    } else {
      if (opts.name) body.name = String(opts.name);
      if (opts.at) body.at = String(opts.at);
      if (opts.kick) body.kick = true;
      if (opts.claim) body.claim = true;
      if (opts.claimAt) body.claimAt = String(opts.claimAt);
      if (opts.front === true) body.front = true;
      else if (opts.front === false) body.front = false;
      if (opts.room === true) body.room = true;
      else if (opts.room === false) body.room = false;
    }
    return fetch("/api/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Password": getSyncPassword(),
      },
      keepalive: true,
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (data && data.staffPresence) applyStaffPresenceFromSync(data);
        return !!data;
      })
      .catch(function () {
        return false;
      });
  }

  function pull(isPoll, opts) {
    opts = opts || {};
    var headers = {
      "X-Sync-Password": getSyncPassword(),
      "Cache-Control": "no-cache",
    };
    var url = "/api/sync?scope=hk";
    var sinceOverride = opts.since;
    var sendSince =
      !opts.full &&
      (sinceOverride != null || (syncVersion > 0 && (isPoll || hasLocalHkHydration())));
    if (sendSince) {
      var sinceVal = sinceOverride != null ? sinceOverride : syncVersion;
      headers["X-Sync-Version"] = String(sinceVal);
      url += "&since=" + encodeURIComponent(String(sinceVal));
    }
    if (lastPresenceIdent) {
      url += "&presenceIdent=" + encodeURIComponent(lastPresenceIdent);
    }
    return fetch(url, {
      headers: headers,
      cache: "no-store",
    })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data) return false;
        applyPresenceFromSyncResponse(data);
        var remoteCloseAt = pickCloseDayAtFromData(data);
        var missedCloseDay =
          !!remoteCloseAt && String(remoteCloseAt) > String(localCloseDayAtCombined() || "");
        if (missedCloseDay && !opts.full) {
          var hasCloseStorage =
            data.payload &&
            data.payload.hkStorage &&
            typeof data.payload.hkStorage === "object";
          if (!hasCloseStorage) {
            return pullFullForCloseDay();
          }
        }
        function catchUpIfNeeded() {
          if (opts.catchUp) return Promise.resolve(true);
          var sinceMissed = missedPartsSince(data.partVersions);
          if (sinceMissed == null) return Promise.resolve(true);
          if (catchUpPull) return catchUpPull;
          catchUpPull = pull(isPoll, { since: sinceMissed, catchUp: true }).finally(function () {
            catchUpPull = null;
          });
          return catchUpPull;
        }
        function catchUpCloseDayIfNeeded() {
          if (!missedCloseDay || opts.full) return Promise.resolve(true);
          var hasStorage =
            data.payload &&
            data.payload.hkStorage &&
            typeof data.payload.hkStorage === "object";
          if (hasStorage) return Promise.resolve(true);
          return pullFullForCloseDay();
        }
        if (data.unchanged) {
          if (data.version != null) saveSyncVersion(data.version);
          if (data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
          return catchUpCloseDayIfNeeded().then(function () {
            return catchUpIfNeeded();
          });
        }
        if (!data.payload) {
          if (data.version != null && data.version < syncVersion) {
            saveSyncVersion(data.version);
            if (data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
          }
          if (!isPoll) {
            loadCachesFromLocal();
            emitLocalCacheHydrate();
          }
          return catchUpCloseDayIfNeeded().then(function () {
            return catchUpIfNeeded().then(function () {
              return false;
            });
          });
        }
        var forceFullApply =
          (!isPoll && !data.partial && !sendSince) || !!opts.catchUp || missedCloseDay;
        if (shouldApplyRemoteSync(data) || forceFullApply) {
          if (data.version != null) saveSyncVersion(data.version);
          if (data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
          applyRemotePayload(data.payload, {
            partVersions: data.partVersions,
            version: data.version,
            partial: !!data.partial,
            closeDayAt: remoteCloseAt,
            forceCloseDay: missedCloseDay,
          });
          applyPresenceFromSyncResponse(data);
          return catchUpCloseDayIfNeeded().then(function () {
            return catchUpIfNeeded();
          });
        }
        lastServerPayload = Object.assign({}, lastServerPayload || {}, data.payload);
        var reconChanged = [];
        if (reconcileStaffBroadcastsFromRemote(data.payload)) {
          reconChanged.push("staffBroadcasts");
          reconChanged.push("hkStorage");
        }
        if (reconcileAdminInquiriesFromRemote(data.payload.hkAdminInquiries)) {
          reconChanged.push("hkAdminInquiries");
        }
        if (reconChanged.length) {
          emitChange(reconChanged, Object.assign({}, data.payload));
        }
        applyPresenceFromSyncResponse(data);
        return catchUpCloseDayIfNeeded().then(function () {
          return catchUpIfNeeded();
        });
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
    loadAppliedPartVersions();
    loadCachesFromLocal();
    var pullPromise = pull(false);
    if (!pollTimer) {
      pollTimer = setInterval(function () {
        pull(true);
      }, 3000);
    }
    return pullPromise.then(function () {
      // pull 직후 localStorage로 다시 덮지 않음 — 쓰기 실패/빈 캐시가 서버 반영을 지울 수 있음
      emitLocalCacheHydrate();
    });
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  loadSyncVersionFromLocal();
  loadAppliedPartVersions();
  loadCachesFromLocal();

  global.HKSync = {
    start: startPolling,
    stop: stopPolling,
    onChange: onChange,
    pull: pull,
    hydrateFromLocal: hydrateFromLocal,
    getSyncPassword: getSyncPassword,
    mergeOrderChats: mergeOrderChats,
    clearLocalCaches: clearLocalCaches,
    clearDayLocalCachesOnCloseDay: clearDayLocalCachesOnCloseDay,
    getCloseDayAt: getCloseDayAtLocal,
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
      return cache.orderLog.slice();
    },
    setOrderLog: function (entries) {
      cache.orderLog = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(ORDER_LOG_KEY, cache.orderLog);
      markDirty("hkOrderLog");
      schedulePush({ hkOrderLog: true });
    },
    pushPayloadFields: function (fields) {
      if (!fields || typeof fields !== "object") return Promise.resolve(false);
      return postPayloadNow(fields);
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
      return cache.frontChat.slice();
    },
    appendFrontChatMessage: function (entry) {
      if (!entry || typeof entry !== "object") return;
      entry.channel = "front";
      cache.frontChat.push(entry);
      if (cache.frontChat.length > 300) {
        cache.frontChat = cache.frontChat.slice(-300);
      }
      writeJsonArray(FRONT_CHAT_KEY, cache.frontChat);
      markDirty("hkFrontChat");
      schedulePush({ hkFrontChat: true });
      emitChange(["hkFrontChat"], { hkFrontChat: cache.frontChat.slice() });
    },
    setFrontChat: function (entries) {
      cache.frontChat = Array.isArray(entries)
        ? entries.map(function (m) {
            if (m && typeof m === "object") m.channel = "front";
            return m;
          }).slice(-300)
        : [];
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
    getTeamChat: function () {
      return cache.teamChat.slice();
    },
    appendTeamChatMessage: function (entry) {
      if (!entry || typeof entry !== "object") return;
      entry.channel = "team";
      cache.teamChat.push(entry);
      if (cache.teamChat.length > 300) {
        cache.teamChat = cache.teamChat.slice(-300);
      }
      writeJsonArray(TEAM_CHAT_KEY, cache.teamChat);
      markDirty("hkTeamChat");
      schedulePush({ hkTeamChat: true });
      emitChange(["hkTeamChat"], { hkTeamChat: cache.teamChat.slice() });
    },
    setTeamChat: function (entries) {
      cache.teamChat = Array.isArray(entries)
        ? entries.map(function (m) {
            if (m && typeof m === "object") m.channel = "team";
            return m;
          }).slice(-300)
        : [];
      writeJsonArray(TEAM_CHAT_KEY, cache.teamChat);
      markDirty("hkTeamChat");
      schedulePush({ hkTeamChat: true });
    },
    clearTeamChat: function () {
      cache.teamChat = [];
      writeJsonArray(TEAM_CHAT_KEY, []);
      markDirty("hkTeamChat");
      schedulePush({ hkTeamChat: true });
    },
    getAdminInquiries: function () {
      return cache.adminInquiries;
    },
    appendAdminInquiry: function (entry) {
      if (!entry || typeof entry !== "object") return;
      cache.adminInquiries.unshift(entry);
      if (cache.adminInquiries.length > 200) {
        cache.adminInquiries.length = 200;
      }
      writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
      markDirty("hkAdminInquiries");
      schedulePush({ hkAdminInquiries: true });
    },
    updateAdminInquiry: function (id, patch) {
      if (!id || !patch || typeof patch !== "object") return false;
      var found = false;
      for (var i = 0; i < cache.adminInquiries.length; i++) {
        if (cache.adminInquiries[i] && cache.adminInquiries[i].id === id) {
          cache.adminInquiries[i] = Object.assign({}, cache.adminInquiries[i], patch);
          found = true;
          break;
        }
      }
      if (!found) return false;
      writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
      markDirty("hkAdminInquiries");
      schedulePush({ hkAdminInquiries: true });
      // 답변은 바로 올려서 다른 PC에서 덮어쓰이지 않게 함
      if (pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
      }
      queueScheduledFlush();
      return true;
    },
    setAdminInquiries: function (entries) {
      cache.adminInquiries = Array.isArray(entries) ? entries.slice() : [];
      writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
      markDirty("hkAdminInquiries");
      schedulePush({ hkAdminInquiries: true });
    },
    deleteAdminInquiry: function (id) {
      if (!id) return false;
      var next = [];
      var removed = false;
      cache.adminInquiries.forEach(function (entry) {
        if (entry && entry.id === id) {
          removed = true;
          return;
        }
        next.push(entry);
      });
      if (!removed) return false;
      cache.adminInquiries = next;
      writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
      markDirty("hkAdminInquiries");
      schedulePush({ hkAdminInquiries: true });
      return true;
    },
    pushSnapshot: function (payload) {
      if (!payload || typeof payload !== "object") return Promise.resolve(false);
      if (!payload.hkCloseDayAt) {
        payload = Object.assign({}, payload, {
          hkCloseDayAt: new Date().toISOString(),
        });
      }
      if (payload.hkCloseDayReset !== true) {
        payload = Object.assign({}, payload, { hkCloseDayReset: true });
      }
      if (payload.hkClearLocalCaches !== true) {
        payload = Object.assign({}, payload, { hkClearLocalCaches: true });
      }
      if (payload.hkStorage && global.HKStorage) {
        if (typeof global.HKStorage.replaceRemote === "function") {
          global.HKStorage.replaceRemote(payload.hkStorage);
        } else {
          global.HKStorage.applyRemote(payload.hkStorage);
        }
      }
      clearDayLocalCachesOnCloseDay(payload);
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
      if (Array.isArray(payload.hkTeamChat)) {
        cache.teamChat = payload.hkTeamChat.slice();
        writeJsonArray(TEAM_CHAT_KEY, cache.teamChat);
      }
      if (Array.isArray(payload.hkAdminInquiries)) {
        cache.adminInquiries = payload.hkAdminInquiries.slice();
        writeJsonArray(ADMIN_INQUIRY_KEY, cache.adminInquiries);
      }
      applyCloseDayMarker(payload);
      clearAllDirty();
      pendingPush = {};
      return postPayload(payload).then(function (data) {
        if (data && data.version != null) saveSyncVersion(data.version);
        if (data && data.updatedAt) lastAppliedSyncUpdatedAt = data.updatedAt;
        var closeChanged = [
          "hkCloseDayAt",
          "hkClearLocalCaches",
          "hkStorage",
          "hkRequestLog",
        ];
        if (Array.isArray(payload.hkOrderLog)) closeChanged.push("hkOrderLog");
        if (Array.isArray(payload.hkMbInvLog)) closeChanged.push("hkMbInvLog");
        if (Array.isArray(payload.hkMbCheckLog)) closeChanged.push("hkMbCheckLog");
        if (Array.isArray(payload.hkAdminInquiries)) closeChanged.push("hkAdminInquiries");
        if (Array.isArray(payload.hkCancelLog)) closeChanged.push("hkCancelLog");
        if (Array.isArray(payload.hkUseLog)) closeChanged.push("hkUseLog");
        if (Array.isArray(payload.hkChangeLog)) closeChanged.push("hkChangeLog");
        emitChange(closeChanged, {
          hkCloseDayReset: true,
          hkClearLocalCaches: true,
          hkCloseDayAt: payload.hkCloseDayAt,
          hkRequestLog: cache.requestLog.slice(),
          hkOrderLog: cache.orderLog.slice(),
          hkMbInvLog: cache.mbInvLog.slice(),
          hkMbCheckLog: cache.mbCheckLog.slice(),
          hkCancelLog: cache.cancelLog.slice(),
          hkUseLog: cache.useLog.slice(),
          hkChangeLog: cache.changeLog.slice(),
          hkStorage: payload.hkStorage,
          hkAdminInquiries: Array.isArray(payload.hkAdminInquiries)
            ? payload.hkAdminInquiries.slice()
            : cache.adminInquiries.slice(),
        });
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
    pushPresence: pushPresence,
    flushPending: function () {
      if (pushTimer) {
        clearTimeout(pushTimer);
        pushTimer = null;
      }
      return queueScheduledFlush();
    },
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
        extendedStayUpdatedAt: clearedAt,
        uploadSummary: "",
        roomingUploadedAt: "",
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
            "roomingUploadedAt",
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
