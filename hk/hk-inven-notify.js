/**
 * 인벤 통보 — 객실 오더 카드 (본관/별관)
 * 인벤「만들기」행을 객실+예약번호로 묶어 카드로 표시.
 * 정비오더 모드에서 「투입완료」가능. 인벤 변경 오더는 객실→객실 카드로 함께 표시.
 */
(function (global) {
  var DRAFT_LS = "hk-inven-notify-draft-v6";
  var LEGACY_DRAFT_LS = "hk-inven-notify-draft-v5";
  var skipNextRemoteRender = false;
  var lastPublished = null;
  var uiReady = false;
  var draftDirty = false;
  var publishFeedbackTimer = null;
  var uiHooks = {};
  var state = defaultInvenNotify();

  var els = {
    mount: null,
    toolbar: null,
    boards: null,
    empty: null,
    btnSave: null,
    toolbarHint: null,
    hint: null,
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

  function normalizeCard(raw) {
    if (!raw || typeof raw !== "object") return null;
    var wing = raw.wing === "annex" ? "annex" : "main";
    var room = raw.room != null ? String(raw.room).trim() : "";
    if (!room) return null;
    var confirmationNo =
      raw.confirmationNo != null ? String(raw.confirmationNo).trim() : "";
    var id =
      raw.id != null && String(raw.id).trim()
        ? String(raw.id).trim()
        : "ic-" + cardKey(wing, room, confirmationNo);
    return {
      id: id,
      wing: wing,
      room: room,
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
        : "저장됨 · 만들기/메모/삭제는 저장 후 동기화됩니다.";
    } else if (isMaintenanceModeActive()) {
      els.toolbarHint.textContent = "정비오더 모드 · 투입완료로 처리하세요.";
    } else {
      els.toolbarHint.textContent = "저장된 인벤 통보를 조회합니다.";
    }
  }

  function updateEmpty() {
    if (!els.empty) return;
    var hasCards = (state.cards || []).length > 0;
    var hasChanges = getInvChangeEntries().length > 0;
    els.empty.hidden = hasCards || hasChanges;
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
    lastPublished = null;
    state = cloneState(defaultInvenNotify());
    draftDirty = false;
    if (ensureUi()) {
      if (els.boards) els.boards.classList.remove("inven-notify-boards--draft");
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

  function getInvChangeEntries() {
    var entries = [];
    try {
      if (global.HKMbWorkflow && typeof global.HKMbWorkflow.getEntries === "function") {
        entries = global.HKMbWorkflow.getEntries() || [];
      } else if (global.HKSync && typeof global.HKSync.getMbInvLog === "function") {
        entries = global.HKSync.getMbInvLog() || [];
      }
    } catch (e) {
      entries = [];
    }
    var doneMap = (state && state.changeDone) || {};
    return entries.filter(function (e) {
      if (!e || e.category !== "inv") return false;
      if (e.phase === "cancelled") return false;
      if (doneMap[e.id]) return false;
      return true;
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

  function markChangeDone(entryId) {
    if (!isMaintenanceModeActive()) return;
    if (
      !requireOperator(function () {
        markChangeDone(entryId);
      })
    ) {
      return;
    }
    if (!entryId) return;
    if (!state.changeDone) state.changeDone = {};
    state.changeDone[entryId] = {
      at: new Date().toISOString(),
      by: getOperatorName(),
    };
    state.table.updatedAt = nextUpdatedAt();
    saveInvenNotify(state, { pushNow: true });
    draftDirty = false;
    clearDraftLocal();
    renderCards();
    if (uiHooks.onPublished) uiHooks.onPublished();
  }

  function sideMatchesCard(side, card) {
    if (!side || !card) return false;
    var room = String(side.room || "").trim();
    var conf = String(side.confirmationNo || "").trim();
    return (
      room === String(card.room || "").trim() &&
      conf === String(card.confirmationNo || "").trim()
    );
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
    var label = formatRoomDisplay(card.room) || card.room;
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
      "트레이스 수정 (객실 " + (formatRoomDisplay(card.room) || card.room) + ")",
      card.trace || ""
    );
    if (next == null) return;
    card.trace = String(next).trim();
    syncCardTraceToTableRows(card);
    markDraftDirty();
    renderCards();
  }

  function createCardEl(card) {
    var li = document.createElement("li");
    li.className = "room-card inven-notify-card";
    li.setAttribute("data-card-id", card.id);
    if (card.done) li.classList.add("inven-notify-card--done");

    var head = document.createElement("div");
    head.className = "room-card__head";
    var noBox = document.createElement("span");
    noBox.className = "room-card__no-box";
    var no = document.createElement("span");
    no.className = "room-card__no";
    no.textContent = formatRoomDisplay(card.room);
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

  function createChangeCardEl(entry) {
    var li = document.createElement("li");
    li.className = "room-card inven-notify-card inven-notify-card--change";
    li.setAttribute("data-change-id", entry.id || "");

    var tag = document.createElement("div");
    tag.className = "inven-notify-card__change-tag";
    tag.textContent = "인벤 변경";
    li.appendChild(tag);

    var row = document.createElement("div");
    row.className = "inven-notify-card__change-row";
    var fromCard = document.createElement("span");
    fromCard.className = "room-card__no-box inven-notify-card__arrow-room";
    fromCard.textContent = formatRoomDisplay(entry.roomFrom);
    var arrow = document.createElement("span");
    arrow.className = "inven-notify-card__arrow";
    arrow.textContent = "→";
    var toCard = document.createElement("span");
    toCard.className = "room-card__no-box inven-notify-card__arrow-room";
    toCard.textContent = formatRoomDisplay(entry.roomTo);
    row.appendChild(fromCard);
    row.appendChild(arrow);
    row.appendChild(toCard);
    li.appendChild(row);

    var memo = entry.memo != null ? String(entry.memo).trim() : "";
    if (memo) {
      var memoEl = document.createElement("p");
      memoEl.className = "inven-notify-card__items";
      memoEl.textContent = memo;
      li.appendChild(memoEl);
    }

    if (isMaintenanceModeActive()) {
      var acts = document.createElement("div");
      acts.className = "inven-notify-card__actions";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inven-notify-card__done-btn";
      btn.setAttribute("data-change-id", entry.id || "");
      btn.textContent = "투입완료";
      acts.appendChild(btn);
      li.appendChild(acts);
    }
    return li;
  }

  function renderWingBoard(wing, title, cards, changeEntries) {
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
    changeEntries.forEach(function (e) {
      list.appendChild(createChangeCardEl(e));
    });
    doneCards.forEach(function (c) {
      list.appendChild(createCardEl(c));
    });

    if (!openCards.length && !doneCards.length && !changeEntries.length) {
      var empty = document.createElement("p");
      empty.className = "inven-notify-wing__empty";
      empty.textContent = title + " 오더 없음";
      section.appendChild(empty);
    } else {
      section.appendChild(list);
    }
    return section;
  }

  function classifyChangeWing(entry) {
    var room = entry.roomTo || entry.roomFrom || "";
    var d = String(room).replace(/\D/g, "");
    var tail = d.length >= 2 ? parseInt(d.slice(-2), 10) : NaN;
    if (!isNaN(tail) && tail > 50) return "annex";
    return "main";
  }

  function renderCards() {
    if (!els.boards) return;
    els.boards.innerHTML = "";
    var cards = state.cards || [];
    var mainCards = cards.filter(function (c) {
      return c.wing === "main";
    });
    var annexCards = cards.filter(function (c) {
      return c.wing === "annex";
    });
    var changes = getInvChangeEntries();
    var mainChanges = changes.filter(function (e) {
      return classifyChangeWing(e) === "main";
    });
    var annexChanges = changes.filter(function (e) {
      return classifyChangeWing(e) === "annex";
    });

    els.boards.appendChild(renderWingBoard("main", "본관", mainCards, mainChanges));
    els.boards.appendChild(renderWingBoard("annex", "별관", annexCards, annexChanges));
    els.boards.hidden = false;
    updateEmpty();
  }

  function ensureUi() {
    var mount = document.getElementById("invenNotifyMount");
    if (!mount) return false;
    if (uiReady && els.mount === mount) return true;

    mount.innerHTML = "";
    els.mount = mount;

    var empty = document.createElement("p");
    empty.className = "inven-notify-empty";
    empty.id = "invenNotifyEmpty";
    empty.textContent =
      "인벤에서 「만들기」를 실행하거나, 프론트 모드에서 저장하세요.";

    var boards = document.createElement("div");
    boards.className = "inven-notify-boards";
    boards.id = "invenNotifyBoards";
    boards.hidden = true;

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
    mount.appendChild(empty);
    mount.appendChild(boards);

    boards.addEventListener("click", function (e) {
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
      var changeId = doneBtn.getAttribute("data-change-id");
      if (cardId) markCardDone(cardId);
      else if (changeId) markChangeDone(changeId);
    });

    els.empty = empty;
    els.boards = boards;
    els.toolbar = toolbar;
    els.btnSave = btnSave;
    els.toolbarHint = toolbarHint;
    els.hint = document.getElementById("invenNotifyHint");
    uiReady = true;
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
