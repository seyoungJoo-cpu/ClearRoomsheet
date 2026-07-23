"use strict";

const { startAutoOrderScheduler } = require("./server-auto-orders");

const express = require("express");
const path = require("path");
const fs = require("fs");
const webpush = require("web-push");

const app = express();
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
  if (p === "accepted" || p === "cancelled") return p;
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
  return name != null ? String(name).trim().toLowerCase() : "";
}

function shouldSkipPushToSubscriber(sub, order) {
  var orderBy = normalizePersonName(order && order.by);
  var subBy = normalizePersonName(sub && sub.operatorName);
  if (!orderBy || !subBy) return false;
  return orderBy === subBy;
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
    return;
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

app.use(express.json({ limit: "12mb" }));

app.get("/ping", function (req, res) {
  res.status(200).type("text/plain").send("ok");
});

app.get("/api/sync", checkSyncAuth, function (req, res) {
  res.json({
    version: sharedState.version,
    updatedAt: sharedState.updatedAt,
    payload: sharedState.payload,
  });
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

var HK_STANDARD_ZONES = ["VIP", "RC", "CASINO", "MOBILE_CI", "AJ"];

function copyHkRoomArray(rooms, zone) {
  if (rooms && Array.isArray(rooms[zone])) return rooms[zone].slice();
  return [];
}

function hkRoomNumberKey(number) {
  return String(number == null ? "" : number).trim();
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
  if (ti === "deleted" || tp === "deleted") return null;
  return Object.assign({}, prev, incoming, { tray: ti || tp || "" });
}

function hkMergeRoomArraysByNumber(prevArr, incomingArr, zone, deletedRooms) {
  var map = {};
  function ingest(room) {
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
      if (deletedRooms && deletedRooms[zone]) {
        deletedRooms[zone] = deletedRooms[zone].filter(function (n) {
          return hkRoomNumberKey(n) !== k;
        });
      }
    }
    var merged = map[k] ? hkMergeRoomEntry(map[k], room) : room;
    if (!merged) {
      delete map[k];
      return;
    }
    map[k] = merged;
  }
  (prevArr || []).forEach(ingest);
  (incomingArr || []).forEach(ingest);
  return Object.keys(map).map(function (k) {
    return map[k];
  });
}

function hkMergeZoneRooms(prevRooms, incomingRooms, zone, deletedRooms) {
  var prev = prevRooms && Array.isArray(prevRooms[zone]) ? prevRooms[zone] : [];
  var inc =
    incomingRooms && Array.isArray(incomingRooms[zone]) ? incomingRooms[zone] : [];
  return hkMergeRoomArraysByNumber(prev, inc, zone, deletedRooms);
}

function mergeHkCustomZones(prev, incoming) {
  if (Object.prototype.hasOwnProperty.call(incoming, "customZones")) {
    return Array.isArray(incoming.customZones) ? incoming.customZones.slice() : [];
  }
  if (Array.isArray(prev.customZones)) return prev.customZones.slice();
  return [];
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

function mergeHkStorage(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return prev || null;
  if (!prev || typeof prev !== "object") return incoming;

  var customZones = mergeHkCustomZones(prev, incoming);
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
    invenNotify: Object.prototype.hasOwnProperty.call(incoming, "invenNotify")
      ? incoming.invenNotify
      : prev.invenNotify || null,
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
      var keys = ["dd", "inven", "chichi"];
      var out = {
        dd: prevStates.dd || null,
        inven: prevStates.inven || null,
        chichi: prevStates.chichi || null,
      };
      keys.forEach(function (key) {
        var a = prevStates[key];
        var b = incStates[key];
        if (!b) return;
        if (!a) {
          out[key] = b;
          return;
        }
        var ta = new Date(a.updatedAt || 0).getTime();
        var tb = new Date(b.updatedAt || 0).getTime();
        if (isNaN(ta)) ta = 0;
        if (isNaN(tb)) tb = 0;
        if (tb >= ta) out[key] = b;
      });
      return out;
    })(),
    zoneMemos:
      incoming.zoneMemos && typeof incoming.zoneMemos === "object"
        ? incoming.zoneMemos
        : prev.zoneMemos || { VIP: { text: "", images: [] } },
    customZones: customZones,
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
    rooms: { VIP: [], RC: [], CASINO: [], MOBILE_CI: [], AJ: [] },
    deletedRooms: {},
    requestDeskChat: (function () {
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
  };

  var mergedDeleted = hkMergeDeletedRoomsMaps(
    prev.deletedRooms,
    Object.prototype.hasOwnProperty.call(incoming, "deletedRooms") ? incoming.deletedRooms : null
  );
  out.deletedRooms = mergedDeleted;

  HK_STANDARD_ZONES.forEach(function (zone) {
    out.rooms[zone] = hkMergeZoneRooms(prev.rooms, incoming.rooms, zone, mergedDeleted);
  });

  collectHkCustomZoneIds(customZones).forEach(function (zone) {
    out.rooms[zone] = hkMergeZoneRooms(prev.rooms, incoming.rooms, zone, mergedDeleted);
  });

  return out;
}

function replaceLogArray(incoming) {
  return Array.isArray(incoming) ? incoming.slice() : [];
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
  return isNewerOrEqualUploadedAt(incoming.roomingUploadedAt, prev && prev.roomingUploadedAt);
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
    out.extendedStayRooms = incoming.extendedStayRooms;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "blockDisplayAliases")) {
    out.blockDisplayAliases = incoming.blockDisplayAliases;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "uploadSummary") && applyMainRooming) {
    out.uploadSummary = incoming.uploadSummary;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "roomingUploadedAt") && applyMainRooming) {
    out.roomingUploadedAt = incoming.roomingUploadedAt;
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
    } else {
      out.hkStorage = mergeHkStorage(prev.hkStorage, incoming.hkStorage);
    }
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkRequestLog")) {
    out.hkRequestLog = replaceLogArray(incoming.hkRequestLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkOrderLog")) {
    out.hkOrderLog = replaceLogArray(incoming.hkOrderLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkMbInvLog")) {
    out.hkMbInvLog = replaceLogArray(incoming.hkMbInvLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkMbCheckLog")) {
    out.hkMbCheckLog = replaceLogArray(incoming.hkMbCheckLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkFrontChat")) {
    out.hkFrontChat = replaceLogArray(incoming.hkFrontChat);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkTeamChat")) {
    out.hkTeamChat = replaceLogArray(incoming.hkTeamChat);
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
    out.hkCloseDayAt = incoming.hkCloseDayAt || null;
  }
  return out;
}

app.post("/api/sync", checkSyncAuth, function (req, res) {
  const prevOrderLog =
    sharedState.payload && Array.isArray(sharedState.payload.hkOrderLog)
      ? sharedState.payload.hkOrderLog
      : [];
  const nextPayload = mergeSyncPayload(sharedState.payload, req.body);
  sharedState.payload = nextPayload;
  sharedState.version += 1;
  sharedState.updatedAt = new Date().toISOString();

  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "hkOrderLog")) {
    const newAlerts = findNewOrderAlerts(
      prevOrderLog,
      nextPayload && nextPayload.hkOrderLog
    );
    if (newAlerts.length) {
      sendOrderPushNotifications(newAlerts).catch(function (err) {
        console.warn("Web Push send failed:", err && err.message ? err.message : err);
      });
    }
  }

  res.json({
    ok: true,
    version: sharedState.version,
    updatedAt: sharedState.updatedAt,
  });
  saveSharedStateToDisk();
});

app.get("/health", function (req, res) {
  res.status(200).send("ok");
});

app.use(
  "/inven",
  express.static(path.join(__dirname, "inven"), { index: ["index.html", "index.HTML"] })
);
app.use(
  "/DD",
  express.static(path.join(__dirname, "DD"), { index: ["index.html", "index.HTML"] })
);
app.use(
  "/chichi",
  express.static(path.join(__dirname, "chichi"), { index: ["index.html", "index.HTML"] })
);
app.use(express.static(path.join(__dirname)));

app.listen(PORT, "0.0.0.0", function () {
  console.log("makeroom listening on port " + PORT);
  startAutoOrderScheduler({
    sharedState: sharedState,
    saveSharedStateToDisk: saveSharedStateToDisk,
    getOrderPhase: getOrderPhase,
    findNewOrderAlerts: findNewOrderAlerts,
    sendOrderPushNotifications: sendOrderPushNotifications,
  });
});
