"use strict";

const { startAutoOrderScheduler } = require("./server-auto-orders");

const http = require("http");
const crypto = require("crypto");
const express = require("express");
const path = require("path");
const fs = require("fs");
const webpush = require("web-push");

const app = express();
try {
  app.use(require("compression")());
} catch (eComp) {
  console.warn("compression: not installed — outbound JSON will be uncompressed");
}
const PORT = process.env.PORT || 3000;
const SYNC_PASSWORD = process.env.SYNC_PASSWORD || "74321";
const VAPID_FILE = path.join(__dirname, ".vapid-keys.json");
const PUSH_SUBS_FILE = path.join(__dirname, "push-subs.json");
const VAPID_MARKER_FILE = path.join(__dirname, ".push-vapid-marker.txt");
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || "mailto:hk@localhost").trim();

/** @type {Map<string, object>} */
const pushSubscriptions = new Map();

function loadOrCreateVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: String(process.env.VAPID_PUBLIC_KEY).trim(),
      privateKey: String(process.env.VAPID_PRIVATE_KEY).trim(),
    };
  }
  try {
    if (fs.existsSync(VAPID_FILE)) {
      return JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
    }
  } catch (e) {}
  const keys = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2));
    console.log("Web Push: VAPID keys saved to .vapid-keys.json");
  } catch (e) {
    console.warn("Web Push: could not save VAPID keys file");
  }
  return keys;
}

const vapidKeys = loadOrCreateVapidKeys();
webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
if (process.env.VAPID_PUBLIC_KEY) {
  console.log("Web Push: using VAPID keys from environment");
} else {
  console.log("Web Push: using VAPID keys from file or generated (set env on Render)");
}
console.log("Web Push: subject " + VAPID_SUBJECT);

function loadPushSubscriptions() {
  try {
    var currentMarker = vapidKeys.publicKey;
    var savedMarker = "";
    if (fs.existsSync(VAPID_MARKER_FILE)) {
      savedMarker = fs.readFileSync(VAPID_MARKER_FILE, "utf8").trim();
    }
    if (savedMarker && savedMarker !== currentMarker) {
      pushSubscriptions.clear();
      try {
        fs.writeFileSync(PUSH_SUBS_FILE, "[]");
        fs.writeFileSync(VAPID_MARKER_FILE, currentMarker);
      } catch (e) {}
      console.log("Web Push: VAPID key changed — old subscriptions cleared");
      return;
    }
    if (!savedMarker) {
      try {
        fs.writeFileSync(VAPID_MARKER_FILE, currentMarker);
      } catch (e) {}
    }
    if (!fs.existsSync(PUSH_SUBS_FILE)) return;
    const list = JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, "utf8"));
    if (!Array.isArray(list)) return;
    list.forEach(function (sub) {
      if (sub && sub.endpoint) pushSubscriptions.set(sub.endpoint, sub);
    });
    console.log("Web Push: loaded " + pushSubscriptions.size + " subscription(s)");
  } catch (e) {
    console.warn("Web Push: could not load subscriptions file");
  }
}

loadPushSubscriptions();

function savePushSubscriptions() {
  try {
    const list = [];
    pushSubscriptions.forEach(function (sub) {
      list.push(sub);
    });
    fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.warn("Web Push: could not save subscriptions file");
  }
}

function logPushSendError(endpoint, err) {
  var code = err && err.statusCode ? err.statusCode : "?";
  var msg = err && err.message ? err.message : String(err);
  var body = err && err.body ? String(err.body).slice(0, 200) : "";
  console.warn("Web Push: send failed (" + code + ") " + msg + (body ? " — " + body : ""));
  if (err && (err.statusCode === 401 || err.statusCode === 403)) {
    console.warn("Web Push: VAPID mismatch — turn bell off/on on each device");
  }
}

function getOrderPhase(entry) {
  if (!entry) return "alert";
  const p = entry.phase != null ? String(entry.phase).trim() : "";
  if (
    p === "accepted" ||
    p === "issue" ||
    p === "cancelled" ||
    p === "deployed" ||
    p === "unavailable"
  ) {
    return p;
  }
  return "alert";
}

function findNewOrderAlerts(prevLog, nextLog) {
  const prevIds = {};
  (prevLog || []).forEach(function (entry) {
    if (entry && entry.id) prevIds[entry.id] = true;
  });
  const out = [];
  (nextLog || []).forEach(function (entry) {
    if (!entry || !entry.id || prevIds[entry.id]) return;
    if (getOrderPhase(entry) === "alert") out.push(entry);
  });
  return out;
}

function normalizePersonName(name) {
  return name != null ? String(name).trim().replace(/\s+/g, "").toLowerCase() : "";
}

function shouldSkipPushToSubscriber(sub, order) {
  var orderBy = normalizePersonName(order && order.by);
  var subBy = normalizePersonName(sub && sub.operatorName);
  if (!orderBy || !subBy) return false;
  return orderBy === subBy;
}

function findNewDirectAlerts(prevPack, nextPack) {
  var prevIds = {};
  var prevList = prevPack && Array.isArray(prevPack.directs) ? prevPack.directs : [];
  prevList.forEach(function (row) {
    if (row && row.id) prevIds[String(row.id)] = true;
  });
  var out = [];
  var nextList = nextPack && Array.isArray(nextPack.directs) ? nextPack.directs : [];
  nextList.forEach(function (row) {
    if (!row || !row.id || prevIds[String(row.id)]) return;
    if (row.cancelled) return;
    var sched = row.scheduledAt ? Date.parse(String(row.scheduledAt)) : 0;
    if (isFinite(sched) && sched > Date.now() + 400) return;
    var to = row.to != null ? String(row.to).trim() : "";
    if (!to) return;
    out.push(row);
  });
  return out;
}

function sendDirectPushNotifications(directs) {
  if (!directs.length || !pushSubscriptions.size) return Promise.resolve();
  var tasks = [];
  directs.forEach(function (row) {
    var to = normalizePersonName(row.to);
    if (!to) return;
    var from = row.from != null ? String(row.from).trim() : "";
    var text = row.text != null ? String(row.text).trim() : "";
    var body = from ? from + " · " + (text || "1:1 알럿") : text || "1:1 알럿";
    if (body.length > 120) body = body.slice(0, 120) + "…";
    var payload = JSON.stringify({
      title: "1:1 알럿",
      body: body,
      tag: "hk-direct-" + String(row.id),
      url: "/hk/front.html?from=direct",
    });
    pushSubscriptions.forEach(function (sub, endpoint) {
      if (normalizePersonName(sub && sub.operatorName) !== to) return;
      tasks.push(
        webpush.sendNotification(toWebPushSubscription(sub), payload).then(function () {
          console.log("Web Push: 1:1 delivered to " + endpoint.slice(0, 48) + "…");
        }).catch(function (err) {
          logPushSendError(endpoint, err);
          if (
            err &&
            (err.statusCode === 404 ||
              err.statusCode === 410 ||
              err.statusCode === 401 ||
              err.statusCode === 403)
          ) {
            pushSubscriptions.delete(endpoint);
            savePushSubscriptions();
          }
        })
      );
    });
  });
  return Promise.all(tasks);
}

function toWebPushSubscription(stored) {
  return {
    endpoint: stored.endpoint,
    keys: stored.keys,
    expirationTime: stored.expirationTime,
  };
}

function formatOrderPushBody(entry) {
  const room = entry.room != null ? String(entry.room).trim() : "";
  const memo = entry.memo != null ? String(entry.memo).trim() : "";
  let body = room ? "객실 " + room : "새 오더";
  if (entry.urgent) body += " · 긴급";
  if (memo) {
    const short = memo.length > 60 ? memo.slice(0, 60) + "…" : memo;
    body += "\n" + short;
  }
  return body;
}

function sendOrderPushNotifications(orders) {
  if (!orders.length || !pushSubscriptions.size) {
    if (orders.length && !pushSubscriptions.size) {
      console.log("Web Push: new order(s) but no subscribers — enable bell on device");
    }
    // 구독자 없어도 Promise 반환 — .catch() 호출 시 TypeError로 프로세스 죽지 않게
    return Promise.resolve();
  }
  console.log(
    "Web Push: sending " + orders.length + " alert(s) to " + pushSubscriptions.size + " device(s)"
  );
  const tasks = [];
  orders.forEach(function (order) {
    const payload = JSON.stringify({
      title: "오더 알림",
      body: formatOrderPushBody(order),
      tag: "hk-order-" + (order.id || Date.now()),
      url: "/hk/front.html?from=push",
      by: order.by != null ? String(order.by).trim() : "",
    });
    pushSubscriptions.forEach(function (sub, endpoint) {
      if (shouldSkipPushToSubscriber(sub, order)) {
        console.log(
          "Web Push: skipped sender device (" + (sub.operatorName || "?") + ")"
        );
        return;
      }
      tasks.push(
        webpush.sendNotification(toWebPushSubscription(sub), payload).then(function () {
          console.log("Web Push: delivered to " + endpoint.slice(0, 48) + "…");
        }).catch(function (err) {
          logPushSendError(endpoint, err);
          if (
            err &&
            (err.statusCode === 404 ||
              err.statusCode === 410 ||
              err.statusCode === 401 ||
              err.statusCode === 403)
          ) {
            pushSubscriptions.delete(endpoint);
            savePushSubscriptions();
          }
        })
      );
    });
  });
  return Promise.all(tasks);
}

/** @type {{ version: number, updatedAt: string | null, payload: object | null }} */
const sharedState = {
  version: 0,
  updatedAt: null,
  payload: null,
  partVersions: {},
};

const SYNC_STATE_FILE = path.join(__dirname, "sync-state.json");

function loadSharedStateFromDisk() {
  try {
    if (!fs.existsSync(SYNC_STATE_FILE)) return;
    const raw = fs.readFileSync(SYNC_STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return;
    if (data.version != null && !isNaN(data.version)) sharedState.version = data.version;
    if (data.updatedAt != null) sharedState.updatedAt = data.updatedAt;
    if (data.payload && typeof data.payload === "object") sharedState.payload = data.payload;
    if (data.partVersions && typeof data.partVersions === "object") {
      sharedState.partVersions = data.partVersions;
    }
    console.log(
      "Sync: loaded state v" +
        sharedState.version +
        (sharedState.payload ? " (payload ok)" : " (empty)")
    );
  } catch (e) {
    console.warn("Sync: could not load sync-state.json");
  }
}

function saveSharedStateToDisk() {
  try {
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(sharedState));
  } catch (e) {
    console.warn("Sync: could not save sync-state.json");
  }
}

/** 접속 표시만 메모리에 둠 — 전체 sync version/디스크를 올리지 않음 */
var liveStaffPresence = {
  presence: {},
  presenceKicks: {},
};

function namesKeyPresence(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function prunePresenceKicksMap(kicks, maxAgeMs) {
  kicks = kicks && typeof kicks === "object" ? kicks : {};
  maxAgeMs = maxAgeMs != null ? maxAgeMs : 12 * 3600 * 1000;
  var now = Date.now();
  Object.keys(kicks).forEach(function (k) {
    var row = kicks[k];
    var t = row && row.at ? Date.parse(String(row.at)) : NaN;
    if (!isFinite(t) || now - t > maxAgeMs) delete kicks[k];
  });
  return kicks;
}

function pruneLivePresence() {
  var now = Date.now();
  Object.keys(liveStaffPresence.presence).forEach(function (sid) {
    var row = liveStaffPresence.presence[sid];
    var t = row && row.at ? Date.parse(String(row.at)) : NaN;
    if (!isFinite(t) || now - t > 25000) {
      delete liveStaffPresence.presence[sid];
    }
  });
  var sids = Object.keys(liveStaffPresence.presence);
  if (sids.length > 200) {
    sids.sort(function (a, b) {
      var ta = Date.parse(String((liveStaffPresence.presence[a] && liveStaffPresence.presence[a].at) || 0));
      var tb = Date.parse(String((liveStaffPresence.presence[b] && liveStaffPresence.presence[b].at) || 0));
      return (isFinite(ta) ? ta : 0) - (isFinite(tb) ? tb : 0);
    });
    sids.slice(0, sids.length - 200).forEach(function (sid) {
      delete liveStaffPresence.presence[sid];
    });
  }
  prunePresenceKicksMap(liveStaffPresence.presenceKicks);
}

function staffPresenceSnapshot() {
  pruneLivePresence();
  return {
    presence: Object.assign({}, liveStaffPresence.presence),
    presenceKicks: Object.assign({}, liveStaffPresence.presenceKicks),
  };
}

function presenceIdentityFingerprint(snap) {
  snap = snap || {};
  var p = snap.presence || {};
  var kicks = snap.presenceKicks || {};
  var people = Object.keys(p)
    .sort()
    .map(function (sid) {
      var row = p[sid] || {};
      return sid + "\t" + String(row.name || "") + "\t" + (row.front === true ? "1" : "0");
    })
    .join("\n");
  var kickStr = Object.keys(kicks)
    .sort()
    .map(function (k) {
      var row = kicks[k] || {};
      return k + "\t" + String(row.sid || "") + "\t" + String(row.at || "");
    })
    .join("\n");
  return crypto.createHash("sha1").update(people + "\n#\n" + kickStr).digest("hex").slice(0, 16);
}

function attachStaffPresenceToSyncBody(body, req, scope) {
  if (!body || scope === "rooming") return body;
  var snap = staffPresenceSnapshot();
  var ident = presenceIdentityFingerprint(snap);
  body.presenceIdent = ident;
  var clientIdent =
    req.query && req.query.presenceIdent != null ? String(req.query.presenceIdent).trim() : "";
  if (clientIdent && clientIdent === ident) {
    body.presenceAlive = Object.keys(snap.presence || {});
  } else {
    body.staffPresence = snap;
  }
  return body;
}

function overlayLivePresenceOnPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  var snap = staffPresenceSnapshot();
  var hs = payload.hkStorage && typeof payload.hkStorage === "object" ? payload.hkStorage : {};
  var bc = hs.staffBroadcasts && typeof hs.staffBroadcasts === "object" ? hs.staffBroadcasts : {};
  return Object.assign({}, payload, {
    hkStorage: Object.assign({}, hs, {
      staffBroadcasts: Object.assign({}, bc, {
        presence: snap.presence,
        presenceKicks: snap.presenceKicks,
      }),
    }),
  });
}

function parseSyncSinceVersion(req) {
  var q = req.query && req.query.since != null ? String(req.query.since).trim() : "";
  var h = req.get("x-sync-version");
  var raw = q || (h != null ? String(h).trim() : "");
  if (!raw) return null;
  var n = parseInt(raw, 10);
  return isFinite(n) ? n : null;
}

function syncPartVersionsSnapshot() {
  ensureSyncPartVersions();
  return Object.assign({}, sharedState.partVersions);
}

loadSharedStateFromDisk();

function chatMsgFingerprint(m) {
  if (!m || typeof m !== "object") return "";
  return [
    String(m.by || ""),
    String(m.text || ""),
    String(m.at || ""),
    m.image ? "1" : "0",
    m.deleted ? "1" : "0",
  ].join("\x1f");
}

(function migrateAndSeparateChatChannels() {
  var p = sharedState.payload;
  if (!p || typeof p !== "object") return;
  var changed = false;

  // 레거시: hkTeamChat 키가 없으면 기존 공용(hkFrontChat) → 팀 채팅으로 이전
  if (!Array.isArray(p.hkTeamChat)) {
    if (Array.isArray(p.hkFrontChat) && p.hkFrontChat.length) {
      p.hkTeamChat = p.hkFrontChat.slice();
      p.hkFrontChat = [];
      changed = true;
      console.log(
        "Sync: migrated legacy front chat → team chat (" + p.hkTeamChat.length + ")"
      );
    } else {
      p.hkTeamChat = [];
      changed = true;
    }
  }
  if (!Array.isArray(p.hkFrontChat)) {
    p.hkFrontChat = [];
    changed = true;
  }

  // 잘못 섞인 메시지 분리: id prefix / 동일 내용 중복 제거
  var teamIds = {};
  var teamFp = {};
  p.hkTeamChat.forEach(function (m) {
    if (!m) return;
    if (m.id != null && String(m.id)) teamIds[String(m.id)] = true;
    var fp = chatMsgFingerprint(m);
    if (fp) teamFp[fp] = true;
  });

  var toTeam = [];
  var frontKeep = [];
  p.hkFrontChat.forEach(function (m) {
    if (!m) return;
    var id = m.id != null ? String(m.id) : "";
    if (id.indexOf("tchat-") === 0) {
      toTeam.push(m);
      return;
    }
    if (id && teamIds[id]) return;
    var fp = chatMsgFingerprint(m);
    if (fp && teamFp[fp]) return;
    frontKeep.push(m);
  });
  if (toTeam.length || frontKeep.length !== p.hkFrontChat.length) {
    p.hkFrontChat = frontKeep;
    changed = true;
  }

  var toFront = [];
  var teamKeep = [];
  p.hkTeamChat.forEach(function (m) {
    if (!m) return;
    var id = m.id != null ? String(m.id) : "";
    if (id.indexOf("fchat-") === 0) {
      toFront.push(m);
      return;
    }
    teamKeep.push(m);
  });
  if (toFront.length || toTeam.length) {
    p.hkTeamChat = teamKeep.concat(toTeam);
    p.hkFrontChat = p.hkFrontChat.concat(toFront);
    changed = true;
  }

  p.hkTeamChat.forEach(function (m) {
    if (m && m.channel !== "team") {
      m.channel = "team";
      changed = true;
    }
  });
  p.hkFrontChat.forEach(function (m) {
    if (m && m.channel !== "front") {
      m.channel = "front";
      changed = true;
    }
  });

  if (changed) {
    saveSharedStateToDisk();
    console.log(
      "Sync: chat channels separated (team=" +
        p.hkTeamChat.length +
        ", front=" +
        p.hkFrontChat.length +
        ")"
    );
  }
})();

function checkSyncAuth(req, res, next) {
  const password = req.get("x-sync-password");
  if (password !== SYNC_PASSWORD) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

const CLOSE_DAY_ARCHIVE_DIR = path.join(__dirname, "close-day-archives");
const CLOSE_DAY_ARCHIVE_INDEX = path.join(CLOSE_DAY_ARCHIVE_DIR, "index.json");
const CLOSE_DAY_KEEP_DAYS = 7;

function ensureCloseDayArchiveDir() {
  try {
    if (!fs.existsSync(CLOSE_DAY_ARCHIVE_DIR)) fs.mkdirSync(CLOSE_DAY_ARCHIVE_DIR, { recursive: true });
  } catch (e) {}
}

function loadCloseDayArchiveIndex() {
  ensureCloseDayArchiveDir();
  try {
    if (!fs.existsSync(CLOSE_DAY_ARCHIVE_INDEX)) return [];
    var raw = fs.readFileSync(CLOSE_DAY_ARCHIVE_INDEX, "utf8");
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveCloseDayArchiveIndex(list) {
  ensureCloseDayArchiveDir();
  try {
    fs.writeFileSync(CLOSE_DAY_ARCHIVE_INDEX, JSON.stringify(list || [], null, 2));
  } catch (e) {
    console.warn("close-day archive index save failed", e && e.message);
  }
}

function pruneCloseDayArchives(list) {
  list = Array.isArray(list) ? list.slice() : [];
  var cutoff = Date.now() - CLOSE_DAY_KEEP_DAYS * 24 * 3600 * 1000;
  var kept = [];
  list.forEach(function (row) {
    if (!row) return;
    var t = Date.parse(String(row.savedAt || row.date || ""));
    if (!isFinite(t)) t = Date.parse(String(row.date) + "T00:00:00+09:00");
    if (isFinite(t) && t < cutoff) {
      try {
        if (row.reportFile) {
          var rp = path.join(CLOSE_DAY_ARCHIVE_DIR, path.basename(String(row.reportFile)));
          if (fs.existsSync(rp)) fs.unlinkSync(rp);
        }
        if (row.screenFile) {
          var sp = path.join(CLOSE_DAY_ARCHIVE_DIR, path.basename(String(row.screenFile)));
          if (fs.existsSync(sp)) fs.unlinkSync(sp);
        }
      } catch (eDel) {}
      return;
    }
    kept.push(row);
  });
  return kept;
}

function nextCloseDayArchiveLabel(dateStr, list) {
  dateStr = String(dateStr || "").trim();
  var same = (list || []).filter(function (r) {
    return r && String(r.date) === dateStr;
  });
  if (!same.length) return { label: dateStr, copyIndex: 0 };
  var max = 0;
  same.forEach(function (r) {
    var n = parseInt(r.copyIndex, 10);
    if (isFinite(n) && n > max) max = n;
  });
  var next = max + 1;
  return { label: dateStr + " (" + next + ")", copyIndex: next };
}

app.use(express.json({ limit: "40mb" }));

app.get("/ping", function (req, res) {
  res.status(200).type("text/plain").send("ok");
});

app.get("/api/close-day-archives", checkSyncAuth, function (req, res) {
  var list = pruneCloseDayArchives(loadCloseDayArchiveIndex());
  saveCloseDayArchiveIndex(list);
  res.set("Cache-Control", "no-store");
  res.json({
    archives: list.map(function (r) {
      return {
        id: r.id,
        date: r.date,
        label: r.label,
        copyIndex: r.copyIndex,
        savedAt: r.savedAt,
        hasReport: !!r.reportFile,
        hasScreen: !!r.screenFile,
      };
    }),
  });
});

app.post("/api/close-day-archives", checkSyncAuth, function (req, res) {
    var body = req.body || {};
    var dateStr = String(body.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({ error: "invalid date" });
      return;
    }
    ensureCloseDayArchiveDir();
    var list = pruneCloseDayArchives(loadCloseDayArchiveIndex());
    var next = nextCloseDayArchiveLabel(dateStr, list);
    var id =
      "cd_" +
      dateStr.replace(/-/g, "") +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 7);
    var safeBase = next.label.replace(/[\\/:*?"<>|]/g, "_");
    var reportFile = "";
    var screenFile = "";
    try {
      if (body.reportHtml) {
        reportFile = safeBase + "_report.html";
        fs.writeFileSync(path.join(CLOSE_DAY_ARCHIVE_DIR, reportFile), String(body.reportHtml), "utf8");
      }
      if (body.screenHtml) {
        screenFile = safeBase + "_screen.html";
        fs.writeFileSync(path.join(CLOSE_DAY_ARCHIVE_DIR, screenFile), String(body.screenHtml), "utf8");
      }
    } catch (eWrite) {
      res.status(500).json({ error: "write failed", detail: eWrite && eWrite.message });
      return;
    }
    var row = {
      id: id,
      date: dateStr,
      label: next.label,
      copyIndex: next.copyIndex,
      savedAt: new Date().toISOString(),
      reportFile: reportFile,
      screenFile: screenFile,
    };
    list.unshift(row);
    saveCloseDayArchiveIndex(list);
    res.json({ ok: true, archive: { id: row.id, date: row.date, label: row.label, copyIndex: row.copyIndex } });
  });

app.get("/api/close-day-archives/:id/file", checkSyncAuth, function (req, res) {
  var list = loadCloseDayArchiveIndex();
  var id = String(req.params.id || "");
  var kind = String(req.query.kind || "report");
  var row = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].id === id) {
      row = list[i];
      break;
    }
  }
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  var fileName = kind === "screen" ? row.screenFile : row.reportFile;
  if (!fileName) {
    res.status(404).json({ error: "file missing" });
    return;
  }
  var fp = path.join(CLOSE_DAY_ARCHIVE_DIR, path.basename(String(fileName)));
  if (!fs.existsSync(fp)) {
    res.status(404).json({ error: "file missing" });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.type("html").send(fs.readFileSync(fp, "utf8"));
});

app.get("/api/sync", checkSyncAuth, function (req, res) {
  res.set("Cache-Control", "no-store");
  var version = sharedState.version;
  var updatedAt = sharedState.updatedAt;
  res.set("ETag", '"' + String(version) + '"');
  var since = parseSyncSinceVersion(req);
  var scope = parseSyncScope(req);
  if (since != null && since === version) {
    res.json(
      attachStaffPresenceToSyncBody(
        {
          version: version,
          updatedAt: updatedAt,
          unchanged: true,
          partVersions: syncPartVersionsSnapshot(),
        },
        req,
        scope
      )
    );
    return;
  }
  var built = buildSyncGetPayload(since, scope);
  if (built.unchanged) {
    res.json(
      attachStaffPresenceToSyncBody(
        {
          version: version,
          updatedAt: updatedAt,
          unchanged: true,
          partVersions: syncPartVersionsSnapshot(),
        },
        req,
        scope
      )
    );
    return;
  }
  res.json(
    attachStaffPresenceToSyncBody(
      {
        version: version,
        updatedAt: updatedAt,
        payload: built.payload,
        partial: built.partial || undefined,
        partVersions: syncPartVersionsSnapshot(),
      },
      req,
      scope
    )
  );
});

app.post("/api/presence", checkSyncAuth, function (req, res) {
  var body = req.body && typeof req.body === "object" ? req.body : {};
  var sid = String(body.sid || "").trim().slice(0, 80);
  if (!sid) {
    res.status(400).json({ error: "sid required" });
    return;
  }
  if (body.leave) {
    delete liveStaffPresence.presence[sid];
    res.json({ ok: true, staffPresence: staffPresenceSnapshot() });
    return;
  }
  var name = String(body.name || "").trim().slice(0, 80);
  var at = body.at ? String(body.at).slice(0, 40) : new Date().toISOString();
  if (name) {
    liveStaffPresence.presence[sid] = {
      name: name,
      at: at,
      front: body.front === true,
    };
  }
  var claimAt = body.claimAt ? String(body.claimAt).slice(0, 40) : "";
  var kickStamp = claimAt || (body.claim ? at : "");
  if (name && (body.claim || body.kick)) {
    var kickKey = namesKeyPresence(name);
    var prevKick = liveStaffPresence.presenceKicks[kickKey];
    var incomingStamp = kickStamp || at;
    var incomingAt = Date.parse(String(incomingStamp)) || Date.now();
    var prevKickAt = prevKick && prevKick.at ? Date.parse(String(prevKick.at)) : 0;
    var sameSid = !!(prevKick && prevKick.sid === sid);
    var takeOver = false;
    if (body.claim) {
      takeOver = !prevKick || !isFinite(prevKickAt) || incomingAt >= prevKickAt;
    } else if (kickStamp) {
      takeOver =
        !prevKick ||
        !isFinite(prevKickAt) ||
        sameSid ||
        incomingAt > prevKickAt;
    } else {
      takeOver = !prevKick || !isFinite(prevKickAt) || sameSid;
    }
    if (takeOver) {
      var nextAt = incomingStamp;
      if (sameSid && isFinite(prevKickAt) && incomingAt > prevKickAt && !body.claim) {
        nextAt = prevKick.at;
      }
      liveStaffPresence.presenceKicks[kickKey] = { sid: sid, at: nextAt };
    }
  }
  res.json({ ok: true, staffPresence: staffPresenceSnapshot() });
});

app.get("/api/push/vapid-public-key", checkSyncAuth, function (req, res) {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post("/api/push/subscribe", checkSyncAuth, function (req, res) {
  const sub = req.body;
  if (!sub || !sub.endpoint) {
    res.status(400).json({ error: "invalid subscription" });
    return;
  }
  pushSubscriptions.set(sub.endpoint, sub);
  savePushSubscriptions();
  var who = sub.operatorName ? " · " + sub.operatorName : "";
  console.log("Web Push: subscribed (" + pushSubscriptions.size + " total)" + who);
  res.json({ ok: true, count: pushSubscriptions.size });
});

app.post("/api/push/unsubscribe", checkSyncAuth, function (req, res) {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) pushSubscriptions.delete(endpoint);
  savePushSubscriptions();
  res.json({ ok: true });
});

var HK_STANDARD_ZONES = ["VIP", "RC", "CASINO", "MOBILE_CI", "AJ", "MINIBAR", "SHUTTLE"];

function copyHkRoomArray(rooms, zone) {
  if (rooms && Array.isArray(rooms[zone])) return rooms[zone].slice();
  return [];
}

function hkRoomNumberKey(number) {
  var s = String(number == null ? "" : number).trim();
  if (!s) return "";
  if (/->/.test(s) || /에서/.test(s)) return s.replace(/\s+/g, " ");
  var d = s.replace(/\D/g, "");
  if (!d) return s;
  if (d.length <= 4) return d.length >= 4 ? d.slice(-4) : ("0000" + d).slice(-4);
  return d.slice(-4);
}

function hkMarkRoomDeletedInMap(deletedRooms, zone, roomNumber) {
  if (!deletedRooms || !zone) return;
  var k = hkRoomNumberKey(roomNumber);
  if (!k) return;
  if (!deletedRooms[zone]) deletedRooms[zone] = [];
  if (deletedRooms[zone].indexOf(k) < 0) deletedRooms[zone].push(k);
}

function hkIsRoomMarkedDeleted(deletedRooms, zone, roomNumber) {
  var k = hkRoomNumberKey(roomNumber);
  if (!k) return false;
  var list = deletedRooms && deletedRooms[zone];
  if (!Array.isArray(list)) return false;
  return list.indexOf(k) >= 0;
}

function hkMergeDeletedRoomsMaps(a, b) {
  var out = {};
  var zones = {};
  [a, b].forEach(function (src) {
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach(function (z) {
      zones[z] = true;
    });
  });
  Object.keys(zones).forEach(function (zone) {
    out[zone] = [];
    [a, b].forEach(function (src) {
      if (!src || !Array.isArray(src[zone])) return;
      src[zone].forEach(function (n) {
        hkMarkRoomDeletedInMap(out, zone, n);
      });
    });
  });
  return out;
}

function hkMergeRoomEntry(prev, incoming) {
  if (!incoming || !incoming.number) return prev;
  if (!prev || !prev.number) return incoming;
  var ti = incoming.tray != null ? String(incoming.tray).trim() : "";
  var tp = prev.tray != null ? String(prev.tray).trim() : "";
  var tiAt = incoming.trayUpdatedAt != null ? String(incoming.trayUpdatedAt) : "";
  var tpAt = prev.trayUpdatedAt != null ? String(prev.trayUpdatedAt) : "";
  if (ti === "deleted" || tp === "deleted") return null;
  var incomingTrayWins = tiAt && (!tpAt || tiAt >= tpAt);
  var tray = incomingTrayWins ? ti : tpAt ? tp : ti || tp || "";
  var trayUpdatedAt = incomingTrayWins ? tiAt : tpAt || tiAt || "";
  var merged = Object.assign({}, prev, incoming, {
    tray: tray,
    trayUpdatedAt: trayUpdatedAt,
  });
  // 더 최신 updatedAt/createdAt 유지
  var prevAt = String(prev.updatedAt || prev.createdAt || "").trim();
  var incAt = String(incoming.updatedAt || incoming.createdAt || "").trim();
  if (incAt && (!prevAt || String(incAt) >= String(prevAt))) {
    if (incoming.updatedAt) merged.updatedAt = String(incoming.updatedAt);
    if (incoming.createdAt) merged.createdAt = String(incoming.createdAt);
    else if (prev.createdAt) merged.createdAt = String(prev.createdAt);
  } else {
    if (prev.updatedAt) merged.updatedAt = String(prev.updatedAt);
    if (prev.createdAt) merged.createdAt = String(prev.createdAt);
  }
  return merged;
}

function hkParseIsoMs(iso) {
  if (!iso) return 0;
  var t = new Date(String(iso)).getTime();
  return isNaN(t) ? 0 : t;
}

function hkRoomActivityAt(room) {
  if (!room || typeof room !== "object") return "";
  if (room.updatedAt != null && String(room.updatedAt).trim()) return String(room.updatedAt).trim();
  if (room.createdAt != null && String(room.createdAt).trim()) return String(room.createdAt).trim();
  return "";
}

/** 마감 이전 객실 제거. 스탬프 없는 신규는 거부하되 서버에 이미 있던 행은 유지 */
function hkFilterRoomsAfterCloseDay(rooms, closeDayAt, prevRooms) {
  if (!rooms || typeof rooms !== "object") return rooms || {};
  var closeMs = hkParseIsoMs(closeDayAt);
  if (!closeMs) return rooms;
  var out = {};
  Object.keys(rooms).forEach(function (zone) {
    var prevMap = {};
    var prevList =
      prevRooms && Array.isArray(prevRooms[zone]) ? prevRooms[zone] : [];
    prevList.forEach(function (r) {
      if (!r || !r.number) return;
      var k = hkRoomNumberKey(r.number);
      if (k) prevMap[k] = true;
    });
    out[zone] = (Array.isArray(rooms[zone]) ? rooms[zone] : []).filter(function (room) {
      if (!room || !room.number) return false;
      var at = hkRoomActivityAt(room);
      if (at) return hkParseIsoMs(at) >= closeMs;
      return !!prevMap[hkRoomNumberKey(room.number)];
    });
  });
  return out;
}

function hkFilterLogAfterCloseDay(arr, closeDayAt) {
  if (!Array.isArray(arr)) return [];
  var closeMs = hkParseIsoMs(closeDayAt);
  if (!closeMs) return arr;
  var kept = 0;
  for (var i = 0; i < arr.length; i++) {
    var entry = arr[i];
    if (!entry || typeof entry !== "object") continue;
    var at = entry.updatedAt || entry.at || entry.createdAt || "";
    var ms = hkParseIsoMs(at);
    if (ms > 0 && ms >= closeMs) kept++;
  }
  if (kept === arr.length) return arr;
  return arr.filter(function (entry) {
    if (!entry || typeof entry !== "object") return false;
    var at = entry.updatedAt || entry.at || entry.createdAt || "";
    var ms = hkParseIsoMs(at);
    return ms > 0 && ms >= closeMs;
  });
}

function hkMergeZoneRoomClearAt(a, b) {
  var out = {};
  [a, b].forEach(function (src) {
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach(function (z) {
      var at = src[z] != null ? String(src[z]).trim() : "";
      if (!at) return;
      if (!out[z] || at > out[z]) out[z] = at;
    });
  });
  return out;
}

function hkMergeRoomArraysByNumber(
  prevArr,
  incomingArr,
  zone,
  deletedRooms,
  incomingDeletedRooms,
  zoneClearAtMap,
  prevDeletedRooms
) {
  var map = {};
  function incomingClaimsDeleted(k) {
    return hkIsRoomMarkedDeleted(incomingDeletedRooms, zone, k);
  }
  function prevClaimsDeleted(k) {
    return hkIsRoomMarkedDeleted(prevDeletedRooms, zone, k);
  }
  function canReviveByStamp(room) {
    var clearAt =
      zoneClearAtMap && zoneClearAtMap[zone] ? String(zoneClearAtMap[zone]) : "";
    if (!clearAt) return true;
    var roomAt = hkRoomActivityAt(room);
    return !!(roomAt && roomAt >= clearAt);
  }
  function unmarkDeleted(k) {
    if (deletedRooms && deletedRooms[zone]) {
      deletedRooms[zone] = deletedRooms[zone].filter(function (n) {
        return hkRoomNumberKey(n) !== k;
      });
    }
  }
  function ingest(room, fromIncoming) {
    if (!room || !room.number) return;
    var k = hkRoomNumberKey(room.number);
    if (!k) return;
    var tray = room.tray != null ? String(room.tray).trim() : "";
    if (tray === "deleted") {
      hkMarkRoomDeletedInMap(deletedRooms, zone, k);
      delete map[k];
      return;
    }
    if (hkIsRoomMarkedDeleted(deletedRooms, zone, k)) {
      var sourceDeleted = fromIncoming ? incomingClaimsDeleted(k) : prevClaimsDeleted(k);
      if (!sourceDeleted && canReviveByStamp(room)) {
        unmarkDeleted(k);
      } else {
        return;
      }
    }
    var merged = map[k] ? hkMergeRoomEntry(map[k], room) : room;
    if (!merged) {
      delete map[k];
      return;
    }
    map[k] = merged;
  }
  (prevArr || []).forEach(function (room) {
    ingest(room, false);
  });
  (incomingArr || []).forEach(function (room) {
    ingest(room, true);
  });
  return Object.keys(map).map(function (k) {
    return map[k];
  });
}

function hkMergeZoneRooms(
  prevRooms,
  incomingRooms,
  zone,
  deletedRooms,
  incomingDeletedRooms,
  zoneClearAtMap,
  prevDeletedRooms
) {
  var prev = prevRooms && Array.isArray(prevRooms[zone]) ? prevRooms[zone] : [];
  var inc =
    incomingRooms && Array.isArray(incomingRooms[zone]) ? incomingRooms[zone] : [];
  return hkMergeRoomArraysByNumber(
    prev,
    inc,
    zone,
    deletedRooms,
    incomingDeletedRooms,
    zoneClearAtMap,
    prevDeletedRooms
  );
}

function mergeHkCustomZones(prev, incoming) {
  var baseZones = Array.isArray(prev.customZones) ? prev.customZones : [];
  var incZones = Object.prototype.hasOwnProperty.call(incoming, "customZones")
    ? Array.isArray(incoming.customZones)
      ? incoming.customZones
      : []
    : null;
  var baseDeleted = Array.isArray(prev.deletedCustomZones)
    ? prev.deletedCustomZones
    : [];
  var incDeleted = Object.prototype.hasOwnProperty.call(incoming, "deletedCustomZones")
    ? Array.isArray(incoming.deletedCustomZones)
      ? incoming.deletedCustomZones
      : []
    : [];
  var deletedMap = {};
  baseDeleted.concat(incDeleted).forEach(function (id) {
    var z = id != null ? String(id).trim() : "";
    if (z) deletedMap[z] = true;
  });
  var map = {};
  function put(z) {
    if (!z || typeof z !== "object") return;
    var id = z.id != null ? String(z.id).trim() : "";
    var label = z.label != null ? String(z.label).trim() : "";
    if (!id || !label) return;
    map[id] = { id: id, label: label };
  }
  baseZones.forEach(put);
  if (incZones) {
    incZones.forEach(function (z) {
      put(z);
      if (z && z.id) delete deletedMap[String(z.id).trim()];
    });
  }
  var zones = Object.keys(map)
    .filter(function (id) {
      return !deletedMap[id];
    })
    .map(function (id) {
      return map[id];
    });
  return {
    customZones: zones,
    deletedCustomZones: Object.keys(deletedMap),
  };
}

function collectHkCustomZoneIds(customZones) {
  var ids = [];
  (customZones || []).forEach(function (z) {
    if (z && z.id) ids.push(z.id);
  });
  return ids;
}

function pickNoticeFieldsForServer(prev, incoming) {
  var baseObj = prev && typeof prev === "object" ? prev : {};
  var incObj = incoming && typeof incoming === "object" ? incoming : {};
  var baseAt =
    baseObj.noticeUpdatedAt != null ? String(baseObj.noticeUpdatedAt).trim() : "";
  var incAt =
    incObj.noticeUpdatedAt != null ? String(incObj.noticeUpdatedAt).trim() : "";
  var incHasText = Object.prototype.hasOwnProperty.call(incObj, "notice");
  var incHasImages =
    Object.prototype.hasOwnProperty.call(incObj, "noticeImages") ||
    Object.prototype.hasOwnProperty.call(incObj, "noticeImage");
  var incHasAt = Object.prototype.hasOwnProperty.call(incObj, "noticeUpdatedAt");
  var preferIncoming = true;
  if (baseAt && incAt && incAt < baseAt) preferIncoming = false;
  else if (baseAt && !incAt && (incHasText || incHasImages)) preferIncoming = false;
  else if (!incHasText && !incHasImages && !incHasAt) preferIncoming = false;
  function normalizeImages(src) {
    var images = [];
    if (src && Array.isArray(src.noticeImages)) {
      src.noticeImages.forEach(function (img) {
        var s = img != null ? String(img).trim() : "";
        if (s) images.push(s);
      });
    }
    if (!images.length && src && src.noticeImage != null) {
      var single = String(src.noticeImage).trim();
      if (single) images.push(single);
    }
    return images;
  }
  if (!preferIncoming) {
    return {
      notice: baseObj.notice != null ? String(baseObj.notice) : "",
      noticeImages: normalizeImages(baseObj),
      noticeUpdatedAt: baseAt,
    };
  }
  return {
    notice: incHasText
      ? typeof incObj.notice === "string"
        ? incObj.notice
        : ""
      : baseObj.notice != null
        ? String(baseObj.notice)
        : "",
    noticeImages: incHasImages ? normalizeImages(incObj) : normalizeImages(baseObj),
    noticeUpdatedAt: incAt || baseAt || "",
  };
}

function getInvenNotifyUpdatedAtForServer(inv) {
  if (!inv || typeof inv !== "object") return "";
  if (inv.table && inv.table.updatedAt != null) {
    return String(inv.table.updatedAt).trim();
  }
  return inv.updatedAt != null ? String(inv.updatedAt).trim() : "";
}

/** 인벤 통보는 updatedAt이 더 최신인 쪽만 채택 (빈 표 초기화도 포함) */
function pickInvenNotifyForServer(prev, incoming) {
  var baseObj = prev && typeof prev === "object" ? prev : {};
  var incObj = incoming && typeof incoming === "object" ? incoming : {};
  if (!Object.prototype.hasOwnProperty.call(incObj, "invenNotify")) {
    return baseObj.invenNotify != null ? baseObj.invenNotify : null;
  }
  var inc = incObj.invenNotify;
  var baseInv = baseObj.invenNotify;
  // 표가 없는(=아직 못 받은) 클라이언트가 null을 보내도 기존 표를 지우지 않는다.
  if (!inc || typeof inc !== "object") {
    return baseInv != null ? baseInv : null;
  }
  if (!baseInv || typeof baseInv !== "object") return inc;
  var baseAt = getInvenNotifyUpdatedAtForServer(baseInv);
  var incAt = getInvenNotifyUpdatedAtForServer(inc);
  function hasContent(inv) {
    if (!inv || typeof inv !== "object") return false;
    if (Array.isArray(inv.cards) && inv.cards.some(function (c) {
      return c && String(c.room || "").trim();
    })) {
      return true;
    }
    if (inv.table && Array.isArray(inv.table.rows)) {
      return inv.table.rows.some(function (row) {
        if (!row || typeof row !== "object") return false;
        var main = row.main || {};
        var annex = row.annex || {};
        return !!(String(main.room || "").trim() || String(annex.room || "").trim());
      });
    }
    return false;
  }
  if (hasContent(baseInv) && !hasContent(inc)) {
    var reason = inc.clearReason != null ? String(inc.clearReason).trim() : "";
    if (reason === "closeDay" || reason === "userReset") return inc;
    return baseInv;
  }
  if (baseAt && incAt && incAt < baseAt) return baseInv;
  if (baseAt && !incAt) return baseInv;
  return inc;
}

function frontEmbedIsCleared(entry) {
  return !!(entry && typeof entry === "object" && entry.__cleared === true);
}

function frontEmbedClearIdOf(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.clearId != null && String(entry.clearId).trim()) {
    return String(entry.clearId).trim();
  }
  if (frontEmbedIsCleared(entry) && entry.updatedAt != null) {
    return String(entry.updatedAt).trim();
  }
  return "";
}

function frontEmbedHasPayload(entry) {
  if (!entry || typeof entry !== "object" || frontEmbedIsCleared(entry)) return false;
  if (Array.isArray(entry.dataframeRows) && entry.dataframeRows.length > 0) return true;
  if (Array.isArray(entry.records) && entry.records.length > 0) return true;
  if (Array.isArray(entry.currentRows) && entry.currentRows.length > 0) return true;
  if (entry.ddRooms != null && String(entry.ddRooms).trim()) return true;
  return false;
}

function frontEmbedContentSigOf(entry) {
  if (!entry || typeof entry !== "object") return "";
  try {
    var copy = Object.assign({}, entry);
    delete copy.updatedAt;
    delete copy.__cleared;
    delete copy.clearId;
    delete copy.clearedSig;
    delete copy.afterClearId;
    return JSON.stringify(copy);
  } catch (e) {
    return "";
  }
}

function frontEmbedNonClearMayReplaceClear(cleared, incoming) {
  if (!frontEmbedIsCleared(cleared) || !incoming || typeof incoming !== "object") {
    return false;
  }
  if (frontEmbedIsCleared(incoming) || !frontEmbedHasPayload(incoming)) return false;
  var clearId = frontEmbedClearIdOf(cleared);
  var afterId =
    incoming.afterClearId != null ? String(incoming.afterClearId).trim() : "";
  if (!clearId || !afterId || afterId !== clearId) return false;
  var clearedSig = cleared.clearedSig != null ? String(cleared.clearedSig) : "";
  if (clearedSig && frontEmbedContentSigOf(incoming) === clearedSig) return false;
  var ta = new Date(cleared.updatedAt || 0).getTime();
  var tb = new Date(incoming.updatedAt || 0).getTime();
  if (isNaN(ta)) ta = 0;
  if (isNaN(tb)) tb = 0;
  return tb >= ta;
}

function mergeFrontEmbedStatesForServer(prevStates, incStates) {
  var prevEmbed = prevStates && typeof prevStates === "object" ? prevStates : {};
  var incEmbed = incStates && typeof incStates === "object" ? incStates : {};
  var keys = ["dd", "inven", "chichi"];
  var out = {
    dd: prevEmbed.dd || null,
    inven: prevEmbed.inven || null,
    chichi: prevEmbed.chichi || null,
  };
  keys.forEach(function (key) {
    var a = prevEmbed[key];
    var b = incEmbed[key];
    if (!b || typeof b !== "object") return;
    if (!a) {
      out[key] = b;
      return;
    }
    var ta = new Date(a.updatedAt || 0).getTime();
    var tb = new Date(b.updatedAt || 0).getTime();
    if (isNaN(ta)) ta = 0;
    if (isNaN(tb)) tb = 0;
    var aCleared = frontEmbedIsCleared(a);
    var bCleared = frontEmbedIsCleared(b);
    if (aCleared && !bCleared) {
      if (frontEmbedNonClearMayReplaceClear(a, b)) out[key] = b;
      return;
    }
    // 옛 초기화 마커가 afterClearId 없는 새 만들기 결과를 덮지 않음 — 더 최신 clear만 채택
    if (!aCleared && bCleared) {
      if (tb >= ta) out[key] = b;
      return;
    }
    if (tb >= ta) out[key] = b;
  });
  return out;
}

function pickMbInvNoticeFieldsForServer(prev, incoming) {
  var baseObj = prev && typeof prev === "object" ? prev : {};
  var incObj = incoming && typeof incoming === "object" ? incoming : {};
  var baseAt =
    baseObj.mbInvNoticeUpdatedAt != null ? String(baseObj.mbInvNoticeUpdatedAt).trim() : "";
  var incAt =
    incObj.mbInvNoticeUpdatedAt != null ? String(incObj.mbInvNoticeUpdatedAt).trim() : "";
  var incHasText = Object.prototype.hasOwnProperty.call(incObj, "mbInvNotice");
  var incHasImages = Object.prototype.hasOwnProperty.call(incObj, "mbInvNoticeImages");
  var incHasAt = Object.prototype.hasOwnProperty.call(incObj, "mbInvNoticeUpdatedAt");
  var preferIncoming = true;
  if (baseAt && incAt && incAt < baseAt) {
    preferIncoming = false;
  } else if (baseAt && !incAt && (incHasText || incHasImages)) {
    preferIncoming = false;
  } else if (!incHasText && !incHasImages && !incHasAt) {
    preferIncoming = false;
  }
  function normalizeImages(src) {
    var images = [];
    if (src && Array.isArray(src.mbInvNoticeImages)) {
      src.mbInvNoticeImages.forEach(function (img) {
        var s = img != null ? String(img).trim() : "";
        if (s) images.push(s);
      });
    }
    return images;
  }
  if (!preferIncoming) {
    return {
      mbInvNotice: baseObj.mbInvNotice != null ? String(baseObj.mbInvNotice) : "",
      mbInvNoticeImages: normalizeImages(baseObj),
      mbInvNoticeUpdatedAt: baseAt,
    };
  }
  return {
    mbInvNotice: incHasText
      ? typeof incObj.mbInvNotice === "string"
        ? incObj.mbInvNotice
        : ""
      : baseObj.mbInvNotice != null
        ? String(baseObj.mbInvNotice)
        : "",
    mbInvNoticeImages: incHasImages ? normalizeImages(incObj) : normalizeImages(baseObj),
    mbInvNoticeUpdatedAt: incAt || baseAt || "",
  };
}

var STAFF_BROADCAST_ALERT_MAX = 80;
var STAFF_BROADCAST_POLL_MAX = 80;
var STAFF_BROADCAST_DIRECT_LIVE_MAX = 80;
var STAFF_BROADCAST_DIRECT_OLD_MAX = 40;
var HK_CHAT_MAX = 300;

var SYNC_PART_KEYS = {
  rooming: [
    "blockMap",
    "vacRows",
    "roomResvMap",
    "excelResvMap",
    "arrResvTotals",
    "allStatusRooms",
    "extendedStayRooms",
    "extendedStayUpdatedAt",
    "blockDisplayAliases",
    "uploadSummary",
    "roomingUploadedAt",
    "fasnBlockMap",
    "fasnVacRows",
    "fasnAllStatusRooms",
    "fasnUploadSummary",
    "fasnUploadedAt",
    "roomingClearedAt",
  ],
  hkStorage: ["hkStorage"],
  hkRequestLog: ["hkRequestLog"],
  hkOrderLog: ["hkOrderLog"],
  hkCancelLog: ["hkCancelLog"],
  hkUseLog: ["hkUseLog"],
  hkChangeLog: ["hkChangeLog"],
  hkMbInvLog: ["hkMbInvLog"],
  hkMbCheckLog: ["hkMbCheckLog"],
  hkFrontChat: ["hkFrontChat"],
  hkTeamChat: ["hkTeamChat"],
  hkAdminInquiries: ["hkAdminInquiries"],
  hkMeta: ["hkCloseDayAt", "hkLastRoomChange", "hkAutoOrderState"],
};

var SYNC_SCOPE_PARTS = {
  rooming: ["rooming"],
  hk: [
    "rooming",
    "hkStorage",
    "hkRequestLog",
    "hkOrderLog",
    "hkCancelLog",
    "hkUseLog",
    "hkChangeLog",
    "hkMbInvLog",
    "hkMbCheckLog",
    "hkFrontChat",
    "hkTeamChat",
    "hkAdminInquiries",
    "hkMeta",
  ],
};

function parseSyncScope(req) {
  var raw = req.query && req.query.scope != null ? String(req.query.scope).trim().toLowerCase() : "";
  if (raw === "rooming" || raw === "hk") return raw;
  return "all";
}

function ensureSyncPartVersions() {
  if (!sharedState.partVersions || typeof sharedState.partVersions !== "object") {
    sharedState.partVersions = {};
  }
  Object.keys(SYNC_PART_KEYS).forEach(function (part) {
    if (sharedState.partVersions[part] == null || isNaN(sharedState.partVersions[part])) {
      sharedState.partVersions[part] = sharedState.version;
    }
  });
}

function fingerprintSyncPartSlice(payload, keys) {
  var slice = {};
  var has = false;
  (keys || []).forEach(function (k) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, k)) {
      slice[k] = payload[k];
      has = true;
    }
  });
  if (!has) return "";
  if (slice.hkStorage && typeof slice.hkStorage === "object") {
    slice.hkStorage = Object.assign({}, slice.hkStorage);
    if (slice.hkStorage.staffBroadcasts && typeof slice.hkStorage.staffBroadcasts === "object") {
      slice.hkStorage.staffBroadcasts = Object.assign({}, slice.hkStorage.staffBroadcasts);
      delete slice.hkStorage.staffBroadcasts.presence;
      delete slice.hkStorage.staffBroadcasts.presenceKicks;
    }
  }
  return crypto.createHash("sha1").update(JSON.stringify(slice)).digest("hex");
}

function bumpChangedSyncParts(prevPayload, nextPayload, version) {
  ensureSyncPartVersions();
  Object.keys(SYNC_PART_KEYS).forEach(function (part) {
    var keys = SYNC_PART_KEYS[part];
    var sameRef = true;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var hasP = !!(prevPayload && Object.prototype.hasOwnProperty.call(prevPayload, k));
      var hasN = !!(nextPayload && Object.prototype.hasOwnProperty.call(nextPayload, k));
      if (hasP !== hasN || (hasN && prevPayload[k] !== nextPayload[k])) {
        sameRef = false;
        break;
      }
    }
    if (sameRef) return;
    if (fingerprintSyncPartSlice(prevPayload, keys) === fingerprintSyncPartSlice(nextPayload, keys)) {
      keys.forEach(function (k) {
        if (prevPayload && nextPayload && Object.prototype.hasOwnProperty.call(prevPayload, k)) {
          nextPayload[k] = prevPayload[k];
        }
      });
      return;
    }
    sharedState.partVersions[part] = version;
  });
}

function buildSyncGetPayload(since, scope) {
  var payload = sharedState.payload;
  if (!payload || typeof payload !== "object") {
    return { payload: null, unchanged: false, partial: false };
  }
  ensureSyncPartVersions();
  var parts =
    scope && SYNC_SCOPE_PARTS[scope]
      ? SYNC_SCOPE_PARTS[scope]
      : Object.keys(SYNC_PART_KEYS);
  var includeParts = parts;
  var partial = false;
  if (since != null) {
    partial = true;
    includeParts = parts.filter(function (part) {
      var pv = Number(sharedState.partVersions[part]);
      return isFinite(pv) && pv > since;
    });
  }
  if (!includeParts.length) {
    return { unchanged: true, payload: null, partial: true };
  }
  var out = {};
  includeParts.forEach(function (part) {
    (SYNC_PART_KEYS[part] || []).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) {
        out[k] = payload[k];
      }
    });
  });
  if (!Object.keys(out).length) {
    return { unchanged: true, payload: null, partial: true };
  }
  if (Object.prototype.hasOwnProperty.call(out, "hkStorage")) {
    out = overlayLivePresenceOnPayload(out);
  }
  return { payload: out, unchanged: false, partial: partial };
}

ensureSyncPartVersions();
if (trimSharedStatePayload()) {
  sharedState.version += 1;
  sharedState.updatedAt = new Date().toISOString();
  sharedState.partVersions.hkStorage = sharedState.version;
  sharedState.partVersions.hkFrontChat = sharedState.version;
  sharedState.partVersions.hkTeamChat = sharedState.version;
  saveSharedStateToDisk();
  console.log("Sync: trimmed stored payload, now v" + sharedState.version);
}

function broadcastRowTime(row) {
  return String((row && (row.createdAt || row.at || row.cancelledAt)) || "");
}

function sortBroadcastOldestFirst(arr) {
  return (Array.isArray(arr) ? arr : []).slice().sort(function (a, b) {
    var ta = broadcastRowTime(a);
    var tb = broadcastRowTime(b);
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
}

/** Client normalizeStaffBroadcasts 와 같은 상한 — 서버 merge 가 잘라낸 1:1 사진 알럿을 되살리지 않게 */
function capStaffBroadcastLists(pack) {
  if (!pack || typeof pack !== "object") return pack;
  var alerts = sortBroadcastOldestFirst(pack.alerts);
  var polls = sortBroadcastOldestFirst(pack.polls);
  var directs = sortBroadcastOldestFirst(pack.directs);
  if (alerts.length > STAFF_BROADCAST_ALERT_MAX) {
    alerts = alerts.slice(-STAFF_BROADCAST_ALERT_MAX);
  }
  if (polls.length > STAFF_BROADCAST_POLL_MAX) {
    polls = polls.slice(-STAFF_BROADCAST_POLL_MAX);
  }
  var liveDirects = directs.filter(function (row) {
    return row && !row.cancelled;
  });
  var oldDirects = directs.filter(function (row) {
    return row && row.cancelled;
  });
  if (liveDirects.length > STAFF_BROADCAST_DIRECT_LIVE_MAX) {
    liveDirects = liveDirects.slice(-STAFF_BROADCAST_DIRECT_LIVE_MAX);
  }
  if (oldDirects.length > STAFF_BROADCAST_DIRECT_OLD_MAX) {
    oldDirects = oldDirects.slice(-STAFF_BROADCAST_DIRECT_OLD_MAX);
  }
  pack.alerts = alerts;
  pack.polls = polls;
  pack.directs = oldDirects.concat(liveDirects);
  prunePresenceKicksMap(pack.presenceKicks);
  return pack;
}

function capChatArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.length > HK_CHAT_MAX ? arr.slice(-HK_CHAT_MAX) : arr;
}

function payloadVersionFingerprint(payload) {
  if (!payload || typeof payload !== "object") return "";
  var copy = Object.assign({}, payload);
  if (copy.hkStorage && typeof copy.hkStorage === "object") {
    copy.hkStorage = Object.assign({}, copy.hkStorage);
    if (copy.hkStorage.staffBroadcasts && typeof copy.hkStorage.staffBroadcasts === "object") {
      copy.hkStorage.staffBroadcasts = Object.assign({}, copy.hkStorage.staffBroadcasts);
      delete copy.hkStorage.staffBroadcasts.presence;
      delete copy.hkStorage.staffBroadcasts.presenceKicks;
    }
  }
  return crypto.createHash("sha1").update(JSON.stringify(copy)).digest("hex");
}

function trimSharedStatePayload() {
  var p = sharedState.payload;
  if (!p || typeof p !== "object") return false;
  var before = payloadVersionFingerprint(p);
  if (p.hkStorage && p.hkStorage.staffBroadcasts) {
    p.hkStorage.staffBroadcasts = capStaffBroadcastLists(p.hkStorage.staffBroadcasts);
  }
  if (Array.isArray(p.hkFrontChat)) p.hkFrontChat = capChatArray(p.hkFrontChat);
  if (Array.isArray(p.hkTeamChat)) p.hkTeamChat = capChatArray(p.hkTeamChat);
  return payloadVersionFingerprint(p) !== before;
}

function mergeStaffBroadcastsForServer(prevRaw, incomingRaw, hasIncoming) {
  function asPack(raw) {
    if (!raw || typeof raw !== "object") {
      return { updatedAt: "", alerts: [], polls: [], directs: [], presence: {}, presenceKicks: {}, deletedIds: {} };
    }
    var deletedIds = {};
    if (raw.deletedIds && typeof raw.deletedIds === "object" && !Array.isArray(raw.deletedIds)) {
      Object.keys(raw.deletedIds).forEach(function (k) {
        var id = String(k || "").trim();
        if (id) deletedIds[id] = raw.deletedIds[k] != null ? String(raw.deletedIds[k]) : "1";
      });
    }
    return {
      updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : "",
      alerts: Array.isArray(raw.alerts) ? raw.alerts.filter(function (a) { return a && a.id; }) : [],
      polls: Array.isArray(raw.polls) ? raw.polls.filter(function (p) { return p && p.id; }) : [],
      directs: Array.isArray(raw.directs) ? raw.directs.filter(function (d) { return d && d.id; }) : [],
      presence: raw.presence && typeof raw.presence === "object" && !Array.isArray(raw.presence) ? raw.presence : {},
      presenceKicks: raw.presenceKicks && typeof raw.presenceKicks === "object" && !Array.isArray(raw.presenceKicks) ? raw.presenceKicks : {},
      deletedIds: deletedIds,
    };
  }
  function mergeDismissed(a, b) {
    var out = {};
    [a, b].forEach(function (m) {
      if (!m || typeof m !== "object" || Array.isArray(m)) return;
      Object.keys(m).forEach(function (k) {
        var key = String(k || "").trim();
        if (key) out[key] = m[k] != null ? String(m[k]) : "1";
      });
    });
    return out;
  }
  function mergeNames(a, b) {
    var seen = {};
    var out = [];
    (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).forEach(function (n) {
      var name = String(n || "").trim();
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push(name);
    });
    return out;
  }
  var prev = asPack(prevRaw);
  if (!hasIncoming) return prev;
  var inc = asPack(incomingRaw);
  var deleted = Object.assign({}, prev.deletedIds, inc.deletedIds);
  var alertsById = {};
  function takeAlert(row) {
    if (!row || !row.id || deleted[String(row.id)]) return;
    var id = String(row.id);
    var cur = alertsById[id];
    if (!cur) {
      alertsById[id] = row;
      return;
    }
    var newer = String(row.createdAt || "") > String(cur.createdAt || "") ? row : cur;
    var older = newer === row ? cur : row;
    var merged = Object.assign({}, older, newer);
    merged.dismissedBy = mergeDismissed(cur.dismissedBy, row.dismissedBy);
    alertsById[id] = merged;
  }
  prev.alerts.forEach(takeAlert);
  inc.alerts.forEach(takeAlert);
  var pollsById = {};
  function takePoll(row) {
    if (!row || !row.id || deleted[String(row.id)]) return;
    var id = String(row.id);
    var cur = pollsById[id];
    if (!cur) {
      pollsById[id] = row;
      return;
    }
    var newer = String(row.createdAt || "") > String(cur.createdAt || "") ? row : cur;
    var older = newer === row ? cur : row;
    var merged = Object.assign({}, older, newer);
    merged.dismissedBy = mergeDismissed(cur.dismissedBy, row.dismissedBy);
    var itemsById = {};
    (cur.items || []).concat(row.items || []).forEach(function (it) {
      if (!it || !it.id) return;
      var old = itemsById[it.id];
      if (!old || String(it.addedAt || "") >= String(old.addedAt || "")) {
        itemsById[it.id] = it;
      }
    });
    merged.items = Object.keys(itemsById).map(function (k) {
      return itemsById[k];
    });
    var votes = {};
    [cur.votes || {}, row.votes || {}].forEach(function (m) {
      if (!m || typeof m !== "object") return;
      Object.keys(m).forEach(function (itemId) {
        votes[itemId] = mergeNames(votes[itemId], m[itemId]);
      });
    });
    merged.votes = votes;
    if (row.endsAt && (!merged.endsAt || String(row.endsAt) < String(merged.endsAt))) {
      merged.endsAt = row.endsAt;
    }
    pollsById[id] = merged;
  }
  prev.polls.forEach(takePoll);
  inc.polls.forEach(takePoll);
  var directsById = {};
  function takeDirect(row) {
    if (!row || !row.id || deleted[String(row.id)]) return;
    var id = String(row.id);
    var cur = directsById[id];
    if (!cur) {
      directsById[id] = row;
      return;
    }
    var newer = String(row.createdAt || "") > String(cur.createdAt || "") ? row : cur;
    var older = newer === row ? cur : row;
    var merged = Object.assign({}, older, newer);
    merged.dismissedBy = mergeDismissed(cur.dismissedBy, row.dismissedBy);
    if (cur.cancelled || row.cancelled) {
      merged.cancelled = true;
      merged.cancelledAt = row.cancelledAt || cur.cancelledAt || "";
    }
    directsById[id] = merged;
  }
  prev.directs.forEach(takeDirect);
  inc.directs.forEach(takeDirect);
  var presence = {};
  [prev.presence || {}, inc.presence || {}].forEach(function (m) {
    Object.keys(m).forEach(function (sid) {
      var row = m[sid];
      if (!row || typeof row !== "object") return;
      var prevP = presence[sid];
      if (!prevP || String(row.at || "") >= String(prevP.at || "")) presence[sid] = row;
    });
  });
  var nowMs = Date.now();
  Object.keys(presence).forEach(function (sid) {
    var t = presence[sid] && presence[sid].at ? new Date(presence[sid].at).getTime() : 0;
    if (!isFinite(t) || nowMs - t > 45000) delete presence[sid];
  });
  var presenceKicks = {};
  [prev.presenceKicks || {}, inc.presenceKicks || {}].forEach(function (m) {
    if (!m || typeof m !== "object") return;
    Object.keys(m).forEach(function (key) {
      var row = m[key];
      if (!row) return;
      var k = String(key || "").trim().toLowerCase();
      if (!k) return;
      var prevK = presenceKicks[k];
      if (!prevK || String(row.at || "") >= String(prevK.at || "")) presenceKicks[k] = row;
    });
  });
  var updatedAt =
    inc.updatedAt && (!prev.updatedAt || String(inc.updatedAt) >= String(prev.updatedAt))
      ? inc.updatedAt
      : prev.updatedAt || inc.updatedAt;
  return capStaffBroadcastLists({
    updatedAt: updatedAt,
    deletedIds: deleted,
    alerts: Object.keys(alertsById).map(function (k) {
      return alertsById[k];
    }),
    polls: Object.keys(pollsById).map(function (k) {
      return pollsById[k];
    }),
    directs: Object.keys(directsById).map(function (k) {
      return directsById[k];
    }),
    presence: presence,
    presenceKicks: presenceKicks,
  });
}

function mergeGameRanksForServer(prev, incoming) {
  var IDS = ["candy", "merge2048", "snake", "memory", "breakout", "jump", "tetris", "pong", "flappy", "mines", "reaction", "dodge", "suika", "stack", "crossy", "simon", "cleanroute", "invaders", "putting", "crossland"];
  var MAX = 30;
  function normEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var name = raw.name != null ? String(raw.name).trim() : "";
    var score = Number(raw.score);
    if (!name || !isFinite(score)) return null;
    return {
      name: name,
      score: Math.floor(score),
      at: raw.at != null ? String(raw.at) : "",
    };
  }
  function norm(raw) {
    var boards = {};
    IDS.forEach(function (id) {
      boards[id] = [];
    });
    var out = { updatedAt: "", resetAt: "", boards: boards };
    if (!raw || typeof raw !== "object") return out;
    out.updatedAt = raw.updatedAt != null ? String(raw.updatedAt) : "";
    out.resetAt = raw.resetAt != null ? String(raw.resetAt) : "";
    var src = raw.boards && typeof raw.boards === "object" ? raw.boards : raw;
    var resetAt = out.resetAt;
    IDS.forEach(function (id) {
      var list = Array.isArray(src[id]) ? src[id] : [];
      var byName = {};
      list.forEach(function (row) {
        var n = normEntry(row);
        if (!n) return;
        if (resetAt && (!n.at || String(n.at) < String(resetAt))) return;
        var prevE = byName[n.name];
        if (!prevE || n.score > prevE.score) byName[n.name] = n;
      });
      out.boards[id] = Object.keys(byName)
        .map(function (k) {
          return byName[k];
        })
        .sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return String(a.at).localeCompare(String(b.at));
        })
        .slice(0, MAX);
    });
    return out;
  }
  var base = norm(prev);
  var inc = norm(incoming);
  var out = norm(null);
  var baseAt = base.updatedAt || "";
  var incAt = inc.updatedAt || "";
  var baseReset = base.resetAt || "";
  var incReset = inc.resetAt || "";
  out.updatedAt =
    incAt && (!baseAt || String(incAt) >= String(baseAt)) ? incAt : baseAt || incAt;
  out.resetAt =
    incReset && (!baseReset || String(incReset) >= String(baseReset))
      ? incReset
      : baseReset || incReset;
  var resetAt = out.resetAt;
  IDS.forEach(function (id) {
    var byName = {};
    [base.boards[id] || [], inc.boards[id] || []].forEach(function (list) {
      list.forEach(function (row) {
        var n = normEntry(row);
        if (!n) return;
        if (resetAt && (!n.at || String(n.at) < String(resetAt))) return;
        var prevE = byName[n.name];
        if (!prevE || n.score > prevE.score) byName[n.name] = n;
      });
    });
    out.boards[id] = Object.keys(byName)
      .map(function (k) {
        return byName[k];
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.at).localeCompare(String(b.at));
      })
      .slice(0, MAX);
  });
  return out;
}

function mergeHkStorage(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return prev || null;
  if (!prev || typeof prev !== "object") return incoming;

  var prevCd = prev.closeDayAt != null ? String(prev.closeDayAt).trim() : "";
  var incCd = incoming.closeDayAt != null ? String(incoming.closeDayAt).trim() : "";
  var incomingIsStaleClose = !!prevCd && (!incCd || String(incCd) < String(prevCd));
  if (incomingIsStaleClose) {
    // 마감 전 클라이언트의 객실·존 푸시는 무시하되, 인벤 통보·공지 등 당일 업무 데이터는 반영
    var noticeOnly = pickNoticeFieldsForServer(prev, incoming);
    var mbOnly = pickMbInvNoticeFieldsForServer(prev, incoming);
    var staleOut = Object.assign({}, prev, {
      notice: noticeOnly.notice,
      noticeImage: noticeOnly.noticeImages[0] || "",
      noticeImages: noticeOnly.noticeImages,
      noticeUpdatedAt: noticeOnly.noticeUpdatedAt,
      mbInvNotice: mbOnly.mbInvNotice,
      mbInvNoticeImages: mbOnly.mbInvNoticeImages,
      mbInvNoticeUpdatedAt: mbOnly.mbInvNoticeUpdatedAt,
      closeDayAt: prevCd,
      rooms: prev.rooms,
      deletedRooms: prev.deletedRooms,
      customZones: prev.customZones,
      deletedCustomZones: prev.deletedCustomZones,
    });
    if (Object.prototype.hasOwnProperty.call(incoming, "invenNotify")) {
      staleOut.invenNotify = pickInvenNotifyForServer(prev, incoming);
    }
    // 마감 전 클라이언트가 frontEmbedStates를 통째로 덮어 초기화를 깨지 않게 함
    if (Object.prototype.hasOwnProperty.call(incoming, "frontEmbedStates")) {
      staleOut.frontEmbedStates = mergeFrontEmbedStatesForServer(
        prev.frontEmbedStates,
        incoming.frontEmbedStates
      );
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "facilityMiscLog")) {
      staleOut.facilityMiscLog = incoming.facilityMiscLog;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "facilityDailyFoundLog")) {
      staleOut.facilityDailyFoundLog = incoming.facilityDailyFoundLog;
    }
    // 마감 전 클라이언트의 미니채팅은 반영하지 않음 (마감 시 비운 내용을 되살리지 않음)
    if (Object.prototype.hasOwnProperty.call(incoming, "hotelInfo")) {
      staleOut.hotelInfo = incoming.hotelInfo;
    } else if (prev.hotelInfo) {
      staleOut.hotelInfo = prev.hotelInfo;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "complaintTypeAnalysis")) {
      staleOut.complaintTypeAnalysis = mergeComplaintTypeAnalysisForServer(
        prev.complaintTypeAnalysis,
        incoming.complaintTypeAnalysis,
        true
      );
    } else if (prev.complaintTypeAnalysis) {
      staleOut.complaintTypeAnalysis = mergeComplaintTypeAnalysisForServer(
        prev.complaintTypeAnalysis,
        null,
        false
      );
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "trackIt")) {
      staleOut.trackIt = mergeTrackItForServer(prev.trackIt, incoming.trackIt, true);
    } else if (prev.trackIt) {
      staleOut.trackIt = mergeTrackItForServer(prev.trackIt, null, false);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "nightHandover")) {
      staleOut.nightHandover = mergeByDatePackForServer(
        prev.nightHandover,
        incoming.nightHandover,
        true,
        normalizeByDatePackLooseForServer
      );
    } else if (prev.nightHandover) {
      staleOut.nightHandover = prev.nightHandover;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "vipCheckIn")) {
      staleOut.vipCheckIn = mergeByDatePackForServer(
        prev.vipCheckIn,
        incoming.vipCheckIn,
        true,
        normalizeByDatePackLooseForServer
      );
    } else if (prev.vipCheckIn) {
      staleOut.vipCheckIn = prev.vipCheckIn;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "gameRanks")) {
      staleOut.gameRanks = mergeGameRanksForServer(prev.gameRanks, incoming.gameRanks);
    } else if (prev.gameRanks) {
      staleOut.gameRanks = prev.gameRanks;
    }
    staleOut.staffBroadcasts = mergeStaffBroadcastsForServer(
      prev.staffBroadcasts,
      incoming.staffBroadcasts,
      Object.prototype.hasOwnProperty.call(incoming, "staffBroadcasts")
    );
    return staleOut;
  }

  var zonePack = mergeHkCustomZones(prev, incoming);
  var customZones = zonePack.customZones;
  var noticePicked = pickNoticeFieldsForServer(prev, incoming);
  var mbInvPicked = pickMbInvNoticeFieldsForServer(prev, incoming);

  var out = {
    notice: noticePicked.notice,
    noticeImage: noticePicked.noticeImages[0] || "",
    noticeImages: noticePicked.noticeImages,
    noticeUpdatedAt: noticePicked.noticeUpdatedAt,
    mbInvNotice: mbInvPicked.mbInvNotice,
    mbInvNoticeImages: mbInvPicked.mbInvNoticeImages,
    mbInvNoticeUpdatedAt: mbInvPicked.mbInvNoticeUpdatedAt,
    invenNotify: pickInvenNotifyForServer(prev, incoming),
    frontEmbedStates: (function () {
      var prevStates =
        prev.frontEmbedStates && typeof prev.frontEmbedStates === "object"
          ? prev.frontEmbedStates
          : {};
      var incStates =
        Object.prototype.hasOwnProperty.call(incoming, "frontEmbedStates") &&
        incoming.frontEmbedStates &&
        typeof incoming.frontEmbedStates === "object"
          ? incoming.frontEmbedStates
          : null;
      if (!incStates) return prevStates;
      return mergeFrontEmbedStatesForServer(prevStates, incStates);
    })(),
    zoneMemos:
      incoming.zoneMemos && typeof incoming.zoneMemos === "object"
        ? incoming.zoneMemos
        : prev.zoneMemos || { VIP: { text: "", images: [] } },
    customZones: customZones,
    deletedCustomZones: zonePack.deletedCustomZones,
    closeDayAt: incCd && (!prevCd || String(incCd) >= String(prevCd)) ? incCd : prevCd,
    facilityMiscLog: Object.prototype.hasOwnProperty.call(incoming, "facilityMiscLog")
      ? incoming.facilityMiscLog && typeof incoming.facilityMiscLog === "object"
        ? incoming.facilityMiscLog
        : null
      : prev.facilityMiscLog || null,
    facilityDailyFoundLog: Object.prototype.hasOwnProperty.call(
      incoming,
      "facilityDailyFoundLog"
    )
      ? incoming.facilityDailyFoundLog &&
        typeof incoming.facilityDailyFoundLog === "object"
        ? incoming.facilityDailyFoundLog
        : null
      : prev.facilityDailyFoundLog || null,
    rooms: { VIP: [], RC: [], CASINO: [], MOBILE_CI: [], AJ: [], MINIBAR: [], SHUTTLE: [] },
    deletedRooms: {},
    requestDeskChat: (function () {
      if (
        Object.prototype.hasOwnProperty.call(incoming, "requestDeskChat") &&
        Array.isArray(incoming.requestDeskChat) &&
        !incoming.requestDeskChat.length &&
        incCd &&
        (!prevCd || String(incCd) >= String(prevCd))
      ) {
        return [];
      }
      function normChat(arr) {
        if (!Array.isArray(arr)) return [];
        var out = [];
        arr.forEach(function (m) {
          if (!m || typeof m !== "object") return;
          var id = m.id != null ? String(m.id).trim() : "";
          if (!id) return;
          out.push({
            id: id,
            at: m.at != null ? String(m.at) : "",
            by: m.by != null ? String(m.by) : "",
            text: m.text != null ? String(m.text) : "",
          });
        });
        return out;
      }
      var map = {};
      normChat(prev.requestDeskChat).forEach(function (m) {
        map[m.id] = m;
      });
      if (Object.prototype.hasOwnProperty.call(incoming, "requestDeskChat")) {
        normChat(incoming.requestDeskChat).forEach(function (m) {
          var prevM = map[m.id];
          if (!prevM) {
            map[m.id] = m;
            return;
          }
          var ta = new Date(prevM.at || 0).getTime();
          var tb = new Date(m.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          if (tb >= ta) map[m.id] = m;
        });
      }
      return Object.keys(map)
        .map(function (k) {
          return map[k];
        })
        .sort(function (a, b) {
          var ta = new Date(a.at || 0).getTime();
          var tb = new Date(b.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          return ta - tb;
        })
        .slice(-120);
    })(),
    orderDeskChat: (function () {
      if (
        Object.prototype.hasOwnProperty.call(incoming, "orderDeskChat") &&
        Array.isArray(incoming.orderDeskChat) &&
        !incoming.orderDeskChat.length &&
        incCd &&
        (!prevCd || String(incCd) >= String(prevCd))
      ) {
        return [];
      }
      function normChat(arr) {
        if (!Array.isArray(arr)) return [];
        var out = [];
        arr.forEach(function (m) {
          if (!m || typeof m !== "object") return;
          var id = m.id != null ? String(m.id).trim() : "";
          if (!id) return;
          out.push({
            id: id,
            at: m.at != null ? String(m.at) : "",
            by: m.by != null ? String(m.by) : "",
            text: m.text != null ? String(m.text) : "",
          });
        });
        return out;
      }
      var map = {};
      normChat(prev.orderDeskChat).forEach(function (m) {
        map[m.id] = m;
      });
      if (Object.prototype.hasOwnProperty.call(incoming, "orderDeskChat")) {
        normChat(incoming.orderDeskChat).forEach(function (m) {
          var prevM = map[m.id];
          if (!prevM) {
            map[m.id] = m;
            return;
          }
          var ta = new Date(prevM.at || 0).getTime();
          var tb = new Date(m.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          if (tb >= ta) map[m.id] = m;
        });
      }
      return Object.keys(map)
        .map(function (k) {
          return map[k];
        })
        .sort(function (a, b) {
          var ta = new Date(a.at || 0).getTime();
          var tb = new Date(b.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          return ta - tb;
        })
        .slice(-120);
    })(),
    mbCheckDeskChat: (function () {
      if (
        Object.prototype.hasOwnProperty.call(incoming, "mbCheckDeskChat") &&
        Array.isArray(incoming.mbCheckDeskChat) &&
        !incoming.mbCheckDeskChat.length &&
        incCd &&
        (!prevCd || String(incCd) >= String(prevCd))
      ) {
        return [];
      }
      function normChat(arr) {
        if (!Array.isArray(arr)) return [];
        var out = [];
        arr.forEach(function (m) {
          if (!m || typeof m !== "object") return;
          var id = m.id != null ? String(m.id).trim() : "";
          if (!id) return;
          out.push({
            id: id,
            at: m.at != null ? String(m.at) : "",
            by: m.by != null ? String(m.by) : "",
            text: m.text != null ? String(m.text) : "",
          });
        });
        return out;
      }
      var map = {};
      normChat(prev.mbCheckDeskChat).forEach(function (m) {
        map[m.id] = m;
      });
      if (Object.prototype.hasOwnProperty.call(incoming, "mbCheckDeskChat")) {
        normChat(incoming.mbCheckDeskChat).forEach(function (m) {
          var prevM = map[m.id];
          if (!prevM) {
            map[m.id] = m;
            return;
          }
          var ta = new Date(prevM.at || 0).getTime();
          var tb = new Date(m.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          if (tb >= ta) map[m.id] = m;
        });
      }
      return Object.keys(map)
        .map(function (k) {
          return map[k];
        })
        .sort(function (a, b) {
          var ta = new Date(a.at || 0).getTime();
          var tb = new Date(b.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          return ta - tb;
        })
        .slice(-120);
    })(),
    facilityDeskChat: (function () {
      if (
        Object.prototype.hasOwnProperty.call(incoming, "facilityDeskChat") &&
        Array.isArray(incoming.facilityDeskChat) &&
        !incoming.facilityDeskChat.length &&
        incCd &&
        (!prevCd || String(incCd) >= String(prevCd))
      ) {
        return [];
      }
      function normChat(arr) {
        if (!Array.isArray(arr)) return [];
        var out = [];
        arr.forEach(function (m) {
          if (!m || typeof m !== "object") return;
          var id = m.id != null ? String(m.id).trim() : "";
          if (!id) return;
          out.push({
            id: id,
            at: m.at != null ? String(m.at) : "",
            by: m.by != null ? String(m.by) : "",
            text: m.text != null ? String(m.text) : "",
          });
        });
        return out;
      }
      var map = {};
      normChat(prev.facilityDeskChat).forEach(function (m) {
        map[m.id] = m;
      });
      if (Object.prototype.hasOwnProperty.call(incoming, "facilityDeskChat")) {
        normChat(incoming.facilityDeskChat).forEach(function (m) {
          var prevM = map[m.id];
          if (!prevM) {
            map[m.id] = m;
            return;
          }
          var ta = new Date(prevM.at || 0).getTime();
          var tb = new Date(m.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          if (tb >= ta) map[m.id] = m;
        });
      }
      return Object.keys(map)
        .map(function (k) {
          return map[k];
        })
        .sort(function (a, b) {
          var ta = new Date(a.at || 0).getTime();
          var tb = new Date(b.at || 0).getTime();
          if (isNaN(ta)) ta = 0;
          if (isNaN(tb)) tb = 0;
          return ta - tb;
        })
        .slice(-120);
    })(),
    hotelInfo: (function () {
      if (Object.prototype.hasOwnProperty.call(incoming, "hotelInfo") && incoming.hotelInfo) {
        return incoming.hotelInfo;
      }
      return prev.hotelInfo || { text: "", urls: [], pages: [], updatedAt: "" };
    })(),
    complaintTypeAnalysis: mergeComplaintTypeAnalysisForServer(
      prev.complaintTypeAnalysis,
      incoming.complaintTypeAnalysis,
      Object.prototype.hasOwnProperty.call(incoming, "complaintTypeAnalysis")
    ),
    trackIt: mergeTrackItForServer(
      prev.trackIt,
      incoming.trackIt,
      Object.prototype.hasOwnProperty.call(incoming, "trackIt")
    ),
    nightHandover: mergeByDatePackForServer(
      prev.nightHandover,
      incoming.nightHandover,
      Object.prototype.hasOwnProperty.call(incoming, "nightHandover"),
      normalizeByDatePackLooseForServer
    ),
    vipCheckIn: mergeByDatePackForServer(
      prev.vipCheckIn,
      incoming.vipCheckIn,
      Object.prototype.hasOwnProperty.call(incoming, "vipCheckIn"),
      normalizeByDatePackLooseForServer
    ),
    gameRanks: mergeGameRanksForServer(prev.gameRanks, incoming.gameRanks),
    staffBroadcasts: mergeStaffBroadcastsForServer(
      prev.staffBroadcasts,
      incoming.staffBroadcasts,
      Object.prototype.hasOwnProperty.call(incoming, "staffBroadcasts")
    ),
  };

  var mergedDeleted = hkMergeDeletedRoomsMaps(
    prev.deletedRooms,
    Object.prototype.hasOwnProperty.call(incoming, "deletedRooms") ? incoming.deletedRooms : null
  );
  out.deletedRooms = mergedDeleted;
  var incomingDeleted = Object.prototype.hasOwnProperty.call(incoming, "deletedRooms")
    ? incoming.deletedRooms
    : null;
  out.zoneRoomClearAt = hkMergeZoneRoomClearAt(
    prev.zoneRoomClearAt,
    Object.prototype.hasOwnProperty.call(incoming, "zoneRoomClearAt")
      ? incoming.zoneRoomClearAt
      : null
  );

  HK_STANDARD_ZONES.forEach(function (zone) {
    out.rooms[zone] = hkMergeZoneRooms(
      prev.rooms,
      incoming.rooms,
      zone,
      mergedDeleted,
      incomingDeleted,
      out.zoneRoomClearAt,
      prev.deletedRooms
    );
  });

  collectHkCustomZoneIds(customZones).forEach(function (zone) {
    out.rooms[zone] = hkMergeZoneRooms(
      prev.rooms,
      incoming.rooms,
      zone,
      mergedDeleted,
      incomingDeleted,
      out.zoneRoomClearAt,
      prev.deletedRooms
    );
  });

  var closeForRooms = out.closeDayAt || prevCd || "";
  if (closeForRooms) {
    out.rooms = hkFilterRoomsAfterCloseDay(out.rooms, closeForRooms, prev.rooms);
  }

  return out;
}

function replaceLogArray(incoming) {
  return Array.isArray(incoming) ? incoming.slice() : [];
}

  /** 요청 로그: id 기준으로 더 최신 updatedAt/at 을 유지 (시간 입력 등이 옛 스냅샷에 덮이지 않게) */
function mergeRequestLogById(prevArr, incomingArr) {
  var byId = {};
  function hasSched(entry) {
    return !!(entry && entry.sched != null && String(entry.sched).trim());
  }
  function isCancelled(entry) {
    return !!(entry && (entry.cancelled === true || entry.canceled === true));
  }
  function consider(entry) {
    if (!entry || typeof entry !== "object") return;
    var id = entry.id != null ? String(entry.id) : "";
    if (!id) return;
    var cur = byId[id];
    if (!cur) {
      byId[id] = entry;
      return;
    }
    var ta = new Date(cur.updatedAt || cur.at || 0).getTime();
    var tb = new Date(entry.updatedAt || entry.at || 0).getTime();
    if (isNaN(ta)) ta = 0;
    if (isNaN(tb)) tb = 0;
    if (tb > ta) {
      var newer = entry;
      var older = cur;
      var mergedReq = Object.assign({}, older, newer);
      mergedReq.chat = mergeOrderChats(older.chat, newer.chat);
      byId[id] = mergedReq;
      return;
    }
    if (ta > tb) {
      var mergedKeep = Object.assign({}, entry, cur);
      mergedKeep.chat = mergeOrderChats(entry.chat, cur.chat);
      byId[id] = mergedKeep;
      return;
    }
    // 시각 동일: 취소·처리예정 시간이 있는 쪽 우선 (채팅 반응은 항상 병합)
    if (isCancelled(entry) && !isCancelled(cur)) {
      var mCancel = Object.assign({}, cur, entry);
      mCancel.chat = mergeOrderChats(cur.chat, entry.chat);
      byId[id] = mCancel;
      return;
    }
    if (!isCancelled(entry) && isCancelled(cur)) {
      var mKeepCancel = Object.assign({}, entry, cur);
      mKeepCancel.chat = mergeOrderChats(entry.chat, cur.chat);
      byId[id] = mKeepCancel;
      return;
    }
    if (hasSched(entry) && !hasSched(cur)) {
      var mSched = Object.assign({}, cur, entry);
      mSched.chat = mergeOrderChats(cur.chat, entry.chat);
      byId[id] = mSched;
      return;
    }
    if (!hasSched(entry) && hasSched(cur)) {
      var mKeepSched = Object.assign({}, entry, cur);
      mKeepSched.chat = mergeOrderChats(entry.chat, cur.chat);
      byId[id] = mKeepSched;
      return;
    }
    var mEq = Object.assign({}, cur, entry);
    mEq.chat = mergeOrderChats(cur.chat, entry.chat);
    byId[id] = mEq;
  }
  (Array.isArray(prevArr) ? prevArr : []).forEach(consider);
  (Array.isArray(incomingArr) ? incomingArr : []).forEach(consider);
  return Object.keys(byId).map(function (id) {
    return byId[id];
  });
}

function orderEntryClock(entry) {
  if (!entry || typeof entry !== "object") return 0;
  var max = 0;
  Object.keys(entry).forEach(function (key) {
    if (!/At$/.test(key) || !entry[key]) return;
    var t = new Date(entry[key]).getTime();
    if (!isNaN(t) && t > max) max = t;
  });
  (Array.isArray(entry.chat) ? entry.chat : []).forEach(function (msg) {
    if (!msg) return;
    var t = new Date(msg.at || msg.updatedAt || 0).getTime();
    if (!isNaN(t) && t > max) max = t;
  });
  return max;
}

function orderPhaseRank(entry) {
  if (!entry) return 0;
  if (entry.issueOpen === true || String(entry.phase || "") === "issue") return 3;
  var p = String(entry.phase || "alert");
  if (p === "cancelled") return 5;
  if (p === "doorhandle") return 4;
  if (p === "deployed") return 4;
  if (p === "unavailable") return 3;
  if (p === "accepted") return 2;
  return 1;
}

function applyNewerMemoFields(merged, a, b) {
  if (!merged) return merged;
  function memoClock(entry) {
    if (!entry) return 0;
    var t = new Date(entry.memoUpdatedAt || 0).getTime();
    return isNaN(t) ? 0 : t;
  }
  var ta = memoClock(a);
  var tb = memoClock(b);
  var src = null;
  if (tb > ta) src = b;
  else if (ta > tb) src = a;
  if (!src) return merged;
  if (src.memo != null) merged.memo = src.memo;
  if (Object.prototype.hasOwnProperty.call(src, "memoImage")) merged.memoImage = src.memoImage;
  merged.memoUpdatedAt = src.memoUpdatedAt;
  return merged;
}

function mergeChatReactions(ra, rb) {
  var out = {};
  [ra, rb].forEach(function (src) {
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach(function (emoji) {
      var list = Array.isArray(src[emoji]) ? src[emoji] : [];
      if (!out[emoji]) out[emoji] = [];
      list.forEach(function (name) {
        var n = name != null ? String(name) : "";
        if (!n) return;
        if (out[emoji].indexOf(n) < 0) out[emoji].push(n);
      });
      if (!out[emoji].length) delete out[emoji];
    });
  });
  return out;
}

function mergeOrderChats(a, b) {
  var out = [];
  var seen = {};
  [a, b].forEach(function (list) {
    (Array.isArray(list) ? list : []).forEach(function (msg) {
      if (!msg) return;
      var key =
        (msg.id != null ? String(msg.id) : "") ||
        [msg.at || "", msg.by || "", msg.text || msg.message || ""].join("|");
      if (Object.prototype.hasOwnProperty.call(seen, key)) {
        var existing = out[seen[key]];
        if (!existing) return;
        existing.reactions = mergeChatReactions(existing.reactions, msg.reactions);
        if (!existing.id && msg.id) existing.id = msg.id;
        if (msg.updatedAt && (!existing.updatedAt || String(msg.updatedAt) > String(existing.updatedAt))) {
          existing.updatedAt = msg.updatedAt;
        }
        return;
      }
      seen[key] = out.length;
      var copy = Object.assign({}, msg);
      if (copy.reactions && typeof copy.reactions === "object") {
        copy.reactions = mergeChatReactions(copy.reactions, null);
      }
      out.push(copy);
    });
  });
  out.sort(function (x, y) {
    return new Date(x.at || 0).getTime() - new Date(y.at || 0).getTime();
  });
  return out;
}

function mergeOrderLogs(prev, incoming) {
  if (!Array.isArray(incoming)) return Array.isArray(prev) ? prev.slice() : [];
  var map = {};
  (Array.isArray(prev) ? prev : []).forEach(function (entry) {
    if (entry && entry.id) map[entry.id] = entry;
  });
  incoming.forEach(function (entry) {
    if (!entry || !entry.id) return;
    var old = map[entry.id];
    if (!old) {
      map[entry.id] = entry;
      return;
    }
    var incClock = orderEntryClock(entry);
    var oldClock = orderEntryClock(old);
    var incomingWins =
      incClock > oldClock ||
      (incClock === oldClock && orderPhaseRank(entry) >= orderPhaseRank(old));
    var merged = incomingWins
      ? Object.assign({}, old, entry)
      : Object.assign({}, entry, old);
    merged.chat = mergeOrderChats(old.chat, entry.chat);
    applyNewerMemoFields(merged, old, entry);
    map[entry.id] = merged;
  });
  return Object.keys(map)
    .map(function (id) {
      return map[id];
    })
    .sort(function (a, b) {
      return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
    });
}

/** 마감 이후에도 남기는 오더(알림용)만 허용. 시설관리·접수/투입/취소/문제 등은 마감 이전이면 폐기 */
function hkOrderSurvivesCloseDay(entry, closeDayAt) {
  if (!entry) return false;
  if (!closeDayAt) return true;
  var at = entry.updatedAt || entry.at || entry.createdAt || "";
  var ms = new Date(at).getTime();
  var closeMs = new Date(closeDayAt).getTime();
  if (!isNaN(ms) && !isNaN(closeMs) && ms >= closeMs) return true;
  // 마감 시 시설 관리 알림은 유지하지 않음
  if (String(entry.category || "").trim() === "facility") return false;
  var p = entry.phase != null ? String(entry.phase).trim() : "";
  if (
    p === "cancelled" ||
    p === "deployed" ||
    p === "doorhandle" ||
    p === "unavailable" ||
    p === "issue" ||
    p === "accepted"
  ) {
    return false;
  }
  if (entry.issueOpen === true) return false;
  return true;
}

function hkFilterOrdersAfterCloseDay(arr, closeDayAt) {
  if (!Array.isArray(arr)) return [];
  if (!closeDayAt) return arr;
  var kept = 0;
  for (var i = 0; i < arr.length; i++) {
    if (hkOrderSurvivesCloseDay(arr[i], closeDayAt)) kept++;
  }
  if (kept === arr.length) return arr;
  return arr.filter(function (entry) {
    return hkOrderSurvivesCloseDay(entry, closeDayAt);
  });
}

function mergeComplaintTypeAnalysisForServer(prevRaw, incomingRaw, hasIncoming) {
  function norm(raw) {
    if (!raw || typeof raw !== "object") return { updatedAt: "", records: [], deletedIds: {} };
    var deletedIds = {};
    if (raw.deletedIds && typeof raw.deletedIds === "object") {
      Object.keys(raw.deletedIds).forEach(function (id) {
        var key = String(id || "").trim();
        if (!key) return;
        var at = raw.deletedIds[id] != null ? String(raw.deletedIds[id]).trim() : "";
        if (at) deletedIds[key] = at;
      });
    }
    var seen = {};
    var records = [];
    (Array.isArray(raw.records) ? raw.records : []).forEach(function (row) {
      if (!row || typeof row !== "object") return;
      var id = row.id != null ? String(row.id).trim() : "";
      if (!id || seen[id]) return;
      var delAt = deletedIds[id] || "";
      var liveAt =
        (row.updatedAt != null ? String(row.updatedAt) : "") ||
        (row.createdAt != null ? String(row.createdAt) : "");
      if (delAt && (!liveAt || String(delAt) >= String(liveAt))) return;
      seen[id] = true;
      var typeId = row.typeId != null ? String(row.typeId).trim() : "";
      var roomChange = false;
      if (row.roomChange === true || row.roomChange === 1 || row.roomChange === "1") {
        roomChange = true;
      } else if (typeof row.roomChange === "string") {
        var rc = row.roomChange.trim().toUpperCase();
        roomChange = rc === "O" || rc === "Y" || rc === "TRUE";
      }
      records.push({
        id: id,
        createdAt: row.createdAt != null ? String(row.createdAt) : "",
        updatedAt: row.updatedAt != null ? String(row.updatedAt) : "",
        reservationNo: row.reservationNo != null ? String(row.reservationNo) : "",
        guestName: row.guestName != null ? String(row.guestName) : "",
        roomNo: row.roomNo != null ? String(row.roomNo) : "",
        memo: row.memo != null ? String(row.memo) : "",
        typeId: typeId,
        roomChange: roomChange,
      });
    });
    return {
      updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : "",
      records: records,
      deletedIds: deletedIds,
    };
  }
  function mergeDeleted(baseMap, incMap) {
    var out = {};
    var keys = {};
    Object.keys(baseMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(incMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(keys).forEach(function (k) {
      var ba = baseMap && baseMap[k] ? String(baseMap[k]) : "";
      var ia = incMap && incMap[k] ? String(incMap[k]) : "";
      if (ia && (!ba || String(ia) >= String(ba))) out[k] = ia;
      else if (ba) out[k] = ba;
    });
    return out;
  }
  var base = norm(prevRaw);
  if (!hasIncoming) return base;
  var inc = norm(incomingRaw);
  var ba = base.updatedAt || "";
  var ia2 = inc.updatedAt || "";
  if (ia2 && (!ba || String(ia2) > String(ba)) && !inc.records.length) {
    return {
      updatedAt: ia2,
      records: [],
      deletedIds: mergeDeleted(base.deletedIds, inc.deletedIds),
    };
  }
  if (ba && (!ia2 || String(ba) > String(ia2)) && !base.records.length) {
    return {
      updatedAt: ba,
      records: [],
      deletedIds: mergeDeleted(base.deletedIds, inc.deletedIds),
    };
  }
  var deletedIds = mergeDeleted(base.deletedIds, inc.deletedIds);
  var map = {};
  base.records.forEach(function (r) {
    map[r.id] = r;
  });
  inc.records.forEach(function (r) {
    var p = map[r.id];
    if (!p) {
      map[r.id] = r;
      return;
    }
    var pa = p.updatedAt || p.createdAt || "";
    var ia = r.updatedAt || r.createdAt || "";
    if (!pa || (ia && String(ia) >= String(pa))) map[r.id] = r;
  });
  Object.keys(map).forEach(function (id) {
    var delAt = deletedIds[id] || "";
    var liveAt = map[id].updatedAt || map[id].createdAt || "";
    if (delAt && (!liveAt || String(delAt) >= String(liveAt))) delete map[id];
  });
  return {
    updatedAt: ia2 && (!ba || String(ia2) >= String(ba)) ? ia2 : ba || ia2,
    records: Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        var ta = a.createdAt || "";
        var tb = b.createdAt || "";
        if (ta !== tb) return String(ta).localeCompare(String(tb));
        return String(a.id).localeCompare(String(b.id));
      }),
    deletedIds: deletedIds,
  };
}

function mergeTrackItForServer(prevRaw, incomingRaw, hasIncoming) {
  function norm(raw) {
    if (!raw || typeof raw !== "object") return { updatedAt: "", records: [], deletedIds: {} };
    var deletedIds = {};
    if (raw.deletedIds && typeof raw.deletedIds === "object") {
      Object.keys(raw.deletedIds).forEach(function (id) {
        var key = String(id || "").trim();
        if (!key) return;
        var at = raw.deletedIds[id] != null ? String(raw.deletedIds[id]).trim() : "";
        if (at) deletedIds[key] = at;
      });
    }
    var seen = {};
    var records = [];
    (Array.isArray(raw.records) ? raw.records : []).forEach(function (row) {
      if (!row || typeof row !== "object") return;
      var id = row.id != null ? String(row.id).trim() : "";
      if (!id || seen[id]) return;
      var delAt = deletedIds[id] || "";
      var liveAt =
        (row.updatedAt != null ? String(row.updatedAt) : "") ||
        (row.createdAt != null ? String(row.createdAt) : "");
      if (delAt && (!liveAt || String(delAt) >= String(liveAt))) return;
      seen[id] = true;
      var shipType = row.shipType != null ? String(row.shipType).trim() : "cod";
      if (shipType !== "urgent") shipType = "cod";
      var shippedOk =
        row.shippedOk === true ||
        row.shippedOk === 1 ||
        row.shippedOk === "1" ||
        String(row.shippedOk || "").toUpperCase() === "Y" ||
        String(row.shippedOk || "").toUpperCase() === "TRUE";
      records.push({
        id: id,
        createdAt: row.createdAt != null ? String(row.createdAt) : "",
        updatedAt: row.updatedAt != null ? String(row.updatedAt) : "",
        shipType: shipType,
        address: row.address != null ? String(row.address) : "",
        zip: row.zip != null ? String(row.zip) : "",
        name: row.name != null ? String(row.name) : "",
        phone: row.phone != null ? String(row.phone) : "",
        item: row.item != null ? String(row.item) : "",
        checkoutDate: row.checkoutDate != null ? String(row.checkoutDate) : "",
        roomNo: row.roomNo != null ? String(row.roomNo) : "",
        shippedOk: shippedOk,
        shippedAt: row.shippedAt != null ? String(row.shippedAt) : "",
      });
    });
    return {
      updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : "",
      records: records,
      deletedIds: deletedIds,
    };
  }
  function mergeDeleted(baseMap, incMap) {
    var out = {};
    var keys = {};
    Object.keys(baseMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(incMap || {}).forEach(function (k) {
      keys[k] = true;
    });
    Object.keys(keys).forEach(function (k) {
      var ba = baseMap && baseMap[k] ? String(baseMap[k]) : "";
      var ia = incMap && incMap[k] ? String(incMap[k]) : "";
      if (ia && (!ba || String(ia) >= String(ba))) out[k] = ia;
      else if (ba) out[k] = ba;
    });
    return out;
  }
  var base = norm(prevRaw);
  if (!hasIncoming) return base;
  var inc = norm(incomingRaw);
  var ba = base.updatedAt || "";
  var ia2 = inc.updatedAt || "";
  if (ia2 && (!ba || String(ia2) > String(ba)) && !inc.records.length) {
    return {
      updatedAt: ia2,
      records: [],
      deletedIds: mergeDeleted(base.deletedIds, inc.deletedIds),
    };
  }
  if (ba && (!ia2 || String(ba) > String(ia2)) && !base.records.length) {
    return {
      updatedAt: ba,
      records: [],
      deletedIds: mergeDeleted(base.deletedIds, inc.deletedIds),
    };
  }
  var deletedIds = mergeDeleted(base.deletedIds, inc.deletedIds);
  var map = {};
  base.records.forEach(function (r) {
    map[r.id] = r;
  });
  inc.records.forEach(function (r) {
    var p = map[r.id];
    if (!p) {
      map[r.id] = r;
      return;
    }
    var pa = p.updatedAt || p.createdAt || "";
    var ia = r.updatedAt || r.createdAt || "";
    if (!pa || (ia && String(ia) >= String(pa))) map[r.id] = r;
  });
  Object.keys(map).forEach(function (id) {
    var delAt = deletedIds[id] || "";
    var liveAt = (map[id].updatedAt || map[id].createdAt || "");
    if (delAt && (!liveAt || String(delAt) >= String(liveAt))) delete map[id];
  });
  return {
    updatedAt: ia2 && (!ba || String(ia2) >= String(ba)) ? ia2 : ba || ia2,
    records: Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        var ta = a.createdAt || "";
        var tb = b.createdAt || "";
        if (ta !== tb) return String(ta).localeCompare(String(tb));
        return String(a.id).localeCompare(String(b.id));
      }),
    deletedIds: deletedIds,
  };
}

function pickUpdatedAtDocForServer(prevRaw, incomingRaw, hasIncoming) {
  if (!hasIncoming) return prevRaw && typeof prevRaw === "object" ? prevRaw : null;
  var prev = prevRaw && typeof prevRaw === "object" ? prevRaw : null;
  var inc = incomingRaw && typeof incomingRaw === "object" ? incomingRaw : null;
  if (!prev) return inc;
  if (!inc) return prev;
  var ba = prev.updatedAt != null ? String(prev.updatedAt) : "";
  var ia = inc.updatedAt != null ? String(inc.updatedAt) : "";
  if (ia && (!ba || String(ia) >= String(ba))) return inc;
  return prev;
}

function normalizeByDatePackLooseForServer(raw) {
  if (!raw || typeof raw !== "object") {
    return { activeDate: "", updatedAt: "", byDate: {} };
  }
  if (raw.byDate && typeof raw.byDate === "object") {
    var byDate = {};
    Object.keys(raw.byDate).forEach(function (k) {
      var day = raw.byDate[k];
      if (!day || typeof day !== "object") return;
      byDate[k] = day;
    });
    var packOut = {
      activeDate: raw.activeDate != null ? String(raw.activeDate) : "",
      updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : "",
      byDate: byDate,
    };
    if (raw.ui && typeof raw.ui === "object") packOut.ui = raw.ui;
    return packOut;
  }
  /* legacy flat day document */
  var inferred =
    (raw.activeDate != null && String(raw.activeDate).trim()) ||
    (raw.dateKey != null && String(raw.dateKey).trim()) ||
    (raw.updatedAt != null && /^\d{4}-\d{2}-\d{2}/.test(String(raw.updatedAt))
      ? String(raw.updatedAt).slice(0, 10)
      : "") ||
    "legacy";
  var day = Object.assign({}, raw);
  day.dateKey = inferred;
  var pack = {
    activeDate: inferred,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : "",
    byDate: {},
  };
  pack.byDate[inferred] = day;
  if (raw.ui && typeof raw.ui === "object") pack.ui = raw.ui;
  return pack;
}

var BY_DATE_KEEP_DAYS_SERVER = 35;

function pad2ForDateKey(n) {
  n = Number(n);
  return n < 10 ? "0" + n : String(n);
}

function formatDateKeyForServer(d) {
  d = d instanceof Date ? d : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return (
    d.getFullYear() +
    "-" +
    pad2ForDateKey(d.getMonth() + 1) +
    "-" +
    pad2ForDateKey(d.getDate())
  );
}

/** Client pruneByDateMap 와 동일: cutoff = today - keepDays, 키 >= cutoffKey, 최신 keepDays개 상한 */
function pruneByDateMapForServer(byDate, keepDays) {
  byDate = byDate && typeof byDate === "object" ? byDate : {};
  keepDays = keepDays != null ? keepDays : BY_DATE_KEEP_DAYS_SERVER;
  var cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - keepDays);
  var cutoffKey = formatDateKeyForServer(cutoff);
  var out = {};
  Object.keys(byDate).forEach(function (k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(k || "").trim())) return;
    if (String(k) >= cutoffKey) out[k] = byDate[k];
  });
  var keys = Object.keys(out).sort();
  if (keys.length > keepDays) {
    var keep = keys.slice(-keepDays);
    var trimmed = {};
    keep.forEach(function (k) {
      trimmed[k] = out[k];
    });
    return trimmed;
  }
  return out;
}

function applyByDatePruneToPack(pack) {
  if (!pack || typeof pack !== "object") return pack;
  pack.byDate = pruneByDateMapForServer(pack.byDate);
  var keys = Object.keys(pack.byDate || {}).sort();
  if (pack.activeDate && keys.indexOf(String(pack.activeDate)) < 0) {
    pack.activeDate = keys.length ? keys[keys.length - 1] : "";
  }
  return pack;
}

function mergeByDatePackForServer(prev, inc, hasIncoming, normalizePack) {
  var normalize =
    typeof normalizePack === "function" ? normalizePack : normalizeByDatePackLooseForServer;
  if (!hasIncoming) {
    return prev && typeof prev === "object" ? applyByDatePruneToPack(normalize(prev)) : null;
  }
  var base = normalize(prev && typeof prev === "object" ? prev : null);
  var incoming = normalize(inc && typeof inc === "object" ? inc : null);
  if (!prev || typeof prev !== "object") return applyByDatePruneToPack(incoming);
  if (!inc || typeof inc !== "object") return applyByDatePruneToPack(base);

  var byDate = {};
  var baseMap = base.byDate || {};
  var incMap = incoming.byDate || {};
  var keys = {};
  Object.keys(baseMap).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(incMap).forEach(function (k) {
    keys[k] = true;
  });
  Object.keys(keys).forEach(function (k) {
    var bd = baseMap[k];
    var id = incMap[k];
    if (!bd) {
      byDate[k] = id;
      return;
    }
    if (!id) {
      byDate[k] = bd;
      return;
    }
    var ba = bd.updatedAt != null ? String(bd.updatedAt) : "";
    var ia = id.updatedAt != null ? String(id.updatedAt) : "";
    byDate[k] = ia && (!ba || String(ia) >= String(ba)) ? id : bd;
  });

  byDate = pruneByDateMapForServer(byDate);

  var baPack = base.updatedAt != null ? String(base.updatedAt) : "";
  var iaPack = incoming.updatedAt != null ? String(incoming.updatedAt) : "";
  var newerIsInc = iaPack && (!baPack || String(iaPack) >= String(baPack));
  var activeDate = "";
  if (newerIsInc && incoming.activeDate) activeDate = String(incoming.activeDate);
  else if (!newerIsInc && base.activeDate) activeDate = String(base.activeDate);
  else if (incoming.activeDate) activeDate = String(incoming.activeDate);
  else if (base.activeDate) activeDate = String(base.activeDate);
  else {
    var sorted = Object.keys(byDate).sort();
    activeDate = sorted.length ? sorted[sorted.length - 1] : "";
  }
  var dateKeys = Object.keys(byDate).sort();
  if (activeDate && dateKeys.indexOf(String(activeDate)) < 0) {
    activeDate = dateKeys.length ? dateKeys[dateKeys.length - 1] : "";
  }

  var updatedAt = baPack;
  if (iaPack && (!updatedAt || String(iaPack) >= String(updatedAt))) updatedAt = iaPack;
  Object.keys(byDate).forEach(function (k) {
    var u = byDate[k] && byDate[k].updatedAt != null ? String(byDate[k].updatedAt) : "";
    if (u && (!updatedAt || String(u) > String(updatedAt))) updatedAt = u;
  });

  var ui = null;
  var baseUi = base.ui && typeof base.ui === "object" ? base.ui : null;
  var incUi = incoming.ui && typeof incoming.ui === "object" ? incoming.ui : null;
  function uiHasContent(u) {
    return !!(u && typeof u === "object" && Object.keys(u).length);
  }
  if (newerIsInc && uiHasContent(incUi)) ui = incUi;
  else if (!newerIsInc && uiHasContent(baseUi)) ui = baseUi;
  else if (uiHasContent(incUi)) ui = incUi;
  else if (uiHasContent(baseUi)) ui = baseUi;

  var mergedPack = {
    activeDate: activeDate,
    updatedAt: updatedAt,
    byDate: byDate,
  };
  if (ui) mergedPack.ui = ui;
  return mergedPack;
}

function adminInquiryHasReply(entry) {
  if (!entry) return false;
  if (entry.replyAt != null && String(entry.replyAt).trim()) return true;
  if (entry.reply != null && String(entry.reply).trim()) return true;
  return String(entry.status || "") === "answered";
}

function mergeAdminInquiries(prev, incoming) {
  if (!Array.isArray(incoming)) {
    return Array.isArray(prev) ? prev.slice() : [];
  }
  var map = {};
  (Array.isArray(prev) ? prev : []).forEach(function (entry) {
    if (entry && entry.id) map[entry.id] = entry;
  });
  incoming.forEach(function (entry) {
    if (!entry || !entry.id) return;
    var prevEntry = map[entry.id];
    if (!prevEntry) {
      map[entry.id] = entry;
      return;
    }
    var merged = Object.assign({}, prevEntry, entry);
    var prevHasReply = adminInquiryHasReply(prevEntry);
    var incHasReply = adminInquiryHasReply(entry);
    // 답변 없는 옛 클라이언트가 전체 목록을 밀어올려 답변을 지우는 것 방지
    if (prevHasReply && !incHasReply) {
      merged.reply = prevEntry.reply;
      merged.replyAt = prevEntry.replyAt;
      merged.replyBy = prevEntry.replyBy;
      merged.status = prevEntry.status || "answered";
    } else if (prevHasReply && incHasReply) {
      var prevReplyAt = prevEntry.replyAt != null ? String(prevEntry.replyAt) : "";
      var incReplyAt = entry.replyAt != null ? String(entry.replyAt) : "";
      if (prevReplyAt && incReplyAt && incReplyAt < prevReplyAt) {
        merged.reply = prevEntry.reply;
        merged.replyAt = prevEntry.replyAt;
        merged.replyBy = prevEntry.replyBy;
        merged.status = prevEntry.status;
      }
    }
    var prevAt = prevEntry.at != null ? String(prevEntry.at) : "";
    var incAt = entry.at != null ? String(entry.at) : "";
    if (prevAt && incAt && incAt < prevAt) {
      merged.at = prevEntry.at;
      merged.by = prevEntry.by;
      merged.text = prevEntry.text;
    }
    map[entry.id] = merged;
  });
  return Object.keys(map)
    .map(function (k) {
      return map[k];
    })
    .sort(function (a, b) {
      var ta = new Date(a.at || 0).getTime();
      var tb = new Date(b.at || 0).getTime();
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      return tb - ta;
    });
}

function pickNonEmptyStr(incoming, fallback) {
  const s = incoming != null ? String(incoming).trim() : "";
  if (s) return s;
  return fallback != null ? String(fallback).trim() : "";
}

function isNewerOrEqualUploadedAt(incomingAt, prevAt) {
  const inc = incomingAt != null ? String(incomingAt).trim() : "";
  if (!inc) return false;
  const prev = prevAt != null ? String(prevAt).trim() : "";
  if (!prev) return true;
  return inc >= prev;
}

function canApplyRoomingMainSync(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return false;
  if (incoming.roomingClearedAt) return true;
  if (isNewerOrEqualUploadedAt(incoming.roomingUploadedAt, prev && prev.roomingUploadedAt)) {
    return true;
  }
  // 루밍 XML 업로드는 PC 시계가 늦어도 적용한다. 타임스탬프만 보면
  // 루밍 화면은 새 상태인데 서버·정비 오더는 옛 vacRows를 유지한다.
  return Array.isArray(incoming.vacRows) && incoming.vacRows.length > 0;
}

function canApplyFasnRoomingSync(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return false;
  if (incoming.roomingClearedAt) return true;
  return isNewerOrEqualUploadedAt(incoming.fasnUploadedAt, prev && prev.fasnUploadedAt);
}

function mergeVacRowsPreservingFields(incoming, existing) {
  const prevByRoom = {};
  (existing || []).forEach((r) => {
    if (r && r.room) prevByRoom[String(r.room)] = r;
  });
  return (incoming || [])
    .filter((r) => r && r.room)
    .map((r) => {
      const key = String(r.room);
      const old = prevByRoom[key] || {};
      return {
        room: key,
        status: pickNonEmptyStr(r.status, old.status),
        resvStatus: pickNonEmptyStr(r.resvStatus, old.resvStatus),
        blockCode: pickNonEmptyStr(r.blockCode, old.blockCode),
        foStatus: pickNonEmptyStr(r.foStatus, old.foStatus),
        roomType: pickNonEmptyStr(r.roomType, old.roomType),
        computedResvStatuses:
          Array.isArray(r.computedResvStatuses) && r.computedResvStatuses.length
            ? r.computedResvStatuses
            : Array.isArray(old.computedResvStatuses)
              ? old.computedResvStatuses
              : [],
      };
    });
}

function mergeSyncPayload(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return prev || null;
  if (!prev || typeof prev !== "object") return incoming;
  var out = Object.assign({}, prev);
  var applyMainRooming = canApplyRoomingMainSync(prev, incoming);
  var applyFasnRooming = canApplyFasnRoomingSync(prev, incoming);
  if (Object.prototype.hasOwnProperty.call(incoming, "blockMap") && applyMainRooming) {
    out.blockMap = incoming.blockMap;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "vacRows") && applyMainRooming) {
    out.vacRows = mergeVacRowsPreservingFields(incoming.vacRows, prev.vacRows);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "roomResvMap") && applyMainRooming) {
    out.roomResvMap =
      incoming.roomResvMap && typeof incoming.roomResvMap === "object"
        ? Object.assign({}, incoming.roomResvMap)
        : {};
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "excelResvMap") && applyMainRooming) {
    out.excelResvMap =
      incoming.excelResvMap && typeof incoming.excelResvMap === "object"
        ? Object.assign({}, incoming.excelResvMap)
        : {};
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "arrResvTotals") && applyMainRooming) {
    out.arrResvTotals =
      incoming.arrResvTotals && typeof incoming.arrResvTotals === "object"
        ? {
            unit: Number(incoming.arrResvTotals.unit) || 0,
            checkedIn: Number(incoming.arrResvTotals.checkedIn) || 0,
            reserved: Number(incoming.arrResvTotals.reserved) || 0,
          }
        : { unit: 0, checkedIn: 0, reserved: 0 };
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "allStatusRooms") && applyMainRooming) {
    out.allStatusRooms = incoming.allStatusRooms;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "extendedStayRooms")) {
    var prevExtAt =
      prev.extendedStayUpdatedAt != null ? String(prev.extendedStayUpdatedAt).trim() : "";
    var incExtAt =
      incoming.extendedStayUpdatedAt != null
        ? String(incoming.extendedStayUpdatedAt).trim()
        : "";
    // 연박은 시각이 더 최신일 때만 교체 — XML 업로드 PC의 빈 목록이 덮어쓰지 않게 함
    if (!prevExtAt || (incExtAt && incExtAt >= prevExtAt)) {
      out.extendedStayRooms =
        incoming.extendedStayRooms && typeof incoming.extendedStayRooms === "object"
          ? incoming.extendedStayRooms
          : {};
      if (incExtAt) out.extendedStayUpdatedAt = incExtAt;
      else if (!out.extendedStayUpdatedAt) {
        out.extendedStayUpdatedAt = new Date().toISOString();
      }
    }
  } else if (Object.prototype.hasOwnProperty.call(incoming, "extendedStayUpdatedAt")) {
    var onlyAt =
      incoming.extendedStayUpdatedAt != null
        ? String(incoming.extendedStayUpdatedAt).trim()
        : "";
    var prevOnlyAt =
      prev.extendedStayUpdatedAt != null ? String(prev.extendedStayUpdatedAt).trim() : "";
    if (onlyAt && (!prevOnlyAt || onlyAt >= prevOnlyAt)) {
      out.extendedStayUpdatedAt = onlyAt;
    }
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "blockDisplayAliases")) {
    out.blockDisplayAliases = incoming.blockDisplayAliases;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "uploadSummary") && applyMainRooming) {
    out.uploadSummary = incoming.uploadSummary;
  }
  if (
    applyMainRooming &&
    (Object.prototype.hasOwnProperty.call(incoming, "roomingUploadedAt") ||
      (Array.isArray(incoming.vacRows) && incoming.vacRows.length > 0))
  ) {
    var prevUploadAt = prev.roomingUploadedAt != null ? String(prev.roomingUploadedAt) : "";
    var nextUploadAt =
      incoming.roomingUploadedAt != null ? String(incoming.roomingUploadedAt).trim() : "";
    if (!nextUploadAt || (prevUploadAt && nextUploadAt < prevUploadAt)) {
      nextUploadAt = new Date().toISOString();
    }
    out.roomingUploadedAt = nextUploadAt;
    if (nextUploadAt && nextUploadAt !== prevUploadAt) {
      out.__hkClearRpaOnUpload = nextUploadAt;
    }
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "fasnBlockMap") && applyFasnRooming) {
    out.fasnBlockMap = incoming.fasnBlockMap;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "fasnVacRows") && applyFasnRooming) {
    out.fasnVacRows = mergeVacRowsPreservingFields(incoming.fasnVacRows, prev.fasnVacRows);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "fasnAllStatusRooms") && applyFasnRooming) {
    out.fasnAllStatusRooms = incoming.fasnAllStatusRooms;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "fasnUploadSummary") && applyFasnRooming) {
    out.fasnUploadSummary = incoming.fasnUploadSummary;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "fasnUploadedAt") && applyFasnRooming) {
    out.fasnUploadedAt = incoming.fasnUploadedAt;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "roomingClearedAt")) {
    if (incoming.roomingClearedAt) out.roomingClearedAt = incoming.roomingClearedAt;
    else delete out.roomingClearedAt;
  }
  if (
    (Array.isArray(incoming.vacRows) && incoming.vacRows.length > 0) ||
    (Array.isArray(incoming.fasnVacRows) && incoming.fasnVacRows.length > 0)
  ) {
    delete out.roomingClearedAt;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkStorage")) {
    // 마감은 hkCloseDayReset 플래그가 있을 때만 저장소 전체를 교체한다.
    // (hkCloseDayAt만으로 교체하면 일반 동기화와 충돌할 수 있음)
    if (incoming.hkCloseDayReset === true) {
      out.hkStorage = incoming.hkStorage && typeof incoming.hkStorage === "object"
        ? incoming.hkStorage
        : {};
      out.hkCloseDayReset = true;
    } else {
      delete out.hkCloseDayReset;
      // 전체 저장소 거부는 인벤 통보·공지 저장까지 막으므로, mergeHkStorage가
      // 마감 전 객실만 걸러내도록 항상 병합한다.
      out.hkStorage = mergeHkStorage(prev.hkStorage, incoming.hkStorage);
    }
  } else if (incoming.hkCloseDayReset !== true) {
    // hkStorage 없는 일반 sync에서도 마감 플래그가 디스크에 남아
    // 이후 poll마다 강제 교체되는 걸 막는다.
    delete out.hkCloseDayReset;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkRequestLog")) {
    // 마감 초기화([])는 병합하지 않고 교체 — 병합하면 옛 정비등록이 되살아남
    if (incoming.hkCloseDayReset === true) {
      out.hkRequestLog = replaceLogArray(incoming.hkRequestLog);
    } else {
      out.hkRequestLog = mergeRequestLogById(prev.hkRequestLog, incoming.hkRequestLog);
    }
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkOrderLog")) {
    out.hkOrderLog =
      incoming.hkCloseDayReset === true
        ? replaceLogArray(incoming.hkOrderLog)
        : mergeOrderLogs(prev.hkOrderLog, incoming.hkOrderLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkAutoOrderState")) {
    out.hkAutoOrderState = Object.assign(
      {},
      prev.hkAutoOrderState && typeof prev.hkAutoOrderState === "object"
        ? prev.hkAutoOrderState
        : {},
      incoming.hkAutoOrderState && typeof incoming.hkAutoOrderState === "object"
        ? incoming.hkAutoOrderState
        : {}
    );
  }
  if (out.__hkClearRpaOnUpload) {
    var uploadAck = String(out.__hkClearRpaOnUpload);
    delete out.__hkClearRpaOnUpload;
    var cancelAt = new Date().toISOString();
    var logSrc = Array.isArray(out.hkOrderLog)
      ? out.hkOrderLog
      : Array.isArray(prev.hkOrderLog)
        ? prev.hkOrderLog
        : [];
    out.hkOrderLog = logSrc.map(function (entry) {
      if (!entry) return entry;
      var kind = entry.autoOrderKind;
      if (kind !== "rpa_check" && kind !== "rpa_check_maint") return entry;
      var phase = entry.phase != null ? String(entry.phase).trim() : "";
      if (phase && phase !== "alert" && phase !== "pending") return entry;
      return Object.assign({}, entry, {
        phase: "cancelled",
        cancelledAt: cancelAt,
        updatedAt: cancelAt,
      });
    });
    out.hkAutoOrderState = Object.assign(
      {},
      out.hkAutoOrderState && typeof out.hkAutoOrderState === "object"
        ? out.hkAutoOrderState
        : prev.hkAutoOrderState && typeof prev.hkAutoOrderState === "object"
          ? prev.hkAutoOrderState
          : {},
      { rpaAckAt: uploadAck }
    );
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkMbInvLog")) {
    out.hkMbInvLog =
      incoming.hkCloseDayReset === true
        ? replaceLogArray(incoming.hkMbInvLog)
        : replaceLogArray(incoming.hkMbInvLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkMbCheckLog")) {
    out.hkMbCheckLog =
      incoming.hkCloseDayReset === true
        ? replaceLogArray(incoming.hkMbCheckLog)
        : replaceLogArray(incoming.hkMbCheckLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkFrontChat")) {
    out.hkFrontChat =
      incoming.hkCloseDayReset === true
        ? capChatArray(replaceLogArray(incoming.hkFrontChat))
        : capChatArray(mergeOrderChats(prev.hkFrontChat, incoming.hkFrontChat));
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkTeamChat")) {
    out.hkTeamChat =
      incoming.hkCloseDayReset === true
        ? capChatArray(replaceLogArray(incoming.hkTeamChat))
        : capChatArray(mergeOrderChats(prev.hkTeamChat, incoming.hkTeamChat));
  }
  // 두 채팅은 절대 서로 복사하지 않음 — 키만 없으면 빈 배열로 유지
  if (!Array.isArray(out.hkTeamChat)) out.hkTeamChat = [];
  if (!Array.isArray(out.hkFrontChat)) out.hkFrontChat = [];
  if (Object.prototype.hasOwnProperty.call(incoming, "hkAdminInquiries")) {
    out.hkAdminInquiries = mergeAdminInquiries(
      prev.hkAdminInquiries,
      incoming.hkAdminInquiries
    );
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkCancelLog")) {
    out.hkCancelLog = replaceLogArray(incoming.hkCancelLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkUseLog")) {
    out.hkUseLog = replaceLogArray(incoming.hkUseLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkChangeLog")) {
    out.hkChangeLog = replaceLogArray(incoming.hkChangeLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkLastRoomChange")) {
    out.hkLastRoomChange = incoming.hkLastRoomChange || null;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkCloseDayAt")) {
    var prevClose = prev.hkCloseDayAt != null ? String(prev.hkCloseDayAt) : "";
    var incClose = incoming.hkCloseDayAt != null ? String(incoming.hkCloseDayAt) : "";
    if (incoming.hkCloseDayReset === true || !prevClose || (incClose && incClose >= prevClose)) {
      out.hkCloseDayAt = incoming.hkCloseDayAt || null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkClearLocalCaches")) {
    out.hkClearLocalCaches = incoming.hkClearLocalCaches === true;
  } else if (incoming.hkCloseDayReset === true) {
    out.hkClearLocalCaches = true;
  } else {
    delete out.hkClearLocalCaches;
  }

  // 마감 리셋 시 빠짐없이 당일 업무 필드 비움 (클라이언트가 키를 빼먹어도 서버에 잔존하지 않음)
  if (incoming.hkCloseDayReset === true) {
    if (!Object.prototype.hasOwnProperty.call(incoming, "hkRequestLog")) out.hkRequestLog = [];
    if (!Object.prototype.hasOwnProperty.call(incoming, "hkMbInvLog")) out.hkMbInvLog = [];
    if (!Object.prototype.hasOwnProperty.call(incoming, "hkMbCheckLog")) out.hkMbCheckLog = [];
    if (!Object.prototype.hasOwnProperty.call(incoming, "hkCancelLog")) out.hkCancelLog = [];
    if (!Object.prototype.hasOwnProperty.call(incoming, "hkUseLog")) out.hkUseLog = [];
    if (!Object.prototype.hasOwnProperty.call(incoming, "hkChangeLog")) out.hkChangeLog = [];
    if (!Object.prototype.hasOwnProperty.call(incoming, "hkLastRoomChange")) {
      out.hkLastRoomChange = null;
    }
    if (!Object.prototype.hasOwnProperty.call(incoming, "extendedStayRooms")) {
      out.extendedStayRooms = {};
      out.extendedStayUpdatedAt =
        (incoming.hkCloseDayAt && String(incoming.hkCloseDayAt)) ||
        new Date().toISOString();
    }
    out.hkClearLocalCaches = true;
  }

  // 마감 시각 이전 요청·MB·취소/사용/변경 로그는 서버에서도 폐기
  var closeAtFilter =
    (out.hkCloseDayAt != null && String(out.hkCloseDayAt).trim()) ||
    (out.hkStorage && out.hkStorage.closeDayAt
      ? String(out.hkStorage.closeDayAt).trim()
      : "");
  if (closeAtFilter) {
    if (Array.isArray(out.hkRequestLog)) {
      out.hkRequestLog = hkFilterLogAfterCloseDay(out.hkRequestLog, closeAtFilter);
    }
    if (Array.isArray(out.hkMbInvLog)) {
      out.hkMbInvLog = hkFilterLogAfterCloseDay(out.hkMbInvLog, closeAtFilter);
    }
    if (Array.isArray(out.hkMbCheckLog)) {
      out.hkMbCheckLog = hkFilterLogAfterCloseDay(out.hkMbCheckLog, closeAtFilter);
    }
    if (Array.isArray(out.hkCancelLog)) {
      out.hkCancelLog = hkFilterLogAfterCloseDay(out.hkCancelLog, closeAtFilter);
    }
    if (Array.isArray(out.hkUseLog)) {
      out.hkUseLog = hkFilterLogAfterCloseDay(out.hkUseLog, closeAtFilter);
    }
    if (Array.isArray(out.hkChangeLog)) {
      out.hkChangeLog = hkFilterLogAfterCloseDay(out.hkChangeLog, closeAtFilter);
    }
    if (Array.isArray(out.hkOrderLog)) {
      out.hkOrderLog = hkFilterOrdersAfterCloseDay(out.hkOrderLog, closeAtFilter);
    }
  }

  // 마감 리셋 POST가 끝난 뒤에도 플래그가 남으면 이후 poll이 계속 강제 교체하므로
  // 저장 직전 한 번만 쓰고 제거한다 (클라이언트는 hkCloseDayAt으로 새 마감을 감지).
  if (incoming.hkCloseDayReset === true) {
    delete out.hkCloseDayReset;
    delete out.hkClearLocalCaches;
  }

  return out;
}

app.post("/api/sync", checkSyncAuth, function (req, res) {
  const prevOrderLog =
    sharedState.payload && Array.isArray(sharedState.payload.hkOrderLog)
      ? sharedState.payload.hkOrderLog
      : [];
  const prevDirectPack =
    sharedState.payload &&
    sharedState.payload.hkStorage &&
    sharedState.payload.hkStorage.staffBroadcasts
      ? sharedState.payload.hkStorage.staffBroadcasts
      : null;
  const prevPayload = sharedState.payload;
  const nextPayload = mergeSyncPayload(prevPayload, req.body);
  const prevFp = payloadVersionFingerprint(prevPayload);
  const nextFp = payloadVersionFingerprint(nextPayload);
  sharedState.payload = nextPayload;
  if (prevFp !== nextFp) {
    sharedState.version += 1;
    sharedState.updatedAt = new Date().toISOString();
    bumpChangedSyncParts(prevPayload, nextPayload, sharedState.version);
    saveSharedStateToDisk();
  }

  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "hkOrderLog")) {
    const newAlerts = findNewOrderAlerts(
      prevOrderLog,
      nextPayload && nextPayload.hkOrderLog
    );
    if (newAlerts.length) {
      Promise.resolve(sendOrderPushNotifications(newAlerts)).catch(function (err) {
        console.warn("Web Push send failed:", err && err.message ? err.message : err);
      });
    }
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "hkStorage")) {
    const newDirects = findNewDirectAlerts(
      prevDirectPack,
      nextPayload && nextPayload.hkStorage && nextPayload.hkStorage.staffBroadcasts
    );
    if (newDirects.length) {
      Promise.resolve(sendDirectPushNotifications(newDirects)).catch(function (err) {
        console.warn("Web Push 1:1 send failed:", err && err.message ? err.message : err);
      });
    }
  }

  res.json({
    ok: true,
    version: sharedState.version,
    updatedAt: sharedState.updatedAt,
    partVersions: syncPartVersionsSnapshot(),
    // 클라이언트가 보낸 키의 서버 merge 결과를 돌려줘 로컬이 빈/부분 상태로 version만 맞추지 않게 함
    payload: (function () {
      var body = req.body && typeof req.body === "object" ? req.body : {};
      var next = nextPayload && typeof nextPayload === "object" ? nextPayload : {};
      var echo = {};
      var keys = [
        "hkAdminInquiries",
        "hkRequestLog",
        "hkOrderLog",
        "hkCancelLog",
        "hkUseLog",
        "hkChangeLog",
        "hkMbInvLog",
        "hkMbCheckLog",
        "hkFrontChat",
        "hkTeamChat",
      ];
      keys.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(body, k) && Array.isArray(next[k])) {
          echo[k] = next[k];
        }
      });
      return Object.keys(echo).length ? echo : undefined;
    })(),
  });
});

app.get("/health", function (req, res) {
  res.status(200).send("ok");
});

function htmlToPlainText(html) {
  var s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  var title = "";
  var tm = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tm) title = String(tm[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|br|section|article)>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  s = s
    .split(/\n+/)
    .map(function (line) {
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n");
  if (s.length > 40000) s = s.slice(0, 40000);
  return { title: title, text: s };
}

function isAllowedFetchUrl(raw) {
  try {
    var u = new URL(String(raw || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    var host = String(u.hostname || "").toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

app.post("/api/fetch-page", checkSyncAuth, async function (req, res) {
  var url = req.body && req.body.url != null ? String(req.body.url).trim() : "";
  if (!url || !isAllowedFetchUrl(url)) {
    res.status(400).json({ error: "invalid_url" });
    return;
  }
  try {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, 15000);
    var resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: {
        "User-Agent": "ClearRoomsheetHotelInfoBot/1.0",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      res.status(502).json({ error: "fetch_failed", status: resp.status });
      return;
    }
    var ctype = String(resp.headers.get("content-type") || "").toLowerCase();
    if (ctype && ctype.indexOf("text/html") < 0 && ctype.indexOf("text/plain") < 0 && ctype.indexOf("xml") < 0) {
      res.status(415).json({ error: "unsupported_content", contentType: ctype });
      return;
    }
    var html = await resp.text();
    var parsed = htmlToPlainText(html);
    res.json({
      ok: true,
      url: url,
      finalUrl: resp.url || url,
      title: parsed.title,
      text: parsed.text,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({
      error: "fetch_failed",
      message: err && err.message ? String(err.message) : String(err),
    });
  }
});

function setStaticCacheHeaders(res, filePath) {
  var lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return;
  }
  if (lower.endsWith(".js") || lower.endsWith(".css")) {
    // 배포 직후 구버전 JS가 남지 않도록 사용 전 재검증
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
  }
}

app.use(
  "/inven",
  express.static(path.join(__dirname, "inven"), {
    index: ["index.html", "index.HTML"],
    setHeaders: setStaticCacheHeaders,
  })
);
app.use(
  "/DD",
  express.static(path.join(__dirname, "DD"), {
    index: ["index.html", "index.HTML"],
    setHeaders: setStaticCacheHeaders,
  })
);
app.use(
  "/chichi",
  express.static(path.join(__dirname, "chichi"), {
    index: ["index.html", "index.HTML"],
    setHeaders: setStaticCacheHeaders,
  })
);
app.use(
  express.static(path.join(__dirname), {
    setHeaders: setStaticCacheHeaders,
  })
);

const httpServer = http.createServer(app);
try {
  require("./server-game-rooms").attachGameRooms(httpServer);
} catch (e) {
  console.warn("game rooms:", e);
}
httpServer.listen(PORT, "0.0.0.0", function () {
  console.log("makeroom listening on port " + PORT);
  startAutoOrderScheduler({
    sharedState: sharedState,
    saveSharedStateToDisk: saveSharedStateToDisk,
    getOrderPhase: getOrderPhase,
    findNewOrderAlerts: findNewOrderAlerts,
    sendOrderPushNotifications: sendOrderPushNotifications,
  });
});
