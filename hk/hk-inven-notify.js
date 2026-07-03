/**
 * 인벤 통보 — 스프레드시트 표 (조회: 전체 / 편집·저장: 프론트 모드)
 * 인벤「만들기」표는 로컬 초안에만 반영되며, 「저장」을 눌러야 서버에 공유됩니다.
 */
(function (global) {
  var DRAFT_LS = "hk-inven-notify-draft-v5";
  var skipNextRemoteRender = false;
  var lastRenderEditable = null;
  var uiReady = false;
  var draftDirty = false;
  var publishFeedbackTimer = null;

  var SIDES = ["main", "annex"];
  var TABLE_KEYS = ["seq", "room", "confirmationNo", "itemCode1", "trace"];
  var COL_COUNT = 10;
  var DEFAULT_COL_WIDTHS = [48, 76, 88, 120, 220, 48, 76, 88, 120, 220];

  var selection = null;
  var colResizeActive = false;
  var rowDragActive = false;
  var cellSelectDrag = { active: false, moved: false, anchorR: 0, anchorC: 0 };
  var sortState = { col: null, dir: null };
  var undoStack = [];
  var undoMax = 50;
  var undoApplying = false;
  var cellEditUndoKey = null;
  var undoKeyboardBound = false;

  var COL_LABELS = ["순번", "룸번호", "예약번호", "대여물품", "트레이스"];

  var els = {
    mount: null,
    toolbar: null,
    tableWrap: null,
    tableBody: null,
    tableHead: null,
    empty: null,
    btnSave: null,
    toolbarHint: null,
    hint: null,
  };

  var state = defaultInvenNotify();
  var uiHooks = {};

  function defaultInvenNotify() {
    return {
      version: 5,
      table: {
        updatedAt: "",
        colWidths: DEFAULT_COL_WIDTHS.slice(),
        merges: [],
        rows: [],
      },
    };
  }

  function emptyTableSide() {
    return { seq: "", room: "", confirmationNo: "", itemCode1: "", trace: "" };
  }

  function normalizeTableSide(raw) {
    var side = emptyTableSide();
    if (!raw || typeof raw !== "object") return side;
    TABLE_KEYS.forEach(function (key) {
      side[key] = raw[key] != null ? String(raw[key]) : "";
    });
    return side;
  }

  function normalizeTableRow(raw) {
    return {
      main: normalizeTableSide(raw && raw.main),
      annex: normalizeTableSide(raw && raw.annex),
    };
  }

  function normalizeMerge(raw) {
    if (!raw || typeof raw !== "object") return null;
    var r = parseInt(raw.r, 10);
    var c = parseInt(raw.c, 10);
    var rowspan = parseInt(raw.rowspan, 10) || 1;
    var colspan = parseInt(raw.colspan, 10) || 1;
    if (isNaN(r) || isNaN(c) || r < 0 || c < 0 || c >= COL_COUNT) return null;
    if (rowspan < 1 || colspan < 1) return null;
    if (c + colspan > COL_COUNT) colspan = COL_COUNT - c;
    return { r: r, c: c, rowspan: rowspan, colspan: colspan };
  }

  function normalizeTable(data) {
    var table = {
      updatedAt: "",
      colWidths: DEFAULT_COL_WIDTHS.slice(),
      merges: [],
      rows: [],
    };
    if (!data || typeof data !== "object") return table;
    table.updatedAt = data.updatedAt != null ? String(data.updatedAt) : "";
    if (Array.isArray(data.colWidths) && data.colWidths.length === COL_COUNT) {
      table.colWidths = data.colWidths.map(function (w) {
        return Math.max(32, parseInt(w, 10) || 72);
      });
    }
    if (Array.isArray(data.merges)) {
      data.merges.forEach(function (m) {
        var n = normalizeMerge(m);
        if (n) table.merges.push(n);
      });
    }
    if (Array.isArray(data.rows)) {
      data.rows.forEach(function (row) {
        table.rows.push(normalizeTableRow(row));
      });
    }
    return table;
  }

  function normalizeInvenNotify(data) {
    var table = normalizeTable(data && data.table);
    if ((!table.rows || !table.rows.length) && data && data.version >= 3 && Array.isArray(data.images)) {
      /* legacy image-only payloads → empty table */
    }
    return { version: 5, table: table };
  }

  function cloneState(src) {
    return JSON.parse(JSON.stringify(normalizeInvenNotify(src)));
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

  function getPublishedSignature() {
    return JSON.stringify(normalizeInvenNotify(loadInvenNotify()));
  }

  function saveDraftLocal() {
    try {
      sessionStorage.setItem(
        DRAFT_LS,
        JSON.stringify({ dirty: true, state: state })
      );
    } catch (e) {}
  }

  function loadDraftLocal() {
    try {
      var raw = sessionStorage.getItem(DRAFT_LS);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.dirty || !parsed.state) return null;
      return normalizeInvenNotify(parsed.state);
    } catch (e) {
      return null;
    }
  }

  function clearDraftLocal() {
    try {
      sessionStorage.removeItem(DRAFT_LS);
    } catch (e) {}
  }

  function isFrontModeActive() {
    var btn = document.getElementById("btnFront");
    return !!(btn && btn.classList.contains("is-on"));
  }

  function flatCol(side, key) {
    var si = SIDES.indexOf(side);
    var ki = TABLE_KEYS.indexOf(key);
    if (si < 0 || ki < 0) return -1;
    return si * 5 + ki;
  }

  function sideKeyFromFlat(c) {
    var si = Math.floor(c / 5);
    var ki = c % 5;
    return { side: SIDES[si], key: TABLE_KEYS[ki] };
  }

  function cellCoordKey(r, c) {
    return r + ":" + c;
  }

  function getCellValue(r, c) {
    var rows = state.table.rows;
    if (!rows[r]) return "";
    var sk = sideKeyFromFlat(c);
    if (!sk.side || !rows[r][sk.side]) return "";
    return rows[r][sk.side][sk.key] != null ? String(rows[r][sk.side][sk.key]) : "";
  }

  function setCellValue(r, c, val) {
    if (!state.table.rows[r]) return;
    var sk = sideKeyFromFlat(c);
    if (!sk.side) return;
    if (!state.table.rows[r][sk.side]) state.table.rows[r][sk.side] = emptyTableSide();
    state.table.rows[r][sk.side][sk.key] = val != null ? String(val) : "";
  }

  function buildMergeMap(merges) {
    var map = {};
    (merges || []).forEach(function (m) {
      for (var dr = 0; dr < m.rowspan; dr++) {
        for (var dc = 0; dc < m.colspan; dc++) {
          var rr = m.r + dr;
          var cc = m.c + dc;
          map[cellCoordKey(rr, cc)] = {
            skip: !(dr === 0 && dc === 0),
            merge: m,
          };
        }
      }
    });
    return map;
  }

  function findMergeAt(r, c) {
    var merges = state.table.merges || [];
    for (var i = 0; i < merges.length; i++) {
      var m = merges[i];
      if (r >= m.r && r < m.r + m.rowspan && c >= m.c && c < m.c + m.colspan) {
        return { merge: m, index: i };
      }
    }
    return null;
  }

  function cloneTable(table) {
    return JSON.parse(JSON.stringify(normalizeTable(table)));
  }

  function pushUndoSnapshot() {
    if (undoApplying || !isFrontModeActive()) return;
    undoStack.push(cloneTable(state.table));
    if (undoStack.length > undoMax) undoStack.shift();
  }

  function undoTable() {
    if (!isFrontModeActive() || !undoStack.length) return;
    undoApplying = true;
    state.table = undoStack.pop();
    cellEditUndoKey = null;
    clearSelection();
    sortState = { col: null, dir: null };
    undoApplying = false;
    markDraftDirty();
    renderTable();
    updateToolbarHint();
  }

  function resetOnCloseDay() {
    clearDraftLocal();
    state = cloneState(defaultInvenNotify());
    draftDirty = false;
    sortState = { col: null, dir: null };
    undoStack = [];
    cellEditUndoKey = null;
    clearSelection();
    if (ensureUi()) {
      if (els.tableWrap) {
        els.tableWrap.classList.remove("inven-notify-table-wrap--draft");
      }
      renderTable();
      updateSaveButton();
      updateToolbarHint();
      updateEmpty();
    }
  }

  function resetInvenTable() {
    if (!isFrontModeActive()) return;
    if (
      !confirm(
        "표를 초기화할까요?\n\n저장되지 않은 변경은 사라지고, 마지막 저장본(없으면 빈 표)으로 돌아갑니다."
      )
    ) {
      return;
    }
    syncTableFromDom();
    pushUndoSnapshot();
    var published = loadInvenNotify();
    state.table = cloneTable(published.table);
    sortState = { col: null, dir: null };
    cellEditUndoKey = null;
    clearSelection();
    draftDirty = false;
    clearDraftLocal();
    updateSaveButton();
    updateToolbarHint();
    if (els.tableWrap) {
      els.tableWrap.classList.toggle("inven-notify-table-wrap--draft", draftDirty);
    }
    renderTable();
  }

  function isInvenNotifyPanelActive() {
    var panel = document.getElementById("invenNotifyPanel");
    return !!(panel && !panel.hidden);
  }

  function bindUndoKeyboard() {
    if (undoKeyboardBound) return;
    undoKeyboardBound = true;
    document.addEventListener("keydown", function (e) {
      if (!isFrontModeActive() || !isInvenNotifyPanelActive()) return;
      if (!(e.ctrlKey || e.metaKey) || e.key !== "z" || e.shiftKey) return;
      if (e.target.closest && !e.target.closest("#invenNotifyPanel")) return;
      e.preventDefault();
      syncTableFromDom();
      undoTable();
    });
  }

  function markDraftDirty() {
    if (!isFrontModeActive()) return;
    draftDirty = true;
    saveDraftLocal();
    updateSaveButton();
    updateToolbarHint();
    if (els.tableWrap) {
      els.tableWrap.classList.toggle("inven-notify-table-wrap--draft", true);
    }
  }

  function publishInvenNotify() {
    if (!isFrontModeActive()) {
      alert("프론트 모드에서만 저장할 수 있습니다.");
      return;
    }
    state.table.updatedAt = new Date().toISOString();
    saveInvenNotify(state);
    draftDirty = false;
    clearDraftLocal();
    undoStack = [];
    cellEditUndoKey = null;
    updateSaveButton();
    updateToolbarHint();
    if (els.tableWrap) els.tableWrap.classList.remove("inven-notify-table-wrap--draft");
    if (els.btnSave) {
      var prev = els.btnSave.textContent;
      els.btnSave.textContent = "저장 완료";
      els.btnSave.classList.add("is-done");
      if (publishFeedbackTimer) clearTimeout(publishFeedbackTimer);
      publishFeedbackTimer = setTimeout(function () {
        publishFeedbackTimer = null;
        if (els.btnSave) {
          els.btnSave.textContent = prev;
          els.btnSave.classList.remove("is-done");
        }
        updateSaveButton();
      }, 1800);
    }
    if (uiHooks.onPublished) uiHooks.onPublished();
  }

  function escapeHtml(v) {
    return (v || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeSelection(sel) {
    if (!sel) return null;
    var r0 = Math.min(sel.r0, sel.r1);
    var r1 = Math.max(sel.r0, sel.r1);
    var c0 = Math.min(sel.c0, sel.c1);
    var c1 = Math.max(sel.c0, sel.c1);
    return { r0: r0, c0: c0, r1: r1, c1: c1 };
  }

  function clampSelectionToSide(r0, c0, r1, c1, anchorC) {
    var minC = Math.min(c0, c1);
    var maxC = Math.max(c0, c1);
    if (anchorC < 5) {
      minC = Math.max(0, minC);
      maxC = Math.min(4, maxC);
    } else {
      minC = Math.max(5, minC);
      maxC = Math.min(9, maxC);
    }
    return normalizeSelection({
      r0: Math.min(r0, r1),
      c0: minC,
      r1: Math.max(r0, r1),
      c1: maxC,
    });
  }

  function setSelection(r, c, extend) {
    if (!isFrontModeActive()) return;
    if (extend && selection) {
      selection = clampSelectionToSide(selection.r0, selection.c0, r, c, selection.c0);
    } else {
      selection = normalizeSelection({ r0: r, c0: c, r1: r, c1: c });
    }
    highlightSelection();
  }

  function setSelectionRange(anchorR, anchorC, r, c) {
    selection = clampSelectionToSide(anchorR, anchorC, r, c, anchorC);
    highlightSelection();
  }

  function cellFromEventTarget(target) {
    if (!target || !target.closest) return null;
    var td = target.closest(".inven-notify-table__cell");
    if (!td || !els.tableBody || !els.tableBody.contains(td)) return null;
    var r = parseInt(td.getAttribute("data-r"), 10);
    var c = parseInt(td.getAttribute("data-c"), 10);
    if (isNaN(r) || isNaN(c)) return null;
    return { td: td, r: r, c: c };
  }

  function focusCellEditor(td) {
    if (!td) return;
    var edit =
      td.querySelector(".inven-notify-cell-edit") ||
      (td.getAttribute("contenteditable") === "true" ? td : null);
    if (edit) edit.focus();
  }

  function clearSelection() {
    selection = null;
    highlightSelection();
  }

  function highlightSelection() {
    if (!els.tableBody) return;
    els.tableBody.querySelectorAll(".inven-notify-table__cell").forEach(function (td) {
      td.classList.remove("is-selected");
    });
    if (!selection) return;
    var sel = normalizeSelection(selection);
    els.tableBody.querySelectorAll(".inven-notify-table__cell").forEach(function (td) {
      var r = parseInt(td.getAttribute("data-r"), 10);
      var c = parseInt(td.getAttribute("data-c"), 10);
      if (isNaN(r) || isNaN(c)) return;
      if (r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1) {
        td.classList.add("is-selected");
      }
    });
  }

  function getSelectionOrCell() {
    if (selection) return normalizeSelection(selection);
    return null;
  }

  function getSelectionSide(sel) {
    if (!sel) return null;
    return sel.c0 < 5 ? "main" : "annex";
  }

  function isSideEmpty(row, side) {
    if (!row || !row[side]) return true;
    return TABLE_KEYS.every(function (key) {
      return !(row[side][key] != null && String(row[side][key]).trim());
    });
  }

  function isRowFullyEmpty(row) {
    return isSideEmpty(row, "main") && isSideEmpty(row, "annex");
  }

  function trimTrailingEmptyRows() {
    var rows = state.table.rows;
    while (rows.length && isRowFullyEmpty(rows[rows.length - 1])) {
      rows.pop();
    }
    if (!rows.length) return;
    var last = rows.length - 1;
    while (last >= 0 && isRowFullyEmpty(rows[last])) {
      rows.pop();
      last -= 1;
    }
  }

  function shiftSideMergesAfterDelete(side, r0, count) {
    var c0 = side === "main" ? 0 : 5;
    var c1 = c0 + 4;
    var r1 = r0 + count - 1;
    state.table.merges = (state.table.merges || []).filter(function (m) {
      var inSide = m.c >= c0 && m.c <= c1;
      if (!inSide) return true;
      if (m.r + m.rowspan <= r0) return true;
      if (m.r > r1) return true;
      return false;
    });
    (state.table.merges || []).forEach(function (m) {
      var inSide = m.c >= c0 && m.c <= c1;
      if (!inSide) return;
      if (m.r > r1) m.r -= count;
    });
  }

  function copySideData(src, dst, side) {
    if (!dst[side]) dst[side] = emptyTableSide();
    if (!src || !src[side]) {
      TABLE_KEYS.forEach(function (k) {
        dst[side][k] = "";
      });
      return;
    }
    TABLE_KEYS.forEach(function (k) {
      dst[side][k] = src[side][k] != null ? String(src[side][k]) : "";
    });
  }

  function insertRow(at, side) {
    side = side || "main";
    pushUndoSnapshot();
    var rows = state.table.rows;
    if (!rows.length) rows.push(normalizeTableRow({}));
    at = Math.max(0, Math.min(at, rows.length));
    if (at >= rows.length) {
      var newRow = normalizeTableRow({});
      newRow[side] = emptyTableSide();
      rows.push(newRow);
    } else {
      rows.push(normalizeTableRow({}));
      for (var r = rows.length - 1; r > at; r--) {
        if (!rows[r]) rows[r] = normalizeTableRow({});
        if (!rows[r - 1]) rows[r - 1] = normalizeTableRow({});
        copySideData(rows[r - 1], rows[r], side);
      }
      if (!rows[at]) rows[at] = normalizeTableRow({});
      rows[at][side] = emptyTableSide();
    }
    (state.table.merges || []).forEach(function (m) {
      var inSide = side === "main" ? m.c < 5 : m.c >= 5;
      if (inSide && m.r >= at) m.r += 1;
    });
    markDraftDirty();
    renderTable();
  }

  function deleteSelectedRows() {
    var sel = getSelectionOrCell();
    if (!sel) {
      alert("삭제할 행의 셀을 선택하세요.");
      return;
    }
    pushUndoSnapshot();
    var side = getSelectionSide(sel);
    var r0 = sel.r0;
    var r1 = sel.r1;
    var count = r1 - r0 + 1;
    var rows = state.table.rows;
    if (!rows.length) return;

    for (var r = r0; r < rows.length - count; r++) {
      if (!rows[r]) rows[r] = normalizeTableRow({});
      var src = rows[r + count] || normalizeTableRow({});
      copySideData(src, rows[r], side);
    }
    for (var r2 = Math.max(0, rows.length - count); r2 < rows.length; r2++) {
      if (!rows[r2]) rows[r2] = normalizeTableRow({});
      rows[r2][side] = emptyTableSide();
    }

    shiftSideMergesAfterDelete(side, r0, count);
    trimTrailingEmptyRows();
    clearSelection();
    markDraftDirty();
    renderTable();
  }

  function reorderSideRowsByDrag(side, fromRow, toRow) {
    if (fromRow === toRow || isNaN(fromRow) || isNaN(toRow)) return;
    pushUndoSnapshot();
    var rows = state.table.rows;
    if (!rows[fromRow]) return;
    if (!rows[toRow]) rows[toRow] = normalizeTableRow({});
    var sideCopy = JSON.parse(JSON.stringify(rows[fromRow][side] || emptyTableSide()));
    if (fromRow < toRow) {
      for (var r = fromRow; r < toRow; r++) {
        if (!rows[r]) rows[r] = normalizeTableRow({});
        if (!rows[r + 1]) rows[r + 1] = normalizeTableRow({});
        copySideData(rows[r + 1], rows[r], side);
      }
      rows[toRow][side] = sideCopy;
    } else {
      for (var r2 = fromRow; r2 > toRow; r2--) {
        if (!rows[r2]) rows[r2] = normalizeTableRow({});
        if (!rows[r2 - 1]) rows[r2 - 1] = normalizeTableRow({});
        copySideData(rows[r2 - 1], rows[r2], side);
      }
      rows[toRow][side] = sideCopy;
    }
    markDraftDirty();
    renderTable();
  }

  function sortByColumn(col) {
    if (sortState.col === col) {
      if (sortState.dir === "asc") sortState.dir = "desc";
      else if (sortState.dir === "desc") {
        sortState.col = null;
        sortState.dir = null;
      } else sortState.dir = "asc";
    } else {
      sortState.col = col;
      sortState.dir = "asc";
    }
    if (sortState.col == null) {
      renderTable();
      return;
    }
    if (isFrontModeActive()) pushUndoSnapshot();
    var sk = sideKeyFromFlat(sortState.col);
    var dir = sortState.dir === "asc" ? 1 : -1;
    state.table.rows.sort(function (a, b) {
      var av = (a[sk.side] && a[sk.side][sk.key]) != null ? String(a[sk.side][sk.key]) : "";
      var bv = (b[sk.side] && b[sk.side][sk.key]) != null ? String(b[sk.side][sk.key]) : "";
      var cmp = av.localeCompare(bv, "ko", { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return cmp * dir;
      return 0;
    });
    if (isFrontModeActive()) markDraftDirty();
    renderTable();
  }

  function updateSortHeaderMarks() {
    if (!els.tableWrap) return;
    els.tableWrap.querySelectorAll(".inven-notify-table__th").forEach(function (th) {
      var col = parseInt(th.getAttribute("data-col"), 10);
      if (sortState.col === col && sortState.dir) {
        th.setAttribute("data-sort", sortState.dir);
        th.classList.add("is-sorted");
      } else {
        th.removeAttribute("data-sort");
        th.classList.remove("is-sorted");
      }
    });
  }

  function clearSelectedCells() {
    var sel = getSelectionOrCell();
    if (!sel) {
      alert("지울 셀을 선택하세요.");
      return;
    }
    pushUndoSnapshot();
    for (var r = sel.r0; r <= sel.r1; r++) {
      for (var c = sel.c0; c <= sel.c1; c++) {
        setCellValue(r, c, "");
      }
    }
    markDraftDirty();
    renderTable();
  }

  function mergeSelectedCells() {
    var sel = getSelectionOrCell();
    if (!sel) {
      alert("병합할 셀 범위를 선택하세요. (드래그 또는 Shift+클릭)");
      return;
    }
    if (sel.r0 === sel.r1 && sel.c0 === sel.c1) {
      alert("두 개 이상의 셀을 선택하세요.");
      return;
    }
    pushUndoSnapshot();
    var parts = [];
    for (var r = sel.r0; r <= sel.r1; r++) {
      for (var c = sel.c0; c <= sel.c1; c++) {
        var hit = findMergeAt(r, c);
        if (hit) {
          alert("이미 병합된 셀이 포함되어 있습니다. 먼저 병합 해제하세요.");
          return;
        }
        var v = getCellValue(r, c).trim();
        if (v) parts.push(v);
      }
    }
    var mergedText = parts.join(" ");
    for (var r2 = sel.r0; r2 <= sel.r1; r2++) {
      for (var c2 = sel.c0; c2 <= sel.c1; c2++) {
        setCellValue(r2, c2, "");
      }
    }
    setCellValue(sel.r0, sel.c0, mergedText);
    if (!state.table.merges) state.table.merges = [];
    state.table.merges.push({
      r: sel.r0,
      c: sel.c0,
      rowspan: sel.r1 - sel.r0 + 1,
      colspan: sel.c1 - sel.c0 + 1,
    });
    clearSelection();
    markDraftDirty();
    renderTable();
  }

  function unmergeSelectedCells() {
    var sel = getSelectionOrCell();
    if (!sel) {
      alert("병합 해제할 셀을 선택하세요.");
      return;
    }
    var hit = findMergeAt(sel.r0, sel.c0);
    if (!hit) {
      alert("선택한 셀에 병합이 없습니다.");
      return;
    }
    pushUndoSnapshot();
    state.table.merges.splice(hit.index, 1);
    markDraftDirty();
    renderTable();
  }

  function insertCol(at) {
    if (at <= 0 || at >= COL_COUNT) {
      alert("열 삽입은 본관·별관 블록 안에서만 가능합니다.");
      return;
    }
    if (at === 5) {
      alert("본관과 별관 사이에는 열을 삽입할 수 없습니다.");
      return;
    }
    pushUndoSnapshot();
    var sideIdx = at < 5 ? 0 : 1;
    var keyIdx = at % 5;
    var side = SIDES[sideIdx];
    var key = TABLE_KEYS[keyIdx];
    state.table.rows.forEach(function (row) {
      if (!row[side]) row[side] = emptyTableSide();
      for (var k = TABLE_KEYS.length - 1; k > keyIdx; k--) {
        row[side][TABLE_KEYS[k]] = row[side][TABLE_KEYS[k - 1]] || "";
      }
      row[side][key] = "";
    });
    (state.table.merges || []).forEach(function (m) {
      if (m.c >= at && m.c < 5 * (sideIdx + 1)) {
        if (m.c + m.colspan > 5 * (sideIdx + 1)) m.colspan = Math.max(1, 5 * (sideIdx + 1) - m.c);
      }
    });
    markDraftDirty();
    renderTable();
  }

  function deleteSelectedCol() {
    var sel = getSelectionOrCell();
    if (!sel || sel.c0 !== sel.c1) {
      alert("삭제할 열의 셀 하나를 선택하세요.");
      return;
    }
    var at = sel.c0;
    if (at === 0 || at === 5) {
      alert("순번 열은 삭제할 수 없습니다.");
      return;
    }
    pushUndoSnapshot();
    var sk = sideKeyFromFlat(at);
    var sideIdx = at < 5 ? 0 : 1;
    var ki = TABLE_KEYS.indexOf(sk.key);
    state.table.rows.forEach(function (row) {
      if (!row[sk.side]) return;
      for (var k = ki; k < TABLE_KEYS.length - 1; k++) {
        row[sk.side][TABLE_KEYS[k]] = row[sk.side][TABLE_KEYS[k + 1]] || "";
      }
      row[sk.side][TABLE_KEYS[TABLE_KEYS.length - 1]] = "";
    });
    state.table.merges = (state.table.merges || []).filter(function (m) {
      var blockStart = sideIdx * 5;
      var blockEnd = blockStart + 5;
      if (m.c >= blockStart && m.c < blockEnd) return false;
      return true;
    });
    clearSelection();
    markDraftDirty();
    renderTable();
  }

  function syncTableFromDom() {
    if (!els.tableBody) return;
    els.tableBody.querySelectorAll(".inven-notify-table__cell").forEach(function (td) {
      var r = parseInt(td.getAttribute("data-r"), 10);
      var c = parseInt(td.getAttribute("data-c"), 10);
      if (isNaN(r) || isNaN(c)) return;
      var editEl = td.querySelector(".inven-notify-cell-edit");
      var text = editEl ? editEl.textContent : td.textContent;
      setCellValue(r, c, text || "");
    });
  }

  function renderTable() {
    if (!els.tableWrap || !els.tableBody) return;
    var rows = state.table.rows || [];
    var editable = isFrontModeActive();
    var mergeMap = buildMergeMap(state.table.merges);

    if (!rows.length) {
      els.tableWrap.hidden = true;
      els.tableBody.innerHTML = "";
      if (els.empty) els.empty.hidden = false;
      return;
    }
    els.tableWrap.hidden = false;
    if (els.empty) els.empty.hidden = true;

    var colgroupHtml = "";
    (state.table.colWidths || DEFAULT_COL_WIDTHS).forEach(function (w) {
      colgroupHtml += '<col style="width:' + Math.max(32, w) + 'px">';
    });

    var html = "";
    rows.forEach(function (row, rowIdx) {
      html += '<tr data-row-idx="' + rowIdx + '">';
      for (var c = 0; c < COL_COUNT; c++) {
        var mk = mergeMap[cellCoordKey(rowIdx, c)];
        if (mk && mk.skip) continue;
        var val = getCellValue(rowIdx, c);
        var attrs =
          ' class="inven-notify-table__cell"' +
          ' data-r="' + rowIdx + '"' +
          ' data-c="' + c + '"';
        if (mk && mk.merge) {
          if (mk.merge.rowspan > 1) attrs += ' rowspan="' + mk.merge.rowspan + '"';
          if (mk.merge.colspan > 1) attrs += ' colspan="' + mk.merge.colspan + '"';
        }
        if (editable) {
          if (c === 0 || c === 5) {
            var sideAttr = c < 5 ? "main" : "annex";
            html +=
              "<td" +
              attrs +
              '><span class="inven-notify-row-grip" draggable="true" data-r="' +
              rowIdx +
              '" data-side="' +
              sideAttr +
              '" title="드래그하여 ' +
              (sideAttr === "main" ? "본관동" : "별관동") +
              ' 행 이동">⠿</span><span class="inven-notify-cell-edit" contenteditable="true" spellcheck="false">' +
              escapeHtml(val) +
              "</span></td>";
          } else {
            html +=
              "<td" +
              attrs +
              ' contenteditable="true" spellcheck="false">' +
              escapeHtml(val) +
              "</td>";
          }
        } else {
          html += "<td" + attrs + ">" + escapeHtml(val) + "</td>";
        }
      }
      html += "</tr>";
    });
    els.tableBody.innerHTML = html;

    var tableEl = els.tableWrap.querySelector("table");
    if (tableEl) {
      var cg = tableEl.querySelector("colgroup");
      if (!cg) {
        cg = document.createElement("colgroup");
        tableEl.insertBefore(cg, tableEl.firstChild);
      }
      cg.innerHTML = colgroupHtml;

      var headRow = tableEl.querySelector("thead tr:nth-child(2)");
      if (headRow) {
        headRow.innerHTML = "";
        for (var h = 0; h < COL_COUNT; h++) {
          var th = document.createElement("th");
          th.className = "inven-notify-table__th inven-notify-table__th--sortable";
          th.setAttribute("data-col", String(h));
          th.title = "클릭: 정렬 (오름차순 → 내림차순 → 해제)";
          var labelSpan = document.createElement("span");
          labelSpan.className = "inven-notify-table__th-label";
          labelSpan.textContent = COL_LABELS[h % 5];
          th.appendChild(labelSpan);
          if (sortState.col === h && sortState.dir) {
            th.setAttribute("data-sort", sortState.dir);
            th.classList.add("is-sorted");
          }
          if (editable) {
            var grip = document.createElement("span");
            grip.className = "inven-notify-col-resize";
            grip.setAttribute("data-col", String(h));
            grip.title = "열 너비 조절";
            th.appendChild(grip);
          }
          headRow.appendChild(th);
        }
      }
    }

    bindTableInteractions();
    highlightSelection();
    updateSortHeaderMarks();
  }

  function bindHeaderSort() {
    if (!els.tableWrap) return;
    els.tableWrap.querySelectorAll(".inven-notify-table__th--sortable").forEach(function (th) {
      if (th.getAttribute("data-sort-bound") === "1") return;
      th.setAttribute("data-sort-bound", "1");
      th.addEventListener("click", function (e) {
        if (e.target.classList.contains("inven-notify-col-resize")) return;
        var col = parseInt(th.getAttribute("data-col"), 10);
        if (isNaN(col)) return;
        sortByColumn(col);
      });
    });
  }

  function bindCellDragSelect() {
    if (!els.tableWrap || els.tableWrap.getAttribute("data-select-bound") === "1") return;
    els.tableWrap.setAttribute("data-select-bound", "1");

    els.tableWrap.addEventListener("mousedown", function (e) {
      if (!isFrontModeActive() || e.button !== 0) return;
      if (e.target.classList.contains("inven-notify-row-grip")) return;
      if (e.target.classList.contains("inven-notify-col-resize")) return;
      var hit = cellFromEventTarget(e.target);
      if (!hit) return;

      if (e.shiftKey && selection) {
        e.preventDefault();
        setSelection(hit.r, hit.c, true);
        return;
      }

      e.preventDefault();
      cellSelectDrag.active = true;
      cellSelectDrag.moved = false;
      cellSelectDrag.anchorR = hit.r;
      cellSelectDrag.anchorC = hit.c;
      setSelectionRange(hit.r, hit.c, hit.r, hit.c);
      if (els.tableWrap) els.tableWrap.classList.add("is-cell-selecting");
    });

    document.addEventListener("mousemove", function (e) {
      if (!cellSelectDrag.active) return;
      var hit = cellFromEventTarget(document.elementFromPoint(e.clientX, e.clientY));
      if (!hit) return;
      cellSelectDrag.moved = true;
      setSelectionRange(cellSelectDrag.anchorR, cellSelectDrag.anchorC, hit.r, hit.c);
    });

    document.addEventListener("mouseup", function () {
      if (!cellSelectDrag.active) return;
      cellSelectDrag.active = false;
      if (els.tableWrap) els.tableWrap.classList.remove("is-cell-selecting");
      if (!cellSelectDrag.moved && selection) {
        var sel = normalizeSelection(selection);
        var td = els.tableBody.querySelector(
          '.inven-notify-table__cell[data-r="' + sel.r0 + '"][data-c="' + sel.c0 + '"]'
        );
        focusCellEditor(td);
      }
    });
  }

  function bindRowDrag() {
    if (!els.tableBody || !isFrontModeActive()) return;
    var dragFrom = null;

    els.tableBody.querySelectorAll(".inven-notify-row-grip").forEach(function (grip) {
      if (grip.getAttribute("data-drag-bound") === "1") return;
      grip.setAttribute("data-drag-bound", "1");

      grip.addEventListener("dragstart", function (e) {
        rowDragActive = true;
        dragFrom = {
          r: parseInt(grip.getAttribute("data-r"), 10),
          side: grip.getAttribute("data-side"),
        };
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragFrom.r + ":" + dragFrom.side);
        var tr = grip.closest("tr");
        if (tr) tr.classList.add("is-dragging");
      });

      grip.addEventListener("dragend", function () {
        rowDragActive = false;
        dragFrom = null;
        els.tableBody.querySelectorAll("tr").forEach(function (tr) {
          tr.classList.remove("is-dragging", "is-drop-target");
        });
      });
    });

    els.tableBody.querySelectorAll("tr").forEach(function (tr) {
      if (tr.getAttribute("data-drop-bound") === "1") return;
      tr.setAttribute("data-drop-bound", "1");

      tr.addEventListener("dragover", function (e) {
        if (!rowDragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        tr.classList.add("is-drop-target");
      });

      tr.addEventListener("dragleave", function () {
        tr.classList.remove("is-drop-target");
      });

      tr.addEventListener("drop", function (e) {
        e.preventDefault();
        tr.classList.remove("is-drop-target");
        if (!dragFrom) return;
        var toRow = parseInt(tr.getAttribute("data-row-idx"), 10);
        if (isNaN(toRow) || isNaN(dragFrom.r)) return;
        syncTableFromDom();
        reorderSideRowsByDrag(dragFrom.side, dragFrom.r, toRow);
        dragFrom = null;
        rowDragActive = false;
      });
    });
  }

  function bindTableInteractions() {
    bindHeaderSort();

    if (!els.tableBody) return;

    if (isFrontModeActive()) {
      els.tableBody.querySelectorAll(".inven-notify-table__cell").forEach(function (td) {
        if (td.getAttribute("data-bound") === "1") return;
        td.setAttribute("data-bound", "1");

        var editTargets = td.querySelectorAll(".inven-notify-cell-edit, [contenteditable='true']");
        if (!editTargets.length && td.getAttribute("contenteditable") === "true") {
          editTargets = [td];
        }
        editTargets.forEach(function (editEl) {
          editEl.addEventListener("input", function () {
            var r = parseInt(td.getAttribute("data-r"), 10);
            var c = parseInt(td.getAttribute("data-c"), 10);
            if (isNaN(r) || isNaN(c)) return;
            var editKey = r + ":" + c;
            if (cellEditUndoKey !== editKey) {
              pushUndoSnapshot();
              cellEditUndoKey = editKey;
            }
            setCellValue(r, c, editEl.textContent || "");
            markDraftDirty();
          });
        });
      });

      bindRowDrag();
    }

    if (els.tableWrap && isFrontModeActive()) {
      els.tableWrap.querySelectorAll(".inven-notify-col-resize").forEach(function (handle) {
        if (handle.getAttribute("data-bound") === "1") return;
        handle.setAttribute("data-bound", "1");
        handle.addEventListener("mousedown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var col = parseInt(handle.getAttribute("data-col"), 10);
          if (isNaN(col)) return;
          pushUndoSnapshot();
          colResizeActive = true;
          var startX = e.clientX;
          var startW = state.table.colWidths[col] || 72;

          function onMove(ev) {
            var nw = Math.max(32, startW + (ev.clientX - startX));
            state.table.colWidths[col] = nw;
            var colEls = els.tableWrap.querySelectorAll("colgroup col");
            if (colEls[col]) colEls[col].style.width = nw + "px";
          }

          function onUp() {
            colResizeActive = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            markDraftDirty();
          }

          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
      });
    }
  }

  function updateEmpty() {
    var hasTable = state.table && state.table.rows && state.table.rows.length > 0;
    if (els.empty) els.empty.hidden = hasTable;
    if (els.tableWrap) els.tableWrap.hidden = !hasTable;
  }

  function updateToolbar() {
    if (!els.toolbar) return;
    var editable = isFrontModeActive();
    els.toolbar.hidden = !editable;
    updateSaveButton();
    updateToolbarHint();
  }

  function updateSaveButton() {
    if (!els.btnSave) return;
    var editable = isFrontModeActive();
    var showingDone = els.btnSave.classList.contains("is-done");
    if (!showingDone) {
      els.btnSave.textContent = draftDirty ? "저장 (미공유)" : "저장";
    }
    els.btnSave.disabled = !editable;
    els.btnSave.classList.toggle("inven-notify-btn-save--dirty", draftDirty && !showingDone);
  }

  function updateToolbarHint() {
    if (!els.toolbarHint) return;
    if (!isFrontModeActive()) {
      els.toolbarHint.textContent = "";
      return;
    }
    els.toolbarHint.textContent = draftDirty
      ? "변경 내용은 저장 버튼을 눌러야 다른 화면에 공유됩니다"
      : "Ctrl+Z 되돌리기 · 셀 드래그 범위 선택 · ⠿ 행 이동 · 헤더 클릭 정렬";
  }

  function updateHint() {
    if (!els.hint) return;
    els.hint.textContent = isFrontModeActive()
      ? "인벤「만들기」표는 초안으로 들어옵니다. 편집 후 「저장」을 눌러 공유하세요."
      : "저장된 인벤 통보 표를 조회합니다. 수정은 프론트 모드에서 가능합니다.";
  }

  function makeToolbarButton(text, title, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-order inven-notify-tool-btn";
    btn.textContent = text;
    if (title) btn.title = title;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function ensureUi() {
    var mount = document.getElementById("invenNotifyMount");
    if (!mount) return false;
    if (uiReady && els.mount === mount) return true;

    mount.innerHTML = "";

    var empty = document.createElement("p");
    empty.className = "inven-notify-empty";
    empty.id = "invenNotifyEmpty";
    empty.textContent = "인벤에서 「만들기」를 실행하거나, 프론트 모드에서 표를 편집·저장하세요.";

    var tableWrap = document.createElement("div");
    tableWrap.className = "inven-notify-table-wrap";
    tableWrap.id = "invenNotifyTableWrap";
    tableWrap.hidden = true;

    var table = document.createElement("table");
    table.className = "inven-notify-table";
    table.innerHTML =
      '<thead id="invenNotifyTableHead">' +
      '<tr><th class="inven-notify-table__section" colspan="5">본관동</th>' +
      '<th class="inven-notify-table__section" colspan="5">별관동</th></tr>' +
      '<tr></tr></thead><tbody id="invenNotifyTableBody"></tbody>';
    tableWrap.appendChild(table);

    var toolbar = document.createElement("div");
    toolbar.className = "inven-notify-toolbar";
    toolbar.id = "invenNotifyToolbar";
    toolbar.hidden = true;

    var toolGroup = document.createElement("div");
    toolGroup.className = "inven-notify-toolbar__tools";

    toolGroup.appendChild(
      makeToolbarButton("행 위 삽입", "선택 영역(본관/별관) 위에 빈 행 삽입", function () {
        syncTableFromDom();
        var sel = getSelectionOrCell();
        var side = sel ? getSelectionSide(sel) : "main";
        insertRow(sel ? sel.r0 : 0, side);
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("행 아래 삽입", "선택 영역(본관/별관) 아래에 빈 행 삽입", function () {
        syncTableFromDom();
        var sel = getSelectionOrCell();
        var side = sel ? getSelectionSide(sel) : "main";
        insertRow(sel ? sel.r1 + 1 : state.table.rows.length, side);
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("행 삭제", "선택 영역 행 삭제 (본관/별관 구분)", function () {
        syncTableFromDom();
        deleteSelectedRows();
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("열 삽입", "선택 열 왼쪽에 빈 열 삽입", function () {
        syncTableFromDom();
        var sel = getSelectionOrCell();
        if (!sel) {
          alert("열을 삽입할 위치의 셀을 선택하세요.");
          return;
        }
        insertCol(sel.c0);
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("열 삭제", "선택한 열 삭제(순번 제외)", function () {
        syncTableFromDom();
        deleteSelectedCol();
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("셀 지우기", "선택 셀 내용 삭제", function () {
        syncTableFromDom();
        clearSelectedCells();
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("병합", "선택 범위 셀 병합", function () {
        syncTableFromDom();
        mergeSelectedCells();
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("병합 해제", "선택 셀 병합 해제", function () {
        syncTableFromDom();
        unmergeSelectedCells();
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("되돌리기", "Ctrl+Z — 직전 작업 취소", function () {
        syncTableFromDom();
        undoTable();
      })
    );
    toolGroup.appendChild(
      makeToolbarButton("초기화", "마지막 저장본(없으면 빈 표)으로 되돌리기", function () {
        resetInvenTable();
      })
    );

    var toolbarHint = document.createElement("span");
    toolbarHint.className = "inven-notify-toolbar__hint";

    var btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "btn-order inven-notify-btn-save";
    btnSave.id = "btnInvenNotifySave";
    btnSave.textContent = "저장";
    btnSave.addEventListener("click", function () {
      syncTableFromDom();
      publishInvenNotify();
    });

    toolbar.appendChild(toolGroup);
    toolbar.appendChild(toolbarHint);
    toolbar.appendChild(btnSave);

    mount.appendChild(empty);
    mount.appendChild(toolbar);
    mount.appendChild(tableWrap);

    els.mount = mount;
    els.empty = empty;
    els.toolbar = toolbar;
    els.tableWrap = tableWrap;
    els.tableBody = document.getElementById("invenNotifyTableBody");
    els.tableHead = document.getElementById("invenNotifyTableHead");
    els.btnSave = btnSave;
    els.toolbarHint = toolbarHint;
    els.hint = document.getElementById("invenNotifyHint");

    bindCellDragSelect();
    bindUndoKeyboard();
    uiReady = true;
    return true;
  }

  function isUserEditingInvenNotify() {
    return draftDirty || colResizeActive || rowDragActive || cellSelectDrag.active;
  }

  function hasContent(data) {
    var n = normalizeInvenNotify(data);
    return n.table.rows.length > 0;
  }

  function importInvenTable(rows, meta) {
    if (!Array.isArray(rows)) return;
    var normalized = [];
    rows.forEach(function (row) {
      normalized.push(normalizeTableRow(row));
    });
    if (!isFrontModeActive()) {
      var localDraft = loadDraftLocal() || cloneState(loadInvenNotify());
      localDraft.table.rows = normalized;
      localDraft.table.updatedAt =
        meta && meta.updatedAt ? String(meta.updatedAt) : new Date().toISOString();
      try {
        sessionStorage.setItem(
          DRAFT_LS,
          JSON.stringify({ dirty: true, state: localDraft })
        );
      } catch (e) {}
      return;
    }
    if (!draftDirty) {
      state = cloneState(loadInvenNotify());
    }
    pushUndoSnapshot();
    state.table.rows = normalized;
    state.table.updatedAt =
      meta && meta.updatedAt ? String(meta.updatedAt) : new Date().toISOString();
    markDraftDirty();
    renderTable();
    updateEmpty();
    updateToolbar();
  }

  function exportCloseDayRows(invenNotify) {
    var n = normalizeInvenNotify(invenNotify);
    var rows = n.table.rows || [];
    if (!rows.length) return [];
    return rows.map(function (row, i) {
      var m = row.main || emptyTableSide();
      var a = row.annex || emptyTableSide();
      return [
        m.seq || String(i + 1),
        m.room || "",
        m.confirmationNo || "",
        m.itemCode1 || "",
        m.trace || "",
        a.seq || String(i + 1),
        a.room || "",
        a.confirmationNo || "",
        a.itemCode1 || "",
        a.trace || "",
      ];
    });
  }

  function exportFlatRows(invenNotify) {
    var n = normalizeInvenNotify(invenNotify);
    return n.table.rows.map(function (row, i) {
      var m = row.main || emptyTableSide();
      var a = row.annex || emptyTableSide();
      return [
        String(i + 1),
        m.room || "",
        m.itemCode1 || "",
        a.room || "",
        a.itemCode1 || "",
      ];
    });
  }

  function renderInvenNotifyPanel(force) {
    var panel = document.getElementById("invenNotifyPanel");
    if (!panel || panel.hidden) return;
    if (!ensureUi()) return;

    var editable = isFrontModeActive();
    if (!force && skipNextRemoteRender) {
      skipNextRemoteRender = false;
      if (editable === lastRenderEditable && isUserEditingInvenNotify()) return;
    }
    if (!force && colResizeActive) return;
    if (!force && editable && draftDirty) {
      /* keep local draft */
    } else if (editable) {
      var pending = loadDraftLocal();
      if (pending && pending.table.rows.length) {
        state = pending;
        draftDirty = true;
      } else {
        state = cloneState(loadInvenNotify());
        draftDirty = false;
      }
    } else {
      state = cloneState(loadInvenNotify());
      draftDirty = false;
      sortState = { col: null, dir: null };
      undoStack = [];
      cellEditUndoKey = null;
      clearSelection();
    }

    lastRenderEditable = editable;
    updateHint();
    updateToolbar();

    if (els.tableWrap) {
      els.tableWrap.classList.toggle("inven-notify-table-wrap--readonly", !editable);
      els.tableWrap.classList.toggle("inven-notify-table-wrap--draft", editable && draftDirty);
    }

    renderTable();
    updateEmpty();
  }

  function initInvenNotify(hooks) {
    uiHooks = hooks || {};
    ensureUi();
    renderInvenNotifyPanel(true);
  }

  function onFrontModeChanged() {
    if (isFrontModeActive()) {
      var pending = loadDraftLocal();
      if (pending && pending.table.rows.length) {
        state = pending;
        draftDirty = true;
      }
    } else {
      if (!draftDirty) {
        state = cloneState(loadInvenNotify());
      }
      clearSelection();
    }
    renderInvenNotifyPanel(true);
  }

  global.HKInvenNotify = {
    defaultInvenNotify: defaultInvenNotify,
    normalizeInvenNotify: normalizeInvenNotify,
    load: loadInvenNotify,
    save: saveInvenNotify,
    publish: publishInvenNotify,
    render: renderInvenNotifyPanel,
    init: initInvenNotify,
    onFrontModeChanged: onFrontModeChanged,
    isFrontModeActive: isFrontModeActive,
    hasContent: hasContent,
    exportFlatRows: exportFlatRows,
    exportCloseDayRows: exportCloseDayRows,
    importInvenTable: importInvenTable,
    resetOnCloseDay: resetOnCloseDay,
    getPublishedSignature: getPublishedSignature,
    isDraftDirty: function () {
      return draftDirty;
    },
  };
})(typeof window !== "undefined" ? window : this);
