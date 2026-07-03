/**
 * 시설 관리 하위 업무 로그 — 컴플레인·지난습득물·세탁 / 당일습득물
 * 객실별 채팅 스레드. 관리자 전체 마감 후 10일간 유지 후 자동 초기화.
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

  function normalizeChatMsg(raw) {
    if (!raw || typeof raw !== "object") return null;
    var text = raw.text != null ? String(raw.text).trim() : "";
    var image = raw.image != null ? String(raw.image).trim() : "";
    if (!text && !image) return null;
    return {
      at: raw.at != null ? String(raw.at) : new Date().toISOString(),
      by: raw.by != null ? String(raw.by).trim() : "",
      text: text,
      image: image,
    };
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = raw.id != null ? String(raw.id).trim() : "";
    if (!id) return null;
    var chat = [];
    if (Array.isArray(raw.chat)) {
      raw.chat.forEach(function (m) {
        var n = normalizeChatMsg(m);
        if (n) chat.push(n);
      });
    }
    var legacyMemo = raw.memo != null ? String(raw.memo).trim() : "";
    if (!chat.length && legacyMemo) {
      chat.push({
        at: raw.at != null ? String(raw.at) : new Date().toISOString(),
        by: raw.by != null ? String(raw.by).trim() : "",
        text: legacyMemo,
        image: "",
      });
    }
    if (!chat.length) return null;
    return {
      id: id,
      at: chat[0].at,
      room: raw.room != null ? String(raw.room).trim() : "",
      by: raw.by != null ? String(raw.by).trim() : chat[0].by || "",
      chat: chat,
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
    log.retainUntil = raw.retainUntil != null ? String(raw.retainUntil) : "";
    if (Array.isArray(raw.entries)) {
      raw.entries.forEach(function (item) {
        var n = normalizeEntry(item);
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
  }

  function saveDailyFoundLog(log) {
    saveStorage({ facilityDailyFoundLog: normalizeDailyFoundLog(log) });
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

  function normalizeRoomKey(room) {
    var s = String(room || "").trim();
    var digits = s.replace(/\D/g, "");
    return digits || s;
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

  function flattenEntryRows(entries, categoryLabel) {
    var rows = [];
    (entries || []).forEach(function (entry) {
      (entry.chat || []).forEach(function (msg) {
        rows.push({
          at: msg.at,
          room: entry.room,
          memo: msg.text || (msg.image ? "(사진)" : ""),
          by: msg.by,
          categoryLabel: categoryLabel || "",
        });
      });
    });
    rows.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    return rows;
  }

  function buildRowsHtml(rows, includeCategory) {
    var head =
      "<tr><th>시각</th><th>객실</th>" +
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
      rows = rows.concat(flattenEntryRows(log.entries[cat.key] || [], cat.label));
    });
    rows.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    return rows;
  }

  function downloadMiscHtml(log) {
    var title = "컴플레인·지난습득물·세탁";
    var html =
      "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"/><title>" +
      escHtml(title) +
      "</title></head><body><h1>" +
      escHtml(title) +
      "</h1><p>보내기: " +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      buildRowsHtml(collectMiscRows(log), true) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_컴플레인습득세탁") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadMiscExcel(log) {
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" +
      buildRowsHtml(collectMiscRows(log), true) +
      "</body></html>";
    downloadBlob(
      exportFilenameBase("시설_컴플레인습득세탁") + ".xls",
      new Blob(["\ufeff", sheet], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  }

  function downloadDailyHtml(log) {
    var title = "당일습득물";
    var rows = flattenEntryRows(log.entries || [], "");
    var html =
      "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"UTF-8\"/><title>" +
      escHtml(title) +
      "</title></head><body><h1>" +
      escHtml(title) +
      "</h1><p>보내기: " +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      buildRowsHtml(rows, false) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_당일습득물") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadDailyExcel(log) {
    var rows = flattenEntryRows(log.entries || [], "");
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" + buildRowsHtml(rows, false) + "</body></html>";
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

  function findEntryIndex(entries, room) {
    var key = normalizeRoomKey(room);
    if (!key) return -1;
    for (var i = 0; i < (entries || []).length; i++) {
      if (normalizeRoomKey(entries[i].room) === key) return i;
    }
    return -1;
  }

  function appendChatToLog(getLog, saveLog, entriesKey, room, text, image) {
    var log = getLog();
    var list = entriesKey ? log.entries[entriesKey] : log.entries;
    if (!list) {
      if (entriesKey) log.entries[entriesKey] = [];
      list = entriesKey ? log.entries[entriesKey] : log.entries;
    }
    var msgText = String(text || "").trim();
    var msgImage = image != null ? String(image).trim() : "";
    if (!msgText && !msgImage) return;
    var name = getOperatorName();
    var msg = {
      at: new Date().toISOString(),
      by: name,
      text: msgText,
      image: msgImage,
    };
    var ix = findEntryIndex(list, room);
    if (ix >= 0) {
      if (!Array.isArray(list[ix].chat)) list[ix].chat = [];
      list[ix].chat.push(msg);
    } else {
      list.push({
        id: newEntryId(),
        at: msg.at,
        room: String(room || "").trim(),
        by: name,
        chat: [msg],
      });
    }
    saveLog(log);
  }

  function appendMiscChat(room, text, image) {
    appendChatToLog(loadMiscLog, saveMiscLog, activeMiscCategory, room, text, image);
    renderMiscPanel();
  }

  function appendDailyChat(room, text, image) {
    appendChatToLog(loadDailyFoundLog, saveDailyFoundLog, null, room, text, image);
    renderDailyPanel();
  }

  function appendRoomChatUi(li, entry, opts) {
    opts = opts || {};
    var chatWrap = document.createElement("div");
    chatWrap.className = "order-chat";

    var msgList = document.createElement("ul");
    msgList.className = "order-chat__messages";
    var chat = Array.isArray(entry.chat) ? entry.chat.slice() : [];
    chat.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    if (!chat.length) {
      var emptyMsg = document.createElement("li");
      emptyMsg.className = "order-chat__msg";
      emptyMsg.style.background = "#f8fafc";
      emptyMsg.textContent = "메시지가 없습니다. 아래에서 대화를 시작하세요.";
      msgList.appendChild(emptyMsg);
    } else {
      chat.forEach(function (msg) {
        var byName = msg.by != null ? String(msg.by).trim() || "—" : "—";
        var msgLi = document.createElement("li");
        msgLi.className = "order-chat__msg";
        if (uiHooks.applyChatBubbleAlign) uiHooks.applyChatBubbleAlign(msgLi, byName);
        var byEl = document.createElement("div");
        byEl.className = "order-chat__msg-by";
        byEl.textContent = byName;
        msgLi.appendChild(byEl);
        if (uiHooks.applyChatBubbleColors) {
          uiHooks.applyChatBubbleColors(msgLi, byName, byEl, "order-chat__msg-text");
        }
        if (uiHooks.hkAppendMessageContent) {
          uiHooks.hkAppendMessageContent(msgLi, msg.text, msg.image, "order-chat__msg-text");
        } else {
          var textEl = document.createElement("div");
          textEl.className = "order-chat__msg-text";
          textEl.textContent = msg.text || "";
          msgLi.appendChild(textEl);
        }
        if (msg.at) {
          var timeEl = document.createElement("div");
          timeEl.className = "order-chat__msg-time";
          timeEl.textContent = formatAt(msg.at);
          msgLi.appendChild(timeEl);
        }
        msgList.appendChild(msgLi);
      });
    }
    chatWrap.appendChild(msgList);

    var chatKey = opts.photoKey || "facilityLog:" + entry.id;
    var chatForm = document.createElement("form");
    chatForm.className = "order-chat__form hk-compose-row";
    chatForm.setAttribute("data-entry-id", entry.id || "");
    var chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.placeholder = "메시지 입력";
    chatInput.autocomplete = "off";
    chatInput.setAttribute("aria-label", opts.chatLabel || "객실 메모 채팅");
    chatForm.appendChild(chatInput);
    if (uiHooks.hkCreatePhotoButton) {
      chatForm.appendChild(uiHooks.hkCreatePhotoButton(chatKey));
    }
    if (uiHooks.hkBindPhotoPaste) {
      uiHooks.hkBindPhotoPaste(chatInput, chatKey, {
        autoSend: function (text, image) {
          opts.onSend(entry.id, text, image, chatKey);
        },
      });
    }
    var chatSend = document.createElement("button");
    chatSend.type = "submit";
    chatSend.className = "order-chat__send";
    chatSend.textContent = "전송";
    chatForm.appendChild(chatSend);
    chatWrap.appendChild(chatForm);
    if (uiHooks.hkCreatePhotoPreview) {
      chatWrap.appendChild(uiHooks.hkCreatePhotoPreview(chatKey));
    }

    chatForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var text = String(chatInput.value || "").trim();
      var image = uiHooks.hkGetPhoto ? uiHooks.hkGetPhoto(chatKey) : "";
      if (!text && !image) return;
      var send = function () {
        opts.onSend(entry.id, text, image, chatKey);
        chatInput.value = "";
      };
      if (!getOperatorName() && uiHooks.showOperatorGate) {
        uiHooks.showOperatorGate({ mode: "initial", onSaved: send });
        return;
      }
      send();
    });

    li.appendChild(chatWrap);
    requestAnimationFrame(function () {
      msgList.scrollTop = msgList.scrollHeight;
    });
  }

  function renderRoomThreadList(listEl, entries, opts) {
    if (!listEl) return;
    listEl.innerHTML = "";
    var sorted = (entries || []).slice().sort(function (a, b) {
      return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
    });
    if (!sorted.length) {
      var empty = document.createElement("li");
      empty.className = "facility-log-empty";
      empty.textContent = "등록된 객실이 없습니다. 아래에서 객실번호와 메시지를 입력하세요.";
      listEl.appendChild(empty);
      return;
    }
    sorted.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "facility-log-room";
      li.setAttribute("data-entry-id", entry.id);
      var head = document.createElement("div");
      head.className = "facility-log-room__head";
      var room = document.createElement("span");
      room.className = "facility-log-room__no";
      room.textContent = entry.room ? "객실 " + entry.room : "객실 —";
      head.appendChild(room);
      var meta = document.createElement("span");
      meta.className = "facility-log-room__meta";
      meta.textContent = formatAt(entry.at);
      head.appendChild(meta);
      if (opts.onDelete) {
        var del = document.createElement("button");
        del.type = "button";
        del.className = "facility-log-room__del";
        del.textContent = "삭제";
        del.addEventListener("click", function () {
          opts.onDelete(entry.id);
        });
        head.appendChild(del);
      }
      li.appendChild(head);
      appendRoomChatUi(li, entry, {
        photoKey: (opts.photoKeyPrefix || "facilityLog") + ":" + entry.id,
        chatLabel: opts.chatLabel,
        onSend: opts.onSend,
      });
      listEl.appendChild(li);
    });
  }

  function miscStatusText(log) {
    var parts = MISC_CATEGORIES.map(function (c) {
      return c.label + " " + (log.entries[c.key] || []).length + "객실";
    });
    if (log.retainUntil) {
      return parts.join(" · ") + " · 관리자 마감 후 " + formatAt(log.retainUntil) + "까지 보관";
    }
    return parts.join(" · ");
  }

  function dailyStatusText(log) {
    var base = "객실 " + (log.entries || []).length + "개";
    if (log.retainUntil) {
      return base + " · 관리자 마감 후 " + formatAt(log.retainUntil) + "까지 보관";
    }
    return base;
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
    renderRoomThreadList(document.getElementById("facilityMiscList"), log.entries[activeMiscCategory] || [], {
      photoKeyPrefix: "facilityMisc",
      chatLabel: "컴플레인·지난습득물·세탁 객실 메모",
      onSend: function (entryId, text, image, chatKey) {
        var cur = loadMiscLog();
        var list = cur.entries[activeMiscCategory] || [];
        var entry = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === entryId) {
            entry = list[i];
            break;
          }
        }
        if (!entry) return;
        if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto(chatKey);
        appendMiscChat(entry.room, text, image);
      },
      onDelete: function (entryId) {
        if (!global.confirm("이 객실 스레드를 삭제할까요?")) return;
        var next = loadMiscLog();
        next.entries[activeMiscCategory] = (next.entries[activeMiscCategory] || []).filter(function (e) {
          return e.id !== entryId;
        });
        saveMiscLog(next);
        renderMiscPanel();
      },
    });
  }

  function renderDailyPanel() {
    var panel = document.getElementById("facilityDailyFoundPanel");
    if (!panel || panel.hidden) return;
    var log = loadDailyFoundLog();
    var statusEl = document.getElementById("facilityDailyFoundStatus");
    if (statusEl) statusEl.textContent = dailyStatusText(log);
    renderRoomThreadList(document.getElementById("facilityDailyFoundList"), log.entries, {
      photoKeyPrefix: "facilityDaily",
      chatLabel: "당일습득물 객실 메모",
      onSend: function (entryId, text, image, chatKey) {
        var cur = loadDailyFoundLog();
        var entry = null;
        for (var i = 0; i < cur.entries.length; i++) {
          if (cur.entries[i].id === entryId) {
            entry = cur.entries[i];
            break;
          }
        }
        if (!entry) return;
        if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto(chatKey);
        appendDailyChat(entry.room, text, image);
      },
      onDelete: function (entryId) {
        if (!global.confirm("이 객실 스레드를 삭제할까요?")) return;
        var next = loadDailyFoundLog();
        next.entries = next.entries.filter(function (e) {
          return e.id !== entryId;
        });
        saveDailyFoundLog(next);
        renderDailyPanel();
      },
    });
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
        if (!room) {
          if (roomEl) roomEl.focus();
          return;
        }
        if (!memo) {
          if (memoEl) memoEl.focus();
          return;
        }
        var send = function () {
          appendMiscChat(room, memo, "");
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
        if (!room) {
          if (roomEl) roomEl.focus();
          return;
        }
        if (!memo) {
          if (memoEl) memoEl.focus();
          return;
        }
        var send = function () {
          appendDailyChat(room, memo, "");
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
    if (view === "facilityMisc") renderMiscPanel();
    if (view === "facilityDailyFound") renderDailyPanel();
  }

  function refreshFromRemote() {
    if (activeView === "facilityMisc") renderMiscPanel();
    if (activeView === "facilityDailyFound") renderDailyPanel();
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
    MISC_CATEGORIES: MISC_CATEGORIES,
  };
})(typeof window !== "undefined" ? window : this);
