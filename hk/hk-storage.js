/**
 * House Keeping 공지·구역별 객실 — localStorage + 서버 /api/sync (hk-sync.js)
 * 객실: { number, status, memo1, memo2, time? }
 * time: 메인「정비관리」에서만 입력 (24시간, 빈 문자면 미입력). 14:30·1400·1430 등
 * 키: lotte-hk-v1
 */
(function (global) {
  var STORAGE_KEY = "lotte-hk-v1";
  var STANDARD_ZONE_IDS = ["VIP", "RC", "CASINO", "MOBILE_CI", "AJ", "MINIBAR"];
  var STANDARD_ZONE_LABELS = {
    VIP: "VIP",
    RC: "R/C",
    CASINO: "CASINO",
    MOBILE_CI: "모바일체크인",
    AJ: "AJ객실",
    MINIBAR: "미니바",
  };

  function defaultRoom() {
    return {
      number: "",
      status: "",
      memo1: "",
      memo2: "",
      memo2Image: "",
      time: "",
      tray: "",
      trayUpdatedAt: "",
      createdAt: "",
      updatedAt: "",
      mbProductId: "",
      mbGroup: "",
    };
  }

  function parseIsoMs(iso) {
    if (!iso) return 0;
    var t = new Date(String(iso)).getTime();
    return isNaN(t) ? 0 : t;
  }

  /** closeDayAt 이후(동일 시각 포함)인지. 스탬프 없으면 false */
  function isAtOrAfterCloseDay(iso, closeDayAt) {
    var closeMs = parseIsoMs(closeDayAt);
    if (!closeMs) return true;
    var atMs = parseIsoMs(iso);
    if (!atMs) return false;
    return atMs >= closeMs;
  }

  function roomActivityAt(room) {
    if (!room || typeof room !== "object") return "";
    if (room.updatedAt != null && String(room.updatedAt).trim()) {
      return String(room.updatedAt).trim();
    }
    if (room.createdAt != null && String(room.createdAt).trim()) {
      return String(room.createdAt).trim();
    }
    return "";
  }

  /** 마감 이전·스탬프 없는 객실은 무시 (되살림 방지) */
  function isRoomAfterCloseDay(room, closeDayAt) {
    if (!closeDayAt) return true;
    return isAtOrAfterCloseDay(roomActivityAt(room), closeDayAt);
  }

  function stampRoom(room, atIso) {
    var r = room && typeof room === "object" ? room : defaultRoom();
    var stamp = atIso != null && String(atIso).trim() ? String(atIso).trim() : new Date().toISOString();
    if (!r.createdAt) r.createdAt = stamp;
    r.updatedAt = stamp;
    return r;
  }

  function filterLogEntriesAfterCloseDay(arr, closeDayAt) {
    if (!Array.isArray(arr)) return [];
    if (!closeDayAt) return arr.slice();
    return arr.filter(function (entry) {
      if (!entry || typeof entry !== "object") return false;
      var at = entry.updatedAt || entry.at || entry.createdAt || "";
      return isAtOrAfterCloseDay(at, closeDayAt);
    });
  }

  function filterRoomsObjectAfterCloseDay(rooms, closeDayAt, zoneIds) {
    var out = {};
    var src = rooms && typeof rooms === "object" ? rooms : {};
    var keys = Array.isArray(zoneIds) && zoneIds.length ? zoneIds : Object.keys(src);
    keys.forEach(function (zone) {
      var list = Array.isArray(src[zone]) ? src[zone] : [];
      out[zone] = list.filter(function (room) {
        return room && room.number && isRoomAfterCloseDay(room, closeDayAt);
      });
    });
    return out;
  }

  function defaultZoneMemo() {
    return { text: "", images: [] };
  }

  function normalizeZoneMemoImages(images) {
    var out = [];
    if (!Array.isArray(images)) return out;
    images.forEach(function (img) {
      var s = img != null ? String(img).trim() : "";
      if (s) out.push(s);
    });
    return out;
  }

  function normalizeZoneMemos(data) {
    var out = { VIP: defaultZoneMemo() };
    var src = data && data.zoneMemos && typeof data.zoneMemos === "object" ? data.zoneMemos : {};
    if (src.VIP && typeof src.VIP === "object") {
      out.VIP.text = src.VIP.text != null ? String(src.VIP.text) : "";
      out.VIP.images = normalizeZoneMemoImages(src.VIP.images);
    }
    return out;
  }

  function z2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function toHM(h, min) {
    if (isNaN(h) || isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) {
      return null;
    }
    return z2(h) + ":" + z2(min);
  }

  /**
   * 24시간 HH:MM
   * - 14:00, 14:30 (콜론)
   * - 1400, 1430 (숫자만 4자리 = HHMM)
   * - 930 → 09:30 (숫자만 3자리 = 0 + HMM)
   * @returns {{ ok: boolean, value: string }}
   */
  function parseTime24(input) {
    var s = String(input == null ? "" : input).trim();
    if (!s) return { ok: true, value: "" };
    s = s.replace(/\s+/g, "");

    var m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      var out = toHM(parseInt(m[1], 10), parseInt(m[2], 10));
      return out ? { ok: true, value: out } : { ok: false, value: "" };
    }

    if (!/^\d+$/.test(s)) return { ok: false, value: "" };

    if (s.length === 3) {
      s = "0" + s;
    }

    if (s.length === 4) {
      var hh = parseInt(s.slice(0, 2), 10);
      var mm = parseInt(s.slice(2, 4), 10);
      var out4 = toHM(hh, mm);
      return out4 ? { ok: true, value: out4 } : { ok: false, value: "" };
    }

    return { ok: false, value: "" };
  }

  function normalizeTimeField(t) {
    var p = parseTime24(t);
    return p.ok ? p.value : "";
  }

  function isStandardZone(zoneId) {
    return STANDARD_ZONE_IDS.indexOf(zoneId) >= 0;
  }

  function slugZoneLabel(label) {
    var s = String(label || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9가-힣]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!s) s = "GROUP";
    return "C_" + s.slice(0, 32);
  }

  function labelFromZoneId(zoneId) {
    var id = String(zoneId || "").trim();
    if (STANDARD_ZONE_LABELS[id]) return STANDARD_ZONE_LABELS[id];
    if (id.indexOf("C_") === 0) {
      var rest = id.slice(2).replace(/_/g, " ").trim();
      return rest || id;
    }
    return id;
  }

  function roomNumberKey(number) {
    var s = String(number == null ? "" : number).trim();
    if (!s) return "";
    if (/->/.test(s) || /에서/.test(s)) {
      return s.replace(/\s+/g, " ");
    }
    var d = s.replace(/\D/g, "");
    if (!d) return s;
    if (d.length <= 4) return d.length >= 4 ? d.slice(-4) : ("0000" + d).slice(-4);
    return d.slice(-4);
  }

  function markRoomDeletedInMap(deletedRooms, zone, roomNumber) {
    if (!deletedRooms || !zone) return;
    var k = roomNumberKey(roomNumber);
    if (!k) return;
    if (!deletedRooms[zone]) deletedRooms[zone] = [];
    var exists = deletedRooms[zone].some(function (n) {
      return roomNumberKey(n) === k;
    });
    if (!exists) deletedRooms[zone].push(k);
  }

  function isRoomMarkedDeleted(deletedRooms, zone, roomNumber) {
    var k = roomNumberKey(roomNumber);
    if (!k) return false;
    var list = deletedRooms && deletedRooms[zone];
    if (!Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      if (roomNumberKey(list[i]) === k) return true;
    }
    return false;
  }

  function normalizeDeletedRooms(data, customZones) {
    var out = {};
    STANDARD_ZONE_IDS.forEach(function (z) {
      out[z] = [];
    });
    (customZones || []).forEach(function (z) {
      if (z && z.id) out[z.id] = [];
    });
    var src = data && data.deletedRooms;
    if (!src || typeof src !== "object") return out;
    Object.keys(src).forEach(function (zone) {
      if (!Array.isArray(src[zone])) return;
      if (!out[zone]) out[zone] = [];
      src[zone].forEach(function (n) {
        markRoomDeletedInMap(out, zone, n);
      });
    });
    return out;
  }

  function mergeDeletedRoomsMaps(a, b) {
    var out = {};
    var zones = {};
    [a, b].forEach(function (src) {
      if (!src || typeof src !== "object") return;
      Object.keys(src).forEach(function (z) {
        zones[z] = true;
      });
    });
    Object.keys(zones).forEach(function (zone) {
      out[zone] = [];
      [a, b].forEach(function (src) {
        if (!src || !Array.isArray(src[zone])) return;
        src[zone].forEach(function (n) {
          markRoomDeletedInMap(out, zone, n);
        });
      });
    });
    return out;
  }

  function mergeRoomEntry(prev, incoming) {
    if (!incoming || !incoming.number) return prev;
    if (!prev || !prev.number) return incoming;
    var ti = incoming.tray != null ? String(incoming.tray).trim() : "";
    var tp = prev.tray != null ? String(prev.tray).trim() : "";
    var tiAt = incoming.trayUpdatedAt != null ? String(incoming.trayUpdatedAt) : "";
    var tpAt = prev.trayUpdatedAt != null ? String(prev.trayUpdatedAt) : "";
    if (ti === "deleted" || tp === "deleted") return null;
    var incomingTrayWins = tiAt && (!tpAt || tiAt >= tpAt);
    var tray = incomingTrayWins ? ti : tpAt ? tp : ti || tp || "";
    var trayUpdatedAt = incomingTrayWins ? tiAt : tpAt || tiAt || "";
    // Keep activity stamps — without them closeDay filter drops rooms (flicker)
    var createdAt = "";
    if (prev.createdAt && incoming.createdAt) {
      createdAt = String(prev.createdAt) <= String(incoming.createdAt) ? String(prev.createdAt) : String(incoming.createdAt);
    } else {
      createdAt = String(prev.createdAt || incoming.createdAt || "");
    }
    var updatedAt = "";
    if (prev.updatedAt && incoming.updatedAt) {
      updatedAt = String(prev.updatedAt) >= String(incoming.updatedAt) ? String(prev.updatedAt) : String(incoming.updatedAt);
    } else {
      updatedAt = String(incoming.updatedAt || prev.updatedAt || "");
    }
    return {
      number: incoming.number || prev.number,
      status: incoming.status != null ? String(incoming.status).trim() : prev.status,
      memo1: incoming.memo1 != null ? String(incoming.memo1) : prev.memo1,
      memo2: incoming.memo2 != null ? String(incoming.memo2) : prev.memo2,
      memo2Image:
        incoming.memo2Image != null ? String(incoming.memo2Image) : prev.memo2Image,
      time: incoming.time != null ? normalizeTimeField(incoming.time) : prev.time,
      tray: tray,
      trayUpdatedAt: trayUpdatedAt,
      createdAt: createdAt,
      updatedAt: updatedAt,
    };
  }

  function mergeRoomArraysByNumber(prevArr, incomingArr, zone, deletedRooms, incomingDeletedRooms) {
    var map = {};
    var incomingKeys = {};
    (incomingArr || []).forEach(function (room) {
      if (!room || !room.number) return;
      var k = roomNumberKey(room.number);
      if (k) incomingKeys[k] = true;
    });
    function incomingClaimsDeleted(k) {
      return isRoomMarkedDeleted(incomingDeletedRooms, zone, k);
    }
    function canReviveFromIncoming(k) {
      // 같은 페이로드에 객실이 있고, 그 페이로드의 deletedRooms에 없으면 재등록으로 본다
      return !!incomingKeys[k] && !incomingClaimsDeleted(k);
    }
    function ingest(room, fromIncoming) {
      if (!room || !room.number) return;
      var k = roomNumberKey(room.number);
      if (!k) return;
      var tray = room.tray != null ? String(room.tray).trim() : "";
      if (tray === "deleted") {
        markRoomDeletedInMap(deletedRooms, zone, k);
        delete map[k];
        return;
      }
      if (isRoomMarkedDeleted(deletedRooms, zone, k)) {
        if (fromIncoming && canReviveFromIncoming(k)) {
          if (deletedRooms && deletedRooms[zone]) {
            deletedRooms[zone] = deletedRooms[zone].filter(function (n) {
              return roomNumberKey(n) !== k;
            });
          }
        } else {
          // tombstone 유지 — 다른 PC의 잔존 배열로 삭제 객실이 되살아나지 않게 함
          return;
        }
      }
      var merged = map[k] ? mergeRoomEntry(map[k], room) : parseRoomEntry(room);
      if (!merged) {
        delete map[k];
        return;
      }
      map[k] = merged;
    }
    (prevArr || []).forEach(function (room) {
      ingest(room, false);
    });
    (incomingArr || []).forEach(function (room) {
      ingest(room, true);
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function parseRoomsArray(arr, zone, deletedRooms) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    arr.forEach(function (x) {
      var room = parseRoomEntry(x);
      if (!room.number.length) return;
      var tray = room.tray != null ? String(room.tray).trim() : "";
      if (tray === "deleted") {
        if (zone && deletedRooms) markRoomDeletedInMap(deletedRooms, zone, room.number);
        return;
      }
      if (zone && deletedRooms && isRoomMarkedDeleted(deletedRooms, zone, room.number)) {
        // 삭제 tombstone이 있으면 배열에 있어도 무시 (되살아남 방지)
        return;
      }
      out.push(room);
    });
    return out.sort(function (a, b) {
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });
  }

  function markRoomDeleted(data, zone, roomNumber) {
    if (!data) return;
    if (!data.deletedRooms) data.deletedRooms = {};
    markRoomDeletedInMap(data.deletedRooms, zone, roomNumber);
  }

  function unmarkRoomDeleted(data, zone, roomNumber) {
    if (!data || !data.deletedRooms || !data.deletedRooms[zone]) return;
    var k = roomNumberKey(roomNumber);
    data.deletedRooms[zone] = data.deletedRooms[zone].filter(function (n) {
      return roomNumberKey(n) !== k;
    });
  }

  function normalizeNoticeImages(data) {
    var images = [];
    if (data && Array.isArray(data.noticeImages)) {
      data.noticeImages.forEach(function (img) {
        var s = img != null ? String(img).trim() : "";
        if (s) images.push(s);
      });
    }
    if (!images.length && data && data.noticeImage != null) {
      var single = String(data.noticeImage).trim();
      if (single) images.push(single);
    }
    return images;
  }

  function normalizeMbInvNoticeImages(data) {
    var images = [];
    if (data && Array.isArray(data.mbInvNoticeImages)) {
      data.mbInvNoticeImages.forEach(function (img) {
        var s = img != null ? String(img).trim() : "";
        if (s) images.push(s);
      });
    }
    return images;
  }

  function normalizeNoticeUpdatedAt(data) {
    if (!data || data.noticeUpdatedAt == null) return "";
    return String(data.noticeUpdatedAt).trim();
  }

  function pickNoticeFields(base, incoming) {
    var baseObj = base && typeof base === "object" ? base : {};
    var incObj = incoming && typeof incoming === "object" ? incoming : {};
    var baseAt = normalizeNoticeUpdatedAt(baseObj);
    var incAt = normalizeNoticeUpdatedAt(incObj);
    var incHasText = Object.prototype.hasOwnProperty.call(incObj, "notice");
    var incHasImages =
      Object.prototype.hasOwnProperty.call(incObj, "noticeImages") ||
      Object.prototype.hasOwnProperty.call(incObj, "noticeImage");
    var incHasAt = Object.prototype.hasOwnProperty.call(incObj, "noticeUpdatedAt");
    var preferIncoming = true;
    if (baseAt && incAt && incAt < baseAt) preferIncoming = false;
    else if (baseAt && !incAt && (incHasText || incHasImages)) preferIncoming = false;
    else if (!incHasText && !incHasImages && !incHasAt) preferIncoming = false;
    if (!preferIncoming) {
      return {
        notice: baseObj.notice != null ? String(baseObj.notice) : "",
        noticeImages: normalizeNoticeImages(baseObj),
        noticeUpdatedAt: baseAt,
      };
    }
    var images = incHasImages ? normalizeNoticeImages(incObj) : normalizeNoticeImages(baseObj);
    return {
      notice: incHasText
        ? typeof incObj.notice === "string"
          ? incObj.notice
          : ""
        : baseObj.notice != null
          ? String(baseObj.notice)
          : "",
      noticeImages: images,
      noticeUpdatedAt: incAt || baseAt || "",
    };
  }

  function stampNotice(data) {
    if (!data || typeof data !== "object") return data;
    data.noticeUpdatedAt = new Date().toISOString();
    return data;
  }

  function normalizeMbInvNoticeUpdatedAt(data) {
    if (!data || data.mbInvNoticeUpdatedAt == null) return "";
    return String(data.mbInvNoticeUpdatedAt).trim();
  }

  function getInvenNotifyUpdatedAt(inv) {
    if (!inv || typeof inv !== "object") return "";
    if (inv.table && inv.table.updatedAt != null) {
      return String(inv.table.updatedAt).trim();
    }
    return inv.updatedAt != null ? String(inv.updatedAt).trim() : "";
  }

  function invenNotifyHasContent(inv) {
    if (!inv || typeof inv !== "object") return false;
    if (Array.isArray(inv.cards) && inv.cards.length > 0) return true;
    if (inv.table && Array.isArray(inv.table.rows) && inv.table.rows.length > 0) {
      return true;
    }
    return false;
  }

  /** 인벤 통보는 updatedAt이 더 최신인 쪽만 채택 (빈 표 초기화도 포함) */
  function pickInvenNotify(base, incoming) {
    var baseObj = base && typeof base === "object" ? base : {};
    var incObj = incoming && typeof incoming === "object" ? incoming : {};
    if (!Object.prototype.hasOwnProperty.call(incObj, "invenNotify")) {
      return baseObj.invenNotify != null ? baseObj.invenNotify : null;
    }
    var inc = incObj.invenNotify;
    var baseInv = baseObj.invenNotify;
    // 표가 없는(=아직 못 받은) 쪽이 null을 보내도 기존 표를 지우지 않는다.
    if (!inc || typeof inc !== "object") {
      return baseInv != null ? baseInv : null;
    }
    if (!baseInv || typeof baseInv !== "object") return inc;
    var baseAt = getInvenNotifyUpdatedAt(baseInv);
    var incAt = getInvenNotifyUpdatedAt(inc);
    // 내용 있는 표를 빈 표로 덮을 때는 반드시 더 최신 시각이어야 함 (동시각·역행 방지)
    if (invenNotifyHasContent(baseInv) && !invenNotifyHasContent(inc)) {
      if (!incAt || (baseAt && incAt <= baseAt)) return baseInv;
      return inc;
    }
    if (baseAt && incAt && incAt < baseAt) return baseInv;
    if (baseAt && !incAt) return baseInv;
    return inc;
  }

  /** 미니바(MB&인벤) 메모장은 최신 updatedAt 쪽을 채택 */
  function pickMbInvNoticeFields(base, incoming) {
    var baseObj = base && typeof base === "object" ? base : {};
    var incObj = incoming && typeof incoming === "object" ? incoming : {};
    var baseAt = normalizeMbInvNoticeUpdatedAt(baseObj);
    var incAt = normalizeMbInvNoticeUpdatedAt(incObj);
    var incHasText = Object.prototype.hasOwnProperty.call(incObj, "mbInvNotice");
    var incHasImages = Object.prototype.hasOwnProperty.call(incObj, "mbInvNoticeImages");
    var incHasAt = Object.prototype.hasOwnProperty.call(incObj, "mbInvNoticeUpdatedAt");
    var preferIncoming = true;
    if (baseAt && incAt && incAt < baseAt) {
      preferIncoming = false;
    } else if (baseAt && !incAt && (incHasText || incHasImages)) {
      // 타임스탬프 없는 옛 클라이언트가 최신 메모를 덮어쓰지 않도록
      preferIncoming = false;
    } else if (!incHasText && !incHasImages && !incHasAt) {
      preferIncoming = false;
    }
    if (!preferIncoming) {
      return {
        mbInvNotice: baseObj.mbInvNotice != null ? String(baseObj.mbInvNotice) : "",
        mbInvNoticeImages: normalizeMbInvNoticeImages(baseObj),
        mbInvNoticeUpdatedAt: baseAt,
      };
    }
    return {
      mbInvNotice: incHasText
        ? typeof incObj.mbInvNotice === "string"
          ? incObj.mbInvNotice
          : ""
        : baseObj.mbInvNotice != null
          ? String(baseObj.mbInvNotice)
          : "",
      mbInvNoticeImages: incHasImages
        ? normalizeMbInvNoticeImages(incObj)
        : normalizeMbInvNoticeImages(baseObj),
      mbInvNoticeUpdatedAt: incAt || baseAt || "",
    };
  }

  function stampMbInvNotice(data) {
    if (!data || typeof data !== "object") return data;
    data.mbInvNoticeUpdatedAt = new Date().toISOString();
    return data;
  }

  var DESK_CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  var DESK_CHAT_MAX_MESSAGES = 2000;

  function normalizeRequestDeskChat(raw) {
    if (!Array.isArray(raw)) return [];
    var cutoff = Date.now() - DESK_CHAT_RETENTION_MS;
    var out = [];
    raw.forEach(function (m) {
      if (!m || typeof m !== "object") return;
      var id = m.id != null ? String(m.id).trim() : "";
      if (!id) return;
      var at = m.at != null ? String(m.at) : "";
      var t = new Date(at || 0).getTime();
      if (!isNaN(t) && t > 0 && t < cutoff) return;
      var row = {
        id: id,
        at: at,
        by: m.by != null ? String(m.by) : "",
        text: m.text != null ? String(m.text) : "",
      };
      if (m.bold) row.bold = true;
      var fl = m.fontLevel != null ? parseInt(m.fontLevel, 10) : 0;
      if (fl >= 1 && fl <= 3) row.fontLevel = fl;
      if (m.reactions && typeof m.reactions === "object") {
        row.reactions = m.reactions;
      }
      if (m.updatedAt) row.updatedAt = String(m.updatedAt);
      out.push(row);
    });
    out.sort(function (a, b) {
      var ta = new Date(a.at || 0).getTime();
      var tb = new Date(b.at || 0).getTime();
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      return ta - tb;
    });
    if (out.length > DESK_CHAT_MAX_MESSAGES) out = out.slice(-DESK_CHAT_MAX_MESSAGES);
    return out;
  }

  function mergeRequestDeskChat(baseArr, incomingArr) {
    var map = {};
    function mergeReactions(a, b) {
      var out = {};
      [a, b].forEach(function (src) {
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
    normalizeRequestDeskChat(baseArr).forEach(function (m) {
      map[m.id] = m;
    });
    normalizeRequestDeskChat(incomingArr).forEach(function (m) {
      var prev = map[m.id];
      if (!prev) {
        map[m.id] = m;
        return;
      }
      var ta = new Date(prev.at || 0).getTime();
      var tb = new Date(m.at || 0).getTime();
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      var merged = tb >= ta ? Object.assign({}, prev, m) : Object.assign({}, m, prev);
      merged.reactions = mergeReactions(prev.reactions, m.reactions);
      if (!Object.keys(merged.reactions || {}).length) delete merged.reactions;
      map[m.id] = merged;
    });
    return normalizeRequestDeskChat(
      Object.keys(map).map(function (k) {
        return map[k];
      })
    );
  }

  function normalizeFrontEmbedStates(raw) {
    var out = { dd: null, inven: null, chichi: null };
    if (!raw || typeof raw !== "object") return out;
    ["dd", "inven", "chichi"].forEach(function (key) {
      var entry = raw[key];
      if (!entry || typeof entry !== "object") return;
      // __cleared 마커도 보관해 동기화 시 초기화가 유지되게 함
      out[key] = entry;
    });
    return out;
  }

  function isClearedFrontEmbedEntry(entry) {
    return !!(entry && typeof entry === "object" && entry.__cleared === true);
  }

  function frontEmbedClearId(entry) {
    if (!entry || typeof entry !== "object") return "";
    if (entry.clearId != null && String(entry.clearId).trim()) {
      return String(entry.clearId).trim();
    }
    if (isClearedFrontEmbedEntry(entry) && entry.updatedAt != null) {
      return String(entry.updatedAt).trim();
    }
    return "";
  }

  function frontEmbedContentSig(entry) {
    if (!entry || typeof entry !== "object") return "";
    try {
      var copy = Object.assign({}, entry);
      delete copy.updatedAt;
      delete copy.__cleared;
      delete copy.clearId;
      delete copy.clearedSig;
      delete copy.afterClearId;
      return JSON.stringify(copy);
    } catch (e) {
      return "";
    }
  }

  function hasFrontEmbedPayload(entry) {
    if (!entry || typeof entry !== "object" || isClearedFrontEmbedEntry(entry)) {
      return false;
    }
    if (Array.isArray(entry.dataframeRows) && entry.dataframeRows.length > 0) return true;
    if (Array.isArray(entry.records) && entry.records.length > 0) return true;
    if (Array.isArray(entry.currentRows) && entry.currentRows.length > 0) return true;
    if (entry.ddRooms != null && String(entry.ddRooms).trim()) return true;
    return false;
  }

  /** 초기화 마커는, 초기화 이후 iframe이 afterClearId를 들고 온 새 업로드만 덮어쓸 수 있음 */
  function frontEmbedNonClearMayReplaceClear(cleared, incoming) {
    if (!isClearedFrontEmbedEntry(cleared) || !incoming || typeof incoming !== "object") {
      return false;
    }
    if (isClearedFrontEmbedEntry(incoming) || !hasFrontEmbedPayload(incoming)) return false;
    var clearId = frontEmbedClearId(cleared);
    var afterId =
      incoming.afterClearId != null ? String(incoming.afterClearId).trim() : "";
    if (!clearId || !afterId || afterId !== clearId) return false;
    var clearedSig =
      cleared.clearedSig != null ? String(cleared.clearedSig) : "";
    if (clearedSig && frontEmbedContentSig(incoming) === clearedSig) return false;
    var ta = frontEmbedUpdatedAtMs(cleared);
    var tb = frontEmbedUpdatedAtMs(incoming);
    return tb >= ta;
  }

  function frontEmbedUpdatedAtMs(entry) {
    var t = new Date((entry && entry.updatedAt) || 0).getTime();
    return isNaN(t) ? 0 : t;
  }

  function mergeFrontEmbedStates(baseStates, incomingStates) {
    var base = normalizeFrontEmbedStates(baseStates);
    var incoming = normalizeFrontEmbedStates(incomingStates);
    var out = { dd: base.dd, inven: base.inven, chichi: base.chichi };
    ["dd", "inven", "chichi"].forEach(function (key) {
      var a = base[key];
      var b = incoming[key];
      if (!b) return;
      if (!a) {
        out[key] = b;
        return;
      }
      var ta = frontEmbedUpdatedAtMs(a);
      var tb = frontEmbedUpdatedAtMs(b);
      var aCleared = isClearedFrontEmbedEntry(a);
      var bCleared = isClearedFrontEmbedEntry(b);
      // 초기화(__cleared)는 정렬·리렌더로 updatedAt만 갱신된 옛 XML에 덮이지 않음
      if (aCleared && !bCleared) {
        if (frontEmbedNonClearMayReplaceClear(a, b)) out[key] = b;
        return;
      }
      // 옛 초기화 마커가 afterClearId 없는 새 만들기 결과를 덮지 않음 — 더 최신 clear만 채택
      if (!aCleared && bCleared) {
        if (tb >= ta) out[key] = b;
        return;
      }
      if (tb >= ta) out[key] = b;
    });
    return out;
  }

  function defaultData() {
    return {
      notice:
        "공지 내용을 여기에 표시합니다. (우측 상단 관리자에서 수정할 수 있습니다.)",
      noticeImage: "",
      noticeImages: [],
      noticeUpdatedAt: "",
      mbInvNotice: "",
      mbInvNoticeImages: [],
      mbInvNoticeUpdatedAt: "",
      invenNotify: null,
      frontEmbedStates: { dd: null, inven: null, chichi: null },
      facilityMiscLog: null,
      facilityDailyFoundLog: null,
      zoneMemos: { VIP: defaultZoneMemo() },
      customZones: [],
      deletedRooms: {},
      requestDeskChat: [],
      orderDeskChat: [],
      mbCheckDeskChat: [],
      facilityDeskChat: [],
      facilityDeskChat: [],
      hotelInfo: defaultHotelInfo(),
      gameRanks: defaultGameRanks(),
      complaintTypeAnalysis: defaultComplaintTypeAnalysis(),
      trackIt: defaultTrackIt(),
      nightHandover: defaultNightHandover(),
      vipCheckIn: defaultVipCheckIn(),
      closeDayAt: "",
      deletedCustomZones: [],
      rooms: {
        VIP: [],
        RC: [],
        CASINO: [],
        MOBILE_CI: [],
        AJ: [],
        MINIBAR: [],
      },
    };
  }

  var COMPLAINT_TYPE_IDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

  function defaultComplaintTypeAnalysis() {
    return { updatedAt: "", records: [], deletedIds: {} };
  }

  function normalizeComplaintTypeRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = raw.id != null ? String(raw.id).trim() : "";
    if (!id) return null;
    var typeId = raw.typeId != null ? String(raw.typeId).trim() : "";
    if (COMPLAINT_TYPE_IDS.indexOf(typeId) < 0) typeId = "";
    var roomChange = false;
    if (raw.roomChange === true || raw.roomChange === 1 || raw.roomChange === "1") {
      roomChange = true;
    } else if (typeof raw.roomChange === "string") {
      var rc = raw.roomChange.trim().toUpperCase();
      roomChange = rc === "O" || rc === "Y" || rc === "TRUE";
    }
    return {
      id: id,
      createdAt: raw.createdAt != null ? String(raw.createdAt).trim() : "",
      updatedAt: raw.updatedAt != null ? String(raw.updatedAt).trim() : "",
      reservationNo: raw.reservationNo != null ? String(raw.reservationNo).trim() : "",
      guestName: raw.guestName != null ? String(raw.guestName).trim() : "",
      roomNo: raw.roomNo != null ? String(raw.roomNo).trim() : "",
      memo: raw.memo != null ? String(raw.memo).trim() : "",
      typeId: typeId,
      roomChange: roomChange,
    };
  }

  function normalizeComplaintDeletedIds(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (id) {
      var key = String(id || "").trim();
      if (!key) return;
      var at = raw[id] != null ? String(raw[id]).trim() : "";
      if (at) out[key] = at;
    });
    return out;
  }

  function normalizeComplaintTypeAnalysis(raw) {
    var d = defaultComplaintTypeAnalysis();
    if (!raw || typeof raw !== "object") return d;
    d.updatedAt = raw.updatedAt != null ? String(raw.updatedAt).trim() : "";
    d.deletedIds = normalizeComplaintDeletedIds(raw.deletedIds);
    var list = [];
    var seen = {};
    (Array.isArray(raw.records) ? raw.records : []).forEach(function (row) {
      var n = normalizeComplaintTypeRecord(row);
      if (!n || seen[n.id]) return;
      var delAt = d.deletedIds[n.id] || "";
      var liveAt = n.updatedAt || n.createdAt || "";
      if (delAt && (!liveAt || String(delAt) >= String(liveAt))) return;
      seen[n.id] = true;
      list.push(n);
    });
    list.sort(function (a, b) {
      var ta = a.createdAt || "";
      var tb = b.createdAt || "";
      if (ta !== tb) return String(ta).localeCompare(String(tb));
      return String(a.id).localeCompare(String(b.id));
    });
    d.records = list;
    return d;
  }

  function mergeComplaintDeletedIds(baseMap, incMap) {
    var out = {};
    var keys = {};
    Object.keys(baseMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(incMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(keys).forEach(function (k) {
      var ba = baseMap && baseMap[k] ? String(baseMap[k]) : "";
      var ia = incMap && incMap[k] ? String(incMap[k]) : "";
      if (ia && (!ba || String(ia) >= String(ba))) out[k] = ia;
      else if (ba) out[k] = ba;
    });
    return out;
  }

  function mergeComplaintTypeAnalysis(baseRaw, incRaw) {
    var base = normalizeComplaintTypeAnalysis(baseRaw);
    var inc = normalizeComplaintTypeAnalysis(incRaw);
    var ba = base.updatedAt || "";
    var ia2 = inc.updatedAt || "";
    if (ia2 && (!ba || String(ia2) > String(ba)) && !inc.records.length) {
      return normalizeComplaintTypeAnalysis({
        updatedAt: ia2,
        records: [],
        deletedIds: mergeComplaintDeletedIds(base.deletedIds, inc.deletedIds),
      });
    }
    if (ba && (!ia2 || String(ba) > String(ia2)) && !base.records.length) {
      return normalizeComplaintTypeAnalysis({
        updatedAt: ba,
        records: [],
        deletedIds: mergeComplaintDeletedIds(base.deletedIds, inc.deletedIds),
      });
    }
    var deletedIds = mergeComplaintDeletedIds(base.deletedIds, inc.deletedIds);
    var map = {};
    base.records.forEach(function (r) {
      map[r.id] = r;
    });
    inc.records.forEach(function (r) {
      var prev = map[r.id];
      if (!prev) {
        map[r.id] = r;
        return;
      }
      var pa = prev.updatedAt || prev.createdAt || "";
      var ia = r.updatedAt || r.createdAt || "";
      if (!pa || (ia && String(ia) >= String(pa))) map[r.id] = r;
    });
    return normalizeComplaintTypeAnalysis({
      updatedAt: ia2 && (!ba || String(ia2) >= String(ba)) ? ia2 : ba || ia2,
      records: Object.keys(map).map(function (k) {
        return map[k];
      }),
      deletedIds: deletedIds,
    });
  }

  function pickComplaintTypeAnalysis(baseObj, incObj) {
    var baseInfo = normalizeComplaintTypeAnalysis(baseObj && baseObj.complaintTypeAnalysis);
    if (!Object.prototype.hasOwnProperty.call(incObj || {}, "complaintTypeAnalysis")) {
      return baseInfo;
    }
    return mergeComplaintTypeAnalysis(baseInfo, incObj.complaintTypeAnalysis);
  }

  function defaultTrackIt() {
    return { updatedAt: "", records: [], deletedIds: {} };
  }

  function normalizeTrackItRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = raw.id != null ? String(raw.id).trim() : "";
    if (!id) return null;
    var shipType = raw.shipType != null ? String(raw.shipType).trim() : "cod";
    if (shipType !== "urgent") shipType = "cod";
    var kind = raw.kind != null ? String(raw.kind).trim().toLowerCase() : "found";
    if (kind !== "lost") kind = "found";
    return {
      id: id,
      createdAt: raw.createdAt != null ? String(raw.createdAt).trim() : "",
      updatedAt: raw.updatedAt != null ? String(raw.updatedAt).trim() : "",
      kind: kind,
      shipType: shipType,
      address: raw.address != null ? String(raw.address).trim() : "",
      zip: raw.zip != null ? String(raw.zip).trim() : "",
      reservationNo: raw.reservationNo != null ? String(raw.reservationNo).trim() : "",
      name: raw.name != null ? String(raw.name).trim() : "",
      phone: raw.phone != null ? String(raw.phone).trim() : "",
      item: raw.item != null ? String(raw.item).trim() : "",
      checkoutDate: raw.checkoutDate != null ? String(raw.checkoutDate).trim() : "",
      roomNo: raw.roomNo != null ? String(raw.roomNo).trim() : "",
      shippedOk:
        raw.shippedOk === true ||
        raw.shippedOk === 1 ||
        raw.shippedOk === "1" ||
        String(raw.shippedOk || "").toUpperCase() === "Y" ||
        String(raw.shippedOk || "").toUpperCase() === "TRUE",
      shippedAt: raw.shippedAt != null ? String(raw.shippedAt).trim() : "",
    };
  }

  function normalizeTrackItDeletedIds(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (id) {
      var key = String(id || "").trim();
      if (!key) return;
      var at = raw[id] != null ? String(raw[id]).trim() : "";
      if (at) out[key] = at;
    });
    return out;
  }

  function normalizeTrackIt(raw) {
    var d = defaultTrackIt();
    if (!raw || typeof raw !== "object") return d;
    d.updatedAt = raw.updatedAt != null ? String(raw.updatedAt).trim() : "";
    d.deletedIds = normalizeTrackItDeletedIds(raw.deletedIds);
    var list = [];
    var seen = {};
    (Array.isArray(raw.records) ? raw.records : []).forEach(function (row) {
      var n = normalizeTrackItRecord(row);
      if (!n || seen[n.id]) return;
      var delAt = d.deletedIds[n.id] || "";
      var liveAt = n.updatedAt || n.createdAt || "";
      if (delAt && (!liveAt || String(delAt) >= String(liveAt))) return;
      seen[n.id] = true;
      list.push(n);
    });
    list.sort(function (a, b) {
      var ta = a.createdAt || "";
      var tb = b.createdAt || "";
      if (ta !== tb) return String(ta).localeCompare(String(tb));
      return String(a.id).localeCompare(String(b.id));
    });
    d.records = list;
    return d;
  }

  function mergeTrackItDeletedIds(baseMap, incMap) {
    var out = {};
    var keys = {};
    Object.keys(baseMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(incMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(keys).forEach(function (k) {
      var ba = baseMap && baseMap[k] ? String(baseMap[k]) : "";
      var ia = incMap && incMap[k] ? String(incMap[k]) : "";
      if (ia && (!ba || String(ia) >= String(ba))) out[k] = ia;
      else if (ba) out[k] = ba;
    });
    return out;
  }

  function mergeTrackIt(baseRaw, incRaw) {
    var base = normalizeTrackIt(baseRaw);
    var inc = normalizeTrackIt(incRaw);
    var ba = base.updatedAt || "";
    var ia2 = inc.updatedAt || "";
    // 최신 쪽에서 전체 비움(초기화)이면 잔여 레코드와 합치지 않음
    if (ia2 && (!ba || String(ia2) > String(ba)) && !inc.records.length) {
      return normalizeTrackIt({
        updatedAt: ia2,
        records: [],
        deletedIds: mergeTrackItDeletedIds(base.deletedIds, inc.deletedIds),
      });
    }
    if (ba && (!ia2 || String(ba) > String(ia2)) && !base.records.length) {
      return normalizeTrackIt({
        updatedAt: ba,
        records: [],
        deletedIds: mergeTrackItDeletedIds(base.deletedIds, inc.deletedIds),
      });
    }
    var deletedIds = mergeTrackItDeletedIds(base.deletedIds, inc.deletedIds);
    var map = {};
    base.records.forEach(function (r) {
      map[r.id] = r;
    });
    inc.records.forEach(function (r) {
      var prev = map[r.id];
      if (!prev) {
        map[r.id] = r;
        return;
      }
      var pa = prev.updatedAt || prev.createdAt || "";
      var ia = r.updatedAt || r.createdAt || "";
      if (!pa || (ia && String(ia) >= String(pa))) map[r.id] = r;
    });
    return normalizeTrackIt({
      updatedAt: ia2 && (!ba || String(ia2) >= String(ba)) ? ia2 : ba || ia2,
      records: Object.keys(map).map(function (k) {
        return map[k];
      }),
      deletedIds: deletedIds,
    });
  }

  function pickTrackIt(baseObj, incObj) {
    var baseInfo = normalizeTrackIt(baseObj && baseObj.trackIt);
    if (!Object.prototype.hasOwnProperty.call(incObj || {}, "trackIt")) {
      return baseInfo;
    }
    return mergeTrackIt(baseInfo, incObj.trackIt);
  }

  var BY_DATE_KEEP_DAYS = 35;

  function pad2(n) {
    n = Number(n);
    return n < 10 ? "0" + n : String(n);
  }

  function formatDateKey(d) {
    d = d instanceof Date ? d : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function defaultOpsDateKey(now) {
    now = now || new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() >= 17) d.setDate(d.getDate() + 1);
    return formatDateKey(d);
  }

  function dateKeyToDisplay(key) {
    var m = String(key || "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return String(key || "");
    return Number(m[2]) + "/" + Number(m[3]);
  }

  function parseTitleDateToKey(titleDate, titleYear) {
    var s = String(titleDate || "").trim();
    if (!s) return "";
    var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      var di = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if (
        di.getFullYear() === Number(iso[1]) &&
        di.getMonth() === Number(iso[2]) - 1 &&
        di.getDate() === Number(iso[3])
      ) {
        return formatDateKey(di);
      }
      return "";
    }
    var y = parseInt(titleYear, 10);
    if (!y || isNaN(y)) y = new Date().getFullYear();
    var mdy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (mdy) {
      var yy = Number(mdy[3]);
      if (yy < 100) yy += 2000;
      var d1 = new Date(yy, Number(mdy[1]) - 1, Number(mdy[2]));
      if (
        d1.getFullYear() === yy &&
        d1.getMonth() === Number(mdy[1]) - 1 &&
        d1.getDate() === Number(mdy[2])
      ) {
        return formatDateKey(d1);
      }
      return "";
    }
    var md = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
    if (md) {
      var d2 = new Date(y, Number(md[1]) - 1, Number(md[2]));
      if (d2.getMonth() === Number(md[1]) - 1 && d2.getDate() === Number(md[2])) {
        return formatDateKey(d2);
      }
    }
    return "";
  }

  function isValidDateKey(key) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(key || "").trim());
  }

  function pruneByDateMap(byDate, keepDays) {
    byDate = byDate && typeof byDate === "object" ? byDate : {};
    keepDays = keepDays != null ? keepDays : BY_DATE_KEEP_DAYS;
    var cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - keepDays);
    var cutoffKey = formatDateKey(cutoff);
    var out = {};
    Object.keys(byDate).forEach(function (k) {
      if (!isValidDateKey(k)) return;
      if (String(k) >= cutoffKey) out[k] = byDate[k];
    });
    var keys = Object.keys(out).sort();
    if (keys.length > keepDays) {
      var keep = keys.slice(-keepDays);
      var trimmed = {};
      keep.forEach(function (k) {
        trimmed[k] = out[k];
      });
      return trimmed;
    }
    return out;
  }

  function maxUpdatedAt() {
    var max = "";
    var i;
    for (i = 0; i < arguments.length; i++) {
      var v = arguments[i] != null ? String(arguments[i]).trim() : "";
      if (v && (!max || String(v) > String(max))) max = v;
    }
    return max;
  }

  function inferOpsDateKeyFromRaw(raw) {
    if (!raw || typeof raw !== "object") return defaultOpsDateKey();
    if (isValidDateKey(raw.activeDate)) return String(raw.activeDate).trim();
    if (isValidDateKey(raw.dateKey)) return String(raw.dateKey).trim();
    var fromTitle = parseTitleDateToKey(raw.titleDate, raw.titleYear);
    if (fromTitle) return fromTitle;
    var at = raw.updatedAt != null ? String(raw.updatedAt).trim() : "";
    if (/^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10);
    return defaultOpsDateKey();
  }

  function looksLikeByDatePack(raw) {
    return !!(raw && typeof raw === "object" && raw.byDate && typeof raw.byDate === "object");
  }

  function emptyNightHandoverDay() {
    return {
      updatedAt: "",
      dateKey: "",
      titleDate: "",
      duty: {
        mid: { main: "", annex: "" },
        allNight: { main: "", annex: "" },
        utility: { main: "", annex: "" },
      },
      chargers: { cType: "", iphone: "", fivePin: "" },
      etc: { fan: "", duckDown: "", kidsRobe: "" },
      extras: {},
      notes: [],
      incidents: [],
    };
  }

  function defaultNightHandoverDay() {
    if (typeof global.HKNightHandover !== "undefined" && global.HKNightHandover.defaultData) {
      var day = global.HKNightHandover.defaultData();
      if (day && typeof day === "object" && !looksLikeByDatePack(day)) return day;
    }
    return emptyNightHandoverDay();
  }

  function defaultNightHandover() {
    var key = defaultOpsDateKey();
    var day = defaultNightHandoverDay();
    day.dateKey = key;
    day.titleDate = day.titleDate || dateKeyToDisplay(key);
    return {
      activeDate: key,
      updatedAt: "",
      byDate: {},
    };
  }

  function normalizeWingPair(raw) {
    return {
      main: raw && raw.main != null ? String(raw.main) : "",
      annex: raw && raw.annex != null ? String(raw.annex) : "",
    };
  }

  function normalizeNightHandoverDay(raw) {
    var d = emptyNightHandoverDay();
    if (!raw || typeof raw !== "object") return d;
    d.updatedAt = raw.updatedAt != null ? String(raw.updatedAt).trim() : "";
    d.dateKey = isValidDateKey(raw.dateKey)
      ? String(raw.dateKey).trim()
      : inferOpsDateKeyFromRaw(raw);
    d.titleDate =
      raw.titleDate != null && String(raw.titleDate).trim()
        ? String(raw.titleDate).trim()
        : dateKeyToDisplay(d.dateKey);
    var duty = raw.duty && typeof raw.duty === "object" ? raw.duty : {};
    d.duty = {
      mid: normalizeWingPair(duty.mid),
      allNight: normalizeWingPair(duty.allNight),
      utility: normalizeWingPair(duty.utility),
    };
    var ch = raw.chargers && typeof raw.chargers === "object" ? raw.chargers : {};
    d.chargers = {
      cType: ch.cType != null ? String(ch.cType) : "",
      iphone: ch.iphone != null ? String(ch.iphone) : "",
      fivePin: ch.fivePin != null ? String(ch.fivePin) : "",
    };
    var etc = raw.etc && typeof raw.etc === "object" ? raw.etc : {};
    d.etc = {
      fan: etc.fan != null ? String(etc.fan) : "",
      duckDown: etc.duckDown != null ? String(etc.duckDown) : "",
      kidsRobe: etc.kidsRobe != null ? String(etc.kidsRobe) : "",
    };
    var extrasIn = raw.extras && typeof raw.extras === "object" ? raw.extras : {};
    var extrasOut = {};
    Object.keys(extrasIn).forEach(function (key) {
      extrasOut[key] = normalizeWingPair(extrasIn[key]);
    });
    [
      "addClean",
      "oooStay",
      "emptyStay",
      "excludeClean",
      "loCarry",
      "stayOver",
      "roomChange",
      "ventReplace",
      "linenMissing",
    ].forEach(function (key) {
      if (!extrasOut[key]) extrasOut[key] = normalizeWingPair(null);
    });
    d.extras = extrasOut;
    var notes = Array.isArray(raw.notes) ? raw.notes : [];
    d.notes = [];
    var i;
    if (!notes.length) {
      for (i = 0; i < 3; i++) d.notes.push({ category: "", main: "", annex: "" });
    } else {
      notes.forEach(function (n) {
        n = n || {};
        d.notes.push({
          category: n.category != null ? String(n.category) : "",
          main: n.main != null ? String(n.main) : "",
          annex: n.annex != null ? String(n.annex) : "",
        });
      });
    }
    var incidents = Array.isArray(raw.incidents) ? raw.incidents : [];
    d.incidents = [];
    if (!incidents.length) {
      for (i = 0; i < 3; i++) d.incidents.push({ room: "", by: "", dates: "", detail: "" });
    } else {
      incidents.forEach(function (inc) {
        inc = inc || {};
        d.incidents.push({
          room: inc.room != null ? String(inc.room) : "",
          by: inc.by != null ? String(inc.by) : "",
          dates: inc.dates != null ? String(inc.dates) : "",
          detail: inc.detail != null ? String(inc.detail) : "",
        });
      });
    }
    return d;
  }

  function normalizeNightHandover(raw) {
    var pack = {
      activeDate: defaultOpsDateKey(),
      updatedAt: "",
      byDate: {},
    };
    if (!raw || typeof raw !== "object") return pack;

    if (looksLikeByDatePack(raw)) {
      var byDateIn = raw.byDate || {};
      Object.keys(byDateIn).forEach(function (k) {
        var day = normalizeNightHandoverDay(byDateIn[k]);
        var key = isValidDateKey(k) ? String(k).trim() : day.dateKey;
        if (!isValidDateKey(key)) return;
        day.dateKey = key;
        if (!day.titleDate) day.titleDate = dateKeyToDisplay(key);
        pack.byDate[key] = day;
        pack.updatedAt = maxUpdatedAt(pack.updatedAt, day.updatedAt);
      });
      if (isValidDateKey(raw.activeDate)) pack.activeDate = String(raw.activeDate).trim();
      else if (Object.keys(pack.byDate).length) {
        pack.activeDate = Object.keys(pack.byDate).sort().slice(-1)[0];
      }
      if (raw.updatedAt != null && String(raw.updatedAt).trim()) {
        pack.updatedAt = maxUpdatedAt(pack.updatedAt, String(raw.updatedAt).trim());
      }
      pack.byDate = pruneByDateMap(pack.byDate);
      return pack;
    }

    /* legacy flat day → migrate into byDate[inferredKey] */
    var day = normalizeNightHandoverDay(raw);
    var key = inferOpsDateKeyFromRaw(raw);
    day.dateKey = key;
    if (!day.titleDate) day.titleDate = dateKeyToDisplay(key);
    pack.activeDate = key;
    pack.updatedAt = day.updatedAt || "";
    pack.byDate[key] = day;
    pack.byDate = pruneByDateMap(pack.byDate);
    return pack;
  }

  function pickByDatePack(basePack, incPack) {
    var base = basePack && typeof basePack === "object" ? basePack : { activeDate: "", updatedAt: "", byDate: {} };
    var inc = incPack && typeof incPack === "object" ? incPack : { activeDate: "", updatedAt: "", byDate: {} };
    var byDate = {};
    var baseMap = base.byDate && typeof base.byDate === "object" ? base.byDate : {};
    var incMap = inc.byDate && typeof inc.byDate === "object" ? inc.byDate : {};
    var keys = {};
    Object.keys(baseMap).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(incMap).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(keys).forEach(function (k) {
      var bd = baseMap[k];
      var id = incMap[k];
      if (!bd) {
        byDate[k] = id;
        return;
      }
      if (!id) {
        byDate[k] = bd;
        return;
      }
      var ba = bd.updatedAt != null ? String(bd.updatedAt) : "";
      var ia = id.updatedAt != null ? String(id.updatedAt) : "";
      byDate[k] = ia && (!ba || String(ia) >= String(ba)) ? id : bd;
    });
    var baPack = base.updatedAt != null ? String(base.updatedAt) : "";
    var iaPack = inc.updatedAt != null ? String(inc.updatedAt) : "";
    var newerIsInc = iaPack && (!baPack || String(iaPack) >= String(baPack));
    var activeDate = "";
    if (newerIsInc && isValidDateKey(inc.activeDate)) activeDate = String(inc.activeDate).trim();
    else if (!newerIsInc && isValidDateKey(base.activeDate)) activeDate = String(base.activeDate).trim();
    else if (isValidDateKey(inc.activeDate)) activeDate = String(inc.activeDate).trim();
    else if (isValidDateKey(base.activeDate)) activeDate = String(base.activeDate).trim();
    else {
      var sorted = Object.keys(byDate).sort();
      activeDate = sorted.length ? sorted[sorted.length - 1] : defaultOpsDateKey();
    }
    byDate = pruneByDateMap(byDate);
    var updatedAt = maxUpdatedAt(baPack, iaPack);
    Object.keys(byDate).forEach(function (k) {
      if (byDate[k] && byDate[k].updatedAt) updatedAt = maxUpdatedAt(updatedAt, byDate[k].updatedAt);
    });
    var ui = null;
    var baseUi = base.ui && typeof base.ui === "object" ? base.ui : null;
    var incUi = inc.ui && typeof inc.ui === "object" ? inc.ui : null;
    function uiHasContent(u) {
      return !!(u && typeof u === "object" && Object.keys(u).length);
    }
    if (newerIsInc && uiHasContent(incUi)) ui = incUi;
    else if (!newerIsInc && uiHasContent(baseUi)) ui = baseUi;
    else if (uiHasContent(incUi)) ui = incUi;
    else if (uiHasContent(baseUi)) ui = baseUi;
    var out = {
      activeDate: activeDate,
      updatedAt: updatedAt,
      byDate: byDate,
    };
    if (ui) out.ui = ui;
    return out;
  }

  function pickNightHandover(baseObj, incObj) {
    var base = normalizeNightHandover(baseObj && baseObj.nightHandover);
    if (!Object.prototype.hasOwnProperty.call(incObj || {}, "nightHandover")) {
      return base;
    }
    var inc = normalizeNightHandover(incObj.nightHandover);
    return pickByDatePack(base, inc);
  }

  function emptyVipCheckInDay() {
    return {
      updatedAt: "",
      dateKey: "",
      titleDate: "",
      titleYear: "",
      guests: [
        { section: "", mergePrev: false, guestName: "", roomNo: "", roomStatus: "", roomType: "", rsvNo: "", eta: "", checkOut: "", remark: "" },
        { section: "", mergePrev: false, guestName: "", roomNo: "", roomStatus: "", roomType: "", rsvNo: "", eta: "", checkOut: "", remark: "" },
        { section: "", mergePrev: false, guestName: "", roomNo: "", roomStatus: "", roomType: "", rsvNo: "", eta: "", checkOut: "", remark: "" },
        { section: "", mergePrev: false, guestName: "", roomNo: "", roomStatus: "", roomType: "", rsvNo: "", eta: "", checkOut: "", remark: "" },
      ],
      sections: { V4: [], EI: [], SA: [], NPS: [] },
      connecting: [
        { rooms: "923-925", midDoor: "중간문", status: "CLOSE", openNote: "" },
        { rooms: "936-938", midDoor: "중간문", status: "CLOSE", openNote: "" },
        { rooms: "857-858", midDoor: "중간문", status: "CLOSE", openNote: "" },
        { rooms: "1220-1222", midDoor: "중간문", status: "CLOSE", openNote: "" },
        { rooms: "1120-1122", midDoor: "중간문", status: "CLOSE", openNote: "" },
        { rooms: "1210-1216", midDoor: "중간문", status: "CLOSE", openNote: "" },
      ],
      ajList: [""],
      mbList: [""],
      aj: { main: "", annex: "" },
      mb: "",
      remarks: {},
    };
  }

  function defaultVipCheckInDay() {
    if (typeof global.HKVipCheckIn !== "undefined" && global.HKVipCheckIn.defaultData) {
      var day = global.HKVipCheckIn.defaultData();
      if (day && typeof day === "object" && !looksLikeByDatePack(day)) return day;
    }
    return emptyVipCheckInDay();
  }

  function defaultVipCheckIn() {
    var key = defaultOpsDateKey();
    return {
      activeDate: key,
      updatedAt: "",
      byDate: {},
    };
  }

  function emptyVipGuest() {
    return {
      section: "",
      mergePrev: false,
      guestName: "",
      roomNo: "",
      roomStatus: "",
      roomType: "",
      rsvNo: "",
      eta: "",
      checkOut: "",
      remark: "",
    };
  }

  function normalizeVipGuest(raw, sectionFallback) {
    var g = emptyVipGuest();
    if (!raw || typeof raw !== "object") {
      if (sectionFallback) g.section = String(sectionFallback);
      return g;
    }
    g.section =
      raw.section != null && String(raw.section).trim()
        ? String(raw.section)
        : sectionFallback != null
          ? String(sectionFallback)
          : "";
    g.mergePrev = raw.mergePrev === true || raw.mergePrev === 1 || raw.mergePrev === "1";
    [
      "guestName",
      "roomNo",
      "roomStatus",
      "roomType",
      "rsvNo",
      "eta",
      "checkOut",
      "remark",
    ].forEach(function (k) {
      g[k] = raw[k] != null ? String(raw[k]) : "";
    });
    return g;
  }

  function flattenLegacyVipSections(sections) {
    var guests = [];
    ["V4", "EI", "SA", "NPS"].forEach(function (sec) {
      var src = Array.isArray(sections[sec]) ? sections[sec] : [];
      src.forEach(function (row, idx) {
        var g = normalizeVipGuest(row, sec);
        if (idx > 0) {
          /* keep separate rows with same label — not auto-merged */
          g.mergePrev = false;
        }
        guests.push(g);
      });
    });
    return guests;
  }

  function normalizeVipCheckInDay(raw) {
    var d = emptyVipCheckInDay();
    if (!raw || typeof raw !== "object") return d;
    d.updatedAt = raw.updatedAt != null ? String(raw.updatedAt).trim() : "";
    d.dateKey = isValidDateKey(raw.dateKey)
      ? String(raw.dateKey).trim()
      : inferOpsDateKeyFromRaw(raw);
    d.titleDate =
      raw.titleDate != null && String(raw.titleDate).trim()
        ? String(raw.titleDate).trim()
        : dateKeyToDisplay(d.dateKey);
    d.titleYear =
      raw.titleYear != null && String(raw.titleYear).trim()
        ? String(raw.titleYear).trim()
        : d.dateKey
          ? String(d.dateKey).slice(0, 4)
          : String(new Date().getFullYear());

    var guests = [];
    if (Array.isArray(raw.guests) && raw.guests.length) {
      raw.guests.forEach(function (row) {
        guests.push(normalizeVipGuest(row));
      });
    } else {
      var sections = raw.sections && typeof raw.sections === "object" ? raw.sections : {};
      guests = flattenLegacyVipSections(sections);
    }
    if (!guests.length) {
      guests = [
        normalizeVipGuest(null, ""),
        normalizeVipGuest(null, ""),
        normalizeVipGuest(null, ""),
        normalizeVipGuest(null, ""),
      ];
    }
    if (guests[0]) guests[0].mergePrev = false;
    d.guests = guests;

    d.sections = { V4: [], EI: [], SA: [], NPS: [] };
    guests.forEach(function (g) {
      var key = String(g.section || "").trim().toUpperCase();
      if (!d.sections[key]) key = "NPS";
      d.sections[key].push({
        guestName: g.guestName,
        roomNo: g.roomNo,
        roomStatus: g.roomStatus,
        roomType: g.roomType,
        rsvNo: g.rsvNo,
        eta: g.eta,
        checkOut: g.checkOut,
        remark: g.remark,
      });
    });

    var defaultConnRooms = [
      "923-925",
      "936-938",
      "857-858",
      "1220-1222",
      "1120-1122",
      "1210-1216",
    ];
    var connecting = Array.isArray(raw.connecting) ? raw.connecting : [];
    d.connecting = [];
    if (!connecting.length) {
      defaultConnRooms.forEach(function (rooms) {
        d.connecting.push({ rooms: rooms, midDoor: "중간문", status: "CLOSE", openNote: "" });
      });
    } else {
      connecting.forEach(function (c) {
        c = c || {};
        var st = c.status != null ? String(c.status).trim().toUpperCase() : "CLOSE";
        if (st !== "OPEN") st = "CLOSE";
        d.connecting.push({
          rooms: c.rooms != null ? String(c.rooms) : "",
          midDoor: "중간문",
          status: st,
          openNote: c.openNote != null ? String(c.openNote) : "",
        });
      });
    }
    var allConnBlank = d.connecting.every(function (c) {
      return !(c && String(c.rooms || "").trim());
    });
    if (allConnBlank) {
      d.connecting = defaultConnRooms.map(function (rooms) {
        return { rooms: rooms, midDoor: "중간문", status: "CLOSE", openNote: "" };
      });
    }

    d.aj = normalizeWingPair(raw.aj);
    d.mb = raw.mb != null ? String(raw.mb) : "";
    var remarksIn = raw.remarks && typeof raw.remarks === "object" ? raw.remarks : {};
    var remarkIds = [
      "specialNote",
      "aj",
      "mb",
      "welcomeCard",
      "lateCo",
      "earlyCi",
      "casino",
      "seminar",
      "business",
      "dami",
      "tongTeam",
    ];
    d.remarks = {};
    remarkIds.forEach(function (id) {
      d.remarks[id] = remarksIn[id] != null ? String(remarksIn[id]) : "";
    });
    if (!d.remarks.aj && (d.aj.main || d.aj.annex)) {
      d.remarks.aj = [d.aj.main, d.aj.annex].filter(Boolean).join(" / ");
    }
    if (!d.remarks.mb && d.mb) d.remarks.mb = d.mb;
    if (d.remarks.aj && !d.aj.main) d.aj = { main: d.remarks.aj, annex: "" };
    if (d.remarks.mb && !d.mb) d.mb = d.remarks.mb;

    function normList(arr, fallback) {
      if (Array.isArray(arr) && arr.length) {
        return arr.map(function (v) {
          return v != null ? String(v) : "";
        });
      }
      if (fallback) return String(fallback).split(/\n/);
      return [""];
    }
    d.ajList = normList(raw.ajList, d.remarks.aj);
    d.mbList = normList(raw.mbList, d.remarks.mb);
    d.remarks.aj = d.ajList.filter(Boolean).join("\n");
    d.remarks.mb = d.mbList.filter(Boolean).join("\n");

    var defaultRemarkDefs = [
      { id: "specialNote", label: "특이사항", highlight: "" },
      { id: "aj", label: "AJ", highlight: "" },
      { id: "mb", label: "MB", highlight: "" },
      { id: "welcomeCard", label: "웰컴카드 (VOUPS 2,3)", highlight: "" },
      { id: "lateCo", label: "LATE C/O", highlight: "" },
      { id: "earlyCi", label: "얼리체크인", highlight: "" },
      { id: "casino", label: "카지노", highlight: "" },
      { id: "seminar", label: "세미나 / 단체", highlight: "" },
      { id: "business", label: "출장", highlight: "green" },
      { id: "dami", label: "답사 룸쇼", highlight: "" },
      { id: "tongTeam", label: "롱텀", highlight: "" },
    ];
    if (Array.isArray(raw.remarkRows) && raw.remarkRows.length) {
      d.remarkRows = raw.remarkRows.map(function (r) {
        r = r || {};
        return {
          id: r.id != null ? String(r.id) : "",
          label: r.label != null ? String(r.label) : "",
          value: r.value != null ? String(r.value) : "",
          highlight: r.highlight != null ? String(r.highlight) : "",
        };
      });
    } else {
      d.remarkRows = defaultRemarkDefs.map(function (def) {
        var value = "";
        if (def.id === "aj") value = d.remarks.aj || "";
        else if (def.id === "mb") value = d.remarks.mb || "";
        else value = d.remarks[def.id] != null ? d.remarks[def.id] : "";
        return {
          id: def.id,
          label: def.label,
          value: value,
          highlight: def.highlight || "",
        };
      });
    }
    (function ensureSpecialNoteInDay(day) {
      if (!day || !Array.isArray(day.remarkRows)) return;
      var rows = day.remarkRows;
      var has = rows.some(function (r) {
        return r && (r.id === "specialNote" || String(r.label || "").trim() === "특이사항");
      });
      if (!has) {
        var ajIdx = -1;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && (rows[i].id === "aj" || String(rows[i].label || "").trim() === "AJ")) {
            ajIdx = i;
            break;
          }
        }
        rows.splice(ajIdx >= 0 ? ajIdx : 0, 0, {
          id: "specialNote",
          label: "특이사항",
          value: day.remarks && day.remarks.specialNote != null ? String(day.remarks.specialNote) : "",
          highlight: "",
        });
      } else {
        rows.forEach(function (r) {
          if (r && (r.id === "specialNote" || String(r.label || "").trim() === "특이사항")) {
            r.id = "specialNote";
            r.label = "특이사항";
          }
        });
      }
    })(d);
    return d;
  }

  function normalizeVipGuestColWidths(raw) {
    if (!Array.isArray(raw) || !raw.length) return null;
    var widths = [];
    var i;
    var max = Math.min(raw.length, 20);
    for (i = 0; i < max; i++) {
      var v = Number(raw[i]);
      if (!(v > 0) || !isFinite(v)) continue;
      widths.push(v);
    }
    return widths.length ? widths : null;
  }

  function normalizeVipUi(rawUi) {
    var ui = {};
    if (!rawUi || typeof rawUi !== "object") return ui;
    var widths = normalizeVipGuestColWidths(rawUi.guestColWidths);
    if (widths) ui.guestColWidths = widths;
    return ui;
  }

  function normalizeVipCheckIn(raw) {
    var pack = {
      activeDate: defaultOpsDateKey(),
      updatedAt: "",
      byDate: {},
    };
    if (!raw || typeof raw !== "object") return pack;

    if (looksLikeByDatePack(raw)) {
      var byDateIn = raw.byDate || {};
      Object.keys(byDateIn).forEach(function (k) {
        var day = normalizeVipCheckInDay(byDateIn[k]);
        var key = isValidDateKey(k) ? String(k).trim() : day.dateKey;
        if (!isValidDateKey(key)) return;
        day.dateKey = key;
        if (!day.titleDate) day.titleDate = dateKeyToDisplay(key);
        if (!day.titleYear) day.titleYear = String(key).slice(0, 4);
        pack.byDate[key] = day;
        pack.updatedAt = maxUpdatedAt(pack.updatedAt, day.updatedAt);
      });
      if (isValidDateKey(raw.activeDate)) pack.activeDate = String(raw.activeDate).trim();
      else if (Object.keys(pack.byDate).length) {
        pack.activeDate = Object.keys(pack.byDate).sort().slice(-1)[0];
      }
      if (raw.updatedAt != null && String(raw.updatedAt).trim()) {
        pack.updatedAt = maxUpdatedAt(pack.updatedAt, String(raw.updatedAt).trim());
      }
      pack.byDate = pruneByDateMap(pack.byDate);
      var uiNorm = normalizeVipUi(raw.ui);
      if (Object.keys(uiNorm).length) pack.ui = uiNorm;
      else delete pack.ui;
      return pack;
    }

    var day = normalizeVipCheckInDay(raw);
    var key = inferOpsDateKeyFromRaw(raw);
    day.dateKey = key;
    if (!day.titleDate) day.titleDate = dateKeyToDisplay(key);
    if (!day.titleYear) day.titleYear = String(key).slice(0, 4);
    pack.activeDate = key;
    pack.updatedAt = day.updatedAt || "";
    pack.byDate[key] = day;
    pack.byDate = pruneByDateMap(pack.byDate);
    var uiLegacy = normalizeVipUi(raw.ui);
    if (Object.keys(uiLegacy).length) pack.ui = uiLegacy;
    else delete pack.ui;
    return pack;
  }

  function pickVipCheckIn(baseObj, incObj) {
    var base = normalizeVipCheckIn(baseObj && baseObj.vipCheckIn);
    if (!Object.prototype.hasOwnProperty.call(incObj || {}, "vipCheckIn")) {
      return base;
    }
    var inc = normalizeVipCheckIn(incObj.vipCheckIn);
    return pickByDatePack(base, inc);
  }

  function defaultHotelInfo() {
    return {
      text: "",
      urls: [],
      pages: [],
      updatedAt: "",
    };
  }

  function normalizeHotelInfo(raw) {
    var d = defaultHotelInfo();
    if (!raw || typeof raw !== "object") return d;
    d.text = raw.text != null ? String(raw.text) : "";
    d.updatedAt = raw.updatedAt != null ? String(raw.updatedAt).trim() : "";
    var urls = [];
    var seen = {};
    (Array.isArray(raw.urls) ? raw.urls : []).forEach(function (u) {
      var s = u != null ? String(u).trim() : "";
      if (!s || seen[s]) return;
      seen[s] = true;
      urls.push(s);
    });
    d.urls = urls;
    var pages = [];
    (Array.isArray(raw.pages) ? raw.pages : []).forEach(function (p) {
      if (!p || typeof p !== "object") return;
      var url = p.url != null ? String(p.url).trim() : "";
      if (!url) return;
      pages.push({
        url: url,
        title: p.title != null ? String(p.title) : "",
        text: p.text != null ? String(p.text) : "",
        fetchedAt: p.fetchedAt != null ? String(p.fetchedAt) : "",
        error: p.error != null ? String(p.error) : "",
      });
    });
    d.pages = pages;
    return d;
  }

  var GAME_RANK_IDS = ["candy", "merge2048", "snake", "memory", "breakout", "jump", "tetris", "pong", "flappy", "mines", "reaction", "dodge"];
  var GAME_RANK_MAX = 30;

  function defaultGameRanks() {
    var boards = {};
    GAME_RANK_IDS.forEach(function (id) {
      boards[id] = [];
    });
    return { updatedAt: "", resetAt: "", boards: boards };
  }

  function normalizeGameRankEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var name = raw.name != null ? String(raw.name).trim() : "";
    var score = Number(raw.score);
    if (!name || !isFinite(score)) return null;
    return {
      name: name,
      score: Math.floor(score),
      at: raw.at != null ? String(raw.at) : "",
    };
  }

  function normalizeGameRanks(raw) {
    var d = defaultGameRanks();
    if (!raw || typeof raw !== "object") return d;
    d.updatedAt = raw.updatedAt != null ? String(raw.updatedAt) : "";
    d.resetAt = raw.resetAt != null ? String(raw.resetAt) : "";
    var src = raw.boards && typeof raw.boards === "object" ? raw.boards : raw;
    var resetAt = d.resetAt;
    GAME_RANK_IDS.forEach(function (id) {
      var list = Array.isArray(src[id]) ? src[id] : [];
      var byName = {};
      list.forEach(function (row) {
        var n = normalizeGameRankEntry(row);
        if (!n) return;
        if (resetAt && (!n.at || String(n.at) < String(resetAt))) return;
        var prev = byName[n.name];
        if (!prev || n.score > prev.score) byName[n.name] = n;
      });
      d.boards[id] = Object.keys(byName)
        .map(function (k) {
          return byName[k];
        })
        .sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.at).localeCompare(String(b.at));
        })
        .slice(0, GAME_RANK_MAX);
    });
    return d;
  }

  function mergeGameRanks(baseRaw, incRaw) {
    var base = normalizeGameRanks(baseRaw);
    var inc = normalizeGameRanks(incRaw);
    var out = defaultGameRanks();
    var baseAt = base.updatedAt || "";
    var incAt = inc.updatedAt || "";
    var baseReset = base.resetAt || "";
    var incReset = inc.resetAt || "";
    out.updatedAt =
      incAt && (!baseAt || String(incAt) >= String(baseAt)) ? incAt : baseAt || incAt;
    out.resetAt =
      incReset && (!baseReset || String(incReset) >= String(baseReset))
        ? incReset
        : baseReset || incReset;
    var resetAt = out.resetAt;
    GAME_RANK_IDS.forEach(function (id) {
      var byName = {};
      [base.boards[id] || [], inc.boards[id] || []].forEach(function (list) {
        list.forEach(function (row) {
          var n = normalizeGameRankEntry(row);
          if (!n) return;
          if (resetAt && (!n.at || String(n.at) < String(resetAt))) return;
          var prev = byName[n.name];
          if (!prev || n.score > prev.score) byName[n.name] = n;
        });
      });
      out.boards[id] = Object.keys(byName)
        .map(function (k) {
          return byName[k];
        })
        .sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.at).localeCompare(String(b.at));
        })
        .slice(0, GAME_RANK_MAX);
    });
    return out;
  }

  function pickHotelInfo(baseObj, incObj) {
    var baseInfo = normalizeHotelInfo(baseObj && baseObj.hotelInfo);
    var incInfo = normalizeHotelInfo(incObj && incObj.hotelInfo);
    if (!Object.prototype.hasOwnProperty.call(incObj || {}, "hotelInfo")) {
      return baseInfo;
    }
    var baseAt = baseInfo.updatedAt || "";
    var incAt = incInfo.updatedAt || "";
    if (incAt && (!baseAt || String(incAt) >= String(baseAt))) return incInfo;
    if (baseAt && !incAt) return baseInfo;
    if (incAt || incInfo.text || (incInfo.urls && incInfo.urls.length)) return incInfo;
    return baseInfo;
  }

  function parseRoomEntry(x) {
    var d = defaultRoom();
    if (x == null) return d;
    if (typeof x === "string") {
      var n = String(x).trim();
      if (!n) return d;
      d.number = n;
      return d;
    }
    if (typeof x === "object") {
      d.number =
        x.number != null && String(x.number).trim()
          ? String(x.number).trim()
          : "";
      d.status = x.status != null ? String(x.status).trim() : "";
      d.memo1 = x.memo1 != null ? String(x.memo1) : "";
      d.memo2 = x.memo2 != null ? String(x.memo2) : "";
      d.memo2Image = x.memo2Image != null ? String(x.memo2Image) : "";
      d.time = x.time != null ? normalizeTimeField(x.time) : "";
      d.tray = x.tray != null ? String(x.tray).trim() : "";
      d.trayUpdatedAt =
        x.trayUpdatedAt != null ? String(x.trayUpdatedAt).trim() : "";
      d.createdAt = x.createdAt != null ? String(x.createdAt).trim() : "";
      d.updatedAt = x.updatedAt != null ? String(x.updatedAt).trim() : "";
      d.mbProductId = x.mbProductId != null ? String(x.mbProductId).trim() : "";
      d.mbGroup = x.mbGroup != null ? String(x.mbGroup).trim() : "";
    }
    return d;
  }

  function normalize(data) {
    var d = defaultData();
    if (!data || typeof data !== "object") return d;
    if (typeof data.notice === "string") d.notice = data.notice;
    d.noticeImages = normalizeNoticeImages(data);
    d.noticeImage = d.noticeImages[0] || "";
    d.noticeUpdatedAt = normalizeNoticeUpdatedAt(data);
    if (typeof data.mbInvNotice === "string") d.mbInvNotice = data.mbInvNotice;
    d.mbInvNoticeImages = normalizeMbInvNoticeImages(data);
    d.mbInvNoticeUpdatedAt = normalizeMbInvNoticeUpdatedAt(data);
    if (data.invenNotify && typeof data.invenNotify === "object") {
      d.invenNotify = data.invenNotify;
    }
    d.frontEmbedStates = normalizeFrontEmbedStates(data.frontEmbedStates);
    if (data.facilityMiscLog && typeof data.facilityMiscLog === "object") {
      d.facilityMiscLog = data.facilityMiscLog;
    }
    if (data.facilityDailyFoundLog && typeof data.facilityDailyFoundLog === "object") {
      d.facilityDailyFoundLog = data.facilityDailyFoundLog;
    }
    d.zoneMemos = normalizeZoneMemos(data);

    var customZones = [];
    var customById = {};

    if (Array.isArray(data.customZones)) {
      data.customZones.forEach(function (z) {
        if (!z || typeof z !== "object") return;
        var id = z.id != null ? String(z.id).trim() : "";
        var label = z.label != null ? String(z.label).trim() : "";
        if (!id || !label || isStandardZone(id)) return;
        if (customById[id]) return;
        var entry = { id: id, label: label };
        customById[id] = entry;
        customZones.push(entry);
      });
    }

    var r = data.rooms;

    d.customZones = customZones;
    d.deletedRooms = normalizeDeletedRooms(data, customZones);
    d.deletedCustomZones = normalizeDeletedCustomZones(data);
    d.closeDayAt =
      data.closeDayAt != null ? String(data.closeDayAt).trim() : "";
    d.requestDeskChat = normalizeRequestDeskChat(data.requestDeskChat);
    d.orderDeskChat = normalizeRequestDeskChat(data.orderDeskChat);
    d.mbCheckDeskChat = normalizeRequestDeskChat(data.mbCheckDeskChat);
    d.facilityDeskChat = normalizeRequestDeskChat(data.facilityDeskChat);
    d.facilityDeskChat = normalizeRequestDeskChat(data.facilityDeskChat);
    d.hotelInfo = normalizeHotelInfo(data.hotelInfo);
    d.gameRanks = normalizeGameRanks(data.gameRanks);
    d.complaintTypeAnalysis = normalizeComplaintTypeAnalysis(data.complaintTypeAnalysis);
    d.trackIt = normalizeTrackIt(data.trackIt);
    d.nightHandover = normalizeNightHandover(data.nightHandover);
    d.vipCheckIn = normalizeVipCheckIn(data.vipCheckIn);

    STANDARD_ZONE_IDS.forEach(function (k) {
      if (r && Array.isArray(r[k])) {
        d.rooms[k] = parseRoomsArray(r[k], k, d.deletedRooms);
      }
    });

    customZones.forEach(function (z) {
      d.rooms[z.id] =
        r && Array.isArray(r[z.id])
          ? parseRoomsArray(r[z.id], z.id, d.deletedRooms)
          : [];
    });

    // 스탬프가 마감 이전이거나 없으면 제외 (마감 후 되살림 방지)
    if (d.closeDayAt) {
      var zoneIds = STANDARD_ZONE_IDS.concat(
        customZones.map(function (z) {
          return z.id;
        })
      );
      zoneIds.forEach(function (zone) {
        var list = Array.isArray(d.rooms[zone]) ? d.rooms[zone] : [];
        d.rooms[zone] = list.filter(function (room) {
          if (!room || !room.number) return false;
          var at = roomActivityAt(room);
          if (!at) return false;
          return isRoomAfterCloseDay(room, d.closeDayAt);
        });
      });
    }

    return d;
  }

  function getZoneOrder(data) {
    data = normalize(data || load());
    var order = STANDARD_ZONE_IDS.slice();
    (data.customZones || []).forEach(function (z) {
      if (z && z.id && order.indexOf(z.id) < 0) order.push(z.id);
    });
    return order;
  }

  function getAllZoneIds(data) {
    return getZoneOrder(data);
  }

  function getZoneLabel(zoneId, data) {
    data = data || load();
    if (STANDARD_ZONE_LABELS[zoneId]) return STANDARD_ZONE_LABELS[zoneId];
    var found = (data.customZones || []).find(function (z) {
      return z && z.id === zoneId;
    });
    if (found && found.label) return found.label;
    return labelFromZoneId(zoneId);
  }

  function getZoneLabelsMap(data) {
    data = data || load();
    var map = {};
    getZoneOrder(data).forEach(function (zoneId) {
      map[zoneId] = getZoneLabel(zoneId, data);
    });
    return map;
  }

  function makeCustomZoneId(label, data) {
    data = data || load();
    var base = slugZoneLabel(label);
    var id = base;
    var n = 2;
    var existing = getAllZoneIds(data);
    while (existing.indexOf(id) >= 0) {
      id = base + "_" + n;
      n += 1;
    }
    return id;
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      return normalize(JSON.parse(raw));
    } catch (e) {
      return defaultData();
    }
  }

  function save(data, opts) {
    opts = opts || {};
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(data)));
    if (!opts.skipSync && global.HKSync) {
      global.HKSync.schedulePushStorage();
    }
  }

  function normalizeDeletedCustomZones(data) {
    if (!data || !Array.isArray(data.deletedCustomZones)) return [];
    var seen = {};
    var out = [];
    data.deletedCustomZones.forEach(function (id) {
      var z = id != null ? String(id).trim() : "";
      if (!z || isStandardZone(z) || seen[z]) return;
      seen[z] = true;
      out.push(z);
    });
    return out;
  }

  function mergeDeletedCustomZones(baseArr, incomingArr) {
    var seen = {};
    var out = [];
    function add(arr) {
      (arr || []).forEach(function (id) {
        var z = id != null ? String(id).trim() : "";
        if (!z || isStandardZone(z) || seen[z]) return;
        seen[z] = true;
        out.push(z);
      });
    }
    add(baseArr);
    add(incomingArr);
    return out;
  }

  function mergeCustomZonesById(baseZones, incomingZones, deletedIds, incomingZonesList) {
    var map = {};
    function put(z) {
      if (!z || typeof z !== "object") return;
      var id = z.id != null ? String(z.id).trim() : "";
      var label = z.label != null ? String(z.label).trim() : "";
      if (!id || !label || isStandardZone(id)) return;
      map[id] = { id: id, label: label };
    }
    (baseZones || []).forEach(put);
    (incomingZones || []).forEach(put);
    // 같은 페이로드에 존이 다시 있으면 삭제 tombstone 해제(재추가)
    var incomingIds = {};
    (incomingZonesList || incomingZones || []).forEach(function (z) {
      if (z && z.id) incomingIds[String(z.id).trim()] = true;
    });
    var deleted = (deletedIds || []).filter(function (id) {
      return !incomingIds[id];
    });
    return {
      zones: Object.keys(map)
        .filter(function (id) {
          return deleted.indexOf(id) < 0;
        })
        .map(function (id) {
          return map[id];
        }),
      deleted: deleted,
    };
  }

  function removeCustomZone(data, zoneId) {
    if (!data || !zoneId || isStandardZone(zoneId)) return data;
    data.customZones = (data.customZones || []).filter(function (z) {
      return z && z.id !== zoneId;
    });
    if (data.rooms && Object.prototype.hasOwnProperty.call(data.rooms, zoneId)) {
      delete data.rooms[zoneId];
    }
    if (data.deletedRooms && Object.prototype.hasOwnProperty.call(data.deletedRooms, zoneId)) {
      delete data.deletedRooms[zoneId];
    }
    if (!Array.isArray(data.deletedCustomZones)) data.deletedCustomZones = [];
    if (data.deletedCustomZones.indexOf(zoneId) < 0) {
      data.deletedCustomZones.push(zoneId);
    }
    return data;
  }

  function mergeRoomsObject(
    prevRooms,
    incomingRooms,
    customZones,
    deletedRooms,
    incomingDeletedRooms
  ) {
    var out = {};
    STANDARD_ZONE_IDS.forEach(function (zone) {
      var prev = prevRooms && Array.isArray(prevRooms[zone]) ? prevRooms[zone] : [];
      var inc =
        incomingRooms && Array.isArray(incomingRooms[zone]) ? incomingRooms[zone] : null;
      out[zone] = parseRoomsArray(
        mergeRoomArraysByNumber(
          prev,
          inc || [],
          zone,
          deletedRooms,
          incomingDeletedRooms
        ),
        zone,
        deletedRooms
      );
    });
    (customZones || []).forEach(function (z) {
      if (!z || !z.id || isStandardZone(z.id)) return;
      var zone = z.id;
      var prev = prevRooms && Array.isArray(prevRooms[zone]) ? prevRooms[zone] : [];
      var inc =
        incomingRooms && Array.isArray(incomingRooms[zone]) ? incomingRooms[zone] : null;
      out[zone] = parseRoomsArray(
        mergeRoomArraysByNumber(
          prev,
          inc || [],
          zone,
          deletedRooms,
          incomingDeletedRooms
        ),
        zone,
        deletedRooms
      );
    });
    return out;
  }

  function mergeRemoteStorage(prev, incoming) {
    var base = normalize(prev || defaultData());
    if (!incoming || typeof incoming !== "object") return base;
    var merged = Object.assign({}, base);
    if (typeof incoming.notice === "string" || Array.isArray(incoming.noticeImages) || incoming.noticeImage != null || Object.prototype.hasOwnProperty.call(incoming, "noticeUpdatedAt")) {
      var noticePicked = pickNoticeFields(base, incoming);
      merged.notice = noticePicked.notice;
      merged.noticeImages = noticePicked.noticeImages;
      merged.noticeUpdatedAt = noticePicked.noticeUpdatedAt;
    } else {
      merged.notice = base.notice;
      merged.noticeImages = base.noticeImages;
      merged.noticeUpdatedAt = base.noticeUpdatedAt || "";
    }
    merged.noticeImage = (merged.noticeImages && merged.noticeImages[0]) || "";
    var mbInvPicked = pickMbInvNoticeFields(base, incoming);
    merged.mbInvNotice = mbInvPicked.mbInvNotice;
    merged.mbInvNoticeImages = mbInvPicked.mbInvNoticeImages;
    merged.mbInvNoticeUpdatedAt = mbInvPicked.mbInvNoticeUpdatedAt;
    merged.invenNotify = pickInvenNotify(base, incoming);
    if (Object.prototype.hasOwnProperty.call(incoming, "frontEmbedStates")) {
      merged.frontEmbedStates = mergeFrontEmbedStates(
        base.frontEmbedStates,
        incoming.frontEmbedStates
      );
    } else {
      merged.frontEmbedStates = normalizeFrontEmbedStates(base.frontEmbedStates);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "facilityMiscLog")) {
      if (incoming.facilityMiscLog && typeof incoming.facilityMiscLog === "object") {
        merged.facilityMiscLog = incoming.facilityMiscLog;
      } else {
        merged.facilityMiscLog = null;
      }
    } else {
      merged.facilityMiscLog = base.facilityMiscLog;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "facilityDailyFoundLog")) {
      if (incoming.facilityDailyFoundLog && typeof incoming.facilityDailyFoundLog === "object") {
        merged.facilityDailyFoundLog = incoming.facilityDailyFoundLog;
      } else {
        merged.facilityDailyFoundLog = null;
      }
    } else {
      merged.facilityDailyFoundLog = base.facilityDailyFoundLog;
    }
    if (incoming.zoneMemos && typeof incoming.zoneMemos === "object") {
      merged.zoneMemos = normalizeZoneMemos(incoming);
    } else if (!Object.prototype.hasOwnProperty.call(incoming, "zoneMemos")) {
      merged.zoneMemos = base.zoneMemos;
    }

    var baseCd =
      base.closeDayAt != null ? String(base.closeDayAt).trim() : "";
    var incCd =
      incoming.closeDayAt != null ? String(incoming.closeDayAt).trim() : "";
    // 마감 이후의 저장소가 더 최신이면, 마감 전 클라이언트 객실·존 데이터를 무시
    var incomingIsStaleClose =
      !!baseCd && (!incCd || String(incCd) < String(baseCd));
    if (incCd && (!baseCd || String(incCd) >= String(baseCd))) {
      merged.closeDayAt = incCd;
    } else {
      merged.closeDayAt = baseCd;
    }

    if (incomingIsStaleClose) {
      merged.customZones = base.customZones || [];
      merged.deletedCustomZones = base.deletedCustomZones || [];
      merged.deletedRooms = base.deletedRooms || {};
      merged.rooms = base.rooms || merged.rooms;
      // invenNotify / 공지 등은 위에서 이미 병합됨
    } else {
      var mergedDeletedCustom = mergeDeletedCustomZones(
        base.deletedCustomZones,
        Object.prototype.hasOwnProperty.call(incoming, "deletedCustomZones")
          ? incoming.deletedCustomZones
          : null
      );
      var zoneMerge = mergeCustomZonesById(
        base.customZones,
        Object.prototype.hasOwnProperty.call(incoming, "customZones")
          ? incoming.customZones
          : base.customZones,
        mergedDeletedCustom,
        Object.prototype.hasOwnProperty.call(incoming, "customZones")
          ? incoming.customZones
          : null
      );
      merged.customZones = zoneMerge.zones;
      merged.deletedCustomZones = zoneMerge.deleted;

      var mergedDeleted = mergeDeletedRoomsMaps(
        base.deletedRooms,
        Object.prototype.hasOwnProperty.call(incoming, "deletedRooms")
          ? incoming.deletedRooms
          : null
      );
      merged.deletedRooms = mergedDeleted;
      if (incoming.rooms && typeof incoming.rooms === "object") {
        merged.rooms = mergeRoomsObject(
          base.rooms,
          incoming.rooms,
          merged.customZones,
          mergedDeleted,
          Object.prototype.hasOwnProperty.call(incoming, "deletedRooms")
            ? incoming.deletedRooms
            : null
        );
      } else if (!Object.prototype.hasOwnProperty.call(incoming, "rooms")) {
        merged.rooms = base.rooms;
      }
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "requestDeskChat")) {
      merged.requestDeskChat = mergeRequestDeskChat(
        base.requestDeskChat,
        incoming.requestDeskChat
      );
    } else {
      merged.requestDeskChat = base.requestDeskChat || [];
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "orderDeskChat")) {
      merged.orderDeskChat = mergeRequestDeskChat(
        base.orderDeskChat,
        incoming.orderDeskChat
      );
    } else {
      merged.orderDeskChat = base.orderDeskChat || [];
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "mbCheckDeskChat")) {
      merged.mbCheckDeskChat = mergeRequestDeskChat(
        base.mbCheckDeskChat,
        incoming.mbCheckDeskChat
      );
    } else {
      merged.mbCheckDeskChat = base.mbCheckDeskChat || [];
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "facilityDeskChat")) {
      merged.facilityDeskChat = mergeRequestDeskChat(
        base.facilityDeskChat,
        incoming.facilityDeskChat
      );
    } else {
      merged.facilityDeskChat = base.facilityDeskChat || [];
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "facilityDeskChat")) {
      merged.facilityDeskChat = mergeRequestDeskChat(
        base.facilityDeskChat,
        incoming.facilityDeskChat
      );
    } else {
      merged.facilityDeskChat = base.facilityDeskChat || [];
    }
    merged.hotelInfo = pickHotelInfo(base, incoming);
    if (Object.prototype.hasOwnProperty.call(incoming, "gameRanks")) {
      merged.gameRanks = mergeGameRanks(base.gameRanks, incoming.gameRanks);
    } else {
      merged.gameRanks = normalizeGameRanks(base.gameRanks);
    }
    merged.complaintTypeAnalysis = pickComplaintTypeAnalysis(base, incoming);
    merged.trackIt = pickTrackIt(base, incoming);
    merged.nightHandover = pickNightHandover(base, incoming);
    merged.vipCheckIn = pickVipCheckIn(base, incoming);
    return normalize(merged);
  }

  function applyRemote(data) {
    var merged = mergeRemoteStorage(load(), data);
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }

  /** 마감 시 병합 없이 저장소 전체를 교체 (특이객실·메모 등 완전 리셋) */
  function replaceRemote(data) {
    var next = normalize(data || defaultData());
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  global.HKStorage = {
    key: STORAGE_KEY,
    load: load,
    save: save,
    applyRemote: applyRemote,
    replaceRemote: replaceRemote,
    mergeFrontEmbedStates: mergeFrontEmbedStates,
    isClearedFrontEmbedEntry: isClearedFrontEmbedEntry,
    frontEmbedClearId: frontEmbedClearId,
    frontEmbedContentSig: frontEmbedContentSig,
    hasFrontEmbedPayload: hasFrontEmbedPayload,
    frontEmbedNonClearMayReplaceClear: frontEmbedNonClearMayReplaceClear,
    defaultData: defaultData,
    defaultRoom: defaultRoom,
    stampRoom: stampRoom,
    roomActivityAt: roomActivityAt,
    isRoomAfterCloseDay: isRoomAfterCloseDay,
    isAtOrAfterCloseDay: isAtOrAfterCloseDay,
    filterLogEntriesAfterCloseDay: filterLogEntriesAfterCloseDay,
    filterRoomsObjectAfterCloseDay: filterRoomsObjectAfterCloseDay,
    parseTime24: parseTime24,
    isStandardZone: isStandardZone,
    getZoneOrder: getZoneOrder,
    getAllZoneIds: getAllZoneIds,
    getZoneLabel: getZoneLabel,
    getZoneLabelsMap: getZoneLabelsMap,
    makeCustomZoneId: makeCustomZoneId,
    removeCustomZone: removeCustomZone,
    markRoomDeleted: markRoomDeleted,
    unmarkRoomDeleted: unmarkRoomDeleted,
    normalizeNoticeImages: normalizeNoticeImages,
    pickNoticeFields: pickNoticeFields,
    stampNotice: stampNotice,
    normalizeMbInvNoticeImages: normalizeMbInvNoticeImages,
    pickMbInvNoticeFields: pickMbInvNoticeFields,
    stampMbInvNotice: stampMbInvNotice,
    normalizeFrontEmbedStates: normalizeFrontEmbedStates,
    mergeFrontEmbedStates: mergeFrontEmbedStates,
    normalizeRequestDeskChat: normalizeRequestDeskChat,
    normalizeHotelInfo: normalizeHotelInfo,
    defaultHotelInfo: defaultHotelInfo,
    normalizeGameRanks: normalizeGameRanks,
    defaultGameRanks: defaultGameRanks,
    mergeGameRanks: mergeGameRanks,
    GAME_RANK_IDS: GAME_RANK_IDS,
    normalizeComplaintTypeAnalysis: normalizeComplaintTypeAnalysis,
    defaultComplaintTypeAnalysis: defaultComplaintTypeAnalysis,
    mergeComplaintTypeAnalysis: mergeComplaintTypeAnalysis,
    COMPLAINT_TYPE_IDS: COMPLAINT_TYPE_IDS,
    normalizeTrackIt: normalizeTrackIt,
    defaultTrackIt: defaultTrackIt,
    mergeTrackIt: mergeTrackIt,
    normalizeNightHandover: normalizeNightHandover,
    normalizeNightHandoverDay: normalizeNightHandoverDay,
    defaultNightHandover: defaultNightHandover,
    normalizeVipCheckIn: normalizeVipCheckIn,
    normalizeVipCheckInDay: normalizeVipCheckInDay,
    defaultVipCheckIn: defaultVipCheckIn,
    pad2: pad2,
    formatDateKey: formatDateKey,
    defaultOpsDateKey: defaultOpsDateKey,
    dateKeyToDisplay: dateKeyToDisplay,
    parseTitleDateToKey: parseTitleDateToKey,
  };
})(typeof window !== "undefined" ? window : this);
