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

app.post("/api/sync", checkSyncAuth, function (req, res) {
  sharedState.payload = req.body;
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
