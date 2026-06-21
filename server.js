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

var HK_STANDARD_ZONES = ["VIP", "RC", "CASINO"];

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
    customZones: customZones,
    rooms: { VIP: [], RC: [], CASINO: [] },
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
