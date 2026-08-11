/**
 * VIP 체크인 리스트 — 웹 폼 작성 · 저장 시 HKStorage 동기화
 * 프론트 모드에서만 편집
 */
(function (global) {
  var SECTION_KEYS = ["V4", "EI", "SA", "NPS"];
  var ROWS_PER_SECTION = 4;
  var CONNECTING_ROWS = 4;
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
    { id: "welcomeCard", label: "웰컴카드 (VOUPS 2,3)" },
    { id: "lateCo", label: "LATE C/O" },
    { id: "earlyCi", label: "얼리체크인" },
    { id: "casino", label: "카지노" },
    { id: "seminar", label: "세미나 / 단체" },
    { id: "business", label: "출장", highlight: "green" },
    { id: "dami", label: "다미 / 통쇼" },
    { id: "tongTeam", label: "통팀" },
  ];

  var opts = {
    isFrontMode: function () {
      return false;
    },
    toast: function () {},
  };
  var bound = false;
  var dirty = false;

  function emptyGuest() {
    return {
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

  function defaultTitleDate(d) {
    d = d || new Date();
    return d.getMonth() + 1 + "/" + d.getDate();
  }

  function defaultData() {
    var sections = {};
    SECTION_KEYS.forEach(function (key) {
      var rows = [];
      var i;
      for (i = 0; i < ROWS_PER_SECTION; i++) rows.push(emptyGuest());
      sections[key] = rows;
    });
    var connecting = [];
    var j;
    for (j = 0; j < CONNECTING_ROWS; j++) {
      connecting.push({ rooms: "", midDoor: "", status: "" });
    }
    var remarks = {};
    REMARK_KEYS.forEach(function (r) {
      remarks[r.id] = "";
    });
    return {
      updatedAt: "",
      titleDate: defaultTitleDate(),
      titleYear: String(new Date().getFullYear()),
      sections: sections,
      connecting: connecting,
      aj: { main: "", annex: "" },
      mb: "",
      remarks: remarks,
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

  function guestId(sec, row, field) {
    return "vip_" + sec + "_" + row + "_" + field;
  }

  function collectFromDom() {
    var base = defaultData();
    base.titleDate = val("vipTitleDate") || defaultTitleDate();
    base.titleYear = val("vipTitleYear") || String(new Date().getFullYear());
    SECTION_KEYS.forEach(function (sec) {
      var rows = [];
      var i;
      for (i = 0; i < ROWS_PER_SECTION; i++) {
        var g = emptyGuest();
        GUEST_FIELDS.forEach(function (f) {
          g[f] = val(guestId(sec, i, f));
        });
        rows.push(g);
      }
      base.sections[sec] = rows;
    });
    var connecting = [];
    var j;
    for (j = 0; j < CONNECTING_ROWS; j++) {
      connecting.push({
        rooms: val("vipConnRooms_" + j),
        midDoor: val("vipConnMid_" + j),
        status: val("vipConnStatus_" + j),
      });
    }
    base.connecting = connecting;
    base.aj = { main: val("vipAjMain"), annex: val("vipAjAnnex") };
    base.mb = val("vipMbText");
    REMARK_KEYS.forEach(function (r) {
      base.remarks[r.id] = val("vipRemark_" + r.id);
    });
    return base;
  }

  function fillDom(pack) {
    pack = pack || defaultData();
    setVal("vipTitleDate", pack.titleDate || defaultTitleDate());
    setVal("vipTitleYear", pack.titleYear || String(new Date().getFullYear()));
    SECTION_KEYS.forEach(function (sec) {
      var rows = (pack.sections && pack.sections[sec]) || [];
      var i;
      for (i = 0; i < ROWS_PER_SECTION; i++) {
        var g = rows[i] || emptyGuest();
        GUEST_FIELDS.forEach(function (f) {
          setVal(guestId(sec, i, f), g[f]);
        });
      }
    });
    var connecting = pack.connecting || [];
    var j;
    for (j = 0; j < CONNECTING_ROWS; j++) {
      var c = connecting[j] || {};
      setVal("vipConnRooms_" + j, c.rooms);
      setVal("vipConnMid_" + j, c.midDoor);
      setVal("vipConnStatus_" + j, c.status);
    }
    setVal("vipAjMain", pack.aj && pack.aj.main);
    setVal("vipAjAnnex", pack.aj && pack.aj.annex);
    setVal("vipMbText", pack.mb);
    REMARK_KEYS.forEach(function (r) {
      setVal("vipRemark_" + r.id, pack.remarks && pack.remarks[r.id]);
    });
  }

  function syncEditLock() {
    var editable = canEdit();
    var root = document.getElementById("vipCheckInPanel");
    if (!root) return;
    root.classList.toggle("is-readonly", !editable);
    root.querySelectorAll("input, textarea, button").forEach(function (el) {
      if (el.id === "btnVipCheckInSave" || el.id === "btnVipCheckInReset") {
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

  function buildGuestsBody(tbody) {
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    SECTION_KEYS.forEach(function (sec) {
      var i;
      for (i = 0; i < ROWS_PER_SECTION; i++) {
        var tr = document.createElement("tr");
        var cells =
          "<th class=\"vip-sec-label\">" +
          (i === 0 ? sec : "") +
          "</th>";
        GUEST_FIELDS.forEach(function (f) {
          cells +=
            "<td><input type=\"text\" id=\"" +
            guestId(sec, i, f) +
            "\" autocomplete=\"off\" /></td>";
        });
        tr.innerHTML = cells;
        tbody.appendChild(tr);
      }
    });
  }

  function buildConnectingBody(tbody) {
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    var j;
    for (j = 0; j < CONNECTING_ROWS; j++) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><input type=\"text\" class=\"vip-conn-rooms\" id=\"vipConnRooms_" +
        j +
        "\" placeholder=\"예: 923-925\" autocomplete=\"off\" /></td>" +
        "<td><input type=\"text\" id=\"vipConnMid_" +
        j +
        "\" placeholder=\"중간문\" autocomplete=\"off\" /></td>" +
        "<td><input type=\"text\" id=\"vipConnStatus_" +
        j +
        "\" placeholder=\"CLOSE\" autocomplete=\"off\" /></td>";
      tbody.appendChild(tr);
    }
  }

  function buildRemarksBody(tbody) {
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    REMARK_KEYS.forEach(function (r) {
      var tr = document.createElement("tr");
      if (r.highlight === "green") tr.className = "vip-row--green";
      tr.innerHTML =
        "<th scope=\"row\" class=\"vip-remark-label\">" +
        r.label +
        "</th>" +
        "<td><input type=\"text\" id=\"vipRemark_" +
        r.id +
        "\" autocomplete=\"off\" /></td>";
      tbody.appendChild(tr);
    });
  }

  function ensureDomBuilt() {
    buildGuestsBody(document.getElementById("vipGuestsBody"));
    buildConnectingBody(document.getElementById("vipConnectingBody"));
    buildRemarksBody(document.getElementById("vipRemarksBody"));
  }

  function render() {
    ensureDomBuilt();
    fillDom(loadData());
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
    fillDom(defaultData());
    persist(collectFromDom(), true);
    if (typeof opts.toast === "function") opts.toast("VIP 체크인 리스트 초기화됨");
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
    }
    var saveBtn = document.getElementById("btnVipCheckInSave");
    if (saveBtn) saveBtn.addEventListener("click", onSave);
    var resetBtn = document.getElementById("btnVipCheckInReset");
    if (resetBtn) resetBtn.addEventListener("click", onReset);
  }

  function init(userOpts) {
    opts = Object.assign({}, opts, userOpts || {});
    bindUi();
  }

  function onViewActivated() {
    render();
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
  };
})(typeof window !== "undefined" ? window : this);
