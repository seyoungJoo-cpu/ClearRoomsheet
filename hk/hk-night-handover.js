/**
 * 야간 인계사항 — 웹 폼 작성 · 저장 시 HKStorage 동기화 (날짜별 byDate)
 * 프론트 모드에서만 편집 · 마감해도 유지(초기화 버튼으로만 삭제)
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

  var DEFAULT_NOTE_ROWS = 3;
  var DEFAULT_INCIDENT_ROWS = 3;
  var MIN_NOTE_ROWS = 1;
  var MIN_INCIDENT_ROWS = 1;

  var opts = {
    isFrontMode: function () {
      return false;
    },
    toast: function () {},
  };

  var bound = false;
  var dirty = false;
  var noteCount = DEFAULT_NOTE_ROWS;
  var incidentCount = DEFAULT_INCIDENT_ROWS;
  var currentDateKey = "";

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

  function defaultTitleDate(d) {
    return displayFromKey(opsDateKey(d));
  }

  function emptyWing() {
    return { main: "", annex: "" };
  }

  function emptyNote() {
    return { category: "", main: "", annex: "" };
  }

  function emptyIncident() {
    return { room: "", by: "", dates: "", detail: "" };
  }

  function defaultData(dateKey) {
    var key = dateKey || currentDateKey || opsDateKey();
    var extras = {};
    EXTRA_KEYS.forEach(function (k) {
      extras[k.id] = emptyWing();
    });
    var notes = [];
    var incidents = [];
    var i;
    for (i = 0; i < DEFAULT_NOTE_ROWS; i++) notes.push(emptyNote());
    for (i = 0; i < DEFAULT_INCIDENT_ROWS; i++) incidents.push(emptyIncident());
    return {
      updatedAt: "",
      dateKey: key,
      titleDate: displayFromKey(key),
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

  function loadPack() {
    if (!global.HKStorage || !global.HKStorage.load) {
      return { activeDate: opsDateKey(), updatedAt: "", byDate: {} };
    }
    var data = global.HKStorage.load();
    if (typeof global.HKStorage.normalizeNightHandover === "function") {
      return global.HKStorage.normalizeNightHandover(data.nightHandover);
    }
    return data.nightHandover && typeof data.nightHandover === "object"
      ? data.nightHandover
      : { activeDate: opsDateKey(), updatedAt: "", byDate: {} };
  }

  function normalizeDay(raw) {
    if (typeof global.HKStorage.normalizeNightHandoverDay === "function") {
      return global.HKStorage.normalizeNightHandoverDay(raw);
    }
    return raw && typeof raw === "object" ? raw : defaultData();
  }

  function dayFromPack(pack, dateKey) {
    pack = pack || loadPack();
    var key = dateKey || currentDateKey || pack.activeDate || opsDateKey();
    var found = pack.byDate && pack.byDate[key];
    if (found) {
      var day = normalizeDay(found);
      day.dateKey = key;
      return day;
    }
    return defaultData(key);
  }

  function syncDateInputs(dateKey) {
    var key = dateKey || currentDateKey || opsDateKey();
    var titleEl = document.getElementById("nhTitleDate");
    if (titleEl) titleEl.value = displayFromKey(key);
    var dateInput = document.getElementById("nhDateInput");
    if (dateInput) dateInput.value = key;
  }

  function persist(dayDoc, silentToast) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var pack = loadPack();
    var key = currentDateKey || pack.activeDate || opsDateKey();
    currentDateKey = key;
    var day = dayDoc || collectFromDom();
    day.dateKey = key;
    day.titleDate = displayFromKey(key);
    day.updatedAt = new Date().toISOString();
    day = normalizeDay(day);
    day.dateKey = key;
    day.titleDate = displayFromKey(key);
    if (!pack.byDate || typeof pack.byDate !== "object") pack.byDate = {};
    pack.byDate[key] = day;
    pack.activeDate = key;
    pack.updatedAt = day.updatedAt;
    if (typeof global.HKStorage.normalizeNightHandover === "function") {
      pack = global.HKStorage.normalizeNightHandover(pack);
    }
    data.nightHandover = pack;
    global.HKStorage.save(data);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
    dirty = false;
    syncDirtyUi();
    syncDateInputs(key);
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

  function autosizeTextarea(el) {
    if (!el || el.tagName !== "TEXTAREA") return;
    el.style.height = "0px";
    el.style.height = Math.max(28, el.scrollHeight) + "px";
  }

  function autosizeAllIn(root) {
    if (!root) return;
    root.querySelectorAll("textarea").forEach(autosizeTextarea);
  }

  function collectFromDom() {
    var base = defaultData(currentDateKey || opsDateKey());
    base.dateKey = currentDateKey || base.dateKey;
    base.titleDate = displayFromKey(base.dateKey);
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
    for (i = 0; i < noteCount; i++) {
      notes.push({
        category: val("nhNoteCat_" + i),
        main: val("nhNoteMain_" + i),
        annex: val("nhNoteAnnex_" + i),
      });
    }
    base.notes = notes;
    var incidents = [];
    for (i = 0; i < incidentCount; i++) {
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

  function ensureExtrasBuilt() {
    var tbody = document.getElementById("nhExtrasBody");
    if (!tbody || tbody.__hkBuilt) return;
    tbody.__hkBuilt = true;
    tbody.innerHTML = "";
    EXTRA_KEYS.forEach(function (k) {
      var tr = document.createElement("tr");
      if (k.highlight) tr.className = "nh-row--highlight";
      tr.innerHTML =
        '<th scope="row">' +
        k.label +
        "</th>" +
        '<td><textarea id="nhEx_' +
        k.id +
        '_main" class="nh-autosize" rows="1" autocomplete="off"></textarea></td>' +
        '<td><textarea id="nhEx_' +
        k.id +
        '_annex" class="nh-autosize" rows="1" autocomplete="off"></textarea></td>';
      tbody.appendChild(tr);
    });
  }

  function rebuildNotesBody(notes) {
    var tbody = document.getElementById("nhNotesBody");
    if (!tbody) return;
    notes = Array.isArray(notes) ? notes : [];
    noteCount = Math.max(MIN_NOTE_ROWS, notes.length || DEFAULT_NOTE_ROWS);
    tbody.innerHTML = "";
    var i;
    for (i = 0; i < noteCount; i++) {
      var n = notes[i] || emptyNote();
      var tr = document.createElement("tr");
      if (i === 0) tr.className = "nh-row--highlight";
      tr.innerHTML =
        '<td><textarea id="nhNoteCat_' +
        i +
        '" class="nh-autosize" rows="1" autocomplete="off"></textarea></td>' +
        '<td><textarea id="nhNoteMain_' +
        i +
        '" class="nh-autosize" rows="1" autocomplete="off"></textarea></td>' +
        '<td><textarea id="nhNoteAnnex_' +
        i +
        '" class="nh-autosize" rows="1" autocomplete="off"></textarea></td>' +
        '<td class="nh-row-actions">' +
        '<button type="button" class="nh-row-btn nh-row-btn--minus" data-nh-note-remove="' +
        i +
        '" title="행 삭제" aria-label="구분 행 삭제">−</button>' +
        "</td>";
      tbody.appendChild(tr);
      setVal("nhNoteCat_" + i, n.category);
      setVal("nhNoteMain_" + i, n.main);
      setVal("nhNoteAnnex_" + i, n.annex);
    }
    autosizeAllIn(tbody);
  }

  function rebuildIncidentsBody(incidents) {
    var tbody = document.getElementById("nhIncidentsBody");
    if (!tbody) return;
    incidents = Array.isArray(incidents) ? incidents : [];
    incidentCount = Math.max(MIN_INCIDENT_ROWS, incidents.length || DEFAULT_INCIDENT_ROWS);
    tbody.innerHTML = "";
    var i;
    for (i = 0; i < incidentCount; i++) {
      var inc = incidents[i] || emptyIncident();
      var tr = document.createElement("tr");
      tr.className = "nh-incident-row";
      tr.innerHTML =
        '<td><textarea id="nhIncRoom_' +
        i +
        '" class="nh-autosize" rows="1" placeholder="객실" autocomplete="off"></textarea></td>' +
        '<td><textarea id="nhIncBy_' +
        i +
        '" class="nh-autosize" rows="1" placeholder="이름" autocomplete="off"></textarea></td>' +
        '<td><textarea id="nhIncDates_' +
        i +
        '" class="nh-autosize" rows="1" placeholder="기간" autocomplete="off"></textarea></td>' +
        '<td><textarea id="nhIncDetail_' +
        i +
        '" class="nh-autosize" rows="1" placeholder="내용" autocomplete="off"></textarea></td>' +
        '<td class="nh-row-actions">' +
        '<button type="button" class="nh-row-btn nh-row-btn--minus" data-nh-inc-remove="' +
        i +
        '" title="행 삭제" aria-label="이슈 행 삭제">−</button>' +
        "</td>";
      tbody.appendChild(tr);
      setVal("nhIncRoom_" + i, inc.room);
      setVal("nhIncBy_" + i, inc.by);
      setVal("nhIncDates_" + i, inc.dates);
      setVal("nhIncDetail_" + i, inc.detail);
    }
    autosizeAllIn(tbody);
  }

  function fillTopFields(pack) {
    syncDateInputs(pack.dateKey || currentDateKey);
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
  }

  function fillDay(day) {
    ensureExtrasBuilt();
    fillTopFields(day);
    rebuildNotesBody(day.notes && day.notes.length ? day.notes : null);
    rebuildIncidentsBody(day.incidents && day.incidents.length ? day.incidents : null);
    dirty = false;
    syncEditLock();
    syncDirtyUi();
    autosizeAllIn(document.getElementById("nightHandoverPanel"));
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
    fillDay(dayFromPack(loadPack(), currentDateKey));
  }

  function openDatePicker() {
    var input = document.getElementById("nhDateInput");
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

  function addNoteRow() {
    if (!canEdit()) return;
    var notes = collectFromDom().notes;
    notes.push(emptyNote());
    rebuildNotesBody(notes);
    markDirty();
    syncEditLock();
  }

  function removeNoteRow(idx) {
    if (!canEdit()) return;
    var notes = collectFromDom().notes;
    if (notes.length <= MIN_NOTE_ROWS) {
      notes[idx] = emptyNote();
      rebuildNotesBody(notes);
      markDirty();
      syncEditLock();
      return;
    }
    notes.splice(idx, 1);
    rebuildNotesBody(notes);
    markDirty();
    syncEditLock();
  }

  function addIncidentRow() {
    if (!canEdit()) return;
    var incidents = collectFromDom().incidents;
    incidents.push(emptyIncident());
    rebuildIncidentsBody(incidents);
    markDirty();
    syncEditLock();
  }

  function removeIncidentRow(idx) {
    if (!canEdit()) return;
    var incidents = collectFromDom().incidents;
    if (incidents.length <= MIN_INCIDENT_ROWS) {
      incidents[idx] = emptyIncident();
      rebuildIncidentsBody(incidents);
      markDirty();
      syncEditLock();
      return;
    }
    incidents.splice(idx, 1);
    rebuildIncidentsBody(incidents);
    markDirty();
    syncEditLock();
  }

  function syncEditLock() {
    var editable = canEdit();
    var root = document.getElementById("nightHandoverPanel");
    if (!root) return;
    root.classList.toggle("is-readonly", !editable);
    root.querySelectorAll("input, textarea, button").forEach(function (el) {
      if (el.id === "nhDateInput") {
        el.disabled = false;
        return;
      }
      if (el.id === "nhTitleDate") {
        el.readOnly = true;
        el.disabled = false;
        return;
      }
      if (
        el.id === "btnNightHandoverSave" ||
        el.id === "btnNightHandoverClear" ||
        el.id === "btnNightHandoverReset" ||
        el.id === "btnNightHandoverExcel" ||
        el.id === "btnNhNoteAdd" ||
        el.id === "btnNhIncAdd" ||
        el.id === "btnNhDateCal" ||
        el.hasAttribute("data-nh-note-remove") ||
        el.hasAttribute("data-nh-inc-remove")
      ) {
        if (el.id === "btnNightHandoverExcel" || el.id === "btnNhDateCal") {
          el.disabled = false;
          return;
        }
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

  function render(force) {
    if (dirty && !force) {
      syncEditLock();
      syncDirtyUi();
      return;
    }
    var pack = loadPack();
    if (!currentDateKey) {
      /* 기본: 오늘(17시 이후면 다음날). 다른 날은 달력으로 이동 */
      currentDateKey = opsDateKey();
    }
    fillDay(dayFromPack(pack, currentDateKey));
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
    if (!window.confirm("야간 인계사항을 초기화할까요?\n이 날짜 내용이 비워지고 바로 동기화됩니다.")) return;
    var pack = defaultData(currentDateKey || opsDateKey());
    fillDay(pack);
    persist(collectFromDom(), true);
    if (typeof opts.toast === "function") opts.toast("야간 인계사항 초기화됨");
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
    var aoa = [["항목", "본관", "별관", "기타"]];
    aoa.push(["날짜", pack.titleDate || displayFromKey(pack.dateKey || key) || "", "", ""]);
    var duty = pack.duty || {};
    aoa.push(["미드", (duty.mid && duty.mid.main) || "", (duty.mid && duty.mid.annex) || "", ""]);
    aoa.push([
      "올나이트",
      (duty.allNight && duty.allNight.main) || "",
      (duty.allNight && duty.allNight.annex) || "",
      "",
    ]);
    aoa.push([
      "유틸리티",
      (duty.utility && duty.utility.main) || "",
      (duty.utility && duty.utility.annex) || "",
      "",
    ]);
    var ch = pack.chargers || {};
    var etc = pack.etc || {};
    aoa.push([
      "충전기/기타",
      ["C:" + (ch.cType || ""), "아이폰:" + (ch.iphone || ""), "5핀:" + (ch.fivePin || "")].join(" "),
      "",
      ["선풍기:" + (etc.fan || ""), "덕다운:" + (etc.duckDown || ""), "키즈가운:" + (etc.kidsRobe || "")].join(" "),
    ]);
    EXTRA_KEYS.forEach(function (k) {
      var ex = (pack.extras && pack.extras[k.id]) || {};
      aoa.push([k.label, ex.main || "", ex.annex || "", ""]);
    });
    (pack.notes || []).forEach(function (n, i) {
      if (!n || !(n.category || n.main || n.annex)) return;
      aoa.push(["구분" + (i + 1) + (n.category ? " · " + n.category : ""), n.main || "", n.annex || "", ""]);
    });
    (pack.incidents || []).forEach(function (inc) {
      if (!inc || !(inc.room || inc.by || inc.dates || inc.detail)) return;
      aoa.push(["이슈 " + (inc.room || ""), inc.by || "", inc.dates || "", inc.detail || ""]);
    });
    return aoa;
  }

  function nhExcelCols() {
    return [{ wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 36 }];
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
      ws["!cols"] = nhExcelCols();
      global.XLSX.utils.book_append_sheet(wb, ws, "야간인계");
      var singleName =
        "야간인계사항_" +
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
      sheet["!cols"] = nhExcelCols();
      global.XLSX.utils.book_append_sheet(wb, sheet, dk);
    });
    global.XLSX.writeFile(wb, "야간인계사항_전체_" + stamp + ".xlsx");
    if (typeof opts.toast === "function") opts.toast("전체 기간 엑셀 저장됨");
  }

  function resetOnCloseDay() {
    /* 마감 후에도 유지 — byDate 보존 */
    dirty = false;
    var panel = document.getElementById("nightHandoverPanel");
    if (panel && !panel.hidden) render(true);
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    var panel = document.getElementById("nightHandoverPanel");
    if (panel) {
      panel.addEventListener("input", function (e) {
        if (e && e.target && e.target.id === "nhDateInput") return;
        markDirty();
        if (e && e.target) autosizeTextarea(e.target);
      });
      panel.addEventListener("change", function (e) {
        if (e && e.target && e.target.id === "nhDateInput") {
          switchToDateKey(e.target.value);
          return;
        }
        markDirty();
      });
      panel.addEventListener("click", function (e) {
        var noteRm = e.target.closest("[data-nh-note-remove]");
        if (noteRm) {
          e.preventDefault();
          removeNoteRow(Number(noteRm.getAttribute("data-nh-note-remove")));
          return;
        }
        var incRm = e.target.closest("[data-nh-inc-remove]");
        if (incRm) {
          e.preventDefault();
          removeIncidentRow(Number(incRm.getAttribute("data-nh-inc-remove")));
        }
      });
    }
    var saveBtn = document.getElementById("btnNightHandoverSave");
    if (saveBtn) saveBtn.addEventListener("click", onSave);
    var clearBtn = document.getElementById("btnNightHandoverClear");
    if (clearBtn) clearBtn.addEventListener("click", onClear);
    var resetBtn = document.getElementById("btnNightHandoverReset");
    if (resetBtn) resetBtn.addEventListener("click", onClear);
    var excelBtn = document.getElementById("btnNightHandoverExcel");
    if (excelBtn) excelBtn.addEventListener("click", downloadExcel);
    var noteAdd = document.getElementById("btnNhNoteAdd");
    if (noteAdd) noteAdd.addEventListener("click", addNoteRow);
    var incAdd = document.getElementById("btnNhIncAdd");
    if (incAdd) incAdd.addEventListener("click", addIncidentRow);
    var calBtn = document.getElementById("btnNhDateCal");
    if (calBtn) calBtn.addEventListener("click", openDatePicker);
    var dateInput = document.getElementById("nhDateInput");
    if (dateInput) {
      dateInput.addEventListener("change", function () {
        switchToDateKey(dateInput.value);
      });
    }
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
    downloadExcel: downloadExcel,
    isDirty: function () {
      return !!dirty;
    },
  };
})(typeof window !== "undefined" ? window : this);
