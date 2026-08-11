/**
 * 야간 인계사항 — 웹 폼 작성 · 저장 시 HKStorage 동기화
 * 프론트 모드에서만 편집
 */
(function (global) {
  var EXTRA_KEYS = [
    { id: "addClean", label: "추가정비" },
    { id: "oooStay", label: "OUT OF ORDER STAY", highlight: true },
    { id: "emptyStay", label: "빈방스테이" },
    { id: "excludeClean", label: "정비제외" },
    { id: "loCarry", label: "18시 L/O 정비이월" },
    { id: "stayOver", label: "연박" },
    { id: "roomChange", label: "야간 룸체인지" },
    { id: "ventReplace", label: "욕실환풍구교체" },
    { id: "linenMissing", label: "린넨 및 대여품 누락" },
  ];

  var NOTE_ROWS = 10;
  var INCIDENT_ROWS = 6;

  var opts = {
    isFrontMode: function () {
      return false;
    },
    toast: function () {},
  };

  var bound = false;
  var dirty = false;

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function defaultTitleDate(d) {
    d = d || new Date();
    return d.getMonth() + 1 + "/" + d.getDate();
  }

  function emptyWing() {
    return { main: "", annex: "" };
  }

  function defaultData() {
    var extras = {};
    EXTRA_KEYS.forEach(function (k) {
      extras[k.id] = emptyWing();
    });
    var notes = [];
    var i;
    for (i = 0; i < NOTE_ROWS; i++) notes.push({ category: "", main: "", annex: "" });
    var incidents = [];
    for (i = 0; i < INCIDENT_ROWS; i++) {
      incidents.push({ room: "", by: "", dates: "", detail: "" });
    }
    return {
      updatedAt: "",
      titleDate: defaultTitleDate(),
      duty: {
        mid: emptyWing(),
        allNight: emptyWing(),
        utility: emptyWing(),
      },
      chargers: { cType: "", iphone: "", fivePin: "" },
      etc: { fan: "", duckDown: "", kidsRobe: "" },
      extras: extras,
      notes: notes,
      incidents: incidents,
    };
  }

  function canEdit() {
    return !!opts.isFrontMode();
  }

  function loadData() {
    if (!global.HKStorage || !global.HKStorage.load) return defaultData();
    var data = global.HKStorage.load();
    if (typeof global.HKStorage.normalizeNightHandover === "function") {
      return global.HKStorage.normalizeNightHandover(data.nightHandover);
    }
    return data.nightHandover && typeof data.nightHandover === "object"
      ? data.nightHandover
      : defaultData();
  }

  function persist(pack, silentToast) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var next = pack || collectFromDom();
    next.updatedAt = new Date().toISOString();
    if (typeof global.HKStorage.normalizeNightHandover === "function") {
      next = global.HKStorage.normalizeNightHandover(next);
    }
    data.nightHandover = next;
    global.HKStorage.save(data);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
    dirty = false;
    syncDirtyUi();
    if (!silentToast && typeof opts.toast === "function") {
      opts.toast("야간 인계사항 저장 · 동기화됨");
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

  function collectFromDom() {
    var base = defaultData();
    base.titleDate = val("nhTitleDate") || defaultTitleDate();
    base.duty.mid = { main: val("nhDutyMidMain"), annex: val("nhDutyMidAnnex") };
    base.duty.allNight = { main: val("nhDutyAllMain"), annex: val("nhDutyAllAnnex") };
    base.duty.utility = { main: val("nhDutyUtilMain"), annex: val("nhDutyUtilAnnex") };
    base.chargers = {
      cType: val("nhChargerC"),
      iphone: val("nhChargerIphone"),
      fivePin: val("nhCharger5"),
    };
    base.etc = {
      fan: val("nhEtcFan"),
      duckDown: val("nhEtcDuck"),
      kidsRobe: val("nhEtcKids"),
    };
    EXTRA_KEYS.forEach(function (k) {
      base.extras[k.id] = {
        main: val("nhEx_" + k.id + "_main"),
        annex: val("nhEx_" + k.id + "_annex"),
      };
    });
    var notes = [];
    var i;
    for (i = 0; i < NOTE_ROWS; i++) {
      notes.push({
        category: val("nhNoteCat_" + i),
        main: val("nhNoteMain_" + i),
        annex: val("nhNoteAnnex_" + i),
      });
    }
    base.notes = notes;
    var incidents = [];
    for (i = 0; i < INCIDENT_ROWS; i++) {
      incidents.push({
        room: val("nhIncRoom_" + i),
        by: val("nhIncBy_" + i),
        dates: val("nhIncDates_" + i),
        detail: val("nhIncDetail_" + i),
      });
    }
    base.incidents = incidents;
    return base;
  }

  function fillDom(pack) {
    pack = pack || defaultData();
    setVal("nhTitleDate", pack.titleDate || defaultTitleDate());
    var duty = pack.duty || {};
    setVal("nhDutyMidMain", duty.mid && duty.mid.main);
    setVal("nhDutyMidAnnex", duty.mid && duty.mid.annex);
    setVal("nhDutyAllMain", duty.allNight && duty.allNight.main);
    setVal("nhDutyAllAnnex", duty.allNight && duty.allNight.annex);
    setVal("nhDutyUtilMain", duty.utility && duty.utility.main);
    setVal("nhDutyUtilAnnex", duty.utility && duty.utility.annex);
    var ch = pack.chargers || {};
    setVal("nhChargerC", ch.cType);
    setVal("nhChargerIphone", ch.iphone);
    setVal("nhCharger5", ch.fivePin);
    var etc = pack.etc || {};
    setVal("nhEtcFan", etc.fan);
    setVal("nhEtcDuck", etc.duckDown);
    setVal("nhEtcKids", etc.kidsRobe);
    EXTRA_KEYS.forEach(function (k) {
      var row = (pack.extras && pack.extras[k.id]) || {};
      setVal("nhEx_" + k.id + "_main", row.main);
      setVal("nhEx_" + k.id + "_annex", row.annex);
    });
    var notes = pack.notes || [];
    var i;
    for (i = 0; i < NOTE_ROWS; i++) {
      var n = notes[i] || {};
      setVal("nhNoteCat_" + i, n.category);
      setVal("nhNoteMain_" + i, n.main);
      setVal("nhNoteAnnex_" + i, n.annex);
    }
    var incidents = pack.incidents || [];
    for (i = 0; i < INCIDENT_ROWS; i++) {
      var inc = incidents[i] || {};
      setVal("nhIncRoom_" + i, inc.room);
      setVal("nhIncBy_" + i, inc.by);
      setVal("nhIncDates_" + i, inc.dates);
      setVal("nhIncDetail_" + i, inc.detail);
    }
  }

  function syncEditLock() {
    var editable = canEdit();
    var root = document.getElementById("nightHandoverPanel");
    if (!root) return;
    root.classList.toggle("is-readonly", !editable);
    root.querySelectorAll("input, textarea, button").forEach(function (el) {
      if (el.id === "btnNightHandoverSave") {
        el.disabled = !editable;
        return;
      }
      if (el.id === "btnNightHandoverClear") {
        el.disabled = !editable;
        return;
      }
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.readOnly = !editable;
        el.disabled = false;
      }
    });
    var hint = document.getElementById("nightHandoverFrontHint");
    if (hint) hint.hidden = editable;
  }

  function syncDirtyUi() {
    var btn = document.getElementById("btnNightHandoverSave");
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

  function buildExtrasTbody(tbody) {
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    EXTRA_KEYS.forEach(function (k) {
      var tr = document.createElement("tr");
      if (k.highlight) tr.className = "nh-row--highlight";
      tr.innerHTML =
        "<th scope=\"row\">" +
        k.label +
        "</th>" +
        "<td><input type=\"text\" id=\"nhEx_" +
        k.id +
        "_main\" autocomplete=\"off\" /></td>" +
        "<td><input type=\"text\" id=\"nhEx_" +
        k.id +
        "_annex\" autocomplete=\"off\" /></td>";
      tbody.appendChild(tr);
    });
  }

  function buildNotesTbody(tbody) {
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    var i;
    for (i = 0; i < NOTE_ROWS; i++) {
      var tr = document.createElement("tr");
      if (i === 0) tr.className = "nh-row--highlight";
      tr.innerHTML =
        "<td><input type=\"text\" id=\"nhNoteCat_" +
        i +
        "\" autocomplete=\"off\" /></td>" +
        "<td><input type=\"text\" id=\"nhNoteMain_" +
        i +
        "\" autocomplete=\"off\" /></td>" +
        "<td><input type=\"text\" id=\"nhNoteAnnex_" +
        i +
        "\" autocomplete=\"off\" /></td>";
      tbody.appendChild(tr);
    }
  }

  function buildIncidentsTbody(tbody) {
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    var i;
    for (i = 0; i < INCIDENT_ROWS; i++) {
      var tr = document.createElement("tr");
      tr.className = "nh-incident-row";
      tr.innerHTML =
        "<td><input type=\"text\" id=\"nhIncRoom_" +
        i +
        "\" placeholder=\"객실\" autocomplete=\"off\" /></td>" +
        "<td><input type=\"text\" id=\"nhIncBy_" +
        i +
        "\" placeholder=\"이름\" autocomplete=\"off\" /></td>" +
        "<td><input type=\"text\" id=\"nhIncDates_" +
        i +
        "\" placeholder=\"기간\" autocomplete=\"off\" /></td>" +
        "<td><textarea id=\"nhIncDetail_" +
        i +
        "\" rows=\"2\" placeholder=\"내용\"></textarea></td>";
      tbody.appendChild(tr);
    }
  }

  function ensureDomBuilt() {
    buildExtrasTbody(document.getElementById("nhExtrasBody"));
    buildNotesTbody(document.getElementById("nhNotesBody"));
    buildIncidentsTbody(document.getElementById("nhIncidentsBody"));
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

  function onClear() {
    if (!canEdit()) return;
    if (!window.confirm("야간 인계사항을 비울까요? (저장해야 동기화됩니다)")) return;
    fillDom(defaultData());
    dirty = true;
    syncDirtyUi();
  }

  function resetOnCloseDay() {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    data.nightHandover = defaultData();
    data.nightHandover.updatedAt = new Date().toISOString();
    if (typeof global.HKStorage.normalizeNightHandover === "function") {
      data.nightHandover = global.HKStorage.normalizeNightHandover(data.nightHandover);
    }
    global.HKStorage.save(data, { skipSync: true });
    dirty = false;
    var panel = document.getElementById("nightHandoverPanel");
    if (panel && !panel.hidden) render();
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    var panel = document.getElementById("nightHandoverPanel");
    if (panel) {
      panel.addEventListener("input", function () {
        markDirty();
      });
      panel.addEventListener("change", function () {
        markDirty();
      });
    }
    var saveBtn = document.getElementById("btnNightHandoverSave");
    if (saveBtn) saveBtn.addEventListener("click", onSave);
    var clearBtn = document.getElementById("btnNightHandoverClear");
    if (clearBtn) clearBtn.addEventListener("click", onClear);
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
      var panel = document.getElementById("nightHandoverPanel");
      if (panel && !panel.hidden && typeof opts.onLeaveWhenLocked === "function") {
        opts.onLeaveWhenLocked();
      }
    }
  }

  global.HKNightHandover = {
    init: init,
    render: render,
    onViewActivated: onViewActivated,
    onFrontModeChanged: onFrontModeChanged,
    resetOnCloseDay: resetOnCloseDay,
    defaultData: defaultData,
  };
})(typeof window !== "undefined" ? window : this);
