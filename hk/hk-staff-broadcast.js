/**
 * 관리자 알럿 · 투표 — 프론트 모드 팝업
 */
(function (global) {
  var DISMISS_LS = "hk-staff-broadcast-dismiss-v1";
  var SESSION_AT_LS = "hk-staff-broadcast-session-at";
  var frontCtx = null;
  var adminCtx = null;
  var showingId = "";
  var pollDraftItems = [];
  var tickTimer = null;

  function pad2(n) {
    return String(n).padStart ? String(n).padStart(2, "0") : (n < 10 ? "0" + n : String(n));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function todayKey() {
    if (global.HKStorage && typeof global.HKStorage.formatDateKey === "function") {
      return global.HKStorage.formatDateKey(new Date());
    }
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function dateKeyFromIso(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    if (global.HKStorage && typeof global.HKStorage.formatDateKey === "function") {
      return global.HKStorage.formatDateKey(d);
    }
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return (
      pad2(d.getMonth() + 1) +
      "." +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function fireAtOf(row) {
    if (!row) return "";
    return row.scheduledAt || row.createdAt || "";
  }

  function isScheduledPending(row) {
    if (!row || row.kind === "poll") return false;
    var iso = row.scheduledAt;
    if (!iso) return false;
    var t = new Date(iso).getTime();
    return isFinite(t) && t > Date.now() + 400;
  }

  function alertReady(row) {
    if (!row) return false;
    var iso = fireAtOf(row);
    if (!iso) return true;
    var t = new Date(iso).getTime();
    if (!isFinite(t) || t <= 0) return true;
    return Date.now() + 400 >= t;
  }

  function newId(prefix) {
    return prefix + Date.now() + "-" + Math.floor(Math.random() * 1e9);
  }

  function getPack() {
    var data = global.HKStorage ? global.HKStorage.load() : null;
    if (global.HKStorage && typeof global.HKStorage.normalizeStaffBroadcasts === "function") {
      return global.HKStorage.normalizeStaffBroadcasts(data && data.staffBroadcasts);
    }
    return (data && data.staffBroadcasts) || { alerts: [], polls: [], deletedIds: {}, updatedAt: "" };
  }

  function savePack(pack, thenToast) {
    if (!global.HKStorage) return;
    var data = global.HKStorage.load();
    pack.updatedAt = nowIso();
    if (typeof global.HKStorage.normalizeStaffBroadcasts === "function") {
      pack = global.HKStorage.normalizeStaffBroadcasts(pack);
    }
    data.staffBroadcasts = pack;
    global.HKStorage.save(data, { skipSync: true });
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
    if (thenToast && adminCtx && adminCtx.toast) adminCtx.toast(thenToast);
  }

  function ensureSessionStarted() {
    try {
      var v = sessionStorage.getItem(SESSION_AT_LS);
      if (v) return v;
      v = nowIso();
      sessionStorage.setItem(SESSION_AT_LS, v);
      return v;
    } catch (e) {
      return nowIso();
    }
  }

  function wasOpenAt(iso) {
    var started = ensureSessionStarted();
    var t0 = new Date(started).getTime();
    var t1 = new Date(iso || 0).getTime();
    if (!isFinite(t0) || !isFinite(t1) || t1 <= 0) return false;
    return t0 <= t1 + 2000;
  }

  function localDismissed() {
    try {
      var raw = sessionStorage.getItem(DISMISS_LS);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function markLocalDismiss(id) {
    var map = localDismissed();
    map[id] = nowIso();
    try {
      sessionStorage.setItem(DISMISS_LS, JSON.stringify(map));
    } catch (e) {}
  }

  function isFront() {
    return !!(frontCtx && typeof frontCtx.isFrontMode === "function" && frontCtx.isFrontMode());
  }

  function operatorName() {
    if (frontCtx && typeof frontCtx.getOperatorName === "function") {
      return String(frontCtx.getOperatorName() || "").trim();
    }
    return "";
  }

  function adminName() {
    if (adminCtx && typeof adminCtx.getAuthorName === "function") {
      return String(adminCtx.getAuthorName() || "").trim() || "관리자";
    }
    return "관리자";
  }

  function isActiveToday(row) {
    if (!row) return false;
    if (isScheduledPending(row)) return true;
    var day = row.dayKey || "";
    if (day && day !== todayKey()) return false;
    return true;
  }

  function pollInWindow(poll, t) {
    t = t || Date.now();
    var s = poll.startsAt ? new Date(poll.startsAt).getTime() : 0;
    var e = poll.endsAt ? new Date(poll.endsAt).getTime() : 0;
    if (isFinite(s) && s > 0 && t + 1000 < s) return false;
    if (isFinite(e) && e > 0 && t > e) return false;
    return true;
  }

  function canSee(row) {
    if (!row || !isActiveToday(row)) return false;
    if (row.kind !== "poll" && !alertReady(row)) return false;
    if (localDismissed()[row.id]) return false;
    var name = operatorName();
    if (name && row.dismissedBy && row.dismissedBy[name]) return false;
    if (row.kind === "poll" && !pollInWindow(row)) return false;
    if (row.audience === "all") return true;
    return wasOpenAt(fireAtOf(row));
  }

  function pickNext() {
    var pack = getPack();
    var i;
    for (i = 0; i < (pack.alerts || []).length; i++) {
      if (canSee(pack.alerts[i])) return pack.alerts[i];
    }
    for (i = 0; i < (pack.polls || []).length; i++) {
      if (canSee(pack.polls[i])) return pack.polls[i];
    }
    return null;
  }

  function overlayEl() {
    return document.getElementById("hkStaffBroadcastOverlay");
  }

  function hideOverlay() {
    var el = overlayEl();
    if (el) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
    showingId = "";
  }

  function persistDismiss(row) {
    if (!row) return;
    markLocalDismiss(row.id);
    if (row.audience !== "all") return;
    var name = operatorName();
    if (!name) return;
    var pack = getPack();
    var list = row.kind === "poll" ? pack.polls : pack.alerts;
    (list || []).forEach(function (it) {
      if (it && it.id === row.id) {
        if (!it.dismissedBy) it.dismissedBy = {};
        it.dismissedBy[name] = nowIso();
      }
    });
    savePack(pack);
  }

  function voteCount(poll, itemId) {
    var arr = poll.votes && poll.votes[itemId];
    return Array.isArray(arr) ? arr.length : 0;
  }

  function hasVoted(poll, itemId, name) {
    var arr = poll.votes && poll.votes[itemId];
    return Array.isArray(arr) && arr.indexOf(name) >= 0;
  }

  function applyVote(pollId, itemId) {
    var name = operatorName();
    if (!name) return;
    var pack = getPack();
    var poll = null;
    (pack.polls || []).forEach(function (p) {
      if (p && p.id === pollId) poll = p;
    });
    if (!poll) return;
    if (!poll.votes) poll.votes = {};
    if (!poll.multi) {
      Object.keys(poll.votes).forEach(function (k) {
        poll.votes[k] = (poll.votes[k] || []).filter(function (n) {
          return n !== name;
        });
      });
    }
    var cur = poll.votes[itemId] ? poll.votes[itemId].slice() : [];
    var idx = cur.indexOf(name);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(name);
    poll.votes[itemId] = cur;
    savePack(pack);
    refreshFront();
  }

  function addPollItem(pollId, text) {
    var name = operatorName() || adminName();
    text = String(text || "").trim();
    if (!text) return false;
    var pack = getPack();
    var poll = null;
    (pack.polls || []).forEach(function (p) {
      if (p && p.id === pollId) poll = p;
    });
    if (!poll) return false;
    if (!poll.items) poll.items = [];
    var dup = poll.items.some(function (it) {
      return it && String(it.text).trim() === text;
    });
    if (dup) return false;
    poll.items.push({
      id: newId("it-"),
      text: text,
      addedBy: name,
      addedAt: nowIso(),
    });
    savePack(pack);
    return true;
  }

  function renderAlertCard(row, card) {
    card.innerHTML = "";
    var kicker = document.createElement("p");
    kicker.className = "hk-broadcast__kicker";
    kicker.textContent = "알럿";
    var body = document.createElement("p");
    body.className = "hk-broadcast__text";
    body.textContent = row.text;
    var hint = document.createElement("p");
    hint.className = "hk-broadcast__hint";
    hint.textContent = "클릭하면 닫힙니다";
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "hk-broadcast__ok";
    ok.textContent = "확인";
    card.appendChild(kicker);
    card.appendChild(body);
    card.appendChild(hint);
    card.appendChild(ok);
    function dismiss() {
      persistDismiss(row);
      hideOverlay();
      refreshFront();
    }
    ok.addEventListener("click", function (e) {
      e.stopPropagation();
      dismiss();
    });
    card.onclick = dismiss;
  }

  function renderPollCard(row, card) {
    card.innerHTML = "";
    card.onclick = function (e) {
      e.stopPropagation();
    };
    var kicker = document.createElement("p");
    kicker.className = "hk-broadcast__kicker";
    kicker.textContent = row.multi ? "투표 · 복수선택" : "투표 · 한 개만";
    var title = document.createElement("p");
    title.className = "hk-broadcast__title";
    title.textContent = row.title;
    card.appendChild(kicker);
    card.appendChild(title);
    if (row.endsAt) {
      var until = document.createElement("p");
      until.className = "hk-broadcast__hint";
      var ed = new Date(row.endsAt);
      until.textContent =
        "마감 " +
        pad2(ed.getMonth() + 1) +
        "." +
        pad2(ed.getDate()) +
        " " +
        pad2(ed.getHours()) +
        ":" +
        pad2(ed.getMinutes());
      card.appendChild(until);
    }
    var name = operatorName();
    var list = document.createElement("div");
    list.className = "hk-broadcast__options";
    (row.items || []).forEach(function (it) {
      if (!it) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hk-broadcast__option";
      if (name && hasVoted(row, it.id, name)) btn.classList.add("is-on");
      var lab = document.createElement("span");
      lab.textContent = it.text;
      var cnt = document.createElement("em");
      cnt.textContent = String(voteCount(row, it.id));
      btn.appendChild(lab);
      btn.appendChild(cnt);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        applyVote(row.id, it.id);
      });
      list.appendChild(btn);
    });
    card.appendChild(list);

    var addRow = document.createElement("div");
    addRow.className = "hk-broadcast__add";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.maxLength = 80;
    inp.placeholder = "항목 추가";
    inp.setAttribute("aria-label", "투표 항목 추가");
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "추가";
    function submitAdd() {
      if (addPollItem(row.id, inp.value)) {
        inp.value = "";
        refreshFront();
      }
    }
    addBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      submitAdd();
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitAdd();
      }
    });
    addRow.appendChild(inp);
    addRow.appendChild(addBtn);
    card.appendChild(addRow);

    var close = document.createElement("button");
    close.type = "button";
    close.className = "hk-broadcast__ok";
    close.textContent = "닫기";
    close.addEventListener("click", function (e) {
      e.stopPropagation();
      persistDismiss(row);
      hideOverlay();
      refreshFront();
    });
    card.appendChild(close);
  }

  function showRow(row) {
    var wrap = overlayEl();
    if (!wrap || !row) return;
    var card = wrap.querySelector(".hk-broadcast__card");
    var backdrop = wrap.querySelector(".hk-broadcast__backdrop");
    if (!card) return;
    showingId = row.id;
    if (row.kind === "poll") renderPollCard(row, card);
    else renderAlertCard(row, card);
    if (backdrop && !backdrop.__hkBound) {
      backdrop.__hkBound = true;
      backdrop.addEventListener("click", function () {
        var cur = pickNext();
        if (cur && cur.id === showingId) {
          persistDismiss(cur);
          hideOverlay();
          refreshFront();
        }
      });
    }
    wrap.hidden = false;
    wrap.setAttribute("aria-hidden", "false");
  }

  function refreshFront() {
    if (!isFront()) {
      hideOverlay();
      return;
    }
    ensureSessionStarted();
    var next = pickNext();
    if (!next) {
      hideOverlay();
      return;
    }
    if (showingId === next.id && overlayEl() && !overlayEl().hidden) {
      if (next.kind === "poll") {
        var card = overlayEl().querySelector(".hk-broadcast__card");
        var ae = document.activeElement;
        if (card && !(ae && card.contains(ae) && ae.tagName === "INPUT")) {
          renderPollCard(next, card);
        }
      }
      return;
    }
    showRow(next);
  }

  function toLocalInput(iso, endOfDay) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    if (endOfDay) d.setHours(23, 59, 0, 0);
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate()) +
      "T" +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function fromLocalInput(v) {
    if (!v) return "";
    var d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  function renderDraftItems() {
    var mount = document.getElementById("adminPollDraftItems");
    if (!mount) return;
    mount.innerHTML = "";
    pollDraftItems.forEach(function (text, idx) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "admin-broadcast-chip";
      chip.textContent = text + " ×";
      chip.title = "항목 삭제";
      chip.addEventListener("click", function () {
        pollDraftItems.splice(idx, 1);
        renderDraftItems();
      });
      mount.appendChild(chip);
    });
  }

  function renderAdminList() {
    var mount = document.getElementById("adminBroadcastList");
    if (!mount) return;
    var pack = getPack();
    mount.innerHTML = "";
    var rows = (pack.alerts || [])
      .map(function (a) {
        return a;
      })
      .concat(pack.polls || []);
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "admin-broadcast-empty";
      empty.textContent = "등록된 알럿·투표가 없습니다.";
      mount.appendChild(empty);
      return;
    }
    rows
      .slice()
      .sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      })
      .forEach(function (row) {
        var li = document.createElement("div");
        li.className = "admin-broadcast-row";
        var head = document.createElement("div");
        head.className = "admin-broadcast-row__head";
        var kind = row.kind === "poll" ? "투표" : "알럿";
        var live;
        if (row.kind === "poll") {
          live = pollInWindow(row) ? "진행중" : "마감";
        } else if (isScheduledPending(row)) {
          live = "예약 " + fmtWhen(row.scheduledAt);
        } else {
          live = isActiveToday(row) ? "활성" : "만료";
        }
        head.textContent =
          kind +
          " · " +
          (row.audience === "all" ? "ALL" : "온라인") +
          " · " +
          live;
        var title = document.createElement("p");
        title.className = "admin-broadcast-row__title";
        title.textContent = row.kind === "poll" ? row.title : row.text;
        li.appendChild(head);
        li.appendChild(title);
        if (row.kind === "poll") {
          var tally = document.createElement("ul");
          tally.className = "admin-broadcast-tally";
          (row.items || []).forEach(function (it) {
            if (!it) return;
            var item = document.createElement("li");
            item.textContent = it.text + " · " + voteCount(row, it.id) + "표";
            tally.appendChild(item);
          });
          li.appendChild(tally);
        }
        var actions = document.createElement("div");
        actions.className = "admin-broadcast-row__actions";
        if (row.kind === "poll" && pollInWindow(row)) {
          var endBtn = document.createElement("button");
          endBtn.type = "button";
          endBtn.className = "btn-secondary";
          endBtn.textContent = "지금 마감";
          endBtn.addEventListener("click", function () {
            var p = getPack();
            (p.polls || []).forEach(function (it) {
              if (it && it.id === row.id) it.endsAt = nowIso();
            });
            savePack(p, "투표를 마감했습니다.");
            renderAdminList();
          });
          actions.appendChild(endBtn);
        }
        var del = document.createElement("button");
        del.type = "button";
        del.className = "btn-secondary";
        del.textContent = "삭제";
        del.addEventListener("click", function () {
          var p = getPack();
          p.deletedIds = p.deletedIds || {};
          p.deletedIds[row.id] = nowIso();
          p.alerts = (p.alerts || []).filter(function (it) {
            return it && it.id !== row.id;
          });
          p.polls = (p.polls || []).filter(function (it) {
            return it && it.id !== row.id;
          });
          savePack(p, "삭제했습니다.");
          renderAdminList();
        });
        actions.appendChild(del);
        li.appendChild(actions);
        mount.appendChild(li);
      });
  }

  function bindAdmin() {
    var alertBtn = document.getElementById("btnAdminAlertSend");
    if (alertBtn && !alertBtn.__hkBound) {
      alertBtn.__hkBound = true;
      alertBtn.addEventListener("click", function () {
        var textEl = document.getElementById("adminAlertText");
        var text = textEl ? String(textEl.value || "").trim() : "";
        if (!text) {
          if (adminCtx && adminCtx.toast) adminCtx.toast("알럿 내용을 입력하세요.");
          return;
        }
        var audEl = document.querySelector('input[name="adminAlertAudience"]:checked');
        var whenEl = document.getElementById("adminAlertWhen");
        var scheduledAt = fromLocalInput(whenEl && whenEl.value);
        var createdAt = nowIso();
        if (scheduledAt) {
          var fireMs = new Date(scheduledAt).getTime();
          if (!isFinite(fireMs) || fireMs <= Date.now()) {
            scheduledAt = "";
          }
        }
        var fireAt = scheduledAt || createdAt;
        var pack = getPack();
        pack.alerts.push({
          id: newId("al-"),
          kind: "alert",
          text: text,
          audience: audEl && audEl.value === "all" ? "all" : "online",
          createdAt: createdAt,
          scheduledAt: scheduledAt,
          createdBy: adminName(),
          dayKey: dateKeyFromIso(fireAt),
          dismissedBy: {},
        });
        savePack(pack, scheduledAt ? "알럿을 예약했습니다." : "알럿을 보냈습니다.");
        if (textEl) textEl.value = "";
        if (whenEl) whenEl.value = "";
        renderAdminList();
      });
    }

    var addItemBtn = document.getElementById("btnAdminPollAddItem");
    var itemInput = document.getElementById("adminPollItemInput");
    if (addItemBtn && !addItemBtn.__hkBound) {
      addItemBtn.__hkBound = true;
      addItemBtn.addEventListener("click", function () {
        var t = itemInput ? String(itemInput.value || "").trim() : "";
        if (!t) return;
        if (pollDraftItems.indexOf(t) < 0) pollDraftItems.push(t);
        if (itemInput) itemInput.value = "";
        renderDraftItems();
      });
    }
    if (itemInput && !itemInput.__hkBound) {
      itemInput.__hkBound = true;
      itemInput.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (addItemBtn) addItemBtn.click();
      });
    }

    var pollBtn = document.getElementById("btnAdminPollSend");
    if (pollBtn && !pollBtn.__hkBound) {
      pollBtn.__hkBound = true;
      pollBtn.addEventListener("click", function () {
        var titleEl = document.getElementById("adminPollTitle");
        var title = titleEl ? String(titleEl.value || "").trim() : "";
        if (!title) {
          if (adminCtx && adminCtx.toast) adminCtx.toast("투표 제목을 입력하세요.");
          return;
        }
        var audEl = document.querySelector('input[name="adminPollAudience"]:checked');
        var startEl = document.getElementById("adminPollStart");
        var endEl = document.getElementById("adminPollEnd");
        var multiEl = document.getElementById("adminPollMulti");
        var startsAt = fromLocalInput(startEl && startEl.value) || nowIso();
        var endsAt = fromLocalInput(endEl && endEl.value);
        if (!endsAt) {
          var eod = new Date();
          eod.setHours(23, 59, 0, 0);
          endsAt = eod.toISOString();
        }
        var pack = getPack();
        pack.polls.push({
          id: newId("po-"),
          kind: "poll",
          title: title,
          audience: audEl && audEl.value === "all" ? "all" : "online",
          createdAt: nowIso(),
          createdBy: adminName(),
          dayKey: todayKey(),
          startsAt: startsAt,
          endsAt: endsAt,
          multi: !!(multiEl && multiEl.checked),
          items: pollDraftItems.map(function (text) {
            return {
              id: newId("it-"),
              text: text,
              addedBy: adminName(),
              addedAt: nowIso(),
            };
          }),
          votes: {},
          dismissedBy: {},
        });
        savePack(pack, "투표를 등록했습니다.");
        if (titleEl) titleEl.value = "";
        pollDraftItems = [];
        renderDraftItems();
        renderAdminList();
      });
    }

    var startEl = document.getElementById("adminPollStart");
    var endEl = document.getElementById("adminPollEnd");
    if (startEl && !startEl.value) startEl.value = toLocalInput(null, false);
    if (endEl && !endEl.value) endEl.value = toLocalInput(null, true);
    renderDraftItems();
    renderAdminList();
  }

  function ensureTick() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      if (frontCtx) refreshFront();
      if (adminCtx) renderAdminList();
    }, 4000);
  }

  global.HKStaffBroadcast = {
    initFront: function (ctx) {
      frontCtx = ctx || {};
      ensureSessionStarted();
      ensureTick();
      refreshFront();
    },
    initAdmin: function (ctx) {
      adminCtx = ctx || {};
      bindAdmin();
      ensureTick();
    },
    refresh: function () {
      refreshFront();
      if (adminCtx) renderAdminList();
    },
    renderAdminList: renderAdminList,
  };
})(typeof window !== "undefined" ? window : this);
