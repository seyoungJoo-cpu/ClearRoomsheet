"use strict";

/* Shared modes for Lane Push + Nexus War */
const SHARED_MODES = {
  "1v1": { need: 2, max: 2, team: false, label: "1:1" },
  ffa3: { need: 3, max: 3, team: false, label: "1:1:1" },
  "2v2": { need: 4, max: 4, team: true, label: "2:2" },
};

function parseSharedMode(raw) {
  const m = String(raw || "1v1");
  if (SHARED_MODES[m]) return m;
  if (m === "ffa" || m === "1v1v1") return "ffa3";
  if (m === "team") return "2v2";
  return "1v1";
}
function modeNeed(mode) {
  return (SHARED_MODES[mode] || SHARED_MODES["1v1"]).need;
}
function modeMax(mode) {
  return (SHARED_MODES[mode] || SHARED_MODES["1v1"]).max;
}
function modeIsTeam(mode) {
  return !!(SHARED_MODES[mode] && SHARED_MODES[mode].team);
}
function teamOf(slot, mode) {
  if (modeIsTeam(mode)) return slot < 2 ? 0 : 1;
  return slot;
}
function allied(a, b, mode) {
  if (a === b) return true;
  if (!modeIsTeam(mode)) return false;
  return teamOf(a, mode) === teamOf(b, mode);
}

/* ===================== LANE PUSH (LoL mini) ===================== */
const LP_CHAMPS = {
  blade: {
    id: "blade",
    name: "블레이드",
    role: "전사",
    hp: 640,
    ad: 64,
    range: 70,
    speed: 215,
    atkCd: 0.72,
    skills: {
      q: { name: "직선참", cd: 5.5, dmg: 90, kind: "shot", speed: 620, life: 520, r: 14 },
      w: { name: "회전베기", cd: 8, dmg: 80, kind: "aoe", radius: 110 },
      e: { name: "돌진", cd: 7, dmg: 40, kind: "dash", dist: 160 },
      r: { name: "처형참", cd: 55, dmg: 180, kind: "shot", speed: 700, range: 640, r: 18 },
    },
  },
  arc: {
    id: "arc",
    name: "아크",
    role: "원거리",
    hp: 500,
    ad: 58,
    range: 260,
    speed: 205,
    atkCd: 0.62,
    skills: {
      q: { name: "화살", cd: 4.5, dmg: 95, kind: "shot", speed: 780, range: 700, r: 10 },
      w: { name: "화살비", cd: 9, dmg: 70, kind: "aoe", radius: 120 },
      e: { name: "후퇴", cd: 8, dmg: 0, kind: "dash", dist: -140 },
      r: { name: "저격", cd: 50, dmg: 220, kind: "shot", speed: 1100, range: 900, r: 12 },
    },
  },
  bolt: {
    id: "bolt",
    name: "볼트",
    role: "마법사",
    hp: 470,
    ad: 52,
    range: 280,
    speed: 198,
    atkCd: 0.7,
    skills: {
      q: { name: "화염구", cd: 5, dmg: 110, kind: "shot", speed: 560, range: 620, r: 16 },
      w: { name: "폭발", cd: 7.5, dmg: 95, kind: "aoe", radius: 130 },
      e: { name: "점멸", cd: 10, dmg: 0, kind: "dash", dist: 180 },
      r: { name: "운석", cd: 60, dmg: 260, kind: "aoe", radius: 150 },
    },
  },
  guard: {
    id: "guard",
    name: "가드",
    role: "탱커",
    hp: 900,
    ad: 48,
    range: 75,
    speed: 185,
    atkCd: 0.88,
    skills: {
      q: { name: "밀치기", cd: 6, dmg: 70, kind: "shot", speed: 480, range: 380, r: 18 },
      w: { name: "지진", cd: 8, dmg: 85, kind: "aoe", radius: 140 },
      e: { name: "돌진방어", cd: 9, dmg: 35, kind: "dash", dist: 150 },
      r: { name: "도발장", cd: 55, dmg: 120, kind: "aoe", radius: 170 },
    },
  },
  shade: {
    id: "shade",
    name: "셰이드",
    role: "암살",
    hp: 480,
    ad: 72,
    range: 85,
    speed: 230,
    atkCd: 0.52,
    skills: {
      q: { name: "단검", cd: 4, dmg: 85, kind: "shot", speed: 720, range: 480, r: 11 },
      w: { name: "연막", cd: 10, dmg: 55, kind: "aoe", radius: 100 },
      e: { name: "그림자돌진", cd: 6.5, dmg: 50, kind: "dash", dist: 200 },
      r: { name: "처형표식", cd: 48, dmg: 200, kind: "shot", speed: 850, range: 560, r: 14 },
    },
  },
};

const LP_CHAMP_IDS = Object.keys(LP_CHAMPS);

function lpTeamOf(slot, mode) {
  return teamOf(slot, mode);
}
function lpAllied(a, b, mode) {
  return allied(a, b, mode);
}

function initLanePush(room) {
  const mode = parseSharedMode(room.mode);
  const teamMode = modeIsTeam(mode) || mode === "1v1";
  const n = room.players.length;
  let W = 1400;
  let H = 480;
  const bases = [];
  const towers = [];
  let nextId = 1;

  if (mode === "ffa3") {
    W = 1100;
    H = 900;
    const spots = [
      { x: 140, y: 450 },
      { x: 960, y: 450 },
      { x: 550, y: 140 },
    ];
    for (let i = 0; i < n; i++) {
      const sp = spots[i] || { x: 550, y: 750 };
      const owner = i;
      bases.push({
        id: nextId++,
        kind: "nexus",
        owner,
        team: owner,
        x: sp.x,
        y: sp.y,
        hp: 1800,
        maxHp: 1800,
        r: 42,
        range: 220,
        dps: 45,
        atkCd: 0,
      });
      const dx = W / 2 - sp.x;
      const dy = H / 2 - sp.y;
      const len = Math.hypot(dx, dy) || 1;
      towers.push({
        id: nextId++,
        kind: "tower",
        owner,
        team: owner,
        x: sp.x + (dx / len) * 150,
        y: sp.y + (dy / len) * 150,
        hp: 900,
        maxHp: 900,
        r: 28,
        range: 200,
        dps: 55,
        atkCd: 0,
      });
    }
  } else {
    const leftSlots = modeIsTeam(mode) ? [0, 1] : [0];
    const rightSlots = modeIsTeam(mode) ? [2, 3] : [1];
    const leftTeam = 0;
    const rightTeam = 1;
    const makeSide = (team, xNexus, xOuter, xInner, slots) => {
      bases.push({
        id: nextId++,
        kind: "nexus",
        owner: slots[0],
        team,
        x: xNexus,
        y: H / 2,
        hp: 2200,
        maxHp: 2200,
        r: 46,
        range: 240,
        dps: 50,
        atkCd: 0,
        shared: true,
      });
      towers.push({
        id: nextId++,
        kind: "tower",
        owner: slots[0],
        team,
        x: xOuter,
        y: H / 2,
        hp: 1100,
        maxHp: 1100,
        r: 30,
        range: 210,
        dps: 60,
        atkCd: 0,
        shared: true,
      });
      towers.push({
        id: nextId++,
        kind: "tower",
        owner: slots[0],
        team,
        x: xInner,
        y: H / 2,
        hp: 1300,
        maxHp: 1300,
        r: 32,
        range: 220,
        dps: 70,
        atkCd: 0,
        shared: true,
      });
    };
    makeSide(leftTeam, 70, 260, 420, leftSlots);
    makeSide(rightTeam, W - 70, W - 260, W - 420, rightSlots);
  }

  const champs = room.players.map((p, i) => {
    const team = lpTeamOf(i, mode);
    const base = bases.find((b) => (b.shared ? b.team === team : b.owner === i)) || bases[0];
    const dir = mode === "ffa3" ? Math.atan2(H / 2 - base.y, W / 2 - base.x) : team === 0 ? 0 : Math.PI;
    return {
      id: nextId++,
      kind: "champ",
      playerId: p.id,
      owner: i,
      team,
      champId: null,
      name: p.name || "P" + (i + 1),
      x: base.x + Math.cos(dir) * 70,
      y: base.y + Math.sin(dir) * 40,
      hp: 600,
      maxHp: 600,
      ad: 55,
      range: 80,
      speed: 200,
      atkCd: 0,
      atkRate: 0.7,
      tx: null,
      ty: null,
      gold: 250,
      xp: 0,
      level: 1,
      skillPts: 1,
      ranks: { q: 0, w: 0, e: 0, r: 0 },
      cds: { q: 0, w: 0, e: 0, r: 0 },
      alive: true,
      respawn: 0,
      buyAd: 0,
      buyHp: 0,
    };
  });

  return {
    mode,
    W,
    H,
    nextId,
    phase: "pick",
    pickLeft: 12,
    waveT: 3,
    bases,
    towers,
    minions: [],
    champs,
    shots: [],
    fx: [],
    playerMeta: room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      slot: i,
      team: lpTeamOf(i, mode),
    })),
  };
}

function lpFindStruct(s, id) {
  return (
    s.bases.find((b) => b.id === id) ||
    s.towers.find((t) => t.id === id) ||
    s.minions.find((m) => m.id === id) ||
    s.champs.find((c) => c.id === id) ||
    null
  );
}

function lpApplyChamp(ch, champId) {
  const def = LP_CHAMPS[champId] || LP_CHAMPS.blade;
  ch.champId = def.id;
  ch.maxHp = def.hp + ch.buyHp * 45;
  ch.hp = ch.maxHp;
  ch.ad = def.ad + ch.buyAd * 8;
  ch.range = def.range;
  ch.speed = def.speed;
  ch.atkRate = def.atkCd;
}

function lpXpNeed(level) {
  return 80 + (level - 1) * 55;
}

function lpGainXp(ch, amount) {
  ch.xp += amount;
  while (ch.level < 18 && ch.xp >= lpXpNeed(ch.level)) {
    ch.xp -= lpXpNeed(ch.level);
    ch.level++;
    ch.skillPts++;
    ch.maxHp += 35;
    ch.hp = Math.min(ch.maxHp, ch.hp + 35);
    ch.ad += 3;
  }
}

function lpFrontTowerAlive(s, team) {
  const towers = s.towers.filter((t) => t.team === team && t.hp > 0);
  if (!towers.length) return true;
  // Must kill outer (closer to mid) before deeper? For LTR: left team towers x ascending toward mid
  if (team === 0) {
    towers.sort((a, b) => b.x - a.x);
  } else if (team === 1 && s.mode !== "ffa3") {
    towers.sort((a, b) => a.x - b.x);
  } else {
    return true;
  }
  return towers[0]; // frontmost must be targeted first — return front tower
}

function lpCanTargetStruct(s, attackerTeam, target) {
  if (!target || target.hp <= 0) return false;
  if (target.kind === "nexus") {
    const same = s.towers.some((t) => t.team === target.team && t.hp > 0);
    if (same) return false;
  }
  if (target.kind === "tower" && s.mode !== "ffa3") {
    const front = lpFrontTowerAlive(s, target.team);
    if (front && front.id !== target.id) {
      // only allow if this is the front tower
      const others = s.towers.filter((t) => t.team === target.team && t.hp > 0);
      if (target.team === 0) {
        const maxX = Math.max(...others.map((t) => t.x));
        if (target.x < maxX - 1) return false;
      } else {
        const minX = Math.min(...others.map((t) => t.x));
        if (target.x > minX + 1) return false;
      }
    }
  }
  return true;
}

function lpSpawnWave(s) {
  const mode = s.mode;
  if (mode === "ffa3") {
    for (const base of s.bases) {
      if (base.hp <= 0) continue;
      const ang = Math.atan2(s.H / 2 - base.y, s.W / 2 - base.x);
      for (let k = 0; k < 3; k++) {
        const isCaster = k === 2;
        s.minions.push({
          id: s.nextId++,
          kind: "minion",
          owner: base.owner,
          team: base.team,
          x: base.x + Math.cos(ang) * (50 + k * 18),
          y: base.y + Math.sin(ang) * (50 + k * 18),
          hp: isCaster ? 55 : 90,
          maxHp: isCaster ? 55 : 90,
          ad: isCaster ? 18 : 14,
          range: isCaster ? 140 : 40,
          speed: isCaster ? 95 : 105,
          r: isCaster ? 10 : 12,
          atkCd: 0,
          gold: isCaster ? 18 : 22,
          xp: isCaster ? 24 : 28,
        });
      }
    }
    return;
  }
  for (const team of [0, 1]) {
    const base = s.bases.find((b) => b.team === team && b.hp > 0);
    if (!base) continue;
    const dir = team === 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const isCaster = k === 2;
      s.minions.push({
        id: s.nextId++,
        kind: "minion",
        owner: base.owner,
        team,
        x: base.x + dir * (55 + k * 20),
        y: base.y + (k - 1) * 16,
        hp: isCaster ? 55 : 95,
        maxHp: isCaster ? 55 : 95,
        ad: isCaster ? 20 : 15,
        range: isCaster ? 150 : 42,
        speed: isCaster ? 100 : 110,
        r: isCaster ? 10 : 12,
        atkCd: 0,
        gold: isCaster ? 18 : 22,
        xp: isCaster ? 24 : 28,
      });
    }
  }
}

function lpNearestEnemy(s, x, y, team, mode, opts) {
  opts = opts || {};
  let best = null;
  let bd = 1e12;
  const consider = (e) => {
    if (!e || e.hp <= 0) return;
    if (e.alive === false) return;
    if (lpAllied(team, e.team != null ? e.team : e.owner, mode)) return;
    if (opts.structsOnly && e.kind !== "tower" && e.kind !== "nexus") return;
    if (opts.noStruct && (e.kind === "tower" || e.kind === "nexus")) return;
    if ((e.kind === "tower" || e.kind === "nexus") && !lpCanTargetStruct(s, team, e)) return;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  };
  s.minions.forEach(consider);
  s.champs.forEach(consider);
  if (!opts.noStruct) {
    s.towers.forEach(consider);
    s.bases.forEach(consider);
  }
  return best;
}

function lpDealDamage(s, target, dmg, killerChamp) {
  if (!target || target.hp <= 0 || dmg <= 0) return;
  target.hp -= dmg;
  if (target.hp > 0) return;
  target.hp = 0;
  if (target.kind === "minion" && killerChamp) {
    killerChamp.gold += target.gold || 20;
    lpGainXp(killerChamp, target.xp || 25);
  }
  if (target.kind === "champ" && killerChamp) {
    killerChamp.gold += 180;
    lpGainXp(killerChamp, 120);
    target.alive = false;
    target.respawn = 8 + target.level * 0.6;
  }
  if (target.kind === "tower" && killerChamp) {
    killerChamp.gold += 100;
    lpGainXp(killerChamp, 80);
  }
  if (target.kind === "nexus") {
    // win checked after tick
  }
}

function lpFireShot(s, ch, key, aimX, aimY) {
  const def = LP_CHAMPS[ch.champId || "blade"];
  const sk = def.skills[key];
  if (!sk || sk.kind !== "shot") return;
  const rank = ch.ranks[key] || 1;
  const ang = Math.atan2(aimY - ch.y, aimX - ch.x);
  const dmg = sk.dmg + rank * 25 + ch.ad * 0.35;
  s.shots.push({
    id: s.nextId++,
    owner: ch.owner,
    team: ch.team,
    champId: ch.id,
    x: ch.x,
    y: ch.y,
    vx: Math.cos(ang) * sk.speed,
    vy: Math.sin(ang) * sk.speed,
    r: sk.r || 12,
    dmg,
    life: (sk.range || 500) / sk.speed,
    key,
  });
}

function lpCastAoe(s, ch, key) {
  const def = LP_CHAMPS[ch.champId || "blade"];
  const sk = def.skills[key];
  if (!sk || sk.kind !== "aoe") return;
  const rank = ch.ranks[key] || 1;
  const dmg = sk.dmg + rank * 28 + ch.ad * 0.25;
  const rad = sk.radius || 110;
  s.fx.push({ kind: "aoe", x: ch.x, y: ch.y, r: rad, team: ch.team, life: 0.35 });
  const hit = (e) => {
    if (!e || e.hp <= 0) return;
    if (e.alive === false) return;
    if (lpAllied(ch.team, e.team != null ? e.team : e.owner, s.mode)) return;
    if (Math.hypot(e.x - ch.x, e.y - ch.y) <= rad + (e.r || 12)) {
      if ((e.kind === "tower" || e.kind === "nexus") && !lpCanTargetStruct(s, ch.team, e)) return;
      lpDealDamage(s, e, dmg, ch);
    }
  };
  s.minions.forEach(hit);
  s.champs.forEach(hit);
  s.towers.forEach(hit);
  s.bases.forEach(hit);
}

function lpDash(s, ch, key, aimX, aimY) {
  const def = LP_CHAMPS[ch.champId || "blade"];
  const sk = def.skills[key];
  if (!sk || sk.kind !== "dash") return;
  let dist = sk.dist || 150;
  let ang = Math.atan2(aimY - ch.y, aimX - ch.x);
  if (dist < 0) {
    dist = -dist;
    ang += Math.PI;
  }
  ch.x = Math.max(30, Math.min(s.W - 30, ch.x + Math.cos(ang) * dist));
  ch.y = Math.max(30, Math.min(s.H - 30, ch.y + Math.sin(ang) * dist));
  ch.tx = null;
  ch.ty = null;
  const rank = ch.ranks[key] || 1;
  const dmg = (sk.dmg || 0) + rank * 15;
  if (dmg > 0) {
    s.minions.concat(s.champs).forEach((e) => {
      if (!e || e.hp <= 0 || e.alive === false) return;
      if (lpAllied(ch.team, e.team != null ? e.team : e.owner, s.mode)) return;
      if (Math.hypot(e.x - ch.x, e.y - ch.y) < 70) lpDealDamage(s, e, dmg, ch);
    });
  }
}

function lpApplyInput(s, ch, inp) {
  if (!ch || !inp) return;
  if (s.phase === "pick") {
    if (inp.pick && LP_CHAMPS[inp.pick]) {
      lpApplyChamp(ch, inp.pick);
    }
    return;
  }
  if (!ch.champId) lpApplyChamp(ch, "blade");
  if (!ch.alive) return;

  if (inp.level && ch.skillPts > 0) {
    const k = String(inp.level).toLowerCase();
    if (k === "q" || k === "w" || k === "e" || k === "r") {
      const max = k === "r" ? 3 : 5;
      if (k === "r" && ch.level < 6) {
        /* need 6 */
      } else if ((ch.ranks[k] || 0) < max) {
        if (k === "r" && ch.ranks.r >= Math.floor(ch.level / 6)) {
          /* one r per 6 levels */
        } else {
          ch.ranks[k] = (ch.ranks[k] || 0) + 1;
          ch.skillPts--;
        }
      }
    }
  }

  if (inp.buy === "ad" && ch.gold >= 120) {
    ch.gold -= 120;
    ch.buyAd++;
    ch.ad += 8;
  } else if (inp.buy === "hp" && ch.gold >= 100) {
    ch.gold -= 100;
    ch.buyHp++;
    ch.maxHp += 45;
    ch.hp += 45;
  }

  if (inp.moveX != null && isFinite(inp.moveX) && inp.moveY != null && isFinite(inp.moveY)) {
    ch.tx = Math.max(20, Math.min(s.W - 20, Number(inp.moveX)));
    ch.ty = Math.max(20, Math.min(s.H - 20, Number(inp.moveY)));
  }

  if (inp.skill && ch.ranks[inp.skill] > 0 && ch.cds[inp.skill] <= 0) {
    const def = LP_CHAMPS[ch.champId];
    const sk = def.skills[inp.skill];
    const aimX = Number(inp.aimX);
    const aimY = Number(inp.aimY);
    const ax = isFinite(aimX) ? aimX : ch.x + 1;
    const ay = isFinite(aimY) ? aimY : ch.y;
    if (sk.kind === "shot") lpFireShot(s, ch, inp.skill, ax, ay);
    else if (sk.kind === "aoe") lpCastAoe(s, ch, inp.skill);
    else if (sk.kind === "dash") lpDash(s, ch, inp.skill, ax, ay);
    ch.cds[inp.skill] = sk.cd * (1 - (ch.ranks[inp.skill] - 1) * 0.04);
  }
}

function tickLanePush(room, dt, endGame) {
  const s = room.state;
  if (!s) return;
  s.fx = (s.fx || []).filter((f) => {
    f.life -= dt;
    return f.life > 0;
  });

  if (s.phase === "pick") {
    s.pickLeft -= dt;
    for (const p of room.players) {
      const ch = s.champs.find((c) => c.owner === p.slot);
      if (ch && p.input) lpApplyInput(s, ch, p.input);
      if (p.input) {
        p.input.pick = null;
        p.input.skill = null;
        p.input.buy = null;
        p.input.level = null;
        p.input.moveX = null;
        p.input.moveY = null;
      }
    }
    if (s.pickLeft <= 0) {
      s.phase = "fight";
      for (const ch of s.champs) {
        if (!ch.champId) lpApplyChamp(ch, LP_CHAMP_IDS[ch.owner % LP_CHAMP_IDS.length]);
        if (ch.ranks.q === 0 && ch.skillPts > 0) {
          ch.ranks.q = 1;
          ch.skillPts--;
        }
      }
    }
    return;
  }

  for (const p of room.players) {
    const ch = s.champs.find((c) => c.owner === p.slot);
    if (ch && p.input) lpApplyInput(s, ch, p.input);
    if (p.input) {
      p.input.skill = null;
      p.input.buy = null;
      p.input.level = null;
      p.input.moveX = null;
      p.input.moveY = null;
      p.input.pick = null;
    }
  }

  s.waveT -= dt;
  if (s.waveT <= 0) {
    s.waveT = 14;
    lpSpawnWave(s);
  }

  // champs
  for (const ch of s.champs) {
    for (const k of ["q", "w", "e", "r"]) {
      if (ch.cds[k] > 0) ch.cds[k] -= dt;
    }
    if (!ch.alive) {
      ch.respawn -= dt;
      if (ch.respawn <= 0) {
        ch.alive = true;
        ch.hp = ch.maxHp;
        const base = s.bases.find((b) => (b.shared ? b.team === ch.team : b.owner === ch.owner) && b.hp > 0);
        if (base) {
          ch.x = base.x + (ch.team === 0 ? 60 : ch.team === 1 && s.mode !== "ffa3" ? -60 : 40);
          ch.y = base.y;
        }
      }
      continue;
    }
    if (ch.atkCd > 0) ch.atkCd -= dt;
    // move
    if (ch.tx != null && ch.ty != null) {
      const dx = ch.tx - ch.x;
      const dy = ch.ty - ch.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        ch.tx = null;
        ch.ty = null;
      } else {
        const step = ch.speed * dt;
        ch.x += (dx / d) * Math.min(step, d);
        ch.y += (dy / d) * Math.min(step, d);
      }
    }
    ch.x = Math.max(20, Math.min(s.W - 20, ch.x));
    ch.y = Math.max(20, Math.min(s.H - 20, ch.y));
    // auto attack
    const foe = lpNearestEnemy(s, ch.x, ch.y, ch.team, s.mode, {});
    if (foe && Math.hypot(foe.x - ch.x, foe.y - ch.y) <= ch.range + (foe.r || 12)) {
      if (ch.tx == null && ch.atkCd <= 0) {
        ch.atkCd = ch.atkRate;
        lpDealDamage(s, foe, ch.ad, ch);
        s.fx.push({ kind: "hit", x: foe.x, y: foe.y, life: 0.15 });
      } else if (ch.tx != null && Math.hypot(foe.x - ch.x, foe.y - ch.y) <= ch.range * 0.9 && ch.atkCd <= 0) {
        // attack while moving near
        ch.atkCd = ch.atkRate;
        lpDealDamage(s, foe, ch.ad * 0.85, ch);
      }
    }
  }

  // minions march + fight
  for (const m of s.minions) {
    if (m.hp <= 0) continue;
    if (m.atkCd > 0) m.atkCd -= dt;
    const foe = lpNearestEnemy(s, m.x, m.y, m.team, s.mode, {});
    if (foe && Math.hypot(foe.x - m.x, foe.y - m.y) <= m.range + (foe.r || 12)) {
      if (m.atkCd <= 0) {
        m.atkCd = 1.0;
        // last-hit credit: if kills and champ nearby
        const before = foe.hp;
        foe.hp -= m.ad;
        if (foe.hp <= 0) {
          foe.hp = 0;
          if (foe.kind === "minion") {
            let best = null;
            let bd = 160;
            for (const ch of s.champs) {
              if (!ch.alive || ch.team !== m.team) continue;
              const d = Math.hypot(ch.x - foe.x, ch.y - foe.y);
              if (d < bd) {
                bd = d;
                best = ch;
              }
            }
            if (best) {
              best.gold += foe.gold || 20;
              lpGainXp(best, foe.xp || 25);
            }
          }
          if (foe.kind === "champ") {
            foe.alive = false;
            foe.respawn = 8 + foe.level * 0.6;
          }
        } else if (before > 0) {
          /* chip */
        }
      }
    } else {
      // march toward enemy nexus / mid
      let tx = s.W / 2;
      let ty = s.H / 2;
      if (s.mode !== "ffa3") {
        const enemyBase = s.bases.find((b) => b.team !== m.team && b.hp > 0);
        if (enemyBase) {
          tx = enemyBase.x;
          ty = enemyBase.y;
        }
      } else {
        const enemyBase = s.bases
          .filter((b) => b.team !== m.team && b.hp > 0)
          .sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
        if (enemyBase) {
          tx = enemyBase.x;
          ty = enemyBase.y;
        }
      }
      const dx = tx - m.x;
      const dy = ty - m.y;
      const d = Math.hypot(dx, dy) || 1;
      m.x += (dx / d) * m.speed * dt;
      m.y += (dy / d) * m.speed * dt;
    }
  }
  s.minions = s.minions.filter((m) => m.hp > 0);

  // shots
  for (const sh of s.shots) {
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.life -= dt;
    const killer = s.champs.find((c) => c.id === sh.champId);
    const hit = (e) => {
      if (!e || e.hp <= 0 || e.alive === false) return false;
      if (lpAllied(sh.team, e.team != null ? e.team : e.owner, s.mode)) return false;
      if ((e.kind === "tower" || e.kind === "nexus") && !lpCanTargetStruct(s, sh.team, e)) return false;
      if (Math.hypot(e.x - sh.x, e.y - sh.y) <= sh.r + (e.r || 12)) {
        lpDealDamage(s, e, sh.dmg, killer || null);
        sh.life = -1;
        return true;
      }
      return false;
    };
    for (const m of s.minions) if (hit(m)) break;
    if (sh.life < 0) continue;
    for (const c of s.champs) if (hit(c)) break;
    if (sh.life < 0) continue;
    for (const t of s.towers) if (hit(t)) break;
    if (sh.life < 0) continue;
    for (const b of s.bases) if (hit(b)) break;
  }
  s.shots = s.shots.filter((sh) => sh.life > 0);

  // towers / nexus attack
  const structs = s.towers.concat(s.bases);
  for (const st of structs) {
    if (st.hp <= 0) continue;
    if (st.atkCd > 0) st.atkCd -= dt;
    const foe = lpNearestEnemy(s, st.x, st.y, st.team, s.mode, { noStruct: true });
    if (foe && Math.hypot(foe.x - st.x, foe.y - st.y) <= st.range) {
      if (st.atkCd <= 0) {
        st.atkCd = 0.9;
        lpDealDamage(s, foe, st.dps, null);
        s.fx.push({ kind: "beam", x1: st.x, y1: st.y, x2: foe.x, y2: foe.y, life: 0.12 });
      }
    }
  }

  // win check
  if (s.mode === "ffa3") {
    const alive = s.bases.filter((b) => b.hp > 0);
    if (alive.length === 1) {
      const w = room.players.find((p) => p.slot === alive[0].owner);
      endGame(room, "nexus", w ? w.id : null);
    } else if (alive.length === 0) {
      endGame(room, "draw", null);
    }
  } else {
    const t0 = s.bases.find((b) => b.team === 0);
    const t1 = s.bases.find((b) => b.team === 1);
    if (t0 && t0.hp <= 0) {
      const w = room.players.find((p) => lpTeamOf(p.slot, s.mode) === 1);
      endGame(room, "nexus", w ? w.id : null);
    } else if (t1 && t1.hp <= 0) {
      const w = room.players.find((p) => lpTeamOf(p.slot, s.mode) === 0);
      endGame(room, "nexus", w ? w.id : null);
    }
  }
}

/* ===================== NEXUS WAR ===================== */
function initNexusWar(room) {
  const mode = parseSharedMode(room.mode);
  const W = 900;
  const H = 600;
  let nodes = [];
  let nextId = 1;

  if (mode === "ffa3") {
    const nexusSpots = [
      { x: 120, y: 300, owner: 0 },
      { x: 780, y: 300, owner: 1 },
      { x: 450, y: 100, owner: 2 },
    ];
    nexusSpots.forEach((sp, i) => {
      if (i >= room.players.length) return;
      nodes.push({
        id: nextId++,
        x: sp.x,
        y: sp.y,
        owner: sp.owner,
        units: 30,
        cap: 60,
        prod: 2.2,
        r: 34,
        nexus: true,
      });
    });
    const mids = [
      [300, 200],
      [600, 200],
      [450, 300],
      [300, 420],
      [600, 420],
      [450, 480],
    ];
    mids.forEach(([x, y], i) => {
      nodes.push({
        id: nextId++,
        x,
        y,
        owner: -1,
        units: 8 + (i % 3) * 3,
        cap: 45,
        prod: 1.2 + (i % 3) * 0.25,
        r: 26,
        nexus: false,
      });
    });
  } else {
    const leftOwner = 0;
    const rightOwner = modeIsTeam(mode) ? 1 : 1; // team id for 2v2 via owner as team
    // For team mode store owner as team index 0/1
    const oL = 0;
    const oR = 1;
    nodes = [
      { id: nextId++, x: 80, y: 300, owner: oL, units: 35, cap: 70, prod: 2.4, r: 36, nexus: true },
      { id: nextId++, x: 200, y: 160, owner: oL, units: 15, cap: 50, prod: 1.4, r: 26, nexus: false },
      { id: nextId++, x: 200, y: 440, owner: oL, units: 15, cap: 50, prod: 1.4, r: 26, nexus: false },
      { id: nextId++, x: 380, y: 120, owner: -1, units: 10, cap: 45, prod: 1.3, r: 24, nexus: false },
      { id: nextId++, x: 450, y: 300, owner: -1, units: 12, cap: 55, prod: 1.8, r: 28, nexus: false },
      { id: nextId++, x: 380, y: 480, owner: -1, units: 10, cap: 45, prod: 1.3, r: 24, nexus: false },
      { id: nextId++, x: 700, y: 160, owner: oR, units: 15, cap: 50, prod: 1.4, r: 26, nexus: false },
      { id: nextId++, x: 700, y: 440, owner: oR, units: 15, cap: 50, prod: 1.4, r: 26, nexus: false },
      { id: nextId++, x: 820, y: 300, owner: oR, units: 35, cap: 70, prod: 2.4, r: 36, nexus: true },
    ];
    void leftOwner;
    void rightOwner;
  }

  return {
    mode,
    W,
    H,
    nextId,
    nodes,
    fleets: [],
    prodAcc: 0,
    playerMeta: room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      slot: i,
      team: teamOf(i, mode),
    })),
  };
}

function nwOwnerKey(slot, mode) {
  return modeIsTeam(mode) ? teamOf(slot, mode) : slot;
}

function nwApplyInput(s, slot, mode, inp) {
  if (!inp || inp.cmd !== "send") return;
  const fromId = Number(inp.from);
  const toId = Number(inp.to);
  if (fromId === toId) return;
  const from = s.nodes.find((n) => n.id === fromId);
  const to = s.nodes.find((n) => n.id === toId);
  if (!from || !to) return;
  const my = nwOwnerKey(slot, mode);
  if (from.owner !== my) return;
  const ratio = Math.max(0.1, Math.min(1, Number(inp.ratio) || 0.5));
  const sendN = Math.floor(from.units * ratio);
  if (sendN < 1) return;
  from.units -= sendN;
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const speed = 90;
  s.fleets.push({
    id: s.nextId++,
    owner: my,
    from: fromId,
    to: toId,
    units: sendN,
    x: from.x,
    y: from.y,
    tx: to.x,
    ty: to.y,
    speed,
    dist,
    traveled: 0,
  });
}

function tickNexusWar(room, dt, endGame) {
  const s = room.state;
  if (!s) return;
  const mode = s.mode;

  for (const p of room.players) {
    if (!p.input) continue;
    if (Array.isArray(p.inputQ) && p.inputQ.length) {
      while (p.inputQ.length) {
        const cmd = p.inputQ.shift();
        nwApplyInput(s, p.slot, mode, cmd);
      }
    } else if (p.input.cmd) {
      nwApplyInput(s, p.slot, mode, p.input);
      p.input.cmd = null;
    }
  }

  s.prodAcc += dt;
  while (s.prodAcc >= 1) {
    s.prodAcc -= 1;
    for (const n of s.nodes) {
      if (n.owner < 0) continue;
      n.units = Math.min(n.cap, n.units + n.prod);
    }
  }

  for (const f of s.fleets) {
    const dx = f.tx - f.x;
    const dy = f.ty - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = f.speed * dt;
    if (d <= step) {
      f.x = f.tx;
      f.y = f.ty;
      f.arrived = true;
    } else {
      f.x += (dx / d) * step;
      f.y += (dy / d) * step;
      f.traveled += step;
    }
  }

  const arrived = s.fleets.filter((f) => f.arrived);
  s.fleets = s.fleets.filter((f) => !f.arrived);
  for (const f of arrived) {
    const node = s.nodes.find((n) => n.id === f.to);
    if (!node) continue;
    if (node.owner === f.owner) {
      node.units = Math.min(node.cap + 20, node.units + f.units);
    } else if (node.owner < 0) {
      // neutral: fight garrison
      if (f.units > node.units) {
        node.units = f.units - node.units;
        node.owner = f.owner;
      } else {
        node.units -= f.units;
        if (node.units <= 0) {
          node.units = 0;
          node.owner = -1;
        }
      }
    } else {
      if (f.units > node.units) {
        node.units = f.units - node.units;
        node.owner = f.owner;
      } else {
        node.units -= f.units;
        if (node.units <= 0) {
          node.units = 0;
          // keep owner if somehow 0? capture only if attacker wins
        }
      }
    }
  }

  // win: only one nexus owner side remains among enemy nexuses
  const nexuses = s.nodes.filter((n) => n.nexus);
  if (mode === "ffa3") {
    const owners = [...new Set(nexuses.filter((n) => n.owner >= 0).map((n) => n.owner))];
    if (owners.length === 1) {
      const w = room.players.find((p) => nwOwnerKey(p.slot, mode) === owners[0]);
      endGame(room, "nexus", w ? w.id : null);
    }
  } else {
    const o0 = nexuses.find((n) => n.x < s.W / 2);
    const o1 = nexuses.find((n) => n.x >= s.W / 2);
    if (o0 && o0.owner !== 0 && o0.owner >= 0) {
      const w = room.players.find((p) => nwOwnerKey(p.slot, mode) === o0.owner);
      endGame(room, "nexus", w ? w.id : null);
    } else if (o1 && o1.owner !== 1 && o1.owner >= 0) {
      const w = room.players.find((p) => nwOwnerKey(p.slot, mode) === o1.owner);
      endGame(room, "nexus", w ? w.id : null);
    }
  }
}

module.exports = {
  SHARED_MODES,
  parseSharedMode,
  modeNeed,
  modeMax,
  modeIsTeam,
  teamOf,
  LP_CHAMPS,
  LP_CHAMP_IDS,
  initLanePush,
  tickLanePush,
  initNexusWar,
  tickNexusWar,
  nwOwnerKey,
};
