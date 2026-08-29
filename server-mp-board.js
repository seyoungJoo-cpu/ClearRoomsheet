"use strict";

const GAMES = {
  gomoku: { max: 4, hz: 8 },
  chess: { max: 4, hz: 8 },
  janggi: { max: 4, hz: 8 },
  marble: { max: 4, hz: 10 },
  yut: { max: 4, hz: 10 },
};

const MODES = {
  solo: { label: "1:AI", need: 2, max: 2, team: false, solo: true },
  "1v1": { label: "1:1", need: 2, max: 2, team: false },
  "2v2": { label: "2:2", need: 4, max: 4, team: true },
};

function isBoardGame(id) {
  return !!GAMES[id];
}
function parseMode(raw) {
  const m = String(raw || "1v1");
  if (MODES[m]) return m;
  if (m === "ai" || m === "1ai") return "solo";
  if (m === "team") return "2v2";
  return "1v1";
}
function modeNeed(mode) {
  return (MODES[mode] || MODES["1v1"]).need;
}
function modeMax(mode) {
  return (MODES[mode] || MODES["1v1"]).max;
}
function isSolo(mode) {
  return !!(MODES[mode] && MODES[mode].solo);
}
function isTeam(mode) {
  return !!(MODES[mode] && MODES[mode].team);
}
function teamOf(slot, mode) {
  if (isTeam(mode)) return slot < 2 ? 0 : 1;
  return slot % 2;
}
function sideOf(slot, mode) {
  if (isTeam(mode)) return slot < 2 ? 0 : 1;
  return slot % 2;
}

function metaPlayers(room) {
  return room.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    slot: p.slot != null ? p.slot : i,
    team: teamOf(p.slot != null ? p.slot : i, room.mode),
    isAi: !!p.isAi,
  }));
}

function currentActor(room, s) {
  const slot = s.turnSlot | 0;
  return room.players.find((p) => (p.slot != null ? p.slot : 0) === slot) || room.players[slot] || null;
}

function nextTurn(room, s, extra) {
  if (extra) return;
  const n = room.players.length;
  if (isTeam(s.mode) && n >= 4 && room.game !== "marble") {
    const order = [0, 2, 1, 3];
    const idx = order.indexOf(s.turnSlot | 0);
    s.turnSlot = order[(idx < 0 ? 0 : idx + 1) % order.length];
  } else {
    s.turnSlot = ((s.turnSlot | 0) + 1) % n;
  }
  const actor = currentActor(room, s);
  s.turnId = actor ? actor.id : null;
  s.turnSide = sideOf(s.turnSlot, s.mode);
  s.aiAt = Date.now() + 420 + Math.random() * 280;
}

function addAi(room, nextPlayerId) {
  const used = new Set(room.players.map((p) => p.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  room.players.push({
    id: nextPlayerId(),
    name: "AI " + (slot + 1),
    ws: null,
    slot,
    ready: true,
    input: {},
    isAi: true,
    roomCode: room.code,
  });
}

function ensurePlayers(room, nextPlayerId) {
  const mode = parseMode(room.mode);
  room.mode = mode;
  const humans = room.players.filter((p) => !p.isAi);
  if (mode === "solo") {
    while (room.players.filter((p) => p.isAi).length < 1 && room.players.length < 2) addAi(room, nextPlayerId);
  } else if (mode === "2v2") {
    const ready = humans.length >= 2 && humans.every((p) => p.ready);
    if (ready) {
      while (room.players.length < 4) addAi(room, nextPlayerId);
    }
  }
  room.players.forEach((p, i) => {
    p.slot = i;
    p.team = teamOf(i, mode);
  });
}

function allReady(room) {
  const mode = parseMode(room.mode);
  const humans = room.players.filter((p) => !p.isAi);
  const humansReady = humans.length && humans.every((p) => p.ready);
  if (!humansReady) return false;
  if (mode === "solo") return humans.length === 1 && room.players.length >= 2;
  if (mode === "1v1") return humans.length === 2;
  if (mode === "2v2") return humans.length >= 2 && room.players.length === 4;
  return false;
}

function defaultInput() {
  return {};
}

function clone2(b) {
  return b.map((row) => row.map((c) => (c ? { t: c.t, s: c.s } : 0)));
}

/* ===================== GOMOKU ===================== */
function gomokuWins(board, r, c, s) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    let n = 1;
    for (const sign of [-1, 1]) {
      let rr = r + dr * sign,
        cc = c + dc * sign;
      while (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && board[rr][cc] === s) {
        n++;
        rr += dr * sign;
        cc += dc * sign;
      }
    }
    if (n >= 5) return true;
  }
  return false;
}

function initGomoku(room) {
  const mode = parseMode(room.mode);
  const board = Array.from({ length: 15 }, () => Array(15).fill(0));
  const actor = room.players[0];
  return {
    game: "gomoku",
    mode,
    size: 15,
    board,
    stones: 0,
    turnSlot: 0,
    turnId: actor ? actor.id : null,
    turnSide: 0,
    last: null,
    playerMeta: metaPlayers(room),
    aiAt: Date.now() + 200,
  };
}

function gomokuPlace(board, r, c, stone) {
  if (r < 0 || r >= 15 || c < 0 || c >= 15) return false;
  if (board[r][c]) return false;
  board[r][c] = stone;
  return true;
}

function applyGomoku(room, player, payload, endGame) {
  const s = room.state;
  if (!s || s.turnId !== player.id) return;
  const r = payload.r != null ? payload.r | 0 : payload.row | 0;
  const c = payload.c != null ? payload.c | 0 : payload.col | 0;
  const stone = sideOf(player.slot, s.mode) + 1;
  if (!gomokuPlace(s.board, r, c, stone)) return;
  s.stones++;
  s.last = { r, c, s: stone };
  if (gomokuWins(s.board, r, c, stone)) {
    endGame(room, "five", player.id);
    return;
  }
  if (s.stones >= 15 * 15) {
    endGame(room, "draw", null);
    return;
  }
  nextTurn(room, s, false);
}

function gomokuAi(room, endGame) {
  const s = room.state;
  const actor = currentActor(room, s);
  if (!actor || !actor.isAi) return;
  if (Date.now() < (s.aiAt || 0)) return;
  const stone = sideOf(actor.slot, s.mode) + 1;
  const enemy = stone === 1 ? 2 : 1;
  function scoreCell(r, c) {
    if (s.board[r][c]) return -1;
    let sc = 0;
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    for (const [dr, dc] of dirs) {
      let me = 0,
        op = 0,
        open = 0;
      for (const sign of [-1, 1]) {
        let rr = r + dr * sign,
          cc = c + dc * sign,
          hit = 0;
        while (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && s.board[rr][cc] === stone && hit < 5) {
          me++;
          hit++;
          rr += dr * sign;
          cc += dc * sign;
        }
        rr = r + dr * sign;
        cc = c + dc * sign;
        hit = 0;
        while (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && s.board[rr][cc] === enemy && hit < 5) {
          op++;
          hit++;
          rr += dr * sign;
          cc += dc * sign;
        }
        rr = r + dr * sign;
        cc = c + dc * sign;
        if (rr >= 0 && rr < 15 && cc >= 0 && cc < 15 && !s.board[rr][cc]) open++;
      }
      if (me >= 4) sc += 100000;
      else if (me === 3) sc += 4000;
      else if (me === 2) sc += 200;
      if (op >= 4) sc += 90000;
      else if (op === 3) sc += 3500;
      else if (op === 2) sc += 120;
      sc += open * 4;
    }
    const last = s.last;
    if (last) sc += Math.max(0, 18 - (Math.abs(last.r - r) + Math.abs(last.c - c))) * 3;
    sc += 8 - Math.abs(r - 7) - Math.abs(c - 7);
    return sc;
  }
  let best = -1,
    br = 7,
    bc = 7;
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const v = scoreCell(r, c);
      if (v > best) {
        best = v;
        br = r;
        bc = c;
      }
    }
  }
  if (best < 0) {
    endGame(room, "draw", null);
    return;
  }
  applyGomoku(room, actor, { r: br, c: bc }, endGame);
}

/* ===================== CHESS ===================== */
const CHESS_N = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];
const CHESS_K = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function chessStart() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(0));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) {
    b[0][c] = { t: back[c], s: 1 };
    b[1][c] = { t: "P", s: 1 };
    b[6][c] = { t: "P", s: 0 };
    b[7][c] = { t: back[c], s: 0 };
  }
  return b;
}

function chessIn(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function chessSlide(board, r, c, side, dirs, out) {
  for (const [dr, dc] of dirs) {
    let rr = r + dr,
      cc = c + dc;
    while (chessIn(rr, cc)) {
      const x = board[rr][cc];
      if (!x) out.push([rr, cc]);
      else {
        if (x.s !== side) out.push([rr, cc]);
        break;
      }
      rr += dr;
      cc += dc;
    }
  }
}

function chessAttacks(board, r, c, side) {
  const p = board[r][c];
  if (!p || p.s !== side) return false;
  return true;
}

function chessSquareAttacked(board, tr, tc, bySide) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.s !== bySide) continue;
      const moves = chessPseudo(board, r, c, p, true);
      for (const m of moves) if (m[0] === tr && m[1] === tc) return true;
    }
  }
  return false;
}

function chessFindKing(board, side) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.t === "K" && p.s === side) return [r, c];
  }
  return null;
}

function chessPseudo(board, r, c, p, forAttack) {
  const out = [];
  const s = p.s;
  if (p.t === "P") {
    const dir = s === 0 ? -1 : 1;
    const start = s === 0 ? 6 : 1;
    if (!forAttack) {
      if (chessIn(r + dir, c) && !board[r + dir][c]) {
        out.push([r + dir, c]);
        if (r === start && chessIn(r + dir * 2, c) && !board[r + dir * 2][c]) out.push([r + dir * 2, c]);
      }
    }
    for (const dc of [-1, 1]) {
      const rr = r + dir,
        cc = c + dc;
      if (!chessIn(rr, cc)) continue;
      if (forAttack || (board[rr][cc] && board[rr][cc].s !== s)) out.push([rr, cc]);
    }
  } else if (p.t === "N") {
    for (const [dr, dc] of CHESS_N) {
      const rr = r + dr,
        cc = c + dc;
      if (!chessIn(rr, cc)) continue;
      const x = board[rr][cc];
      if (!x || x.s !== s) out.push([rr, cc]);
    }
  } else if (p.t === "B") chessSlide(board, r, c, s, CHESS_K.filter((d) => d[0] && d[1]), out);
  else if (p.t === "R") chessSlide(board, r, c, s, CHESS_K.filter((d) => !d[0] || !d[1]), out);
  else if (p.t === "Q") chessSlide(board, r, c, s, CHESS_K, out);
  else if (p.t === "K") {
    for (const [dr, dc] of CHESS_K) {
      const rr = r + dr,
        cc = c + dc;
      if (!chessIn(rr, cc)) continue;
      const x = board[rr][cc];
      if (!x || x.s !== s) out.push([rr, cc]);
    }
  }
  return out;
}

function chessLegal(board, r, c, nr, nc, flags) {
  const p = board[r][c];
  if (!p) return false;
  const dests = chessPseudo(board, r, c, p, false);
  if (p.t === "K" && r === (p.s === 0 ? 7 : 0) && c === 4 && Math.abs(nc - c) === 2 && nr === r) {
    return chessCastleOk(board, p.s, nc > c, flags);
  }
  if (!dests.some((m) => m[0] === nr && m[1] === nc)) return false;
  const next = clone2(board);
  next[nr][nc] = p;
  next[r][c] = 0;
  if (p.t === "P" && (nr === 0 || nr === 7)) next[nr][nc] = { t: "Q", s: p.s };
  const k = chessFindKing(next, p.s);
  if (!k) return false;
  return !chessSquareAttacked(next, k[0], k[1], 1 - p.s);
}

function chessCastleOk(board, side, kingSide, flags) {
  const row = side === 0 ? 7 : 0;
  if (chessSquareAttacked(board, row, 4, 1 - side)) return false;
  if (kingSide) {
    if (flags[side === 0 ? "wK" : "bK"]) return false;
    if (board[row][5] || board[row][6]) return false;
    if (chessSquareAttacked(board, row, 5, 1 - side) || chessSquareAttacked(board, row, 6, 1 - side)) return false;
    const rook = board[row][7];
    return rook && rook.t === "R" && rook.s === side;
  }
  if (flags[side === 0 ? "wQ" : "bQ"]) return false;
  if (board[row][1] || board[row][2] || board[row][3]) return false;
  if (chessSquareAttacked(board, row, 3, 1 - side) || chessSquareAttacked(board, row, 2, 1 - side)) return false;
  const rook = board[row][0];
  return rook && rook.t === "R" && rook.s === side;
}

function chessAllLegal(board, side, flags) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.s !== side) continue;
      const dests = chessPseudo(board, r, c, p, false);
      if (p.t === "K") {
        dests.push([r, c + 2], [r, c - 2]);
      }
      for (const [nr, nc] of dests) {
        if (chessIn(nr, nc) && chessLegal(board, r, c, nr, nc, flags)) moves.push([r, c, nr, nc]);
      }
    }
  }
  return moves;
}

function initChess(room) {
  const mode = parseMode(room.mode);
  const actor = room.players[0];
  return {
    game: "chess",
    mode,
    board: chessStart(),
    flags: { wK: false, wQ: false, bK: false, bQ: false },
    turnSlot: 0,
    turnId: actor ? actor.id : null,
    turnSide: 0,
    last: null,
    playerMeta: metaPlayers(room),
    aiAt: Date.now() + 350,
  };
}

function applyChess(room, player, payload, endGame) {
  const s = room.state;
  if (!s || s.turnId !== player.id) return;
  const side = sideOf(player.slot, s.mode);
  const fr = payload.fr != null ? payload.fr | 0 : payload.fromR | 0;
  const fc = payload.fc != null ? payload.fc | 0 : payload.fromC | 0;
  const tr = payload.tr != null ? payload.tr | 0 : payload.toR | 0;
  const tc = payload.tc != null ? payload.tc | 0 : payload.toC | 0;
  const p = s.board[fr] && s.board[fr][fc];
  if (!p || p.s !== side) return;
  if (!chessLegal(s.board, fr, fc, tr, tc, s.flags)) return;
  const cap = s.board[tr][tc];
  s.board[tr][tc] = p;
  s.board[fr][fc] = 0;
  if (p.t === "K" && Math.abs(tc - fc) === 2) {
    if (tc === 6) {
      s.board[tr][5] = s.board[tr][7];
      s.board[tr][7] = 0;
    } else if (tc === 2) {
      s.board[tr][3] = s.board[tr][0];
      s.board[tr][0] = 0;
    }
  }
  if (p.t === "P" && (tr === 0 || tr === 7)) s.board[tr][tc] = { t: "Q", s: p.s };
  if (p.t === "K") {
    if (side === 0) s.flags.wK = s.flags.wQ = true;
    else s.flags.bK = s.flags.bQ = true;
  }
  if (p.t === "R" && fr === (side === 0 ? 7 : 0)) {
    if (fc === 0) s.flags[side === 0 ? "wQ" : "bQ"] = true;
    if (fc === 7) s.flags[side === 0 ? "wK" : "bK"] = true;
  }
  s.last = { fr, fc, tr, tc };
  if (cap && cap.t === "K") {
    endGame(room, "checkmate", player.id);
    return;
  }
  const opp = 1 - side;
  const oppMoves = chessAllLegal(s.board, opp, s.flags);
  const ok = chessFindKing(s.board, opp);
  if (!ok) {
    endGame(room, "checkmate", player.id);
    return;
  }
  const inCheck = chessSquareAttacked(s.board, ok[0], ok[1], side);
  if (!oppMoves.length) {
    endGame(room, inCheck ? "checkmate" : "draw", inCheck ? player.id : null);
    return;
  }
  nextTurn(room, s, false);
}

const CHESS_VAL = { P: 10, N: 32, B: 33, R: 50, Q: 90, K: 0 };

function chessAi(room, endGame) {
  const s = room.state;
  const actor = currentActor(room, s);
  if (!actor || !actor.isAi) return;
  if (Date.now() < (s.aiAt || 0)) return;
  const side = sideOf(actor.slot, s.mode);
  const moves = chessAllLegal(s.board, side, s.flags);
  if (!moves.length) {
    const k = chessFindKing(s.board, side);
    const inCheck = k && chessSquareAttacked(s.board, k[0], k[1], 1 - side);
    endGame(room, inCheck ? "checkmate" : "draw", inCheck ? (room.players.find((p) => sideOf(p.slot, s.mode) === 1 - side) || {}).id : null);
    return;
  }
  let best = -1e9,
    pick = moves[0];
  for (const m of moves) {
    const cap = s.board[m[2]][m[3]];
    let sc = (cap ? CHESS_VAL[cap.t] || 0 : 0) + Math.random() * 3;
    if (m[2] >= 2 && m[2] <= 5 && m[3] >= 2 && m[3] <= 5) sc += 1.2;
    if (sc > best) {
      best = sc;
      pick = m;
    }
  }
  applyChess(room, actor, { fr: pick[0], fc: pick[1], tr: pick[2], tc: pick[3] }, endGame);
}

/* ===================== JANGGI ===================== */
function janggiPalace(r, c, side) {
  if (c < 3 || c > 5) return false;
  if (side === 0) return r >= 7 && r <= 9;
  return r >= 0 && r <= 2;
}
function janggiInPalace(r, c) {
  return c >= 3 && c <= 5 && ((r >= 0 && r <= 2) || (r >= 7 && r <= 9));
}

function janggiStart() {
  const b = Array.from({ length: 10 }, () => Array(9).fill(0));
  const back = ["R", "N", "B", "A", "K", "A", "B", "N", "R"];
  for (let c = 0; c < 9; c++) {
    b[0][c] = { t: back[c], s: 1 };
    b[9][c] = { t: back[c], s: 0 };
  }
  b[2][1] = { t: "C", s: 1 };
  b[2][7] = { t: "C", s: 1 };
  b[7][1] = { t: "C", s: 0 };
  b[7][7] = { t: "C", s: 0 };
  for (const c of [0, 2, 4, 6, 8]) {
    b[3][c] = { t: "P", s: 1 };
    b[6][c] = { t: "P", s: 0 };
  }
  return b;
}

function jgIn(r, c) {
  return r >= 0 && r < 10 && c >= 0 && c < 9;
}

function janggiPseudo(board, r, c, p) {
  const out = [];
  const s = p.s;
  function push(rr, cc) {
    if (!jgIn(rr, cc)) return;
    const x = board[rr][cc];
    if (!x || x.s !== s) out.push([rr, cc]);
  }
  if (p.t === "R") {
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let rr = r + dr,
        cc = c + dc;
      while (jgIn(rr, cc)) {
        const x = board[rr][cc];
        if (!x) out.push([rr, cc]);
        else {
          if (x.s !== s) out.push([rr, cc]);
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  } else if (p.t === "C") {
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let rr = r + dr,
        cc = c + dc,
        jumped = false;
      while (jgIn(rr, cc)) {
        const x = board[rr][cc];
        if (!jumped) {
          if (x) {
            if (x.t === "C") break;
            jumped = true;
          }
        } else {
          if (!x) out.push([rr, cc]);
          else {
            if (x.t !== "C" && x.s !== s) out.push([rr, cc]);
            break;
          }
        }
        rr += dr;
        cc += dc;
      }
    }
  } else if (p.t === "N") {
    const legs = [
      [1, 0, 2, 1],
      [1, 0, 2, -1],
      [-1, 0, -2, 1],
      [-1, 0, -2, -1],
      [0, 1, 1, 2],
      [0, 1, -1, 2],
      [0, -1, 1, -2],
      [0, -1, -1, -2],
    ];
    for (const [br, bc, dr, dc] of legs) {
      if (!jgIn(r + br, c + bc) || board[r + br][c + bc]) continue;
      push(r + dr, c + dc);
    }
  } else if (p.t === "B") {
    const legs = [
      [1, 0, 2, 1, 3, 2],
      [1, 0, 2, -1, 3, -2],
      [-1, 0, -2, 1, -3, 2],
      [-1, 0, -2, -1, -3, -2],
      [0, 1, 1, 2, 2, 3],
      [0, 1, -1, 2, -2, 3],
      [0, -1, 1, -2, 2, -3],
      [0, -1, -1, -2, -2, -3],
    ];
    for (const [a, b, d, e, dr, dc] of legs) {
      if (!jgIn(r + a, c + b) || board[r + a][c + b]) continue;
      if (!jgIn(r + d, c + e) || board[r + d][c + e]) continue;
      push(r + dr, c + dc);
    }
  } else if (p.t === "A" || p.t === "K") {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [dr, dc] of dirs) {
      const rr = r + dr,
        cc = c + dc;
      if (!janggiPalace(rr, cc, s) && !(p.t === "K" && janggiInPalace(rr, cc) && janggiPalace(r, c, s))) continue;
      if (!janggiInPalace(rr, cc)) continue;
      push(rr, cc);
    }
  } else if (p.t === "P") {
    const fwd = s === 0 ? -1 : 1;
    push(r + fwd, c);
    const crossed = s === 0 ? r <= 4 : r >= 5;
    if (crossed) {
      push(r, c - 1);
      push(r, c + 1);
    }
  }
  return out;
}

function janggiFindKing(board, side) {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = board[r][c];
    if (p && p.t === "K" && p.s === side) return [r, c];
  }
  return null;
}

function janggiFlying(board) {
  const a = janggiFindKing(board, 0);
  const b = janggiFindKing(board, 1);
  if (!a || !b || a[1] !== b[1]) return false;
  const c = a[1];
  const r0 = Math.min(a[0], b[0]) + 1;
  const r1 = Math.max(a[0], b[0]);
  for (let r = r0; r < r1; r++) if (board[r][c]) return false;
  return true;
}

function janggiLegal(board, r, c, nr, nc) {
  const p = board[r][c];
  if (!p) return false;
  if (!janggiPseudo(board, r, c, p).some((m) => m[0] === nr && m[1] === nc)) return false;
  const next = clone2(board);
  next[nr][nc] = p;
  next[r][c] = 0;
  if (!janggiFindKing(next, p.s)) return false;
  if (janggiFlying(next)) return false;
  return true;
}

function initJanggi(room) {
  const mode = parseMode(room.mode);
  const actor = room.players[0];
  return {
    game: "janggi",
    mode,
    board: janggiStart(),
    turnSlot: 0,
    turnId: actor ? actor.id : null,
    turnSide: 0,
    last: null,
    playerMeta: metaPlayers(room),
    aiAt: Date.now() + 380,
  };
}

function applyJanggi(room, player, payload, endGame) {
  const s = room.state;
  if (!s || s.turnId !== player.id) return;
  const side = sideOf(player.slot, s.mode);
  const fr = payload.fr | 0,
    fc = payload.fc | 0,
    tr = payload.tr | 0,
    tc = payload.tc | 0;
  const p = s.board[fr] && s.board[fr][fc];
  if (!p || p.s !== side) return;
  if (!janggiLegal(s.board, fr, fc, tr, tc)) return;
  const cap = s.board[tr][tc];
  s.board[tr][tc] = p;
  s.board[fr][fc] = 0;
  s.last = { fr, fc, tr, tc };
  if (cap && cap.t === "K") {
    endGame(room, "king", player.id);
    return;
  }
  nextTurn(room, s, false);
}

const JANGGI_VAL = { P: 2, A: 3, N: 5, B: 3, C: 7, R: 13, K: 0 };

function janggiAi(room, endGame) {
  const s = room.state;
  const actor = currentActor(room, s);
  if (!actor || !actor.isAi) return;
  if (Date.now() < (s.aiAt || 0)) return;
  const side = sideOf(actor.slot, s.mode);
  const moves = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = s.board[r][c];
      if (!p || p.s !== side) continue;
      for (const m of janggiPseudo(s.board, r, c, p)) {
        if (janggiLegal(s.board, r, c, m[0], m[1])) moves.push([r, c, m[0], m[1]]);
      }
    }
  }
  if (!moves.length) {
    endGame(room, "king", (room.players.find((p) => sideOf(p.slot, s.mode) === 1 - side) || {}).id);
    return;
  }
  let best = -1e9,
    pick = moves[0];
  for (const m of moves) {
    const cap = s.board[m[2]][m[3]];
    let sc = (cap ? (JANGGI_VAL[cap.t] || 0) * 10 : 0) + Math.random() * 2;
    if (cap && cap.t === "K") sc += 1000;
    if (sc > best) {
      best = sc;
      pick = m;
    }
  }
  applyJanggi(room, actor, { fr: pick[0], fc: pick[1], tr: pick[2], tc: pick[3] }, endGame);
}

/* ===================== MARBLE ===================== */
const MARBLE_CELLS = [
  { t: "start", name: "로비" },
  { t: "prop", name: "1011", price: 80, rent: 24 },
  { t: "prop", name: "스위트", price: 120, rent: 36 },
  { t: "chance", name: "찬스" },
  { t: "prop", name: "뷔페", price: 140, rent: 42 },
  { t: "tax", name: "봉사료", tax: 60 },
  { t: "prop", name: "스파", price: 160, rent: 48 },
  { t: "prop", name: "라운지", price: 180, rent: 54 },
  { t: "jail", name: "섬" },
  { t: "prop", name: "연회장", price: 200, rent: 64 },
  { t: "chance", name: "찬스" },
  { t: "prop", name: "클럽", price: 220, rent: 70 },
  { t: "prop", name: "키친", price: 240, rent: 76 },
  { t: "park", name: "휴식" },
  { t: "prop", name: "가든", price: 260, rent: 84 },
  { t: "tax", name: "세금", tax: 80 },
  { t: "prop", name: "펜트", price: 300, rent: 96 },
  { t: "chance", name: "찬스" },
  { t: "prop", name: "시그니엘", price: 340, rent: 110 },
  { t: "gotojail", name: "퇴실" },
  { t: "prop", name: "VIP", price: 360, rent: 120 },
  { t: "prop", name: "루프탑", price: 400, rent: 140 },
  { t: "chance", name: "찬스" },
  { t: "prop", name: "이그제", price: 450, rent: 160 },
];

function initMarble(room) {
  const mode = parseMode(room.mode);
  const cells = MARBLE_CELLS.map((c, i) => Object.assign({ i, owner: -1 }, c));
  const tokens = room.players.map((p, i) => ({
    id: p.id,
    slot: i,
    team: teamOf(i, mode),
    pos: 0,
    money: 1500,
    jail: 0,
    bankrupt: false,
  }));
  return {
    game: "marble",
    mode,
    cells,
    tokens,
    turnSlot: 0,
    turnId: room.players[0] ? room.players[0].id : null,
    pending: "roll",
    lastRoll: null,
    log: "주사위를 굴리세요",
    extra: 0,
    playerMeta: metaPlayers(room),
    aiAt: Date.now() + 500,
  };
}

function marbleAlive(s) {
  return s.tokens.filter((t) => !t.bankrupt);
}

function marbleTeamMoney(s, team) {
  return s.tokens.filter((t) => t.team === team && !t.bankrupt).reduce((a, t) => a + t.money, 0);
}

function marbleMaybeEnd(room, s, endGame) {
  const alive = marbleAlive(s);
  if (s.mode === "2v2") {
    const a = marbleTeamMoney(s, 0);
    const b = marbleTeamMoney(s, 1);
    const aLive = s.tokens.some((t) => t.team === 0 && !t.bankrupt);
    const bLive = s.tokens.some((t) => t.team === 1 && !t.bankrupt);
    if (!aLive || !bLive) {
      const winTeam = aLive ? 0 : 1;
      const w = room.players.find((p) => teamOf(p.slot, s.mode) === winTeam);
      endGame(room, "bankrupt", w ? w.id : null);
      return true;
    }
    if (a <= 0) {
      const w = room.players.find((p) => teamOf(p.slot, s.mode) === 1);
      endGame(room, "bankrupt", w ? w.id : null);
      return true;
    }
    if (b <= 0) {
      const w = room.players.find((p) => teamOf(p.slot, s.mode) === 0);
      endGame(room, "bankrupt", w ? w.id : null);
      return true;
    }
  } else if (alive.length <= 1) {
    endGame(room, "bankrupt", alive[0] ? alive[0].id : null);
    return true;
  }
  return false;
}

function marbleLand(room, s, tok, endGame) {
  const cell = s.cells[tok.pos];
  if (!cell) return;
  if (cell.t === "start") {
    tok.money += 200;
    s.log = "출발 보너스 +200";
    s.pending = "roll";
    nextTurn(room, s, s.extra > 0);
    if (s.extra > 0) s.extra--;
  } else if (cell.t === "tax") {
    tok.money -= cell.tax || 60;
    s.log = (cell.name || "세금") + " -" + (cell.tax || 60);
    s.pending = "roll";
    nextTurn(room, s, false);
  } else if (cell.t === "jail") {
    s.log = "무인도에 쉬어갑니다";
    s.pending = "roll";
    nextTurn(room, s, false);
  } else if (cell.t === "gotojail") {
    tok.pos = s.cells.findIndex((c) => c.t === "jail");
    tok.jail = 1;
    s.log = "무인도로 이동합니다";
    s.pending = "roll";
    nextTurn(room, s, false);
  } else if (cell.t === "park") {
    s.log = "휴게 — 아무 일도 없습니다";
    s.pending = "roll";
    nextTurn(room, s, false);
  } else if (cell.t === "chance") {
    const roll = (Math.random() * 5) | 0;
    if (roll === 0) {
      tok.money += 150;
      s.log = "VIP 팁 +150";
    } else if (roll === 1) {
      tok.money -= 100;
      s.log = "컴플레인 배상 -100";
    } else if (roll === 2) {
      tok.pos = 0;
      tok.money += 200;
      s.log = "로비로 이동 +200";
    } else if (roll === 3) {
      tok.money += 80;
      s.log = "업셀링 성공 +80";
    } else {
      tok.money -= 50;
      s.log = "미니바 정산 -50";
    }
    s.pending = "roll";
    nextTurn(room, s, false);
  } else if (cell.t === "prop") {
    if (cell.owner < 0) {
      if (tok.money >= cell.price) {
        s.pending = "buy";
        s.log = cell.name + " 구매 " + cell.price + "G ?";
        s.aiAt = Date.now() + 500;
        return;
      }
      s.log = cell.name + " — 자금 부족, 패스";
      s.pending = "roll";
      nextTurn(room, s, false);
    } else if (cell.owner === tok.slot || (s.mode === "2v2" && teamOf(cell.owner, s.mode) === tok.team)) {
      s.log = "우리 땅입니다";
      s.pending = "roll";
      nextTurn(room, s, false);
    } else {
      const rent = cell.rent || 20;
      tok.money -= rent;
      const owner = s.tokens[cell.owner];
      if (owner && !owner.bankrupt) owner.money += rent;
      s.log = cell.name + " 숙박료 " + rent + "G";
      if (tok.money < 0) {
        tok.bankrupt = true;
        tok.money = 0;
        s.cells.forEach((c) => {
          if (c.owner === tok.slot) c.owner = -1;
        });
        if (marbleMaybeEnd(room, s, endGame)) return;
      }
      s.pending = "roll";
      nextTurn(room, s, false);
    }
  }
  if (tok.money < 0) {
    tok.bankrupt = true;
    tok.money = 0;
    s.cells.forEach((c) => {
      if (c.owner === tok.slot) c.owner = -1;
    });
    marbleMaybeEnd(room, s, endGame);
  }
}

function applyMarble(room, player, payload, endGame) {
  const s = room.state;
  if (!s || s.turnId !== player.id) return;
  const tok = s.tokens[player.slot];
  if (!tok || tok.bankrupt) return;
  const act = String(payload.act || payload.action || "");
  if (s.pending === "roll" && (act === "roll" || act === "")) {
    if (tok.jail) {
      tok.jail = 0;
      s.log = "무인도에서 빠져나왔습니다";
      s.pending = "roll";
      nextTurn(room, s, false);
      return;
    }
    const a = 1 + ((Math.random() * 6) | 0);
    const b = 1 + ((Math.random() * 6) | 0);
    s.lastRoll = [a, b];
    s.extra = a === b ? 1 : 0;
    const n = s.cells.length;
    const prev = tok.pos;
    tok.pos = (tok.pos + a + b) % n;
    if (tok.pos < prev) tok.money += 200;
    marbleLand(room, s, tok, endGame);
    return;
  }
  if (s.pending === "buy" && (act === "buy" || act === "skip")) {
    const cell = s.cells[tok.pos];
    if (act === "buy" && cell && cell.t === "prop" && cell.owner < 0 && tok.money >= cell.price) {
      tok.money -= cell.price;
      cell.owner = tok.slot;
      s.log = cell.name + " 구매 완료";
    } else s.log = "패스";
    s.pending = "roll";
    nextTurn(room, s, false);
  }
}

function marbleAi(room, endGame) {
  const s = room.state;
  const actor = currentActor(room, s);
  if (!actor || !actor.isAi) return;
  if (Date.now() < (s.aiAt || 0)) return;
  if (s.pending === "buy") applyMarble(room, actor, { act: "buy" }, endGame);
  else if (s.pending === "roll") applyMarble(room, actor, { act: "roll" }, endGame);
}

/* ===================== YUT ===================== */
function yutNodes() {
  const pts = [];
  function side(x0, y0, x1, y1, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
    return out;
  }
  pts.push.apply(pts, side(0.88, 0.88, 0.12, 0.88, 5));
  pts.push.apply(pts, side(0.12, 0.88, 0.12, 0.12, 5));
  pts.push.apply(pts, side(0.12, 0.12, 0.88, 0.12, 5));
  pts.push.apply(pts, side(0.88, 0.12, 0.88, 0.88, 5));
  pts.push({ x: 0.5, y: 0.5, id: 20 });
  pts.push({ x: 0.31, y: 0.69 });
  pts.push({ x: 0.31, y: 0.31 });
  pts.push({ x: 0.69, y: 0.31 });
  pts.push({ x: 0.69, y: 0.69 });
  pts.push({ x: 0.22, y: 0.5 });
  pts.push({ x: 0.78, y: 0.5 });
  return pts.map((p, i) => ({ id: i, x: p.x, y: p.y }));
}

function yutWalk(start, steps) {
  let pos = start;
  const from5 = [5, 21, 20, 22, 10];
  const from10 = [10, 23, 20, 24, 15];
  const from15 = [15, 25, 20, 26, 0];
  function route(p) {
    if (p === 5) return from5;
    if (p === 10) return from10;
    if (p === 15) return from15;
    return null;
  }
  let used = route(pos);
  for (let i = 0; i < steps; i++) {
    if (pos === "home") return "home";
    if (pos < 0) {
      pos = 0;
      used = null;
      continue;
    }
    if (used) {
      const idx = used.indexOf(pos);
      if (idx >= 0 && idx < used.length - 1) {
        pos = used[idx + 1];
        if (pos === 0 && used === from15) return "home";
        continue;
      }
      used = null;
    }
    if (pos === 19) return "home";
    pos = (pos + 1) % 20;
    if (pos === 0) return "home";
  }
  return pos;
}

function initYut(room) {
  const mode = parseMode(room.mode);
  const teams = mode === "2v2" || room.players.length >= 2 ? 2 : 2;
  const mals = [];
  for (let t = 0; t < teams; t++) {
    for (let i = 0; i < 4; i++) mals.push({ team: t, i, pos: -1, home: false, stacked: 1 });
  }
  return {
    game: "yut",
    mode,
    nodes: yutNodes(),
    mals,
    turnSlot: 0,
    turnId: room.players[0] ? room.players[0].id : null,
    pending: "throw",
    lastYut: null,
    extra: 0,
    log: "윷을 던지세요",
    playerMeta: metaPlayers(room),
    aiAt: Date.now() + 450,
  };
}

const YUT_NAMES = ["", "도", "개", "걸", "윷", "모"];

function yutTeamOfPlayer(player, mode) {
  return teamOf(player.slot, mode);
}

function applyYut(room, player, payload, endGame) {
  const s = room.state;
  if (!s || s.turnId !== player.id) return;
  const team = yutTeamOfPlayer(player, s.mode);
  const act = String(payload.act || "");
  if (s.pending === "throw" && (act === "throw" || act === "roll" || act === "")) {
    let backs = 0;
    const sticks = [];
    for (let i = 0; i < 4; i++) {
      const back = Math.random() < 0.5;
      sticks.push(back ? 1 : 0);
      if (back) backs++;
    }
    const n = backs === 0 ? 5 : backs;
    s.lastYut = { n, name: YUT_NAMES[n], sticks };
    s.extra = n >= 4 ? 1 : 0;
    s.pending = "move";
    s.log = YUT_NAMES[n] + " (" + n + "칸)";
    s.moveN = n;
    s.aiAt = Date.now() + 380;
    const opts = yutOptions(s, team, n);
    if (!opts.length) {
      s.log = YUT_NAMES[n] + " — 움직일 말이 없습니다";
      s.pending = "throw";
      nextTurn(room, s, s.extra > 0);
      if (s.extra > 0) s.extra--;
    }
    return;
  }
  if (s.pending === "move" && (act === "move" || payload.mal != null)) {
    const idx = payload.mal != null ? payload.mal | 0 : payload.i | 0;
    const mal = s.mals[idx];
    if (!mal || mal.team !== team || mal.home) return;
    const dest = yutWalk(mal.pos, s.moveN || 1);
    const group = s.mals.filter((m) => m.team === team && !m.home && m.pos === mal.pos && mal.pos >= 0);
    const moving = mal.pos < 0 ? [mal] : group.length ? group : [mal];
    if (dest === "home") {
      moving.forEach((m) => {
        m.home = true;
        m.pos = 99;
      });
      s.log = "골인!";
      const left = s.mals.filter((m) => m.team === team && !m.home);
      if (!left.length) {
        endGame(room, "yut", player.id);
        return;
      }
      s.extra = 1;
    } else {
      moving.forEach((m) => {
        m.pos = dest;
      });
      const captured = s.mals.filter((m) => m.team !== team && !m.home && m.pos === dest);
      if (captured.length) {
        captured.forEach((m) => {
          m.pos = -1;
        });
        s.extra = 1;
        s.log = "잡기! 한 번 더";
      } else s.log = YUT_NAMES[s.moveN] + " 이동";
    }
    s.pending = "throw";
    nextTurn(room, s, s.extra > 0);
    if (s.extra > 0) s.extra--;
  }
}

function yutOptions(s, team, n) {
  const opts = [];
  const seen = {};
  s.mals.forEach((m, i) => {
    if (m.team !== team || m.home) return;
    const key = m.pos < 0 ? "off" + i : "p" + m.pos;
    if (m.pos >= 0 && seen[key]) return;
    seen[key] = 1;
    opts.push(i);
  });
  return opts;
}

function yutAi(room, endGame) {
  const s = room.state;
  const actor = currentActor(room, s);
  if (!actor || !actor.isAi) return;
  if (Date.now() < (s.aiAt || 0)) return;
  if (s.pending === "throw") applyYut(room, actor, { act: "throw" }, endGame);
  else if (s.pending === "move") {
    const team = yutTeamOfPlayer(actor, s.mode);
    const opts = yutOptions(s, team, s.moveN);
    const pick = opts.length ? opts[opts.length - 1] : 0;
    applyYut(room, actor, { act: "move", mal: pick }, endGame);
  }
}

/* ===================== dispatch ===================== */
function initState(room) {
  switch (room.game) {
    case "gomoku":
      return initGomoku(room);
    case "chess":
      return initChess(room);
    case "janggi":
      return initJanggi(room);
    case "marble":
      return initMarble(room);
    case "yut":
      return initYut(room);
    default:
      return {};
  }
}

function applyInput(room, player, payload, endGame) {
  payload = payload || {};
  switch (room.game) {
    case "gomoku":
      return applyGomoku(room, player, payload, endGame);
    case "chess":
      return applyChess(room, player, payload, endGame);
    case "janggi":
      return applyJanggi(room, player, payload, endGame);
    case "marble":
      return applyMarble(room, player, payload, endGame);
    case "yut":
      return applyYut(room, player, payload, endGame);
  }
}

function tick(room, dt, endGame) {
  if (!room.state) return;
  switch (room.game) {
    case "gomoku":
      return gomokuAi(room, endGame);
    case "chess":
      return chessAi(room, endGame);
    case "janggi":
      return janggiAi(room, endGame);
    case "marble":
      return marbleAi(room, endGame);
    case "yut":
      return yutAi(room, endGame);
  }
}

function publicState(s) {
  return s;
}

module.exports = {
  GAMES,
  MODES,
  isBoardGame,
  parseMode,
  modeNeed,
  modeMax,
  isSolo,
  isTeam,
  teamOf,
  ensurePlayers,
  allReady,
  defaultInput,
  initState,
  applyInput,
  tick,
  publicState,
};
