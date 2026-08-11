"use strict";

const { WebSocketServer } = require("ws");

const GAMES = {
  tank: { max: 4, hz: 20 },
  rts: { max: 4, hz: 20 },
  ageofwar: { max: 2, hz: 20 },
  snakes: { max: 8, hz: 15 },
  airhockey: { max: 2, hz: 45 },
  memorymp: { max: 4, hz: 30 },
};

const MEMORY_MODES = {
  "1v1": { label: "1:1", need: 2, max: 2, team: false },
  ffa3: { label: "1:1:1", need: 3, max: 3, team: false },
  "2v2": { label: "2:2", need: 4, max: 4, team: true },
};

const MEMORY_SIZES = {
  12: { cols: 4, rows: 6 },
  18: { cols: 6, rows: 6 },
  24: { cols: 6, rows: 8 },
  28: { cols: 7, rows: 8 },
  32: { cols: 8, rows: 8 },
};

const MEMORY_ICONS = [
  "🛏️", "🔑", "🛎️", "⭐", "☕", "🧖", "🍷", "🧳",
  "🧹", "📜", "🫧", "🧸", "🏨", "🍽️", "🥂", "🧴",
  "🪞", "🧺", "🧯", "🪴", "📺", "☎️", "🚪", "🪟",
  "🛋️", "🕰️", "🧁", "🕯️", "🚿", "🛁", "🎩", "💎",
];

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
    pairs: room.pairs != null ? room.pairs : null,
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
  if (room.game === "rts") {
    for (const p of room.players) {
      if (!p.ws) continue;
      send(p.ws, { type: "state", status: room.status, state: publicRtsState(room, p) });
    }
    return;
  }
  const msg = { type: "state", status: room.status, state: publicState(room) };
  for (const p of room.players) send(p.ws, msg);
}

function publicState(room) {
  const s = room.state;
  if (!s) return null;
  if (room.game === "memorymp") return publicMemoryState(s);
  return s;
}

function rtsVisionRadius(e) {
  if (!e) return 0;
  if (e.type === "nexus") return 340;
  if (e.type === "barracks") return 200;
  if (e.type === "turret") return 220;
  if (e.type === "worker") return 210;
  if (e.type === "ranged") return 240;
  return 200;
}

function rtsFogIndex(s, x, y) {
  const c = Math.floor(x / s.fogTile);
  const r = Math.floor(y / s.fogTile);
  if (c < 0 || r < 0 || c >= s.fogCols || r >= s.fogRows) return -1;
  return r * s.fogCols + c;
}

function rtsRevealFog(s, owner, x, y, radius) {
  if (!s.explored || !s.explored[owner]) return;
  const mask = s.explored[owner];
  const tile = s.fogTile || 48;
  const c0 = Math.floor(x / tile);
  const r0 = Math.floor(y / tile);
  const rad = Math.ceil(radius / tile);
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad + 1) continue;
      const c = c0 + dx,
        r = r0 + dy;
      if (c < 0 || r < 0 || c >= s.fogCols || r >= s.fogRows) continue;
      mask[r * s.fogCols + c] = 1;
    }
  }
}

function rtsIsExplored(s, owner, x, y) {
  if (!s.explored || !s.explored[owner]) return true;
  const idx = rtsFogIndex(s, x, y);
  if (idx < 0) return false;
  return !!s.explored[owner][idx];
}

function rtsInVision(s, owner, x, y) {
  for (const e of s.entities) {
    if ((e.owner !== owner && e.owner != owner) || e.hp <= 0) continue;
    if (Math.hypot((e.x || 0) - x, (e.y || 0) - y) <= rtsVisionRadius(e)) return true;
  }
  return false;
}

function rtsUpdateFog(room) {
  const s = room.state;
  if (!s || !s.explored) return;
  for (const p of room.players) {
    const owner = p.slot != null ? p.slot : 0;
    if (!s.explored[owner]) {
      s.explored[owner] = new Array(s.fogCols * s.fogRows).fill(0);
    }
    for (const e of s.entities) {
      if ((e.owner !== owner && e.owner != owner) || e.hp <= 0) continue;
      rtsRevealFog(s, owner, e.x, e.y, rtsVisionRadius(e));
    }
  }
}

function publicRtsState(room, viewer) {
  const s = room.state;
  if (!s) return null;
  const owner = viewer && viewer.slot != null ? viewer.slot : 0;
  const fog = s.explored && s.explored[owner] ? s.explored[owner] : null;
  const ents = [];
  for (const e of s.entities || []) {
    if (!e || !(e.hp > 0)) continue;
    const mine = e.owner === owner || e.owner == owner;
    if (mine || rtsInVision(s, owner, e.x, e.y)) {
      ents.push(e);
    } else if (e.kind === "building" && rtsIsExplored(s, owner, e.x, e.y)) {
      // Explored enemy buildings stay as last-known silhouette
      ents.push({
        id: e.id,
        kind: "building",
        type: e.type,
        owner: e.owner,
        team: e.team,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        hp: e.hp,
        maxHp: e.maxHp,
        label: e.label,
        fogGhost: true,
      });
    }
  }
  const minerals = (s.minerals || []).filter((m) => rtsIsExplored(s, owner, m.x, m.y) || rtsInVision(s, owner, m.x, m.y));
  const beams = (s.beams || []).filter((b) => {
    if (b.owner === owner || b.owner == owner) return true;
    return rtsInVision(s, owner, b.x2, b.y2);
  });
  return {
    W: s.W,
    H: s.H,
    mode: s.mode,
    gold: s.gold,
    entities: ents,
    minerals: minerals,
    obstacles: s.obstacles,
    beams: beams,
    tickNo: s.tickNo,
    fogTile: s.fogTile,
    fogCols: s.fogCols,
    fogRows: s.fogRows,
    fog: fog,
    viewOwner: owner,
  };
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
    const max = rtsModeMax(room.mode) || need;
    return humans.length >= Math.min(2, need) && humans.length <= max && humans.length >= 2 && readyOk;
  }
  if (room.game === "ageofwar") {
    return humans.length === 2 && readyOk;
  }
  if (room.game === "memorymp") {
    const need = memoryModeNeed(room.mode);
    const mmax = memoryModeMax(room.mode) || need;
    return humans.length === need && humans.length <= mmax && readyOk;
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
    } else if (room.state && room.state.playerMeta) {
      const pm = room.state.playerMeta.find((p) => p.id === winnerId);
      if (pm) winnerName = pm.name;
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
  try {
    room.state = initState(room);
  } catch (err) {
    console.warn("initState failed", room.game, err);
    room.status = "lobby";
    room.state = null;
    for (const p of room.players) p.ready = false;
    broadcastRoom(room);
    return;
  }
  if (room.game === "rts") {
    ensureRtsBases(room);
    const nx = (room.state.entities || []).filter((e) => e.type === "nexus" && e.hp > 0);
    if (nx.length < room.players.length) {
      console.warn("RTS nexus shortfall after init", nx.length, room.players.length);
      ensureRtsBases(room);
    }
  }
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
  if (game === "memorymp") return { flip: -1 };
  return {};
}

/* ===================== MEMORY MULTIPLAYER ===================== */
function parseMemoryMode(raw) {
  const m = String(raw || "1v1");
  if (MEMORY_MODES[m]) return m;
  if (m === "ffa" || m === "1v1v1") return "ffa3";
  if (m === "team") return "2v2";
  return "1v1";
}
function memoryModeNeed(mode) {
  return (MEMORY_MODES[mode] || MEMORY_MODES["1v1"]).need;
}
function memoryModeMax(mode) {
  return (MEMORY_MODES[mode] || MEMORY_MODES["1v1"]).max;
}
function memoryIsTeam(mode) {
  return !!(MEMORY_MODES[mode] && MEMORY_MODES[mode].team);
}
function parseMemoryPairs(raw) {
  const n = Number(raw);
  if (MEMORY_SIZES[n]) return n;
  return 18;
}
function memoryTeamOf(slot, mode) {
  if (memoryIsTeam(mode)) return slot < 2 ? 0 : 1;
  return slot;
}
function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
function publicMemoryState(s) {
  const now = Date.now();
  const previewing = !!(s.previewEnds && now < s.previewEnds);
  const step = s.previewStep || 22;
  const hold = s.previewHold || 90;
  const start = s.previewStart || 0;
  return {
    mode: s.mode,
    pairs: s.pairs,
    cols: s.cols,
    rows: s.rows,
    cards: s.cards.map((c, i) => {
      let wave = false;
      if (previewing && start) {
        const t = now - start;
        const openAt = i * step;
        wave = t >= openAt && t < openAt + hold;
      }
      return {
        open: !!(c.open || wave),
        done: !!c.done,
        icon: c.open || c.done || wave || previewing ? c.icon : null,
        wave: !!wave,
      };
    }),
    scores: s.scores.slice(),
    turnSlot: s.turnSlot,
    turnTeam: s.turnTeam,
    pickPhase: s.pickPhase,
    currentPickerId: previewing ? null : s.currentPickerId,
    lockUntil: s.lockUntil || 0,
    matched: s.matched,
    playerMeta: s.playerMeta,
    totalPairs: s.pairs,
    previewing: previewing,
    previewStart: s.previewStart || 0,
    previewEnds: s.previewEnds || 0,
    previewStep: step,
    previewHold: hold,
  };
}
function memoryTeamSlots(room, team) {
  return room.players
    .filter((p) => memoryTeamOf(p.slot, room.mode || room.state.mode) === team)
    .sort((a, b) => a.slot - b.slot);
}
function memorySetPicker(room, s) {
  if (memoryIsTeam(s.mode)) {
    const mates = memoryTeamSlots(room, s.turnTeam);
    const who = mates[s.pickPhase % Math.max(1, mates.length)];
    s.currentPickerId = who ? who.id : null;
    s.turnSlot = who ? who.slot : 0;
  } else {
    const p = room.players.find((x) => x.slot === s.turnSlot) || room.players[s.turnSlot];
    s.currentPickerId = p ? p.id : null;
  }
}
function initMemory(room) {
  const mode = parseMemoryMode(room.mode);
  room.mode = mode;
  const pairs = parseMemoryPairs(room.pairs != null ? room.pairs : 18);
  room.pairs = pairs;
  const size = MEMORY_SIZES[pairs] || MEMORY_SIZES[18];
  const icons = MEMORY_ICONS.slice(0, pairs);
  const deck = shuffleArr(icons.concat(icons).slice());
  const players = room.players.slice().sort((a, b) => a.slot - b.slot);
  players.forEach((p, i) => {
    p.slot = i;
    p.team = memoryTeamOf(i, mode);
  });
  const scoreLen = memoryIsTeam(mode) ? 2 : players.length;
  const nCards = deck.length;
  const previewStep = 22;
  const previewHold = 90;
  const previewStart = Date.now();
  const previewEnds = previewStart + Math.max(0, nCards - 1) * previewStep + previewHold + 140;
  const s = {
    mode,
    pairs,
    cols: size.cols,
    rows: size.rows,
    cards: deck.map((icon) => ({ icon, open: false, done: false })),
    scores: Array(scoreLen).fill(0),
    turnSlot: 0,
    turnTeam: 0,
    pickPhase: 0,
    openIdx: [],
    lockUntil: 0,
    matched: 0,
    currentPickerId: null,
    previewStart,
    previewEnds,
    previewStep,
    previewHold,
    playerMeta: players.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      team: memoryTeamOf(p.slot, mode),
    })),
  };
  memorySetPicker(room, s);
  return s;
}
function memoryAdvanceTurn(room, s) {
  s.openIdx = [];
  s.lockUntil = 0;
  if (memoryIsTeam(s.mode)) {
    s.turnTeam = s.turnTeam === 0 ? 1 : 0;
    s.pickPhase = 0;
  } else {
    const n = room.players.length;
    s.turnSlot = (s.turnSlot + 1) % n;
  }
  memorySetPicker(room, s);
}
function memoryStayTurn(room, s) {
  s.openIdx = [];
  s.lockUntil = 0;
  if (memoryIsTeam(s.mode)) {
    s.pickPhase = 0;
  }
  memorySetPicker(room, s);
}
function memoryResolveOpen(room, s) {
  if (s.openIdx.length < 2) return;
  const a = s.openIdx[0];
  const b = s.openIdx[1];
  const ca = s.cards[a];
  const cb = s.cards[b];
  if (!ca || !cb) {
    s.openIdx = [];
    return;
  }
  if (ca.icon === cb.icon) {
    ca.done = cb.done = true;
    ca.open = cb.open = true;
    s.matched += 1;
    if (memoryIsTeam(s.mode)) {
      s.scores[s.turnTeam] = (s.scores[s.turnTeam] || 0) + 1;
    } else {
      s.scores[s.turnSlot] = (s.scores[s.turnSlot] || 0) + 1;
    }
    memoryStayTurn(room, s);
    if (s.matched >= s.pairs) memoryFinish(room, s);
  } else {
    s.lockUntil = Date.now() + 700;
  }
}
function memoryFinish(room, s) {
  let winnerId = null;
  let best = -1;
  let ties = 0;
  for (let i = 0; i < s.scores.length; i++) {
    const sc = s.scores[i] || 0;
    if (sc > best) {
      best = sc;
      ties = 1;
      if (memoryIsTeam(s.mode)) {
        const mates = memoryTeamSlots(room, i);
        winnerId = mates[0] ? mates[0].id : null;
      } else {
        const p = room.players.find((x) => x.slot === i);
        winnerId = p ? p.id : null;
      }
    } else if (sc === best) {
      ties++;
    }
  }
  if (ties > 1) winnerId = null;
  endGame(room, ties > 1 ? "draw" : "memory_complete", winnerId);
}
function applyMemoryInput(room, player, payload) {
  const s = room.state;
  if (!s || room.status !== "playing") return;
  if (s.previewEnds && Date.now() < s.previewEnds) return;
  if (s.lockUntil && Date.now() < s.lockUntil) return;
  if (s.matched >= s.pairs) return;
  const idx = payload.flip != null ? Number(payload.flip) : Number(payload.index);
  if (!Number.isFinite(idx) || idx < 0 || idx >= s.cards.length) return;
  if (player.id !== s.currentPickerId) return;
  const card = s.cards[idx];
  if (!card || card.open || card.done) return;
  if (s.openIdx.indexOf(idx) >= 0) return;

  if (memoryIsTeam(s.mode)) {
    // each teammate picks exactly one card per phase
    if (s.openIdx.length >= 2) return;
    card.open = true;
    s.openIdx.push(idx);
    if (s.openIdx.length === 1) {
      s.pickPhase = 1;
      memorySetPicker(room, s);
    } else {
      memoryResolveOpen(room, s);
    }
  } else {
    // classical: same player flips two
    if (s.openIdx.length >= 2) return;
    card.open = true;
    s.openIdx.push(idx);
    if (s.openIdx.length >= 2) memoryResolveOpen(room, s);
  }
}
function tickMemory(room) {
  const s = room.state;
  if (!s || !s.lockUntil) return;
  if (Date.now() < s.lockUntil) return;
  for (const i of s.openIdx) {
    const c = s.cards[i];
    if (c && !c.done) c.open = false;
  }
  memoryAdvanceTurn(room, s);
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

function makeTankItems(W, H) {
  const kinds = ["heal", "speed", "shield", "rapid"];
  const spots = [
    [W * 0.5, H * 0.5],
    [W * 0.5 - 150, H * 0.5],
    [W * 0.5 + 150, H * 0.5],
    [W * 0.5, H * 0.5 - 130],
    [W * 0.5, H * 0.5 + 130],
    [W * 0.5 - 110, H * 0.5 - 110],
    [W * 0.5 + 110, H * 0.5 - 110],
    [W * 0.5 - 110, H * 0.5 + 110],
    [W * 0.5 + 110, H * 0.5 + 110],
  ];
  return spots.map(function (p, i) {
    return {
      id: i + 1,
      x: p[0],
      y: p[1],
      type: kinds[i % kinds.length],
      taken: false,
      respawnAt: 0,
    };
  });
}

function tankClearBuffs(t) {
  t.boostUntil = 0;
  t.rapidUntil = 0;
  t.shield = 0;
}

function tankApplyItem(t, it) {
  const now = Date.now();
  if (it.type === "heal") {
    t.hp = Math.min(t.maxHp || 5, (t.hp || 0) + 2);
  } else if (it.type === "speed") {
    t.boostUntil = now + 7000;
  } else if (it.type === "shield") {
    t.shield = Math.min(3, (t.shield || 0) + 2);
  } else if (it.type === "rapid") {
    t.rapidUntil = now + 7000;
  }
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
  // destructible crates (avoid mid item plaza)
  for (let i = 0; i < 18; i++) {
    const x = 200 + ((i * 317) % (W - 400));
    const y = 180 + ((i * 521) % (H - 360));
    if (Math.hypot(x + 27 - W * 0.5, y + 27 - H * 0.5) < 220) continue;
    walls.push({
      x: x,
      y: y,
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
      spawn: { x: sp.x, y: sp.y, aim: sp.aim },
      aim: sp.aim,
      hp: 5,
      maxHp: 5,
      lives: 3,
      maxLives: 3,
      cd: 0,
      alive: true,
      eliminated: false,
      respawnAt: 0,
      boostUntil: 0,
      rapidUntil: 0,
      shield: 0,
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
    items: makeTankItems(W, H),
    roundOverAt: 0,
    winnerId: null,
  };
}

function tankRespawn(t) {
  const sp = t.spawn || { x: t.x, y: t.y, aim: t.aim || 0 };
  t.x = sp.x;
  t.y = sp.y;
  t.aim = sp.aim;
  t.hp = t.maxHp || 5;
  t.cd = 0.4;
  t.alive = true;
  t.respawnAt = 0;
  tankClearBuffs(t);
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
    t.spawn = { x: sp.x, y: sp.y, aim: sp.aim };
    t.x = sp.x;
    t.y = sp.y;
    t.aim = sp.aim;
    t.hp = 5;
    t.maxHp = 5;
    t.lives = 3;
    t.maxLives = 3;
    t.cd = 0;
    t.alive = true;
    t.eliminated = false;
    t.respawnAt = 0;
    tankClearBuffs(t);
  });
  state.bullets = [];
  state.walls = makeTankWalls(W, H);
  state.items = makeTankItems(W, H);
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
      endGame(room, "match", s.winnerId);
    }
    return;
  }

  const now = Date.now();
  for (const t of s.tanks) {
    if (t.eliminated) continue;
    if (!t.alive && t.respawnAt && now >= t.respawnAt) {
      tankRespawn(t);
    }
  }

  const R = 18;
  const nowMs = Date.now();
  for (const t of s.tanks) {
    if (!t.alive || t.eliminated) continue;
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
    const spd = nowMs < (t.boostUntil || 0) ? 245 : 170;
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
    const fireCd = nowMs < (t.rapidUntil || 0) ? 220 : 420;
    if (inp.fire && t.cd <= 0) {
      t.cd = fireCd;
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

  // mid-map items pickup / respawn
  if (!Array.isArray(s.items)) s.items = makeTankItems(s.W || 2800, s.H || 2000);
  for (const it of s.items) {
    if (it.taken) {
      if (it.respawnAt && nowMs >= it.respawnAt) {
        it.taken = false;
        it.respawnAt = 0;
      }
      continue;
    }
    for (const t of s.tanks) {
      if (!t.alive || t.eliminated) continue;
      if (Math.hypot(t.x - it.x, t.y - it.y) < 28) {
        tankApplyItem(t, it);
        it.taken = true;
        it.respawnAt = nowMs + 12000;
        break;
      }
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
      if (!t.alive || t.eliminated) continue;
      if (s.mode === "team" ? t.team === bul.team : t.slot === bul.owner) continue;
      if (Math.hypot(t.x - bul.x, t.y - bul.y) < R + 4) {
        // Softened TTK: 1 damage vs 5 HP (was 3). Shield absorbs hits first.
        if ((t.shield || 0) > 0) {
          t.shield -= 1;
        } else {
          t.hp = Math.max(0, (t.hp || 0) - 1);
        }
        s.bullets.splice(b, 1);
        if (t.hp <= 0) tankKill(room, t);
        break;
      }
    }
  }
}

function tankKill(room, t) {
  if (!t.alive || t.eliminated) return;
  t.alive = false;
  t.hp = 0;
  t.lives = Math.max(0, (t.lives != null ? t.lives : 3) - 1);
  if (t.lives <= 0) {
    t.eliminated = true;
    t.respawnAt = 0;
  } else {
    t.respawnAt = Date.now() + 1600;
  }
  checkTankRoundEnd(room);
}

function checkTankRoundEnd(room) {
  const s = room.state;
  if (s.roundOverAt) return;
  const contenders = s.tanks.filter((t) => !t.eliminated);
  if (s.mode === "team") {
    const a = contenders.filter((t) => t.team === 0);
    const b = contenders.filter((t) => t.team === 1);
    if (a.length === 0 || b.length === 0) {
      const winTeam = a.length ? 0 : 1;
      const w =
        s.tanks.find((t) => t.team === winTeam && !t.eliminated) ||
        s.tanks.find((t) => t.team === winTeam);
      s.winnerId = w ? w.id : null;
      s.wins[winTeam] = 2;
      s.roundOverAt = Date.now() + 1500;
    }
  } else if (contenders.length <= 1) {
    if (contenders[0]) {
      s.winnerId = contenders[0].id;
      s.wins[contenders[0].slot] = 2;
    }
    s.roundOverAt = Date.now() + 1500;
  }
}


/* ===================== RTS ===================== */
const RTS_UNITS = {
  worker: { cost: 50, hp: 40, dps: 4, r: 14, speed: 70, range: 28, train: 3.5 },
  melee: { cost: 80, hp: 90, dps: 14, r: 16, speed: 85, range: 28, train: 5 },
  ranged: { cost: 100, hp: 55, dps: 12, r: 14, speed: 75, range: 120, train: 5.5 },
  bomber: { cost: 140, hp: 45, dps: 40, r: 14, speed: 95, range: 35, train: 7 },
  tanker: { cost: 160, hp: 200, dps: 10, r: 22, speed: 50, range: 32, train: 8 },
  duck: { cost: 30, hp: 18, dps: 8, r: 12, speed: 110, range: 24, train: 2.5 },
};
const RTS_BUILD = {
  nexus: { cost: 400, hp: 900, w: 64, h: 64, range: 240, dps: 55, build: 8 },
  barracks: { cost: 150, hp: 300, w: 48, h: 48, build: 5 },
  turret: { cost: 120, hp: 120, w: 36, h: 36, range: 160, dps: 18, build: 4 },
};
const RTS_NEXUS_TURRET_BAN_R = 110;
const RTS_MAX_QUEUE = 5;
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
  r = r == null || isNaN(r) ? 8 : r;
  x = Number(x);
  y = Number(y);
  if (!isFinite(x) || !isFinite(y)) {
    return { x: (s.W || 800) / 2, y: (s.H || 600) / 2 };
  }
  const W = s.W || 800,
    H = s.H || 600;
  let nx = Math.max(r + 4, Math.min(W - r - 4, x));
  let ny = Math.max(r + 4, Math.min(H - r - 4, y));
  if (!rtsCircleHitsObstacles(s, nx, ny, r)) return { x: nx, y: ny };
  for (const [ax, ay] of [
    [nx, y],
    [x, ny],
    [x, y],
    [nx + 40, ny],
    [nx - 40, ny],
    [nx, ny + 40],
    [nx, ny - 40],
  ]) {
    const cx = Math.max(r + 4, Math.min(W - r - 4, ax));
    const cy = Math.max(r + 4, Math.min(H - r - 4, ay));
    if (!rtsCircleHitsObstacles(s, cx, cy, r)) return { x: cx, y: cy };
  }
  return { x: eSafe(x, W, r), y: eSafe(y, H, r) };
}

function eSafe(v, max, r) {
  r = r == null || isNaN(r) ? 8 : r;
  v = Number(v);
  if (!isFinite(v)) return max / 2;
  return Math.max(r + 4, Math.min(max - r - 4, v));
}

function rtsBaseLayout(mode, W, H) {
  const mx = 200,
    my = 200;
  if (rtsIsTeam(mode)) {
    // Left team slots 0,1 · Right team slots 2,3
    return [
      { x: mx, y: my + 40, sx: 1, sy: 1 },
      { x: mx, y: H - my - 40, sx: 1, sy: -1 },
      { x: W - mx, y: my + 40, sx: -1, sy: 1 },
      { x: W - mx, y: H - my - 40, sx: -1, sy: -1 },
    ];
  }
  // FFA / 1v1: corners
  return [
    { x: mx, y: my, sx: 1, sy: 1 },
    { x: W - mx, y: my, sx: -1, sy: 1 },
    { x: mx, y: H - my, sx: 1, sy: -1 },
    { x: W - mx, y: H - my, sx: -1, sy: -1 },
  ];
}

const RTS_START_WORKERS = 3;
const RTS_START_GOLD = 200;
const RTS_GRACE_TICKS = 45; // ~2.25s at 20hz

function rtsMkSide(uidRef, owner, base, mode, W, H) {
  const { x: baseX, y: baseY, sx, sy } = base;
  const team = rtsTeamOf(owner, mode);
  const nexus = {
    id: uidRef.v++,
    kind: "building",
    type: "nexus",
    owner: owner,
    team: team,
    x: baseX,
    y: baseY,
    hp: RTS_BUILD.nexus.hp,
    maxHp: RTS_BUILD.nexus.hp,
    w: RTS_BUILD.nexus.w,
    h: RTS_BUILD.nexus.h,
    atkCd: 0,
  };
  const minerals = [
    { x: baseX - sx * 108, y: baseY - sy * 102 },
    { x: baseX - sx * 108, y: baseY - sy * 32 },
    { x: baseX - sx * 40, y: baseY - sy * 108 },
  ].map(function (m) {
    return {
      id: uidRef.v++,
      kind: "mineral",
      amount: 9999,
      x: Math.max(28, Math.min(W - 28, m.x)),
      y: Math.max(28, Math.min(H - 28, m.y)),
    };
  });
  const workers = [];
  for (let i = 0; i < RTS_START_WORKERS; i++) {
    workers.push({
      id: uidRef.v++,
      kind: "unit",
      type: "worker",
      owner: owner,
      team: team,
      x: baseX + sx * (42 + i * 6),
      y: baseY + sy * (i - 1) * 36,
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
}

/** Always one nexus + starter workers per seated player. Safe to call mid-match to repair missing starters. */
function ensureRtsBases(room) {
  const s = room.state;
  if (!s || room.game !== "rts") return false;
  const W = s.W || 1200;
  const H = s.H || 800;
  const mode = parseRtsMode(s.mode || room.mode);
  s.mode = mode;
  room.mode = mode;
  if (!Array.isArray(s.entities)) s.entities = [];
  if (!Array.isArray(s.minerals)) s.minerals = [];
  if (!Array.isArray(s.gold)) s.gold = [];
  if (!s.nextId) s.nextId = 1;

  // Contiguous seats — ownership / gold index must match
  room.players.forEach(function (p, i) {
    p.slot = i;
    p.team = rtsTeamOf(i, mode);
  });

  while (s.gold.length < room.players.length) s.gold.push(RTS_START_GOLD);
  s.gold.length = room.players.length;

  const layout = rtsBaseLayout(mode, W, H);
  const uidRef = { v: s.nextId };
  let repaired = false;

  for (let i = 0; i < room.players.length; i++) {
    const owner = i;
    const base = layout[i % layout.length];
    let nexus = s.entities.find(function (e) {
      return e && e.type === "nexus" && e.owner === owner && e.hp > 0;
    });
      if (!nexus) {
      // Drop any dead/corrupt nexus for this owner first
      s.entities = s.entities.filter(function (e) {
        return !(e && e.type === "nexus" && e.owner === owner);
      });
      const side = rtsMkSide(uidRef, owner, base, mode, W, H);
      side.nexus.queue = [];
      side.nexus.trainT = 0;
      side.nexus.label = (room.players[i] && room.players[i].name) || ("P" + (i + 1));
      s.entities.push(side.nexus);
      for (let w = 0; w < side.workers.length; w++) s.entities.push(side.workers[w]);
      // Minerals only if this owner has none nearby
      const hasMin = s.minerals.some(function (m) {
        return Math.hypot(m.x - base.x, m.y - base.y) < 160;
      });
      if (!hasMin) {
        for (let m = 0; m < side.minerals.length; m++) s.minerals.push(side.minerals[m]);
      }
      if (s.gold[owner] == null || s.gold[owner] < 50) s.gold[owner] = RTS_START_GOLD;
      repaired = true;
      continue;
    }
    // Force legal coordinates / hp
    nexus.kind = "building";
    nexus.type = "nexus";
    nexus.owner = owner;
    nexus.team = rtsTeamOf(owner, mode);
    nexus.x = base.x;
    nexus.y = base.y;
    nexus.w = RTS_BUILD.nexus.w;
    nexus.h = RTS_BUILD.nexus.h;
    nexus.maxHp = RTS_BUILD.nexus.maxHp || RTS_BUILD.nexus.hp;
    if (!(nexus.hp > 0)) nexus.hp = nexus.maxHp;
    if (nexus.atkCd == null) nexus.atkCd = 0;
    nexus.label = (room.players[i] && room.players[i].name) || ("P" + (i + 1));
    if (!Array.isArray(nexus.queue)) nexus.queue = [];
    if (nexus.trainT == null) nexus.trainT = 0;

    let workers = s.entities.filter(function (e) {
      return e && e.kind === "unit" && e.type === "worker" && e.owner === owner && e.hp > 0;
    });
    while (workers.length < RTS_START_WORKERS && (s.tickNo || 0) < RTS_GRACE_TICKS) {
      const idx = workers.length;
      const w = {
        id: uidRef.v++,
        kind: "unit",
        type: "worker",
        owner: owner,
        team: rtsTeamOf(owner, mode),
        x: base.x + base.sx * (42 + idx * 6),
        y: base.y + base.sy * (idx - 1) * 36,
        hp: RTS_UNITS.worker.hp,
        maxHp: RTS_UNITS.worker.hp,
        r: RTS_UNITS.worker.r,
        tx: null,
        ty: null,
        targetId: null,
        order: null,
        carry: 0,
        atkCd: 0,
      };
      s.entities.push(w);
      workers.push(w);
      repaired = true;
    }
  }
  s.nextId = Math.max(s.nextId, uidRef.v);
  if (!s.fogTile) s.fogTile = 48;
  if (!s.fogCols) s.fogCols = Math.ceil(W / s.fogTile);
  if (!s.fogRows) s.fogRows = Math.ceil(H / s.fogTile);
  if (!Array.isArray(s.explored)) s.explored = [];
  while (s.explored.length < room.players.length) {
    s.explored.push(new Array(s.fogCols * s.fogRows).fill(0));
  }
  return repaired;
}

function initRts(room) {
  const W = 1800,
    H = 1200;
  const mode = parseRtsMode(room.mode);
  room.mode = mode;
  room.players.forEach(function (p, i) {
    p.slot = i;
    p.team = rtsTeamOf(i, mode);
  });
  const layout = rtsBaseLayout(mode, W, H);
  const uidRef = { v: 1 };
  const entities = [];
  const minerals = [];
  const gold = [];
  for (let i = 0; i < room.players.length; i++) {
    const side = rtsMkSide(uidRef, i, layout[i % layout.length], mode, W, H);
    side.nexus.queue = [];
    side.nexus.trainT = 0;
    side.nexus.label = (room.players[i] && room.players[i].name) || ("P" + (i + 1));
    entities.push(side.nexus);
    for (let w = 0; w < side.workers.length; w++) entities.push(side.workers[w]);
    for (let m = 0; m < side.minerals.length; m++) minerals.push(side.minerals[m]);
    gold.push(RTS_START_GOLD);
  }
  // Mid-map expansion minerals (multi-base)
  const midPatches = [
    { x: W * 0.5, y: H * 0.42 },
    { x: W * 0.5, y: H * 0.58 },
    { x: W * 0.42, y: H * 0.5 },
    { x: W * 0.58, y: H * 0.5 },
    { x: W * 0.5 - 70, y: H * 0.5 - 70 },
    { x: W * 0.5 + 70, y: H * 0.5 + 70 },
    { x: W * 0.5 + 70, y: H * 0.5 - 70 },
    { x: W * 0.5 - 70, y: H * 0.5 + 70 },
    { x: W * 0.35, y: H * 0.35 },
    { x: W * 0.65, y: H * 0.35 },
    { x: W * 0.35, y: H * 0.65 },
    { x: W * 0.65, y: H * 0.65 },
  ];
  for (let i = 0; i < midPatches.length; i++) {
    minerals.push({
      id: uidRef.v++,
      kind: "mineral",
      amount: 9999,
      x: midPatches[i].x,
      y: midPatches[i].y,
    });
  }
  const obstacles = [
    { kind: "rock", x: 720, y: 380, r: 40 },
    { kind: "rock", x: 1080, y: 780, r: 46 },
    { kind: "rock", x: 540, y: 820, r: 34 },
    { kind: "rock", x: 1280, y: 400, r: 38 },
    { kind: "rock", x: 900, y: 600, r: 28 },
    { kind: "rock", x: 400, y: 600, r: 32 },
    { kind: "rock", x: 1400, y: 600, r: 32 },
    { kind: "water", x: 460, y: 520, w: 160, h: 100 },
    { kind: "water", x: 1360, y: 700, w: 170, h: 110 },
    { kind: "water", x: 900, y: 220, w: 140, h: 80 },
    { kind: "water", x: 860, y: 980, w: 180, h: 90 },
  ];
  const fogTile = 48;
  const fogCols = Math.ceil(W / fogTile);
  const fogRows = Math.ceil(H / fogTile);
  const explored = [];
  for (let i = 0; i < room.players.length; i++) {
    explored.push(new Array(fogCols * fogRows).fill(0));
  }
  const state = {
    W: W,
    H: H,
    mode: mode,
    nextId: uidRef.v,
    gold: gold,
    entities: entities,
    minerals: minerals,
    obstacles: obstacles,
    beams: [],
    spawnQ: [],
    tickNo: 0,
    fogTile: fogTile,
    fogCols: fogCols,
    fogRows: fogRows,
    explored: explored,
  };
  room.state = state;
  ensureRtsBases(room);
  rtsUpdateFog(room);
  return room.state;
}

function rtsFind(s, id) {
  const nid = Number(id);
  return s.entities.find((e) => e && (e.id === id || e.id === nid || e.id == id));
}

function rtsApplyInput(room, s, owner, inp, mode) {
  if (!inp || !inp.cmd) return;
  let ids = Array.isArray(inp.selectIds) ? inp.selectIds.map(Number).filter((n) => isFinite(n)) : [];
  if (!ids.length) {
    const pl = room.players.find((pp) => (pp.slot != null ? pp.slot : room.players.indexOf(pp)) === owner);
    if (pl && Array.isArray(pl.rtsSelectIds)) ids = pl.rtsSelectIds.map(Number).filter((n) => isFinite(n));
  }

  if (inp.cmd === "move") {
    const tx = Number(inp.x);
    const ty = Number(inp.y);
    if (!isFinite(tx) || !isFinite(ty)) return;
    for (const id of ids) {
      const e = rtsFind(s, id);
      if (e && e.kind === "unit" && e.owner === owner && e.hp > 0) {
        // Force move — interrupts attack / chase / harvest
        e.tx = tx;
        e.ty = ty;
        e.targetId = null;
        e.order = "move";
      }
    }
  } else if (inp.cmd === "attack") {
    for (const id of ids) {
      const e = rtsFind(s, id);
      if (e && e.kind === "unit" && e.owner === owner && e.hp > 0) {
        e.targetId = inp.targetId != null ? Number(inp.targetId) : null;
        e.tx = Number(inp.x);
        e.ty = Number(inp.y);
        if (!isFinite(e.tx)) e.tx = null;
        if (!isFinite(e.ty)) e.ty = null;
        e.order = e.targetId != null ? "attack" : "move";
        if (e.order === "move") e.targetId = null;
      }
    }
  } else if (inp.cmd === "train" || (inp.cmd === "build" && inp.unitType && RTS_UNITS[inp.unitType])) {
    rtsEnqueueTrain(s, owner, String(inp.unitType || ""), ids);
  } else if (inp.cmd === "build") {
    const bt = inp.buildType;
    const def = RTS_BUILD[bt];
    if (def && s.gold[owner] >= def.cost) {
      const x = Math.max(40, Math.min(s.W - 40, Number(inp.x) || 0));
      const y = Math.max(40, Math.min(s.H - 40, Number(inp.y) || 0));
      if (rtsBuildAllowed(s, owner, bt, x, y)) {
        s.gold[owner] -= def.cost;
        const bld = {
          id: s.nextId++,
          kind: "building",
          type: bt,
          owner: owner,
          team: rtsTeamOf(owner, mode),
          x: x,
          y: y,
          hp: Math.max(1, Math.floor(def.hp * 0.12)),
          maxHp: def.hp,
          w: def.w,
          h: def.h,
          atkCd: 0,
          queue: [],
          trainT: 0,
          building: true,
          buildLeft: def.build || 4,
        };
        if (bt === "nexus") {
          const pl = room.players.find((pp) => pp.slot === owner);
          bld.label = (pl && pl.name) || ("P" + (owner + 1));
        }
        s.entities.push(bld);
      }
    }
  }
}

function rtsOwnerGold(s, owner) {
  if (!Array.isArray(s.gold)) s.gold = [];
  if (s.gold[owner] == null || isNaN(s.gold[owner])) s.gold[owner] = RTS_START_GOLD;
  return s.gold[owner];
}

function rtsNearestOwn(s, owner, type, x, y) {
  let best = null,
    bd = 1e12;
  for (const e of s.entities) {
    if (!e || e.hp <= 0) continue;
    if (e.owner !== owner && e.owner != owner) continue;
    if (type && e.type !== type) continue;
    const d = Math.hypot((e.x || 0) - x, (e.y || 0) - y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

function rtsBuildAllowed(s, owner, bt, x, y) {
  const def = RTS_BUILD[bt];
  if (!def) return false;
  const r = Math.max(def.w || 40, def.h || 40) / 2;
  if (rtsCircleHitsObstacles(s, x, y, r * 0.7)) return false;
  // StarCraft-like: only build on explored (scouted) ground
  if (!rtsIsExplored(s, owner, x, y)) return false;
  const ownNexus = s.entities.filter((e) => e.type === "nexus" && e.owner === owner && e.hp > 0);
  if (bt === "nexus") {
    const nearWorker = s.entities.some(
      (e) => e.type === "worker" && e.owner === owner && e.hp > 0 && Math.hypot(e.x - x, e.y - y) < 90
    );
    if (!nearWorker) return false;
    for (const n of s.entities) {
      if (n.type === "nexus" && n.hp > 0 && Math.hypot(n.x - x, n.y - y) < 160) return false;
    }
    return true;
  }
  if (!ownNexus.length) return false;
  if (bt === "turret") {
    for (const n of ownNexus) {
      if (Math.hypot(x - n.x, y - n.y) < RTS_NEXUS_TURRET_BAN_R) return false;
    }
  }
  return true;
}

function rtsEnqueueTrain(s, owner, ut, preferIds) {
  const udef = RTS_UNITS[ut];
  if (!udef) return false;
  if (rtsOwnerGold(s, owner) < udef.cost) return false;
  const needType = ut === "worker" ? "nexus" : "barracks";
  const ids = Array.isArray(preferIds) ? preferIds.map(Number) : [];
  let from = null;
  for (const id of ids) {
    const e = rtsFind(s, id);
    if (e && e.type === needType && e.owner === owner && e.hp > 0) {
      from = e;
      break;
    }
  }
  if (!from) {
    // Fallback: shortest queue among matching buildings
    const cands = s.entities.filter((e) => e.type === needType && e.owner === owner && e.hp > 0);
    cands.sort((a, b) => (a.queue || []).length - (b.queue || []).length || (a.trainT || 0) - (b.trainT || 0));
    from = cands[0] || null;
  }
  if (!from) return false;
  if (!Array.isArray(from.queue)) from.queue = [];
  if (from.queue.length >= RTS_MAX_QUEUE) return false;
  s.gold[owner] -= udef.cost;
  from.queue.push({ type: ut, need: udef.train || 4 });
  if (from.trainT == null) from.trainT = 0;
  return true;
}

function rtsSpawnUnit(s, from, ut, mode) {
  const udef = RTS_UNITS[ut];
  if (!udef || !from) return null;
  const owner = from.owner;
  const prefer = rtsNearestOwn(s, owner, "nexus", from.x, from.y) || from;
  const dir = (prefer.x || 0) < (s.W || 0) / 2 ? 1 : -1;
  const rad = udef.r || 12;
  const tries = [
    [56 * dir, 0],
    [56 * dir, 36],
    [56 * dir, -36],
    [72 * dir, 18],
    [40 * dir, -48],
    [0, 56],
    [0, -56],
    [-56 * dir, 0],
  ];
  let spawn = null;
  for (let i = 0; i < tries.length; i++) {
    const sx = (from.x || prefer.x || 100) + tries[i][0];
    const sy = (from.y || prefer.y || 100) + tries[i][1];
    const p = rtsClampPos(s, sx, sy, rad);
    if (isFinite(p.x) && isFinite(p.y)) {
      spawn = p;
      if (!rtsCircleHitsObstacles(s, p.x, p.y, rad)) break;
    }
  }
  if (!spawn || !isFinite(spawn.x) || !isFinite(spawn.y)) {
    spawn = {
      x: Math.max(30, Math.min((s.W || 800) - 30, (from.x || 100) + 50 * dir)),
      y: Math.max(30, Math.min((s.H || 600) - 30, from.y || 100)),
    };
  }
  if (!s.nextId) s.nextId = 1;
  const unit = {
    id: s.nextId++,
    kind: "unit",
    type: ut,
    owner: owner,
    team: rtsTeamOf(owner, mode),
    x: spawn.x,
    y: spawn.y,
    hp: udef.hp,
    maxHp: udef.hp,
    r: rad,
    tx: null,
    ty: null,
    targetId: null,
    order: null,
    carry: 0,
    atkCd: 0,
  };
  s.entities.push(unit);
  return unit;
}

function rtsProcessQueues(s, mode, dt) {
  for (const e of s.entities) {
    if (e.kind !== "building" || e.hp <= 0) continue;
    if (!Array.isArray(e.queue) || !e.queue.length) {
      e.trainT = 0;
      continue;
    }
    if (e.trainT == null) e.trainT = 0;
    e.trainT += dt;
    const job = e.queue[0];
    const need = (job && job.need) || 4;
    if (e.trainT >= need) {
      e.trainT = 0;
      e.queue.shift();
      if (job && job.type) rtsSpawnUnit(s, e, job.type, mode);
    }
  }
}

function tickRts(room, dt) {
  const s = room.state;
  if (!s) return;
  const mode = parseRtsMode(s.mode || room.mode);
  s.mode = mode;
  s.tickNo = (s.tickNo || 0) + 1;
  if (!Array.isArray(s.entities)) s.entities = [];
  if (!Array.isArray(s.gold)) s.gold = room.players.map(() => RTS_START_GOLD);
  while (s.gold.length < room.players.length) s.gold.push(RTS_START_GOLD);
  if (!s.beams) s.beams = [];
  s.beams = s.beams.filter((b) => {
    b.life -= dt;
    return b.life > 0;
  });

  for (const p of room.players) {
    const owner = p.slot != null ? p.slot : room.players.indexOf(p);
    if (s.gold[owner] == null) s.gold[owner] = RTS_START_GOLD;
    const q = Array.isArray(p.inputQ) ? p.inputQ : [];
    if (q.length) {
      for (let qi = 0; qi < q.length; qi++) {
        rtsApplyInput(room, s, owner, q[qi], mode);
      }
      p.inputQ = [];
    } else if (p.input && p.input.cmd) {
      rtsApplyInput(room, s, owner, p.input, mode);
    }
    if (p.input) p.input.cmd = null;
  }

  rtsProcessQueues(s, mode, dt);

  // finish under-construction buildings
  for (const e of s.entities) {
    if (!e || !e.building) continue;
    e.buildLeft = (e.buildLeft || 0) - dt;
    if (e.buildLeft <= 0) {
      e.building = false;
      e.buildLeft = 0;
      e.hp = e.maxHp || e.hp;
    }
  }

  rtsUpdateFog(room);

  // workers auto-harvest (idle only)
  for (const e of s.entities) {
    if (e.kind !== "unit" || e.type !== "worker" || e.hp <= 0) continue;
    if (e.order === "move" || e.order === "attack") continue;
    if (e.tx != null) continue;
    if (e.carry >= 10) {
      const nexus = rtsNearestOwn(s, e.owner, "nexus", e.x, e.y);
      if (nexus) {
        const d = Math.hypot(nexus.x - e.x, nexus.y - e.y);
        if (d < 52) {
          if (s.gold[e.owner] == null) s.gold[e.owner] = 0;
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
      // Explicit move order: never auto-chase / stick to attack destination
      if (e.tx == null || e.ty == null) e.order = null;
      e.targetId = null;
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

  // soft separation so units do not stack
  for (let i = 0; i < s.entities.length; i++) {
    const a = s.entities[i];
    if (!a || a.kind !== "unit" || a.hp <= 0) continue;
    for (let j = i + 1; j < s.entities.length; j++) {
      const b = s.entities[j];
      if (!b || b.kind !== "unit" || b.hp <= 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const need = (a.r || 8) + (b.r || 8) + 4;
      if (dist >= need) continue;
      const push = (need - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;
      const ap = rtsClampPos(s, a.x - nx * push, a.y - ny * push, a.r || 8);
      const bp = rtsClampPos(s, b.x + nx * push, b.y + ny * push, b.r || 8);
      a.x = ap.x; a.y = ap.y;
      b.x = bp.x; b.y = bp.y;
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
    if (best && e.atkCd <= 0 && !e.building) {
      const mul = best.kind === "unit" ? 0.225 : 0.45;
      best.hp -= RTS_BUILD.nexus.dps * mul;
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
    if (e.type !== "turret" || e.hp <= 0 || e.building) continue;
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

  // Grace: force every player to have nexus + starter workers, skip win checks
  if ((s.tickNo || 0) <= RTS_GRACE_TICKS) {
    ensureRtsBases(room);
    return;
  }

  const aliveNexus = s.entities.filter((e) => e.type === "nexus" && e.hp > 0);
  if (!aliveNexus.length && room.players.length >= 2) {
    endGame(room, "nexus", null);
    return;
  }
  if (rtsIsTeam(mode)) {
    const teamsLeft = [...new Set(aliveNexus.map((e) => (e.team != null ? e.team : rtsTeamOf(e.owner, mode))))];
    if (teamsLeft.length <= 1 && aliveNexus.length > 0) {
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

function aowIsRanged(u) {
  return (u.range || 0) >= 100;
}

function aowSpacing(a, b) {
  const ra = a.r || 12;
  const rb = b.r || 12;
  const base = ra + rb + 10;
  if (aowIsRanged(a) && aowIsRanged(b)) return Math.max(base, 46);
  if (aowIsRanged(a) || aowIsRanged(b)) return Math.max(base, 36);
  return Math.max(base * 0.95, 24);
}

function aowSeparateAllies(s) {
  for (let owner = 0; owner < 2; owner++) {
    const allies = s.units.filter((u) => u.owner === owner && u.hp > 0);
    if (allies.length < 2) continue;
    // Frontmost first: P0 faces +x, P1 faces -x
    allies.sort((a, b) => (owner === 0 ? b.x - a.x : a.x - b.x));
    for (let i = 1; i < allies.length; i++) {
      const front = allies[i - 1];
      const back = allies[i];
      const need = aowSpacing(front, back);
      const gap = Math.abs(front.x - back.x);
      if (gap >= need) continue;
      if (owner === 0) back.x = front.x - need;
      else back.x = front.x + need;
      back.x = Math.max(55, Math.min(s.W - 55, back.x));
    }
  }
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
        let spawnX = owner === 0 ? 110 : s.W - 110;
        let near = 0;
        for (const o of s.units) {
          if (o.owner !== owner || o.hp <= 0) continue;
          if (Math.abs(o.x - spawnX) < 90) near++;
        }
        spawnX -= dir * near * 16;
        s.units.push({
          id: s.nextId++,
          owner,
          type: def.id,
          name: def.name,
          x: spawnX,
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
    const dir = Math.sign(u.speed) || (u.owner === 0 ? 1 : -1);

    if (target && td <= u.range) {
      if (u.atkCd <= 0) {
        target.hp -= u.dps * 0.55;
        u.atkCd = aowIsRanged(u) ? 0.55 : 0.45;
        if (aowIsRanged(u)) {
          s.fx.push({
            kind: "shot",
            x1: u.x,
            y1: u.y - (u.r || 12),
            x2: target.x,
            y2: target.y - (target.r || 12),
            owner: u.owner,
            life: 0.18,
          });
        }
      }
      // Ranged: hold preferred distance; don't edge forward into ally pile
      if (aowIsRanged(u) && td < u.range * 0.55) {
        u.x -= dir * Math.min(40, u.range * 0.15) * dt;
      }
    } else if (!target && canHitBase) {
      if (u.atkCd <= 0) {
        const foe = 1 - u.owner;
        s.baseHp[foe] -= u.dps * 0.4;
        u.atkCd = 0.5;
        if (aowIsRanged(u)) {
          s.fx.push({
            kind: "shot",
            x1: u.x,
            y1: u.y - (u.r || 12),
            x2: enemyBaseX,
            y2: s.groundY - 50,
            owner: u.owner,
            life: 0.18,
          });
        }
      }
    } else {
      let move = Math.abs(u.speed) * dt;
      for (const o of s.units) {
        if (o === u || o.owner !== u.owner || o.hp <= 0) continue;
        const ahead = (o.x - u.x) * dir > 0;
        if (!ahead) continue;
        const dist = Math.abs(o.x - u.x);
        const need = aowSpacing(u, o);
        if (dist <= need) {
          move = 0;
          break;
        }
        move = Math.min(move, dist - need);
      }
      u.x += dir * move;
    }
  }

  aowSeparateAllies(s);

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
    stepMs: 95,
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
  s.puck.vx = (toLeft ? -1 : 1) * 185;
  s.puck.vy = (Math.random() - 0.5) * 110;
}

function boostPuckSpeed(puck, mul, add) {
  let sp = Math.hypot(puck.vx, puck.vy);
  if (sp < 1) {
    puck.vx = 160;
    puck.vy = (Math.random() - 0.5) * 60;
    sp = Math.hypot(puck.vx, puck.vy);
  }
  const next = Math.min(780, sp * (mul || 1.05) + (add != null ? add : 12));
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
  // light drag so speed doesn't runaway
  puck.vx *= Math.pow(0.992, dt * 45);
  puck.vy *= Math.pow(0.992, dt * 45);
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  if (puck.y < puck.r) {
    puck.y = puck.r;
    puck.vy = Math.abs(puck.vy);
    boostPuckSpeed(puck, 1.04, 10);
  }
  if (puck.y > s.H - puck.r) {
    puck.y = s.H - puck.r;
    puck.vy = -Math.abs(puck.vy);
    boostPuckSpeed(puck, 1.04, 10);
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
      boostPuckSpeed(puck, 1.04, 10);
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
      boostPuckSpeed(puck, 1.04, 10);
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
      puck.vx = puck.vx - 2.0 * dot * nx + nx * 55 + pvx * 0.28;
      puck.vy = puck.vy - 2.0 * dot * ny + ny * 55 + pvy * 0.28;
      boostPuckSpeed(puck, 1.05, 12);
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
    case "memorymp":
      return initMemory(room);
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
      case "memorymp":
        tickMemory(room);
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
      pairs: room.pairs != null ? room.pairs : null,
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
                : game === "memorymp"
                  ? parseMemoryMode(msg.mode)
                  : null,
          pairs: game === "memorymp" ? parseMemoryPairs(msg.pairs) : null,
          max:
            game === "rts"
              ? rtsModeMax(parseRtsMode(msg.mode))
              : game === "memorymp"
                ? memoryModeMax(parseMemoryMode(msg.mode))
                : GAMES[game].max,
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
          if (!Array.isArray(player.inputQ)) player.inputQ = [];
          const cmd = payload.cmd != null && payload.cmd !== "" ? payload.cmd : null;
          const packed = {
            selectIds: Array.isArray(payload.selectIds) ? payload.selectIds.map(Number) : (player.rtsSelectIds || []),
            cmd: cmd,
            x: Number(payload.x),
            y: Number(payload.y),
            buildType: payload.buildType || null,
            unitType: payload.unitType || null,
            targetId: payload.targetId != null ? Number(payload.targetId) : null,
          };
          if (Array.isArray(payload.selectIds)) {
            player.rtsSelectIds = packed.selectIds.slice();
          }
          // Always queue actionable cmds so select/move in the same tick never drop
          if (cmd) {
            player.inputQ.push(packed);
            if (player.inputQ.length > 24) player.inputQ.shift();
          }
          player.input = packed;
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
        } else if (room.game === "memorymp") {
          applyMemoryInput(room, player, payload);
          if (room.status === "playing") broadcastState(room);
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
