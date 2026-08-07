"use strict";

const { WebSocketServer } = require("ws");

const GAMES = {
  tank: { max: 4, hz: 20 },
  rts: { max: 4, hz: 10 },
  ageofwar: { max: 2, hz: 20 },
  snakes: { max: 8, hz: 15 },
  airhockey: { max: 2, hz: 45 },
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
    mode: room.mode || null,
    status: room.status,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      ready: !!p.ready,
    })),
    max: room.max || GAMES[room.game].max,
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
  const max = room.max || GAMES[room.game].max;
  const humans = room.players.filter((p) => !p.isAi);
  const readyOk = room.players.every((p) => p.ready || p.isAi);
  if (room.game === "snakes" || room.game === "tank") {
    return humans.length >= 2 && humans.length <= max && readyOk;
  }
  if (room.game === "rts") {
    const need = rtsModeNeed(room.mode);
    return humans.length === need && readyOk;
  }
  if (room.game === "ageofwar") {
    return humans.length === 2 && readyOk;
  }
  return room.players.length === max && readyOk;
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
  let winnerName = null;
  if (winnerId != null) {
    const wp = room.players.find((p) => p.id === winnerId);
    if (wp) winnerName = wp.name;
    else if (room.state && room.state.snakes) {
      const sn = room.state.snakes.find((s) => s.id === winnerId);
      if (sn) winnerName = sn.name;
    } else if (room.state && room.state.tanks) {
      const tk = room.state.tanks.find((t) => t.id === winnerId);
      if (tk) winnerName = tk.name;
    }
  }
  const ended = {
    type: "ended",
    reason: reason || "ended",
    winnerId: winnerId != null ? winnerId : null,
    winnerName: winnerName || null,
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
  const game = room.game;
  const idx = room.players.indexOf(player);
  if (idx >= 0) room.players.splice(idx, 1);
  player.roomCode = null;
  if (!room.players.length) {
    clearTick(room);
    rooms.delete(room.code);
    notifyLobby(game);
    return;
  }
  if (room.status === "playing") {
    if (room.game === "snakes") {
      if (room.state && room.state.snakes) {
        const sn = room.state.snakes.find((s) => s.id === player.id);
        if (sn) {
          sn.alive = false;
          sn.eliminated = true;
          sn.lives = 0;
          sn.body = [];
          sn.pendingRespawn = false;
        }
      }
      broadcastRoom(room);
      checkSnakesEnd(room);
    } else if (room.game === "tank") {
      if (room.state && room.state.tanks) {
        const tk = room.state.tanks.find((t) => t.id === player.id);
        if (tk) {
          tk.alive = false;
          tk.hp = 0;
        }
      }
      broadcastRoom(room);
      checkTankRoundEnd(room);
    } else if (room.game === "rts") {
      if (room.state && room.state.entities) {
        const slot = player.slot;
        room.state.entities = room.state.entities.filter((e) => e.owner !== slot);
        const aliveNexus = room.state.entities.filter((e) => e.type === "nexus");
        const ownersLeft = [...new Set(aliveNexus.map((e) => e.owner))];
        if (ownersLeft.length <= 1) {
          const w = ownersLeft[0] != null ? room.players.find((p) => p.slot === ownersLeft[0]) : null;
          endGame(room, "opponent_left", w ? w.id : null);
        } else {
          broadcastRoom(room);
          broadcastState(room);
        }
      } else {
        broadcastRoom(room);
      }
    } else if (room.game === "ageofwar") {
      const winner = room.players.find((p) => p.id !== player.id && !p.isAi);
      endGame(room, "opponent_left", winner ? winner.id : null);
    } else {
      const winner = room.players.find((p) => p.id !== player.id);
      endGame(room, "opponent_left", winner ? winner.id : null);
    }
  } else {
    // drop AI fillers when lobby composition changes
    for (let i = room.players.length - 1; i >= 0; i--) {
      if (room.players[i].isAi) room.players.splice(i, 1);
    }
    for (const p of room.players) p.ready = false;
    broadcastRoom(room);
    notifyLobby(game);
  }
}

function tryStart(room) {
  if (room.status !== "lobby") return;
  if (!allReady(room)) return;
  room.status = "playing";
  notifyLobby(room.game);
  for (const p of room.players) {
    p.input = defaultInput(room.game);
    p.ready = false;
  }
  if (room.game === "tank") ensureTankAi(room);
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
  if (game === "ageofwar") return { action: null, unitIndex: 0 };
  if (game === "snakes") return { dirX: 1, dirY: 0 };
  if (game === "airhockey") return { x: 175, y: 200 };
  return {};
}

/* ===================== TANK (4p · 초대형 맵 · FFA/팀) ===================== */
function tankTeamOf(slot, mode) {
  if (mode === "team") return slot < 2 ? 0 : 1;
  return slot; // ffa: each alone
}

function ensureTankAi(room) {
  if (room.mode !== "team") return;
  if (room.players.length !== 3) return;
  if (room.players.some((p) => p.isAi)) return;
  const used = new Set(room.players.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  room.players.push({
    id: nextPlayerId++,
    name: "AI Bot",
    ws: null,
    slot,
    ready: true,
    input: defaultInput("tank"),
    isAi: true,
    roomCode: room.code,
  });
}

function makeTankWalls(W, H) {
  const walls = [];
  // border blocks / cover fields
  const blocks = [
    [W * 0.22, H * 0.2, 120, 50],
    [W * 0.22, H * 0.75, 120, 50],
    [W * 0.78, H * 0.2, 120, 50],
    [W * 0.78, H * 0.75, 120, 50],
    [W * 0.5 - 80, H * 0.35, 160, 40],
    [W * 0.5 - 80, H * 0.62, 160, 40],
    [W * 0.35, H * 0.48, 50, 140],
    [W * 0.62, H * 0.48, 50, 140],
    [W * 0.12, H * 0.48, 70, 70],
    [W * 0.88 - 70, H * 0.48, 70, 70],
    [W * 0.4, H * 0.15, 80, 80],
    [W * 0.55, H * 0.78, 80, 80],
  ];
  for (const [x, y, w, h] of blocks) {
    walls.push({ x, y, w, h, solid: true });
  }
  // destructible crates
  for (let i = 0; i < 18; i++) {
    walls.push({
      x: 200 + ((i * 317) % (W - 400)),
      y: 180 + ((i * 521) % (H - 360)),
      w: 54,
      h: 54,
      solid: false,
      hp: 3,
    });
  }
  return walls;
}

function initTank(room) {
  const mode = room.mode === "team" ? "team" : "ffa";
  ensureTankAi(room);
  // normalize slots 0..n-1 contiguous for team seating
  room.players.forEach((p, i) => {
    p.slot = i;
  });
  const W = 2800,
    H = 2000;
  const spawns =
    mode === "team"
      ? [
          { x: 160, y: H * 0.32, aim: 0.1 },
          { x: 160, y: H * 0.68, aim: -0.1 },
          { x: W - 160, y: H * 0.32, aim: Math.PI - 0.1 },
          { x: W - 160, y: H * 0.68, aim: Math.PI + 0.1 },
        ]
      : [
          { x: 180, y: 180, aim: 0.5 },
          { x: W - 180, y: 180, aim: Math.PI - 0.5 },
          { x: 180, y: H - 180, aim: -0.5 },
          { x: W - 180, y: H - 180, aim: Math.PI + 0.5 },
        ];
  const tanks = room.players.map((p, i) => {
    const sp = spawns[i % spawns.length];
    return {
      id: p.id,
      slot: p.slot,
      team: tankTeamOf(p.slot, mode),
      name: p.name || (p.isAi ? "AI" : "P" + (i + 1)),
      isAi: !!p.isAi,
      x: sp.x,
      y: sp.y,
      aim: sp.aim,
      hp: 3,
      maxHp: 3,
      cd: 0,
      alive: true,
    };
  });
  return {
    W,
    H,
    mode,
    round: 1,
    wins: mode === "team" ? [0, 0] : tanks.map(() => 0),
    tanks,
    bullets: [],
    walls: makeTankWalls(W, H),
    roundOverAt: 0,
    winnerId: null,
  };
}

function resetTankRound(state) {
  const mode = state.mode;
  const W = state.W,
    H = state.H;
  const spawns =
    mode === "team"
      ? [
          { x: 160, y: H * 0.32, aim: 0.1 },
          { x: 160, y: H * 0.68, aim: -0.1 },
          { x: W - 160, y: H * 0.32, aim: Math.PI - 0.1 },
          { x: W - 160, y: H * 0.68, aim: Math.PI + 0.1 },
        ]
      : [
          { x: 180, y: 180, aim: 0.5 },
          { x: W - 180, y: 180, aim: Math.PI - 0.5 },
          { x: 180, y: H - 180, aim: -0.5 },
          { x: W - 180, y: H - 180, aim: Math.PI + 0.5 },
        ];
  state.tanks.forEach((t, i) => {
    const sp = spawns[i % spawns.length];
    t.x = sp.x;
    t.y = sp.y;
    t.aim = sp.aim;
    t.hp = 3;
    t.cd = 0;
    t.alive = true;
  });
  state.bullets = [];
  state.walls = makeTankWalls(W, H);
  state.roundOverAt = 0;
  state.winnerId = null;
}

function rectHit(cx, cy, r, wx, wy, ww, wh) {
  const closestX = Math.max(wx, Math.min(cx, wx + ww));
  const closestY = Math.max(wy, Math.min(cy, wy + wh));
  const dx = cx - closestX,
    dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

function tankSameSide(a, b, mode) {
  if (!a || !b) return false;
  if (mode === "team") return a.team === b.team;
  return a.slot === b.slot;
}

function tankAiThink(s, t, dt) {
  // chase nearest enemy, shoot when roughly aimed
  let best = null,
    bd = 1e9;
  for (const o of s.tanks) {
    if (!o.alive || tankSameSide(t, o, s.mode)) continue;
    const d = Math.hypot(o.x - t.x, o.y - t.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  const inp = { up: false, down: false, left: false, right: false, aim: t.aim, fire: false };
  if (!best) return inp;
  const ang = Math.atan2(best.y - t.y, best.x - t.x);
  t.aim = ang;
  inp.aim = ang;
  const dx = best.x - t.x,
    dy = best.y - t.y;
  if (Math.abs(dx) > 40) {
    if (dx > 0) inp.right = true;
    else inp.left = true;
  }
  if (Math.abs(dy) > 40) {
    if (dy > 0) inp.down = true;
    else inp.up = true;
  }
  // keep some distance
  if (bd < 180) {
    inp.up = !inp.up && dy < 0;
    inp.down = !inp.down && dy > 0;
    inp.left = dx > 0;
    inp.right = dx < 0;
  }
  if (bd < 520 && Math.abs(Math.atan2(Math.sin(ang - t.aim), Math.cos(ang - t.aim))) < 0.35) {
    inp.fire = Math.random() < Math.min(1, dt * 4);
  }
  return inp;
}

function tickTank(room, dt) {
  const s = room.state;
  if (s.roundOverAt) {
    if (Date.now() >= s.roundOverAt) {
      if (s.mode === "team") {
        if ((s.wins[0] || 0) >= 2 || (s.wins[1] || 0) >= 2) {
          const winTeam = (s.wins[0] || 0) >= 2 ? 0 : 1;
          const w = s.tanks.find((t) => t.team === winTeam);
          endGame(room, "match", w ? w.id : null);
          return;
        }
      } else {
        // FFA: last-alive already ended match; round wins optional
        const topped = s.wins.findIndex((w) => w >= 2);
        if (topped >= 0) {
          const w = s.tanks.find((t) => t.slot === topped);
          endGame(room, "match", w ? w.id : s.winnerId);
          return;
        }
      }
      s.round++;
      resetTankRound(s);
    }
    return;
  }

  const R = 18,
    spd = 170;
  for (const t of s.tanks) {
    if (!t.alive) continue;
    const p = room.players.find((pl) => pl.id === t.id);
    let inp = (p && p.input) || {};
    if (t.isAi || (p && p.isAi)) {
      inp = tankAiThink(s, t, dt);
      if (p) p.input = inp;
    }
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
      t.cd = 420;
      s.bullets.push({
        x: t.x + Math.cos(t.aim) * 22,
        y: t.y + Math.sin(t.aim) * 22,
        vx: Math.cos(t.aim) * 460,
        vy: Math.sin(t.aim) * 460,
        owner: t.slot,
        team: t.team,
      });
      if (inp) inp.fire = false;
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
        if (w.solid) hitWall = true;
        else {
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
      if (!t.alive) continue;
      if (s.mode === "team" ? t.team === bul.team : t.slot === bul.owner) continue;
      if (Math.hypot(t.x - bul.x, t.y - bul.y) < R + 4) {
        t.hp--;
        s.bullets.splice(b, 1);
        if (t.hp <= 0) {
          t.alive = false;
          checkTankRoundEnd(room);
        }
        break;
      }
    }
  }
}

function checkTankRoundEnd(room) {
  const s = room.state;
  if (s.roundOverAt) return;
  const alive = s.tanks.filter((t) => t.alive);
  if (s.mode === "team") {
    const a = alive.filter((t) => t.team === 0);
    const b = alive.filter((t) => t.team === 1);
    if (a.length === 0 || b.length === 0) {
      const winTeam = a.length ? 0 : 1;
      s.wins[winTeam] = (s.wins[winTeam] || 0) + 1;
      s.winnerId = (alive[0] && alive[0].id) || null;
      s.roundOverAt = Date.now() + 1800;
      if ((s.wins[winTeam] || 0) >= 2) {
        // finalize shortly via tick
      }
    }
  } else {
    if (alive.length <= 1) {
      if (alive[0]) {
        s.wins[alive[0].slot] = (s.wins[alive[0].slot] || 0) + 1;
        s.winnerId = alive[0].id;
      }
      s.roundOverAt = Date.now() + 1800;
      // FFA first to 1 or end match if only last alive - win match immediately at 1
      if (alive[0]) {
        s.roundOverAt = Date.now() + 1200;
        // mark for match end: set wins high
        s.wins[alive[0].slot] = 2;
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
  duck: { cost: 40, hp: 18, dps: 8, range: 12, speed: 110, range: 24 },
};
const RTS_BUILD = {
  nexus: { cost: 0, hp: 900, w: 64, h: 64, range: 240, dps: 55 },
  barracks: { cost: 150, hp: 300, w: 48, h: 48 },
  turret: { cost: 120, hp: 220, w: 36, h: 36, range: 160, dps: 18 },
};
const RTS_NEXUS_TURRET_BAN_R = 110;
const RTS_MODES = {
  "1v1": { max: 2, need: 2, team: false, label: "1:1" },
  ffa3: { max: 3, need: 3, team: false, label: "1:1:1" },
  ffa4: { max: 4, need: 4, team: false, label: "1:1:1:1" },
  "2v2": { max: 4, need: 4, team: true, label: "2:2" },
};

function parseRtsMode(raw) {
  const m = String(raw || "1v1");
  return RTS_MODES[m] ? m : "1v1";
}
function rtsModeNeed(mode) {
  return (RTS_MODES[mode] || RTS_MODES["1v1"]).need;
}
function rtsModeMax(mode) {
  return (RTS_MODES[mode] || RTS_MODES["1v1"]).max;
}
function rtsIsTeam(mode) {
  return !!(RTS_MODES[mode] && RTS_MODES[mode].team);
}
function rtsTeamOf(slot, mode) {
  if (rtsIsTeam(mode)) return slot < 2 ? 0 : 1;
  return slot;
}
function rtsAllied(ownerA, ownerB, mode) {
  if (ownerA === ownerB) return true;
  if (!rtsIsTeam(mode)) return false;
  return rtsTeamOf(ownerA, mode) === rtsTeamOf(ownerB, mode);
}

function rtsCircleHitsObstacles(s, x, y, r) {
  for (const o of s.obstacles || []) {
    if (o.kind === "rock") {
      if (Math.hypot(o.x - x, o.y - y) < (o.r || 28) + r) return true;
    } else if (o.kind === "water") {
      const dx = Math.max(Math.abs(x - o.x) - o.w / 2, 0);
      const dy = Math.max(Math.abs(y - o.y) - o.h / 2, 0);
      if (Math.hypot(dx, dy) < r) return true;
    }
  }
  return false;
}

function rtsClampPos(s, x, y, r) {
  let nx = Math.max(r + 4, Math.min(s.W - r - 4, x));
  let ny = Math.max(r + 4, Math.min(s.H - r - 4, y));
  if (!rtsCircleHitsObstacles(s, nx, ny, r)) return { x: nx, y: ny };
  // slide attempts
  for (const [ax, ay] of [
    [nx, y],
    [x, ny],
    [x, y],
  ]) {
    const cx = Math.max(r + 4, Math.min(s.W - r - 4, ax));
    const cy = Math.max(r + 4, Math.min(s.H - r - 4, ay));
    if (!rtsCircleHitsObstacles(s, cx, cy, r)) return { x: cx, y: cy };
  }
  return { x: eSafe(x, s.W, r), y: eSafe(y, s.H, r) };
}

function eSafe(v, max, r) {
  return Math.max(r + 4, Math.min(max - r - 4, v));
}

function initRts(room) {
  const W = 1200,
    H = 800;
  let uid = 1;
  const mode = parseRtsMode(room.mode);
  room.mode = mode;
  const bases = [
    { x: 150, y: 150, sx: 1, sy: 1 },
    { x: W - 150, y: 150, sx: -1, sy: 1 },
    { x: 150, y: H - 150, sx: 1, sy: -1 },
    { x: W - 150, y: H - 150, sx: -1, sy: -1 },
  ];
  // 2v2: teammates share same vertical side (left vs right)
  const teamBases = [
    { x: 150, y: 180, sx: 1, sy: 1 },
    { x: 150, y: H - 180, sx: 1, sy: -1 },
    { x: W - 150, y: 180, sx: -1, sy: 1 },
    { x: W - 150, y: H - 180, sx: -1, sy: -1 },
  ];
  const layout = rtsIsTeam(mode) ? teamBases : bases;
  const mkSide = (owner, base) => {
    const { x: baseX, y: baseY, sx, sy } = base;
    const team = rtsTeamOf(owner, mode);
    const nexus = {
      id: uid++,
      kind: "building",
      type: "nexus",
      owner,
      team,
      x: baseX,
      y: baseY,
      hp: RTS_BUILD.nexus.hp,
      maxHp: RTS_BUILD.nexus.hp,
      w: RTS_BUILD.nexus.w,
      h: RTS_BUILD.nexus.h,
      atkCd: 0,
    };
    const minerals = [
      { id: uid++, kind: "mineral", x: baseX - sx * 108, y: baseY - sy * 102, amount: 9999 },
      { id: uid++, kind: "mineral", x: baseX - sx * 108, y: baseY - sy * 32, amount: 9999 },
      { id: uid++, kind: "mineral", x: baseX - sx * 40, y: baseY - sy * 108, amount: 9999 },
    ].map((m) => ({
      id: m.id,
      kind: m.kind,
      amount: m.amount,
      x: Math.max(28, Math.min(W - 28, m.x)),
      y: Math.max(28, Math.min(H - 28, m.y)),
    }));
    const workers = [];
    for (let i = 0; i < 3; i++) {
      workers.push({
        id: uid++,
        kind: "unit",
        type: "worker",
        owner,
        team,
        x: baseX + sx * 36,
        y: baseY + (i - 1) * 34,
        hp: RTS_UNITS.worker.hp,
        maxHp: RTS_UNITS.worker.hp,
        r: RTS_UNITS.worker.r,
        tx: null,
        ty: null,
        targetId: null,
        order: null,
        carry: 0,
        atkCd: 0,
      });
    }
    return { nexus: nexus, minerals: minerals, workers: workers };
  };
  room.players.forEach((p, i) => {
    p.slot = i;
    p.team = rtsTeamOf(i, mode);
  });
  const entities = [];
  const minerals = [];
  const gold = [];
  room.players.forEach((p, i) => {
    const side = mkSide(p.slot, layout[i % layout.length]);
    entities.push(side.nexus);
    for (let w = 0; w < side.workers.length; w++) entities.push(side.workers[w]);
    for (let m = 0; m < side.minerals.length; m++) minerals.push(side.minerals[m]);
    gold.push(200);
  });
  const obstacles = [
    { kind: "rock", x: 520, y: 260, r: 36 },
    { kind: "rock", x: 700, y: 520, r: 42 },
    { kind: "rock", x: 380, y: 540, r: 30 },
    { kind: "rock", x: 860, y: 280, r: 34 },
    { kind: "rock", x: 600, y: 400, r: 26 },
    { kind: "water", x: 300, y: 360, w: 140, h: 90 },
    { kind: "water", x: 920, y: 460, w: 150, h: 100 },
    { kind: "water", x: 620, y: 150, w: 120, h: 70 },
    { kind: "water", x: 560, y: 680, w: 160, h: 80 },
  ];
  return {
    W: W,
    H: H,
    mode: mode,
    nextId: uid,
    gold: gold,
    entities: entities,
    minerals: minerals,
    obstacles: obstacles,
    beams: [],
    spawnQ: [],
    tickNo: 0,
  };
}

function rtsFind(s, id) {
  return s.entities.find((e) => e.id === id);
}

function rtsBuildAllowed(s, owner, bt, x, y) {
  const def = RTS_BUILD[bt];
  if (!def || bt === "nexus") return false;
  const r = Math.max(def.w, def.h) / 2;
  if (rtsCircleHitsObstacles(s, x, y, r * 0.7)) return false;
  const nexus = s.entities.find((e) => e.type === "nexus" && e.owner === owner);
  if (!nexus) return false;
  if (bt === "turret") {
    const d = Math.hypot(x - nexus.x, y - nexus.y);
    if (d < RTS_NEXUS_TURRET_BAN_R) return false;
  }
  return true;
}

function tickRts(room, dt) {
  const s = room.state;
  if (!s) return;
  const mode = parseRtsMode(s.mode || room.mode);
  s.mode = mode;
  s.tickNo = (s.tickNo || 0) + 1;
  if (!Array.isArray(s.entities)) s.entities = [];
  if (!Array.isArray(s.gold)) s.gold = room.players.map(() => 200);
  if (!s.beams) s.beams = [];
  s.beams = s.beams.filter((b) => {
    b.life -= dt;
    return b.life > 0;
  });

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
          e.order = "move";
        }
      }
    } else if (inp.cmd === "attack") {
      for (const id of sels) {
        const e = rtsFind(s, id);
        if (e && e.kind === "unit" && e.owner === owner) {
          e.targetId = inp.targetId != null ? inp.targetId : null;
          e.tx = inp.x;
          e.ty = inp.y;
          e.order = e.targetId != null ? "attack" : "move";
          if (e.order === "move") e.targetId = null;
        }
      }
    } else if (inp.cmd === "build") {
      const bt = inp.buildType;
      const def = RTS_BUILD[bt];
      if (def && bt !== "nexus" && s.gold[owner] >= def.cost) {
        const x = Math.max(30, Math.min(s.W - 30, inp.x));
        const y = Math.max(30, Math.min(s.H - 30, inp.y));
        if (rtsBuildAllowed(s, owner, bt, x, y)) {
          s.gold[owner] -= def.cost;
          s.entities.push({
            id: s.nextId++,
            kind: "building",
            type: bt,
            owner,
            team: rtsTeamOf(owner, mode),
            x,
            y,
            hp: def.hp,
            maxHp: def.hp,
            w: def.w,
            h: def.h,
            atkCd: 0,
          });
        }
      } else if (inp.unitType && RTS_UNITS[inp.unitType]) {
        const ut = inp.unitType;
        const udef = RTS_UNITS[ut];
        const from =
          ut === "worker"
            ? s.entities.find((e) => e.type === "nexus" && e.owner === owner)
            : s.entities.find((e) => e.type === "barracks" && e.owner === owner);
        if (from && s.gold[owner] >= udef.cost) {
          s.gold[owner] -= udef.cost;
          const nexus = s.entities.find((e) => e.type === "nexus" && e.owner === owner);
          const outX = nexus ? (from.x < s.W / 2 ? 48 : -48) : owner % 2 === 0 ? 48 : -48;
          const spawn = rtsClampPos(
            s,
            from.x + outX,
            from.y + (Math.random() - 0.5) * 50,
            udef.r
          );
          s.entities.push({
            id: s.nextId++,
            kind: "unit",
            type: ut,
            owner,
            team: rtsTeamOf(owner, mode),
            x: spawn.x,
            y: spawn.y,
            hp: udef.hp,
            maxHp: udef.hp,
            r: udef.r,
            tx: null,
            ty: null,
            targetId: null,
            order: null,
            carry: 0,
            atkCd: 0,
          });
        }
      }
    }
    inp.cmd = null;
  }

  // workers auto-harvest (idle only)
  for (const e of s.entities) {
    if (e.kind !== "unit" || e.type !== "worker" || e.hp <= 0) continue;
    if (e.order === "move" || e.order === "attack") continue;
    if (e.tx != null) continue;
    if (e.carry >= 10) {
      const nexus = s.entities.find((n) => n.type === "nexus" && n.owner === e.owner);
      if (nexus) {
        const d = Math.hypot(nexus.x - e.x, nexus.y - e.y);
        if (d < 48) {
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

    if (e.order === "move") {
      if (e.tx == null) e.order = null;
    } else {
      let target = e.targetId != null ? rtsFind(s, e.targetId) : null;
      if (target && target.hp <= 0) {
        target = null;
        e.targetId = null;
      }
      if (!target && e.order !== "move") {
        let bd = def.range + 40,
          best = null;
        for (const o of s.entities) {
          if (rtsAllied(e.owner, o.owner, mode) || o.hp <= 0) continue;
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
          if (e.order !== "move") {
            e.tx = null;
            e.ty = null;
          }
          if (e.atkCd <= 0) {
            target.hp -= def.dps * 0.5;
            e.atkCd = 0.5;
            if (e.type === "bomber") {
              target.hp -= 25;
              e.hp = 0;
            }
          }
        } else if (e.order !== "move") {
          e.tx = target.x;
          e.ty = target.y;
        }
      }
    }

    if (e.tx != null) {
      const dx = e.tx - e.x,
        dy = e.ty - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        e.tx = null;
        e.ty = null;
        if (e.order === "move") e.order = null;
      } else {
        const step = def.speed * dt;
        const nx = e.x + (dx / dist) * step;
        const ny = e.y + (dy / dist) * step;
        const pos = rtsClampPos(s, nx, ny, e.r || 8);
        e.x = pos.x;
        e.y = pos.y;
      }
    }
  }

  // nexus laser — auto protect workers / base
  for (const e of s.entities) {
    if (e.type !== "nexus" || e.hp <= 0) continue;
    if (e.atkCd > 0) e.atkCd -= dt;
    const range = RTS_BUILD.nexus.range;
    let best = null,
      bd = range;
    for (const o of s.entities) {
      if (rtsAllied(e.owner, o.owner, mode) || o.hp <= 0) continue;
      if (o.kind !== "unit" && o.kind !== "building") continue;
      if (o.type === "nexus") continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best && e.atkCd <= 0) {
      best.hp -= RTS_BUILD.nexus.dps * 0.45;
      e.atkCd = 0.35;
      s.beams.push({
        x1: e.x,
        y1: e.y,
        x2: best.x,
        y2: best.y,
        life: 0.18,
        owner: e.owner,
      });
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
      if (rtsAllied(e.owner, o.owner, mode) || o.hp <= 0 || o.kind !== "unit") continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best && e.atkCd <= 0) {
      best.hp -= RTS_BUILD.turret.dps * 0.4;
      e.atkCd = 0.4;
      s.beams.push({
        x1: e.x,
        y1: e.y,
        x2: best.x,
        y2: best.y,
        life: 0.12,
        owner: e.owner,
      });
    }
  }

  s.entities = s.entities.filter((e) => e.hp != null && e.hp > 0);
  // grace period so spawn always settles before end checks
  if ((s.tickNo || 0) < 20) return;
  const aliveNexus = s.entities.filter((e) => e.type === "nexus");
  if (!aliveNexus.length && room.players.length >= 2) {
    endGame(room, "nexus", null);
    return;
  }
  if (rtsIsTeam(mode)) {
    const teamsLeft = [...new Set(aliveNexus.map((e) => (e.team != null ? e.team : rtsTeamOf(e.owner, mode))))];
    if (teamsLeft.length <= 1) {
      const winTeam = teamsLeft[0];
      const w = room.players.find((p) => rtsTeamOf(p.slot, mode) === winTeam);
      endGame(room, "nexus", w ? w.id : null);
    }
  } else {
    const ownersLeft = [...new Set(aliveNexus.map((e) => e.owner))];
    if (ownersLeft.length <= 1 && room.players.length >= 2) {
      const winnerSlot = ownersLeft[0];
      const w = winnerSlot != null ? room.players.find((p) => p.slot === winnerSlot) : null;
      endGame(room, "nexus", w ? w.id : null);
    }
  }
}

/* ===================== AGE OF WAR (전쟁시대) ===================== */
const AOW_AGES = [
  {
    name: "석기",
    units: [
      { id: "club", name: "곤봉병", cost: 15, hp: 45, dps: 9, r: 14, speed: 58, range: 26 },
      { id: "sling", name: "투석병", cost: 25, hp: 28, dps: 8, r: 12, speed: 52, range: 120 },
      { id: "dino", name: "공룡기수", cost: 100, hp: 170, dps: 24, r: 22, speed: 48, range: 34 },
    ],
  },
  {
    name: "중세",
    units: [
      { id: "sword", name: "검사", cost: 50, hp: 80, dps: 14, r: 14, speed: 60, range: 28 },
      { id: "archer", name: "궁수", cost: 75, hp: 40, dps: 12, r: 12, speed: 55, range: 140 },
      { id: "knight", name: "기사", cost: 220, hp: 220, dps: 28, r: 20, speed: 62, range: 32 },
    ],
  },
  {
    name: "화약",
    units: [
      { id: "duel", name: "결투사", cost: 120, hp: 110, dps: 18, r: 14, speed: 64, range: 30 },
      { id: "musket", name: "머스킷", cost: 180, hp: 55, dps: 20, r: 12, speed: 50, range: 160 },
      { id: "cannon", name: "대포병", cost: 420, hp: 160, dps: 40, r: 18, speed: 40, range: 170 },
    ],
  },
  {
    name: "현대",
    units: [
      { id: "meleeInf", name: "돌격병", cost: 260, hp: 160, dps: 26, r: 14, speed: 68, range: 30 },
      { id: "infantry", name: "소총병", cost: 340, hp: 90, dps: 28, r: 12, speed: 58, range: 170 },
      { id: "tankU", name: "전차", cost: 900, hp: 420, dps: 48, r: 24, speed: 46, range: 40 },
    ],
  },
  {
    name: "미래",
    units: [
      { id: "blade", name: "광선검사", cost: 500, hp: 210, dps: 36, r: 14, speed: 72, range: 32 },
      { id: "blaster", name: "블래스터", cost: 620, hp: 120, dps: 40, r: 12, speed: 60, range: 180 },
      { id: "war", name: "워머신", cost: 1600, hp: 560, dps: 70, r: 26, speed: 50, range: 46 },
    ],
  },
];
// XP required to evolve FROM age index -> next
const AOW_EVOLVE_XP = [700, 1800, 4000, 9000];

function initAgeOfWar(room) {
  const W = 1100,
    H = 420;
  const baseHp = 650;
  return {
    W,
    H,
    groundY: 320,
    gold: [175, 175],
    xp: [0, 0],
    age: [0, 0],
    baseHp: [baseHp, baseHp],
    baseMax: [baseHp, baseHp],
    specialCd: [0, 0],
    incomeT: 0,
    units: [],
    fx: [],
    nextId: 1,
  };
}

function aowUnitDefs(age) {
  return AOW_AGES[Math.max(0, Math.min(AOW_AGES.length - 1, age))].units;
}

function tickAgeOfWar(room, dt) {
  const s = room.state;
  s.incomeT += dt;
  while (s.incomeT >= 0.35) {
    s.incomeT -= 0.35;
    s.gold[0] += 3;
    s.gold[1] += 3;
  }
  for (let i = 0; i < 2; i++) {
    if (s.specialCd[i] > 0) s.specialCd[i] -= dt;
  }
  if (!s.fx) s.fx = [];
  s.fx = s.fx.filter((f) => {
    f.life -= dt;
    return f.life > 0;
  });

  for (const p of room.players) {
    const inp = p.input;
    if (!inp || !inp.action) continue;
    const owner = p.slot;
    if (owner !== 0 && owner !== 1) {
      inp.action = null;
      continue;
    }
    if (inp.action === "spawn") {
      const defs = aowUnitDefs(s.age[owner]);
      const ui = Math.max(0, Math.min(2, inp.unitIndex | 0));
      const def = defs[ui];
      if (def && s.gold[owner] >= def.cost) {
        s.gold[owner] -= def.cost;
        const dir = owner === 0 ? 1 : -1;
        s.units.push({
          id: s.nextId++,
          owner,
          type: def.id,
          name: def.name,
          x: owner === 0 ? 110 : s.W - 110,
          y: s.groundY,
          hp: def.hp,
          maxHp: def.hp,
          dps: def.dps,
          r: def.r,
          speed: def.speed * dir,
          range: def.range,
          atkCd: 0,
        });
      }
    } else if (inp.action === "evolve") {
      const age = s.age[owner];
      if (age < 4) {
        const need = AOW_EVOLVE_XP[age];
        if (s.xp[owner] >= need) {
          s.xp[owner] -= need;
          s.age[owner]++;
          s.baseMax[owner] += 280;
          s.baseHp[owner] = Math.min(s.baseMax[owner], s.baseHp[owner] + 280);
          s.fx.push({ kind: "evolve", owner, life: 1.2 });
        }
      }
    } else if (inp.action === "special") {
      if (s.specialCd[owner] <= 0) {
        s.specialCd[owner] = 38;
        for (const u of s.units) {
          if (u.owner !== owner) u.hp -= 55 + s.age[owner] * 18;
        }
        s.fx.push({ kind: "special", owner, life: 0.8 });
      }
    }
    inp.action = null;
  }

  // move / combat
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    if (u.atkCd > 0) u.atkCd -= dt;
    let target = null;
    let td = u.range + 8;
    for (const o of s.units) {
      if (o.owner === u.owner || o.hp <= 0) continue;
      const d = Math.abs(o.x - u.x);
      if (d < td) {
        td = d;
        target = o;
      }
    }
    // base target
    const enemyBaseX = u.owner === 0 ? s.W - 70 : 70;
    const baseDist = Math.abs(enemyBaseX - u.x);
    const canHitBase = baseDist <= u.range + 20;

    if (target && td <= u.range) {
      if (u.atkCd <= 0) {
        target.hp -= u.dps * 0.55;
        u.atkCd = 0.45;
      }
    } else if (!target && canHitBase) {
      if (u.atkCd <= 0) {
        const foe = 1 - u.owner;
        s.baseHp[foe] -= u.dps * 0.4;
        u.atkCd = 0.5;
      }
    } else {
      u.x += u.speed * dt;
    }
  }

  // rewards for kills
  for (let i = s.units.length - 1; i >= 0; i--) {
    const u = s.units[i];
    if (u.hp > 0) continue;
    const killer = 1 - u.owner;
    s.gold[killer] += 12 + s.age[u.owner] * 6;
    s.xp[killer] += 35 + s.age[u.owner] * 20;
    s.xp[u.owner] += 8; // small xp when your unit dies (classic)
    s.units.splice(i, 1);
  }

  if (s.baseHp[0] <= 0 || s.baseHp[1] <= 0) {
    const winSlot = s.baseHp[0] <= 0 ? 1 : 0;
    const w = room.players.find((p) => p.slot === winSlot);
    endGame(room, "base", w ? w.id : null);
  }
}


/* ===================== SNAKES (grid classic · midnight-style) ===================== */
const SNAKE_COLS = 72;
const SNAKE_ROWS = 48;
const SNAKE_CELL = 16; // => 1152 x 768

function snakesOccupied(s) {
  const map = new Map();
  for (const sn of s.snakes) {
    if (!sn.alive) continue;
    for (let i = 0; i < sn.body.length; i++) {
      const p = sn.body[i];
      map.set(p.x + "," + p.y, { sn, i });
    }
  }
  return map;
}

function snakesSpawnFood(s, n) {
  const occ = snakesOccupied(s);
  for (const f of s.food) occ.set(f.x + "," + f.y, true);
  let guard = 0;
  while (n > 0 && guard < 5000) {
    guard++;
    const x = Math.floor(Math.random() * s.cols);
    const y = Math.floor(Math.random() * s.rows);
    const k = x + "," + y;
    if (occ.has(k)) continue;
    s.food.push({ x, y });
    occ.set(k, true);
    n--;
  }
}

function initSnakes(room) {
  const cols = SNAKE_COLS;
  const rows = SNAKE_ROWS;
  const cell = SNAKE_CELL;
  const W = cols * cell;
  const H = rows * cell;
  const spawns = [
    { x: 8, y: 8, dx: 1, dy: 0 },
    { x: cols - 9, y: rows - 9, dx: -1, dy: 0 },
    { x: cols - 9, y: 8, dx: -1, dy: 0 },
    { x: 8, y: rows - 9, dx: 1, dy: 0 },
    { x: Math.floor(cols / 2), y: 6, dx: 0, dy: 1 },
    { x: Math.floor(cols / 2), y: rows - 7, dx: 0, dy: -1 },
    { x: 6, y: Math.floor(rows / 2), dx: 1, dy: 0 },
    { x: cols - 7, y: Math.floor(rows / 2), dx: -1, dy: 0 },
  ];
  const snakes = room.players.map((p, i) => {
    const sp = spawns[i % spawns.length];
    const body = [];
    for (let k = 0; k < 4; k++) {
      body.push({
        x: sp.x - sp.dx * k,
        y: sp.y - sp.dy * k,
      });
    }
    return {
      id: p.id,
      slot: p.slot,
      name: p.name || ("P" + (i + 1)),
      alive: true,
      eliminated: false,
      lives: 3,
      maxLives: 3,
      body,
      spawn: { x: sp.x, y: sp.y, dx: sp.dx, dy: sp.dy },
      dirX: sp.dx,
      dirY: sp.dy,
      nextDirX: sp.dx,
      nextDirY: sp.dy,
      score: 0,
      pendingRespawn: false,
      color: null,
    };
  });
  const state = {
    W,
    H,
    cols,
    rows,
    cell,
    snakes,
    food: [],
    stepAcc: 0,
    stepMs: 120,
    startedAt: Date.now(),
    duration: 180000,
  };
  snakesSpawnFood(state, 28);
  return state;
}

function snakeRespawn(sn) {
  const sp = sn.spawn || { x: 8, y: 8, dx: 1, dy: 0 };
  sn.body = [];
  for (let k = 0; k < 4; k++) {
    sn.body.push({ x: sp.x - sp.dx * k, y: sp.y - sp.dy * k });
  }
  sn.dirX = sp.dx;
  sn.dirY = sp.dy;
  sn.nextDirX = sp.dx;
  sn.nextDirY = sp.dy;
  sn.alive = true;
  sn.pendingRespawn = false;
}

function snakeDie(sn) {
  if (!sn.alive || sn.eliminated || sn.pendingRespawn) return;
  sn.alive = false;
  sn.lives = Math.max(0, (sn.lives != null ? sn.lives : 3) - 1);
  if (sn.lives <= 0) {
    sn.eliminated = true;
    sn.body = [];
    sn.pendingRespawn = false;
  } else {
    sn.pendingRespawn = true;
  }
}

function checkSnakesEnd(room) {
  const s = room.state;
  if (!s) return;
  const contenders = s.snakes.filter((sn) => !sn.eliminated);
  const timedOut = Date.now() - s.startedAt >= s.duration;
  if (contenders.length <= 1 || timedOut) {
    let winner = null;
    if (contenders.length === 1) {
      winner = contenders[0].id;
    } else {
      let best = null,
        bl = -1;
      for (const sn of s.snakes) {
        const len = ((sn.body && sn.body.length) || 0) + (sn.score || 0) + (sn.lives || 0) * 100;
        if (len > bl) {
          bl = len;
          best = sn;
        }
      }
      if (best) winner = best.id;
    }
    endGame(room, contenders.length <= 1 ? "last_alive" : "time", winner);
  }
}

function snakesApplyDirInput(sn, inp) {
  if (!inp) return;
  let dx = 0,
    dy = 0;
  if (typeof inp.dirX === "number" && typeof inp.dirY === "number" && (inp.dirX || inp.dirY)) {
    dx = Math.sign(inp.dirX);
    dy = Math.sign(inp.dirY);
  } else if (inp.dx || inp.dy) {
    dx = Math.sign(Number(inp.dx) || 0);
    dy = Math.sign(Number(inp.dy) || 0);
  }
  if (dx && dy) {
    // prefer the larger magnitude if both pressed
    if (Math.abs(Number(inp.dirX) || Number(inp.dx) || 0) >= Math.abs(Number(inp.dirY) || Number(inp.dy) || 0)) dy = 0;
    else dx = 0;
  }
  if (!dx && !dy) return;
  // no 180° reverse into own neck
  if (dx + sn.dirX === 0 && dy + sn.dirY === 0) return;
  sn.nextDirX = dx;
  sn.nextDirY = dy;
}

function snakesStep(room) {
  const s = room.state;
  for (const sn of s.snakes) {
    if (!sn.alive) continue;
    const p = room.players.find((pl) => pl.id === sn.id);
    snakesApplyDirInput(sn, p && p.input);
    sn.dirX = sn.nextDirX;
    sn.dirY = sn.nextDirY;
  }

  const proposals = [];
  for (const sn of s.snakes) {
    if (!sn.alive) continue;
    const head = sn.body[0];
    proposals.push({
      sn,
      nh: { x: head.x + sn.dirX, y: head.y + sn.dirY },
    });
  }

  // wall deaths
  for (const pr of proposals) {
    const { sn, nh } = pr;
    if (nh.x < 0 || nh.y < 0 || nh.x >= s.cols || nh.y >= s.rows) {
      snakeDie(sn);
    }
  }

  // occupancy of current bodies (all segments)
  const bodyOcc = new Map();
  for (const sn of s.snakes) {
    if (!sn.alive) continue;
    for (let i = 0; i < sn.body.length; i++) {
      const p = sn.body[i];
      bodyOcc.set(p.x + "," + p.y, { id: sn.id, i });
    }
  }

  // head-on map
  const headMap = new Map();
  for (const pr of proposals) {
    if (!pr.sn.alive) continue;
    const k = pr.nh.x + "," + pr.nh.y;
    if (!headMap.has(k)) headMap.set(k, []);
    headMap.get(k).push(pr.sn);
  }

  for (const pr of proposals) {
    const sn = pr.sn;
    if (!sn.alive) continue;
    const k = pr.nh.x + "," + pr.nh.y;

    // head crashes into another head
    const heads = headMap.get(k) || [];
    if (heads.length > 1) {
      snakeDie(sn);
      continue;
    }

    const hit = bodyOcc.get(k);
    if (hit) {
      if (hit.id === sn.id) {
        if (hit.i === 0) {
          /* head cell */
        } else if (hit.i === sn.body.length - 1) {
          /* own tip — sliding forward */
        } else {
          snakeDie(sn);
          continue;
        }
      } else {
        snakeDie(sn);
        continue;
      }
    }
  }

  // apply moves for survivors
  for (const pr of proposals) {
    const sn = pr.sn;
    if (!sn.alive) continue;
    const nh = pr.nh;
    sn.body.unshift({ x: nh.x, y: nh.y });
    let ate = false;
    for (let i = s.food.length - 1; i >= 0; i--) {
      const f = s.food[i];
      if (f.x === nh.x && f.y === nh.y) {
        s.food.splice(i, 1);
        ate = true;
        sn.score = (sn.score || 0) + 10;
        break;
      }
    }
    if (!ate) sn.body.pop();
    else snakesSpawnFood(s, 1);
  }

  // respawn players who still have lives
  for (const sn of s.snakes) {
    if (sn.pendingRespawn) snakeRespawn(sn);
  }

  checkSnakesEnd(room);
}

function tickSnakes(room, dt) {
  const s = room.state;
  if (!s) return;
  // keep applying direction every frame so inputs feel responsive before step
  for (const sn of s.snakes) {
    if (!sn.alive) continue;
    const p = room.players.find((pl) => pl.id === sn.id);
    snakesApplyDirInput(sn, p && p.input);
  }
  s.stepAcc = (s.stepAcc || 0) + dt;
  const step = (s.stepMs || 120) / 1000;
  let guard = 0;
  while (s.stepAcc >= step && guard < 3) {
    s.stepAcc -= step;
    snakesStep(room);
    guard++;
    if (!room.state || room.status !== "playing") return;
  }
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
      { id: room.players[0].id, slot: 0, x: 80, y: H / 2, r: 28, px: 80, py: H / 2 },
      { id: room.players[1].id, slot: 1, x: W - 80, y: H / 2, r: 28, px: W - 80, py: H / 2 },
    ],
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 14 },
    goalHalf: 70,
  };
}

function resetPuck(s, toLeft) {
  s.puck.x = s.W / 2;
  s.puck.y = s.H / 2;
  s.puck.vx = (toLeft ? -1 : 1) * 240;
  s.puck.vy = (Math.random() - 0.5) * 140;
}

function boostPuckSpeed(puck, mul, add) {
  let sp = Math.hypot(puck.vx, puck.vy);
  if (sp < 1) {
    puck.vx = 200;
    puck.vy = (Math.random() - 0.5) * 80;
    sp = Math.hypot(puck.vx, puck.vy);
  }
  const next = Math.min(1100, sp * (mul || 1.08) + (add != null ? add : 18));
  puck.vx = (puck.vx / sp) * next;
  puck.vy = (puck.vy / sp) * next;
}

function tickAirhockey(room, dt) {
  const s = room.state;
  for (let i = 0; i < 2; i++) {
    const pad = s.paddles[i];
    pad.px = pad.x;
    pad.py = pad.y;
    const p = room.players.find((pl) => pl.id === pad.id);
    const inp = (p && p.input) || {};
    const tx = typeof inp.x === "number" ? inp.x : pad.x;
    const ty = typeof inp.y === "number" ? inp.y : pad.y;
    const maxX0 = s.W * 0.45,
      minX1 = s.W * 0.55;
    let nx = pad.x + (tx - pad.x) * Math.min(1, 18 * dt);
    let ny = pad.y + (ty - pad.y) * Math.min(1, 18 * dt);
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
    puck.vy = Math.abs(puck.vy);
    boostPuckSpeed(puck, 1.1, 22);
  }
  if (puck.y > s.H - puck.r) {
    puck.y = s.H - puck.r;
    puck.vy = -Math.abs(puck.vy);
    boostPuckSpeed(puck, 1.1, 22);
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
      puck.vx = Math.abs(puck.vx);
      boostPuckSpeed(puck, 1.1, 22);
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
      puck.vx = -Math.abs(puck.vx);
      boostPuckSpeed(puck, 1.1, 22);
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
      const pvx = (pad.x - (pad.px != null ? pad.px : pad.x)) / Math.max(dt, 0.001);
      const pvy = (pad.y - (pad.py != null ? pad.py : pad.y)) / Math.max(dt, 0.001);
      const dot = puck.vx * nx + puck.vy * ny;
      puck.vx = puck.vx - 2.05 * dot * nx + nx * 90 + pvx * 0.35;
      puck.vy = puck.vy - 2.05 * dot * ny + ny * 90 + pvy * 0.35;
      // 패들에 닿을 때마다 반드시 가속
      boostPuckSpeed(puck, 1.12, 28);
    }
  }
}

/* ===================== dispatch ===================== */
function initState(room) {
  switch (room.game) {
    case "tank":
      return initTank(room);
    case "rts":
      return initRts(room);
    case "ageofwar":
      return initAgeOfWar(room);
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
      case "ageofwar":
        tickAgeOfWar(room, dt);
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
      players: room.players.filter((p) => !p.isAi).length,
      max: room.max || GAMES[game].max,
      names: room.players.filter((p) => !p.isAi).map((p) => p.name),
      host: room.players[0] ? room.players[0].name : "",
      mode: room.mode || null,
    });
  }
  return list;
}

/** @type {import("ws").WebSocketServer | null} */
let gameWss = null;

function notifyLobby(game) {
  if (!gameWss || !GAMES[game]) return;
  const payload = { type: "lobby_list", game, rooms: lobbyList(game) };
  gameWss.clients.forEach(function (client) {
    if (client.readyState !== 1) return;
    // Prefer clients watching this game; fall back to everyone for compatibility
    if (client._watchGame && client._watchGame !== game) return;
    send(client, payload);
  });
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
  gameWss = wss;

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

      if (type === "ping") {
        return send(ws, { type: "pong", t: msg.t || Date.now() });
      }

      if (type === "watch") {
        const game = String(msg.game || "");
        if (game && GAMES[game]) ws._watchGame = game;
        else ws._watchGame = null;
        if (ws._watchGame) {
          return send(ws, { type: "lobby_list", game: ws._watchGame, rooms: lobbyList(ws._watchGame) });
        }
        return;
      }

      if (type === "list") {
        const game = String(msg.game || "");
        if (!GAMES[game]) return error(ws, "unknown_game");
        ws._watchGame = game;
        return send(ws, { type: "lobby_list", game, rooms: lobbyList(game) });
      }

      if (type === "create") {
        const game = String(msg.game || "");
        if (!GAMES[game]) return error(ws, "unknown_game");
        ws._watchGame = game;
        const existing = findPlayerByWs(ws);
        if (existing) removePlayer(existing.room, existing.player);
        const name = String(msg.name || ws._name || "Player").slice(0, 24);
        const code = randCode();
        const room = {
          code,
          game,
          mode:
            game === "tank"
              ? String(msg.mode || "") === "team"
                ? "team"
                : "ffa"
              : game === "rts"
                ? parseRtsMode(msg.mode)
                : null,
          max: game === "rts" ? rtsModeMax(parseRtsMode(msg.mode)) : GAMES[game].max,
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
        // Host gets room first; lobby fan-out deferred off the hot path
        send(ws, roomSnapshot(room));
        setImmediate(function () { notifyLobby(game); });
        return;
      }

      if (type === "join") {
        const code = String(msg.code || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 4);
        const room = rooms.get(code);
        if (!room) return error(ws, "room_not_found");
        if (room.status !== "lobby") return error(ws, "room_not_joinable");
        const joinMax = room.max || GAMES[room.game].max;
        if (room.players.length >= joinMax) return error(ws, "room_full");
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
        ws._watchGame = room.game;
        send(ws, { type: "hello_ok", name, playerId: player.id });
        broadcastRoom(room);
        setImmediate(function () { notifyLobby(room.game); });
        return;
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
        } else if (room.game === "ageofwar") {
          player.input = {
            action: payload.action || null,
            unitIndex: payload.unitIndex != null ? payload.unitIndex | 0 : 0,
          };
        } else if (room.game === "snakes") {
          player.input = {
            dirX: typeof payload.dirX === "number" ? payload.dirX : Number(payload.dx) || 0,
            dirY: typeof payload.dirY === "number" ? payload.dirY : Number(payload.dy) || 0,
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
