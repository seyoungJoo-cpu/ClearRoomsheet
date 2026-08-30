"use strict";

const GAMES = {
  gomoku: { max: 4, hz: 8 },
  chess: { max: 4, hz: 8 },
  janggi: { max: 4, hz: 8 },
  yut: { max: 4, hz: 10 },
};

const MODES = {
  solo: { label: "1:AI", need: 2, max: 2, team: false, solo: true },
  "1v1": { label: "1:1", need: 2, max: 2, team: false },
  "2v2": { label: "2:2", need: 4, max: 4, team: true },
  ffa3: { label: "3팀", need: 3, max: 3, team: false },
  ffa4: { label: "4팀", need: 4, max: 4, team: false },
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
  if (mode === "ffa3" || mode === "ffa4") return slot;
  return slot % 2;
}
function sideOf(slot, mode) {
  if (isTeam(mode)) return slot < 2 ? 0 : 1;
  if (mode === "ffa3" || mode === "ffa4") return slot;
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
  if (isTeam(s.mode) && n >= 4) {
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
  if (mode === "ffa3") return humans.length === 3;
  if (mode === "ffa4") return humans.length === 4;
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

function janggiPalaceDiags() {
  return [
    [[0, 3], [1, 4], [2, 5]],
    [[0, 5], [1, 4], [2, 3]],
    [[7, 3], [8, 4], [9, 5]],
    [[7, 5], [8, 4], [9, 3]],
  ];
}

function janggiOnPalaceDiagLine(r, c, nr, nc) {
  if (!janggiInPalace(r, c) || !janggiInPalace(nr, nc)) return false;
  return janggiPalaceDiags().some((line) => {
    const i = line.findIndex((p) => p[0] === r && p[1] === c);
    const j = line.findIndex((p) => p[0] === nr && p[1] === nc);
    return i >= 0 && j >= 0;
  });
}

function janggiPalaceDiagStep(r, c, nr, nc) {
  if (Math.abs(nr - r) !== 1 || Math.abs(nc - c) !== 1) return false;
  return janggiOnPalaceDiagLine(r, c, nr, nc);
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
  function slideLine(points, cannon) {
    const idx = points.findIndex((pt) => pt[0] === r && pt[1] === c);
    if (idx < 0) return;
    for (const dir of [-1, 1]) {
      let jumped = false;
      for (let k = idx + dir; k >= 0 && k < points.length; k += dir) {
        const rr = points[k][0],
          cc = points[k][1];
        const x = board[rr][cc];
        if (!cannon) {
          if (!x) out.push([rr, cc]);
          else {
            if (x.s !== s) out.push([rr, cc]);
            break;
          }
        } else if (!jumped) {
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
      }
    }
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
    janggiPalaceDiags().forEach((line) => slideLine(line, false));
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
    janggiPalaceDiags().forEach((line) => slideLine(line, true));
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
      const ortho = dr === 0 || dc === 0;
      if (!ortho && !janggiPalaceDiagStep(r, c, rr, cc)) continue;
      push(rr, cc);
    }
  } else if (p.t === "P") {
    const fwd = s === 0 ? -1 : 1;
    push(r + fwd, c);
    push(r, c - 1);
    push(r, c + 1);
    for (const dc of [-1, 1]) {
      const rr = r + fwd,
        cc = c + dc;
      if (janggiPalaceDiagStep(r, c, rr, cc)) push(rr, cc);
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

function janggiBikjang(board) {
  const a = janggiFindKing(board, 0);
  const b = janggiFindKing(board, 1);
  if (!a || !b || a[1] !== b[1]) return false;
  const c = a[1];
  const r0 = Math.min(a[0], b[0]) + 1;
  const r1 = Math.max(a[0], b[0]);
  for (let r = r0; r < r1; r++) if (board[r][c]) return false;
  return true;
}

function janggiInCheck(board, side) {
  const king = janggiFindKing(board, side);
  if (!king) return true;
  const opp = 1 - side;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p || p.s !== opp) continue;
      if (janggiPseudo(board, r, c, p).some((m) => m[0] === king[0] && m[1] === king[1])) return true;
    }
  }
  return false;
}

function janggiLegal(board, r, c, nr, nc) {
  const p = board[r][c];
  if (!p) return false;
  if (!janggiPseudo(board, r, c, p).some((m) => m[0] === nr && m[1] === nc)) return false;
  const next = clone2(board);
  next[nr][nc] = p;
  next[r][c] = 0;
  if (!janggiFindKing(next, p.s)) return false;
  if (janggiInCheck(next, p.s)) return false;
  return true;
}

function janggiHasMove(board, side) {
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p || p.s !== side) continue;
      for (const m of janggiPseudo(board, r, c, p)) {
        if (janggiLegal(board, r, c, m[0], m[1])) return true;
      }
    }
  }
  return false;
}

function janggiApplyLayout(board, side, inner) {
  const row = side === 0 ? 9 : 0;
  if (inner) {
    board[row][1] = { t: "N", s: side };
    board[row][2] = { t: "B", s: side };
    board[row][6] = { t: "B", s: side };
    board[row][7] = { t: "N", s: side };
  } else {
    board[row][1] = { t: "B", s: side };
    board[row][2] = { t: "N", s: side };
    board[row][6] = { t: "N", s: side };
    board[row][7] = { t: "B", s: side };
  }
}

function janggiPushFx(s, kind, extra) {
  s.fxSeq = (s.fxSeq || 0) + 1;
  s.fx = Object.assign({ kind: kind, id: s.fxSeq }, extra || {});
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
    pending: "setup",
    setupReady: [false, false],
    layoutInner: [true, true],
    lastPass: 0,
    check: false,
    log: "상·마 배치 · 내상/외상을 고르세요",
    fx: null,
    fxSeq: 0,
    playerMeta: metaPlayers(room),
    aiAt: Date.now() + 280,
  };
}

function applyJanggi(room, player, payload, endGame) {
  const s = room.state;
  if (!s) return;
  const side = sideOf(player.slot, s.mode);
  const act = String(payload.act || "");
  if (s.pending === "setup") {
    if (act === "layout") {
      const inner = payload.inner !== false && payload.inner !== 0 && payload.inner !== "0";
      s.layoutInner[side] = !!inner;
      janggiApplyLayout(s.board, side, s.layoutInner[side]);
      s.log = (side === 0 ? "초" : "한") + (s.layoutInner[side] ? " · 내상" : " · 외상");
      janggiPushFx(s, "setup");
      return;
    }
    if (act === "ready" || act === "setup-ok") {
      s.setupReady[side] = true;
      if (s.setupReady[0] && s.setupReady[1]) {
        s.pending = "play";
        s.log = "대국 시작";
        janggiPushFx(s, "start");
      } else {
        s.log = (side === 0 ? "초" : "한") + " 배치 완료 · 상대 대기";
      }
      return;
    }
    return;
  }
  if (s.turnId !== player.id) return;
  if (act === "pass") {
    if (janggiInCheck(s.board, side)) return;
    s.lastPass = (s.lastPass || 0) + 1;
    s.last = null;
    s.check = false;
    s.log = "한수쉼";
    janggiPushFx(s, "pass");
    if (s.lastPass >= 2) {
      endGame(room, "draw", null);
      return;
    }
    nextTurn(room, s, false);
    return;
  }
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
  s.last = { fr, fc, tr, tc, cap: cap ? cap.t : "" };
  s.lastPass = 0;
  const opp = 1 - side;
  if (cap && cap.t === "K") {
    s.log = "한!";
    janggiPushFx(s, "mate", { cap: cap.t });
    endGame(room, "han", player.id);
    return;
  }
  if (janggiBikjang(s.board)) {
    s.log = "빅장 · 무승부";
    janggiPushFx(s, "bikjang");
    endGame(room, "bikjang", null);
    return;
  }
  const check = janggiInCheck(s.board, opp);
  s.check = check;
  if (check && !janggiHasMove(s.board, opp)) {
    s.log = "한!";
    janggiPushFx(s, "mate", { cap: cap ? cap.t : "" });
    endGame(room, "han", player.id);
    return;
  }
  if (check) {
    s.log = "장군!";
    janggiPushFx(s, "check", { cap: cap ? cap.t : "" });
  } else if (cap) {
    s.log = "잡기!";
    janggiPushFx(s, "capture", { cap: cap.t });
  } else {
    s.log = "이동";
    janggiPushFx(s, "move");
  }
  nextTurn(room, s, false);
}

const JANGGI_VAL = { P: 2, A: 3, N: 5, B: 3, C: 7, R: 13, K: 0 };

function janggiAi(room, endGame) {
  const s = room.state;
  const actor = currentActor(room, s);
  if (!s) return;
  if (s.pending === "setup") {
    const ais = (room.players || []).filter((p) => p.isAi);
    for (let i = 0; i < ais.length; i++) {
      const ai = ais[i];
      const aiSide = sideOf(ai.slot, s.mode);
      if (s.setupReady[aiSide]) continue;
      if (Math.random() < 0.5) applyJanggi(room, ai, { act: "layout", inner: false }, endGame);
      applyJanggi(room, ai, { act: "ready" }, endGame);
    }
    return;
  }
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
    applyJanggi(room, actor, { act: "pass" }, endGame);
    return;
  }
  let best = -1e9,
    pick = moves[0];
  for (const m of moves) {
    const cap = s.board[m[2]][m[3]];
    let sc = (cap ? (JANGGI_VAL[cap.t] || 0) * 10 : 0) + Math.random() * 2;
    if (cap && cap.t === "K") sc += 1000;
    const next = clone2(s.board);
    next[m[2]][m[3]] = next[m[0]][m[1]];
    next[m[0]][m[1]] = 0;
    if (janggiInCheck(next, 1 - side)) sc += 18;
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
const YUT_NAMES = ["", "도", "개", "걸", "윷", "모"];
const YUT_TEAM_NAMES = ["청", "홍", "황", "녹"];
const YUT_INNER_NEXT = { 21: 22, 22: 20, 25: 26, 26: 20, 23: 24, 24: 15, 27: 28, 28: 0 };
const YUT_INNER_PREV = { 21: 5, 22: 21, 25: 10, 26: 25, 23: 20, 24: 23, 27: 20, 28: 27 };

function yutTeamCount(mode) {
  if (mode === "ffa3") return 3;
  if (mode === "ffa4") return 4;
  return 2;
}

function yutLerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function yutNodes() {
  const pts = new Array(29);
  pts[0] = { x: 0.14, y: 0.86 };
  pts[5] = { x: 0.86, y: 0.86 };
  pts[10] = { x: 0.86, y: 0.14 };
  pts[15] = { x: 0.14, y: 0.14 };
  pts[20] = { x: 0.5, y: 0.5 };
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    pts[i] = yutLerp(pts[0], pts[5], t);
    pts[5 + i] = yutLerp(pts[5], pts[10], t);
    pts[10 + i] = yutLerp(pts[10], pts[15], t);
    pts[15 + i] = yutLerp(pts[15], pts[0], t);
  }
  pts[21] = yutLerp(pts[5], pts[20], 1 / 3);
  pts[22] = yutLerp(pts[5], pts[20], 2 / 3);
  pts[24] = yutLerp(pts[15], pts[20], 1 / 3);
  pts[23] = yutLerp(pts[15], pts[20], 2 / 3);
  pts[25] = yutLerp(pts[10], pts[20], 1 / 3);
  pts[26] = yutLerp(pts[10], pts[20], 2 / 3);
  pts[27] = yutLerp(pts[20], pts[0], 1 / 3);
  pts[28] = yutLerp(pts[20], pts[0], 2 / 3);
  return pts.map((p, i) => ({ id: i, x: p.x, y: p.y }));
}

function yutNextOptions(pos, startingHere, from) {
  if (pos === "home" || pos === 99) return ["home"];
  if (pos < 0) return [1];
  if (pos === 20) return startingHere ? [27] : [23];
  if (YUT_INNER_NEXT[pos] != null) return [YUT_INNER_NEXT[pos]];
  if (pos === 5) return startingHere ? [21] : [6];
  if (pos === 10) return startingHere ? [25] : [11];
  if (pos === 0) return from === -1 ? [1] : ["home"];
  if (pos === 19) return [0];
  if (pos >= 0 && pos < 19) return [pos + 1];
  return ["home"];
}

function yutPrevPos(pos, arrivedFrom) {
  if (pos === "home" || pos === 99) return 0;
  if (pos < 0) return null;
  if (pos === 0) {
    if (arrivedFrom === 19 || arrivedFrom === 28 || arrivedFrom === 1) return arrivedFrom;
    return 19;
  }
  if (pos === 20) {
    if (arrivedFrom === 22 || arrivedFrom === 26 || arrivedFrom === 23) return arrivedFrom;
    return 22;
  }
  if (pos === 15 && arrivedFrom === 24) return 24;
  if (YUT_INNER_PREV[pos] != null) return YUT_INNER_PREV[pos];
  if (pos > 0 && pos <= 19) return pos - 1;
  return null;
}

function yutDests(start, steps, arrivedFrom) {
  if ((steps | 0) < 0) {
    const prev = yutPrevPos(start, arrivedFrom);
    if (prev == null) return [];
    return [{ dest: prev, via: prev }];
  }
  const n = Math.max(1, steps | 0);
  const seen = {};
  const out = [];
  const origin = start < 0 ? 0 : start;
  const originFrom = start < 0 ? -1 : arrivedFrom;
  function rec(pos, left, first, from) {
    if (left === 0) {
      const key = String(pos);
      if (!seen[key]) {
        seen[key] = 1;
        out.push({ dest: pos, via: first });
      }
      return;
    }
    if (pos === "home" || pos === 99) {
      rec("home", 0, first, from);
      return;
    }
    const choices = yutNextOptions(pos, left === n, from);
    for (let i = 0; i < choices.length; i++) rec(choices[i], left - 1, first == null ? choices[i] : first, pos);
  }
  rec(origin, n, null, originFrom);
  return out;
}

function yutRefreshStacks(s) {
  const groups = {};
  s.mals.forEach((m) => {
    if (m.home || m.pos < 0) {
      m.stacked = 1;
      return;
    }
    const k = m.team + ":" + m.pos;
    groups[k] = (groups[k] || 0) + 1;
  });
  s.mals.forEach((m) => {
    if (m.home || m.pos < 0) return;
    m.stacked = groups[m.team + ":" + m.pos] || 1;
  });
}

function yutLegalForTeam(s, team, n) {
  const out = [];
  const seen = {};
  s.mals.forEach((m, i) => {
    if (m.team !== team || m.home) return;
    if (n < 0 && m.pos < 0) return;
    const key = m.pos < 0 ? "w" + i : "p" + m.pos;
    if (seen[key]) return;
    seen[key] = 1;
    const dests = yutDests(m.pos, n, m.arrivedFrom).map((d) => d.dest);
    if (!dests.length) return;
    out.push({
      mal: i,
      dests,
    });
  });
  return out;
}

function yutSetPoolLegal(s, team) {
  const throws = s.throws || [];
  s.legalAll = throws.map((t) => yutLegalForTeam(s, team, t.n));
  s.turnThrows = throws.map((t) => t.name);
  const idx = Math.max(0, Math.min(throws.length - 1, s.throwI | 0));
  s.throwI = throws.length ? idx : 0;
  s.moveN = throws.length ? throws[idx].n : 0;
  s.legal = s.legalAll[idx] || [];
}

function yutEndTurn(room, s, keep) {
  s.pending = "throw";
  s.legal = [];
  s.legalAll = [];
  nextTurn(room, s, keep);
  if (!keep) {
    s.throws = [];
    s.turnThrows = [];
    s.bonus = 0;
    s.throwI = 0;
    s.moveN = 0;
  }
  s.turnTeam = teamOf(s.turnSlot, s.mode);
}

function yutPushFx(s, kind, extra) {
  s.fxSeq = (s.fxSeq || 0) + 1;
  s.fx = Object.assign({ kind: kind, id: s.fxSeq }, extra || {});
}

function initYut(room) {
  const mode = parseMode(room.mode);
  const teams = yutTeamCount(mode);
  const mals = [];
  for (let t = 0; t < teams; t++) {
    for (let i = 0; i < 4; i++) mals.push({ team: t, i, pos: -1, home: false, stacked: 1, arrivedFrom: -1 });
  }
  return {
    game: "yut",
    mode,
    nodes: yutNodes(),
    mals,
    teams,
    teamNames: YUT_TEAM_NAMES.slice(0, teams),
    turnSlot: 0,
    turnId: room.players[0] ? room.players[0].id : null,
    turnTeam: teamOf(0, mode),
    pending: "throw",
    lastYut: null,
    bonus: 0,
    moveN: 0,
    throwI: 0,
    throws: [],
    legal: [],
    legalAll: [],
    history: [],
    turnThrows: [],
    log: "윷을 던지세요",
    fx: null,
    fxSeq: 0,
    playerMeta: metaPlayers(room),
    aiAt: Date.now() + 450,
  };
}

function yutTeamOfPlayer(player, mode) {
  return teamOf(player.slot, mode);
}

function applyYut(room, player, payload, endGame) {
  const s = room.state;
  if (!s || s.turnId !== player.id) return;
  const team = yutTeamOfPlayer(player, s.mode);
  const act = String(payload.act || "");
  if (!Array.isArray(s.throws)) s.throws = [];
  if (s.pending === "move" && act === "pickThrow" && payload.throwI != null) {
    const i = payload.throwI | 0;
    if (i >= 0 && i < s.throws.length) {
      s.throwI = i;
      yutSetPoolLegal(s, team);
    }
    return;
  }
  if (s.pending === "throw" && (act === "throw" || act === "roll" || act === "")) {
    let backs = 0;
    const sticks = [];
    for (let i = 0; i < 4; i++) {
      const back = Math.random() < 0.5;
      sticks.push(back ? 1 : 0);
      if (back) backs++;
    }
    const isBackDo = backs === 1 && sticks[0] === 1;
    const n = isBackDo ? -1 : backs === 0 ? 5 : backs;
    const name = isBackDo ? "빽도" : YUT_NAMES[n];
    const rec = { n, name, sticks };
    s.lastYut = rec;
    s.throwId = (s.throwId || 0) + 1;
    s.throws.push(rec);
    s.history = (s.history || []).concat([name]).slice(-16);
    s.turnThrows = s.throws.map((t) => t.name);
    if (n >= 4) {
      s.pending = "throw";
      s.log = name + " · 한 번 더 던지세요";
      s.legal = [];
      s.legalAll = [];
      s.aiAt = Date.now() + 900;
      s.turnTeam = teamOf(s.turnSlot, s.mode);
      return;
    }
    yutSetPoolLegal(s, team);
    const usable = (s.legalAll || []).some((ls) => ls && ls.length);
    if (!usable) {
      s.log = name + " — 움직일 말이 없습니다";
      yutEndTurn(room, s, false);
      s.aiAt = Date.now() + 500;
      return;
    }
    s.pending = "move";
    s.log = s.throws.map((t) => t.name).join(" → ") + " · 결과를 골라 말을 옮기세요";
    s.aiAt = Date.now() + 1100;
    s.turnTeam = teamOf(s.turnSlot, s.mode);
    return;
  }
  if (s.pending === "move" && (act === "move" || payload.mal != null)) {
    const idx = payload.mal != null ? payload.mal | 0 : payload.i | 0;
    const mal = s.mals[idx];
    if (!mal || mal.team !== team || mal.home) return;
    let throwI = payload.throwI != null ? payload.throwI | 0 : s.throwI | 0;
    if (throwI < 0 || throwI >= s.throws.length) throwI = 0;
    const rec = s.throws[throwI];
    if (!rec) return;
    const dests = yutDests(mal.pos, rec.n, mal.arrivedFrom);
    let want = payload.dest;
    if (want === 99 || want === "99") want = "home";
    if (want === -1 || want === "-1") want = -1;
    if (want == null || want === "") want = dests[0] ? dests[0].dest : null;
    if (want !== "home" && want !== -1) want = want | 0;
    const hit = dests.find((d) => d.dest === want || (want === "home" && d.dest === "home"));
    if (!hit) return;
    const dest = hit.dest;
    const group = s.mals.filter((m) => m.team === team && !m.home && m.pos === mal.pos && mal.pos >= 0);
    const moving = mal.pos < 0 ? [mal] : group.length ? group : [mal];
    const fromPos = mal.pos;
    if (dest === "home") {
      moving.forEach((m) => {
        m.home = true;
        m.pos = 99;
        m.stacked = 1;
        m.arrivedFrom = fromPos;
      });
      yutPushFx(s, "goal");
      s.log = "골인!";
      const left = s.mals.filter((m) => m.team === team && !m.home);
      if (!left.length) {
        yutPushFx(s, "win", { team: team });
        yutRefreshStacks(s);
        s.legal = [];
        s.legalAll = [];
        s.throws = [];
        s.pending = "throw";
        endGame(room, "yut", player.id);
        return;
      }
    } else {
      const onBoard = typeof dest === "number" && dest >= 0;
      const alliesThere =
        onBoard &&
        s.mals.some((m) => m.team === team && !m.home && m.pos === dest && moving.indexOf(m) < 0);
      const captured = onBoard
        ? s.mals.filter((m) => m.team !== team && !m.home && m.pos === dest)
        : [];
      moving.forEach((m) => {
        m.arrivedFrom = fromPos;
        m.pos = dest;
        if (dest < 0) {
          m.home = false;
          m.stacked = 1;
        }
      });
      if (captured.length) {
        captured.forEach((m) => {
          m.pos = -1;
          m.home = false;
          m.stacked = 1;
          m.arrivedFrom = -1;
        });
        s.bonus = (s.bonus || 0) + 1;
        s.log = "잡기! 남은 결과를 쓴 뒤 한 번 더";
        yutPushFx(s, "capture", { n: captured.length });
      } else if (alliesThere) {
        const stacked = s.mals.filter((m) => m.team === team && !m.home && m.pos === dest).length;
        s.log = "업기! ×" + stacked;
        yutPushFx(s, "stack");
      } else s.log = rec.name || "이동";
    }
    s.throws.splice(throwI, 1);
    yutRefreshStacks(s);
    yutSetPoolLegal(s, team);
    const usable = (s.legalAll || []).some((ls) => ls && ls.length);
    if (s.throws.length && usable) {
      s.pending = "move";
      s.log = (s.log || "") + " · 남은 결과 " + s.throws.map((t) => t.name).join(" → ");
    } else {
      s.throws = [];
      s.turnThrows = [];
      s.legalAll = [];
      const keep = (s.bonus || 0) > 0;
      if (keep) {
        s.bonus--;
        s.pending = "throw";
        s.legal = [];
        s.log = "잡기 보너스 · 한 번 더 던지세요";
      } else {
        yutEndTurn(room, s, false);
      }
    }
    s.turnTeam = teamOf(s.turnSlot, s.mode);
    s.aiAt = Date.now() + (s.fx && (s.fx.kind === "capture" || s.fx.kind === "stack") ? 1200 : 520);
  }
}

function yutAi(room, endGame) {
  const s = room.state;
  const actor = currentActor(room, s);
  if (!actor || !actor.isAi) return;
  if (Date.now() < (s.aiAt || 0)) return;
  if (s.pending === "throw") {
    applyYut(room, actor, { act: "throw" }, endGame);
    return;
  }
  if (s.pending === "move") {
    const team = yutTeamOfPlayer(actor, s.mode);
    const throws = s.throws || [];
    const legalAll = s.legalAll && s.legalAll.length === throws.length
      ? s.legalAll
      : throws.map((t) => yutLegalForTeam(s, team, t.n));
    let best = null;
    let bestScore = -1e9;
    throws.forEach((rec, throwI) => {
      (legalAll[throwI] || []).forEach((opt) => {
        const mal = s.mals[opt.mal];
        (opt.dests || []).forEach((dest) => {
          let score = Math.random() * 2;
          if (dest === "home" || dest === 99) score += 90;
          else {
            if (s.mals.some((m) => m.team !== team && !m.home && m.pos === dest)) score += 70;
            if (s.mals.some((m) => m.team === team && !m.home && m.pos === dest && m !== mal)) score += 28;
            if (dest === 20 || dest === 27 || dest === 28) score += 14;
            if (typeof dest === "number" && dest >= 21) score += 6;
          }
          if (mal && mal.pos >= 0) score += 4;
          if (score > bestScore) {
            bestScore = score;
            best = { mal: opt.mal, dest: dest, throwI: throwI };
          }
        });
      });
    });
    if (best) applyYut(room, actor, { act: "move", mal: best.mal, dest: best.dest, throwI: best.throwI }, endGame);
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
