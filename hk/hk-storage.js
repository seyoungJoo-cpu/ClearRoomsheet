/**
 * House Keeping 공지·구역별 객실 — localStorage + 서버 /api/sync (hk-sync.js)
 * 객실: { number, status, memo1, memo2, time? }
 * time: 메인「정비관리」에서만 입력 (24시간, 빈 문자면 미입력). 14:30·1400·1430 등
 * 키: lotte-hk-v1
 */
(function (global) {
  var STORAGE_KEY = "lotte-hk-v1";
  var STANDARD_ZONE_IDS = ["VIP", "RC", "CASINO", "MOBILE_CI", "AJ"];
  var STANDARD_ZONE_LABELS = {
    VIP: "VIP",
    RC: "R/C",
    CASINO: "CASINO",
    MOBILE_CI: "모바일체크인",
    AJ: "AJ객실",
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
    };
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
      out.push({
        id: id,
        at: at,
        by: m.by != null ? String(m.by) : "",
        text: m.text != null ? String(m.text) : "",
      });
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
      if (tb >= ta) map[m.id] = m;
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
      var ta = new Date(a.updatedAt || 0).getTime();
      var tb = new Date(b.updatedAt || 0).getTime();
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      // __cleared 마커도 updatedAt으로 비교해 유지 (옛 데이터가 되살아나지 않게)
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
      hotelInfo: defaultHotelInfo(),
      closeDayAt: "",
      deletedCustomZones: [],
      rooms: {
        VIP: [],
        RC: [],
        CASINO: [],
        MOBILE_CI: [],
        AJ: [],
      },
    };
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
    d.hotelInfo = normalizeHotelInfo(data.hotelInfo);

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
    merged.hotelInfo = pickHotelInfo(base, incoming);
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
    defaultData: defaultData,
    defaultRoom: defaultRoom,
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
  };
})(typeof window !== "undefined" ? window : this);
