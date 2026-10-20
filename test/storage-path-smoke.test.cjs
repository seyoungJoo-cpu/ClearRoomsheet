"use strict";
// Verifies the opt-in durable data directory with only fake CI records.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
if (process.env.CI !== "true") throw new Error("CI only");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "makeroom-disk-test-"));
const fake = { version: 87, updatedAt: "2026-01-01T00:00:00Z", payload: { extendedStayRooms: {"0000":true} }, partVersions: {} };
fs.writeFileSync(path.join(dir,"sync-state.json"),JSON.stringify(fake));
let child;
async function port() { return new Promise((resolve,reject)=>{ const s=net.createServer(); s.once("error",reject); s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
async function run() {
 const p=await port(), base="http://127.0.0.1:"+p, pwd="FAKE-STORAGE-TEST-PASSWORD";
 child=spawn(process.execPath,["server.js"], { cwd:path.resolve(__dirname,".."), env:{...process.env,PORT:String(p),SYNC_PASSWORD:pwd,MAKEROOM_DATA_DIR:dir}, stdio:"ignore" });
 let ready=false;
 for (let i=0;i<80;i++){if(child.exitCode!==null)throw Error("server exited");try {if((await fetch(base+"/health")).ok){ready=true;break;}}catch(_){} await new Promise(r=>setTimeout(r,150));}
 assert.ok(ready, "server failed health");
 const response=await fetch(base+"/api/sync",{headers:{"X-Sync-Password":pwd}});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.version,87,"server failed to read snapshot from configured data directory");
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,"sync-state.json"),"utf8")).version,87);
 assert.equal(fs.existsSync(path.join(dir,".vapid-keys.json")),true,"VAPID keys should be saved in durable directory");
 console.log("PASS: configured persistent state path and VAPID key location");
}
run().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{ if(child){child.kill("SIGTERM");await new Promise(r=>setTimeout(r,250));}fs.rmSync(dir,{recursive:true,force:true}); });
