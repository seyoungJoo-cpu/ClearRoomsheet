"use strict";

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const SYNC_PASSWORD = process.env.SYNC_PASSWORD || "74321";

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

app.get("/api/sync", checkSyncAuth, function (req, res) {
  res.json({
    version: sharedState.version,
    updatedAt: sharedState.updatedAt,
    payload: sharedState.payload,
  });
});

function mergeRoomsByNumber(prev, incoming) {
  var map = {};
  (prev || []).forEach(function (r) {
    if (r && r.number) map[r.number] = r;
  });
  (incoming || []).forEach(function (r) {
    if (r && r.number) map[r.number] = r;
  });
  return Object.keys(map)
    .map(function (k) {
      return map[k];
    })
    .sort(function (a, b) {
      return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
    });
}

function mergeHkStorage(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return prev || null;
  if (!prev || typeof prev !== "object") return incoming;
  var out = {
    notice: Object.prototype.hasOwnProperty.call(incoming, "notice") ? incoming.notice : prev.notice,
    rooms: { VIP: [], RC: [], CASINO: [] },
  };
  ["VIP", "RC", "CASINO"].forEach(function (zone) {
    var p = prev.rooms && prev.rooms[zone];
    var n = incoming.rooms && incoming.rooms[zone];
    out.rooms[zone] = mergeRoomsByNumber(p, n);
  });
  return out;
}

function logEntryKey(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.id) return "id:" + entry.id;
  if (entry.entryId) return "eid:" + entry.entryId + "|" + (entry.at || "");
  return [entry.at || "", entry.room || "", entry.name || "", entry.sched || ""].join("|");
}

function mergeLogArrays(prev, incoming) {
  if (!Array.isArray(incoming)) return prev;
  if (incoming.length === 0) return [];
  if (!Array.isArray(prev) || !prev.length) return incoming.slice();
  var map = {};
  prev.forEach(function (item) {
    map[logEntryKey(item)] = item;
  });
  incoming.forEach(function (item) {
    map[logEntryKey(item)] = item;
  });
  return Object.keys(map)
    .map(function (k) {
      return map[k];
    })
    .sort(function (a, b) {
      var ta = new Date(a && a.at ? a.at : 0).getTime();
      var tb = new Date(b && b.at ? b.at : 0).getTime();
      return tb - ta;
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
    out.vacRows = incoming.vacRows;
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
    out.hkRequestLog = mergeLogArrays(prev.hkRequestLog, incoming.hkRequestLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkCancelLog")) {
    out.hkCancelLog = mergeLogArrays(prev.hkCancelLog, incoming.hkCancelLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkUseLog")) {
    out.hkUseLog = mergeLogArrays(prev.hkUseLog, incoming.hkUseLog);
  }
  return out;
}

app.post("/api/sync", checkSyncAuth, function (req, res) {
  sharedState.payload = mergeSyncPayload(sharedState.payload, req.body);
  sharedState.version += 1;
  sharedState.updatedAt = new Date().toISOString();
  res.json({
    ok: true,
    version: sharedState.version,
    updatedAt: sharedState.updatedAt,
  });
});

app.get("/health", function (req, res) {
  res.status(200).send("ok");
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, "0.0.0.0", function () {
  console.log("makeroom listening on port " + PORT);
});
