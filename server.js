"use strict";

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

var HK_STANDARD_ZONES = ["VIP", "RC", "CASINO", "MOBILE_CI"];

function copyHkRoomArray(rooms, zone) {
  if (rooms && Array.isArray(rooms[zone])) return rooms[zone].slice();
  return [];
}

function mergeHkCustomZones(prev, incoming) {
  if (Object.prototype.hasOwnProperty.call(incoming, "customZones")) {
    return Array.isArray(incoming.customZones) ? incoming.customZones.slice() : [];
  }
  if (Array.isArray(prev.customZones)) return prev.customZones.slice();
  return [];
}

function collectHkCustomZoneIds(customZones, prevRooms, incomingRooms) {
  var ids = {};
  (customZones || []).forEach(function (z) {
    if (z && z.id) ids[z.id] = true;
  });
  [prevRooms, incomingRooms].forEach(function (rooms) {
    if (!rooms || typeof rooms !== "object") return;
    Object.keys(rooms).forEach(function (k) {
      if (HK_STANDARD_ZONES.indexOf(k) < 0) ids[k] = true;
    });
  });
  return Object.keys(ids);
}

function mergeHkStorage(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return prev || null;
  if (!prev || typeof prev !== "object") return incoming;

  var customZones = mergeHkCustomZones(prev, incoming);
  var out = {
    notice: Object.prototype.hasOwnProperty.call(incoming, "notice")
      ? incoming.notice
      : prev.notice,
    noticeImage: Object.prototype.hasOwnProperty.call(incoming, "noticeImage")
      ? incoming.noticeImage != null
        ? String(incoming.noticeImage)
        : ""
      : prev.noticeImage != null
        ? String(prev.noticeImage)
        : "",
    customZones: customZones,
    rooms: { VIP: [], RC: [], CASINO: [], MOBILE_CI: [] },
  };

  HK_STANDARD_ZONES.forEach(function (zone) {
    var n = incoming.rooms && incoming.rooms[zone];
    if (Array.isArray(n)) {
      out.rooms[zone] = n.slice();
      return;
    }
    out.rooms[zone] = copyHkRoomArray(prev.rooms, zone);
  });

  collectHkCustomZoneIds(customZones, prev.rooms, incoming.rooms).forEach(function (zone) {
    var n = incoming.rooms && incoming.rooms[zone];
    if (Array.isArray(n)) {
      out.rooms[zone] = n.slice();
      return;
    }
    out.rooms[zone] = copyHkRoomArray(prev.rooms, zone);
  });

  return out;
}

function replaceLogArray(incoming) {
  return Array.isArray(incoming) ? incoming.slice() : [];
}

function pickNonEmptyStr(incoming, fallback) {
  const s = incoming != null ? String(incoming).trim() : "";
  if (s) return s;
  return fallback != null ? String(fallback).trim() : "";
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
      };
    });
}

function mergeSyncPayload(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return prev || null;
  if (!prev || typeof prev !== "object") return incoming;
  var out = Object.assign({}, prev);
  if (Object.prototype.hasOwnProperty.call(incoming, "blockMap")) {
    out.blockMap = incoming.blockMap;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "vacRows")) {
    out.vacRows = mergeVacRowsPreservingFields(incoming.vacRows, prev.vacRows);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "roomResvMap")) {
    out.roomResvMap =
      incoming.roomResvMap && typeof incoming.roomResvMap === "object"
        ? Object.assign({}, incoming.roomResvMap)
        : {};
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "allStatusRooms")) {
    out.allStatusRooms = incoming.allStatusRooms;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "extendedStayRooms")) {
    out.extendedStayRooms = incoming.extendedStayRooms;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "blockDisplayAliases")) {
    out.blockDisplayAliases = incoming.blockDisplayAliases;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "uploadSummary")) {
    out.uploadSummary = incoming.uploadSummary;
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkStorage")) {
    out.hkStorage = mergeHkStorage(prev.hkStorage, incoming.hkStorage);
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
});

app.get("/health", function (req, res) {
  res.status(200).send("ok");
});

app.use("/inven", express.static(path.join(__dirname, "inven")));
app.use("/DD", express.static(path.join(__dirname, "DD")));
app.use("/chichi", express.static(path.join(__dirname, "chichi")));
app.use(express.static(path.join(__dirname)));

app.listen(PORT, "0.0.0.0", function () {
  console.log("makeroom listening on port " + PORT);
});
