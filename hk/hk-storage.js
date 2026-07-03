/**
 * House Keeping 공지·구역별 객실 — localStorage + 서버 /api/sync (hk-sync.js)
 * 객실: { number, status, memo1, memo2, time? }
 * time: 메인「정비관리」에서만 입력 (24시간, 빈 문자면 미입력). 14:30·1400·1430 등
 * 키: lotte-hk-v1
 */
(function (global) {
  var STORAGE_KEY = "lotte-hk-v1";
  var STANDARD_ZONE_IDS = ["VIP", "RC", "CASINO", "MOBILE_CI"];
  var STANDARD_ZONE_LABELS = {
    VIP: "VIP",
    RC: "R/C",
    CASINO: "CASINO",
    MOBILE_CI: "모바일체크인",
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

  function parseRoomsArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(parseRoomEntry)
      .filter(function (room) {
        return room.number.length > 0;
      })
      .sort(function (a, b) {
        return a.number.localeCompare(b.number, undefined, { numeric: true });
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

  function defaultData() {
    return {
      notice:
        "공지 내용을 여기에 표시합니다. (우측 상단 관리자에서 수정할 수 있습니다.)",
      noticeImage: "",
      noticeImages: [],
      mbInvNotice: "",
      mbInvNoticeImages: [],
      invenNotify: null,
      zoneMemos: { VIP: defaultZoneMemo() },
      customZones: [],
      rooms: {
        VIP: [],
        RC: [],
        CASINO: [],
        MOBILE_CI: [],
      },
    };
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
    }
    return d;
  }

  function normalize(data) {
    var d = defaultData();
    if (!data || typeof data !== "object") return d;
    if (typeof data.notice === "string") d.notice = data.notice;
    d.noticeImages = normalizeNoticeImages(data);
    d.noticeImage = d.noticeImages[0] || "";
    if (typeof data.mbInvNotice === "string") d.mbInvNotice = data.mbInvNotice;
    d.mbInvNoticeImages = normalizeMbInvNoticeImages(data);
    if (data.invenNotify && typeof data.invenNotify === "object") {
      d.invenNotify = data.invenNotify;
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
    if (r && typeof r === "object") {
      Object.keys(r).forEach(function (k) {
        if (isStandardZone(k)) return;
        if (customById[k]) return;
        if (!Array.isArray(r[k])) return;
        var orphan = { id: k, label: labelFromZoneId(k) };
        customById[k] = orphan;
        customZones.push(orphan);
      });
    }

    d.customZones = customZones;

    STANDARD_ZONE_IDS.forEach(function (k) {
      if (r && Array.isArray(r[k])) {
        d.rooms[k] = parseRoomsArray(r[k]);
      }
    });

    customZones.forEach(function (z) {
      d.rooms[z.id] =
        r && Array.isArray(r[z.id]) ? parseRoomsArray(r[z.id]) : [];
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

  function mergeRemoteStorage(prev, incoming) {
    var base = normalize(prev || defaultData());
    if (!incoming || typeof incoming !== "object") return base;
    var merged = Object.assign({}, base);
    if (typeof incoming.notice === "string") merged.notice = incoming.notice;
    if (Array.isArray(incoming.noticeImages)) {
      merged.noticeImages = normalizeNoticeImages(incoming);
    } else if (incoming.noticeImage != null) {
      merged.noticeImages = normalizeNoticeImages({
        noticeImage: incoming.noticeImage,
        noticeImages: base.noticeImages,
      });
    }
    merged.noticeImage = merged.noticeImages[0] || "";
    if (typeof incoming.mbInvNotice === "string") {
      merged.mbInvNotice = incoming.mbInvNotice;
    } else if (!Object.prototype.hasOwnProperty.call(incoming, "mbInvNotice")) {
      merged.mbInvNotice = base.mbInvNotice;
    }
    if (Array.isArray(incoming.mbInvNoticeImages)) {
      merged.mbInvNoticeImages = normalizeMbInvNoticeImages(incoming);
    } else if (!Object.prototype.hasOwnProperty.call(incoming, "mbInvNoticeImages")) {
      merged.mbInvNoticeImages = base.mbInvNoticeImages;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "invenNotify")) {
      if (incoming.invenNotify && typeof incoming.invenNotify === "object") {
        merged.invenNotify = incoming.invenNotify;
      } else {
        merged.invenNotify = null;
      }
    } else {
      merged.invenNotify = base.invenNotify;
    }
    if (incoming.zoneMemos && typeof incoming.zoneMemos === "object") {
      merged.zoneMemos = normalizeZoneMemos(incoming);
    } else if (!Object.prototype.hasOwnProperty.call(incoming, "zoneMemos")) {
      merged.zoneMemos = base.zoneMemos;
    }
    if (incoming.rooms && typeof incoming.rooms === "object") {
      merged.rooms = incoming.rooms;
    }
    if (Array.isArray(incoming.customZones)) {
      merged.customZones = incoming.customZones.slice();
    }
    return normalize(merged);
  }

  function applyRemote(data) {
    var merged = mergeRemoteStorage(load(), data);
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }

  global.HKStorage = {
    key: STORAGE_KEY,
    load: load,
    save: save,
    applyRemote: applyRemote,
    defaultData: defaultData,
    defaultRoom: defaultRoom,
    parseTime24: parseTime24,
    isStandardZone: isStandardZone,
    getZoneOrder: getZoneOrder,
    getAllZoneIds: getAllZoneIds,
    getZoneLabel: getZoneLabel,
    getZoneLabelsMap: getZoneLabelsMap,
    makeCustomZoneId: makeCustomZoneId,
    normalizeNoticeImages: normalizeNoticeImages,
  };
})(typeof window !== "undefined" ? window : this);
