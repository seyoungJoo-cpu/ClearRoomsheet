"use strict";

// All room records are synthetic. This is intentionally CI-only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

if (process.env.CI !== "true") {
  throw new Error("CI-only: refusing to create files in an operational directory");
}
const root = path.resolve(__dirname, "..");
const fixtures = [
  ["sync-state.json", JSON.stringify({ version: 1, updatedAt: null, payload: { marker: "FAKE-CI-ONLY" }, partVersions: {} })],
  ["push-subs.json", "[]"],
  ["hkvacroom6563812.xml", "<TEST_DATA>FAKE-CI-ONLY</TEST_DATA>"],
  ["hk_allstatus6563818.xml", "<TEST_DATA>FAKE-CI-ONLY</TEST_DATA>"]
];
const created = [];
let child = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
}

async function waitForHealth(base) {
  for (let i = 0; i < 80; i++) {
    if (child && child.exitCode !== null) {
      throw new Error("server exited: " + child.exitCode);
    }
    try {
      const res = await fetch(base + "/health");
      if (res.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("health check timeout");
}

async function check(base, p, expected, headers) {
  const response = await fetch(base + p, { headers });
  assert.equal(response.status, expected, p + " returned " + response.status);
  return response;
}

async function main() {
  for (const [filename, content] of fixtures) {
    const dest = path.join(root, filename);
    assert.equal(fs.existsSync(dest), false, "Refusing to overwrite: " + filename);
    fs.writeFileSync(dest, content, "utf8");
    created.push(dest);
  }
  const port = await freePort();
  const base = "http://127.0.0.1:" + port;
  const password = "FAKE-CI-ONLY-PASSWORD";
  child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), SYNC_PASSWORD: password },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForHealth(base);

  for (const p of ["/", "/index.html", "/hk/hk-sync.js", "/inven/index.html", "/DD/index.html", "/health"]) {
    await check(base, p, 200);
  }
  await check(base, "/api/sync", 401);
  await check(base, "/api/sync", 200, { "X-Sync-Password": password });

  for (const p of [
    "/server.js", "/server-auto-orders.js", "/package.json", "/render.yaml",
    "/sync-state.json", "/push-subs.json", "/close-day-archives/index.json",
    "/%EB%B9%84%EB%B2%88.txt", "/.vapid-keys.json"
  ]) {
    await check(base, p, 404);
  }

  for (const p of ["/hkvacroom6563812.xml", "/hk_allstatus6563818.xml"]) {
    await check(base, p, 401);
    const res = await check(base, p, 200, { "X-Sync-Password": password });
    assert.match(await res.text(), /FAKE-CI-ONLY/);
  }
  console.log("PASS: legacy pages, synchronized API, sensitive paths, authenticated XML");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  if (child) {
    child.kill("SIGTERM");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (const p of created) {
    try { fs.rmSync(p, { force: true }); } catch (_) {}
  }
  for (const name of [".vapid-keys.json", ".push-vapid-marker.txt"]) {
    try { fs.rmSync(path.join(root, name), { force: true }); } catch (_) {}
  }
});
