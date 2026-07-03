/**
 * 시설 관리 하위 업무 로그 — 컴플레인·지난습득물·세탁 / 당일습득물
 * 오더형(접수 → 완료). 관리자 전체 마감 후 10일간 유지.
 */
(function (global) {
  var RETENTION_MS = 10 * 24 * 60 * 60 * 1000;
  var OPERATOR_NAME_KEY = "lotte-hk-operator-name-session-v1";

  var MISC_CATEGORIES = [
    { key: "complaint", label: "컴플레인" },
    { key: "pastFound", label: "지난습득물" },
    { key: "laundry", label: "세탁" },
  ];

  var activeMiscCategory = "complaint";
  var activeView = "";
  var uiHooks = {};

  function defaultMiscLog() {
    return {
      retainUntil: "",
      entries: { complaint: [], pastFound: [], laundry: [] },
    };
  }

  function defaultDailyFoundLog() {
    return { retainUntil: "", entries: [] };
  }

  function getEntryPhase(entry) {
    if (!entry) return "alert";
    var p = entry.phase != null ? String(entry.phase).trim() : "";
    if (p === "completed") return "completed";
    if (p === "accepted") return "accepted";
    if (p === "alert") return "alert";
    return "accepted";
  }

  function normalizeOrderEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = raw.id != null ? String(raw.id).trim() : "";
    if (!id) return null;

    var memo = raw.memo != null ? String(raw.memo).trim() : "";
    var memoImage = raw.memoImage != null ? String(raw.memoImage).trim() : "";
    var at = raw.at != null ? String(raw.at) : "";
    var by = raw.by != null ? String(raw.by).trim() : "";

    if (Array.isArray(raw.chat) && raw.chat.length) {
      var texts = [];
      raw.chat.forEach(function (m) {
        if (!m) return;
        var t = m.text != null ? String(m.text).trim() : "";
        if (t) texts.push(t);
        if (!memoImage && m.image) memoImage = String(m.image).trim();
        if (!by && m.by) by = String(m.by).trim();
        if (!at && m.at) at = String(m.at);
      });
      if (!memo) memo = texts.join("\n");
    }

    if (!memo && !memoImage) return null;

    return {
      id: id,
      at: at || new Date().toISOString(),
      room: raw.room != null ? String(raw.room).trim() : "",
      memo: memo,
      memoImage: memoImage,
      by: by,
      phase: getEntryPhase(raw),
      acceptedAt: raw.acceptedAt != null ? String(raw.acceptedAt) : "",
      acceptedBy: raw.acceptedBy != null ? String(raw.acceptedBy).trim() : "",
      completedAt: raw.completedAt != null ? String(raw.completedAt) : "",
      completedBy: raw.completedBy != null ? String(raw.completedBy).trim() : "",
    };
  }

  function maybePurgeLog(log, factory) {
    if (log && log.retainUntil) {
      var t = new Date(log.retainUntil).getTime();
      if (!isNaN(t) && Date.now() > t) return factory();
    }
    return log;
  }

  function normalizeMiscLog(raw) {
    var log = defaultMiscLog();
    if (!raw || typeof raw !== "object") return log;
    log.retainUntil = raw.retainUntil != null ? String(raw.retainUntil) : "";
    var src = raw.entries && typeof raw.entries === "object" ? raw.entries : {};
    MISC_CATEGORIES.forEach(function (cat) {
      var list = [];
      if (Array.isArray(src[cat.key])) {
        src[cat.key].forEach(function (item) {
          var n = normalizeOrderEntry(item);
          if (n) list.push(n);
        });
      }
      log.entries[cat.key] = list;
    });
    return maybePurgeLog(log, defaultMiscLog);
  }

  function normalizeDailyFoundLog(raw) {
    var log = defaultDailyFoundLog();
    if (!raw || typeof raw !== "object") return log;
    log.retainUntil = raw.retainUntil != null ? String(raw.retainUntil) : "";
    if (Array.isArray(raw.entries)) {
      raw.entries.forEach(function (item) {
        var n = normalizeOrderEntry(item);
        if (n) log.entries.push(n);
      });
    }
    return maybePurgeLog(log, defaultDailyFoundLog);
  }

  function loadStorage() {
    return global.HKStorage ? global.HKStorage.load() : {};
  }

  function saveStorage(patch) {
    if (!global.HKStorage) return;
    var data = loadStorage();
    Object.keys(patch).forEach(function (k) {
      data[k] = patch[k];
    });
    global.HKStorage.save(data);
  }

  function loadMiscLog() {
    return normalizeMiscLog(loadStorage().facilityMiscLog);
  }

  function loadDailyFoundLog() {
    return normalizeDailyFoundLog(loadStorage().facilityDailyFoundLog);
  }

  function saveMiscLog(log) {
    saveStorage({ facilityMiscLog: normalizeMiscLog(log) });
    if (uiHooks.onMiscLogChanged) uiHooks.onMiscLogChanged();
  }

  function saveDailyFoundLog(log) {
    saveStorage({ facilityDailyFoundLog: normalizeDailyFoundLog(log) });
    if (uiHooks.onDailyLogChanged) uiHooks.onDailyLogChanged();
  }

  function logContentSignature(log) {
    var copy = JSON.parse(JSON.stringify(log || {}));
    delete copy.retainUntil;
    return JSON.stringify(copy);
  }

  function getMiscSignature() {
    return logContentSignature(normalizeMiscLog(loadMiscLog()));
  }

  function getDailySignature() {
    return logContentSignature(normalizeDailyFoundLog(loadDailyFoundLog()));
  }

  function getOperatorName() {
    if (uiHooks.getOperatorName) return uiHooks.getOperatorName();
    try {
      return String(global.sessionStorage.getItem(OPERATOR_NAME_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function newEntryId() {
    return "fl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatAt(iso) {
    if (uiHooks.formatAt) return uiHooks.formatAt(iso);
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function formatRoom(room) {
    if (uiHooks.formatRoomNoDisplay) return uiHooks.formatRoomNoDisplay(String(room || ""));
    return String(room || "—");
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function exportFilenameBase(kind) {
    var d = new Date();
    return (
      kind +
      "_" +
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      "_" +
      pad2(d.getHours()) +
      pad2(d.getMinutes())
    );
  }

  function orderToExportRow(entry, categoryLabel) {
    return [
      formatAt(entry.at),
      entry.room || "",
      categoryLabel || "",
      entry.memo || (entry.memoImage ? "(사진)" : ""),
      entry.by || "",
      getEntryPhase(entry) === "completed" ? "완료" : getEntryPhase(entry) === "accepted" ? "접수" : "알림",
      entry.completedAt ? formatAt(entry.completedAt) : "",
      entry.completedBy || "",
    ];
  }

  function collectMiscExportRows(log) {
    var rows = [];
    MISC_CATEGORIES.forEach(function (cat) {
      (log.entries[cat.key] || []).forEach(function (entry) {
        rows.push(orderToExportRow(entry, cat.label));
      });
    });
    rows.sort(function (a, b) {
      return new Date(a[0] || 0).getTime() - new Date(b[0] || 0).getTime();
    });
    return rows;
  }

  function orderToDailyExportRow(entry) {
    return [
      formatAt(entry.at),
      entry.room || "",
      entry.memo || (entry.memoImage ? "(사진)" : ""),
      entry.by || "",
      getEntryPhase(entry) === "completed" ? "완료" : getEntryPhase(entry) === "accepted" ? "접수" : "알림",
      entry.completedAt ? formatAt(entry.completedAt) : "",
      entry.completedBy || "",
    ];
  }

  function collectDailyExportRows(log) {
    return (log.entries || [])
      .map(function (entry) {
        return orderToDailyExportRow(entry);
      })
      .sort(function (a, b) {
        return new Date(a[0] || 0).getTime() - new Date(b[0] || 0).getTime();
      });
  }

  function exportCloseDayMiscRows(raw) {
    return collectMiscExportRows(normalizeMiscLog(raw));
  }

  function exportCloseDayDailyRows(raw) {
    return collectDailyExportRows(normalizeDailyFoundLog(raw));
  }

  function countMiscEntries(raw) {
    var log = normalizeMiscLog(raw);
    var n = 0;
    MISC_CATEGORIES.forEach(function (cat) {
      n += (log.entries[cat.key] || []).length;
    });
    return n;
  }

  function countDailyEntries(raw) {
    return (normalizeDailyFoundLog(raw).entries || []).length;
  }

  function buildExportTableHtml(rows, headers) {
    var head =
      "<tr>" +
      headers.map(function (h) {
        return "<th>" + escHtml(h) + "</th>";
      }).join("") +
      "</tr>";
    var body = rows
      .map(function (row) {
        return (
          "<tr>" +
          row
            .map(function (cell) {
              return "<td>" + escHtml(cell) + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    return '<table border="1" cellpadding="6" cellspacing="0">' + head + body + "</table>";
  }

  var EXPORT_HEADERS = ["접수시각", "객실", "구분", "내용", "접수자", "상태", "완료시각", "완료자"];
  var EXPORT_HEADERS_DAILY = ["접수시각", "객실", "내용", "접수자", "상태", "완료시각", "완료자"];

  function downloadMiscHtml(log) {
    var rows = collectMiscExportRows(log);
    var html =
      '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>컴플레인·지난습득물·세탁</title></head><body><h1>컴플레인·지난습득물·세탁</h1><p>보내기: ' +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      buildExportTableHtml(rows, EXPORT_HEADERS) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_컴플레인습득세탁") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadMiscExcel(log) {
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" +
      buildExportTableHtml(collectMiscExportRows(log), EXPORT_HEADERS) +
      "</body></html>";
    downloadBlob(
      exportFilenameBase("시설_컴플레인습득세탁") + ".xls",
      new Blob(["\ufeff", sheet], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  }

  function downloadDailyHtml(log) {
    var rows = collectDailyExportRows(log);
    var dailyHeaders = ["접수시각", "객실", "내용", "접수자", "상태", "완료시각", "완료자"];
    var html =
      '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>당일습득물</title></head><body><h1>당일습득물</h1><p>보내기: ' +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      buildExportTableHtml(rows, dailyHeaders) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_당일습득물") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadDailyExcel(log) {
    var dailyHeaders = ["접수시각", "객실", "내용", "접수자", "상태", "완료시각", "완료자"];
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" +
      buildExportTableHtml(collectDailyExportRows(log), dailyHeaders) +
      "</body></html>";
    downloadBlob(
      exportFilenameBase("시설_당일습득물") + ".xls",
      new Blob(["\ufeff", sheet], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  }

  function prepareForAdminCloseDay(data) {
    var misc = normalizeMiscLog(data && data.facilityMiscLog);
    var daily = normalizeDailyFoundLog(data && data.facilityDailyFoundLog);
    var until = new Date(Date.now() + RETENTION_MS).toISOString();
    misc.retainUntil = until;
    daily.retainUntil = until;
    return {
      facilityMiscLog: misc,
      facilityDailyFoundLog: daily,
    };
  }

  function findEntryInList(list, entryId) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === entryId) return list[i];
    }
    return null;
  }

  function createMiscOrder(room, memo, image) {
    var log = loadMiscLog();
    if (!log.entries[activeMiscCategory]) log.entries[activeMiscCategory] = [];
    var name = getOperatorName();
    var now = new Date().toISOString();
    log.entries[activeMiscCategory].push({
      id: newEntryId(),
      at: now,
      room: String(room || "").trim(),
      memo: String(memo || "").trim(),
      memoImage: image || "",
      by: name,
      phase: "alert",
      acceptedAt: "",
      acceptedBy: "",
      completedAt: "",
      completedBy: "",
    });
    saveMiscLog(log);
    renderMiscPanels();
    scrollFacilityLogAlertIntoView("facilityMiscFeedbackList", log.entries[activeMiscCategory]);
  }

  function createDailyOrder(room, memo, image) {
    var log = loadDailyFoundLog();
    var name = getOperatorName();
    var now = new Date().toISOString();
    log.entries.push({
      id: newEntryId(),
      at: now,
      room: String(room || "").trim(),
      memo: String(memo || "").trim(),
      memoImage: image || "",
      by: name,
      phase: "alert",
      acceptedAt: "",
      acceptedBy: "",
      completedAt: "",
      completedBy: "",
    });
    saveDailyFoundLog(log);
    renderDailyPanels();
    scrollFacilityLogAlertIntoView("facilityDailyFoundFeedbackList", log.entries);
  }

  function acceptMiscEntry(entryId) {
    var log = loadMiscLog();
    var entry = null;
    var list = null;
    MISC_CATEGORIES.forEach(function (cat) {
      if (entry) return;
      var items = log.entries[cat.key] || [];
      var found = findEntryInList(items, entryId);
      if (found) {
        entry = found;
        list = items;
        activeMiscCategory = cat.key;
      }
    });
    if (!entry || getEntryPhase(entry) !== "alert") return;
    entry.phase = "accepted";
    entry.acceptedAt = new Date().toISOString();
    entry.acceptedBy = getOperatorName();
    saveMiscLog(log);
    renderMiscPanels();
    scrollFacilityLogAcceptedIntoView("facilityMiscAcceptedList", entryId);
  }

  function acceptDailyEntry(entryId) {
    var log = loadDailyFoundLog();
    var entry = findEntryInList(log.entries, entryId);
    if (!entry || getEntryPhase(entry) !== "alert") return;
    entry.phase = "accepted";
    entry.acceptedAt = new Date().toISOString();
    entry.acceptedBy = getOperatorName();
    saveDailyFoundLog(log);
    renderDailyPanels();
    scrollFacilityLogAcceptedIntoView("facilityDailyFoundAcceptedList", entryId);
  }

  function completeMiscEntry(entryId) {
    var log = loadMiscLog();
    var entry = null;
    MISC_CATEGORIES.forEach(function (cat) {
      if (entry) return;
      var found = findEntryInList(log.entries[cat.key] || [], entryId);
      if (found) {
        entry = found;
        activeMiscCategory = cat.key;
      }
    });
    if (!entry || getEntryPhase(entry) === "completed") return;
    if (getEntryPhase(entry) !== "accepted") return;
    entry.phase = "completed";
    entry.completedAt = new Date().toISOString();
    entry.completedBy = getOperatorName();
    saveMiscLog(log);
    renderMiscPanels();
    scrollFacilityLogCompletedIntoView("facilityMiscCompletedList", entryId);
  }

  function completeDailyEntry(entryId) {
    var log = loadDailyFoundLog();
    var entry = findEntryInList(log.entries, entryId);
    if (!entry || getEntryPhase(entry) === "completed") return;
    if (getEntryPhase(entry) !== "accepted") return;
    entry.phase = "completed";
    entry.completedAt = new Date().toISOString();
    entry.completedBy = getOperatorName();
    saveDailyFoundLog(log);
    renderDailyPanels();
    scrollFacilityLogCompletedIntoView("facilityDailyFoundCompletedList", entryId);
  }

  function scrollFacilityLogItemIntoView(listId, entryId) {
    if (!entryId) return;
    requestAnimationFrame(function () {
      var card = document.querySelector(
        "#" + listId + ' .order-work-item[data-entry-id="' + entryId + '"]'
      );
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function scrollFacilityLogAlertIntoView(listId, entries) {
    var last = (entries || []).filter(function (e) {
      return getEntryPhase(e) === "alert";
    }).pop();
    if (!last || !last.id) return;
    requestAnimationFrame(function () {
      var card = document.querySelector(
        "#" + listId + ' .order-feedback__item[data-entry-id="' + last.id + '"]'
      );
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function scrollFacilityLogAcceptedIntoView(listId, entryId) {
    scrollFacilityLogItemIntoView(listId, entryId);
  }

  function scrollFacilityLogCompletedIntoView(listId, entryId) {
    scrollFacilityLogItemIntoView(listId, entryId);
  }

  function appendTimeLine(parent, label, iso) {
    if (!iso) return;
    var timeEl = document.createElement("div");
    timeEl.className = "request-feedback__item-time";
    if (uiHooks.setLineWithEmTime) {
      uiHooks.setLineWithEmTime(timeEl, label + " ", formatAt(iso));
    } else {
      timeEl.textContent = label + " " + formatAt(iso);
    }
    parent.appendChild(timeEl);
  }

  function appendOrderBody(li, entry) {
    var row = document.createElement("div");
    row.className = "request-feedback__item-row";
    var r = document.createElement("span");
    r.className = "request-feedback__item-room";
    r.textContent = entry.room ? formatRoom(entry.room) : "—";
    row.appendChild(r);
    li.appendChild(row);

    var memoStr = entry.memo != null ? String(entry.memo).trim() : "";
    if (memoStr) {
      var memEl = document.createElement("div");
      memEl.className = "order-feedback__item-memo";
      memEl.textContent = memoStr;
      li.appendChild(memEl);
    }
    if (uiHooks.hkAppendImageEl) {
      uiHooks.hkAppendImageEl(li, entry.memoImage);
    }
  }

  function appendAlertCard(li, entry, categoryLabel) {
    if (categoryLabel) {
      var tag = document.createElement("div");
      tag.className = "facility-log__alert-tag";
      tag.textContent = categoryLabel;
      li.appendChild(tag);
    }
    appendTimeLine(li, "등록", entry.at);
    appendOrderBody(li, entry);
    var byName = entry.by != null ? String(entry.by).trim() : "";
    if (byName) {
      var byEl = document.createElement("div");
      byEl.className = "order-feedback__item-by";
      byEl.textContent = "등록: " + byName;
      li.appendChild(byEl);
    }
    var acts = document.createElement("div");
    acts.className = "order-feedback__maint-actions";
    var acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "order-feedback__accept-btn facility-log__accept-btn";
    acceptBtn.setAttribute("data-entry-id", entry.id || "");
    acceptBtn.textContent = "접수";
    acts.appendChild(acceptBtn);
    li.appendChild(acts);
  }

  function appendOrderCard(li, entry, isCompleted) {
    appendTimeLine(li, "등록", entry.at);
    if (!isCompleted) {
      appendTimeLine(li, "접수", entry.acceptedAt);
    }
    appendOrderBody(li, entry);

    var regBy = entry.by != null ? String(entry.by).trim() : "";
    if (regBy) {
      var regEl = document.createElement("div");
      regEl.className = "order-feedback__item-by";
      regEl.textContent = "등록: " + regBy;
      li.appendChild(regEl);
    }
    var acceptBy = entry.acceptedBy != null ? String(entry.acceptedBy).trim() : "";
    if (acceptBy && !isCompleted) {
      var accEl = document.createElement("div");
      accEl.className = "order-feedback__item-by";
      accEl.textContent = "접수: " + acceptBy;
      li.appendChild(accEl);
    }

    if (isCompleted) {
      li.classList.add("order-work-item--deployed");
      appendTimeLine(li, "접수", entry.acceptedAt || entry.at);
      if (acceptBy) {
        var accDoneEl = document.createElement("div");
        accDoneEl.className = "order-feedback__item-by";
        accDoneEl.textContent = "접수: " + acceptBy;
        li.appendChild(accDoneEl);
      }
      appendTimeLine(li, "완료", entry.completedAt);
      var doneBy = entry.completedBy != null ? String(entry.completedBy).trim() : "";
      if (doneBy) {
        var doneByEl = document.createElement("div");
        doneByEl.className = "order-feedback__item-by";
        doneByEl.textContent = "완료: " + doneBy;
        li.appendChild(doneByEl);
      }
      return;
    }

    var acts = document.createElement("div");
    acts.className = "order-work__actions order-work__actions--toggle";
    var completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "order-work__wan-btn facility-log__complete-btn";
    completeBtn.setAttribute("data-entry-id", entry.id || "");
    completeBtn.textContent = "완료";
    completeBtn.setAttribute("aria-label", "완료 처리");
    acts.appendChild(completeBtn);
    li.appendChild(acts);
  }

  function renderAlertFeedbackList(listId, emptyId, entries, categoryLabel) {
    var list = document.getElementById(listId);
    var empty = emptyId ? document.getElementById(emptyId) : null;
    if (!list) return;
    list.innerHTML = "";
    var alerts = (entries || [])
      .filter(function (e) {
        return getEntryPhase(e) === "alert";
      })
      .sort(function (a, b) {
        return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
      });
    alerts.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-feedback__item facility-log__alert-item";
      li.setAttribute("data-entry-id", entry.id || "");
      appendAlertCard(li, entry, categoryLabel);
      list.appendChild(li);
    });
    if (empty) empty.hidden = alerts.length > 0;
  }

  function renderOrderWorkLists(acceptedListEl, acceptedEmptyEl, completedListEl, completedEmptyEl, entries) {
    if (!acceptedListEl || !completedListEl) return;
    acceptedListEl.innerHTML = "";
    completedListEl.innerHTML = "";

    var accepted = (entries || []).filter(function (e) {
      return getEntryPhase(e) === "accepted";
    });
    var completed = (entries || []).filter(function (e) {
      return getEntryPhase(e) === "completed";
    });

    accepted.sort(function (a, b) {
      return new Date(a.acceptedAt || a.at || 0).getTime() - new Date(b.acceptedAt || b.at || 0).getTime();
    });
    completed.sort(function (a, b) {
      return new Date(b.completedAt || b.at || 0).getTime() - new Date(a.completedAt || a.at || 0).getTime();
    });

    accepted.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item";
      li.setAttribute("data-entry-id", entry.id || "");
      appendOrderCard(li, entry, false);
      acceptedListEl.appendChild(li);
    });

    completed.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item order-work-item--deployed";
      li.setAttribute("data-entry-id", entry.id || "");
      appendOrderCard(li, entry, true);
      completedListEl.appendChild(li);
    });

    if (acceptedEmptyEl) acceptedEmptyEl.hidden = accepted.length > 0;
    if (completedEmptyEl) completedEmptyEl.hidden = completed.length > 0;
  }

  function countPhases(list) {
    var alertN = 0;
    var acceptedN = 0;
    var completedN = 0;
    (list || []).forEach(function (e) {
      var p = getEntryPhase(e);
      if (p === "alert") alertN++;
      else if (p === "accepted") acceptedN++;
      else if (p === "completed") completedN++;
    });
    return { alert: alertN, accepted: acceptedN, completed: completedN };
  }

  function miscStatusText(log) {
    var parts = MISC_CATEGORIES.map(function (c) {
      var counts = countPhases(log.entries[c.key] || []);
      return (
        c.label +
        " 알림" +
        counts.alert +
        "·접수" +
        counts.accepted +
        "·완료" +
        counts.completed
      );
    });
    var base = parts.join(" · ");
    if (log.retainUntil) {
      return base + " · 관리자 마감 후 " + formatAt(log.retainUntil) + "까지 보관";
    }
    return base;
  }

  function dailyStatusText(log) {
    var counts = countPhases(log.entries || []);
    var base =
      "알림 " + counts.alert + " · 접수 " + counts.accepted + " · 완료 " + counts.completed;
    if (log.retainUntil) {
      return base + " · 관리자 마감 후 " + formatAt(log.retainUntil) + "까지 보관";
    }
    return base;
  }

  function renderMiscAlertPanel() {
    var log = loadMiscLog();
    var alerts = [];
    MISC_CATEGORIES.forEach(function (cat) {
      (log.entries[cat.key] || []).forEach(function (entry) {
        if (getEntryPhase(entry) === "alert") {
          alerts.push({ entry: entry, categoryLabel: cat.label });
        }
      });
    });
    alerts.sort(function (a, b) {
      return new Date(a.entry.at || 0).getTime() - new Date(b.entry.at || 0).getTime();
    });
    var list = document.getElementById("facilityMiscFeedbackList");
    var empty = document.getElementById("facilityMiscFeedbackEmpty");
    if (!list) return;
    list.innerHTML = "";
    alerts.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "order-feedback__item facility-log__alert-item";
      li.setAttribute("data-entry-id", row.entry.id || "");
      appendAlertCard(li, row.entry, row.categoryLabel);
      list.appendChild(li);
    });
    if (empty) empty.hidden = alerts.length > 0;
  }

  function renderDailyAlertPanel() {
    var log = loadDailyFoundLog();
    renderAlertFeedbackList(
      "facilityDailyFoundFeedbackList",
      "facilityDailyFoundFeedbackEmpty",
      log.entries
    );
  }

  function renderMiscPanels() {
    renderMiscAlertPanel();
    renderMiscPanel();
  }

  function renderDailyPanels() {
    renderDailyAlertPanel();
    renderDailyPanel();
  }

  function renderMiscPanel() {
    var panel = document.getElementById("facilityMiscPanel");
    if (!panel || panel.hidden) return;
    var log = loadMiscLog();
    var statusEl = document.getElementById("facilityMiscStatus");
    if (statusEl) statusEl.textContent = miscStatusText(log);
    document.querySelectorAll("#facilityMiscTabs .facility-log-tab").forEach(function (btn) {
      var key = btn.getAttribute("data-category");
      btn.classList.toggle("is-active", key === activeMiscCategory);
      btn.setAttribute("aria-selected", key === activeMiscCategory ? "true" : "false");
    });
    renderOrderWorkLists(
      document.getElementById("facilityMiscAcceptedList"),
      document.getElementById("facilityMiscAcceptedEmpty"),
      document.getElementById("facilityMiscCompletedList"),
      document.getElementById("facilityMiscCompletedEmpty"),
      log.entries[activeMiscCategory] || []
    );
  }

  function renderDailyPanel() {
    var panel = document.getElementById("facilityDailyFoundPanel");
    if (!panel || panel.hidden) return;
    var log = loadDailyFoundLog();
    var statusEl = document.getElementById("facilityDailyFoundStatus");
    if (statusEl) statusEl.textContent = dailyStatusText(log);
    renderOrderWorkLists(
      document.getElementById("facilityDailyFoundAcceptedList"),
      document.getElementById("facilityDailyFoundAcceptedEmpty"),
      document.getElementById("facilityDailyFoundCompletedList"),
      document.getElementById("facilityDailyFoundCompletedEmpty"),
      log.entries
    );
  }

  function bindPanelCompleteActions(panelId, onComplete) {
    var panel = document.getElementById(panelId);
    if (!panel || panel.dataset.completeBound) return;
    panel.dataset.completeBound = "1";
    panel.addEventListener("click", function (e) {
      var btn = e.target.closest(".facility-log__complete-btn");
      if (!btn) return;
      var entryId = btn.getAttribute("data-entry-id");
      if (!entryId) return;
      var run = function () {
        onComplete(entryId);
      };
      if (!getOperatorName() && uiHooks.showOperatorGate) {
        uiHooks.showOperatorGate({ mode: "initial", onSaved: run });
        return;
      }
      run();
    });
  }

  function bindAlertAcceptActions(feedbackId, onAccept) {
    var panel = document.getElementById(feedbackId);
    if (!panel || panel.dataset.acceptBound) return;
    panel.dataset.acceptBound = "1";
    panel.addEventListener("click", function (e) {
      var btn = e.target.closest(".facility-log__accept-btn");
      if (!btn) return;
      var entryId = btn.getAttribute("data-entry-id");
      if (!entryId) return;
      var run = function () {
        onAccept(entryId);
      };
      if (!getOperatorName() && uiHooks.showOperatorGate) {
        uiHooks.showOperatorGate({ mode: "initial", onSaved: run });
        return;
      }
      run();
    });
  }

  function bindForms() {
    bindPanelCompleteActions("facilityMiscPanel", completeMiscEntry);
    bindPanelCompleteActions("facilityDailyFoundPanel", completeDailyEntry);
    bindAlertAcceptActions("facilityMiscFeedback", acceptMiscEntry);
    bindAlertAcceptActions("facilityDailyFoundFeedback", acceptDailyEntry);

    var miscForm = document.getElementById("facilityMiscForm");
    if (miscForm && !miscForm.dataset.bound) {
      miscForm.dataset.bound = "1";
      miscForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var roomEl = document.getElementById("facilityMiscRoom");
        var memoEl = document.getElementById("facilityMiscMemo");
        var room = roomEl ? String(roomEl.value || "").trim() : "";
        var memo = memoEl ? String(memoEl.value || "").trim() : "";
        var image = uiHooks.hkGetPhoto ? uiHooks.hkGetPhoto("facilityMiscOrderMemo") : "";
        if (!room) {
          if (roomEl) roomEl.focus();
          return;
        }
        if (!memo && !image) {
          if (memoEl) memoEl.focus();
          return;
        }
        var send = function () {
          createMiscOrder(room, memo, image);
          if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto("facilityMiscOrderMemo");
          if (roomEl) roomEl.value = "";
          if (memoEl) memoEl.value = "";
          if (memoEl) memoEl.focus();
        };
        if (!getOperatorName() && uiHooks.showOperatorGate) {
          uiHooks.showOperatorGate({ mode: "initial", onSaved: send });
          return;
        }
        send();
      });
    }

    var dailyForm = document.getElementById("facilityDailyFoundForm");
    if (dailyForm && !dailyForm.dataset.bound) {
      dailyForm.dataset.bound = "1";
      dailyForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var roomEl = document.getElementById("facilityDailyFoundRoom");
        var memoEl = document.getElementById("facilityDailyFoundMemo");
        var room = roomEl ? String(roomEl.value || "").trim() : "";
        var memo = memoEl ? String(memoEl.value || "").trim() : "";
        var image = uiHooks.hkGetPhoto ? uiHooks.hkGetPhoto("facilityDailyFoundOrderMemo") : "";
        if (!room) {
          if (roomEl) roomEl.focus();
          return;
        }
        if (!memo && !image) {
          if (memoEl) memoEl.focus();
          return;
        }
        var send = function () {
          createDailyOrder(room, memo, image);
          if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto("facilityDailyFoundOrderMemo");
          if (roomEl) roomEl.value = "";
          if (memoEl) memoEl.value = "";
          if (memoEl) memoEl.focus();
        };
        if (!getOperatorName() && uiHooks.showOperatorGate) {
          uiHooks.showOperatorGate({ mode: "initial", onSaved: send });
          return;
        }
        send();
      });
    }

    document.querySelectorAll("#facilityMiscTabs .facility-log-tab").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        activeMiscCategory = btn.getAttribute("data-category") || "complaint";
        renderMiscPanels();
      });
    });

    var miscHtml = document.getElementById("btnFacilityMiscExportHtml");
    if (miscHtml && !miscHtml.dataset.bound) {
      miscHtml.dataset.bound = "1";
      miscHtml.addEventListener("click", function () {
        downloadMiscHtml(loadMiscLog());
      });
    }
    var miscXls = document.getElementById("btnFacilityMiscExportExcel");
    if (miscXls && !miscXls.dataset.bound) {
      miscXls.dataset.bound = "1";
      miscXls.addEventListener("click", function () {
        downloadMiscExcel(loadMiscLog());
      });
    }

    var dailyHtml = document.getElementById("btnFacilityDailyFoundExportHtml");
    if (dailyHtml && !dailyHtml.dataset.bound) {
      dailyHtml.dataset.bound = "1";
      dailyHtml.addEventListener("click", function () {
        downloadDailyHtml(loadDailyFoundLog());
      });
    }
    var dailyXls = document.getElementById("btnFacilityDailyFoundExportExcel");
    if (dailyXls && !dailyXls.dataset.bound) {
      dailyXls.dataset.bound = "1";
      dailyXls.addEventListener("click", function () {
        downloadDailyExcel(loadDailyFoundLog());
      });
    }
  }

  function onViewActivated(view) {
    activeView = view || "";
    bindForms();
    if (view === "facilityMisc") renderMiscPanels();
    if (view === "facilityDailyFound") renderDailyPanels();
  }

  function refreshFromRemote() {
    if (activeView === "facilityMisc") renderMiscPanels();
    if (activeView === "facilityDailyFound") renderDailyPanels();
  }

  function init(hooks) {
    uiHooks = hooks || {};
    bindForms();
    saveMiscLog(loadMiscLog());
    saveDailyFoundLog(loadDailyFoundLog());
  }

  global.HKFacilityLogs = {
    init: init,
    onViewActivated: onViewActivated,
    refreshFromRemote: refreshFromRemote,
    prepareForAdminCloseDay: prepareForAdminCloseDay,
    getMiscSignature: getMiscSignature,
    getDailySignature: getDailySignature,
    exportCloseDayMiscRows: exportCloseDayMiscRows,
    exportCloseDayDailyRows: exportCloseDayDailyRows,
    countMiscEntries: countMiscEntries,
    countDailyEntries: countDailyEntries,
    MISC_CATEGORIES: MISC_CATEGORIES,
  };
})(typeof window !== "undefined" ? window : this);
