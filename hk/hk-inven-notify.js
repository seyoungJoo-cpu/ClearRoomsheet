/**
 * 인벤 통보 — 객실 오더 카드 (본관/별관)
 * 인벤「만들기」행을 객실+예약번호로 묶어 카드로 표시.
 * 정비오더 모드에서 「투입완료」가능. 인벤 변경 오더는 객실→객실 카드로 함께 표시.
 */
(function (global) {
  var DRAFT_LS = "hk-inven-notify-draft-v6";
  var LEGACY_DRAFT_LS = "hk-inven-notify-draft-v5";
  var VIEW_KEY = "hk-inven-notify-view-v1";
  var skipNextRemoteRender = false;
  var lastPublished = null;
  var uiReady = false;
  var draftDirty = false;
  var publishFeedbackTimer = null;
  var uiHooks = {};
  var state = defaultInvenNotify();
  var viewMode = "1";

  var cardSearchQuery = "";
  var els = {
    mount: null,
    toolbar: null,
    boards: null,
    sheet: null,
    sheetMain: null,
    sheetAnnex: null,
    sheetEmpty: null,
    empty: null,
    btnSave: null,
    btnView1: null,
    btnView2: null,
    btnExcel: null,
    toolbarHint: null,
    hint: null,
    searchInput: null,
  };

  function defaultInvenNotify() {
    return {
      version: 6,
      table: {
        updatedAt: "",
        colWidths: [],
        merges: [],
        rows: [],
      },
      cards: [],
      changeDone: {},
    };
  }

  function emptySide() {
    return { seq: "", room: "", confirmationNo: "", itemCode1: "", trace: "" };
  }

  function normalizeSide(raw) {
    var side = emptySide();
    if (!raw || typeof raw !== "object") return side;
    ["seq", "room", "confirmationNo", "itemCode1", "trace"].forEach(function (key) {
      side[key] = raw[key] != null ? String(raw[key]) : "";
    });
    return side;
  }

  function normalizeTableRow(raw) {
    return {
      main: normalizeSide(raw && raw.main),
      annex: normalizeSide(raw && raw.annex),
    };
  }

  function cardKey(wing, room, confirmationNo) {
    return (
      String(wing || "") +
      "|" +
      String(room || "").trim() +
      "|" +
      String(confirmationNo || "").trim()
    );
  }

  function roomSortKey(room) {
    var d = String(room || "").replace(/\D/g, "");
    if (!d) return String(room || "");
    return ("000000" + d).slice(-6);
  }

  function normalizeRoomPath(raw, room, roomFrom) {
    var path = [];
    var seen = {};
    function pushRoom(v) {
      var s = v != null ? String(v).trim() : "";
      if (!s) return;
      var key = formatRoomDisplay(s) || s;
      if (seen[key]) return;
      seen[key] = true;
      path.push(s);
    }
    if (Array.isArray(raw)) {
      raw.forEach(pushRoom);
    }
    if (!path.length && roomFrom) pushRoom(roomFrom);
    pushRoom(room);
    return path;
  }

  function normalizeCard(raw) {
    if (!raw || typeof raw !== "object") return null;
    var wing = raw.wing === "annex" ? "annex" : "main";
    var room = raw.room != null ? String(raw.room).trim() : "";
    if (!room) return null;
    var confirmationNo =
      raw.confirmationNo != null ? String(raw.confirmationNo).trim() : "";
    var roomFrom =
      raw.roomFrom != null && String(raw.roomFrom).trim()
        ? String(raw.roomFrom).trim()
        : "";
    var roomPath = normalizeRoomPath(raw.roomPath, room, roomFrom);
    if (roomPath.length) room = roomPath[roomPath.length - 1];
    if (roomPath.length >= 2) roomFrom = roomPath[0];
    else roomFrom = "";
    var id =
      raw.id != null && String(raw.id).trim()
        ? String(raw.id).trim()
        : "ic-" + cardKey(wing, room, confirmationNo);
    return {
      id: id,
      wing: wing,
      room: room,
      roomFrom: roomFrom,
      roomPath: roomPath,
      confirmationNo: confirmationNo,
      itemsText: raw.itemsText != null ? String(raw.itemsText).trim() : "",
      memo: raw.memo != null ? String(raw.memo).trim() : "",
      trace: raw.trace != null ? String(raw.trace).trim() : "",
      done: !!raw.done,
      doneAt: raw.doneAt != null ? String(raw.doneAt) : "",
      doneBy: raw.doneBy != null ? String(raw.doneBy) : "",
    };
  }

  function parseItemFragments(itemCode1) {
    var s = String(itemCode1 || "").trim();
    if (!s) return [];
    return s
      .split(/[,，]/)
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
  }

  function joinItemsText(parts) {
    return parts.join(" ");
  }

  function buildCardsFromTableRows(rows, prevCards) {
    var prevMap = {};
    (prevCards || []).forEach(function (c) {
      if (!c) return;
      prevMap[cardKey(c.wing, c.room, c.confirmationNo)] = c;
    });
    var groups = {};
    function ingest(side, wing) {
      if (!side) return;
      var room = String(side.room || "").trim();
      if (!room) return;
      var conf = String(side.confirmationNo || "").trim();
      var key = cardKey(wing, room, conf);
      if (!groups[key]) {
        groups[key] = {
          wing: wing,
          room: room,
          confirmationNo: conf,
          items: [],
          traces: [],
        };
      }
      parseItemFragments(side.itemCode1).forEach(function (it) {
        groups[key].items.push(it);
      });
      var tr = String(side.trace || "").trim();
      if (tr && groups[key].traces.indexOf(tr) < 0) groups[key].traces.push(tr);
    }
    (rows || []).forEach(function (row) {
      var n = normalizeTableRow(row);
      ingest(n.main, "main");
      ingest(n.annex, "annex");
    });
    var out = Object.keys(groups).map(function (key) {
      var g = groups[key];
      var prev = prevMap[key];
      return normalizeCard({
        id: prev && prev.id ? prev.id : "ic-" + key,
        wing: g.wing,
        room: g.room,
        roomFrom: prev ? prev.roomFrom || "" : "",
        roomPath: prev ? prev.roomPath || null : null,
        confirmationNo: g.confirmationNo,
        itemsText: joinItemsText(g.items),
        memo: prev ? prev.memo || "" : "",
        trace: g.traces.join(" | "),
        done: prev ? !!prev.done : false,
        doneAt: prev ? prev.doneAt || "" : "",
        doneBy: prev ? prev.doneBy || "" : "",
      });
    });
    out.sort(function (a, b) {
      if (a.wing !== b.wing) return a.wing === "main" ? -1 : 1;
      var cmp = roomSortKey(a.room).localeCompare(roomSortKey(b.room), undefined, {
        numeric: true,
      });
      if (cmp !== 0) return cmp;
      return String(a.confirmationNo || "").localeCompare(
        String(b.confirmationNo || ""),
        undefined,
        { numeric: true }
      );
    });
    return out.filter(Boolean);
  }

  function normalizeChangeDone(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (!v) return;
      if (typeof v === "object") {
        out[k] = {
          at: v.at != null ? String(v.at) : "",
          by: v.by != null ? String(v.by) : "",
        };
      } else {
        out[k] = { at: new Date().toISOString(), by: "" };
      }
    });
    return out;
  }

  function normalizeInvenNotify(data) {
    var base = defaultInvenNotify();
    if (!data || typeof data !== "object") return base;
    var table = {
      updatedAt: "",
      colWidths: [],
      merges: [],
      rows: [],
    };
    if (data.table && typeof data.table === "object") {
      table.updatedAt =
        data.table.updatedAt != null ? String(data.table.updatedAt) : "";
      if (Array.isArray(data.table.rows)) {
        data.table.rows.forEach(function (row) {
          table.rows.push(normalizeTableRow(row));
        });
      }
    } else if (data.updatedAt) {
      table.updatedAt = String(data.updatedAt);
    }
    var cards = [];
    if (Array.isArray(data.cards) && data.cards.length) {
      data.cards.forEach(function (c) {
        var n = normalizeCard(c);
        if (n) cards.push(n);
      });
    } else if (table.rows.length) {
      cards = buildCardsFromTableRows(table.rows, []);
    }
    cards.sort(function (a, b) {
      if (a.wing !== b.wing) return a.wing === "main" ? -1 : 1;
      return roomSortKey(a.room).localeCompare(roomSortKey(b.room), undefined, {
        numeric: true,
      });
    });
    return {
      version: 6,
      table: table,
      cards: cards,
      changeDone: normalizeChangeDone(data.changeDone),
    };
  }

  function cloneState(src) {
    return JSON.parse(JSON.stringify(normalizeInvenNotify(src)));
  }

  function loadInvenNotify() {
    var storage = global.HKStorage ? global.HKStorage.load() : {};
    return normalizeInvenNotify(storage.invenNotify);
  }

  function saveInvenNotify(data, opts) {
    if (!global.HKStorage) return;
    opts = opts || {};
    var storage = global.HKStorage.load();
    var next = normalizeInvenNotify(data);
    storage.invenNotify = next;
    skipNextRemoteRender = true;
    global.HKStorage.save(storage, { skipSync: true });
    if (opts.pushNow) {
      lastPublished = cloneState(next);
      if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
        global.HKSync.pushStorageNow();
      }
    }
  }

  function nextUpdatedAt() {
    var now = Date.now();
    var knownAt = "";
    try {
      knownAt = loadInvenNotify().table.updatedAt || "";
    } catch (e) {}
    if (lastPublished && lastPublished.table.updatedAt > knownAt) {
      knownAt = lastPublished.table.updatedAt;
    }
    var knownMs = knownAt ? Date.parse(knownAt) : NaN;
    if (!isNaN(knownMs) && knownMs >= now) now = knownMs + 1000;
    return new Date(now).toISOString();
  }

  function reconcileWithPublished(stored) {
    if (!lastPublished) return stored;
    var storedAt = stored && stored.table ? stored.table.updatedAt || "" : "";
    var pubAt = lastPublished.table.updatedAt || "";
    if (!pubAt || storedAt >= pubAt) {
      lastPublished = null;
      return stored;
    }
    saveInvenNotify(lastPublished, { pushNow: true });
    return cloneState(lastPublished);
  }

  function loadPublishedState() {
    return reconcileWithPublished(cloneState(loadInvenNotify()));
  }

  function getPublishedSignature() {
    return JSON.stringify(normalizeInvenNotify(loadInvenNotify()));
  }

  function saveDraftLocal() {
    try {
      sessionStorage.setItem(DRAFT_LS, JSON.stringify({ dirty: true, state: state }));
    } catch (e) {}
  }

  function loadDraftLocal() {
    try {
      var raw = sessionStorage.getItem(DRAFT_LS);
      if (!raw) {
        raw = sessionStorage.getItem(LEGACY_DRAFT_LS);
      }
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
      sessionStorage.removeItem(LEGACY_DRAFT_LS);
    } catch (e) {}
  }

  function isFrontModeActive() {
    var btn = document.getElementById("btnFront");
    return !!(btn && btn.classList.contains("is-on"));
  }

  function isMaintenanceModeActive() {
    var btn = document.getElementById("btnMaint");
    return !!(btn && btn.classList.contains("is-on"));
  }

  function isInvenNotifyPanelActive() {
    var panel = document.getElementById("invenNotifyPanel");
    return !!(panel && !panel.hidden);
  }

  function getOperatorName() {
    if (uiHooks.getOperatorName) return uiHooks.getOperatorName() || "";
    try {
      return (sessionStorage.getItem("hk-operator-name") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function requireOperator(onSaved) {
    if (getOperatorName()) return true;
    if (uiHooks.showOperatorGate) {
      uiHooks.showOperatorGate({ mode: "initial", onSaved: onSaved });
      return false;
    }
    alert("이름을 입력하세요.");
    return false;
  }

  function formatRoomDisplay(room) {
    if (uiHooks.formatRoomNoDisplay) {
      return uiHooks.formatRoomNoDisplay(room) || String(room || "");
    }
    var d = String(room || "").replace(/\D/g, "");
    if (!d) return String(room || "");
    return d.replace(/^0+/, "") || "0";
  }

  function formatAt(iso) {
    if (uiHooks.formatAt) return uiHooks.formatAt(iso) || "";
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function escapeHtml(v) {
    return (v || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function markDraftDirty() {
    if (!isFrontModeActive()) return;
    draftDirty = true;
    saveDraftLocal();
    updateSaveButton();
    updateToolbarHint();
    if (els.boards) els.boards.classList.add("inven-notify-boards--draft");
    if (els.sheet) els.sheet.classList.add("inven-notify-sheet--draft");
  }

  function updateSaveButton() {
    if (!els.btnSave) return;
    els.btnSave.disabled = !isFrontModeActive();
    if (!els.btnSave.classList.contains("is-done")) {
      els.btnSave.textContent = draftDirty ? "저장 *" : "저장";
    }
  }

  function updateToolbarHint() {
    if (!els.toolbarHint) return;
    if (isFrontModeActive()) {
      els.toolbarHint.textContent = draftDirty
        ? "초안 편집 중 · 저장해야 다른 PC에 공유됩니다."
        : "저장됨 · 만들기/트레이스/삭제는 저장 후 동기화됩니다.";
    } else if (isMaintenanceModeActive()) {
      els.toolbarHint.textContent = "정비오더 모드 · 투입완료로 처리하세요.";
    } else {
      els.toolbarHint.textContent = "저장된 인벤 통보를 조회합니다.";
    }
  }

  function updateEmpty() {
    var hasCards = (state.cards || []).length > 0;
    var isSheet = viewMode === "2";
    if (els.empty) {
      // 2번 보기에서는 표가 빈 상태를 보여 주므로 1번용 안내 문구는 숨김
      els.empty.hidden = hasCards || isSheet;
    }
    if (els.sheetEmpty) els.sheetEmpty.hidden = true;
    if (els.btnExcel) els.btnExcel.hidden = !isSheet;
  }

  function applyViewMode() {
    var isSheet = viewMode === "2";
    if (els.boards) {
      els.boards.hidden = isSheet;
      els.boards.setAttribute("aria-hidden", isSheet ? "true" : "false");
    }
    if (els.sheet) {
      els.sheet.hidden = !isSheet;
      els.sheet.setAttribute("aria-hidden", isSheet ? "false" : "true");
    }
    if (els.btnView1) {
      els.btnView1.classList.toggle("is-active", !isSheet);
      els.btnView1.setAttribute("aria-pressed", !isSheet ? "true" : "false");
    }
    if (els.btnView2) {
      els.btnView2.classList.toggle("is-active", isSheet);
      els.btnView2.setAttribute("aria-pressed", isSheet ? "true" : "false");
    }
    updateEmpty();
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch (e) {}
  }

  function setViewMode(mode) {
    viewMode = mode === "2" ? "2" : "1";
    applyViewMode();
    if (viewMode === "2") renderSheet();
  }

  function updateHint() {
    if (!els.hint) return;
    els.hint.textContent = isFrontModeActive()
      ? "인벤「만들기」로 가져온 대여 오더를 객실별로 묶습니다. 저장 후 공유됩니다."
      : "같은 객실·예약번호는 한 카드로 묶여 표시됩니다. 정비오더 모드에서 투입완료할 수 있습니다.";
  }

  function publishInvenNotify() {
    if (!isFrontModeActive()) {
      alert("프론트 모드에서만 저장할 수 있습니다.");
      return;
    }
    state.table.updatedAt = nextUpdatedAt();
    saveInvenNotify(state, { pushNow: true });
    draftDirty = false;
    clearDraftLocal();
    updateSaveButton();
    updateToolbarHint();
    if (els.boards) els.boards.classList.remove("inven-notify-boards--draft");
    if (els.sheet) els.sheet.classList.remove("inven-notify-sheet--draft");
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

  function resetInvenTable() {
    if (!isFrontModeActive()) {
      alert("프론트 모드에서만 초기화할 수 있습니다.");
      return;
    }
    if (!confirm("인벤 통보 카드를 모두 비울까요?\n\n바로 다른 PC에 공유됩니다.")) {
      return;
    }
    state = cloneState(defaultInvenNotify());
    state.table.updatedAt = nextUpdatedAt();
    draftDirty = false;
    clearDraftLocal();
    saveInvenNotify(state, { pushNow: true });
    renderCards();
    updateEmpty();
    updateSaveButton();
    updateToolbarHint();
    if (uiHooks.onPublished) uiHooks.onPublished();
  }

  function resetOnCloseDay() {
    clearDraftLocal();
    var empty = cloneState(defaultInvenNotify());
    // 마감 스냅샷에 이미 빈 표(+updatedAt)가 있으면 그 시각을 유지해 merge 우선순위 보존
    try {
      var stored = loadInvenNotify();
      if (
        stored &&
        stored.table &&
        stored.table.updatedAt &&
        (!stored.cards || !stored.cards.length) &&
        (!stored.table.rows || !stored.table.rows.length)
      ) {
        empty.table.updatedAt = String(stored.table.updatedAt);
      } else {
        empty.table.updatedAt = nextUpdatedAt();
      }
    } catch (e) {
      empty.table.updatedAt = nextUpdatedAt();
    }
    state = empty;
    lastPublished = cloneState(state);
    draftDirty = false;
    saveInvenNotify(state, { pushNow: false });
    if (ensureUi()) {
      if (els.boards) els.boards.classList.remove("inven-notify-boards--draft");
      if (els.sheet) els.sheet.classList.remove("inven-notify-sheet--draft");
      renderCards();
      updateSaveButton();
      updateToolbarHint();
      updateEmpty();
    }
  }

  function hasContent(data) {
    var n = normalizeInvenNotify(data);
    return n.cards.length > 0 || (n.table.rows && n.table.rows.length > 0);
  }

  function importInvenTable(rows, meta) {
    if (!Array.isArray(rows)) return;
    var normalizedRows = rows.map(normalizeTableRow);
    if (!isFrontModeActive()) {
      var localDraft = loadDraftLocal() || cloneState(loadInvenNotify());
      localDraft.table.rows = normalizedRows;
      localDraft.cards = buildCardsFromTableRows(normalizedRows, localDraft.cards);
      localDraft.table.updatedAt =
        meta && meta.updatedAt ? String(meta.updatedAt) : new Date().toISOString();
      try {
        sessionStorage.setItem(
          DRAFT_LS,
          JSON.stringify({ dirty: true, state: localDraft })
        );
      } catch (e) {}
      return false;
    }
    if (!draftDirty) {
      state = cloneState(loadInvenNotify());
    }
    state.table.rows = normalizedRows;
    state.cards = buildCardsFromTableRows(normalizedRows, state.cards);
    state.table.updatedAt =
      meta && meta.updatedAt ? String(meta.updatedAt) : new Date().toISOString();
    markDraftDirty();
    ensureUi();
    renderCards();
    updateEmpty();
    updateToolbarHint();
    return true;
  }

  function exportCloseDayRows(invenNotify) {
    var n = normalizeInvenNotify(invenNotify);
    if (n.cards && n.cards.length) {
      var main = n.cards.filter(function (c) {
        return c.wing === "main";
      });
      var annex = n.cards.filter(function (c) {
        return c.wing === "annex";
      });
      var count = Math.max(main.length, annex.length);
      var out = [];
      for (var i = 0; i < count; i++) {
        var m = main[i] || {};
        var a = annex[i] || {};
        out.push([
          m.room ? String(i + 1) : "",
          m.room || "",
          m.confirmationNo || "",
          m.itemsText || "",
          m.trace || "",
          a.room ? String(i + 1) : "",
          a.room || "",
          a.confirmationNo || "",
          a.itemsText || "",
          a.trace || "",
        ]);
      }
      return out;
    }
    return (n.table.rows || []).map(function (row, i) {
      var m = row.main || emptySide();
      var a = row.annex || emptySide();
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
    if (n.cards && n.cards.length) {
      var main = n.cards.filter(function (c) {
        return c.wing === "main";
      });
      var annex = n.cards.filter(function (c) {
        return c.wing === "annex";
      });
      var count = Math.max(main.length, annex.length);
      var out = [];
      for (var i = 0; i < count; i++) {
        var m = main[i] || {};
        var a = annex[i] || {};
        out.push([
          String(i + 1),
          m.room || "",
          m.itemsText || "",
          a.room || "",
          a.itemsText || "",
        ]);
      }
      return out;
    }
    return (n.table.rows || []).map(function (row, i) {
      var m = row.main || emptySide();
      var a = row.annex || emptySide();
      return [
        String(i + 1),
        m.room || "",
        m.itemCode1 || "",
        a.room || "",
        a.itemCode1 || "",
      ];
    });
  }

  function findCard(id) {
    return (state.cards || []).find(function (c) {
      return c && c.id === id;
    });
  }

  function markCardDone(cardId) {
    if (!isMaintenanceModeActive()) return;
    if (
      !requireOperator(function () {
        markCardDone(cardId);
      })
    ) {
      return;
    }
    var card = findCard(cardId);
    if (!card || card.done) return;
    card.done = true;
    card.doneAt = new Date().toISOString();
    card.doneBy = getOperatorName();
    state.table.updatedAt = nextUpdatedAt();
    saveInvenNotify(state, { pushNow: true });
    draftDirty = false;
    clearDraftLocal();
    renderCards();
    if (uiHooks.onPublished) uiHooks.onPublished();
  }

  function getCardRoomPath(card) {
    if (!card) return [];
    if (Array.isArray(card.roomPath) && card.roomPath.length) {
      return card.roomPath.slice();
    }
    return normalizeRoomPath(null, card.room, card.roomFrom);
  }

  function formatCardRoomLabel(card) {
    var path = getCardRoomPath(card);
    if (!path.length) return "—";
    return path
      .map(function (r) {
        return formatRoomDisplay(r) || r;
      })
      .join(" → ");
  }

  function getActiveOrderRoomKeys() {
    var keys = {};
    var entries = [];
    try {
      if (uiHooks.getActiveOrderEntries) {
        entries = uiHooks.getActiveOrderEntries() || [];
      } else if (global.HKSync && typeof global.HKSync.getOrderLog === "function") {
        entries = global.HKSync.getOrderLog() || [];
      }
    } catch (e) {
      entries = [];
    }
    entries.forEach(function (entry) {
      if (!entry) return;
      var phase = entry.phase != null ? String(entry.phase) : "";
      if (phase === "cancelled") return;
      var room = entry.room != null ? String(entry.room).trim() : "";
      if (!room) return;
      room.split(/[,，]|->|→|에서/).forEach(function (part) {
        var key = roomDupKey(part);
        if (key) keys[key] = true;
      });
    });
    return keys;
  }

  function roomDupKey(v) {
    var d = String(v == null ? "" : v).replace(/\D/g, "");
    if (!d) return "";
    return d.replace(/^0+/, "") || "0";
  }

  function cardHasOrderDuplicate(card) {
    var orderKeys = getActiveOrderRoomKeys();
    var path = getCardRoomPath(card);
    for (var i = 0; i < path.length; i++) {
      var key = roomDupKey(path[i]);
      if (key && orderKeys[key]) return true;
    }
    return false;
  }

  function sideMatchesCard(side, card) {
    if (!side || !card) return false;
    var room = String(side.room || "").trim();
    var conf = String(side.confirmationNo || "").trim();
    if (conf !== String(card.confirmationNo || "").trim()) return false;
    var path = getCardRoomPath(card);
    var sideKey = formatRoomDisplay(room) || room;
    return path.some(function (r) {
      return (formatRoomDisplay(r) || r) === sideKey;
    });
  }

  function classifyWingByRoom(room) {
    var d = String(room || "").replace(/\D/g, "");
    var tail = d.length >= 2 ? parseInt(d.slice(-2), 10) : NaN;
    if (!isNaN(tail) && tail > 50) return "annex";
    return "main";
  }

  function syncCardRoomToTableRows(card, prevRoom) {
    if (!card || !state.table || !Array.isArray(state.table.rows)) return;
    var wing = card.wing === "annex" ? "annex" : "main";
    var matchRoom = String(prevRoom || card.room || "").trim();
    state.table.rows.forEach(function (row) {
      var n = normalizeTableRow(row);
      var side = n[wing];
      if (!side) return;
      if (
        String(side.room || "").trim() === matchRoom &&
        String(side.confirmationNo || "").trim() ===
          String(card.confirmationNo || "").trim()
      ) {
        side.room = card.room;
        row[wing] = side;
      }
    });
  }

  function removeCardFromTableRows(card) {
    if (!card || !state.table || !Array.isArray(state.table.rows)) return;
    var wing = card.wing === "annex" ? "annex" : "main";
    var nextRows = [];
    state.table.rows.forEach(function (row) {
      var n = normalizeTableRow(row);
      if (sideMatchesCard(n[wing], card)) {
        n[wing] = emptySide();
      }
      if (
        String(n.main.room || "").trim() ||
        String(n.annex.room || "").trim()
      ) {
        nextRows.push(n);
      }
    });
    state.table.rows = nextRows;
  }

  function deleteNotifyCard(cardId) {
    if (!isFrontModeActive()) return;
    var card = findCard(cardId);
    if (!card) return;
    var label = formatCardRoomLabel(card);
    if (!confirm("객실 " + label + " 카드를 삭제할까요?\n(저장 후 다른 PC에 반영됩니다)")) {
      return;
    }
    state.cards = (state.cards || []).filter(function (c) {
      return c && c.id !== cardId;
    });
    removeCardFromTableRows(card);
    markDraftDirty();
    renderCards();
    updateEmpty();
  }

  function syncCardTraceToTableRows(card) {
    if (!card || !state.table || !Array.isArray(state.table.rows)) return;
    var wing = card.wing === "annex" ? "annex" : "main";
    state.table.rows.forEach(function (row) {
      var n = normalizeTableRow(row);
      if (sideMatchesCard(n[wing], card)) {
        n[wing].trace = card.trace || "";
        row[wing] = n[wing];
      }
    });
  }

  function editNotifyCardTrace(cardId) {
    if (!isFrontModeActive()) return;
    var card = findCard(cardId);
    if (!card) return;
    var next = window.prompt(
      "트레이스 수정 (객실 " + formatCardRoomLabel(card) + ")",
      card.trace || ""
    );
    if (next == null) return;
    card.trace = String(next).trim();
    syncCardTraceToTableRows(card);
    markDraftDirty();
    renderCards();
  }

  function editNotifyCardRoom(cardId) {
    if (!isFrontModeActive()) return;
    var card = findCard(cardId);
    if (!card) return;
    var current = formatRoomDisplay(card.room) || card.room || "";
    var nextRaw = window.prompt(
      "객실번호 변경 (현재 " + formatCardRoomLabel(card) + ")",
      current
    );
    if (nextRaw == null) return;
    var next = String(nextRaw).trim();
    if (!next) {
      alert("객실번호를 입력하세요.");
      return;
    }
    var prevRoom = card.room;
    var path = getCardRoomPath(card);
    var nextKey = formatRoomDisplay(next) || next;
    var lastKey =
      path.length > 0
        ? formatRoomDisplay(path[path.length - 1]) || path[path.length - 1]
        : "";
    if (nextKey !== lastKey) path.push(next);
    card.roomPath = path;
    card.room = next;
    card.roomFrom = path.length >= 2 ? path[0] : "";
    card.wing = classifyWingByRoom(card.room);
    syncCardRoomToTableRows(card, prevRoom);
    markDraftDirty();
    renderCards();
  }

  function cardMatchesSearch(card, q) {
    if (!q) return true;
    var hay = [
      card.room,
      card.roomFrom,
      getCardRoomPath(card).join(" "),
      formatCardRoomLabel(card),
      card.confirmationNo,
      card.itemsText,
      card.trace,
    ]
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function createCardEl(card) {
    var li = document.createElement("li");
    li.className = "room-card inven-notify-card";
    li.setAttribute("data-card-id", card.id);
    if (card.done) li.classList.add("inven-notify-card--done");
    var path = getCardRoomPath(card);
    if (path.length >= 2) li.classList.add("inven-notify-card--room-moved");
    var dup = cardHasOrderDuplicate(card);
    if (dup) li.classList.add("inven-notify-card--dup");

    var head = document.createElement("div");
    head.className = "room-card__head";
    var noBox = document.createElement("span");
    noBox.className = "room-card__no-box";
    var no = document.createElement("span");
    no.className = "room-card__no";
    no.textContent = formatCardRoomLabel(card);
    noBox.appendChild(no);
    head.appendChild(noBox);
    if (card.confirmationNo) {
      var conf = document.createElement("span");
      conf.className = "inven-notify-card__conf";
      conf.textContent = card.confirmationNo;
      conf.title = "예약번호";
      head.appendChild(conf);
    }
    li.appendChild(head);

    if (dup) {
      var dupEl = document.createElement("div");
      dupEl.className = "inven-notify-card__dup";
      dupEl.textContent = "중복확인요망";
      li.appendChild(dupEl);
    }

    var items = document.createElement("p");
    items.className = "inven-notify-card__items";
    items.textContent = card.itemsText || "—";
    li.appendChild(items);

    if (card.trace) {
      var trace = document.createElement("p");
      trace.className = "inven-notify-card__trace";
      trace.textContent = card.trace;
      li.appendChild(trace);
    }

    if (card.done) {
      var doneMeta = document.createElement("div");
      doneMeta.className = "inven-notify-card__done-meta";
      doneMeta.textContent =
        "투입완료" +
        (card.doneBy ? " · " + card.doneBy : "") +
        (card.doneAt ? " · " + formatAt(card.doneAt) : "");
      li.appendChild(doneMeta);
    }

    var acts = document.createElement("div");
    acts.className = "inven-notify-card__actions";
    var hasAct = false;
    if (isFrontModeActive()) {
      var roomBtn = document.createElement("button");
      roomBtn.type = "button";
      roomBtn.className = "inven-notify-card__room-btn";
      roomBtn.setAttribute("data-card-id", card.id);
      roomBtn.textContent = "객실변경";
      acts.appendChild(roomBtn);
      var traceBtn = document.createElement("button");
      traceBtn.type = "button";
      traceBtn.className = "inven-notify-card__memo-btn";
      traceBtn.setAttribute("data-card-id", card.id);
      traceBtn.textContent = card.trace ? "트레이스 수정" : "트레이스";
      acts.appendChild(traceBtn);
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "inven-notify-card__delete-btn";
      delBtn.setAttribute("data-card-id", card.id);
      delBtn.textContent = "삭제";
      acts.appendChild(delBtn);
      hasAct = true;
    }
    if (!card.done && isMaintenanceModeActive()) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inven-notify-card__done-btn";
      btn.setAttribute("data-card-id", card.id);
      btn.textContent = "투입완료";
      acts.appendChild(btn);
      hasAct = true;
    }
    if (hasAct) li.appendChild(acts);
    return li;
  }

  function renderWingBoard(wing, title, cards) {
    var section = document.createElement("section");
    section.className = "inven-notify-wing";
    section.setAttribute("data-wing", wing);
    var h = document.createElement("h3");
    h.className = "inven-notify-wing__title";
    h.textContent = title;
    section.appendChild(h);

    var list = document.createElement("ul");
    list.className = "inven-notify-card-list";

    var openCards = cards.filter(function (c) {
      return !c.done;
    });
    var doneCards = cards.filter(function (c) {
      return c.done;
    });

    openCards.forEach(function (c) {
      list.appendChild(createCardEl(c));
    });
    doneCards.forEach(function (c) {
      list.appendChild(createCardEl(c));
    });

    if (!openCards.length && !doneCards.length) {
      var empty = document.createElement("p");
      empty.className = "inven-notify-wing__empty";
      empty.textContent = title + " 오더 없음";
      section.appendChild(empty);
    } else {
      section.appendChild(list);
    }
    return section;
  }

  function splitItemLines(itemsText) {
    return String(itemsText || "")
      .split(/\n+/)
      .map(function (line) {
        return String(line || "").trim();
      })
      .filter(Boolean);
  }

  function buildSheetGroups(cards) {
    var sorted = (cards || []).slice().sort(function (a, b) {
      var ak = roomSortKey(a && a.room);
      var bk = roomSortKey(b && b.room);
      if (ak !== bk) return ak < bk ? -1 : 1;
      return String((a && a.confirmationNo) || "").localeCompare(
        String((b && b.confirmationNo) || ""),
        "ko"
      );
    });

    return sorted.map(function (card) {
      var items = splitItemLines(card.itemsText);
      if (!items.length) items = ["—"];
      var noteParts = [];
      if (card.memo) noteParts.push(String(card.memo).trim());
      if (card.trace) noteParts.push(String(card.trace).trim());
      return {
        room: formatCardRoomLabel(card),
        conf: String(card.confirmationNo || "").trim() || "—",
        items: items,
        note: noteParts.filter(Boolean).join(" / ") || "",
        done: !!card.done,
      };
    });
  }

  function expandSheetRows(groups) {
    var rows = [];
    var lineNo = 0;
    (groups || []).forEach(function (group) {
      var span = Math.max(1, (group.items && group.items.length) || 1);
      group.items.forEach(function (item, idx) {
        lineNo += 1;
        rows.push({
          no: lineNo,
          room: group.room,
          conf: group.conf,
          item: item,
          note: group.note || "",
          span: span,
          isFirst: idx === 0,
        });
      });
    });
    return rows;
  }

  function buildExcelSideHtml(title, groups) {
    var rows = expandSheetRows(groups);
    var body = "";
    if (!rows.length) {
      body =
        '<tr><td colspan="5" style="text-align:center;color:#64748b;">' +
        escapeHtml(title) +
        " 오더 없음</td></tr>";
    } else {
      rows.forEach(function (row) {
        body += "<tr>";
        body += "<td>" + escapeHtml(String(row.no)) + "</td>";
        if (row.isFirst) {
          body +=
            '<td rowspan="' +
            row.span +
            '" style="text-align:center;font-weight:700;">' +
            escapeHtml(row.room) +
            "</td>";
          body +=
            '<td rowspan="' +
            row.span +
            '" style="text-align:center;">' +
            escapeHtml(row.conf) +
            "</td>";
        }
        body +=
          '<td style="text-align:left;">' + escapeHtml(row.item) + "</td>";
        if (row.isFirst) {
          body +=
            '<td rowspan="' +
            row.span +
            '" style="text-align:left;">' +
            escapeHtml(row.note) +
            "</td>";
        }
        body += "</tr>";
      });
    }
    return (
      '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Malgun Gothic,Arial,sans-serif;font-size:11pt;">' +
      "<thead>" +
      '<tr><th colspan="5" style="background:#f9a8d4;font-weight:800;">' +
      escapeHtml(title) +
      "</th></tr>" +
      '<tr style="background:#fce7f3;font-weight:700;">' +
      "<th>#</th><th>객실번호</th><th>예약번호</th><th>물품 및 수량</th><th>비고</th>" +
      "</tr>" +
      "</thead><tbody>" +
      body +
      "</tbody></table>"
    );
  }

  function getFilteredWingCards(wing) {
    var q = String(cardSearchQuery || "").trim().toLowerCase();
    return (state.cards || []).filter(function (c) {
      if (!cardMatchesSearch(c, q)) return false;
      return wing === "annex" ? c.wing === "annex" : c.wing !== "annex";
    });
  }

  function downloadSheetExcel() {
    var mainGroups = buildSheetGroups(getFilteredWingCards("main"));
    var annexGroups = buildSheetGroups(getFilteredWingCards("annex"));
    if (!mainGroups.length && !annexGroups.length) {
      alert("다운로드할 인벤 통보가 없습니다.");
      return;
    }

    var now = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    var stamp =
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      "_" +
      pad(now.getHours()) +
      pad(now.getMinutes());

    var html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="UTF-8" />' +
      "<style>td,th{border:1px solid #94a3b8;padding:4px 6px;vertical-align:middle;} td{mso-number-format:\\'@\\';}</style>" +
      "</head><body>" +
      "<h3>인벤 통보</h3>" +
      '<table><tr><td style="vertical-align:top;padding-right:12px;">' +
      buildExcelSideHtml("본관", mainGroups) +
      '</td><td style="vertical-align:top;">' +
      buildExcelSideHtml("별관", annexGroups) +
      "</td></tr></table>" +
      "</body></html>";

    var blob = new Blob(["\uFEFF" + html], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "인벤통보_" + stamp + ".xls";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function renderSheetTable(host, title, cards) {
    if (!host) return;
    host.innerHTML = "";

    var table = document.createElement("table");
    table.className = "inven-notify-sheet-table";

    var thead = document.createElement("thead");
    var wingRow = document.createElement("tr");
    var wingTh = document.createElement("th");
    wingTh.className = "inven-notify-sheet-wing";
    wingTh.colSpan = 5;
    wingTh.textContent = title;
    wingRow.appendChild(wingTh);
    thead.appendChild(wingRow);

    var headRow = document.createElement("tr");
    ["#", "객실번호", "예약번호", "물품 및 수량", "비고"].forEach(function (label) {
      var th = document.createElement("th");
      th.className = "inven-notify-sheet-sub";
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var groups = buildSheetGroups(cards);
    var lineNo = 0;

    if (!groups.length) {
      var emptyTr = document.createElement("tr");
      var emptyTd = document.createElement("td");
      emptyTd.colSpan = 5;
      emptyTd.className = "inven-notify-sheet-blank";
      emptyTd.textContent = title + " 오더 없음";
      emptyTr.appendChild(emptyTd);
      tbody.appendChild(emptyTr);
    } else {
      groups.forEach(function (group) {
        var span = Math.max(1, group.items.length);
        group.items.forEach(function (item, idx) {
          lineNo += 1;
          var tr = document.createElement("tr");
          if (group.done) tr.className = "is-done";

          var tdNo = document.createElement("td");
          tdNo.className = "inven-notify-sheet-no";
          tdNo.textContent = String(lineNo);
          tr.appendChild(tdNo);

          if (idx === 0) {
            var tdRoom = document.createElement("td");
            tdRoom.className = "inven-notify-sheet-room";
            tdRoom.rowSpan = span;
            tdRoom.textContent = group.room;
            tr.appendChild(tdRoom);

            var tdConf = document.createElement("td");
            tdConf.className = "inven-notify-sheet-conf";
            tdConf.rowSpan = span;
            tdConf.textContent = group.conf;
            tr.appendChild(tdConf);
          }

          var tdItem = document.createElement("td");
          tdItem.className = "inven-notify-sheet-item";
          tdItem.textContent = item;
          tr.appendChild(tdItem);

          if (idx === 0) {
            var tdNote = document.createElement("td");
            tdNote.className = "inven-notify-sheet-note";
            tdNote.rowSpan = span;
            tdNote.textContent = group.note || "";
            tr.appendChild(tdNote);
          }

          tbody.appendChild(tr);
        });
      });
    }

    table.appendChild(tbody);
    host.appendChild(table);
  }

  function renderSheet() {
    if (!els.sheetMain || !els.sheetAnnex) return;
    var q = String(cardSearchQuery || "").trim().toLowerCase();
    var cards = (state.cards || []).filter(function (c) {
      return cardMatchesSearch(c, q);
    });
    var mainCards = cards.filter(function (c) {
      return c.wing === "main";
    });
    var annexCards = cards.filter(function (c) {
      return c.wing === "annex";
    });
    renderSheetTable(els.sheetMain, "본관", mainCards);
    renderSheetTable(els.sheetAnnex, "별관", annexCards);
  }

  function renderCards() {
    if (!els.boards) return;
    els.boards.innerHTML = "";
    var q = String(cardSearchQuery || "").trim().toLowerCase();
    var cards = (state.cards || []).filter(function (c) {
      return cardMatchesSearch(c, q);
    });
    var mainCards = cards.filter(function (c) {
      return c.wing === "main";
    });
    var annexCards = cards.filter(function (c) {
      return c.wing === "annex";
    });

    els.boards.appendChild(renderWingBoard("main", "본관", mainCards));
    els.boards.appendChild(renderWingBoard("annex", "별관", annexCards));
    renderSheet();
    applyViewMode();
  }

  function ensureUi() {
    var mount = document.getElementById("invenNotifyMount");
    if (!mount) return false;
    if (uiReady && els.mount === mount) return true;

    try {
      var savedView = String(localStorage.getItem(VIEW_KEY) || "").trim();
      if (savedView === "1" || savedView === "2") viewMode = savedView;
    } catch (e) {}

    mount.innerHTML = "";
    els.mount = mount;

    var empty = document.createElement("p");
    empty.className = "inven-notify-empty";
    empty.id = "invenNotifyEmpty";
    empty.textContent =
      "인벤에서 「만들기」를 실행하거나, 프론트 모드에서 저장하세요.";

    var searchRow = document.createElement("div");
    searchRow.className = "inven-notify-search-row";
    var searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.id = "invenNotifySearch";
    searchInput.className = "inven-notify-search";
    searchInput.placeholder = "객실·예약번호·물품·트레이스 검색";
    searchInput.autocomplete = "off";
    searchInput.value = cardSearchQuery || "";
    searchInput.addEventListener("input", function () {
      cardSearchQuery = String(searchInput.value || "");
      renderCards();
    });

    var viewTabs = document.createElement("div");
    viewTabs.className = "inven-notify-view-tabs";
    viewTabs.setAttribute("role", "tablist");
    viewTabs.setAttribute("aria-label", "인벤 통보 보기");

    var btnView1 = document.createElement("button");
    btnView1.type = "button";
    btnView1.className = "inven-notify-view-tab is-active";
    btnView1.setAttribute("data-inven-notify-view", "1");
    btnView1.setAttribute("aria-pressed", "true");
    btnView1.textContent = "1";
    btnView1.addEventListener("click", function () {
      setViewMode("1");
    });

    var btnView2 = document.createElement("button");
    btnView2.type = "button";
    btnView2.className = "inven-notify-view-tab";
    btnView2.setAttribute("data-inven-notify-view", "2");
    btnView2.setAttribute("aria-pressed", "false");
    btnView2.textContent = "2";
    btnView2.addEventListener("click", function () {
      setViewMode("2");
    });

    viewTabs.appendChild(btnView1);
    viewTabs.appendChild(btnView2);

    var btnExcel = document.createElement("button");
    btnExcel.type = "button";
    btnExcel.className = "btn-order inven-notify-tool-btn inven-notify-excel-btn";
    btnExcel.textContent = "엑셀";
    btnExcel.title = "2번 표 형태로 엑셀 다운로드";
    btnExcel.hidden = true;
    btnExcel.addEventListener("click", function () {
      downloadSheetExcel();
    });

    searchRow.appendChild(viewTabs);
    searchRow.appendChild(btnExcel);
    searchRow.appendChild(searchInput);

    var boards = document.createElement("div");
    boards.className = "inven-notify-boards";
    boards.id = "invenNotifyBoards";
    boards.hidden = true;

    var sheet = document.createElement("div");
    sheet.className = "inven-notify-sheet";
    sheet.id = "invenNotifySheet";
    sheet.hidden = true;
    var sheetScroll = document.createElement("div");
    sheetScroll.className = "inven-notify-sheet-scroll";
    var sheetMain = document.createElement("div");
    sheetMain.className = "inven-notify-sheet-col";
    sheetMain.setAttribute("data-inven-notify-sheet-main", "");
    var sheetAnnex = document.createElement("div");
    sheetAnnex.className = "inven-notify-sheet-col";
    sheetAnnex.setAttribute("data-inven-notify-sheet-annex", "");
    sheetScroll.appendChild(sheetMain);
    sheetScroll.appendChild(sheetAnnex);
    sheet.appendChild(sheetScroll);
    var sheetEmpty = document.createElement("p");
    sheetEmpty.className = "inven-notify-empty";
    sheetEmpty.setAttribute("data-inven-notify-sheet-empty", "");
    sheetEmpty.hidden = true;
    sheetEmpty.textContent = "표시할 인벤 통보가 없습니다.";
    sheet.appendChild(sheetEmpty);

    var toolbar = document.createElement("div");
    toolbar.className = "inven-notify-toolbar";
    toolbar.id = "invenNotifyToolbar";

    var toolGroup = document.createElement("div");
    toolGroup.className = "inven-notify-toolbar__tools";

    var btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "btn-order inven-notify-tool-btn inven-notify-save-btn";
    btnSave.textContent = "저장";
    btnSave.addEventListener("click", publishInvenNotify);
    toolGroup.appendChild(btnSave);

    var btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.className = "btn-order inven-notify-tool-btn";
    btnReset.textContent = "초기화";
    btnReset.addEventListener("click", resetInvenTable);
    toolGroup.appendChild(btnReset);

    var toolbarHint = document.createElement("span");
    toolbarHint.className = "inven-notify-toolbar__hint";

    toolbar.appendChild(toolGroup);
    toolbar.appendChild(toolbarHint);

    mount.appendChild(toolbar);
    mount.appendChild(searchRow);
    mount.appendChild(empty);
    mount.appendChild(boards);
    mount.appendChild(sheet);

    boards.addEventListener("click", function (e) {
      var roomBtn = e.target.closest(".inven-notify-card__room-btn");
      if (roomBtn) {
        e.preventDefault();
        editNotifyCardRoom(roomBtn.getAttribute("data-card-id"));
        return;
      }
      var memoBtn = e.target.closest(".inven-notify-card__memo-btn");
      if (memoBtn) {
        e.preventDefault();
        editNotifyCardTrace(memoBtn.getAttribute("data-card-id"));
        return;
      }
      var delBtn = e.target.closest(".inven-notify-card__delete-btn");
      if (delBtn) {
        e.preventDefault();
        deleteNotifyCard(delBtn.getAttribute("data-card-id"));
        return;
      }
      var doneBtn = e.target.closest(".inven-notify-card__done-btn");
      if (!doneBtn) return;
      e.preventDefault();
      var cardId = doneBtn.getAttribute("data-card-id");
      if (cardId) markCardDone(cardId);
    });

    els.empty = empty;
    els.boards = boards;
    els.sheet = sheet;
    els.sheetMain = sheetMain;
    els.sheetAnnex = sheetAnnex;
    els.sheetEmpty = sheetEmpty;
    els.toolbar = toolbar;
    els.btnSave = btnSave;
    els.btnView1 = btnView1;
    els.btnView2 = btnView2;
    els.btnExcel = btnExcel;
    els.toolbarHint = toolbarHint;
    els.searchInput = searchInput;
    els.hint = document.getElementById("invenNotifyHint");
    uiReady = true;
    applyViewMode();
    return true;
  }

  function renderInvenNotifyPanel(force) {
    var panel = document.getElementById("invenNotifyPanel");
    if (!panel || panel.hidden) return;
    if (!ensureUi()) return;

    var editable = isFrontModeActive();
    if (!force && skipNextRemoteRender) {
      skipNextRemoteRender = false;
    }
    if (!force && editable && draftDirty) {
      /* keep draft */
    } else if (editable) {
      var pending = loadDraftLocal();
      if (pending && ((pending.cards && pending.cards.length) || draftDirty)) {
        state = pending;
        draftDirty = true;
      } else {
        state = loadPublishedState();
        draftDirty = false;
      }
    } else {
      state = loadPublishedState();
      draftDirty = false;
    }

    if (els.toolbar) els.toolbar.hidden = !editable;
    if (els.boards) {
      els.boards.classList.toggle("inven-notify-boards--draft", editable && draftDirty);
      els.boards.classList.toggle("inven-notify-boards--readonly", !editable);
    }
    if (els.sheet) {
      els.sheet.classList.toggle("inven-notify-sheet--draft", editable && draftDirty);
      els.sheet.classList.toggle("inven-notify-sheet--readonly", !editable);
    }
    renderCards();
    updateSaveButton();
    updateToolbarHint();
    updateHint();
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
      if (pending && pending.cards && pending.cards.length) {
        state = pending;
        draftDirty = true;
      }
    } else if (!draftDirty) {
      state = loadPublishedState();
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
