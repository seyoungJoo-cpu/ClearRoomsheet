/**
 * VIP 체크인 리스트 — 웹 폼 작성 · 저장 시 HKStorage 동기화
 * 프론트 모드에서만 편집 · 마감해도 유지(초기화 버튼으로만 삭제)
 */
(function (global) {
  var DEFAULT_GUEST_ROWS = 4;
  var MIN_GUEST_ROWS = 1;
  var DEFAULT_CONNECTING_ROOMS = [
    "923-925",
    "936-938",
    "857-858",
    "1220-1222",
    "1120-1122",
    "1210-1216",
  ];
  var DEFAULT_CONNECTING_SLOTS = DEFAULT_CONNECTING_ROOMS.length;
  var CONNECTING_PER_ROW = 2;
  var MIN_CONNECTING_SLOTS = 2;
  var MIN_REMARK_ROWS = 1;

  var GUEST_FIELDS = [
    "guestName",
    "roomNo",
    "roomStatus",
    "roomType",
    "rsvNo",
    "eta",
    "checkOut",
    "remark",
  ];

  var DEFAULT_REMARK_ROWS = [
    { id: "specialNote", label: "특이사항", value: "", highlight: "" },
    { id: "aj", label: "AJ", value: "", highlight: "" },
    { id: "mb", label: "MB", value: "", highlight: "" },
    { id: "welcomeCard", label: "웰컴카드 (VOUPS 2,3)", value: "", highlight: "" },
    { id: "lateCo", label: "LATE C/O", value: "", highlight: "" },
    { id: "earlyCi", label: "얼리체크인", value: "", highlight: "" },
    { id: "casino", label: "카지노", value: "", highlight: "" },
    { id: "seminar", label: "세미나 / 단체", value: "", highlight: "" },
    { id: "business", label: "출장", value: "", highlight: "green" },
    { id: "dami", label: "답사 룸쇼", value: "", highlight: "" },
    { id: "tongTeam", label: "롱텀", value: "", highlight: "" },
  ];
  var REMARK_KEYS = DEFAULT_REMARK_ROWS;
  var FIXED_REMARK_IDS = {
    specialNote: true,
  };

  var opts = {
    isFrontMode: function () {
      return false;
    },
    toast: function () {},
    getRoomStatus: null,
  };
  var bound = false;
  var dirty = false;
  var guestCount = DEFAULT_GUEST_ROWS;
  var connectingCount = DEFAULT_CONNECTING_SLOTS;
  var remarkCount = DEFAULT_REMARK_ROWS.length;
  var currentDateKey = "";
  var VIP_COL_WIDTHS_KEY = "hk-vip-col-widths-v1";
  var colResizeBound = false;
  var guestColWidthsLive = null;

  function hs() {
    return global.HKStorage || null;
  }

  function opsDateKey(now) {
    var s = hs();
    if (s && typeof s.defaultOpsDateKey === "function") return s.defaultOpsDateKey(now);
    now = now || new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() >= 17) d.setDate(d.getDate() + 1);
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function displayFromKey(key) {
    var s = hs();
    if (s && typeof s.dateKeyToDisplay === "function") return s.dateKeyToDisplay(key);
    var m = String(key || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return String(key || "");
    return Number(m[2]) + "/" + Number(m[3]);
  }

  function yearFromKey(key) {
    var m = String(key || "").match(/^(\d{4})-/);
    return m ? m[1] : String(new Date().getFullYear());
  }

  function emptyGuest(section) {
    return {
      section: section != null ? String(section) : "",
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

  function emptyConnecting(rooms) {
    return {
      rooms: rooms != null ? String(rooms) : "",
      midDoor: "중간문",
      status: "CLOSE",
      openNote: "",
    };
  }

  function defaultTitleDate(d) {
    return displayFromKey(opsDateKey(d));
  }

  function defaultGuests() {
    var list = [];
    var i;
    for (i = 0; i < DEFAULT_GUEST_ROWS; i++) list.push(emptyGuest(""));
    return list;
  }

  function defaultConnecting() {
    return DEFAULT_CONNECTING_ROOMS.map(function (r) {
      return emptyConnecting(r);
    });
  }

  function defaultRemarkRows() {
    return DEFAULT_REMARK_ROWS.map(function (r) {
      return {
        id: r.id,
        label: r.label,
        value: "",
        highlight: r.highlight || "",
      };
    });
  }

  function emptyRemarkRow() {
    return {
      id: "extra_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      label: "",
      value: "",
      highlight: "",
    };
  }

  function defaultData(dateKey) {
    var key = dateKey || currentDateKey || opsDateKey();
    return {
      updatedAt: "",
      dateKey: key,
      titleDate: displayFromKey(key),
      titleYear: yearFromKey(key),
      guests: defaultGuests(),
      connecting: defaultConnecting(),
      remarkRows: defaultRemarkRows(),
      /* 하위호환 */
      remarks: {},
      ajList: [""],
      mbList: [""],
      sections: { V4: [], EI: [], SA: [], NPS: [] },
      aj: { main: "", annex: "" },
      mb: "",
    };
  }

  function canEdit() {
    return !!opts.isFrontMode();
  }

  function loadPack() {
    if (!global.HKStorage || !global.HKStorage.load) {
      return { activeDate: opsDateKey(), updatedAt: "", byDate: {} };
    }
    var data = global.HKStorage.load();
    if (typeof global.HKStorage.normalizeVipCheckIn === "function") {
      return global.HKStorage.normalizeVipCheckIn(data.vipCheckIn);
    }
    return data.vipCheckIn && typeof data.vipCheckIn === "object"
      ? data.vipCheckIn
      : { activeDate: opsDateKey(), updatedAt: "", byDate: {} };
  }

  function normalizeDay(raw) {
    if (typeof global.HKStorage.normalizeVipCheckInDay === "function") {
      return global.HKStorage.normalizeVipCheckInDay(raw);
    }
    return raw && typeof raw === "object" ? raw : defaultData();
  }

  function prevDateKey(key) {
    var m = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() - 1);
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function filledStr(v) {
    return String(v == null ? "" : v).trim() !== "";
  }

  function guestHasContent(g) {
    if (!g) return false;
    return !!(
      filledStr(g.section) ||
      filledStr(g.guestName) ||
      filledStr(g.roomNo) ||
      filledStr(g.roomType) ||
      filledStr(g.rsvNo) ||
      filledStr(g.eta) ||
      filledStr(g.checkOut) ||
      filledStr(g.remark)
    );
  }

  function connectingHasContent(list) {
    if (!Array.isArray(list) || !list.length) return false;
    var defaults = defaultConnecting();
    var i;
    for (i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var status = String(c.status || "CLOSE").toUpperCase();
      if (status === "OPEN") return true;
      if (filledStr(c.openNote)) return true;
      var rooms = String(c.rooms || "").trim();
      var def = defaults[i];
      if (!def) {
        if (rooms) return true;
        continue;
      }
      if (rooms !== String(def.rooms || "").trim()) return true;
    }
    return false;
  }

  function remarksHaveContent(pack) {
    var rows = normalizeRemarkRows(pack || {});
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      if (filledStr(r.value)) return true;
      var def = DEFAULT_REMARK_ROWS[i];
      if (!def && filledStr(r.label)) return true;
      if (def && filledStr(r.label) && String(r.label).trim() !== String(def.label || "").trim()) {
        return true;
      }
    }
    return false;
  }

  function dayHasContent(day) {
    if (!day || typeof day !== "object") return false;
    var guests = day.guests || [];
    var i;
    for (i = 0; i < guests.length; i++) {
      if (guestHasContent(guests[i])) return true;
    }
    if (connectingHasContent(day.connecting)) return true;
    if (remarksHaveContent(day)) return true;
    return false;
  }

  function cloneDayForKey(src, dateKey) {
    var raw;
    try {
      raw = JSON.parse(JSON.stringify(src || {}));
    } catch (e) {
      raw = src || {};
    }
    var day = normalizeDay(raw);
    day.dateKey = dateKey;
    day.titleDate = displayFromKey(dateKey);
    day.titleYear = yearFromKey(dateKey);
    day.updatedAt = "";
    return day;
  }

  function persistSeededDay(day, key) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var pack = loadPack();
    var ui = pack.ui && typeof pack.ui === "object" ? pack.ui : {};
    day = normalizeDay(day || defaultData(key));
    day.dateKey = key;
    day.titleDate = displayFromKey(key);
    day.titleYear = yearFromKey(key);
    day.updatedAt = new Date().toISOString();
    if (!pack.byDate || typeof pack.byDate !== "object") pack.byDate = {};
    pack.byDate[key] = day;
    if (!pack.activeDate) pack.activeDate = key;
    pack.updatedAt = day.updatedAt;
    pack.ui = ui;
    if (typeof global.HKStorage.normalizeVipCheckIn === "function") {
      pack = global.HKStorage.normalizeVipCheckIn(pack);
    }
    data.vipCheckIn = pack;
    global.HKStorage.save(data);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
  }

  /** @param {boolean} [allowSeed=false] — seed from prev only for UI open/nav */
  function dayFromPack(pack, dateKey, allowSeed) {
    pack = pack || loadPack();
    var key = dateKey || currentDateKey || pack.activeDate || opsDateKey();
    var byDate = pack.byDate && typeof pack.byDate === "object" ? pack.byDate : {};
    var found = byDate[key];
    var day = found ? normalizeDay(found) : defaultData(key);
    day.dateKey = key;
    day.titleDate = displayFromKey(key);
    day.titleYear = yearFromKey(key);

    if (!allowSeed || dayHasContent(day)) return day;
    if (found && String(found.updatedAt || "").trim()) return day;

    var prevKey = prevDateKey(key);
    if (!prevKey || !byDate[prevKey]) return day;
    var prev = normalizeDay(byDate[prevKey]);
    if (!dayHasContent(prev)) return day;

    var seeded = cloneDayForKey(prev, key);
    persistSeededDay(seeded, key);
    if (typeof opts.toast === "function") {
      opts.toast("전날 내용을 이 날짜로 이어받았습니다");
    }
    return seeded;
  }

  function lookupRoomStatus(roomNo) {
    if (typeof opts.getRoomStatus !== "function") return "";
    try {
      var st = opts.getRoomStatus(roomNo);
      st = String(st == null ? "" : st).trim().toUpperCase();
      if (st === "IP" || st === "CL" || st === "PU" || st === "DI" || st === "OS" || st === "OO") {
        return st;
      }
      return "";
    } catch (e) {
      return "";
    }
  }

  function setRoomStatusDisplay(rowIdx, status) {
    var hid = document.getElementById(guestId(rowIdx, "roomStatus"));
    if (hid) hid.value = status || "";
    var badge = document.querySelector('[data-vip-room-status-display="' + rowIdx + '"]');
    if (badge) {
      var show = status || "—";
      badge.textContent = show;
      badge.className =
        "vip-room-status-badge hk-st-badge hk-st--" +
        (status ? String(status).toLowerCase() : "none");
    }
  }

  function refreshRoomStatusForRow(rowIdx) {
    var roomNo = val(guestId(rowIdx, "roomNo"));
    var st = lookupRoomStatus(roomNo);
    setRoomStatusDisplay(rowIdx, st);
  }

  function refreshAllRoomStatuses() {
    var i;
    for (i = 0; i < guestCount; i++) {
      refreshRoomStatusForRow(i);
    }
  }

  function syncDateInputs(dateKey) {
    var key = dateKey || currentDateKey || opsDateKey();
    setVal("vipTitleDate", displayFromKey(key));
    setVal("vipTitleYear", yearFromKey(key));
    var dateInput = document.getElementById("vipDateInput");
    if (dateInput) dateInput.value = key;
  }

  function persist(dayDoc, silentToast) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var pack = loadPack();
    var ui = pack.ui && typeof pack.ui === "object" ? pack.ui : {};
    var key = currentDateKey || pack.activeDate || opsDateKey();
    currentDateKey = key;
    var day = dayDoc || collectFromDom();
    day.dateKey = key;
    day.titleDate = displayFromKey(key);
    day.titleYear = yearFromKey(key);
    day.updatedAt = new Date().toISOString();
    day = normalizeDay(day);
    day.dateKey = key;
    day.titleDate = displayFromKey(key);
    day.titleYear = yearFromKey(key);
    if (!pack.byDate || typeof pack.byDate !== "object") pack.byDate = {};
    pack.byDate[key] = day;
    pack.activeDate = key;
    pack.updatedAt = day.updatedAt;
    pack.ui = ui;
    if (typeof global.HKStorage.normalizeVipCheckIn === "function") {
      pack = global.HKStorage.normalizeVipCheckIn(pack);
    }
    data.vipCheckIn = pack;
    global.HKStorage.save(data);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
    dirty = false;
    syncDirtyUi();
    syncDateInputs(key);
    if (!silentToast && typeof opts.toast === "function") {
      opts.toast("VIP 체크인 리스트 저장 · 동기화됨");
    }
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "") : "";
  }

  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el) el.value = v != null ? String(v) : "";
  }

  function autosizeTextarea(el) {
    if (!el || el.tagName !== "TEXTAREA") return;
    el.style.height = "0px";
    el.style.height = Math.max(28, el.scrollHeight) + "px";
  }

  function autosizeAllIn(root) {
    if (!root) return;
    root.querySelectorAll("textarea").forEach(autosizeTextarea);
  }

  function guestId(row, field) {
    return "vipGuest_" + row + "_" + field;
  }

  function collectGuestsFromDom() {
    var guests = [];
    var tbody = document.getElementById("vipGuestsBody");
    if (!tbody) return guests;
    var rows = tbody.querySelectorAll("tr[data-vip-guest-row]");
    rows.forEach(function (tr, i) {
      var g = emptyGuest();
      g.mergePrev = tr.getAttribute("data-merge-prev") === "1";
      g.section = val(guestId(i, "section"));
      if (g.mergePrev && guests.length) g.section = guests[guests.length - 1].section || g.section;
      else if (!g.section) g.section = tr.getAttribute("data-section") || "";
      GUEST_FIELDS.forEach(function (f) {
        g[f] = val(guestId(i, f));
      });
      guests.push(g);
    });
    guestCount = guests.length || guestCount;
    return guests;
  }

  function collectConnectingFromDom() {
    var list = [];
    var i;
    for (i = 0; i < connectingCount; i++) {
      var statusBtn = document.querySelector('[data-vip-conn-status="' + i + '"]');
      var status = statusBtn ? String(statusBtn.getAttribute("data-status") || "CLOSE") : "CLOSE";
      if (status !== "OPEN") status = "CLOSE";
      list.push({
        rooms: val("vipConnRooms_" + i),
        midDoor: "중간문",
        status: status,
        openNote: val("vipConnOpenNote_" + i),
      });
    }
    return list;
  }

  function collectRemarkRowsFromDom() {
    var rows = [];
    var i;
    for (i = 0; i < remarkCount; i++) {
      rows.push({
        id: val("vipRemarkId_" + i) || "extra_" + i,
        label: val("vipRemarkLabel_" + i),
        value: val("vipRemarkValue_" + i),
        highlight: val("vipRemarkHighlight_" + i) || "",
      });
    }
    if (!rows.length) rows = defaultRemarkRows();
    return rows;
  }

  function syncLegacyRemarks(rows) {
    var remarks = {};
    var ajList = [];
    var mbList = [];
    (rows || []).forEach(function (r) {
      if (!r) return;
      var id = r.id || "";
      var label = String(r.label || "").trim();
      var value = r.value != null ? String(r.value) : "";
      if (id === "aj" || label === "AJ") {
        ajList.push(value);
        remarks.aj = ajList.filter(Boolean).join("\n");
      } else if (id === "mb" || label === "MB") {
        mbList.push(value);
        remarks.mb = mbList.filter(Boolean).join("\n");
      } else if (id) {
        remarks[id] = value;
      }
    });
    if (!ajList.length) {
      ajList = [""];
      remarks.aj = remarks.aj || "";
    }
    if (!mbList.length) {
      mbList = [""];
      remarks.mb = remarks.mb || "";
    }
    return {
      remarks: remarks,
      ajList: ajList,
      mbList: mbList,
      aj: { main: remarks.aj || "", annex: "" },
      mb: remarks.mb || "",
    };
  }

  function collectFromDom() {
    var base = defaultData(currentDateKey || opsDateKey());
    base.dateKey = currentDateKey || base.dateKey;
    base.titleDate = displayFromKey(base.dateKey);
    base.titleYear = yearFromKey(base.dateKey);
    base.guests = collectGuestsFromDom();
    base.connecting = collectConnectingFromDom();
    base.remarkRows = collectRemarkRowsFromDom();
    var legacy = syncLegacyRemarks(base.remarkRows);
    base.remarks = legacy.remarks;
    base.ajList = legacy.ajList;
    base.mbList = legacy.mbList;
    base.aj = legacy.aj;
    base.mb = legacy.mb;
    base.sections = guestsToLegacySections(base.guests);
    return base;
  }

  function guestsToLegacySections(guests) {
    var sections = { V4: [], EI: [], SA: [], NPS: [] };
    (guests || []).forEach(function (g) {
      if (!g) return;
      var key = String(g.section || "").trim().toUpperCase();
      if (!sections[key]) key = "NPS";
      sections[key].push({
        guestName: g.guestName || "",
        roomNo: g.roomNo || "",
        roomStatus: g.roomStatus || "",
        roomType: g.roomType || "",
        rsvNo: g.rsvNo || "",
        eta: g.eta || "",
        checkOut: g.checkOut || "",
        remark: g.remark || "",
      });
    });
    return sections;
  }

  function rebuildGuestsBody(guests) {
    var tbody = document.getElementById("vipGuestsBody");
    if (!tbody) return;
    guests = Array.isArray(guests) && guests.length ? guests : defaultGuests();
    guestCount = Math.max(MIN_GUEST_ROWS, guests.length);
    tbody.innerHTML = "";

    var spans = [];
    var i = 0;
    while (i < guestCount) {
      var span = 1;
      var j = i + 1;
      while (j < guestCount && guests[j] && guests[j].mergePrev) {
        span++;
        j++;
      }
      spans[i] = span;
      i = j;
    }

    for (i = 0; i < guestCount; i++) {
      var g = guests[i] || emptyGuest();
      var tr = document.createElement("tr");
      tr.setAttribute("data-vip-guest-row", String(i));
      tr.setAttribute("data-merge-prev", g.mergePrev ? "1" : "0");
      tr.setAttribute("data-section", g.section || "");
      var cells = "";
      cells +=
        '<td class="vip-select-cell"><input type="checkbox" class="vip-row-check" data-vip-guest-check="' +
        i +
        '" aria-label="행 선택" /></td>';

      if (!g.mergePrev) {
        var rs = spans[i] || 1;
        cells +=
          '<td class="vip-sec-label" rowspan="' +
          rs +
          '">' +
          '<textarea id="' +
          guestId(i, "section") +
          '" rows="1" class="vip-sec-input nh-autosize" autocomplete="off" aria-label="구분"></textarea>' +
          "</td>";
      } else {
        cells +=
          '<textarea id="' +
          guestId(i, "section") +
          '" hidden></textarea>';
      }

      GUEST_FIELDS.forEach(function (f) {
        if (f === "roomStatus") {
          cells +=
            '<td class="vip-room-status-cell">' +
            '<input type="hidden" id="' +
            guestId(i, "roomStatus") +
            '" value="" />' +
            '<span class="vip-room-status-badge hk-st-badge hk-st--none" data-vip-room-status-display="' +
            i +
            '" aria-label="Room 상태">—</span>' +
            "</td>";
          return;
        }
        cells +=
          '<td><textarea id="' +
          guestId(i, f) +
          '" class="nh-autosize' +
          (f === "remark" ? " vip-guest-remark" : "") +
          '" rows="1" autocomplete="off"></textarea></td>';
      });
      cells +=
        '<td class="nh-row-actions">' +
        '<button type="button" class="nh-row-btn nh-row-btn--minus" data-vip-guest-remove="' +
        i +
        '" title="행 삭제" aria-label="행 삭제">−</button>' +
        "</td>";
      tr.innerHTML = cells;
      tbody.appendChild(tr);
      setVal(guestId(i, "section"), g.section);
      GUEST_FIELDS.forEach(function (f) {
        if (f === "roomStatus") return;
        setVal(guestId(i, f), g[f]);
      });
      setRoomStatusDisplay(i, lookupRoomStatus(g.roomNo) || "");
    }
    autosizeAllIn(tbody);
  }

  function rebuildConnectingBody(connecting) {
    var tbody = document.getElementById("vipConnectingBody");
    if (!tbody) return;
    connecting = Array.isArray(connecting) && connecting.length ? connecting : defaultConnecting();
    connectingCount = Math.max(MIN_CONNECTING_SLOTS, connecting.length);
    if (connectingCount % CONNECTING_PER_ROW !== 0) {
      connectingCount += CONNECTING_PER_ROW - (connectingCount % CONNECTING_PER_ROW);
    }
    while (connecting.length < connectingCount) connecting.push(emptyConnecting());

    tbody.innerHTML = "";
    var rowIdx;
    for (rowIdx = 0; rowIdx < connectingCount; rowIdx += CONNECTING_PER_ROW) {
      var tr = document.createElement("tr");
      var html = "";
      var c;
      for (c = 0; c < CONNECTING_PER_ROW; c++) {
        var idx = rowIdx + c;
        var item = connecting[idx] || emptyConnecting();
        var status = String(item.status || "CLOSE").toUpperCase() === "OPEN" ? "OPEN" : "CLOSE";
        html +=
          '<td><textarea class="vip-conn-rooms" id="vipConnRooms_' +
          idx +
          '" rows="1" placeholder="예: 923-925" autocomplete="off"></textarea></td>' +
          '<td class="vip-conn-mid">중간문</td>' +
          '<td class="vip-conn-status-cell">' +
          '<button type="button" class="vip-conn-status ' +
          (status === "OPEN" ? "is-open" : "is-close") +
          '" data-vip-conn-status="' +
          idx +
          '" data-status="' +
          status +
          '" aria-label="커넥팅 상태 전환">' +
          status +
          "</button>" +
          '<input type="text" class="vip-conn-open-note' +
          (status === "OPEN" ? " is-visible" : "") +
          '" id="vipConnOpenNote_' +
          idx +
          '" placeholder="~日" autocomplete="off" aria-label="OPEN 메모" />' +
          "</td>";
      }
      html +=
        '<td class="nh-row-actions">' +
        '<button type="button" class="nh-row-btn nh-row-btn--minus" data-vip-conn-remove-row="' +
        rowIdx +
        '" title="행 삭제" aria-label="커넥팅 행 삭제">−</button>' +
        "</td>";
      tr.innerHTML = html;
      tbody.appendChild(tr);
      for (c = 0; c < CONNECTING_PER_ROW; c++) {
        var idx2 = rowIdx + c;
        setVal("vipConnRooms_" + idx2, (connecting[idx2] && connecting[idx2].rooms) || "");
        setVal("vipConnOpenNote_" + idx2, (connecting[idx2] && connecting[idx2].openNote) || "");
      }
    }
    autosizeAllIn(tbody);
  }

  function rebuildRemarksBody(rows) {
    var tbody = document.getElementById("vipRemarksBody");
    if (!tbody) return;
    rows = ensureSpecialNoteRow(Array.isArray(rows) && rows.length ? rows : defaultRemarkRows());
    remarkCount = Math.max(MIN_REMARK_ROWS, rows.length);
    tbody.innerHTML = "";
    var i;
    for (i = 0; i < remarkCount; i++) {
      var r = rows[i] || emptyRemarkRow();
      var fixed = !!(r.id && FIXED_REMARK_IDS[r.id]);
      if (fixed && r.id === "specialNote") r.label = "특이사항";
      var tr = document.createElement("tr");
      if (r.highlight === "green") tr.className = "vip-row--green";
      tr.innerHTML =
        '<th scope="row" class="vip-remark-label">' +
        '<input type="hidden" id="vipRemarkId_' +
        i +
        '" />' +
        '<input type="hidden" id="vipRemarkHighlight_' +
        i +
        '" />' +
        '<textarea id="vipRemarkLabel_' +
        i +
        '" class="nh-autosize vip-remark-label-input' +
        (fixed ? " is-fixed-label" : "") +
        '" rows="1" autocomplete="off" aria-label="구분"' +
        (fixed ? " readonly" : "") +
        "></textarea>" +
        "</th>" +
        '<td><textarea id="vipRemarkValue_' +
        i +
        '" class="nh-autosize" rows="1" autocomplete="off"></textarea></td>' +
        '<td class="nh-row-actions">' +
        (fixed
          ? ""
          : '<button type="button" class="nh-row-btn nh-row-btn--minus" data-vip-remark-remove="' +
            i +
            '" title="행 삭제" aria-label="특이사항 행 삭제">−</button>') +
        "</td>";
      tbody.appendChild(tr);
      setVal("vipRemarkId_" + i, r.id || "");
      setVal("vipRemarkHighlight_" + i, r.highlight || "");
      setVal("vipRemarkLabel_" + i, r.label || "");
      setVal("vipRemarkValue_" + i, r.value || "");
    }
    autosizeAllIn(tbody);
  }

  function ensureSpecialNoteRow(rows) {
    rows = (rows || []).map(function (r) {
      r = r || {};
      return {
        id: r.id != null ? String(r.id) : "",
        label: r.label != null ? String(r.label) : "",
        value: r.value != null ? String(r.value) : "",
        highlight: r.highlight != null ? String(r.highlight) : "",
      };
    });
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
      var insertAt = ajIdx >= 0 ? ajIdx : 0;
      rows.splice(insertAt, 0, {
        id: "specialNote",
        label: "특이사항",
        value: "",
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
    return rows;
  }

  function normalizeRemarkRows(pack) {
    if (Array.isArray(pack.remarkRows) && pack.remarkRows.length) {
      return ensureSpecialNoteRow(
        pack.remarkRows.map(function (r) {
          r = r || {};
          return {
            id: r.id != null ? String(r.id) : "",
            label: r.label != null ? String(r.label) : "",
            value: r.value != null ? String(r.value) : "",
            highlight: r.highlight != null ? String(r.highlight) : "",
          };
        })
      );
    }
    var rows = defaultRemarkRows();
    var remarks = pack.remarks || {};
    rows.forEach(function (r) {
      if (r.id === "aj") {
        if (Array.isArray(pack.ajList) && pack.ajList.length) {
          r.value = pack.ajList.filter(Boolean).join("\n") || String(pack.ajList[0] || "");
        } else if (remarks.aj) r.value = remarks.aj;
        else if (pack.aj) r.value = [pack.aj.main, pack.aj.annex].filter(Boolean).join(" / ");
      } else if (r.id === "mb") {
        if (Array.isArray(pack.mbList) && pack.mbList.length) {
          r.value = pack.mbList.filter(Boolean).join("\n") || String(pack.mbList[0] || "");
        } else if (remarks.mb) r.value = remarks.mb;
        else if (pack.mb) r.value = pack.mb;
      } else if (remarks[r.id] != null) {
        r.value = String(remarks[r.id]);
      }
    });
    return ensureSpecialNoteRow(rows);
  }

  function addRemarkRow() {
    if (!canEdit()) return;
    var rows = collectRemarkRowsFromDom();
    rows.push(emptyRemarkRow());
    rebuildRemarksBody(rows);
    markDirty();
    syncEditLock();
  }

  function removeRemarkRow(idx) {
    if (!canEdit()) return;
    if (!window.confirm("삭제하시겠습니까?")) return;
    var rows = collectRemarkRowsFromDom();
    if (rows[idx] && rows[idx].id && FIXED_REMARK_IDS[rows[idx].id]) {
      rows[idx].value = "";
      if (rows[idx].id === "specialNote") rows[idx].label = "특이사항";
      rebuildRemarksBody(rows);
      markDirty();
      syncEditLock();
      return;
    }
    if (rows.length <= MIN_REMARK_ROWS) {
      rows[idx] = emptyRemarkRow();
      rebuildRemarksBody(rows);
      markDirty();
      syncEditLock();
      return;
    }
    rows.splice(idx, 1);
    rebuildRemarksBody(rows);
    markDirty();
    syncEditLock();
  }

  function addGuestRow() {
    if (!canEdit()) return;
    var guests = collectGuestsFromDom();
    guests.push(emptyGuest(""));
    rebuildGuestsBody(guests);
    markDirty();
    syncEditLock();
  }

  function removeGuestRow(idx) {
    if (!canEdit()) return;
    if (!window.confirm("삭제하시겠습니까?")) return;
    var guests = collectGuestsFromDom();
    if (guests.length <= MIN_GUEST_ROWS) {
      guests[idx] = emptyGuest(guests[idx] && guests[idx].section);
      rebuildGuestsBody(guests);
      markDirty();
      syncEditLock();
      return;
    }
    guests.splice(idx, 1);
    if (guests[idx] && guests[idx].mergePrev && (!guests[idx - 1] || guests[idx - 1].mergePrev === false)) {
      /* keep */
    }
    if (guests[0]) guests[0].mergePrev = false;
    rebuildGuestsBody(guests);
    markDirty();
    syncEditLock();
  }

  function mergeSelectedGuestRows() {
    if (!canEdit()) return;
    var checks = Array.prototype.slice.call(document.querySelectorAll(".vip-row-check:checked"));
    if (checks.length < 2) {
      if (typeof opts.toast === "function") opts.toast("병합할 행을 2개 이상 선택하세요.");
      return;
    }
    var idxs = checks
      .map(function (el) {
        return Number(el.getAttribute("data-vip-guest-check"));
      })
      .sort(function (a, b) {
        return a - b;
      });
    for (var k = 1; k < idxs.length; k++) {
      if (idxs[k] !== idxs[k - 1] + 1) {
        if (typeof opts.toast === "function") opts.toast("연속된 행만 병합할 수 있습니다.");
        return;
      }
    }
    var guests = collectGuestsFromDom();
    var first = idxs[0];
    var section = guests[first].section || "";
    idxs.forEach(function (idx, n) {
      if (n === 0) {
        guests[idx].mergePrev = false;
        guests[idx].section = section;
      } else {
        guests[idx].mergePrev = true;
        guests[idx].section = section;
      }
    });
    rebuildGuestsBody(guests);
    markDirty();
    syncEditLock();
    if (typeof opts.toast === "function") opts.toast("선택한 행을 병합했습니다.");
  }

  function unmergeSelectedGuestRows() {
    if (!canEdit()) return;
    var checks = Array.prototype.slice.call(document.querySelectorAll(".vip-row-check:checked"));
    if (!checks.length) {
      if (typeof opts.toast === "function") opts.toast("병합 취소할 행을 선택하세요.");
      return;
    }
    var idxs = checks
      .map(function (el) {
        return Number(el.getAttribute("data-vip-guest-check"));
      })
      .filter(function (n) {
        return !isNaN(n) && n >= 0;
      })
      .sort(function (a, b) {
        return a - b;
      });
    var guests = collectGuestsFromDom();
    var toClear = {};
    idxs.forEach(function (idx) {
      if (!guests[idx]) return;
      var start = idx;
      while (start > 0 && guests[start] && guests[start].mergePrev) start--;
      var end = start;
      while (end + 1 < guests.length && guests[end + 1] && guests[end + 1].mergePrev) {
        end++;
      }
      if (end === start) return;
      for (var i = start; i <= end; i++) toClear[i] = true;
    });
    var keys = Object.keys(toClear);
    if (!keys.length) {
      if (typeof opts.toast === "function") opts.toast("선택한 행에 병합이 없습니다.");
      return;
    }
    keys.forEach(function (k) {
      var i = Number(k);
      if (guests[i]) guests[i].mergePrev = false;
    });
    if (guests[0]) guests[0].mergePrev = false;
    rebuildGuestsBody(guests);
    markDirty();
    syncEditLock();
    if (typeof opts.toast === "function") opts.toast("선택한 행의 병합을 취소했습니다.");
  }

  function addConnectingRow() {
    if (!canEdit()) return;
    var list = collectConnectingFromDom();
    list.push(emptyConnecting());
    list.push(emptyConnecting());
    rebuildConnectingBody(list);
    markDirty();
    syncEditLock();
  }

  function removeConnectingRow(startIdx) {
    if (!canEdit()) return;
    if (!window.confirm("삭제하시겠습니까?")) return;
    var list = collectConnectingFromDom();
    if (list.length <= MIN_CONNECTING_SLOTS) {
      list[startIdx] = emptyConnecting();
      if (list[startIdx + 1]) list[startIdx + 1] = emptyConnecting();
      rebuildConnectingBody(list);
      markDirty();
      syncEditLock();
      return;
    }
    list.splice(startIdx, CONNECTING_PER_ROW);
    rebuildConnectingBody(list);
    markDirty();
    syncEditLock();
  }

  function toggleConnectingStatus(btn) {
    if (!canEdit() || !btn) return;
    var cur = btn.getAttribute("data-status") === "OPEN" ? "OPEN" : "CLOSE";
    var next = cur === "CLOSE" ? "OPEN" : "CLOSE";
    btn.setAttribute("data-status", next);
    btn.textContent = next;
    btn.classList.toggle("is-open", next === "OPEN");
    btn.classList.toggle("is-close", next === "CLOSE");
    var idx = btn.getAttribute("data-vip-conn-status");
    var note = document.getElementById("vipConnOpenNote_" + idx);
    if (note) note.classList.toggle("is-visible", next === "OPEN");
    markDirty();
  }

  function syncEditLock() {
    var editable = canEdit();
    var root = document.getElementById("vipCheckInPanel");
    if (!root) return;
    root.classList.toggle("is-readonly", !editable);
    root.querySelectorAll("input, textarea, button").forEach(function (el) {
      if (el.id === "vipDateInput") {
        el.disabled = false;
        return;
      }
      if (el.id === "vipTitleDate" || el.id === "vipTitleYear") {
        el.readOnly = true;
        el.disabled = false;
        return;
      }
      if (el.id === "btnVipCheckInExcel" || el.id === "btnVipDateCal") {
        el.disabled = false;
        return;
      }
      if (
        el.id === "btnVipCheckInSave" ||
        el.id === "btnVipCheckInReset" ||
        el.id === "btnVipGuestAdd" ||
        el.id === "btnVipGuestMerge" ||
        el.id === "btnVipGuestUnmerge" ||
        el.id === "btnVipConnAdd" ||
        el.id === "btnVipRemarkAdd" ||
        el.classList.contains("vip-conn-status") ||
        el.classList.contains("vip-row-check") ||
        el.hasAttribute("data-vip-guest-remove") ||
        el.hasAttribute("data-vip-conn-remove-row") ||
        el.hasAttribute("data-vip-remark-remove")
      ) {
        el.disabled = !editable;
        return;
      }
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.readOnly = !editable;
      }
    });
    var hint = document.getElementById("vipCheckInFrontHint");
    if (hint) hint.hidden = editable;
  }

  function syncDirtyUi() {
    var btn = document.getElementById("btnVipCheckInSave");
    if (btn) {
      btn.classList.toggle("is-dirty", !!dirty && canEdit());
      btn.textContent = dirty && canEdit() ? "저장 · 동기화 *" : "저장 · 동기화";
    }
  }

  function markDirty() {
    if (!canEdit()) return;
    dirty = true;
    syncDirtyUi();
  }

  function fillDay(day) {
    syncDateInputs(day.dateKey || currentDateKey);
    rebuildGuestsBody(day.guests);
    rebuildConnectingBody(day.connecting);
    rebuildRemarksBody(normalizeRemarkRows(day));
    dirty = false;
    syncEditLock();
    syncDirtyUi();
    autosizeAllIn(document.getElementById("vipCheckInPanel"));
    refreshAllRoomStatuses();
  }

  function switchToDateKey(nextKey) {
    nextKey = String(nextKey || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextKey)) {
      syncDateInputs(currentDateKey);
      return;
    }
    if (nextKey === currentDateKey) {
      syncDateInputs(currentDateKey);
      return;
    }
    if (dirty) {
      if (
        !window.confirm(
          "저장하지 않은 변경사항이 있습니다.\n날짜를 바꾸면 변경사항이 사라집니다. 계속할까요?"
        )
      ) {
        syncDateInputs(currentDateKey);
        return;
      }
    }
    currentDateKey = nextKey;
    fillDay(dayFromPack(loadPack(), currentDateKey, true));
  }

  function openDatePicker() {
    var input = document.getElementById("vipDateInput");
    if (!input) return;
    input.value = currentDateKey || opsDateKey();
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else {
        input.focus();
        input.click();
      }
    } catch (e) {
      input.focus();
      input.click();
    }
  }

  function render(force) {
    if (dirty && !force) {
      syncEditLock();
      syncDirtyUi();
      refreshAllRoomStatuses();
      return;
    }
    var pack = loadPack();
    if (!currentDateKey) {
      /* 기본: 오늘(17시 이후면 다음날). 다른 날은 달력으로 이동 */
      currentDateKey = opsDateKey();
    }
    fillDay(dayFromPack(pack, currentDateKey, true));
    applyGuestColWidthsFromPack();
    if (window.HKTableColResize && window.HKTableColResize.bind) {
      window.HKTableColResize.bind(document.getElementById("vipCheckInPanel"));
    }
  }

  function onSave() {
    if (!canEdit()) {
      if (typeof opts.toast === "function") opts.toast("프론트 모드에서만 저장할 수 있습니다.");
      return;
    }
    refreshAllRoomStatuses();
    persist(collectFromDom());
  }

  function onReset() {
    if (!canEdit()) return;
    if (!window.confirm("VIP 체크인 리스트를 초기화할까요?\n이 날짜 내용이 비워지고 바로 동기화됩니다.")) return;
    var pack = defaultData(currentDateKey || opsDateKey());
    fillDay(pack);
    persist(collectFromDom(), true);
    if (typeof opts.toast === "function") opts.toast("VIP 체크인 리스트 초기화됨");
  }

  function stampNow() {
    var now = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return (
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      "_" +
      pad(now.getHours()) +
      pad(now.getMinutes())
    );
  }

  function dayToAoa(dayDoc, dateKey) {
    var pack = dayDoc && typeof dayDoc === "object" ? dayDoc : {};
    var key = dateKey || pack.dateKey || "";
    var aoa = [
      [
        "구분",
        "Guest Name",
        "Room No.",
        "Room 상태",
        "Room Type",
        "RSV No.",
        "도착 예정 시간",
        "Check Out",
        "비고",
      ],
    ];
    aoa.push([
      "제목날짜",
      (pack.titleDate || displayFromKey(pack.dateKey || key) || "") +
        " / " +
        (pack.titleYear || yearFromKey(pack.dateKey || key) || ""),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    (pack.guests || []).forEach(function (g) {
      if (!g) return;
      if (
        !(
          g.section ||
          g.guestName ||
          g.roomNo ||
          g.roomStatus ||
          g.roomType ||
          g.rsvNo ||
          g.eta ||
          g.checkOut ||
          g.remark
        )
      ) {
        return;
      }
      aoa.push([
        g.mergePrev ? "" : g.section || "",
        g.guestName || "",
        g.roomNo || "",
        g.roomStatus || "",
        g.roomType || "",
        g.rsvNo || "",
        g.eta || "",
        g.checkOut || "",
        g.remark || "",
      ]);
    });
    (pack.connecting || []).forEach(function (c) {
      if (!c || !(c.rooms || c.status || c.openNote)) return;
      aoa.push([
        "커넥팅",
        c.rooms || "",
        "중간문",
        c.status || "CLOSE",
        c.openNote || "",
        "",
        "",
        "",
        "",
      ]);
    });
    (pack.remarkRows && pack.remarkRows.length
      ? pack.remarkRows
      : normalizeRemarkRows(pack)
    ).forEach(function (r) {
      if (!r || !(r.label || r.value)) return;
      aoa.push([r.label || "", r.value || "", "", "", "", "", "", "", ""]);
    });
    return aoa;
  }

  function vipExcelCols() {
    return [
      { wch: 12 },
      { wch: 18 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 20 },
    ];
  }

  function downloadExcel() {
    if (typeof global.XLSX === "undefined" || !global.XLSX.utils || !global.XLSX.writeFile) {
      alert("엑셀 라이브러리를 불러오지 못했습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
      return;
    }
    var onlyThisDay = confirm(
      "이 날짜(표시일)만 엑셀로 저장할까요?\n\n확인: 이 날짜만\n취소: 다른 선택"
    );
    var exportAll = false;
    if (!onlyThisDay) {
      exportAll = confirm(
        "저장된 전체 기간(최대 35일)을 엑셀로 저장할까요?\n\n확인: 전체 기간\n취소: 저장 취소"
      );
      if (!exportAll) return;
    }

    var stamp = stampNow();
    var wb = global.XLSX.utils.book_new();

    if (!exportAll) {
      var day =
        canEdit() ? collectFromDom() : dayFromPack(loadPack(), currentDateKey);
      var aoa = dayToAoa(day, currentDateKey);
      var ws = global.XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = vipExcelCols();
      global.XLSX.utils.book_append_sheet(wb, ws, "VIP체크인");
      var singleName =
        "VIP체크인리스트_" +
        (currentDateKey ? currentDateKey + "_" : "") +
        stamp +
        ".xlsx";
      global.XLSX.writeFile(wb, singleName);
      if (typeof opts.toast === "function") opts.toast("이 날짜 엑셀 저장됨");
      return;
    }

    var pack = loadPack();
    var byDate = (pack && pack.byDate) || {};
    var dateKeys = Object.keys(byDate).sort();
    if (!dateKeys.length) {
      if (typeof opts.toast === "function") opts.toast("저장할 날짜 데이터가 없습니다");
      return;
    }
    dateKeys.forEach(function (dk) {
      var dayDoc =
        dk === currentDateKey && canEdit()
          ? collectFromDom()
          : dayFromPack(pack, dk);
      var sheetAoa = dayToAoa(dayDoc, dk);
      var sheet = global.XLSX.utils.aoa_to_sheet(sheetAoa);
      sheet["!cols"] = vipExcelCols();
      global.XLSX.utils.book_append_sheet(wb, sheet, dk);
    });
    global.XLSX.writeFile(wb, "VIP체크인리스트_전체_" + stamp + ".xlsx");
    if (typeof opts.toast === "function") opts.toast("전체 기간 엑셀 저장됨");
  }

  function resetOnCloseDay() {
    /* 마감 후에도 유지 — byDate 보존 */
    dirty = false;
    var panel = document.getElementById("vipCheckInPanel");
    if (panel && !panel.hidden) render(true);
  }

  function normalizeGuestColWidthsArr(arr) {
    var DEFAULT_WIDTHS = [36, 64, 110, 72, 72, 80, 90, 100, 90, 140, 52];
    if (!Array.isArray(arr) || arr.length !== 11) return null;
    var out = [];
    var i;
    for (i = 0; i < 11; i++) {
      var v = Number(arr[i]);
      out.push(v > 24 && isFinite(v) ? v : DEFAULT_WIDTHS[i]);
    }
    return out;
  }

  function readLocalGuestColWidths() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(VIP_COL_WIDTHS_KEY);
      if (!raw) return null;
      return normalizeGuestColWidthsArr(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function mirrorLocalGuestColWidths(widths) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(VIP_COL_WIDTHS_KEY, JSON.stringify(widths));
      }
    } catch (e) {}
  }

  function resolveGuestColWidths() {
    var DEFAULT_WIDTHS = [36, 64, 110, 72, 72, 80, 90, 100, 90, 140, 52];
    var pack = loadPack();
    var fromPack =
      pack && pack.ui && normalizeGuestColWidthsArr(pack.ui.guestColWidths);
    if (fromPack) {
      mirrorLocalGuestColWidths(fromPack);
      return fromPack;
    }
    var fromLocal = readLocalGuestColWidths();
    if (fromLocal) return fromLocal;
    return DEFAULT_WIDTHS.slice();
  }

  function ensureGuestColgroup(table) {
    var cg = table.querySelector("colgroup");
    if (cg && cg.children.length === 11) return cg;
    if (cg) cg.remove();
    cg = document.createElement("colgroup");
    var i;
    for (i = 0; i < 11; i++) {
      cg.appendChild(document.createElement("col"));
    }
    table.insertBefore(cg, table.firstChild);
    return cg;
  }

  function applyGuestColWidths(widths) {
    var table = document.querySelector(".vip-table--guests");
    if (!table || !widths) return;
    guestColWidthsLive = widths.slice();
    var cg = ensureGuestColgroup(table);
    var i;
    for (i = 0; i < 11; i++) {
      var col = cg.children[i];
      if (col) col.style.width = widths[i] + "px";
    }
    var ths = table.querySelectorAll("thead th");
    for (i = 0; i < ths.length && i < 11; i++) {
      ths[i].style.width = widths[i] + "px";
    }
  }

  function applyGuestColWidthsFromPack() {
    applyGuestColWidths(resolveGuestColWidths());
  }

  function persistGuestColWidthsToPack(widths) {
    if (!global.HKStorage || !global.HKStorage.save) {
      mirrorLocalGuestColWidths(widths);
      return;
    }
    var data = global.HKStorage.load();
    var pack = loadPack();
    if (!pack.ui || typeof pack.ui !== "object") pack.ui = {};
    pack.ui.guestColWidths = widths.slice();
    pack.updatedAt = new Date().toISOString();
    if (typeof global.HKStorage.normalizeVipCheckIn === "function") {
      pack = global.HKStorage.normalizeVipCheckIn(pack);
    }
    data.vipCheckIn = pack;
    global.HKStorage.save(data);
    mirrorLocalGuestColWidths(widths);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
  }

  function bindGuestColResize() {
    if (colResizeBound) return;
    var table = document.querySelector(".vip-table--guests");
    if (!table) return;
    colResizeBound = true;

    var widths = resolveGuestColWidths();
    var packNow = loadPack();
    var packHasWidths =
      packNow && packNow.ui && normalizeGuestColWidthsArr(packNow.ui.guestColWidths);
    if (!packHasWidths && readLocalGuestColWidths()) {
      /* migrate once into pack when pack missing widths */
      persistGuestColWidthsToPack(widths);
    }
    applyGuestColWidths(widths);
    guestColWidthsLive = widths;

    var theadRow = table.querySelector("thead tr");
    if (!theadRow) return;
    Array.prototype.forEach.call(theadRow.children, function (th, idx) {
      if (idx >= 10) return;
      th.style.position = "relative";
      var handle = document.createElement("span");
      handle.className = "vip-col-resizer";
      handle.title = "열 너비 조절";
      th.appendChild(handle);
      handle.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var startX = ev.clientX;
        var live = guestColWidthsLive || widths;
        var startW = live[idx];
        function onMove(e2) {
          var next = Math.max(36, startW + (e2.clientX - startX));
          live[idx] = next;
          guestColWidthsLive = live;
          applyGuestColWidths(live);
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          persistGuestColWidthsToPack(guestColWidthsLive || live);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    });
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    var panel = document.getElementById("vipCheckInPanel");
    if (panel) {
      panel.addEventListener("input", function (e) {
        if (e && e.target && e.target.id === "vipDateInput") return;
        if (e && e.target && e.target.id) {
          var m = String(e.target.id).match(/^vipGuest_(\d+)_roomNo$/);
          if (m) {
            refreshRoomStatusForRow(Number(m[1]));
          }
        }
        markDirty();
        if (e && e.target) autosizeTextarea(e.target);
      });
      panel.addEventListener("change", function (e) {
        if (e && e.target && e.target.id === "vipDateInput") {
          switchToDateKey(e.target.value);
          return;
        }
        if (e && e.target && e.target.id) {
          var m = String(e.target.id).match(/^vipGuest_(\d+)_roomNo$/);
          if (m) refreshRoomStatusForRow(Number(m[1]));
        }
        markDirty();
      });
      panel.addEventListener("click", function (e) {
        var statusBtn = e.target.closest("[data-vip-conn-status]");
        if (statusBtn) {
          e.preventDefault();
          toggleConnectingStatus(statusBtn);
          return;
        }
        var guestRm = e.target.closest("[data-vip-guest-remove]");
        if (guestRm) {
          e.preventDefault();
          removeGuestRow(Number(guestRm.getAttribute("data-vip-guest-remove")));
          return;
        }
        var connRm = e.target.closest("[data-vip-conn-remove-row]");
        if (connRm) {
          e.preventDefault();
          removeConnectingRow(Number(connRm.getAttribute("data-vip-conn-remove-row")));
          return;
        }
        var remarkRm = e.target.closest("[data-vip-remark-remove]");
        if (remarkRm) {
          e.preventDefault();
          removeRemarkRow(Number(remarkRm.getAttribute("data-vip-remark-remove")));
        }
      });
    }
    var saveBtn = document.getElementById("btnVipCheckInSave");
    if (saveBtn) saveBtn.addEventListener("click", onSave);
    var resetBtn = document.getElementById("btnVipCheckInReset");
    if (resetBtn) resetBtn.addEventListener("click", onReset);
    var excelBtn = document.getElementById("btnVipCheckInExcel");
    if (excelBtn) excelBtn.addEventListener("click", downloadExcel);
    var addGuest = document.getElementById("btnVipGuestAdd");
    if (addGuest) addGuest.addEventListener("click", addGuestRow);
    var mergeBtn = document.getElementById("btnVipGuestMerge");
    if (mergeBtn) mergeBtn.addEventListener("click", mergeSelectedGuestRows);
    var unmergeBtn = document.getElementById("btnVipGuestUnmerge");
    if (unmergeBtn) unmergeBtn.addEventListener("click", unmergeSelectedGuestRows);
    var addConn = document.getElementById("btnVipConnAdd");
    if (addConn) addConn.addEventListener("click", addConnectingRow);
    var addRemark = document.getElementById("btnVipRemarkAdd");
    if (addRemark) addRemark.addEventListener("click", addRemarkRow);
    var calBtn = document.getElementById("btnVipDateCal");
    if (calBtn) calBtn.addEventListener("click", openDatePicker);
    var dateInput = document.getElementById("vipDateInput");
    if (dateInput) {
      dateInput.addEventListener("change", function () {
        switchToDateKey(dateInput.value);
      });
    }
    bindGuestColResize();
  }

  function init(userOpts) {
    opts = Object.assign({}, opts, userOpts || {});
    bindUi();
  }

  function onViewActivated() {
    render(false);
    tickOpsDateRollover();
  }

  function tickOpsDateRollover() {
    var nextKey = opsDateKey();
    if (!currentDateKey) {
      currentDateKey = nextKey;
      return;
    }
    if (currentDateKey === nextKey) return;
    if (dirty && canEdit()) {
      try {
        persist(collectFromDom(), true);
      } catch (e) {}
    }
    currentDateKey = nextKey;
    dirty = false;
    fillDay(dayFromPack(loadPack(), currentDateKey, true));
    syncDateInputs(currentDateKey);
    applyGuestColWidthsFromPack();
    if (typeof opts.toast === "function") {
      opts.toast("17시 기준 날짜가 변경되어 자동 저장·전환되었습니다");
    }
  }

  function onFrontModeChanged() {
    syncEditLock();
    if (!canEdit()) {
      var panel = document.getElementById("vipCheckInPanel");
      if (panel && !panel.hidden && typeof opts.onLeaveWhenLocked === "function") {
        opts.onLeaveWhenLocked();
      }
    }
  }

  if (!global.__hkVipCheckInRolloverTimer) {
    global.__hkVipCheckInRolloverTimer = setInterval(function () {
      try {
        if (global.HKVipCheckIn && typeof tickOpsDateRollover === "function") {
          tickOpsDateRollover();
        }
      } catch (e) {}
    }, 30000);
  }

  global.HKVipCheckIn = {
    init: init,
    render: render,
    onViewActivated: onViewActivated,
    onFrontModeChanged: onFrontModeChanged,
    resetOnCloseDay: resetOnCloseDay,
    defaultData: defaultData,
    downloadExcel: downloadExcel,
    REMARK_KEYS: REMARK_KEYS,
    tickOpsDateRollover: tickOpsDateRollover,
    isDirty: function () {
      return !!dirty;
    },
    save: function () {
      onSave();
    },
  };
})(typeof window !== "undefined" ? window : this);
