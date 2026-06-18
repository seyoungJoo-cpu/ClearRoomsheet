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

function mergeHkStorage(prev, incoming) {
  if (!incoming || typeof incoming !== "object") return prev || null;
  if (!prev || typeof prev !== "object") return incoming;
  var out = {
    notice: Object.prototype.hasOwnProperty.call(incoming, "notice") ? incoming.notice : prev.notice,
    rooms: { VIP: [], RC: [], CASINO: [] },
  };
  ["VIP", "RC", "CASINO"].forEach(function (zone) {
    var n = incoming.rooms && incoming.rooms[zone];
    if (Array.isArray(n)) {
      out.rooms[zone] = n.slice();
      return;
    }
    out.rooms[zone] = prev.rooms && Array.isArray(prev.rooms[zone]) ? prev.rooms[zone].slice() : [];
  });
  return out;
}

function replaceLogArray(incoming) {
  return Array.isArray(incoming) ? incoming.slice() : [];
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
    out.hkRequestLog = replaceLogArray(incoming.hkRequestLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkCancelLog")) {
    out.hkCancelLog = replaceLogArray(incoming.hkCancelLog);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "hkUseLog")) {
    out.hkUseLog = replaceLogArray(incoming.hkUseLog);
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
