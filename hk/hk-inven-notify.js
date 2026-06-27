/**
 * 인벤 통보 — 엑셀형 표 (프론트 모드에서만 편집)
 */
(function (global) {
  var PRE_INV_ROWS = 6;
  var AFTER14_ROWS = 18;
  var saveTimer = null;
  var skipNextRemoteRender = false;
  var lastRenderEditable = null;

  function emptyPreRow() {
    return { room: "", content: "" };
  }

  function emptyAfter14Row() {
    return { room: "", resv: "", content: "", status17: "" };
  }

  function defaultWing() {
    var pre = [];
    var after = [];
    var i;
    for (i = 0; i < PRE_INV_ROWS; i++) pre.push(emptyPreRow());
    for (i = 0; i < AFTER14_ROWS; i++) after.push(emptyAfter14Row());
    return { preInv: pre, after14: after };
  }

  function defaultInvenNotify() {
    return { main: defaultWing(), annex: defaultWing() };
  }

  function normalizeRowList(list, factory, minLen) {
    var out = [];
    var src = Array.isArray(list) ? list : [];
    var i;
    for (i = 0; i < src.length; i++) {
      var row = src[i] && typeof src[i] === "object" ? src[i] : {};
      out.push(factory(row));
    }
    while (out.length < minLen) out.push(factory({}));
    return out;
  }

  function normalizePreRow(row) {
    return {
      room: row.room != null ? String(row.room) : "",
      content: row.content != null ? String(row.content) : "",
    };
  }

  function normalizeAfter14Row(row) {
    return {
      room: row.room != null ? String(row.room) : "",
      resv: row.resv != null ? String(row.resv) : "",
      content: row.content != null ? String(row.content) : "",
      status17: row.status17 != null ? String(row.status17) : "",
    };
  }

  function normalizeWing(wing) {
    wing = wing && typeof wing === "object" ? wing : {};
    return {
      preInv: normalizeRowList(wing.preInv, normalizePreRow, PRE_INV_ROWS),
      after14: normalizeRowList(wing.after14, normalizeAfter14Row, AFTER14_ROWS),
    };
  }

  function normalizeInvenNotify(data) {
    data = data && typeof data === "object" ? data : {};
    return {
      main: normalizeWing(data.main),
      annex: normalizeWing(data.annex),
    };
  }

  function loadInvenNotify() {
    var storage = global.HKStorage ? global.HKStorage.load() : {};
    return normalizeInvenNotify(storage.invenNotify);
  }

  function saveInvenNotify(data) {
    if (!global.HKStorage) return;
    var storage = global.HKStorage.load();
    storage.invenNotify = normalizeInvenNotify(data);
    skipNextRemoteRender = true;
    global.HKStorage.save(storage);
  }

  function isFrontModeActive() {
    var btn = document.getElementById("btnFront");
    return !!(btn && btn.classList.contains("is-on"));
  }

  function scheduleSaveFromDom() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveInvenNotify(collectFromDom());
    }, 450);
  }

  function cellInput(value, editable, ariaLabel) {
    if (editable) {
      var inp = document.createElement("input");
      inp.type = "text";
      inp.className = "inven-notify-cell-input";
      inp.value = value || "";
      inp.setAttribute("aria-label", ariaLabel || "");
      inp.addEventListener("input", scheduleSaveFromDom);
      inp.addEventListener("change", scheduleSaveFromDom);
      return inp;
    }
    var span = document.createElement("span");
    span.className = "inven-notify-cell-text";
    span.textContent = value || "";
    return span;
  }

  function renderPreRows(tbody, rows, wingKey, editable) {
    tbody.innerHTML = "";
    rows.forEach(function (row, idx) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-wing", wingKey);
      tr.setAttribute("data-section", "preInv");
      tr.setAttribute("data-row", String(idx));

      var tdRoom = document.createElement("td");
      tdRoom.className = "inven-notify-td-room";
      tdRoom.appendChild(
        cellInput(row.room, editable, wingKey + " 객실번호 " + (idx + 1))
      );
      tr.appendChild(tdRoom);

      var tdContent = document.createElement("td");
      tdContent.className = "inven-notify-td-content";
      tdContent.appendChild(
        cellInput(row.content, editable, wingKey + " 내용 " + (idx + 1))
      );
      tr.appendChild(tdContent);

      tbody.appendChild(tr);
    });
  }

  function renderAfter14Rows(tbody, rows, wingKey, editable) {
    tbody.innerHTML = "";
    rows.forEach(function (row, idx) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-wing", wingKey);
      tr.setAttribute("data-section", "after14");
      tr.setAttribute("data-row", String(idx));

      var tdIdx = document.createElement("td");
      tdIdx.className = "inven-notify-td-idx";
      tdIdx.textContent = String(idx + 1);
      tr.appendChild(tdIdx);

      var tdRoom = document.createElement("td");
      tdRoom.className = "inven-notify-td-room";
      tdRoom.appendChild(
        cellInput(row.room, editable, wingKey + " 객실번호 " + (idx + 1))
      );
      tr.appendChild(tdRoom);

      var tdResv = document.createElement("td");
      tdResv.className = "inven-notify-td-resv";
      tdResv.appendChild(
        cellInput(row.resv, editable, wingKey + " 예약번호 " + (idx + 1))
      );
      tr.appendChild(tdResv);

      var tdContent = document.createElement("td");
      tdContent.className = "inven-notify-td-content";
      tdContent.appendChild(
        cellInput(row.content, editable, wingKey + " 내용 " + (idx + 1))
      );
      tr.appendChild(tdContent);

      var tdStatus = document.createElement("td");
      tdStatus.className = "inven-notify-td-status";
      tdStatus.appendChild(
        cellInput(row.status17, editable, wingKey + " 17시기준 미투입 " + (idx + 1))
      );
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });
  }

  function buildWingTable(wingKey, wingLabel, wingData, editable) {
    var wrap = document.createElement("div");
    wrap.className = "inven-notify-wing";
    wrap.setAttribute("data-wing", wingKey);

    var table = document.createElement("table");
    table.className = "inven-notify-table";

    var thead1 = document.createElement("thead");
    var trBuilding = document.createElement("tr");
    var thBuilding = document.createElement("th");
    thBuilding.className = "inven-notify-th-building";
    thBuilding.colSpan = 2;
    thBuilding.textContent = wingLabel;
    trBuilding.appendChild(thBuilding);
    thead1.appendChild(trBuilding);

    var trSec1 = document.createElement("tr");
    var thSec1 = document.createElement("th");
    thSec1.className = "inven-notify-th-section";
    thSec1.colSpan = 2;
    thSec1.textContent = "인벤 뽑기 전 투입 완료 객실 (VIP, 고객요청 등)";
    trSec1.appendChild(thSec1);
    thead1.appendChild(trSec1);

    var trPreHead = document.createElement("tr");
    ["객실번호", "내용"].forEach(function (label, i) {
      var th = document.createElement("th");
      th.className = i === 0 ? "inven-notify-th-room" : "inven-notify-th-content";
      th.textContent = label;
      trPreHead.appendChild(th);
    });
    thead1.appendChild(trPreHead);
    table.appendChild(thead1);

    var preBody = document.createElement("tbody");
    preBody.className = "inven-notify-pre-body";
    preBody.setAttribute("data-wing", wingKey);
    renderPreRows(preBody, wingData.preInv, wingKey, editable);
    table.appendChild(preBody);

    var thead2 = document.createElement("thead");
    var trSec2 = document.createElement("tr");
    var thSec2 = document.createElement("th");
    thSec2.className = "inven-notify-th-section inven-notify-th-section--after14";
    thSec2.colSpan = 5;
    thSec2.textContent = "14시 이후 어싸인 지정 및 두잉 통보건";
    trSec2.appendChild(thSec2);
    thead2.appendChild(trSec2);

    var trAfterHead = document.createElement("tr");
    ["", "객실번호", "예약번호", "내용", "17시기준 미투입"].forEach(function (label, i) {
      var th = document.createElement("th");
      if (i === 0) th.className = "inven-notify-th-idx";
      else if (i === 1) th.className = "inven-notify-th-room";
      else if (i === 2) th.className = "inven-notify-th-resv";
      else if (i === 3) th.className = "inven-notify-th-content";
      else th.className = "inven-notify-th-status";
      th.textContent = label;
      trAfterHead.appendChild(th);
    });
    thead2.appendChild(trAfterHead);

    var trWingLabel = document.createElement("tr");
    var thWingLabel = document.createElement("th");
    thWingLabel.className = "inven-notify-th-wing-label";
    thWingLabel.colSpan = 5;
    thWingLabel.textContent = wingLabel;
    trWingLabel.appendChild(thWingLabel);
    thead2.appendChild(trWingLabel);
    table.appendChild(thead2);

    var afterBody = document.createElement("tbody");
    afterBody.className = "inven-notify-after-body";
    afterBody.setAttribute("data-wing", wingKey);
    renderAfter14Rows(afterBody, wingData.after14, wingKey, editable);
    table.appendChild(afterBody);

    wrap.appendChild(table);
    return wrap;
  }

  function collectWingFromDom(wingKey) {
    var pre = [];
    var after = [];
    document
      .querySelectorAll(
        '.inven-notify-pre-body[data-wing="' +
          wingKey +
          '"] tr[data-section="preInv"]'
      )
      .forEach(function (tr) {
        var inputs = tr.querySelectorAll("input");
        if (inputs.length >= 2) {
          pre.push({ room: inputs[0].value, content: inputs[1].value });
        } else {
          var tds = tr.querySelectorAll("td");
          pre.push({
            room: tds[0] ? tds[0].textContent : "",
            content: tds[1] ? tds[1].textContent : "",
          });
        }
      });
    document
      .querySelectorAll(
        '.inven-notify-after-body[data-wing="' +
          wingKey +
          '"] tr[data-section="after14"]'
      )
      .forEach(function (tr) {
        var inputs = tr.querySelectorAll("input");
        if (inputs.length >= 4) {
          after.push({
            room: inputs[0].value,
            resv: inputs[1].value,
            content: inputs[2].value,
            status17: inputs[3].value,
          });
        } else {
          var tds = tr.querySelectorAll("td");
          after.push({
            room: tds[1] ? tds[1].textContent : "",
            resv: tds[2] ? tds[2].textContent : "",
            content: tds[3] ? tds[3].textContent : "",
            status17: tds[4] ? tds[4].textContent : "",
          });
        }
      });
    return normalizeWing({ preInv: pre, after14: after });
  }

  function collectFromDom() {
    return {
      main: collectWingFromDom("main"),
      annex: collectWingFromDom("annex"),
    };
  }

  function isUserEditingInvenNotify() {
    var active = document.activeElement;
    if (!active || !active.closest) return false;
    return !!active.closest("#invenNotifySheet");
  }

  function renderInvenNotifyPanel(force) {
    var sheet = document.getElementById("invenNotifySheet");
    var hint = document.getElementById("invenNotifyHint");
    var panel = document.getElementById("invenNotifyPanel");
    if (!sheet || !panel || panel.hidden) return;

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      saveInvenNotify(collectFromDom());
    }

    var editable = isFrontModeActive();
    if (lastRenderEditable && !editable && document.querySelector("#invenNotifySheet input")) {
      saveInvenNotify(collectFromDom());
    }
    if (!force && skipNextRemoteRender) {
      skipNextRemoteRender = false;
      if (editable === lastRenderEditable && isUserEditingInvenNotify()) return;
    }
    if (!force && isUserEditingInvenNotify() && editable) return;

    var data = loadInvenNotify();
    lastRenderEditable = editable;

    if (hint) {
      hint.textContent = editable
        ? "셀을 클릭해 내용을 입력하세요. 저장은 자동으로 동기화됩니다."
        : "조회 전용입니다. 수정은 프론트 모드를 켠 뒤 가능합니다.";
    }

    sheet.innerHTML = "";
    sheet.classList.toggle("inven-notify-sheet--readonly", !editable);

    var grid = document.createElement("div");
    grid.className = "inven-notify-grid";
    grid.appendChild(buildWingTable("main", "본 관", data.main, editable));
    grid.appendChild(buildWingTable("annex", "별 관", data.annex, editable));
    sheet.appendChild(grid);
  }

  function initInvenNotify() {
    renderInvenNotifyPanel(true);
  }

  global.HKInvenNotify = {
    defaultInvenNotify: defaultInvenNotify,
    normalizeInvenNotify: normalizeInvenNotify,
    load: loadInvenNotify,
    save: saveInvenNotify,
    render: renderInvenNotifyPanel,
    init: initInvenNotify,
    isFrontModeActive: isFrontModeActive,
  };
})(typeof window !== "undefined" ? window : this);
