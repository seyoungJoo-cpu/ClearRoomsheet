/**
 * VIP 체크인 리스트 — 웹 폼 작성 · 저장 시 HKStorage 동기화
 * 프론트 모드에서만 편집 · 마감해도 유지(초기화 버튼으로만 삭제)
 */
(function (global) {
  var DEFAULT_GUEST_ROWS = 3;
  var MIN_GUEST_ROWS = 1;
  var DEFAULT_CONNECTING_SLOTS = 6; /* 3행 × 좌우 2칸 */
  var CONNECTING_PER_ROW = 2;
  var MIN_CONNECTING_SLOTS = 2;

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

  var REMARK_KEYS = [
    { id: "aj", label: "AJ" },
    { id: "mb", label: "MB" },
    { id: "welcomeCard", label: "웰컴카드 (VOUPS 2,3)" },
    { id: "lateCo", label: "LATE C/O" },
    { id: "earlyCi", label: "얼리체크인" },
    { id: "casino", label: "카지노" },
    { id: "seminar", label: "세미나 / 단체" },
    { id: "business", label: "출장", highlight: "green" },
    { id: "dami", label: "답사 룸쇼" },
    { id: "tongTeam", label: "롱텀" },
  ];

  var opts = {
    isFrontMode: function () {
      return false;
    },
    toast: function () {},
  };
  var bound = false;
  var dirty = false;
  var guestCount = DEFAULT_GUEST_ROWS;
  var connectingCount = DEFAULT_CONNECTING_SLOTS;

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

  function emptyConnecting() {
    return { rooms: "", midDoor: "중간문", status: "CLOSE" };
  }

  function defaultTitleDate(d) {
    d = d || new Date();
    return d.getMonth() + 1 + "/" + d.getDate();
  }

  function defaultGuests() {
    return [emptyGuest("V4"), emptyGuest("EI"), emptyGuest("SA")];
  }

  function defaultConnecting() {
    var list = [];
    var i;
    for (i = 0; i < DEFAULT_CONNECTING_SLOTS; i++) list.push(emptyConnecting());
    return list;
  }

  function defaultData() {
    var remarks = {};
    REMARK_KEYS.forEach(function (r) {
      remarks[r.id] = "";
    });
    return {
      updatedAt: "",
      titleDate: defaultTitleDate(),
      titleYear: String(new Date().getFullYear()),
      guests: defaultGuests(),
      connecting: defaultConnecting(),
      remarks: remarks,
      /* 하위호환 */
      sections: { V4: [], EI: [], SA: [], NPS: [] },
      aj: { main: "", annex: "" },
      mb: "",
    };
  }

  function canEdit() {
    return !!opts.isFrontMode();
  }

  function loadData() {
    if (!global.HKStorage || !global.HKStorage.load) return defaultData();
    var data = global.HKStorage.load();
    if (typeof global.HKStorage.normalizeVipCheckIn === "function") {
      return global.HKStorage.normalizeVipCheckIn(data.vipCheckIn);
    }
    return data.vipCheckIn && typeof data.vipCheckIn === "object"
      ? data.vipCheckIn
      : defaultData();
  }

  function persist(pack, silentToast) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var next = pack || collectFromDom();
    next.updatedAt = new Date().toISOString();
    if (typeof global.HKStorage.normalizeVipCheckIn === "function") {
      next = global.HKStorage.normalizeVipCheckIn(next);
    }
    data.vipCheckIn = next;
    global.HKStorage.save(data);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
    dirty = false;
    syncDirtyUi();
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
      });
    }
    return list;
  }

  function collectFromDom() {
    var base = defaultData();
    base.titleDate = val("vipTitleDate") || defaultTitleDate();
    base.titleYear = val("vipTitleYear") || String(new Date().getFullYear());
    base.guests = collectGuestsFromDom();
    base.connecting = collectConnectingFromDom();
    REMARK_KEYS.forEach(function (r) {
      base.remarks[r.id] = val("vipRemark_" + r.id);
    });
    /* 하위호환 필드 */
    base.aj = { main: base.remarks.aj || "", annex: "" };
    base.mb = base.remarks.mb || "";
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
          '" rows="2" class="vip-sec-input" autocomplete="off" aria-label="구분"></textarea>' +
          "</td>";
      } else {
        cells +=
          '<textarea id="' +
          guestId(i, "section") +
          '" hidden></textarea>';
      }

      GUEST_FIELDS.forEach(function (f) {
        cells +=
          '<td><textarea id="' +
          guestId(i, f) +
          '" rows="2" autocomplete="off"></textarea></td>';
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
        setVal(guestId(i, f), g[f]);
      });
    }
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
          "</button></td>";
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
      }
    }
  }

  function ensureRemarksBuilt() {
    var tbody = document.getElementById("vipRemarksBody");
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    REMARK_KEYS.forEach(function (r) {
      var tr = document.createElement("tr");
      if (r.highlight === "green") tr.className = "vip-row--green";
      tr.innerHTML =
        '<th scope="row" class="vip-remark-label">' +
        r.label +
        "</th>" +
        '<td><textarea id="vipRemark_' +
        r.id +
        '" rows="2" autocomplete="off"></textarea></td>';
      tbody.appendChild(tr);
    });
  }

  function fillRemarks(pack) {
    REMARK_KEYS.forEach(function (r) {
      var v = pack.remarks && pack.remarks[r.id];
      if (r.id === "aj" && !v && pack.aj) {
        v = [pack.aj.main, pack.aj.annex].filter(Boolean).join(" / ");
      }
      if (r.id === "mb" && !v && pack.mb) v = pack.mb;
      setVal("vipRemark_" + r.id, v);
    });
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
    markDirty();
  }

  function syncEditLock() {
    var editable = canEdit();
    var root = document.getElementById("vipCheckInPanel");
    if (!root) return;
    root.classList.toggle("is-readonly", !editable);
    root.querySelectorAll("input, textarea, button").forEach(function (el) {
      if (el.id === "btnVipCheckInExcel") {
        el.disabled = false;
        return;
      }
      if (
        el.id === "btnVipCheckInSave" ||
        el.id === "btnVipCheckInReset" ||
        el.id === "btnVipGuestAdd" ||
        el.id === "btnVipGuestMerge" ||
        el.id === "btnVipConnAdd" ||
        el.classList.contains("vip-conn-status") ||
        el.classList.contains("vip-row-check") ||
        el.hasAttribute("data-vip-guest-remove") ||
        el.hasAttribute("data-vip-conn-remove-row")
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

  function render(force) {
    if (dirty && !force) {
      syncEditLock();
      syncDirtyUi();
      return;
    }
    ensureRemarksBuilt();
    var pack = loadData();
    setVal("vipTitleDate", pack.titleDate || defaultTitleDate());
    setVal("vipTitleYear", pack.titleYear || String(new Date().getFullYear()));
    rebuildGuestsBody(pack.guests);
    rebuildConnectingBody(pack.connecting);
    fillRemarks(pack);
    dirty = false;
    syncEditLock();
    syncDirtyUi();
  }

  function onSave() {
    if (!canEdit()) {
      if (typeof opts.toast === "function") opts.toast("프론트 모드에서만 저장할 수 있습니다.");
      return;
    }
    persist(collectFromDom());
  }

  function onReset() {
    if (!canEdit()) return;
    if (!window.confirm("VIP 체크인 리스트를 초기화할까요?\n내용이 비워지고 바로 동기화됩니다.")) return;
    var pack = defaultData();
    ensureRemarksBuilt();
    setVal("vipTitleDate", pack.titleDate);
    setVal("vipTitleYear", pack.titleYear);
    rebuildGuestsBody(pack.guests);
    rebuildConnectingBody(pack.connecting);
    fillRemarks(pack);
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

  function downloadExcel() {
    if (typeof global.XLSX === "undefined" || !global.XLSX.utils || !global.XLSX.writeFile) {
      alert("엑셀 라이브러리를 불러오지 못했습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
      return;
    }
    var pack = canEdit() ? collectFromDom() : loadData();
    var aoa = [
      [
        "구분",
        "Guest Name",
        "Room No.",
        "Room 상태",
        "Room Type",
        "RSV No.",
        "호텔도착 예정시간",
        "Check Out",
        "비고",
      ],
    ];
    aoa.push([
      "제목날짜",
      (pack.titleDate || "") + " / " + (pack.titleYear || ""),
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
      if (!c || !(c.rooms || c.status)) return;
      aoa.push(["커넥팅", c.rooms || "", "중간문", c.status || "CLOSE", "", "", "", "", ""]);
    });
    REMARK_KEYS.forEach(function (r) {
      var v = (pack.remarks && pack.remarks[r.id]) || "";
      if (!v) return;
      aoa.push([r.label, v, "", "", "", "", "", "", ""]);
    });
    var wb = global.XLSX.utils.book_new();
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
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
    global.XLSX.utils.book_append_sheet(wb, ws, "VIP체크인");
    global.XLSX.writeFile(wb, "VIP체크인리스트_" + stampNow() + ".xlsx");
    if (typeof opts.toast === "function") opts.toast("VIP 체크인 리스트 엑셀 저장됨");
  }

  function resetOnCloseDay() {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    data.vipCheckIn = defaultData();
    data.vipCheckIn.updatedAt = new Date().toISOString();
    if (typeof global.HKStorage.normalizeVipCheckIn === "function") {
      data.vipCheckIn = global.HKStorage.normalizeVipCheckIn(data.vipCheckIn);
    }
    global.HKStorage.save(data, { skipSync: true });
    dirty = false;
    var panel = document.getElementById("vipCheckInPanel");
    if (panel && !panel.hidden) render();
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    var panel = document.getElementById("vipCheckInPanel");
    if (panel) {
      panel.addEventListener("input", markDirty);
      panel.addEventListener("change", markDirty);
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
    var addConn = document.getElementById("btnVipConnAdd");
    if (addConn) addConn.addEventListener("click", addConnectingRow);
  }

  function init(userOpts) {
    opts = Object.assign({}, opts, userOpts || {});
    bindUi();
  }

  function onViewActivated() {
    render(false);
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

  global.HKVipCheckIn = {
    init: init,
    render: render,
    onViewActivated: onViewActivated,
    onFrontModeChanged: onFrontModeChanged,
    resetOnCloseDay: resetOnCloseDay,
    defaultData: defaultData,
    downloadExcel: downloadExcel,
    REMARK_KEYS: REMARK_KEYS,
    isDirty: function () {
      return !!dirty;
    },
  };
})(typeof window !== "undefined" ? window : this);
