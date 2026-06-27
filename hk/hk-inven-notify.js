/**
 * 인벤 통보 — x-data-spreadsheet (셀 합치기/나누기 · 행·열 추가 · 크기 조절)
 * 프론트 모드에서만 편집
 */
(function (global) {
  var COLS = 5;
  var PRE_DATA_START = 3;
  var PRE_DATA_ROWS = 6;
  var AFTER_HDR_ROW = 10;
  var AFTER_LABEL_ROW = 11;
  var AFTER_DATA_START = 12;
  var AFTER_DATA_ROWS = 18;
  var DEFAULT_ROW_LEN = 55;
  var SHEET_HEIGHT = 540;

  var saveTimer = null;
  var skipNextRemoteRender = false;
  var lastRenderEditable = null;
  var instances = { main: null, annex: null };

  function colLetter(c) {
    var n = c + 1;
    var s = "";
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function mergeRange(r, c, rs, cs) {
    return colLetter(c) + (r + 1) + ":" + colLetter(c + cs - 1) + (r + rs);
  }

  function templateStyles() {
    return [
      { bgcolor: "#ffffff", align: "center", valign: "middle", bold: true, fontsize: 13 },
      { bgcolor: "#f8cbad", align: "center", valign: "middle", bold: true, fontsize: 10 },
      { bgcolor: "#ff99cc", align: "center", valign: "middle", bold: true },
      { bgcolor: "#ffffff", align: "left", valign: "middle" },
      { bgcolor: "#fce4d6", align: "center", valign: "middle", bold: true, fontsize: 10 },
      { bgcolor: "#ff99cc", align: "center", valign: "middle", bold: true, fontsize: 11 },
      { bgcolor: "#ffffff", align: "center", valign: "middle", color: "#64748b" },
    ];
  }

  function mkCell(text, style, merge) {
    var c = { text: text != null ? String(text) : "" };
    if (style != null) c.style = style;
    if (merge) c.merge = merge;
    return c;
  }

  function ensureRowObj(rows, ri) {
    if (!rows[ri]) rows[ri] = { cells: {} };
    if (!rows[ri].cells) rows[ri].cells = {};
    return rows[ri].cells;
  }

  function setSheetCell(sheet, ri, ci, text) {
    var cells = ensureRowObj(sheet.rows, ri);
    cells[ci] = mkCell(text, cells[ci] && cells[ci].style != null ? cells[ci].style : 3);
  }

  function buildTemplateSheet(wingLabel) {
    var rows = {};
    var merges = [
      mergeRange(0, 0, 1, COLS),
      mergeRange(1, 0, 1, COLS),
      mergeRange(9, 0, 1, COLS),
      mergeRange(AFTER_LABEL_ROW, 0, 1, COLS),
    ];

    ensureRowObj(rows, 0)[0] = mkCell(wingLabel, 0, [COLS, 1]);
    ensureRowObj(rows, 1)[0] = mkCell(
      "인벤 뽑기 전 투입 완료 객실 (VIP, 고객요청 등)",
      1,
      [COLS, 1]
    );
    ensureRowObj(rows, 2)[0] = mkCell("객실번호", 2);
    ensureRowObj(rows, 2)[1] = mkCell("내용", 2);

    var i;
    for (i = 0; i < PRE_DATA_ROWS; i++) {
      ensureRowObj(rows, PRE_DATA_START + i)[0] = mkCell("", 3);
      ensureRowObj(rows, PRE_DATA_START + i)[1] = mkCell("", 3);
    }

    ensureRowObj(rows, 9)[0] = mkCell("14시 이후 어싸인 지정 및 두잉 통보건", 4, [COLS, 1]);
    ensureRowObj(rows, AFTER_HDR_ROW)[0] = mkCell("", 2);
    ensureRowObj(rows, AFTER_HDR_ROW)[1] = mkCell("객실번호", 2);
    ensureRowObj(rows, AFTER_HDR_ROW)[2] = mkCell("예약번호", 2);
    ensureRowObj(rows, AFTER_HDR_ROW)[3] = mkCell("내용", 2);
    ensureRowObj(rows, AFTER_HDR_ROW)[4] = mkCell("17시기준 미투입", 2);
    ensureRowObj(rows, AFTER_LABEL_ROW)[0] = mkCell(wingLabel, 5, [COLS, 1]);

    for (i = 0; i < AFTER_DATA_ROWS; i++) {
      var ri = AFTER_DATA_START + i;
      ensureRowObj(rows, ri)[0] = mkCell(String(i + 1), 6);
      ensureRowObj(rows, ri)[1] = mkCell("", 3);
      ensureRowObj(rows, ri)[2] = mkCell("", 3);
      ensureRowObj(rows, ri)[3] = mkCell("", 3);
      ensureRowObj(rows, ri)[4] = mkCell("", 3);
    }

    return {
      name: wingLabel,
      merges: merges,
      rows: rows,
      styles: templateStyles(),
      cols: {
        0: { width: 42 },
        1: { width: 76 },
        2: { width: 92 },
        3: { width: 168 },
        4: { width: 108 },
      },
    };
  }

  function fillLegacyWing(sheet, wing) {
    if (!wing || typeof wing !== "object") return;
    var pre = Array.isArray(wing.preInv) ? wing.preInv : [];
    var after = Array.isArray(wing.after14) ? wing.after14 : [];
    var i;
    for (i = 0; i < pre.length && i < PRE_DATA_ROWS; i++) {
      setSheetCell(sheet, PRE_DATA_START + i, 0, pre[i].room || "");
      setSheetCell(sheet, PRE_DATA_START + i, 1, pre[i].content || "");
    }
    for (i = 0; i < after.length && i < AFTER_DATA_ROWS; i++) {
      var ri = AFTER_DATA_START + i;
      setSheetCell(sheet, ri, 1, after[i].room || "");
      setSheetCell(sheet, ri, 2, after[i].resv || "");
      setSheetCell(sheet, ri, 3, after[i].content || "");
      setSheetCell(sheet, ri, 4, after[i].status17 || "");
    }
  }

  function migrateLegacyToV2(data) {
    return {
      version: 2,
      main: (function () {
        var s = buildTemplateSheet("본관");
        fillLegacyWing(s, data.main);
        return s;
      })(),
      annex: (function () {
        var s = buildTemplateSheet("별관");
        fillLegacyWing(s, data.annex);
        return s;
      })(),
    };
  }

  function isV2Sheet(sheet) {
    return !!(sheet && sheet.rows && typeof sheet.rows === "object");
  }

  function normalizeInvenNotify(data) {
    if (!data || typeof data !== "object") {
      return {
        version: 2,
        main: buildTemplateSheet("본관"),
        annex: buildTemplateSheet("별관"),
      };
    }
    if (data.version >= 2 && isV2Sheet(data.main) && isV2Sheet(data.annex)) {
      return { version: 2, main: data.main, annex: data.annex };
    }
    if (data.main || data.annex) {
      return migrateLegacyToV2(data);
    }
    return {
      version: 2,
      main: buildTemplateSheet("본관"),
      annex: buildTemplateSheet("별관"),
    };
  }

  function defaultInvenNotify() {
    return normalizeInvenNotify(null);
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

  function getSpreadsheetApi() {
    if (typeof global.x_spreadsheet === "function") return global.x_spreadsheet;
    if (global.x_spreadsheet && typeof global.x_spreadsheet.default === "function") {
      return global.x_spreadsheet.default;
    }
    return null;
  }

  function isFrontModeActive() {
    var btn = document.getElementById("btnFront");
    return !!(btn && btn.classList.contains("is-on"));
  }

  function getSheetDataFromInstance(inst) {
    if (!inst || typeof inst.getData !== "function") return null;
    var data = inst.getData();
    if (Array.isArray(data) && data.length) return data[0];
    if (data && data.rows) return data;
    return null;
  }

  function collectFromInstances() {
    return {
      version: 2,
      main:
        getSheetDataFromInstance(instances.main) || buildTemplateSheet("본관"),
      annex:
        getSheetDataFromInstance(instances.annex) || buildTemplateSheet("별관"),
    };
  }

  function scheduleSaveFromInstances() {
    if (!isFrontModeActive()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveInvenNotify(collectFromInstances());
    }, 500);
  }

  function destroySpreadsheets() {
    instances.main = null;
    instances.annex = null;
    var sheet = document.getElementById("invenNotifySheet");
    if (sheet) sheet.innerHTML = "";
  }

  function createSpreadsheet(mountEl, sheetData, editable) {
    var xsFn = getSpreadsheetApi();
    if (!xsFn) return null;
    var inst = xsFn(mountEl, {
      mode: editable ? "edit" : "read",
      showToolbar: editable,
      showContextmenu: editable,
      showGrid: true,
      showBottomBar: false,
      row: { len: DEFAULT_ROW_LEN, height: 26 },
      col: { len: 12, width: 90, indexWidth: 48, minWidth: 32 },
      view: {
        height: function () {
          return SHEET_HEIGHT;
        },
        width: function () {
          return mountEl.clientWidth > 0 ? mountEl.clientWidth : 480;
        },
      },
    });
    inst.loadData(sheetData);
    if (editable) {
      inst.change(function () {
        scheduleSaveFromInstances();
      });
    }
    return inst;
  }

  function isUserEditingInvenNotify() {
    var active = document.activeElement;
    if (!active || !active.closest) return false;
    return !!active.closest("#invenNotifySheet, .x-spreadsheet");
  }

  function sheetHasContent(sheet) {
    if (!sheet || !sheet.rows) return false;
    return Object.keys(sheet.rows).some(function (rk) {
      var row = sheet.rows[rk];
      if (!row || !row.cells) return false;
      return Object.keys(row.cells).some(function (ck) {
        var cell = row.cells[ck];
        var text = cell && cell.text != null ? String(cell.text).trim() : "";
        return !!text;
      });
    });
  }

  function hasContent(data) {
    var d = normalizeInvenNotify(data);
    return sheetHasContent(d.main) || sheetHasContent(d.annex);
  }

  function exportFlatRows(invenNotify) {
    var d = normalizeInvenNotify(invenNotify);
    var out = [];
    [["main", "본관"], ["annex", "별관"]].forEach(function (pair) {
      var sheet = d[pair[0]];
      if (!sheet || !sheet.rows) return;
      Object.keys(sheet.rows)
        .map(function (k) {
          return parseInt(k, 10);
        })
        .sort(function (a, b) {
          return a - b;
        })
        .forEach(function (ri) {
          var row = sheet.rows[ri];
          if (!row || !row.cells) return;
          Object.keys(row.cells)
            .map(function (k) {
              return parseInt(k, 10);
            })
            .sort(function (a, b) {
              return a - b;
            })
            .forEach(function (ci) {
              var text =
                row.cells[ci].text != null ? String(row.cells[ci].text).trim() : "";
              if (!text) return;
              out.push([pair[1], String(ri + 1), String(ci + 1), text]);
            });
        });
    });
    return out;
  }

  function renderInvenNotifyPanel(force) {
    var sheetWrap = document.getElementById("invenNotifySheet");
    var hint = document.getElementById("invenNotifyHint");
    var panel = document.getElementById("invenNotifyPanel");
    if (!sheetWrap || !panel || panel.hidden) return;

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (isFrontModeActive()) saveInvenNotify(collectFromInstances());
    }

    var editable = isFrontModeActive();
    if (
      lastRenderEditable &&
      !editable &&
      (instances.main || instances.annex)
    ) {
      saveInvenNotify(collectFromInstances());
    }

    if (!force && skipNextRemoteRender) {
      skipNextRemoteRender = false;
      if (editable === lastRenderEditable && isUserEditingInvenNotify()) return;
    }
    if (!force && isUserEditingInvenNotify() && editable) return;

    var xsFn = getSpreadsheetApi();
    if (!xsFn) {
      sheetWrap.innerHTML =
        '<p class="inven-notify-load-error">스프레드시트 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>';
      return;
    }

    var data = loadInvenNotify();
    lastRenderEditable = editable;

    if (hint) {
      hint.textContent = editable
        ? "엑셀처럼 셀 편집 · 행/열 추가 · 합치기/나누기 · 크기 조절 (상단 도구 모음 · 우클릭). 저장은 자동 동기화됩니다."
        : "조회 전용입니다. 수정은 프론트 모드를 켠 뒤 가능합니다.";
    }

    destroySpreadsheets();

    var grid = document.createElement("div");
    grid.className = "inven-notify-grid";

    var mainHost = document.createElement("div");
    mainHost.className = "inven-notify-wing-host";
    mainHost.setAttribute("data-wing", "main");
    grid.appendChild(mainHost);

    var annexHost = document.createElement("div");
    annexHost.className = "inven-notify-wing-host";
    annexHost.setAttribute("data-wing", "annex");
    grid.appendChild(annexHost);

    sheetWrap.appendChild(grid);

    instances.main = createSpreadsheet(mainHost, data.main, editable);
    instances.annex = createSpreadsheet(annexHost, data.annex, editable);
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
    hasContent: hasContent,
    exportFlatRows: exportFlatRows,
    buildTemplateSheet: buildTemplateSheet,
  };
})(typeof window !== "undefined" ? window : this);
