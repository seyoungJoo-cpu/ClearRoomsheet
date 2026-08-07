"use strict";

const { WebSocketServer } = require("ws");

const GAMES = {
  tank: { max: 2, hz: 20 },
  rts: { max: 2, hz: 10 },
  towerdefense: { max: 2, hz: 10 },
  snakes: { max: 8, hz: 20 },
  airhockey: { max: 2, hz: 20 },
};

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const rooms = new Map();
let nextPlayerId = 1;

function randCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (_) {}
  }
}

function roomSnapshot(room) {
  return {
    type: "room",
    code: room.code,
    game: room.game,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      ready: !!p.ready,
    })),
    max: GAMES[room.game].max,
  };
}

function broadcastRoom(room) {
  const snap = roomSnapshot(room);
  for (const p of room.players) send(p.ws, snap);
}

function broadcastState(room) {
  if (!room.state) return;
  const msg = { type: "state", status: room.status, state: publicState(room) };
  for (const p of room.players) send(p.ws, msg);
}

function publicState(room) {
  const s = room.state;
  if (!s) return null;
  // Strip internal-only fields if any; state objects are already public-friendly.
  return s;
}

function error(ws, message) {
  send(ws, { type: "error", message });
}

function seatedCount(room) {
  return room.players.length;
}

function allReady(room) {
  const max = GAMES[room.game].max;
  if (room.game === "snakes") {
    return room.players.length >= 2 && room.players.every((p) => p.ready);
  }
  return room.players.length === max && room.players.every((p) => p.ready);
}

function clearTick(room) {
  if (room.tickTimer) {
    clearInterval(room.tickTimer);
    room.tickTimer = null;
  }
}

function endGame(room, reason, winnerId) {
  clearTick(room);
  room.status = "ended";
  const ended = {
    type: "ended",
    reason: reason || "ended",
    winnerId: winnerId != null ? winnerId : null,
    state: publicState(room),
  };
  for (const p of room.players) {
    p.ready = false;
    p.input = null;
    send(p.ws, ended);
  }
  broadcastRoom(room);
}

function removePlayer(room, player) {
  const idx = room.players.indexOf(player);
  if (idx >= 0) room.players.splice(idx, 1);
  player.roomCode = null;
  if (!room.players.length) {
    clearTick(room);
    rooms.delete(room.code);
    return;
  }
  if (room.status === "playing") {
    if (room.game === "snakes") {
      // mark dead / continue
      if (room.state && room.state.snakes) {
        const sn = room.state.snakes.find((s) => s.id === player.id);
        if (sn) sn.alive = false;
      }
      broadcastRoom(room);
      checkSnakesEnd(room);
    } else {
      const winner = room.players.find((p) => p.id !== player.id);
      endGame(room, "opponent_left", winner ? winner.id : null);
    }
  } else {
    for (const p of room.players) p.ready = false;
    broadcastRoom(room);
  }
}

function tryStart(room) {
  if (room.status !== "lobby") return;
  if (!allReady(room)) return;
  room.status = "playing";
  for (const p of room.players) {
    p.input = defaultInput(room.game);
    p.ready = false;
  }
  room.state = initState(room);
  broadcastRoom(room);
  broadcastState(room);
  const hz = GAMES[room.game].hz;
  const dt = 1 / hz;
  clearTick(room);
  room.tickTimer = setInterval(() => {
    if (room.status !== "playing") return;
    tick(room, dt);
    broadcastState(room);
  }, Math.round(1000 / hz));
}

function defaultInput(game) {
  if (game === "tank") return { up: false, down: false, left: false, right: false, aim: 0, fire: false };
  if (game === "rts") return { selectIds: [], cmd: null, x: 0, y: 0, buildType: null, unitType: null };
  if (game === "towerdefense") return { action: null, kind: null, slotIndex: -1 };
  if (game === "snakes") return { angle: 0, dx: 0, dy: 0 };
  if (game === "airhockey") return { x: 175, y: 200 };
  return {};
}

/* ===================== TANK ===================== */
function initTank(room) {
  const W = 800,
    H = 600;
  const walls = [
    { x: 350, y: 120, w: 100, h: 40, solid: true },
    { x: 350, y: 440, w: 100, h: 40, solid: true },
    { x: 180, y: 270, w: 60, h: 60, solid: false, hp: 3 },
    { x: 560, y: 270, w: 60, h: 60, solid: false, hp: 3 },
    { x: 370, y: 280, w: 60, h: 40, solid: false, hp: 2 },
  ];
  return {
    W,
    H,
    round: 1,
    wins: [0, 0],
    tanks: [
      { id: room.players[0].id, slot: 0, x: 80, y: 80, aim: 0.4, hp: 3, cd: 0, alive: true },
      { id: room.players[1].id, slot: 1, x: W - 80, y: H - 80, aim: Math.PI + 0.4, hp: 3, cd: 0, alive: true },
    ],
    bullets: [],
    walls,
    roundOverAt: 0,
  };
}

function resetTankRound(state) {
  state.tanks[0].x = 80;
  state.tanks[0].y = 80;
  state.tanks[0].aim = 0.4;
  state.tanks[0].hp = 3;
  state.tanks[0].cd = 0;
  state.tanks[0].alive = true;
  state.tanks[1].x = state.W - 80;
  state.tanks[1].y = state.H - 80;
  state.tanks[1].aim = Math.PI + 0.4;
  state.tanks[1].hp = 3;
  state.tanks[1].cd = 0;
  state.tanks[1].alive = true;
  state.bullets = [];
  state.walls = [
    { x: 350, y: 120, w: 100, h: 40, solid: true },
    { x: 350, y: 440, w: 100, h: 40, solid: true },
    { x: 180, y: 270, w: 60, h: 60, solid: false, hp: 3 },
    { x: 560, y: 270, w: 60, h: 60, solid: false, hp: 3 },
    { x: 370, y: 280, w: 60, h: 40, solid: false, hp: 2 },
  ];
  state.roundOverAt = 0;
}

function rectHit(cx, cy, r, wx, wy, ww, wh) {
  const closestX = Math.max(wx, Math.min(cx, wx + ww));
  const closestY = Math.max(wy, Math.min(cy, wy + wh));
  const dx = cx - closestX,
    dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

function tickTank(room, dt) {
  const s = room.state;
  if (s.roundOverAt) {
    if (Date.now() >= s.roundOverAt) {
      if (s.wins[0] >= 2 || s.wins[1] >= 2) {
        const winner = s.wins[0] >= 2 ? s.tanks[0].id : s.tanks[1].id;
        endGame(room, "match", winner);
        return;
      }
      s.round++;
      resetTankRound(s);
    }
    return;
  }
  const R = 18,
    spd = 160;
  for (let i = 0; i < 2; i++) {
    const t = s.tanks[i];
    if (!t.alive) continue;
    const p = room.players.find((pl) => pl.id === t.id);
    const inp = (p && p.input) || {};
    let dx = 0,
      dy = 0;
    if (inp.up) dy -= 1;
    if (inp.down) dy += 1;
    if (inp.left) dx -= 1;
    if (inp.right) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      let nx = t.x + (dx / len) * spd * dt;
      let ny = t.y + (dy / len) * spd * dt;
      nx = Math.max(R, Math.min(s.W - R, nx));
      ny = Math.max(R, Math.min(s.H - R, ny));
      let blocked = false;
      for (const w of s.walls) {
        if (w.hp != null && w.hp <= 0) continue;
        if (rectHit(nx, t.y, R, w.x, w.y, w.w, w.h)) blocked = true;
      }
      if (!blocked) t.x = nx;
      blocked = false;
      for (const w of s.walls) {
        if (w.hp != null && w.hp <= 0) continue;
        if (rectHit(t.x, ny, R, w.x, w.y, w.w, w.h)) blocked = true;
      }
      if (!blocked) t.y = ny;
    }
    if (typeof inp.aim === "number") t.aim = inp.aim;
    if (t.cd > 0) t.cd -= dt * 1000;
    if (inp.fire && t.cd <= 0) {
      t.cd = 500;
      s.bullets.push({
        x: t.x + Math.cos(t.aim) * 22,
        y: t.y + Math.sin(t.aim) * 22,
        vx: Math.cos(t.aim) * 420,
        vy: Math.sin(t.aim) * 420,
        owner: t.slot,
      });
      inp.fire = false;
    }
  }
  for (let b = s.bullets.length - 1; b >= 0; b--) {
    const bul = s.bullets[b];
    bul.x += bul.vx * dt;
    bul.y += bul.vy * dt;
    if (bul.x < 0 || bul.y < 0 || bul.x > s.W || bul.y > s.H) {
      s.bullets.splice(b, 1);
      continue;
    }
    let hitWall = false;
    for (const w of s.walls) {
      if (w.hp != null && w.hp <= 0) continue;
      if (rectHit(bul.x, bul.y, 4, w.x, w.y, w.w, w.h)) {
        if (w.solid) {
          hitWall = true;
        } else {
          w.hp--;
          hitWall = true;
        }
        break;
      }
    }
    if (hitWall) {
      s.bullets.splice(b, 1);
      continue;
    }
    for (const t of s.tanks) {
      if (!t.alive || t.slot === bul.owner) continue;
      if (Math.hypot(t.x - bul.x, t.y - bul.y) < R + 4) {
        t.hp--;
        s.bullets.splice(b, 1);
        if (t.hp <= 0) {
          t.alive = false;
          const winnerSlot = 1 - t.slot;
          s.wins[winnerSlot]++;
          s.roundOverAt = Date.now() + 1500;
        }
        break;
      }
    }
  }
}

/* ===================== RTS ===================== */
const RTS_UNITS = {
  worker: { cost: 50, hp: 40, dps: 4, range: 18, speed: 70, range: 28 },
  melee: { cost: 80, hp: 90, dps: 14, range: 20, speed: 85, range: 28 },
  ranged: { cost: 100, hp: 55, dps: 12, range: 22, speed: 75, range: 120 },
  bomber: { cost: 140, hp: 45, dps: 40, range: 18, speed: 95, range: 35 },
  tanker: { cost: 160, hp: 200, dps: 10, range: 28, speed: 50, range: 32 },
  duck: { cost: 40, hp: 30, dps: 8, range: 14, speed: 110, range: 24 },
};
const RTS_BUILD = {
  nexus: { cost: 0, hp: 800, w: 56, h: 56 },
  barracks: { cost: 150, hp: 300, w: 48, h: 48 },
  turret: { cost: 120, hp: 220, w: 36, h: 36, range: 160, dps: 18 },
};

function initRts(room) {
  const W = 900,
    H = 600;
  let uid = 1;
  const mkSide = (owner, baseX) => {
    const nexus = {
      id: uid++,
      kind: "building",
      type: "nexus",
      owner,
      x: baseX,
      y: H / 2,
      hp: RTS_BUILD.nexus.hp,
      maxHp: RTS_BUILD.nexus.hp,
      w: 56,
      h: 56,
    };
    const minerals = [];
    for (let i = 0; i < 3; i++) {
      minerals.push({
        id: uid++,
        kind: "mineral",
        x: baseX + (owner === 0 ? 90 : -90),
        y: H / 2 - 80 + i * 80,
        amount: 9999,
      });
    }
    const workers = [];
    for (let i = 0; i < 3; i++) {
      workers.push({
        id: uid++,
        kind: "unit",
        type: "worker",
        owner,
        x: baseX + (owner === 0 ? 40 : -40),
        y: H / 2 - 40 + i * 40,
        hp: RTS_UNITS.worker.hp,
        maxHp: RTS_UNITS.worker.hp,
        r: RTS_UNITS.worker.r,
        tx: null,
        ty: null,
        targetId: null,
        carry: 0,
        atkCd: 0,
      });
    }
    return { nexus, minerals, workers };
  };
  const a = mkSide(0, 100);
  const b = mkSide(1, W - 100);
  return {
    W,
    H,
    nextId: uid,
    gold: [200, 200],
    entities: [...a.workers, ...b.workers, a.nexus, b.nexus],
    minerals: [...a.minerals, ...b.minerals],
    spawnQ: [],
  };
}

function rtsFind(s, id) {
  return s.entities.find((e) => e.id === id);
}

function tickRts(room, dt) {
  const s = room.state;
  // apply one command per player per tick
  for (const p of room.players) {
    const inp = p.input;
    if (!inp || !inp.cmd) continue;
    const owner = p.slot;
    const sels = (inp.selectIds || []).map(Number);
    if (inp.cmd === "move") {
      for (const id of sels) {
        const e = rtsFind(s, id);
        if (e && e.kind === "unit" && e.owner === owner) {
          e.tx = inp.x;
          e.ty = inp.y;
          e.targetId = null;
        }
      }
    } else if (inp.cmd === "attack") {
      for (const id of sels) {
        const e = rtsFind(s, id);
        if (e && e.kind === "unit" && e.owner === owner) {
          e.targetId = inp.targetId || null;
          e.tx = inp.x;
          e.ty = inp.y;
        }
      }
    } else if (inp.cmd === "build") {
      const bt = inp.buildType;
      const def = RTS_BUILD[bt];
      if (def && bt !== "nexus" && s.gold[owner] >= def.cost) {
        const nearNexus = s.entities.find((e) => e.type === "nexus" && e.owner === owner);
        if (nearNexus) {
          s.gold[owner] -= def.cost;
          s.entities.push({
            id: s.nextId++,
            kind: "building",
            type: bt,
            owner,
            x: Math.max(30, Math.min(s.W - 30, inp.x)),
            y: Math.max(30, Math.min(s.H - 30, inp.y)),
            hp: def.hp,
            maxHp: def.hp,
            w: def.w,
            h: def.h,
            atkCd: 0,
          });
        }
      } else if (inp.unitType && RTS_UNITS[inp.unitType]) {
        // spawn from barracks/nexus
        const ut = inp.unitType;
        const udef = RTS_UNITS[ut];
        const from =
          ut === "worker"
            ? s.entities.find((e) => e.type === "nexus" && e.owner === owner)
            : s.entities.find((e) => e.type === "barracks" && e.owner === owner);
        if (from && s.gold[owner] >= udef.cost) {
          s.gold[owner] -= udef.cost;
          s.entities.push({
            id: s.nextId++,
            kind: "unit",
            type: ut,
            owner,
            x: from.x + (owner === 0 ? 40 : -40),
            y: from.y + (Math.random() - 0.5) * 40,
            hp: udef.hp,
            maxHp: udef.hp,
            r: udef.r,
            tx: null,
            ty: null,
            targetId: null,
            carry: 0,
            atkCd: 0,
          });
        }
      }
    }
    inp.cmd = null;
  }

  // workers auto-harvest
  for (const e of s.entities) {
    if (e.kind !== "unit" || e.type !== "worker" || e.hp <= 0) continue;
    if (e.tx != null) continue;
    if (e.carry >= 10) {
      const nexus = s.entities.find((n) => n.type === "nexus" && n.owner === e.owner);
      if (nexus) {
        const d = Math.hypot(nexus.x - e.x, nexus.y - e.y);
        if (d < 40) {
          s.gold[e.owner] += e.carry;
          e.carry = 0;
        } else {
          e.tx = nexus.x;
          e.ty = nexus.y;
        }
      }
    } else {
      const mins = s.minerals.filter((m) => m.amount > 0);
      let best = null,
        bd = 1e9;
      for (const m of mins) {
        const d = Math.hypot(m.x - e.x, m.y - e.y);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) {
        if (bd < 30) {
          best.amount -= dt * 4;
          e.carry = Math.min(10, e.carry + dt * 4);
        } else {
          e.tx = best.x;
          e.ty = best.y;
        }
      }
    }
  }

  // move + combat
  for (const e of s.entities) {
    if (e.kind !== "unit" || e.hp <= 0) continue;
    const def = RTS_UNITS[e.type] || RTS_UNITS.melee;
    if (e.atkCd > 0) e.atkCd -= dt;
    // acquire target
    let target = e.targetId != null ? rtsFind(s, e.targetId) : null;
    if (target && target.hp <= 0) target = null;
    if (!target) {
      let bd = def.range + 40,
        best = null;
      for (const o of s.entities) {
        if (o.owner === e.owner || o.hp <= 0) continue;
        if (o.kind !== "unit" && o.kind !== "building") continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best && bd <= def.range + 20) target = best;
    }
    if (target) {
      const d = Math.hypot(target.x - e.x, target.y - e.y);
      if (d <= def.range) {
        e.tx = null;
        e.ty = null;
        if (e.atkCd <= 0) {
          target.hp -= def.dps * 0.5;
          e.atkCd = 0.5;
          if (e.type === "bomber") {
            target.hp -= 25;
            e.hp = 0;
          }
        }
      } else {
        e.tx = target.x;
        e.ty = target.y;
      }
    }
    if (e.tx != null) {
      const dx = e.tx - e.x,
        dy = e.ty - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        e.tx = null;
        e.ty = null;
      } else {
        e.x += (dx / dist) * def.speed * dt;
        e.y += (dy / dist) * def.speed * dt;
      }
    }
  }

  // turrets
  for (const e of s.entities) {
    if (e.type !== "turret" || e.hp <= 0) continue;
    if (e.atkCd > 0) e.atkCd -= dt;
    const range = RTS_BUILD.turret.range;
    let best = null,
      bd = range;
    for (const o of s.entities) {
      if (o.owner === e.owner || o.hp <= 0 || o.kind !== "unit") continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best && e.atkCd <= 0) {
      best.hp -= RTS_BUILD.turret.dps * 0.4;
      e.atkCd = 0.4;
    }
  }

  s.entities = s.entities.filter((e) => e.hp > 0);
  const n0 = s.entities.find((e) => e.type === "nexus" && e.owner === 0);
  const n1 = s.entities.find((e) => e.type === "nexus" && e.owner === 1);
  if (!n0 || !n1) {
    const winnerSlot = n0 ? 0 : 1;
    const w = room.players.find((p) => p.slot === winnerSlot);
    endGame(room, "nexus", w ? w.id : null);
  }
}

/* ===================== TOWER DEFENSE ===================== */
const TD_TOWERS = {
  single: { cost: 50, dmg: 18, range: 90, rate: 0.7, aoe: 0, slow: 0 },
  aoe: { cost: 80, dmg: 10, range: 70, rate: 1.0, aoe: 50, slow: 0 },
  slow: { cost: 60, dmg: 6, range: 85, rate: 0.8, aoe: 0, slow: 0.45 },
};
const TD_UNITS = {
  fast: { cost: 30, hp: 40, speed: 110, r: 10, gold: 8 },
  tank: { cost: 60, hp: 160, speed: 45, r: 14, gold: 18 },
  swarm: { cost: 25, hp: 22, speed: 90, r: 8, gold: 6, count: 3 },
};

function initTd(room) {
  const slots0 = [],
    slots1 = [];
  for (let i = 0; i < 8; i++) {
    slots0.push({ x: 220, y: 60 + i * 50, tower: null });
    slots1.push({ x: 680, y: 60 + i * 50, tower: null });
  }
  return {
    W: 900,
    H: 500,
    gold: [100, 100],
    life: [20, 20],
    incomeT: 0,
    slots: [slots0, slots1],
    creeps: [],
    nextId: 1,
  };
}

function tickTd(room, dt) {
  const s = room.state;
  s.incomeT += dt;
  if (s.incomeT >= 1) {
    s.incomeT -= 1;
    s.gold[0]++;
    s.gold[1]++;
  }
  for (const p of room.players) {
    const inp = p.input;
    if (!inp || !inp.action) continue;
    const owner = p.slot;
    if (inp.action === "tower") {
      const def = TD_TOWERS[inp.kind];
      const si = inp.slotIndex | 0;
      const slot = s.slots[owner][si];
      if (def && slot && !slot.tower && s.gold[owner] >= def.cost) {
        s.gold[owner] -= def.cost;
        slot.tower = { kind: inp.kind, cd: 0 };
      }
    } else if (inp.action === "send") {
      const def = TD_UNITS[inp.kind];
      if (def && s.gold[owner] >= def.cost) {
        s.gold[owner] -= def.cost;
        const lane = 1 - owner; // send to opponent lane
        const n = def.count || 1;
        for (let i = 0; i < n; i++) {
          s.creeps.push({
            id: s.nextId++,
            owner, // who sent
            lane,
            kind: inp.kind,
            x: s.slots[lane][0].x,
            y: -10 - i * 16,
            hp: def.hp,
            maxHp: def.hp,
            speed: def.speed,
            r: def.r,
            gold: def.gold,
            slowT: 0,
          });
        }
      }
    }
    inp.action = null;
  }

  // towers attack
  for (let lane = 0; lane < 2; lane++) {
    for (const slot of s.slots[lane]) {
      if (!slot.tower) continue;
      const def = TD_TOWERS[slot.tower.kind];
      slot.tower.cd -= dt;
      if (slot.tower.cd > 0) continue;
      const foes = s.creeps.filter((c) => c.lane === lane && c.hp > 0);
      let best = null,
        bd = def.range;
      for (const c of foes) {
        const d = Math.hypot(c.x - slot.x, c.y - slot.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best) {
        slot.tower.cd = def.rate;
        if (def.aoe > 0) {
          for (const c of foes) {
            if (Math.hypot(c.x - best.x, c.y - best.y) <= def.aoe) c.hp -= def.dmg;
          }
        } else {
          best.hp -= def.dmg;
          if (def.slow) best.slowT = Math.max(best.slowT, 1.2);
        }
      }
    }
  }

  for (let i = s.creeps.length - 1; i >= 0; i--) {
    const c = s.creeps[i];
    if (c.hp <= 0) {
      const defender = c.lane;
      s.gold[defender] += c.gold;
      s.creeps.splice(i, 1);
      continue;
    }
    let spd = c.speed;
    if (c.slowT > 0) {
      c.slowT -= dt;
      spd *= 0.55;
    }
    c.y += spd * dt;
    if (c.y > s.H) {
      s.life[c.lane]--;
      s.creeps.splice(i, 1);
    }
  }

  if (s.life[0] <= 0 || s.life[1] <= 0) {
    const winnerSlot = s.life[0] <= 0 ? 1 : 0;
    const w = room.players.find((p) => p.slot === winnerSlot);
    endGame(room, "life", w ? w.id : null);
  }
}

/* ===================== SNAKES ===================== */
function initSnakes(room) {
  const W = 1400,
    H = 900;
  const snakes = room.players.map((p, i) => {
    const ang = (i / Math.max(1, room.players.length)) * Math.PI * 2;
    const cx = W / 2 + Math.cos(ang) * 200;
    const cy = H / 2 + Math.sin(ang) * 160;
    const body = [];
    for (let k = 0; k < 12; k++) body.push({ x: cx - Math.cos(ang) * k * 10, y: cy - Math.sin(ang) * k * 10 });
    return {
      id: p.id,
      slot: p.slot,
      name: p.name,
      angle: ang,
      alive: true,
      body,
      boost: 0,
    };
  });
  const food = [];
  for (let i = 0; i < 40; i++) food.push({ x: Math.random() * W, y: Math.random() * H, r: 5 + Math.random() * 4 });
  return { W, H, snakes, food, startedAt: Date.now(), duration: 180000 };
}

function checkSnakesEnd(room) {
  const s = room.state;
  if (!s) return;
  const alive = s.snakes.filter((sn) => sn.alive);
  if (alive.length <= 1 || Date.now() - s.startedAt >= s.duration) {
    let winner = null;
    if (alive.length === 1) winner = alive[0].id;
    else {
      let best = null,
        bl = -1;
      for (const sn of s.snakes) {
        if (sn.body.length > bl) {
          bl = sn.body.length;
          best = sn.id;
        }
      }
      winner = best;
    }
    endGame(room, alive.length <= 1 ? "last_alive" : "time", winner);
  }
}

function tickSnakes(room, dt) {
  const s = room.state;
  const spd = 140;
  for (const sn of s.snakes) {
    if (!sn.alive) continue;
    const p = room.players.find((pl) => pl.id === sn.id);
    const inp = (p && p.input) || {};
    if (typeof inp.angle === "number") sn.angle = inp.angle;
    else if (inp.dx || inp.dy) sn.angle = Math.atan2(inp.dy || 0, inp.dx || 0);
    const head = sn.body[0];
    const nx = head.x + Math.cos(sn.angle) * spd * dt;
    const ny = head.y + Math.sin(sn.angle) * spd * dt;
    // wall kill
    if (nx < 0 || ny < 0 || nx > s.W || ny > s.H) {
      sn.alive = false;
      continue;
    }
    sn.body.unshift({ x: nx, y: ny });
    // food
    let grew = false;
    for (let i = s.food.length - 1; i >= 0; i--) {
      const f = s.food[i];
      if (Math.hypot(f.x - nx, f.y - ny) < 12 + f.r) {
        s.food.splice(i, 1);
        grew = true;
        s.food.push({ x: Math.random() * s.W, y: Math.random() * s.H, r: 5 + Math.random() * 4 });
        break;
      }
    }
    if (!grew) sn.body.pop();
    else {
      sn.body.push(sn.body[sn.body.length - 1]);
    }
  }
  // collisions
  for (const sn of s.snakes) {
    if (!sn.alive) continue;
    const head = sn.body[0];
    for (const other of s.snakes) {
      if (!other.alive) continue;
      const start = other === sn ? 4 : 0;
      for (let i = start; i < other.body.length; i++) {
        const seg = other.body[i];
        if (Math.hypot(seg.x - head.x, seg.y - head.y) < 8) {
          sn.alive = false;
          break;
        }
      }
      if (!sn.alive) break;
    }
  }
  checkSnakesEnd(room);
}

/* ===================== AIR HOCKEY ===================== */
function initAirhockey(room) {
  const W = 700,
    H = 400;
  return {
    W,
    H,
    score: [0, 0],
    paddles: [
      { id: room.players[0].id, slot: 0, x: 80, y: H / 2, r: 28 },
      { id: room.players[1].id, slot: 1, x: W - 80, y: H / 2, r: 28 },
    ],
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 14 },
    goalHalf: 70,
  };
}

function resetPuck(s, toLeft) {
  s.puck.x = s.W / 2;
  s.puck.y = s.H / 2;
  s.puck.vx = (toLeft ? -1 : 1) * 220;
  s.puck.vy = (Math.random() - 0.5) * 120;
}

function tickAirhockey(room, dt) {
  const s = room.state;
  for (let i = 0; i < 2; i++) {
    const pad = s.paddles[i];
    const p = room.players.find((pl) => pl.id === pad.id);
    const inp = (p && p.input) || {};
    const tx = typeof inp.x === "number" ? inp.x : pad.x;
    const ty = typeof inp.y === "number" ? inp.y : pad.y;
    const maxX0 = s.W * 0.45,
      minX1 = s.W * 0.55;
    let nx = pad.x + (tx - pad.x) * Math.min(1, 12 * dt);
    let ny = pad.y + (ty - pad.y) * Math.min(1, 12 * dt);
    ny = Math.max(pad.r, Math.min(s.H - pad.r, ny));
    if (i === 0) nx = Math.max(pad.r, Math.min(maxX0, nx));
    else nx = Math.max(minX1, Math.min(s.W - pad.r, nx));
    pad.x = nx;
    pad.y = ny;
  }
  const puck = s.puck;
  if (puck.vx === 0 && puck.vy === 0) resetPuck(s, Math.random() < 0.5);
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  if (puck.y < puck.r) {
    puck.y = puck.r;
    puck.vy *= -1;
  }
  if (puck.y > s.H - puck.r) {
    puck.y = s.H - puck.r;
    puck.vy *= -1;
  }
  // goals
  const gh = s.goalHalf;
  if (puck.x < -puck.r) {
    if (Math.abs(puck.y - s.H / 2) < gh) {
      s.score[1]++;
      if (s.score[1] >= 7) {
        endGame(room, "score", s.paddles[1].id);
        return;
      }
      resetPuck(s, false);
    } else {
      puck.x = puck.r;
      puck.vx *= -1;
    }
  }
  if (puck.x > s.W + puck.r) {
    if (Math.abs(puck.y - s.H / 2) < gh) {
      s.score[0]++;
      if (s.score[0] >= 7) {
        endGame(room, "score", s.paddles[0].id);
        return;
      }
      resetPuck(s, true);
    } else {
      puck.x = s.W - puck.r;
      puck.vx *= -1;
    }
  }
  for (const pad of s.paddles) {
    const dx = puck.x - pad.x,
      dy = puck.y - pad.y;
    const d = Math.hypot(dx, dy);
    const minD = puck.r + pad.r;
    if (d < minD && d > 0.001) {
      const nx = dx / d,
        ny = dy / d;
      puck.x = pad.x + nx * minD;
      puck.y = pad.y + ny * minD;
      const dot = puck.vx * nx + puck.vy * ny;
      puck.vx = (puck.vx - 1.8 * dot * nx) + nx * 80;
      puck.vy = (puck.vy - 1.8 * dot * ny) + ny * 80;
      const sp = Math.hypot(puck.vx, puck.vy);
      const maxSp = 520;
      if (sp > maxSp) {
        puck.vx = (puck.vx / sp) * maxSp;
        puck.vy = (puck.vy / sp) * maxSp;
      }
    }
  }
  puck.vx *= 0.999;
  puck.vy *= 0.999;
}

/* ===================== dispatch ===================== */
function initState(room) {
  switch (room.game) {
    case "tank":
      return initTank(room);
    case "rts":
      return initRts(room);
    case "towerdefense":
      return initTd(room);
    case "snakes":
      return initSnakes(room);
    case "airhockey":
      return initAirhockey(room);
    default:
      return {};
  }
}

function tick(room, dt) {
  try {
    switch (room.game) {
      case "tank":
        tickTank(room, dt);
        break;
      case "rts":
        tickRts(room, dt);
        break;
      case "towerdefense":
        tickTd(room, dt);
        break;
      case "snakes":
        tickSnakes(room, dt);
        break;
      case "airhockey":
        tickAirhockey(room, dt);
        break;
    }
  } catch (e) {
    console.warn("game tick:", room.game, e);
  }
}

function lobbyList(game) {
  const list = [];
  for (const room of rooms.values()) {
    if (room.game !== game) continue;
    if (room.status !== "lobby") continue;
    list.push({
      code: room.code,
      players: room.players.length,
      max: GAMES[game].max,
      names: room.players.map((p) => p.name),
    });
  }
  return list;
}

function findPlayerByWs(ws) {
  for (const room of rooms.values()) {
    for (const p of room.players) {
      if (p.ws === ws) return { room, player: p };
    }
  }
  return null;
}

function attachGameRooms(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/hk-game-ws" });

  wss.on("connection", (ws) => {
    ws._name = "Player";
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (_) {
        return error(ws, "invalid_json");
      }
      if (!msg || typeof msg.type !== "string") return error(ws, "bad_message");

      const type = msg.type;
      if (type === "hello") {
        ws._name = String(msg.name || "Player").slice(0, 24) || "Player";
        return send(ws, { type: "hello_ok", name: ws._name });
      }

      if (type === "list") {
        const game = String(msg.game || "");
        if (!GAMES[game]) return error(ws, "unknown_game");
        return send(ws, { type: "lobby_list", game, rooms: lobbyList(game) });
      }

      if (type === "create") {
        const game = String(msg.game || "");
        if (!GAMES[game]) return error(ws, "unknown_game");
        const existing = findPlayerByWs(ws);
        if (existing) removePlayer(existing.room, existing.player);
        const name = String(msg.name || ws._name || "Player").slice(0, 24);
        const code = randCode();
        const room = {
          code,
          game,
          players: [],
          status: "lobby",
          state: null,
          tickTimer: null,
        };
        const player = {
          id: nextPlayerId++,
          name,
          ws,
          slot: 0,
          ready: false,
          input: null,
          roomCode: code,
        };
        room.players.push(player);
        rooms.set(code, room);
        send(ws, { type: "hello_ok", name, playerId: player.id });
        return broadcastRoom(room);
      }

      if (type === "join") {
        const code = String(msg.code || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 4);
        const room = rooms.get(code);
        if (!room) return error(ws, "room_not_found");
        if (room.status !== "lobby") return error(ws, "room_not_joinable");
        if (room.players.length >= GAMES[room.game].max) return error(ws, "room_full");
        const existing = findPlayerByWs(ws);
        if (existing) removePlayer(existing.room, existing.player);
        const name = String(msg.name || ws._name || "Player").slice(0, 24);
        const used = new Set(room.players.map((p) => p.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        const player = {
          id: nextPlayerId++,
          name,
          ws,
          slot,
          ready: false,
          input: null,
          roomCode: code,
        };
        room.players.push(player);
        send(ws, { type: "hello_ok", name, playerId: player.id });
        return broadcastRoom(room);
      }

      const found = findPlayerByWs(ws);
      if (!found) return error(ws, "not_in_room");
      const { room, player } = found;

      if (type === "ready") {
        if (room.status !== "lobby" && room.status !== "ended") return;
        if (room.status === "ended") {
          room.status = "lobby";
          room.state = null;
          for (const p of room.players) p.ready = false;
        }
        player.ready = true;
        broadcastRoom(room);
        return tryStart(room);
      }

      if (type === "input") {
        if (room.status !== "playing") return;
        const payload = msg.payload && typeof msg.payload === "object" ? msg.payload : msg;
        const base = player.input || defaultInput(room.game);
        // fire is edge-triggered for tank
        if (room.game === "tank") {
          player.input = {
            up: !!payload.up,
            down: !!payload.down,
            left: !!payload.left,
            right: !!payload.right,
            aim: typeof payload.aim === "number" ? payload.aim : base.aim,
            fire: !!payload.fire || !!base.fire,
          };
        } else if (room.game === "rts") {
          player.input = {
            selectIds: Array.isArray(payload.selectIds) ? payload.selectIds : base.selectIds,
            cmd: payload.cmd || null,
            x: Number(payload.x) || 0,
            y: Number(payload.y) || 0,
            buildType: payload.buildType || null,
            unitType: payload.unitType || null,
            targetId: payload.targetId,
          };
        } else if (room.game === "towerdefense") {
          player.input = {
            action: payload.action || null,
            kind: payload.kind || null,
            slotIndex: payload.slotIndex != null ? payload.slotIndex : -1,
          };
        } else if (room.game === "snakes") {
          player.input = {
            angle: typeof payload.angle === "number" ? payload.angle : base.angle,
            dx: Number(payload.dx) || 0,
            dy: Number(payload.dy) || 0,
          };
        } else if (room.game === "airhockey") {
          player.input = {
            x: typeof payload.x === "number" ? payload.x : base.x,
            y: typeof payload.y === "number" ? payload.y : base.y,
          };
        } else {
          player.input = Object.assign({}, base, payload);
        }
        return;
      }

      if (type === "leave") {
        removePlayer(room, player);
        return send(ws, { type: "room", code: null, status: "left", players: [] });
      }

      if (type === "rematch") {
        if (room.status !== "ended" && room.status !== "lobby") return error(ws, "not_ended");
        clearTick(room);
        room.status = "lobby";
        room.state = null;
        for (const p of room.players) {
          p.ready = false;
          p.input = null;
        }
        player.ready = true;
        broadcastRoom(room);
        return tryStart(room);
      }

      error(ws, "unknown_type");
    });

    ws.on("close", () => {
      const found = findPlayerByWs(ws);
      if (found) removePlayer(found.room, found.player);
    });
  });

  const pingTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        try {
          ws.terminate();
        } catch (_) {}
        return;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (_) {}
    });
  }, 25000);

  wss.on("close", () => clearInterval(pingTimer));
  console.log("game rooms: WebSocket attached at /hk-game-ws");
  return wss;
}

module.exports = { attachGameRooms };
