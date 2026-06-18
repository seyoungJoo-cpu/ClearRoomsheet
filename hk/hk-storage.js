/**
 * House Keeping 공지·구역별 객실 — localStorage + 서버 /api/sync (hk-sync.js)
 * 객실: { number, status, memo1, memo2, time? }
 * time: 메인「정비관리」에서만 입력 (24시간, 빈 문자면 미입력). 14:30·1400·1430 등
 * 키: lotte-hk-v1
 */
(function (global) {
  var STORAGE_KEY = "lotte-hk-v1";

  function defaultRoom() {
    return {
      number: "",
      status: "",
      memo1: "",
      memo2: "",
      time: "",
    };
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

  function defaultData() {
    return {
      notice:
        "공지 내용을 여기에 표시합니다. (우측 상단 관리자에서 수정할 수 있습니다.)",
      rooms: {
        VIP: [],
        RC: [],
        CASINO: [],
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
      d.time = x.time != null ? normalizeTimeField(x.time) : "";
    }
    return d;
  }

  function normalize(data) {
    var d = defaultData();
    if (!data || typeof data !== "object") return d;
    if (typeof data.notice === "string") d.notice = data.notice;
    var r = data.rooms;
    if (r && typeof r === "object") {
      ["VIP", "RC", "CASINO"].forEach(function (k) {
        if (Array.isArray(r[k])) {
          d.rooms[k] = r[k]
            .map(parseRoomEntry)
            .filter(function (room) {
              return room.number.length > 0;
            });
          d.rooms[k].sort(function (a, b) {
            return a.number.localeCompare(b.number, undefined, {
              numeric: true,
            });
          });
        }
      });
    }
    return d;
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

  function applyRemote(data) {
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(data)));
  }

  global.HKStorage = {
    key: STORAGE_KEY,
    load: load,
    save: save,
    applyRemote: applyRemote,
    defaultData: defaultData,
    defaultRoom: defaultRoom,
    parseTime24: parseTime24,
  };
})(typeof window !== "undefined" ? window : this);
