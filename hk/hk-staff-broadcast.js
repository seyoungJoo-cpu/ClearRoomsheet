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
  var pollUi = { id: "", selected: {}, showCounts: false };
  var lastSeenOperatorName = "";
  var lastPresencePush = 0;
  var presenceWasOn = false;
  var syncChangeBound = false;
  var swMessageBound = false;
  var titleFlashTimer = null;
  var titleFlashOrig = "";
  var lastAttentionId = "";
  var lastKickHandled = "";
  var lastClaimReassert = 0;

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
    var local;
    if (global.HKStorage && typeof global.HKStorage.normalizeStaffBroadcasts === "function") {
      local = global.HKStorage.normalizeStaffBroadcasts(data && data.staffBroadcasts);
    } else {
      local =
        (data && data.staffBroadcasts) || {
          alerts: [],
          polls: [],
          directs: [],
          presence: {},
          deletedIds: {},
          updatedAt: "",
        };
    }
    try {
      var last =
        global.HKSync && typeof global.HKSync.getLastServerPayload === "function"
          ? global.HKSync.getLastServerPayload()
          : null;
      var remotePack = last && last.hkStorage && last.hkStorage.staffBroadcasts;
      if (remotePack && global.HKStorage && typeof global.HKStorage.mergeStaffBroadcasts === "function") {
        return global.HKStorage.mergeStaffBroadcasts(local, remotePack);
      }
    } catch (ePack) {}
    return local;
  }

  function savePackLocal(pack) {
    if (!global.HKStorage) return;
    var data = global.HKStorage.load();
    pack.updatedAt = nowIso();
    if (typeof global.HKStorage.normalizeStaffBroadcasts === "function") {
      pack = global.HKStorage.normalizeStaffBroadcasts(pack);
    }
    data.staffBroadcasts = pack;
    global.HKStorage.save(data, { skipSync: true });
  }

  function savePack(pack, thenToast) {
    savePackLocal(pack);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
    if (thenToast && adminCtx && adminCtx.toast) adminCtx.toast(thenToast);
  }

  function postPresence(opts) {
    if (global.HKSync && typeof global.HKSync.pushPresence === "function") {
      return global.HKSync.pushPresence(opts);
    }
    return Promise.resolve(false);
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

  function clearLocalDismiss() {
    try {
      sessionStorage.removeItem(DISMISS_LS);
    } catch (e) {}
  }

  function isFront() {
    return !!(frontCtx && typeof frontCtx.isFrontMode === "function" && frontCtx.isFrontMode());
  }

  function isPresenceMode() {
    if (!frontCtx) return false;
    if (typeof frontCtx.isFrontMode === "function" && frontCtx.isFrontMode()) return true;
    if (typeof frontCtx.isMaintenanceMode === "function" && frontCtx.isMaintenanceMode()) {
      return true;
    }
    return false;
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
    if (row.kind === "direct") {
      var created = row.createdAt ? new Date(row.createdAt).getTime() : 0;
      if (isFinite(created) && created > 0 && Date.now() - created > 36 * 3600 * 1000) {
        return false;
      }
      return true;
    }
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

  function hasOperatorVoted(poll, name) {
    if (!poll || !name || !poll.votes) return false;
    var keys = Object.keys(poll.votes);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (hasVoted(poll, keys[i], name)) return true;
    }
    return false;
  }

  function namesNorm(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function namesMatch(a, b) {
    var na = namesNorm(a);
    var nb = namesNorm(b);
    return !!(na && nb && na === nb);
  }

  function isDismissedByMe(row, name) {
    if (!row || !row.dismissedBy || !name) return false;
    if (row.dismissedBy[name]) return true;
    var keys = Object.keys(row.dismissedBy);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (namesMatch(keys[i], name)) return true;
    }
    return false;
  }

  function canSee(row) {
    if (!row || !isActiveToday(row)) return false;
    if (row.kind !== "poll" && !alertReady(row)) return false;
    if (row.kind === "poll" && !pollInWindow(row)) return false;
    var name = operatorName();
    if (row.kind === "poll") {
      if (name && hasOperatorVoted(row, name)) return false;
      if (localDismissed()[row.id]) return false;
    } else if (row.kind === "direct") {
      if (row.cancelled) return false;
      if (!name || !namesMatch(name, row.to)) return false;
      if (isDismissedByMe(row, name)) return false;
    } else {
      if (name && row.dismissedBy && row.dismissedBy[name]) return false;
      else if (!name && localDismissed()[row.id]) return false;
    }
    if (row.kind === "direct") return isFront();
    if (!isFront()) return false;
    if (row.audience === "all") return true;
    return wasOpenAt(fireAtOf(row));
  }

  function pickNext() {
    var pack = getPack();
    var i;
    for (i = 0; i < (pack.directs || []).length; i++) {
      if (canSee(pack.directs[i])) return pack.directs[i];
    }
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
    pollUi = { id: "", selected: {}, showCounts: false };
    stopTitleFlash();
  }

  function stopTitleFlash() {
    if (titleFlashTimer) {
      clearInterval(titleFlashTimer);
      titleFlashTimer = null;
    }
    if (titleFlashOrig) {
      try {
        document.title = titleFlashOrig;
      } catch (e) {}
      titleFlashOrig = "";
    }
  }

  function startTitleFlash(label) {
    stopTitleFlash();
    try {
      titleFlashOrig = document.title || "ClearRoomsheet";
    } catch (e) {
      titleFlashOrig = "ClearRoomsheet";
    }
    var on = true;
    try {
      document.title = label;
    } catch (e) {}
    titleFlashTimer = setInterval(function () {
      try {
        document.title = on ? titleFlashOrig : label;
      } catch (err) {}
      on = !on;
    }, 700);
  }

  function windowIsInForeground() {
    try {
      if (document.hidden) return false;
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function showDirectOsNotification(row) {
    if (!row || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    var from = row.from ? String(row.from) : "";
    var text = row.text ? String(row.text) : "1:1 알럿";
    var body = from ? from + " · " + text : text;
    if (body.length > 120) body = body.slice(0, 120) + "…";
    try {
      var n = new Notification("1:1 알럿", {
        body: body,
        tag: "hk-direct-" + String(row.id),
        renotify: true,
        requireInteraction: true,
        silent: true,
      });
      n.onclick = function () {
        try {
          window.focus();
        } catch (e) {}
        n.close();
      };
    } catch (e) {
      try {
        if (global.navigator && global.navigator.serviceWorker) {
          global.navigator.serviceWorker.ready.then(function (reg) {
            if (!reg || !reg.showNotification) return;
            return reg.showNotification("1:1 알럿", {
              body: body,
              tag: "hk-direct-" + String(row.id),
              renotify: true,
              requireInteraction: true,
              silent: true,
              data: { url: "/hk/front.html?from=direct", kind: "direct" },
            });
          });
        }
      } catch (err) {}
    }
  }

  function attentionForDirect(row) {
    if (!row || row.kind !== "direct" || !row.id) return;
    if (lastAttentionId === row.id) return;
    lastAttentionId = row.id;
    try {
      window.focus();
    } catch (e) {}
    startTitleFlash("【1:1 알럿】");
    if (!windowIsInForeground()) showDirectOsNotification(row);
  }

  function persistDismiss(row) {
    if (!row) return;
    markLocalDismiss(row.id);
    if (row.kind === "poll") return;
    var name = operatorName();
    if (!name) return;
    var pack = getPack();
    var list = row.kind === "direct" ? pack.directs : pack.alerts;
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

  function applyVoteSet(pollId, selectedIds) {
    var name = operatorName();
    if (!name) return false;
    var pack = getPack();
    var poll = null;
    (pack.polls || []).forEach(function (p) {
      if (p && p.id === pollId) poll = p;
    });
    if (!poll) return false;
    if (!poll.votes) poll.votes = {};
    var chosen = {};
    (selectedIds || []).forEach(function (id) {
      if (id) chosen[String(id)] = true;
    });
    Object.keys(poll.votes).forEach(function (k) {
      poll.votes[k] = (poll.votes[k] || []).filter(function (n) {
        return n !== name;
      });
    });
    Object.keys(chosen).forEach(function (itemId) {
      var cur = poll.votes[itemId] ? poll.votes[itemId].slice() : [];
      if (cur.indexOf(name) < 0) cur.push(name);
      poll.votes[itemId] = cur;
    });
    savePack(pack);
    return true;
  }

  function presenceSid() {
    try {
      var v = sessionStorage.getItem("hk-front-presence-sid");
      if (v) return v;
      v = "ps-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
      sessionStorage.setItem("hk-front-presence-sid", v);
      return v;
    } catch (e) {
      return "ps-tmp";
    }
  }

  function getOnlineFrontNames() {
    var pack = getPack();
    var seen = {};
    var names = [];
    var now = Date.now();
    var map = pack.presence || {};
    Object.keys(map).forEach(function (sid) {
      var row = map[sid];
      if (!row || !row.name) return;
      var t = new Date(row.at || 0).getTime();
      if (!isFinite(t) || now - t > 25000) return;
      var name = String(row.name).trim();
      if (!name || seen[name]) return;
      if (row.front !== true) return;
      seen[name] = true;
      names.push(name);
    });
    names.sort(function (a, b) {
      return a.localeCompare(b, "ko");
    });
    return names;
  }

  function pruneStalePresence(pack) {
    if (!pack || !pack.presence) return false;
    var now = Date.now();
    var changed = false;
    Object.keys(pack.presence).forEach(function (sid) {
      var row = pack.presence[sid];
      var t = row && row.at ? new Date(row.at).getTime() : 0;
      if (!isFinite(t) || now - t > 25000) {
        delete pack.presence[sid];
        changed = true;
      }
    });
    return changed;
  }

  function namesKey(s) {
    return namesNorm(s);
  }

  var CLAIM_AT_LS = "hk-front-presence-claim-at";
  var PENDING_CLAIM_LS = "hk-front-presence-pending-claim";

  function myClaimAt() {
    try {
      return sessionStorage.getItem(CLAIM_AT_LS) || "";
    } catch (e) {
      return "";
    }
  }

  function setMyClaimAt(iso) {
    try {
      if (iso) sessionStorage.setItem(CLAIM_AT_LS, iso);
      else sessionStorage.removeItem(CLAIM_AT_LS);
    } catch (e) {}
  }

  function markPendingNameClaim() {
    try {
      sessionStorage.setItem(PENDING_CLAIM_LS, "1");
    } catch (e) {}
  }

  function hasPendingNameClaim() {
    try {
      return sessionStorage.getItem(PENDING_CLAIM_LS) === "1";
    } catch (e) {
      return false;
    }
  }

  function consumePendingNameClaim() {
    try {
      sessionStorage.removeItem(PENDING_CLAIM_LS);
    } catch (e) {}
  }

  function wasKickedForMyName() {
    var name = operatorName();
    if (!name) return false;
    var pack = getPack();
    var kicks = pack.presenceKicks || {};
    var kick = kicks[namesKey(name)];
    if (!kick || !kick.sid) return false;
    if (kick.sid === presenceSid()) return false;
    var kickAt = new Date(kick.at || 0).getTime();
    if (!isFinite(kickAt) || Date.now() - kickAt > 12 * 3600 * 1000) return false;
    var mine = new Date(myClaimAt() || 0).getTime();
    if (isFinite(mine) && mine > 0 && kickAt < mine) return false;
    return true;
  }

  function presenceFrontFlag() {
    return isFront();
  }

  function claimNameAndKickOthers() {
    var name = operatorName();
    if (!name) return;
    consumePendingNameClaim();
    var now = nowIso();
    setMyClaimAt(now);
    lastKickHandled = "";
    lastClaimReassert = Date.now();
    var pack = getPack();
    if (!pack.presenceKicks) pack.presenceKicks = {};
    pack.presenceKicks[namesKey(name)] = { sid: presenceSid(), at: now };
    savePackLocal(pack);
    postPresence({
      sid: presenceSid(),
      name: name,
      at: now,
      kick: true,
      claim: true,
      claimAt: now,
      front: presenceFrontFlag(),
    });
  }

  function markExplicitNameClaim() {
    markPendingNameClaim();
    claimNameAndKickOthers();
  }

  function takePendingNameClaim() {
    if (!hasPendingNameClaim()) return false;
    if (!operatorName()) return false;
    claimNameAndKickOthers();
    return true;
  }

  function reassertExistingClaim(force) {
    var name = operatorName();
    var at = myClaimAt();
    if (!name || !at) return;
    if (wasKickedForMyName()) return;
    var now = Date.now();
    if (!force && lastClaimReassert && now - lastClaimReassert < 8000) return;
    lastClaimReassert = now;
    postPresence({
      sid: presenceSid(),
      name: name,
      at: nowIso(),
      kick: true,
      claimAt: at,
      front: presenceFrontFlag(),
    });
  }

  function handleDuplicateLoginIfNeeded() {
    if (!wasKickedForMyName()) return false;
    dropPresence();
    var packKick = getPack();
    var kn = namesKey(operatorName());
    var kickRow = packKick.presenceKicks && packKick.presenceKicks[kn];
    var kickKey = kn + ":" + (kickRow && kickRow.sid ? kickRow.sid : "");
    if (
      kickKey &&
      lastKickHandled !== kickKey &&
      frontCtx &&
      typeof frontCtx.onDuplicateLogin === "function"
    ) {
      lastKickHandled = kickKey;
      frontCtx.onDuplicateLogin();
    }
    return true;
  }

  function touchPresence(force) {
    if (!isPresenceMode()) {
      if (presenceWasOn) dropPresence();
      return;
    }
    var name = operatorName();
    if (!name) return;
    if (wasKickedForMyName()) return;
    var now = Date.now();
    if (!force && lastPresencePush && now - lastPresencePush < 4000) return;
    var pack = getPack();
    pruneStalePresence(pack);
    if (!pack.presence) pack.presence = {};
    var nowIsoStr = nowIso();
    pack.presence[presenceSid()] = {
      name: name,
      at: nowIsoStr,
      front: presenceFrontFlag(),
    };
    lastPresencePush = now;
    presenceWasOn = true;
    savePackLocal(pack);
    postPresence({
      sid: presenceSid(),
      name: name,
      at: nowIsoStr,
      kick: false,
      front: presenceFrontFlag(),
    });
  }

  function dropPresence() {
    var pack = getPack();
    if (pack.presence && pack.presence[presenceSid()]) {
      delete pack.presence[presenceSid()];
      savePackLocal(pack);
    }
    presenceWasOn = false;
    lastPresencePush = 0;
    postPresence({ sid: presenceSid(), leave: true });
  }

  function sendDirectAlerts(from, text, tos, image, opts) {
    from = String(from || "").trim();
    image = image != null ? String(image).trim() : "";
    text = String(text || "").trim() || (image ? "(사진)" : "");
    if (!from) return [];
    var seen = {};
    var ids = [];
    var pack = getPack();
    if (!pack.directs) pack.directs = [];
    var online = getOnlineFrontNames().slice();
    if (opts && opts.allowSelf && from && online.indexOf(from) < 0) online.push(from);
    var targets = [];
    (tos || []).forEach(function (toRaw) {
      var token = String(toRaw || "").trim();
      if (!token) return;
      if (namesNorm(token) === "all") {
        online.forEach(function (n) {
          if (n && !namesMatch(n, from)) targets.push(n);
        });
        return;
      }
      targets.push(token);
    });
    (targets || []).forEach(function (toRaw) {
      var to = resolveMentionName(toRaw, online);
      if (!to || seen[namesNorm(to)]) return;
      if (namesMatch(to, from) && !(opts && opts.allowSelf)) return;
      seen[namesNorm(to)] = true;
      var id = newId("dm-");
      pack.directs.push({
        id: id,
        kind: "direct",
        text: text,
        image: image,
        to: to,
        from: from,
        createdAt: nowIso(),
        dayKey: todayKey(),
        scheduledAt: opts && opts.scheduledAt ? String(opts.scheduledAt) : "",
        cancelled: false,
        cancelledAt: "",
        replyTo: opts && opts.replyTo ? String(opts.replyTo) : "",
        dismissedBy: {},
      });
      ids.push(id);
    });
    if (ids.length) savePack(pack);
    return ids;
  }

  function resolveMentionName(raw, onlineNames) {
    var token = String(raw || "").trim();
    if (!token) return "";
    var names = Array.isArray(onlineNames) ? onlineNames : [];
    var i;
    for (i = 0; i < names.length; i++) {
      if (namesMatch(names[i], token)) return String(names[i]).trim();
    }
    var best = "";
    for (i = 0; i < names.length; i++) {
      var n = String(names[i] || "").trim();
      if (!n) continue;
      if (token.indexOf(n) === 0 && n.length > best.length) best = n;
    }
    return best || token;
  }

  function cancelDirects(ids) {
    if (!ids || !ids.length) return false;
    var want = {};
    ids.forEach(function (id) {
      if (id) want[String(id)] = true;
    });
    var pack = getPack();
    var changed = false;
    (pack.directs || []).forEach(function (it) {
      if (it && want[it.id] && !it.cancelled) {
        it.cancelled = true;
        it.cancelledAt = nowIso();
        changed = true;
      }
    });
    if (changed) savePack(pack);
    return changed;
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
    kicker.textContent = row.kind === "direct" ? "1:1 알럿" : "알럿";
    var body = document.createElement("p");
    body.className = "hk-broadcast__text";
    body.textContent = row.text;
    var hint = document.createElement("p");
    hint.className = "hk-broadcast__hint";
    hint.textContent = "확인을 눌러 닫습니다";
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "hk-broadcast__ok";
    ok.textContent = "확인";
    card.appendChild(kicker);
    var onlyPhoto = !!(row.image && String(row.text || "").trim() === "(사진)");
    if (!onlyPhoto) {
      card.appendChild(body);
    }
    if (row.image) {
      var img = document.createElement("img");
      img.className = "hk-broadcast-image";
      img.src = row.image;
      img.alt = "첨부 사진";
      img.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        var lightbox = document.getElementById("hkImageLightbox");
        var lightboxImg = document.getElementById("hkImageLightboxImg");
        if (!lightbox || !lightboxImg) return;
        lightboxImg.src = row.image;
        lightbox.hidden = false;
        lightbox.setAttribute("aria-hidden", "false");
        document.body.classList.add("hk-image-lightbox-open");
      });
      card.appendChild(img);
    }
    var fromName = String(row.from || row.createdBy || "").trim();
    if (fromName) {
      var fromEl = document.createElement("p");
      fromEl.className = "hk-broadcast__from";
      fromEl.textContent = fromName;
      card.appendChild(fromEl);
    }
    function dismiss() {
      persistDismiss(row);
      hideOverlay();
      refreshFront();
    }
    ok.addEventListener("click", function (e) {
      e.stopPropagation();
      dismiss();
    });
    card.onclick = function (e) {
      e.stopPropagation();
    };
    if (row.kind === "direct" && fromName && !namesMatch(fromName, operatorName())) {
      var replyWrap = document.createElement("div");
      replyWrap.className = "hk-broadcast__reply";
      var replyInp = document.createElement("input");
      replyInp.type = "text";
      replyInp.className = "hk-broadcast__reply-input";
      replyInp.maxLength = 200;
      replyInp.placeholder = fromName + "에게 답장";
      replyInp.setAttribute("aria-label", "1:1 알럿 답장");
      var replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "hk-broadcast__reply-send";
      replyBtn.textContent = "답장";
      function sendReply() {
        var me = operatorName();
        var replyText = String(replyInp.value || "").trim();
        if (!me || !replyText) {
          if (replyInp) replyInp.focus();
          return;
        }
        sendDirectAlerts(me, replyText, [fromName], "", { replyTo: row.id });
        persistDismiss(row);
        hideOverlay();
        refreshFront();
      }
      replyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        sendReply();
      });
      replyInp.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          sendReply();
        }
      });
      replyInp.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      replyWrap.appendChild(replyInp);
      replyWrap.appendChild(replyBtn);
      card.appendChild(replyWrap);
    }
    card.appendChild(hint);
    card.appendChild(ok);
  }

  function renderPollCard(row, card) {
    if (pollUi.id !== row.id) {
      pollUi = { id: row.id, selected: {}, showCounts: false };
    }
    card.innerHTML = "";
    card.classList.toggle("is-poll-tallied", !!pollUi.showCounts);
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
      var picked = pollUi.showCounts
        ? !!(name && hasVoted(row, it.id, name))
        : !!pollUi.selected[it.id];
      if (picked) btn.classList.add("is-on");
      var lab = document.createElement("span");
      lab.textContent = it.text;
      btn.appendChild(lab);
      var cnt = document.createElement("em");
      cnt.textContent = String(voteCount(row, it.id));
      btn.appendChild(cnt);
      if (!pollUi.showCounts) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (row.multi) {
            if (pollUi.selected[it.id]) delete pollUi.selected[it.id];
            else pollUi.selected[it.id] = true;
          } else {
            pollUi.selected = {};
            pollUi.selected[it.id] = true;
          }
          renderPollCard(row, card);
        });
      }
      list.appendChild(btn);
    });
    card.appendChild(list);

    if (!pollUi.showCounts) {
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
    }

    function dismissPoll() {
      persistDismiss(row);
      hideOverlay();
      refreshFront();
    }

    var actions = document.createElement("div");
    actions.className = "hk-broadcast__actions";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "hk-broadcast__ok";
    close.textContent = "닫기";
    close.addEventListener("click", function (e) {
      e.stopPropagation();
      dismissPoll();
    });
    actions.appendChild(close);
    if (!pollUi.showCounts) {
      var voteBtn = document.createElement("button");
      voteBtn.type = "button";
      voteBtn.className = "hk-broadcast__vote";
      voteBtn.textContent = "투표하기";
      voteBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var pickedIds = Object.keys(pollUi.selected);
        if (pickedIds.length) applyVoteSet(row.id, pickedIds);
        pollUi.showCounts = true;
        refreshFront();
      });
      actions.appendChild(voteBtn);
    }
    card.appendChild(actions);
  }

  function showRow(row) {
    var wrap = overlayEl();
    if (!wrap || !row) return;
    var card = wrap.querySelector(".hk-broadcast__card");
    var backdrop = wrap.querySelector(".hk-broadcast__backdrop");
    if (!card) return;
    showingId = row.id;
    if (row.kind === "poll") {
      if (pollUi.id !== row.id) {
        pollUi = { id: row.id, selected: {}, showCounts: false };
      }
      renderPollCard(row, card);
    } else renderAlertCard(row, card);
    if (backdrop && !backdrop.__hkBound) {
      backdrop.__hkBound = true;
      backdrop.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
    }
    wrap.hidden = false;
    wrap.setAttribute("aria-hidden", "false");
    if (row.kind === "direct") attentionForDirect(row);
  }

  function noteOperatorChange() {
    var name = operatorName();
    if (lastSeenOperatorName && name && lastSeenOperatorName !== name) {
      clearLocalDismiss();
      pollUi = { id: "", selected: {}, showCounts: false };
      showingId = "";
      lastAttentionId = "";
    }
    if (name) lastSeenOperatorName = name;
  }

  function onFrontEnabled() {
    clearLocalDismiss();
    pollUi = { id: "", selected: {}, showCounts: false };
    showingId = "";
    lastAttentionId = "";
    touchPresence(true);
    refreshFront();
  }

  function onOperatorChange() {
    var name = operatorName();
    if (lastSeenOperatorName && name && lastSeenOperatorName !== name) {
      setMyClaimAt("");
    }
    clearLocalDismiss();
    pollUi = { id: "", selected: {}, showCounts: false };
    showingId = "";
    lastAttentionId = "";
    lastKickHandled = "";
    lastSeenOperatorName = name;
    refreshFront();
  }

  function refreshFront() {
    noteOperatorChange();
    ensureSessionStarted();
    takePendingNameClaim();
    if (handleDuplicateLoginIfNeeded()) {
      hideOverlay();
      return;
    }
    reassertExistingClaim(false);
    if (isPresenceMode()) {
      touchPresence(false);
    } else if (presenceWasOn) {
      dropPresence();
    }
    if (!isFront()) {
      hideOverlay();
      return;
    }
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

  function pickNextDirect() {
    var pack = getPack();
    var i;
    for (i = 0; i < (pack.directs || []).length; i++) {
      if (canSee(pack.directs[i])) return pack.directs[i];
    }
    return null;
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
      if (frontCtx) {
        refreshFront();
        if (typeof frontCtx.onPresence === "function") frontCtx.onPresence();
      }
      if (adminCtx) renderAdminList();
    }, 1500);
    if (typeof document !== "undefined" && !document.__hkBroadcastVisBound) {
      document.__hkBroadcastVisBound = true;
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
          stopTitleFlash();
          refreshFront();
        }
      });
    }
    if (
      !swMessageBound &&
      global.navigator &&
      global.navigator.serviceWorker &&
      typeof global.navigator.serviceWorker.addEventListener === "function"
    ) {
      swMessageBound = true;
      global.navigator.serviceWorker.addEventListener("message", function (ev) {
        var data = ev && ev.data;
        if (!data || data.type !== "HK_DIRECT_ALERT") return;
        try {
          window.focus();
        } catch (e) {}
        refreshFront();
      });
    }
  }

  global.HKStaffBroadcast = {
    initFront: function (ctx) {
      frontCtx = ctx || {};
      ensureSessionStarted();
      takePendingNameClaim();
      reassertExistingClaim(true);
      ensureTick();
      if (!syncChangeBound && global.HKSync && typeof global.HKSync.onChange === "function") {
        syncChangeBound = true;
        global.HKSync.onChange(function () {
          refreshFront();
          if (frontCtx && typeof frontCtx.onPresence === "function") frontCtx.onPresence();
        });
      }
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
    onFrontEnabled: onFrontEnabled,
    onOperatorChange: onOperatorChange,
    getOnlineFrontNames: getOnlineFrontNames,
    sendDirectAlerts: sendDirectAlerts,
    resolveMentionName: resolveMentionName,
    cancelDirects: cancelDirects,
    claimNameAndKickOthers: claimNameAndKickOthers,
    markNameClaimPending: markPendingNameClaim,
    markExplicitNameClaim: markExplicitNameClaim,
    renderAdminList: renderAdminList,
  };
})(typeof window !== "undefined" ? window : this);
