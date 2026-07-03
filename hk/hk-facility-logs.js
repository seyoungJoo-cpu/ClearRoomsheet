/**
 * 시설 관리 하위 업무 로그 — 컴플레인·지난습득물·세탁 / 당일습득물
 * 마감 시 HTML·엑셀 저장, 데이터는 10일간 유지 후 자동 초기화
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

  function defaultMiscLog() {
    return {
      closedAt: "",
      entries: { complaint: [], pastFound: [], laundry: [] },
    };
  }

  function defaultDailyFoundLog() {
    return { closedAt: "", entries: [] };
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = raw.id != null ? String(raw.id).trim() : "";
    if (!id) return null;
    return {
      id: id,
      at: raw.at != null ? String(raw.at) : "",
      room: raw.room != null ? String(raw.room).trim() : "",
      memo: raw.memo != null ? String(raw.memo).trim() : "",
      by: raw.by != null ? String(raw.by).trim() : "",
    };
  }

  function normalizeMiscLog(raw) {
    var log = defaultMiscLog();
    if (!raw || typeof raw !== "object") return log;
    log.closedAt = raw.closedAt != null ? String(raw.closedAt) : "";
    var src = raw.entries && typeof raw.entries === "object" ? raw.entries : {};
    MISC_CATEGORIES.forEach(function (cat) {
      var list = [];
      if (Array.isArray(src[cat.key])) {
        src[cat.key].forEach(function (item) {
          var n = normalizeEntry(item);
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
    log.closedAt = raw.closedAt != null ? String(raw.closedAt) : "";
    if (Array.isArray(raw.entries)) {
      raw.entries.forEach(function (item) {
        var n = normalizeEntry(item);
        if (n) log.entries.push(n);
      });
    }
    return maybePurgeLog(log, defaultDailyFoundLog);
  }

  function isExpired(closedAt) {
    if (!closedAt) return false;
    var t = new Date(closedAt).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t > RETENTION_MS;
  }

  function maybePurgeLog(log, factory) {
    if (log && log.closedAt && isExpired(log.closedAt)) return factory();
    return log;
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
    var data = loadStorage();
    return normalizeMiscLog(data.facilityMiscLog);
  }

  function loadDailyFoundLog() {
    var data = loadStorage();
    return normalizeDailyFoundLog(data.facilityDailyFoundLog);
  }

  function saveMiscLog(log) {
    saveStorage({ facilityMiscLog: normalizeMiscLog(log) });
  }

  function saveDailyFoundLog(log) {
    saveStorage({ facilityDailyFoundLog: normalizeDailyFoundLog(log) });
  }

  function getOperatorName() {
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

  function buildRowsHtml(rows, includeCategory) {
    var head =
      "<tr><th>접수시각</th><th>객실</th>" +
      (includeCategory ? "<th>구분</th>" : "") +
      "<th>내용</th><th>작성</th></tr>";
    var body = rows
      .map(function (r) {
        return (
          "<tr><td>" +
          escHtml(formatAt(r.at)) +
          "</td><td>" +
          escHtml(r.room || "—") +
          "</td>" +
          (includeCategory ? "<td>" + escHtml(r.categoryLabel || "") + "</td>" : "") +
          "<td>" +
          escHtml(r.memo || "") +
          "</td><td>" +
          escHtml(r.by || "") +
          "</td></tr>"
        );
      })
      .join("");
    return "<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\">" + head + body + "</table>";
  }

  function collectMiscRows(log) {
    var rows = [];
    MISC_CATEGORIES.forEach(function (cat) {
      (log.entries[cat.key] || []).forEach(function (entry) {
        rows.push({
          at: entry.at,
          room: entry.room,
          memo: entry.memo,
          by: entry.by,
          categoryLabel: cat.label,
        });
      });
    });
    rows.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    return rows;
  }

  function downloadMiscHtml(log) {
    var rows = collectMiscRows(log);
    var title = "시설 업무 — 컴플레인·지난습득물·세탁";
    var html =
      "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"/><title>" +
      escHtml(title) +
      "</title></head><body><h1>" +
      escHtml(title) +
      "</h1><p>보내기: " +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      (log.closedAt ? "<p>마감: " + escHtml(formatAt(log.closedAt)) + "</p>" : "") +
      buildRowsHtml(rows, true) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_컴플레인습득세탁") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadMiscExcel(log) {
    var rows = collectMiscRows(log);
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" + buildRowsHtml(rows, true) + "</body></html>";
    downloadBlob(
      exportFilenameBase("시설_컴플레인습득세탁") + ".xls",
      new Blob(["\ufeff", sheet], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  }

  function downloadDailyHtml(log) {
    var rows = (log.entries || []).slice().sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    var title = "시설 업무 — 당일습득물";
    var html =
      "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"/><title>" +
      escHtml(title) +
      "</title></head><body><h1>" +
      escHtml(title) +
      "</h1><p>보내기: " +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      (log.closedAt ? "<p>마감: " + escHtml(formatAt(log.closedAt)) + "</p>" : "") +
      buildRowsHtml(rows, false) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_당일습득물") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadDailyExcel(log) {
    var rows = (log.entries || []).slice().sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" + buildRowsHtml(rows, false) + "</body></html>";
    downloadBlob(
      exportFilenameBase("시설_당일습득물") + ".xls",
      new Blob(["\ufeff", sheet], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  }

  function closeMiscLog() {
    var log = loadMiscLog();
    log.closedAt = new Date().toISOString();
    saveMiscLog(log);
    downloadMiscHtml(log);
    setTimeout(function () {
      downloadMiscExcel(log);
    }, 350);
    renderMiscPanel();
    toast("마감 완료 · HTML·엑셀 저장됨 (10일 후 자동 초기화)");
  }

  function closeDailyFoundLog() {
    var log = loadDailyFoundLog();
    log.closedAt = new Date().toISOString();
    saveDailyFoundLog(log);
    downloadDailyHtml(log);
    setTimeout(function () {
      downloadDailyExcel(log);
    }, 350);
    renderDailyPanel();
    toast("마감 완료 · HTML·엑셀 저장됨 (10일 후 자동 초기화)");
  }

  function toast(msg) {
    if (typeof global.alert === "function") global.alert(msg);
  }

  function renderEntryList(listEl, entries, onDelete) {
    if (!listEl) return;
    listEl.innerHTML = "";
    var sorted = (entries || []).slice().sort(function (a, b) {
      return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
    });
    if (!sorted.length) {
      var empty = document.createElement("li");
      empty.className = "facility-log-empty";
      empty.textContent = "등록된 내용이 없습니다.";
      listEl.appendChild(empty);
      return;
    }
    sorted.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "facility-log-item";
      var head = document.createElement("div");
      head.className = "facility-log-item__head";
      var room = document.createElement("span");
      room.className = "facility-log-item__room";
      room.textContent = entry.room ? entry.room : "—";
      var time = document.createElement("span");
      time.className = "facility-log-item__time";
      time.textContent = formatAt(entry.at);
      head.appendChild(room);
      head.appendChild(time);
      li.appendChild(head);
      if (entry.memo) {
        var memo = document.createElement("p");
        memo.className = "facility-log-item__memo";
        memo.textContent = entry.memo;
        li.appendChild(memo);
      }
      if (entry.by) {
        var by = document.createElement("div");
        by.className = "facility-log-item__by";
        by.textContent = entry.by;
        li.appendChild(by);
      }
      if (onDelete) {
        var del = document.createElement("button");
        del.type = "button";
        del.className = "facility-log-item__del";
        del.textContent = "삭제";
        del.setAttribute("data-entry-id", entry.id);
        del.addEventListener("click", function () {
          onDelete(entry.id);
        });
        li.appendChild(del);
      }
      listEl.appendChild(li);
    });
  }

  function renderMiscPanel() {
    var panel = document.getElementById("facilityMiscPanel");
    if (!panel || panel.hidden) return;
    var log = loadMiscLog();
    var statusEl = document.getElementById("facilityMiscStatus");
    if (statusEl) {
      if (log.closedAt) {
        statusEl.textContent =
          "마감 " +
          formatAt(log.closedAt) +
          " · 10일 후 자동 초기화 (" +
          MISC_CATEGORIES.map(function (c) {
            return c.label + " " + (log.entries[c.key] || []).length;
          }).join(" · ") +
          ")";
      } else {
        statusEl.textContent = MISC_CATEGORIES.map(function (c) {
          return c.label + " " + (log.entries[c.key] || []).length;
        }).join(" · ");
      }
    }
    document.querySelectorAll("#facilityMiscTabs .facility-log-tab").forEach(function (btn) {
      var key = btn.getAttribute("data-category");
      btn.classList.toggle("is-active", key === activeMiscCategory);
      btn.setAttribute("aria-selected", key === activeMiscCategory ? "true" : "false");
    });
    var listEl = document.getElementById("facilityMiscList");
    renderEntryList(listEl, log.entries[activeMiscCategory] || [], function (entryId) {
      var next = loadMiscLog();
      next.entries[activeMiscCategory] = (next.entries[activeMiscCategory] || []).filter(function (e) {
        return e.id !== entryId;
      });
      saveMiscLog(next);
      renderMiscPanel();
    });
  }

  function renderDailyPanel() {
    var panel = document.getElementById("facilityDailyFoundPanel");
    if (!panel || panel.hidden) return;
    var log = loadDailyFoundLog();
    var statusEl = document.getElementById("facilityDailyFoundStatus");
    if (statusEl) {
      statusEl.textContent = log.closedAt
        ? "마감 " + formatAt(log.closedAt) + " · 10일 후 자동 초기화 (" + log.entries.length + "건)"
        : "등록 " + log.entries.length + "건";
    }
    renderEntryList(document.getElementById("facilityDailyFoundList"), log.entries, function (entryId) {
      var next = loadDailyFoundLog();
      next.entries = next.entries.filter(function (e) {
        return e.id !== entryId;
      });
      saveDailyFoundLog(next);
      renderDailyPanel();
    });
  }

  function addMiscEntry(room, memo) {
    var log = loadMiscLog();
    if (!log.entries[activeMiscCategory]) log.entries[activeMiscCategory] = [];
    log.entries[activeMiscCategory].push({
      id: newEntryId(),
      at: new Date().toISOString(),
      room: room,
      memo: memo,
      by: getOperatorName(),
    });
    saveMiscLog(log);
    renderMiscPanel();
  }

  function addDailyEntry(room, memo) {
    var log = loadDailyFoundLog();
    log.entries.push({
      id: newEntryId(),
      at: new Date().toISOString(),
      room: room,
      memo: memo,
      by: getOperatorName(),
    });
    saveDailyFoundLog(log);
    renderDailyPanel();
  }

  function bindForms() {
    var miscForm = document.getElementById("facilityMiscForm");
    if (miscForm && !miscForm.dataset.bound) {
      miscForm.dataset.bound = "1";
      miscForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var roomEl = document.getElementById("facilityMiscRoom");
        var memoEl = document.getElementById("facilityMiscMemo");
        var room = roomEl ? String(roomEl.value || "").trim() : "";
        var memo = memoEl ? String(memoEl.value || "").trim() : "";
        if (!memo) {
          if (memoEl) memoEl.focus();
          return;
        }
        addMiscEntry(room, memo);
        if (roomEl) roomEl.value = "";
        if (memoEl) memoEl.value = "";
        if (memoEl) memoEl.focus();
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
        if (!memo) {
          if (memoEl) memoEl.focus();
          return;
        }
        addDailyEntry(room, memo);
        if (roomEl) roomEl.value = "";
        if (memoEl) memoEl.value = "";
        if (memoEl) memoEl.focus();
      });
    }

    document.querySelectorAll("#facilityMiscTabs .facility-log-tab").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        activeMiscCategory = btn.getAttribute("data-category") || "complaint";
        renderMiscPanel();
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
    var miscClose = document.getElementById("btnFacilityMiscClose");
    if (miscClose && !miscClose.dataset.bound) {
      miscClose.dataset.bound = "1";
      miscClose.addEventListener("click", function () {
        if (
          !global.confirm(
            "마감하시겠습니까?\n\n· HTML·엑셀 파일로 저장\n· 화면 데이터는 10일간 유지 후 자동 초기화"
          )
        ) {
          return;
        }
        closeMiscLog();
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
    var dailyClose = document.getElementById("btnFacilityDailyFoundClose");
    if (dailyClose && !dailyClose.dataset.bound) {
      dailyClose.dataset.bound = "1";
      dailyClose.addEventListener("click", function () {
        if (
          !global.confirm(
            "마감하시겠습니까?\n\n· HTML·엑셀 파일로 저장\n· 화면 데이터는 10일간 유지 후 자동 초기화"
          )
        ) {
          return;
        }
        closeDailyFoundLog();
      });
    }
  }

  function onViewActivated(view) {
    activeView = view || "";
    bindForms();
    if (view === "facilityMisc") renderMiscPanel();
    if (view === "facilityDailyFound") renderDailyPanel();
  }

  function refreshFromRemote() {
    if (activeView === "facilityMisc") renderMiscPanel();
    if (activeView === "facilityDailyFound") renderDailyPanel();
  }

  function init() {
    bindForms();
    saveMiscLog(loadMiscLog());
    saveDailyFoundLog(loadDailyFoundLog());
  }

  global.HKFacilityLogs = {
    init: init,
    onViewActivated: onViewActivated,
    refreshFromRemote: refreshFromRemote,
    MISC_CATEGORIES: MISC_CATEGORIES,
  };
})(typeof window !== "undefined" ? window : this);
