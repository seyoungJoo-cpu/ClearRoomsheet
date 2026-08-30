(function (window, document) {
  'use strict';

  var META = {
    tank: { icon: '🛡️', name: '탱크대전', desc: '싱글/FFA/2v2 · 중앙 아이템 · HP5' },
    rts: { icon: '🏰', name: '미니 RTS', desc: '싱글/대결 · 시대 진화 · 본진 파괴' },
    ageofwar: { icon: '⚔️', name: '전쟁시대', desc: '싱글/대결 · 시대 진화 라인전' },
    snakes: { icon: '🪱', name: '멀티 스네이크', desc: '싱글/대결 · 목숨 3 · 최대 8인' },
    airhockey: { icon: '🏒', name: '에어하키', desc: '싱글/대결 · 반응속도 에어하키' },
    memorymp: { icon: '🛎️', name: '호텔 메모리 멀티', desc: '싱글/1:1/1:1:1/2:2 · 카드수 선택' },
    lanepush: { icon: '🗡️', name: '레인 푸시', desc: '싱글/대결 · LOL 미니 라인전' },
    nexuswar: { icon: '🌐', name: '점령전', desc: '싱글/대결 · 거점 점령 스노우볼' },
    gomoku: { icon: '⚫', name: '오목', desc: '1:1 / 2:2 / 1:AI · 5목을 먼저' },
    chess: { icon: '♟️', name: '체스', desc: '1:1 / 2:2 / 1:AI · 클래식 체스' },
    janggi: { icon: '🐴', name: '장기', desc: '1:1 / 2:2 / 1:AI · 한국 장기' },
    yut: { icon: '🪵', name: '윷놀이', desc: '2~4팀 / 2:2 / 1:AI · 윷 던져 말 옮기기' }
  };
  var MAX_PLAYERS = { tank: 4, rts: 4, ageofwar: 2, snakes: 8, airhockey: 2, memorymp: 4, lanepush: 4, nexuswar: 4, gomoku: 4, chess: 4, janggi: 4, yut: 4 };
  var BOARD_IDS = ['gomoku', 'chess', 'janggi', 'yut'];
  var BOARD_MODE_META = {
    solo: { label: '1:AI', max: 2 },
    '1v1': { label: '1:1', max: 2 },
    '2v2': { label: '2:2', max: 4 },
    ffa3: { label: '3팀', max: 3 },
    ffa4: { label: '4팀', max: 4 }
  };
  var boardCreateMode = '1v1';
  var boardSel = null;
  var boardSig = '';
  var yutThrowSeen = '';
  var yutPrevMals = null;
  var yutAnimReady = false;
  var yutSel = null;
  var yutThrowI = 0;
  var yutFxSeen = 0;
  var jgFxSeen = 0;
  var jgMoveSeen = '';
  var YUT_TEAM_NAMES = ['청', '홍', '황', '녹'];
  var YUT_TEAM_COL = ['#3d7cff', '#e23d28', '#e0a020', '#2f9e58'];
  var YUT_TEAM_COL_DARK = ['#163a88', '#7a1510', '#7a5a0a', '#14532d'];
  var tankCreateMode = 'ffa';
  var rtsCreateMode = '1v1';
  var rtsCreateAiDiff = 'medium';
  var memoryCreateMode = '1v1';
  var laneCreateMode = '1v1';
  var nexusCreateMode = '1v1';
  var memoryPairs = 18;
  var SHARED_MODE_META = {
    solo: { label: '싱글 vs AI', max: 2 },
    '1v1': { label: '1:1', max: 2 },
    ffa3: { label: '1:1:1', max: 3 },
    '2v2': { label: '2:2', max: 4 }
  };
  var LP_CHAMP_META = [
    { id: 'blade', name: '블레이드', role: '전사' },
    { id: 'arc', name: '아크', role: '원거리' },
    { id: 'bolt', name: '볼트', role: '마법' },
    { id: 'guard', name: '가드', role: '탱커' },
    { id: 'shade', name: '셰이드', role: '암살' }
  ];
  var laneCmd = { skill: null, pick: null, buy: null, level: null, moveX: null, moveY: null };
  var nwDragFrom = null;
  var RTS_MODE_META = {
    solo: { label: '싱글 vs AI', max: 2 },
    '1v1': { label: '1:1', max: 2 },
    ffa3: { label: '1:1:1', max: 3 },
    ffa4: { label: '1:1:1:1', max: 4 },
    '2v2': { label: '2:2', max: 4 }
  };
  var RTS_AGE_NAMES = ['암흑시대', '봉건시대', '성주시대', '제국시대'];
  var RTS_UNIT_LABELS = {
    worker: '일꾼', melee: '근접병', ranged: '원거리병', duck: '오리',
    swordsman: '검사', archer: '궁수', knight: '기사', crossbow: '석궁병',
    bomber: '폭탄병', champion: '챔피언', musketeer: '화승총병', tanker: '탱커', cannon: '대포'
  };
  var RTS_UNIT_COST = {
    worker: 50, melee: 75, ranged: 95, duck: 28, swordsman: 115, archer: 125,
    knight: 185, crossbow: 155, bomber: 150, champion: 240, musketeer: 210, tanker: 250, cannon: 300
  };
  var RTS_UNIT_FLAIR = {
    worker: '', melee: '', ranged: '', duck: '', swordsman: '', archer: '',
    knight: '', crossbow: '', bomber: '', champion: '', musketeer: '', tanker: '', cannon: ''
  };
  var RTS_AI_DIFF_META = {
    easy: { id: 'easy', label: '초보' },
    medium: { id: 'medium', label: '중급' },
    hard: { id: 'hard', label: '고수' },
    elite: { id: 'elite', label: '초고수' }
  };
  var MEMORY_MODE_META = {
    solo: { label: '싱글 vs AI', max: 2 },
    '1v1': { label: '1:1', max: 2 },
    ffa3: { label: '1:1:1', max: 3 },
    '2v2': { label: '2:2', max: 4 }
  };
  var SIMPLE_SOLO_META = { solo: { label: '싱글 vs AI', max: 2 }, versus: { label: '멀티', max: 8 } };
  var aowCreateMode = 'versus';
  var snakesCreateMode = 'versus';
  var hockeyCreateMode = 'versus';
  var MEMORY_SIZE_META = [
    { pairs: 12, label: '12쌍 · 4×6' },
    { pairs: 18, label: '18쌍 · 6×6' },
    { pairs: 24, label: '24쌍 · 6×8' },
    { pairs: 28, label: '28쌍 · 7×8' },
    { pairs: 32, label: '32쌍 · 8×8' }
  ];
  var memoryBoardSig = '';
  var memoryWaveRaf = 0;
  var memoryWaveKey = '';
  var aowAgeNames = ['석기', '중세', '화약', '현대', '미래'];
  var aowUnitNames = [
    ['곤봉병', '투석병', '공룡기수'],
    ['검사', '궁수', '기사'],
    ['결투사', '머스킷', '대포병'],
    ['돌격병', '소총병', '전차'],
    ['광선검사', '블래스터', '워머신']
  ];
  var aowCosts = [
    [15, 25, 100], [50, 75, 220], [120, 180, 420], [260, 340, 900], [500, 620, 1600]
  ];
  var COLORS = ['#efd28a', '#6ec8ff', '#ff8a7a', '#9ae6b4', '#d6a2ff', '#f6ad55', '#90cdf4', '#fc8181'];

  var config = {};
  var root, refs = {}, toastTimer = 0;
  var ws = null, gameId = '', room = null, selfId = '', lastState = null, endedInfo = null;
  var listTimer = 0, inputTimer = 0, reconnecting = false, intentionalClose = false;
  var connectWaiters = [];
  var connecting = false;
  var connectRetry = 0;
  var pendingCreate = false;
  var createWatchTimer = 0;
  var idleCloseTimer = 0;
  var helloOkWait = false;
  var lastBrowseSig = '';
  var view = 'browse'; // browse | room | play | ended
  var lastBrowseRooms = [];
  var keys = {}, mouse = { x: 0, y: 0, down: false, right: false, ax: 0, ay: 0 };
  var lastSnakeDir = { dirX: 1, dirY: 0 };
  var selectIds = [], drag = null, pendingBuild = null;
  var canvasW = 800, canvasH = 600, fireLatch = false;
  var gamePaused = false;
  var stashedBehindOrders = false;
  var hockeySmooth = null;
  var hockeyRaf = 0;
  var hockeyLastScore = '';
  var tankCam = { x: null, y: null, free: false };
  var rtsAtkPrevCd = {};
  var rtsAtkSwing = {}; // id -> { until, ang, style }
  var rtsRaf = 0;

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName).toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  function setGamePaused(on) {
    gamePaused = !!on;
    if (refs.pause) {
      refs.pause.classList.toggle('show', gamePaused);
      refs.pause.setAttribute('aria-hidden', gamePaused ? 'false' : 'true');
    }
  }
  function togglePause() {
    if (view !== 'play') return;
    setGamePaused(!gamePaused);
    toast(gamePaused ? '일시정지 (P로 계속 · 로컬)' : '게임 재개');
    if (!gamePaused) drawFrame();
  }
  function exitToOrders() {
    closeOverlay();
    if (window.HKGames && typeof HKGames.close === 'function') {
      try { HKGames.close(); } catch (_) {}
    }
    if (typeof config.onExitToOrders === 'function') {
      try { config.onExitToOrders(); } catch (_) {}
    }
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function name() {
    try { return String((config.getOperatorName && config.getOperatorName()) || '').trim(); }
    catch (_) { return ''; }
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function toast(text) {
    if (!refs.toast) return;
    clearTimeout(toastTimer);
    refs.toast.textContent = text;
    refs.toast.classList.add('show');
    toastTimer = setTimeout(function () { refs.toast.classList.remove('show'); }, 2400);
  }
  function meta(id) { return META[id] || { icon: '🎮', name: id, desc: '' }; }
  function isBoard(id) { return BOARD_IDS.indexOf(id || gameId) >= 0; }

  function inject() {
    if (root) return;
    var style = el('style');
    style.textContent = [
      '.hk-mp-overlay{position:fixed;inset:0;z-index:10001;display:none;color:#f5f0df;background:radial-gradient(circle at 12% 12%,#12453c 0,transparent 36%),linear-gradient(145deg,#07131d,#0a2025 58%,#07151b);font-family:Georgia,"Noto Serif KR","Apple SD Gothic Neo","Malgun Gothic",serif;overflow:auto}',
      '.hk-mp-overlay.open{display:block}.hkmp-shell{width:min(1100px,calc(100% - 28px));margin:auto;padding:22px 0 36px;box-sizing:border-box}',
      '.hkmp-top{display:flex;align-items:center;gap:12px;margin-bottom:16px}.hkmp-top h1{flex:1;margin:0;font-size:clamp(22px,4vw,34px);color:#fff6dc;font-family:Georgia,serif}',
      '.hkmp-btn{appearance:none;border:1px solid #8f7b4f;background:#122a2d;color:#f4e8c9;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer}.hkmp-btn:hover{border-color:#d5bd80;background:#18383a}.hkmp-btn.primary{color:#15211f;background:linear-gradient(135deg,#f0d796,#bea15e);border:0}.hkmp-btn:disabled{opacity:.45;cursor:default}',
      '.hkmp-panel{border:1px solid rgba(220,194,126,.26);border-radius:20px;background:linear-gradient(115deg,rgba(13,52,49,.88),rgba(8,25,32,.92));box-shadow:0 20px 55px #0007;padding:20px}',
      '.hkmp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px}',
      '.hkmp-list{display:grid;gap:10px;margin-top:10px;min-height:120px}.hkmp-room{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #ffffff18;border-radius:14px;background:#0d242988;cursor:pointer;transition:.15s;text-align:left;width:100%;font:inherit;color:inherit}',
      '.hkmp-room:hover{border-color:#cbb270aa;background:#12343acc;transform:translateY(-1px)}.hkmp-room:disabled{opacity:.5;cursor:default;transform:none}',
      '.hkmp-room b{color:#efd28a;font-size:15px}.hkmp-room span{flex:1;color:#aebfba;font-size:13px;text-align:left}',
      '.hkmp-room .hkmp-join-hint{flex:0 0 auto;color:#15211f;background:linear-gradient(135deg,#f0d796,#bea15e);border-radius:10px;padding:8px 12px;font-weight:800;font-size:12px}',
      '.hkmp-create-wrap{display:flex;flex-direction:column;gap:10px;margin-bottom:18px}',
      '.hkmp-players{display:grid;gap:8px;margin:12px 0}.hkmp-player{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:#091a21cc;border:1px solid #ffffff12}',
      '.hkmp-player.me{border-color:#cbb27088;color:#efd28a}.hkmp-dot{width:10px;height:10px;border-radius:50%;background:#88a09a}.hkmp-dot.on{background:#9ae6b4}',
      '.hkmp-note{color:#88a09a;font-size:12px;margin-top:8px}.hkmp-hud{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}',
      '.hkmp-pill{padding:7px 11px;border:1px solid #ffffff1c;background:#0d2429;border-radius:12px;font-size:13px}.hkmp-pill b{color:#efd58f;margin-left:5px}',
      '.hkmp-stage{position:relative;border-radius:16px;overflow:hidden;background:#07151a;box-shadow:inset 0 0 0 1px #ffffff12;touch-action:none}',
      '.hkmp-pause{position:absolute;inset:0;display:none;place-items:center;background:#061218b8;backdrop-filter:blur(2px);z-index:5}.hkmp-pause.show{display:grid}.hkmp-pause-box{padding:22px 28px;border:1px solid #cbb27088;border-radius:18px;background:#0d2429ee;text-align:center;box-shadow:0 16px 40px #0008}.hkmp-pause-box strong{display:block;font-family:Georgia,serif;color:#efd28a;font-size:28px;margin-bottom:8px}.hkmp-pause-box span{color:#b1c1bd;font-size:13px}',
      '.hkmp-stage canvas{display:block;width:100%;height:auto;max-height:72vh;cursor:crosshair}',
      '.hkmp-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}',
      '.hkmp-toolbar .hkmp-btn{padding:8px 11px;font-size:12px}.hkmp-toolbar .hkmp-btn.active{box-shadow:0 0 0 2px #efd28a}',
      '.hkmp-ended{text-align:center;padding:28px 12px}.hkmp-ended h2{font-family:Georgia,serif;color:#efd28a;font-size:30px;margin:0 0 8px}',
      '.hkmp-ended.board-end{position:relative;overflow:hidden;padding:36px 16px 28px;border-radius:22px;min-height:280px;isolation:isolate}',
      '.hkmp-ended.board-end.win{background:radial-gradient(circle at 50% 18%,#fff7c8,#ffe566 28%,#e23d28 62%,#5a1008);box-shadow:inset 0 0 80px #fff6,0 0 40px #ffe56688;animation:hkmp-end-winbg 1.4s ease}',
      '.hkmp-ended.board-end.lose{background:radial-gradient(circle at 50% 80%,#6a3a3a,#2a1212 42%,#0a0606);animation:hkmp-end-losebg 1.3s ease}',
      '.hkmp-ended.board-end.draw{background:radial-gradient(circle at 50% 30%,#dbe7ff,#6a8cc8 48%,#1a2840);animation:hkmp-end-drawbg 1.1s ease}',
      '.hkmp-ended.board-end .hkmp-end-title{position:relative;z-index:2;margin:10px 0 8px;font-family:"Noto Serif KR",Batang,Impact,serif;font-weight:900;letter-spacing:-.06em;line-height:1;text-shadow:0 8px 0 #0005,0 0 28px #fff8}',
      '.hkmp-ended.board-end.win .hkmp-end-title{font-size:clamp(56px,16vw,108px)!important;color:#fff!important;animation:hkmp-end-wintitle 1.15s cubic-bezier(.15,1.5,.3,1) both}',
      '.hkmp-yut-ranks{position:relative;z-index:2;list-style:none;margin:12px auto 0;padding:0;max-width:320px;text-align:left}',
      '.hkmp-yut-ranks li{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;margin:6px 0;border-radius:12px;background:#0006;color:#fff;font-weight:800;font-size:14px}',
      '.hkmp-yut-ranks li.me{box-shadow:inset 0 0 0 2px #ffe566}',
      '.hkmp-end-actions{position:relative;z-index:2;opacity:0;pointer-events:none;transform:translateY(10px);transition:.35s ease}',
      '.hkmp-end-actions.show{opacity:1;pointer-events:auto;transform:none}',
      '.hkmp-ended.board-end.lose .hkmp-end-title{font-size:clamp(52px,15vw,96px)!important;color:#fff!important;animation:hkmp-end-losetitle 1.05s cubic-bezier(.4,0,.2,1) both}',
      '.hkmp-ended.board-end.draw .hkmp-end-title{font-size:clamp(44px,12vw,80px)!important;color:#fff!important;animation:hkmp-end-drawtitle .9s ease both}',
      '.hkmp-ended.board-end p{position:relative;z-index:2}',
      '.hkmp-ended.board-end .hkmp-row{position:relative;z-index:2}',
      '.hkmp-end-rays{position:absolute;inset:-40%;background:repeating-conic-gradient(from 0deg,#fff8 0 8deg,#0000 8deg 22deg);opacity:0;pointer-events:none}',
      '.hkmp-ended.board-end.win .hkmp-end-rays{animation:hkmp-end-spin 6s linear infinite,hkmp-end-rayin .6s ease forwards}',
      '.hkmp-end-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}',
      '.hkmp-end-piece{position:absolute;top:-12%;width:12px;height:18px;border-radius:2px;opacity:0;animation:hkmp-end-fall 1.8s ease-in forwards}',
      '.hkmp-end-crack{position:absolute;inset:0;pointer-events:none;opacity:0;background:linear-gradient(115deg,#0000 42%,#fff3 43%,#0000 44%),linear-gradient(70deg,#0000 51%,#fff2 52%,#0000 53%),linear-gradient(160deg,#0000 36%,#0008 37%,#0000 38%);}',
      '.hkmp-ended.board-end.lose .hkmp-end-crack{animation:hkmp-end-crackin .8s ease forwards}',
      '.hkmp-endfx{position:fixed;inset:0;z-index:10030;pointer-events:none;display:none}.hkmp-endfx.go{display:block}',
      '.hkmp-endfx-flash{position:absolute;inset:0;opacity:0}',
      '.hkmp-endfx.go[data-kind="win"] .hkmp-endfx-flash{background:radial-gradient(circle,#fff,#ffe566ee 28%,#e23d28aa 58%,#0000);animation:hkmp-end-flash 1.5s ease forwards}',
      '.hkmp-endfx.go[data-kind="lose"] .hkmp-endfx-flash{background:radial-gradient(circle,#444c,#111d 40%,#000e);animation:hkmp-end-flash 1.45s ease forwards}',
      '.hkmp-endfx.go[data-kind="draw"] .hkmp-endfx-flash{background:radial-gradient(circle,#fff8,#3d7cff99 50%,#0000);animation:hkmp-end-flash 1.2s ease forwards}',
      '.hkmp-endfx-rays{position:absolute;left:50%;top:42%;width:140vmax;height:140vmax;margin:-70vmax;background:repeating-conic-gradient(#ffe56666 0 10deg,#0000 10deg 24deg);opacity:0}',
      '.hkmp-endfx.go[data-kind="win"] .hkmp-endfx-rays{animation:hkmp-end-spin 2.4s linear,hkmp-end-rayin .35s ease forwards}',
      '.hkmp-endfx-shock{position:absolute;left:50%;top:46%;width:48px;height:48px;margin:-24px;border-radius:50%;border:14px solid #fff;opacity:0}',
      '.hkmp-endfx.go .hkmp-endfx-shock{animation:hkmp-end-shock 1.05s cubic-bezier(.1,.7,.2,1) forwards}',
      '.hkmp-endfx.go[data-kind="win"] .hkmp-endfx-shock{border-color:#ffe566}',
      '.hkmp-endfx.go[data-kind="lose"] .hkmp-endfx-shock{border-color:#666;animation-name:hkmp-end-shock-in}',
      '.hkmp-endfx-shock2{animation-delay:.18s!important}',
      '.hkmp-endfx-txt{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.1) rotate(-22deg);font-size:clamp(64px,20vw,148px);font-weight:900;color:#fff;font-family:"Noto Serif KR",Batang,Impact,serif;letter-spacing:-.07em;text-shadow:0 0 12px #000,10px 12px 0 #7a0000,-6px -4px 0 #ff0,0 24px 52px #000;opacity:0;white-space:nowrap}',
      '.hkmp-endfx.go[data-kind="win"] .hkmp-endfx-txt{animation:hkmp-end-slam 1.35s cubic-bezier(.12,1.5,.28,1) forwards}',
      '.hkmp-endfx.go[data-kind="lose"] .hkmp-endfx-txt{text-shadow:0 0 18px #000,0 18px 40px #000;color:#bbb;animation:hkmp-end-drop 1.25s cubic-bezier(.4,0,.2,1) forwards}',
      '.hkmp-endfx.go[data-kind="draw"] .hkmp-endfx-txt{text-shadow:0 0 10px #000,6px 8px 0 #163a88,-4px -3px 0 #fff;animation:hkmp-end-slam 1.15s cubic-bezier(.15,1.4,.3,1) forwards}',
      '.hkmp-endfx-bits,.hkmp-endfx-rain{position:absolute;inset:0;overflow:hidden}',
      '.hkmp-endfx-bit{position:absolute;left:50%;top:48%;width:16px;height:16px;margin:-8px;border-radius:2px;opacity:0}',
      '.hkmp-endfx.go .hkmp-endfx-bit{animation:hkmp-end-bit 1.25s ease-out forwards}',
      '.hkmp-endfx-drop{position:absolute;top:-8%;width:10px;height:16px;border-radius:2px;opacity:0}',
      '.hkmp-endfx.go .hkmp-endfx-drop{animation:hkmp-end-fall 1.7s ease-in forwards}',
      '.hk-mp-overlay.end-win-quake{animation:hkmp-end-winquake 1.1s ease}',
      '.hk-mp-overlay.end-lose-quake{animation:hkmp-end-losequake 1.05s ease}',
      '.hk-mp-overlay.end-draw-quake{animation:hkmp-jg-quake2 .7s ease}',
      '@keyframes hkmp-end-flash{0%{opacity:0}8%{opacity:1}20%{opacity:.92}100%{opacity:0}}',
      '@keyframes hkmp-end-shock{0%{transform:scale(.12);opacity:1;border-width:22px}100%{transform:scale(28);opacity:0;border-width:0}}',
      '@keyframes hkmp-end-shock-in{0%{transform:scale(18);opacity:.9;border-width:0}100%{transform:scale(.2);opacity:0;border-width:22px}}',
      '@keyframes hkmp-end-slam{0%{transform:translate(-50%,-50%) scale(.08) rotate(-32deg);opacity:0}16%{transform:translate(-50%,-50%) scale(1.55) rotate(12deg);opacity:1}34%{transform:translate(-50%,-50%) scale(.86) rotate(-8deg);opacity:1}55%{transform:translate(-50%,-50%) scale(1.18) rotate(4deg);opacity:1}78%{transform:translate(-50%,-50%) scale(1.04) rotate(-2deg);opacity:1}100%{transform:translate(-50%,-50%) scale(1.08) rotate(-1deg);opacity:0}}',
      '@keyframes hkmp-end-drop{0%{transform:translate(-50%,-120%) scale(.6) rotate(-8deg);opacity:0}22%{transform:translate(-50%,-40%) scale(1.2) rotate(6deg);opacity:1}40%{transform:translate(-50%,-50%) scale(.92) rotate(-3deg);opacity:1}70%{transform:translate(-50%,-48%) scale(1.04);opacity:1}100%{transform:translate(-50%,-20%) scale(1.1);opacity:0}}',
      '@keyframes hkmp-end-bit{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(320deg) scale(.1);opacity:0}}',
      '@keyframes hkmp-end-fall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(120vh) rotate(540deg);opacity:.15}}',
      '@keyframes hkmp-end-spin{to{transform:rotate(360deg)}}',
      '@keyframes hkmp-end-rayin{0%{opacity:0}30%{opacity:.55}100%{opacity:.28}}',
      '@keyframes hkmp-end-winbg{0%{filter:brightness(4) saturate(2.4)}40%{filter:brightness(1.35) saturate(1.4)}100%{filter:none}}',
      '@keyframes hkmp-end-losebg{0%{filter:brightness(2.2) contrast(1.4)}100%{filter:saturate(.55)}}',
      '@keyframes hkmp-end-drawbg{0%{filter:brightness(2.4)}100%{filter:none}}',
      '@keyframes hkmp-end-wintitle{0%{transform:scale(.2) rotate(-18deg);opacity:0;filter:blur(8px)}28%{transform:scale(1.28) rotate(8deg);opacity:1;filter:none}48%{transform:scale(.9) rotate(-4deg)}72%{transform:scale(1.08) rotate(2deg)}100%{transform:scale(1)}}',
      '@keyframes hkmp-end-losetitle{0%{transform:translateY(-80px) scale(1.3);opacity:0;filter:blur(6px)}30%{transform:translateY(12px) scale(1.08);opacity:1;filter:none}55%{transform:translateY(-6px) scale(.96)}100%{transform:translateY(0) scale(1)}}',
      '@keyframes hkmp-end-drawtitle{0%{transform:scale(.4);opacity:0}40%{transform:scale(1.12);opacity:1}100%{transform:scale(1)}}',
      '@keyframes hkmp-end-crackin{0%{opacity:0}30%{opacity:1}100%{opacity:.7}}',
      '@keyframes hkmp-end-winquake{0%,100%{transform:none}6%{transform:translate(-28px,16px) rotate(-4deg) scale(1.04)}14%{transform:translate(30px,-14px) rotate(4.2deg) scale(1.05)}24%{transform:translate(-22px,-18px) rotate(-3deg)}36%{transform:translate(24px,14px) rotate(3.2deg)}50%{transform:translate(-12px,8px)}66%{transform:translate(10px,-6px)}100%{transform:none}}',
      '@keyframes hkmp-end-losequake{0%,100%{transform:none}10%{transform:translate(18px,22px) rotate(2deg) scale(.97)}22%{transform:translate(-20px,28px) rotate(-2.4deg) scale(.95)}40%{transform:translate(8px,16px) scale(.98)}70%{transform:translate(-4px,6px)}100%{transform:none}}',
      '.hkmp-memory-wrap{width:min(100%,340px);aspect-ratio:3/4;height:auto;max-height:min(72vh,560px);margin:0 auto;padding:0;display:flex;align-items:center;justify-content:center}',
      '.hkmp-memory{width:100%;height:100%;display:grid;gap:6px;perspective:900px;-webkit-user-select:none;user-select:none;box-sizing:border-box}',
      '.hkmp-memory.wave .hkmp-memory-card{transition:transform .14s ease,background .14s ease,color .14s ease}',
      '.hkmp-memory-card{min-width:0;min-height:0;width:100%;height:100%;aspect-ratio:3/4;border:0;border-radius:10px;background:linear-gradient(160deg,#1f5650,#0d252c);color:transparent;font-size:clamp(22px,4.6vw,40px);line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;text-align:center;transition:.22s;box-shadow:inset 0 0 0 1px #d2b77044,0 4px 10px #0005;-webkit-user-select:none;user-select:none}',
      '.hkmp-memory-card.open,.hkmp-memory-card.done{background:#f0dfa8;color:#142826;transform:rotateY(180deg);text-shadow:0 1px 0 #fff6}.hkmp-memory-card.done{background:#9fcbb0;opacity:.78;cursor:default}',
      '.hkmp-memory-card .hkmp-memory-face{display:flex;align-items:center;justify-content:center;width:100%;height:100%;line-height:1;transform:rotateY(180deg)}.hkmp-memory-card.mine{box-shadow:inset 0 0 0 2px #efd28a,0 0 0 1px #efd28a55}.hkmp-memory-card:disabled{cursor:default;opacity:.85}',
      '.hkmp-board-wrap{width:min(100%,640px);margin:0 auto}.hkmp-grid{display:grid;gap:0;margin:0 auto;user-select:none}.hkmp-cell{appearance:none;border:0;background:#0d292d;color:#f5f0df;cursor:pointer;display:grid;place-items:center;padding:0;font-weight:800;min-width:0;min-height:0;position:relative}.hkmp-cell:hover{filter:brightness(1.08)}.hkmp-cell.mine{box-shadow:inset 0 0 0 2px #efd28a}.hkmp-cell.sel{box-shadow:inset 0 0 0 3px #efd28a,inset 0 0 12px #efd28a44}.hkmp-cell.last{box-shadow:inset 0 0 0 3px #e8b84a}.hkmp-cell.hint:after,.hkmp-cell.cap:after{content:"";position:absolute;pointer-events:none;z-index:2}.hkmp-cell.hint:after{width:28%;height:28%;border-radius:50%;background:rgba(46,170,80,.58)}.hkmp-cell.cap:after{inset:8%;border:3px solid rgba(210,50,50,.82);border-radius:50%;box-sizing:border-box}',
      '.hkmp-go{position:relative;width:min(100%,540px);aspect-ratio:1;margin:0 auto;box-sizing:border-box;background:#c9955a;background-image:repeating-linear-gradient(90deg,rgba(90,50,20,.07) 0 2px,transparent 2px 5px),repeating-linear-gradient(0deg,rgba(90,50,20,.05) 0 2px,transparent 2px 6px),radial-gradient(ellipse at 30% 20%,rgba(255,230,180,.22),transparent 55%);border:12px solid #5a3214;box-shadow:inset 0 0 28px #0004,0 10px 28px #0007;border-radius:4px}.hkmp-go-lines{position:absolute;inset:3.333%;width:auto;height:auto;pointer-events:none;overflow:visible}.hkmp-go-pts{position:absolute;inset:0;display:grid;grid-template-columns:repeat(15,1fr);grid-template-rows:repeat(15,1fr)}.hkmp-go-pt{border:0;background:transparent;padding:0;margin:0;display:grid;place-items:center;cursor:pointer;min-width:0;min-height:0}.hkmp-go-pt:disabled{cursor:default}.hkmp-go-stone{width:86%;height:86%;border-radius:50%;box-shadow:1px 2px 4px #0007,inset -2px -3px 5px #0004,inset 2px 3px 4px #fff4;pointer-events:none}.hkmp-go-stone.b{background:radial-gradient(circle at 32% 28%,#6a6a6a,#1a1a1a 54%,#050505)}.hkmp-go-stone.w{background:radial-gradient(circle at 32% 28%,#fff,#e8e8e8 50%,#c8c8c8);box-shadow:1px 2px 4px #0005,inset -1px -2px 3px #0002,inset 2px 3px 4px #fff}.hkmp-go-pt.last .hkmp-go-stone{box-shadow:0 0 0 2px #c41e3a,1px 2px 4px #0007}',
      '.hkmp-chess{width:min(100%,520px);aspect-ratio:1;margin:0 auto;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);border:14px solid #1a120c;box-shadow:0 10px 28px #0008,inset 0 0 0 2px #c9a56a;border-radius:4px}.hkmp-chess .hkmp-cell{width:100%;height:100%;border:0;filter:none}.hkmp-chess .hkmp-cell.light{background:#f3efe6}.hkmp-chess .hkmp-cell.dark{background:#1e1e1e}.hkmp-chess .hkmp-cell.light:hover{background:#fff8ee}.hkmp-chess .hkmp-cell.dark:hover{background:#333}.hkmp-chess .hkmp-cell.sel.light{background:#d4e87a}.hkmp-chess .hkmp-cell.sel.dark{background:#6a8f2a}.hkmp-chess .hkmp-cell.last.light{background:#f0d56a}.hkmp-chess .hkmp-cell.last.dark{background:#b8860b}.hkmp-ch-piece{font-size:clamp(24px,6.4vw,44px);line-height:1;pointer-events:none;font-weight:700}.hkmp-ch-piece.w{color:#fafafa;text-shadow:0 1px 0 #111,0 0 3px #000,1px 1px 0 #333,-1px -1px 0 #333}.hkmp-ch-piece.b{color:#111;text-shadow:0 0 2px #fff,0 1px 0 #fff,1px 1px 0 #ccc}',
      '.hkmp-jg{position:relative;width:min(100%,430px);aspect-ratio:9/10;margin:0 auto;box-sizing:border-box;background:#e4bc6a;background-image:repeating-linear-gradient(90deg,rgba(90,40,10,.06) 0 1px,transparent 1px 4px);border:12px solid #6b3a14;box-shadow:inset 0 0 24px #0003,0 10px 28px #0007}.hkmp-jg-lines{position:absolute;left:5.555%;right:5.555%;top:5%;bottom:5%;width:auto;height:auto;pointer-events:none}.hkmp-jg-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(10,1fr)}.hkmp-jg .hkmp-cell{background:transparent;border:0;filter:none}.hkmp-jg .hkmp-cell:hover{background:rgba(255,255,255,.12)}.hkmp-jg .hkmp-cell.sel{background:rgba(239,210,138,.35)}.hkmp-jg-piece{width:84%;height:84%;max-width:48px;max-height:48px;border-radius:50%;display:grid;place-items:center;font-family:"Noto Serif KR","Nanum Myeongjo",Batang,Georgia,serif;font-weight:900;font-size:clamp(13px,3.1vw,20px);line-height:1;background:radial-gradient(circle at 35% 30%,#fff4d4,#e8c98a 55%,#c9a05a);box-shadow:1px 2px 4px #0006,inset 0 1px 0 #fff8;pointer-events:none}.hkmp-jg-piece.s0{color:#c41e3a;border:2px solid #8b1515}.hkmp-jg-piece.s1{color:#153a6b;border:2px solid #0f2a4a}',
      '.hkmp-jg-piece.t-K{width:96%;height:96%;max-width:56px;max-height:56px;font-size:clamp(16px,3.8vw,24px);border-width:3px}.hkmp-jg-piece.t-R{width:90%;height:90%;max-width:51px;max-height:51px;font-size:clamp(14px,3.4vw,21px)}.hkmp-jg-piece.t-C{width:86%;height:86%;max-width:48px;max-height:48px;font-size:clamp(13px,3.2vw,20px)}.hkmp-jg-piece.t-N,.hkmp-jg-piece.t-B{width:80%;height:80%;max-width:44px;max-height:44px;font-size:clamp(12px,3vw,18px)}.hkmp-jg-piece.t-A{width:72%;height:72%;max-width:39px;max-height:39px;font-size:clamp(11px,2.7vw,16px)}.hkmp-jg-piece.t-P{width:62%;height:62%;max-width:34px;max-height:34px;font-size:clamp(10px,2.4vw,14px)}',
      '.hkmp-jg.jg-check{box-shadow:inset 0 0 48px #c41e3aaa,0 0 32px #c41e3a,0 10px 28px #0007;animation:hkmp-jg-boardslam .7s ease}.hkmp-jg.jg-slam{animation:hkmp-jg-boardslam .55s ease}',
      '.hkmp-jg-banner{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);z-index:6;pointer-events:none;font-family:"Noto Serif KR",Batang,Impact,serif;font-weight:900;font-size:clamp(28px,8vw,52px);color:#fff;text-shadow:0 0 8px #c41e3a,4px 6px 0 #7a0000,-3px -2px 0 #ffe566,0 12px 28px #000;animation:hkmp-jg-bannerpop .9s ease both;white-space:nowrap}',
      '.hkmp-jg-banner.setup{font-size:clamp(18px,4.5vw,28px);color:#5a2a12;text-shadow:0 1px 0 #fff8,0 4px 10px #0004;top:50%}',
      '.hkmp-jg .hkmp-cell.chk .hkmp-jg-piece{box-shadow:0 0 0 4px #c41e3a,0 0 18px #ff2a00,1px 2px 4px #0006;animation:hkmp-jg-kingpulse .7s ease infinite}',
      '.hkmp-jg-fly{position:fixed;z-index:10040;pointer-events:none;margin:0;filter:drop-shadow(0 10px 18px #000a)}',
      '.hkmp-jg-cell-burst{position:absolute;inset:12%;border-radius:50%;pointer-events:none;animation:hkmp-jg-burst .55s ease forwards}',
      '.hkmp-jg-boom{position:fixed;inset:0;z-index:10020;pointer-events:none;display:none}.hkmp-jg-boom.go{display:block}',
      '.hkmp-jg-boom-flash{position:absolute;inset:0;opacity:0}',
      '.hkmp-jg-boom.go[data-kind="move"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#fff6,#c9a22755 50%,#0000);animation:hkmp-jg-flash .65s ease forwards}',
      '.hkmp-jg-boom.go[data-kind="capture"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#ff2a00dd,#7a0000aa 42%,#ffcc0044);animation:hkmp-jg-flash 1.15s ease forwards}',
      '.hkmp-jg-boom.go[data-kind="check"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#c41e3add,#7a0000bb 48%,#ffe56655);animation:hkmp-jg-flash 1.25s ease forwards}',
      '.hkmp-jg-boom.go[data-kind="mate"] .hkmp-jg-boom-flash,.hkmp-jg-boom.go[data-kind="win"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#ffe566ee,#c41e3aaa 46%,#111c);animation:hkmp-jg-flash 1.55s ease forwards}',
      '.hkmp-jg-boom.go[data-kind="bikjang"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#efd28add,#3d7cff99);animation:hkmp-jg-flash 1.25s ease forwards}',
      '.hkmp-jg-boom.go[data-kind="start"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#fff8,#c9a22777);animation:hkmp-jg-flash .85s ease forwards}',
      '.hkmp-jg-boom.go[data-kind="pass"] .hkmp-jg-boom-flash,.hkmp-jg-boom.go[data-kind="setup"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#ffffff66,#0000);animation:hkmp-jg-flash .7s ease forwards}',
      '.hkmp-jg-boom.go[data-kind="lose"] .hkmp-jg-boom-flash{background:radial-gradient(circle,#222c,#000d);animation:hkmp-jg-flash 1.3s ease forwards}',
      '.hkmp-jg-boom-shock{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px;border-radius:50%;border:10px solid #fff;opacity:0}',
      '.hkmp-jg-boom.go .hkmp-jg-boom-shock{animation:hkmp-jg-shock .95s cubic-bezier(.1,.7,.2,1) forwards}',
      '.hkmp-jg-boom.go[data-kind="check"] .hkmp-jg-boom-shock,.hkmp-jg-boom.go[data-kind="mate"] .hkmp-jg-boom-shock{border-color:#ffe566;border-width:14px}',
      '.hkmp-jg-boom-txt{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%) scale(.12) rotate(-16deg);font-size:clamp(56px,18vw,128px);font-weight:900;color:#fff;font-family:"Noto Serif KR",Batang,Impact,serif;letter-spacing:-.06em;text-shadow:0 0 10px #000,8px 10px 0 #7a0000,-5px -4px 0 #ff0,0 20px 48px #000;opacity:0;white-space:nowrap}',
      '.hkmp-jg-boom.go .hkmp-jg-boom-txt{animation:hkmp-jg-slam 1.2s cubic-bezier(.15,1.45,.3,1) forwards}',
      '.hkmp-jg-bits{position:absolute;inset:0;overflow:hidden}',
      '.hkmp-jg-bit{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px;border-radius:2px;background:#ffe566;opacity:0}',
      '.hkmp-jg-boom.go .hkmp-jg-bit{animation:hkmp-jg-bit 1.15s ease-out forwards}',
      '.hk-mp-overlay.jg-quake{animation:hkmp-jg-quake .75s ease}.hk-mp-overlay.jg-quake2{animation:hkmp-jg-quake2 .55s ease}',
      '.hkmp-ended.jg-end.win{background:radial-gradient(circle at 50% 30%,#ffe566,#c41e3a 62%,#5a1810);animation:hkmp-jg-winbg 1.2s ease}',
      '.hkmp-ended.jg-end.lose{background:radial-gradient(circle at 50% 30%,#6a6a6a,#2a1512 62%,#120808)}',
      '.hkmp-ended.jg-end h2{font-size:clamp(48px,14vw,92px)!important;margin:8px 0 12px;font-family:"Noto Serif KR",Batang,Impact,serif;text-shadow:0 6px 0 #0006,0 0 24px #fff8}',
      '@keyframes hkmp-jg-flash{0%{opacity:0}10%{opacity:1}22%{opacity:.9}100%{opacity:0}}',
      '@keyframes hkmp-jg-shock{0%{transform:scale(.12);opacity:1;border-width:18px}100%{transform:scale(24);opacity:0;border-width:0}}',
      '@keyframes hkmp-jg-slam{0%{transform:translate(-50%,-50%) scale(.12) rotate(-28deg);opacity:0}18%{transform:translate(-50%,-50%) scale(1.45) rotate(10deg);opacity:1}36%{transform:translate(-50%,-50%) scale(.88) rotate(-6deg);opacity:1}58%{transform:translate(-50%,-50%) scale(1.14) rotate(3deg);opacity:1}100%{transform:translate(-50%,-50%) scale(1.04) rotate(-2deg);opacity:0}}',
      '@keyframes hkmp-jg-bit{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(280deg) scale(.12);opacity:0}}',
      '@keyframes hkmp-jg-quake{0%,100%{transform:none}8%{transform:translate(-26px,14px) rotate(-3.4deg)}16%{transform:translate(28px,-12px) rotate(3.8deg)}26%{transform:translate(-20px,-16px) rotate(-2.6deg)}36%{transform:translate(22px,12px) rotate(2.8deg)}50%{transform:translate(-12px,8px)}66%{transform:translate(10px,-6px)}100%{transform:none}}',
      '@keyframes hkmp-jg-quake2{0%,100%{transform:none}12%{transform:translate(14px,-8px) rotate(2deg)}28%{transform:translate(-16px,10px) rotate(-2.2deg)}48%{transform:translate(10px,6px)}70%{transform:translate(-6px,-4px)}100%{transform:none}}',
      '@keyframes hkmp-jg-boardslam{0%{transform:scale(1)}16%{transform:scale(1.045) rotate(-.7deg)}38%{transform:scale(.975)}100%{transform:scale(1)}}',
      '@keyframes hkmp-jg-burst{0%{box-shadow:0 0 0 0 #ffe566cc,0 0 0 0 #c41e3a99;opacity:1}100%{box-shadow:0 0 0 46px #ffe56600,0 0 0 72px #c41e3a00;opacity:0}}',
      '@keyframes hkmp-jg-kingpulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.45)}}',
      '@keyframes hkmp-jg-bannerpop{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}30%{transform:translate(-50%,-50%) scale(1.12);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}',
      '@keyframes hkmp-jg-land{0%{transform:scale(1.4) rotate(-8deg)}100%{transform:scale(1) rotate(0)}}',
      '@keyframes hkmp-jg-winbg{0%{filter:brightness(3) saturate(2)}100%{filter:none}}',
      '.hkmp-yut-layout{display:flex;flex-wrap:nowrap;flex-direction:row;gap:14px;justify-content:center;align-items:stretch}.hkmp-yut{position:relative;width:min(100%,420px);aspect-ratio:1;margin:0;background:radial-gradient(circle at 50% 42%,#8b3a28,#4a1812 62%,#2a0e0c);border-radius:18px;border:4px solid #cbb27088;box-shadow:inset 0 0 40px #0005,0 8px 22px #0006;overflow:hidden}.hkmp-yut-path{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.hkmp-yut-node{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#ead18f;border:2px solid #5a3a1a;box-shadow:inset 0 1px 0 #fff6,0 2px 4px #0005;z-index:1}.hkmp-yut-node.corner{width:34px;height:34px;margin:-17px 0 0 -17px;background:#f3e0b0;border-width:3px}.hkmp-mal{position:absolute;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:2px solid #fff;z-index:3;box-shadow:0 2px 6px #0007;transition:left .48s cubic-bezier(.2,.8,.2,1),top .48s cubic-bezier(.2,.8,.2,1),transform .2s ease;display:grid;place-items:center;font-size:16px;font-weight:900;color:#1a1208;line-height:1;-webkit-user-select:none;user-select:none}.hkmp-mal.home{opacity:.55;transform:scale(.82)}.hkmp-mal.wait{box-shadow:0 0 0 2px #fff4}.hkmp-yut-side{width:136px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px 10px;background:linear-gradient(180deg,#2a1612,#1a0c0a);border-radius:16px;border:1px solid #cbb27055;min-height:220px;box-sizing:border-box}.hkmp-yut-sticks{display:flex;gap:8px;align-items:flex-end;height:110px}.hkmp-stick{width:20px;height:92px;border-radius:8px;background:#e8c47a;border:1px solid #6b4a22;box-shadow:1px 2px 4px #0006;transform-origin:center bottom;position:relative}.hkmp-stick i{display:block;width:8px;height:8px;margin:14px auto 0;border-radius:50%;background:transparent}.hkmp-stick.face{background:linear-gradient(90deg,#5a3418,#2a160c);border-color:#1a0c08}.hkmp-stick.back{background:linear-gradient(90deg,#f6e4b8,#d4b06a)}.hkmp-stick.back i{background:#8b1a1a;box-shadow:0 28px 0 #8b1a1a,0 56px 0 #8b1a1a}.hkmp-stick.toss{animation:hkmp-stick-toss .72s ease}.hkmp-yut-yname{color:#efd28a;font-weight:800;font-size:20px;min-height:28px}.hkmp-yut-fx{position:absolute;inset:0;display:grid;place-items:center;font-size:clamp(34px,8vw,56px);font-weight:900;color:#fff;text-shadow:0 0 16px #c00,0 4px 0 #800,0 8px 24px #000;z-index:8;pointer-events:none;opacity:0}.hkmp-yut-fx.show{animation:hkmp-catch-pop .9s ease forwards}.hkmp-board-wrap.shake .hkmp-yut{animation:hkmp-board-shake .5s ease}@keyframes hkmp-stick-toss{0%{transform:translateY(0) rotate(0)}20%{transform:translateY(-46px) rotate(160deg)}45%{transform:translateY(-8px) rotate(320deg)}70%{transform:translateY(-28px) rotate(520deg)}100%{transform:translateY(0) rotate(720deg)}}@keyframes hkmp-catch-pop{0%{transform:scale(.35);opacity:0}22%{transform:scale(1.18);opacity:1}70%{transform:scale(1);opacity:1}100%{transform:scale(1.08);opacity:0}}@keyframes hkmp-board-shake{0%,100%{transform:translateX(0)}18%{transform:translateX(-11px) rotate(-1.6deg)}36%{transform:translateX(11px) rotate(1.6deg)}54%{transform:translateX(-8px)}72%{transform:translateX(8px)}88%{transform:translateX(-3px)}}@media(max-width:560px){.hkmp-yut-side{width:100%;flex-direction:row;flex-wrap:wrap;min-height:0;padding:10px}.hkmp-stick{height:70px;width:16px}.hkmp-yut-sticks{height:80px}}',
      '.hkmp-toast{position:fixed;left:50%;bottom:28px;z-index:10003;transform:translate(-50%,25px);opacity:0;background:#ead18f;color:#122421;padding:12px 18px;border-radius:999px;font-weight:800;box-shadow:0 10px 35px #0008;transition:.25s;pointer-events:none}.hkmp-toast.show{transform:translate(-50%,0);opacity:1}',
      '@media(max-width:560px){.hkmp-shell{width:calc(100% - 16px);padding-top:12px}.hkmp-panel{padding:14px}}'
    ].join('') + yutSkinCss();
    document.head.appendChild(style);
    root = el('div', 'hk-mp-overlay');
    root.innerHTML =
      '<div class="hkmp-shell">' +
      '<header class="hkmp-top"><button type="button" class="hkmp-btn hkmp-back">← 닫기</button><h1></h1></header>' +
      '<div class="hkmp-panel hkmp-body"></div></div><div class="hkmp-toast" role="status"></div>';
    document.body.appendChild(root);
    refs.body = root.querySelector('.hkmp-body');
    refs.title = root.querySelector('.hkmp-top h1');
    refs.toast = root.querySelector('.hkmp-toast');
    root.querySelector('.hkmp-back').addEventListener('click', onBack);
    document.addEventListener('keydown', onGlobalKey);
  }

  function onGlobalKey(e) {
    if (!root || !root.classList.contains('open')) return;
    if (isTypingTarget(e.target)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'p' || e.key === 'P' || e.code === 'KeyP')) {
      if (view === 'play') {
        e.preventDefault();
        e.stopPropagation();
        togglePause();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (gamePaused) { setGamePaused(false); return; }
      onBack();
    }
  }
  function onBack() {
    if (view === 'play' || view === 'room' || view === 'ended') {
      send({ type: 'leave' });
      room = null; lastState = null; endedInfo = null;
      stopInput();
      view = 'browse';
      render();
      requestList();
      return;
    }
    closeOverlay();
  }

  function hideBehindOrders() {
    if (!root || !root.classList.contains('open')) return;
    if (view === 'play') setGamePaused(true);
    stashedBehindOrders = true;
    root.classList.remove('open');
  }
  function resumeFromOrders() {
    inject();
    stashedBehindOrders = false;
    root.classList.add('open');
    if (view === 'play' && gamePaused) toast('일시정지된 게임 · P로 계속 · 로컬');
  }
  function isOverlayOpen() {
    return !!(root && root.classList.contains('open'));
  }
  function closeOverlay() {
    stashedBehindOrders = false;
    pendingCreate = false;
    if (createWatchTimer) clearTimeout(createWatchTimer);
    stopInput();
    stopList();
    // Keep the socket warm so room create/list feels instant next time
    if (view === 'play' || view === 'room') {
      send({ type: 'leave' });
    }
    room = null; lastState = null; endedInfo = null; gameId = ''; view = 'browse';
    lastBrowseSig = '';
    setGamePaused(false);
    if (root) root.classList.remove('open');
    scheduleIdleDisconnect();
  }

  function clearIdleDisconnect() {
    if (idleCloseTimer) { clearTimeout(idleCloseTimer); idleCloseTimer = 0; }
  }
  function scheduleIdleDisconnect() {
    clearIdleDisconnect();
    // Keep warm longer so lobby reopen / create stays instant
    idleCloseTimer = setTimeout(function () {
      idleCloseTimer = 0;
      if (root && root.classList.contains('open')) return;
      if (stashedBehindOrders && (view === 'play' || view === 'room')) return;
      if (room) return;
      disconnect(true);
    }, 600000);
  }

  function openLobby(id) {
    if (!META[id]) { toast('알 수 없는 멀티 게임'); return; }
    inject();
    var launch = function () {
      clearIdleDisconnect();
      gameId = id;
      room = null; lastState = null; endedInfo = null; view = 'browse';
      selectIds = []; pendingBuild = null;
      lastBrowseSig = '';
      lastBrowseRooms = [];
      refs.title.textContent = meta(id).icon + ' ' + meta(id).name;
      root.classList.add('open');
      render();
      // Warm path: already open → watch immediately (watch also returns lobby list)
      if (ws && ws.readyState === 1) {
        send({ type: 'watch', game: gameId });
        startList();
        return;
      }
      ensureConnected(function () {
        send({ type: 'watch', game: gameId });
        startList();
      });
    };
    if (name()) launch();
    else if (config.requireOperator) config.requireOperator(launch);
    else toast('근무자 이름을 먼저 선택해주세요');
  }

  function flushConnectWaiters() {
    var list = connectWaiters.splice(0, connectWaiters.length);
    for (var i = 0; i < list.length; i++) {
      try { list[i](); } catch (err) { if (window.console) console.error(err); }
    }
  }
  function clearConnectWaiters(reason) {
    connectWaiters = [];
    if (reason) toast(reason);
  }
  function ensureConnected(cb) {
    if (typeof cb === 'function') connectWaiters.push(cb);
    if (ws && ws.readyState === 1) {
      flushConnectWaiters();
      return;
    }
    if (connecting || (ws && ws.readyState === 0)) return;
    openSocket();
  }
  function openSocket() {
    intentionalClose = false;
    connecting = true;
    reconnecting = !!ws;
    helloOkWait = false;
    if (ws) {
      try { ws.onclose = null; ws.onerror = null; ws.onopen = null; ws.onmessage = null; ws.close(); } catch (_) {}
      ws = null;
    }
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(proto + '//' + location.host + '/hk-game-ws');
    } catch (err) {
      connecting = false;
      clearConnectWaiters('멀티플레이 연결 실패');
      if (window.console) console.error(err);
      return;
    }
    ws.onopen = function () {
      connecting = false;
      reconnecting = false;
      connectRetry = 0;
      // Don't block create/list on hello round-trip
      send({ type: 'hello', name: name() || 'Guest' });
      flushConnectWaiters();
      startPing();
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleMessage(msg);
    };
    ws.onerror = function () {};
    ws.onclose = function () {
      var wasIntentional = intentionalClose;
      connecting = false;
      ws = null;
      stopPing();
      stopInput();
      if (wasIntentional) {
        connectWaiters = [];
        return;
      }
      if (connectWaiters.length && connectRetry < 3) {
        connectRetry += 1;
        toast('재연결 중… (' + connectRetry + '/3)');
        setTimeout(function () {
          if (!intentionalClose) openSocket();
        }, 180 * connectRetry);
        return;
      }
      if (connectWaiters.length) {
        clearConnectWaiters(reconnecting ? '재연결 실패' : '멀티플레이 연결 오류');
        pendingCreate = false;
      } else if (!intentionalClose && root && root.classList.contains('open')) {
        toast('서버 연결이 끊어졌습니다 — 재연결 중…');
        connectRetry = 0;
        setTimeout(function () { if (!intentionalClose) openSocket(); }, 400);
      }
    };
  }
  var pingTimer = 0;
  function startPing() {
    stopPing();
    pingTimer = setInterval(function () {
      if (!ws || ws.readyState !== 1) return;
      send({ type: 'ping', t: Date.now() });
    }, 20000);
  }
  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = 0; }
  }
  function disconnect(quiet) {
    intentionalClose = true;
    connecting = false;
    connectWaiters = [];
    stopPing();
    if (!ws) return;
    try { ws.onclose = null; ws.onerror = null; ws.onopen = null; ws.onmessage = null; ws.close(); } catch (_) {}
    ws = null;
    if (!quiet) { /* noop */ }
  }
  function send(msg) {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(msg)); return true; } catch (_) { return false; }
  }
  function requestCreateRoom() {
    if (pendingCreate) { toast('방 생성 요청 중입니다…'); return; }
    pendingCreate = true;
    if (createWatchTimer) clearTimeout(createWatchTimer);
    // Optimistic waiting UI — feels instant
    var maxGuess = MAX_PLAYERS[gameId] || 2;
    if (gameId === 'tank') maxGuess = tankCreateMode === 'solo' ? 2 : (tankCreateMode === 'team' ? 4 : 4);
    if (gameId === 'rts') maxGuess = (RTS_MODE_META[rtsCreateMode] && RTS_MODE_META[rtsCreateMode].max) || 2;
    if (gameId === 'memorymp') maxGuess = (MEMORY_MODE_META[memoryCreateMode] && MEMORY_MODE_META[memoryCreateMode].max) || 2;
    if (gameId === 'lanepush') maxGuess = (SHARED_MODE_META[laneCreateMode] && SHARED_MODE_META[laneCreateMode].max) || 2;
    if (gameId === 'nexuswar') maxGuess = (SHARED_MODE_META[nexusCreateMode] && SHARED_MODE_META[nexusCreateMode].max) || 2;
    if (isBoard()) maxGuess = (BOARD_MODE_META[boardCreateMode] && BOARD_MODE_META[boardCreateMode].max) || 2;
    if (gameId === 'ageofwar' || gameId === 'airhockey') maxGuess = 2;
    if (gameId === 'snakes') maxGuess = snakesCreateMode === 'solo' ? 4 : 8;
    room = {
      code: '····',
      game: gameId,
      mode: gameId === 'tank' ? tankCreateMode
        : (gameId === 'rts' ? rtsCreateMode
        : (gameId === 'memorymp' ? memoryCreateMode
        : (gameId === 'lanepush' ? laneCreateMode
        : (gameId === 'nexuswar' ? nexusCreateMode
        : (gameId === 'ageofwar' ? aowCreateMode
        : (gameId === 'snakes' ? snakesCreateMode
        : (gameId === 'airhockey' ? hockeyCreateMode
        : (isBoard() ? boardCreateMode : null)))))))),
      aiDiff: gameId === 'rts' && rtsCreateMode === 'solo' ? rtsCreateAiDiff : null,
      pairs: gameId === 'memorymp' ? memoryPairs : null,
      status: 'lobby',
      players: [{ id: selfId || 'me', name: name() || 'Guest', ready: false, slot: 0 }],
      max: maxGuess,
      _pending: true
    };
    view = 'room';
    render();
    toast('방 생성 중…');

    function doCreate() {
      var payload = { type: 'create', game: gameId, name: name() || 'Guest' };
      if (gameId === 'tank') payload.mode = tankCreateMode;
      if (gameId === 'rts') {
        payload.mode = rtsCreateMode;
        if (rtsCreateMode === 'solo') payload.aiDiff = rtsCreateAiDiff;
      }
      if (gameId === 'lanepush') payload.mode = laneCreateMode;
      if (gameId === 'nexuswar') payload.mode = nexusCreateMode;
      if (gameId === 'ageofwar') payload.mode = aowCreateMode === 'solo' ? 'solo' : null;
      if (gameId === 'snakes') payload.mode = snakesCreateMode === 'solo' ? 'solo' : null;
      if (gameId === 'airhockey') payload.mode = hockeyCreateMode === 'solo' ? 'solo' : null;
      if (gameId === 'memorymp') {
        payload.mode = memoryCreateMode;
        payload.pairs = memoryPairs;
      }
      if (isBoard()) payload.mode = boardCreateMode;
      var ok = send(payload);
      if (!ok) {
        pendingCreate = false;
        room = null; view = 'browse'; render();
        toast('방 생성 전송 실패 — 다시 눌러주세요');
        return;
      }
      createWatchTimer = setTimeout(function () {
        if (!pendingCreate) return;
        if (view === 'room' && room && room.code && room.code !== '····') { pendingCreate = false; return; }
        pendingCreate = false;
        room = null; view = 'browse'; render();
        toast('방 생성 응답이 없습니다. 다시 시도해주세요');
      }, 5000);
    }
    if (ws && ws.readyState === 1) doCreate();
    else ensureConnected(doCreate);
  }
  function requestJoinRoom(code) {
    ensureConnected(function () {
      var ok = send({ type: 'join', code: code, name: name() || 'Guest' });
      if (!ok) {
        toast('참가 전송 실패 — 다시 눌러주세요');
        return;
      }
      toast('방에 참가 중…');
    });
  }

  function handleMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'hello_ok') {
      if (msg.playerId != null) selfId = msg.playerId;
      else if (msg.id != null) selfId = msg.id;
      else if (msg.selfId != null) selfId = msg.selfId;
      return;
    }
    if (msg.type === 'pong' || msg.type === 'ping') return;
    if (msg.type === 'error') {
      toast(translateErr(msg.message || msg.error) || '오류가 발생했습니다');
      if (pendingCreate) {
        pendingCreate = false;
        if (room && room._pending) { room = null; view = 'browse'; render(); }
      }
      return;
    }
    if (msg.type === 'lobby_list') {
      if (msg.game && msg.game !== gameId) return;
      if (view !== 'browse') return;
      updateBrowseList(msg.rooms || []);
      return;
    }
    if (msg.type === 'room') {
      if (msg.status === 'left' || msg.code == null) {
        room = null; lastState = null; endedInfo = null; stopInput();
        pendingCreate = false;
        view = 'browse'; render(); requestList();
        return;
      }
      room = {
        code: msg.code,
        game: msg.game || gameId,
        mode: msg.mode || null,
        aiDiff: msg.aiDiff || null,
        pairs: msg.pairs != null ? msg.pairs : null,
        status: msg.status,
        players: msg.players || [],
        max: msg.max
      };
      if (msg.playerId != null) selfId = msg.playerId;
      if (pendingCreate) {
        pendingCreate = false;
        if (createWatchTimer) clearTimeout(createWatchTimer);
        toast('방이 만들어졌습니다');
      }
      if (room.status === 'playing') {
        endedInfo = null;
        view = 'play';
        if (!lastState) lastState = null;
        startInput();
      } else if (room.status === 'ended') {
        if (msg.ended) {
          endedInfo = Object.assign({}, endedInfo || { type: 'ended' }, msg.ended);
        }
        view = 'ended';
        stopInput();
      } else {
        endedInfo = null;
        view = 'room';
        stopInput();
        lastState = null;
      }
      render();
      return;
    }
    if (msg.type === 'state') {
      lastState = msg.state || msg;
      if (msg.selfId) selfId = msg.selfId;
      if (view !== 'play') { view = 'play'; startInput(); renderPlay(); }
      else {
        if (gameId === 'memorymp') {
          updateMemoryBoard();
          updateHud();
        } else if (isBoard()) {
          updateBoardUi();
          updateHud();
        } else {
          if (lastState && (lastState.W || lastState.H)) {
            canvasW = lastState.W || canvasW;
            canvasH = lastState.H || canvasH;
          }
          drawFrame();
          updateHud();
        }
      }
      return;
    }
    if (msg.type === 'ended') {
      endedInfo = msg;
      if (msg.state) lastState = msg.state;
      if (!endedInfo.ranks && lastState && lastState.ranks) endedInfo.ranks = lastState.ranks;
      view = 'ended';
      stopInput();
      if (room) room.status = 'ended';
      render();
      return;
    }
  }

  function translateErr(code) {
    var map = {
      room_not_found: '방을 찾을 수 없습니다',
      room_not_joinable: '참가할 수 없는 방입니다',
      room_full: '방이 가득 찼습니다',
      not_in_room: '방에 들어와 있지 않습니다',
      unknown_game: '알 수 없는 게임',
      not_ended: '아직 종료되지 않았습니다',
      nexus: '상대 본진을 파괴했습니다',
      base: '상대 기지를 파괴했습니다',
      opponent_left: '상대가 나갔습니다',
      match: '경기 종료',
      last_alive: '최후의 생존자',
      time: '시간 종료 · 길이/점수 우승',
      life: '라이프 전멸',
      score: '목표 점수 달성',
      five: '5목 완성',
      checkmate: '체크메이트',
      king: '왕을 잡았습니다',
      han: '한!',
      bikjang: '빅장 · 무승부',
      bankrupt: '파산',
      yut: '윷놀이 골인',
      draw: '무승부',
    };
    return map[code] || code;
  }

  function roomsSig(rooms) {
    try {
      return JSON.stringify((rooms || []).map(function (r) {
        return [r.code || r.roomCode, r.players, r.max, r.mode, r.pairs, r.host, r.names];
      }));
    } catch (_) { return String(Date.now()); }
  }
  function requestList() {
    if (!gameId) return;
    send({ type: 'list', game: gameId });
  }
  function startList() {
    stopList();
    // push is primary; slow poll only as safety net
    listTimer = setInterval(function () {
      if (view === 'browse' && ws && ws.readyState === 1) requestList();
    }, 5000);
  }
  function stopList() {
    if (listTimer) clearInterval(listTimer);
    listTimer = 0;
  }
  function browseListHtml(rooms, max) {
    if (!rooms.length) {
      return '<div class="hkmp-note">아직 열린 방이 없습니다. 위에서 방을 만들어 주세요.</div>';
    }
    return rooms.map(function (r) {
      var code = r.code || r.roomCode || '';
      var cnt = typeof r.players === 'number' ? r.players : (r.count != null ? r.count : (r.players && r.players.length) || r.n || 0);
      var roomMax = r.max || max;
      var names = Array.isArray(r.names) ? r.names.filter(Boolean).join(', ') : '';
      var host = (r.host && String(r.host)) || names || ('대기방');
      var full = cnt >= roomMax;
      var modeTag = '';
      if (gameId === 'tank' && r.mode) {
        modeTag = ' · ' + (r.mode === 'team' ? '팀전' : (r.mode === 'solo' ? '싱글' : 'FFA'));
      }
      if (gameId === 'rts' && r.mode) modeTag = ' · ' + ((RTS_MODE_META[r.mode] && RTS_MODE_META[r.mode].label) || r.mode);
      if ((gameId === 'lanepush' || gameId === 'nexuswar') && r.mode) modeTag = ' · ' + ((SHARED_MODE_META[r.mode] && SHARED_MODE_META[r.mode].label) || r.mode);
      if (gameId === 'memorymp') {
        modeTag = ' · ' + ((MEMORY_MODE_META[r.mode] && MEMORY_MODE_META[r.mode].label) || r.mode || '1:1');
        if (r.pairs) modeTag += ' · ' + r.pairs + '쌍';
      }
      if (isBoard() && r.mode) modeTag = ' · ' + ((BOARD_MODE_META[r.mode] && BOARD_MODE_META[r.mode].label) || r.mode);
      return '<button type="button" class="hkmp-room" data-join="' + esc(code) + '"' + (full ? ' disabled' : '') + '>' +
        '<b>' + esc(host) + '</b>' +
        '<span>' + cnt + '/' + roomMax + modeTag + (full ? ' · 가득 참' : ' · 클릭해서 참가') + '</span>' +
        (full ? '' : '<span class="hkmp-join-hint">참가</span>') +
        '</button>';
    }).join('');
  }
  function bindBrowseListClicks(listEl) {
    if (!listEl) return;
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-join]'), function (btn) {
      btn.onclick = function () {
        if (btn.disabled) return;
        requestJoinRoom(btn.getAttribute('data-join'));
      };
    });
  }
  function updateBrowseList(rooms) {
    if (view !== 'browse') return;
    var sig = roomsSig(rooms);
    if (sig === lastBrowseSig) return;
    lastBrowseSig = sig;
    lastBrowseRooms = rooms || [];
    var list = refs.body && refs.body.querySelector('[data-list]');
    if (!list) {
      renderBrowse(rooms);
      return;
    }
    var max = MAX_PLAYERS[gameId] || 2;
    if (gameId === 'rts') max = (RTS_MODE_META[rtsCreateMode] || RTS_MODE_META['1v1']).max;
    if (gameId === 'memorymp') max = (MEMORY_MODE_META[memoryCreateMode] || MEMORY_MODE_META['1v1']).max;
    if (gameId === 'lanepush') max = (SHARED_MODE_META[laneCreateMode] || SHARED_MODE_META['1v1']).max;
    if (gameId === 'nexuswar') max = (SHARED_MODE_META[nexusCreateMode] || SHARED_MODE_META['1v1']).max;
    if (isBoard()) {
      if (gameId !== 'yut' && (boardCreateMode === 'ffa3' || boardCreateMode === 'ffa4')) boardCreateMode = '1v1';
      max = (BOARD_MODE_META[boardCreateMode] || BOARD_MODE_META['1v1']).max;
    }
    list.innerHTML = browseListHtml(lastBrowseRooms, max);
    bindBrowseListClicks(list);
  }

  function startInput() {
    stopInput();
    tankCam = { x: null, y: null, free: false };
    bindPlayKeys(true);
    if (gameId === 'memorymp' || isBoard()) return;
    // Air hockey uses RAF smooth for prediction — avoid a second 60fps input timer
    if (gameId === 'airhockey') {
      startHockeySmooth();
      inputTimer = setInterval(tickInput, 50);
    } else if (gameId === 'lanepush') {
      inputTimer = setInterval(tickInput, 16);
    } else {
      inputTimer = setInterval(tickInput, 40);
    }
    if (gameId === 'rts') startRtsAnim();
  }
  function stopInput() {
    if (inputTimer) clearInterval(inputTimer);
    inputTimer = 0;
    bindPlayKeys(false);
    keys = {};
    fireLatch = false;
    stopHockeySmooth();
    stopMemoryWave();
    stopRtsAnim();
  }
  function stopRtsAnim() {
    if (rtsRaf) {
      try { cancelAnimationFrame(rtsRaf); } catch (_) {}
      rtsRaf = 0;
    }
  }
  function startRtsAnim() {
    stopRtsAnim();
    function frame() {
      if (gameId !== 'rts' || view !== 'play' || !root || !root.classList.contains('open')) {
        rtsRaf = 0;
        return;
      }
      if (!gamePaused && lastState) drawFrame();
      rtsRaf = requestAnimationFrame(frame);
    }
    rtsRaf = requestAnimationFrame(frame);
  }

  function stopHockeySmooth() {
    if (hockeyRaf) {
      try { cancelAnimationFrame(hockeyRaf); } catch (_) {}
      hockeyRaf = 0;
    }
    hockeySmooth = null;
  }
  function startHockeySmooth() {
    stopHockeySmooth();
    hockeySmooth = null;
    hockeyLastScore = '';
    var lastT = 0;
    function frame(t) {
      if (gameId !== 'airhockey' || view !== 'play' || !root || !root.classList.contains('open')) {
        hockeyRaf = 0;
        return;
      }
      var dt = Math.min(0.033, ((t - (lastT || t)) / 1000) || 0.016);
      lastT = t;
      var st = lastState;
      if (st && st.puck) {
        var scoreKey = (st.score || []).join(':');
        if (!hockeySmooth || scoreKey !== hockeyLastScore) {
          hockeySmooth = {
            x: st.puck.x,
            y: st.puck.y,
            vx: st.puck.vx || 0,
            vy: st.puck.vy || 0
          };
          hockeyLastScore = scoreKey;
        } else {
          var jump = Math.hypot(st.puck.x - hockeySmooth.x, st.puck.y - hockeySmooth.y);
          if (jump > 90) {
            hockeySmooth.x = st.puck.x;
            hockeySmooth.y = st.puck.y;
          } else {
            hockeySmooth.vx = st.puck.vx || 0;
            hockeySmooth.vy = st.puck.vy || 0;
            hockeySmooth.x += hockeySmooth.vx * dt;
            hockeySmooth.y += hockeySmooth.vy * dt;
            hockeySmooth.x += (st.puck.x - hockeySmooth.x) * 0.28;
            hockeySmooth.y += (st.puck.y - hockeySmooth.y) * 0.28;
          }
        }
      }
      drawFrame();
      hockeyRaf = requestAnimationFrame(frame);
    }
    hockeyRaf = requestAnimationFrame(frame);
  }

  var playBound = false;
  function bindPlayKeys(on) {
    if (on === playBound) return;
    playBound = on;
    if (on) {
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);
    } else {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    }
  }
  function onKeyDown(e) {
    if (view !== 'play' || gamePaused) return;
    if (e.key === 'p' || e.key === 'P' || e.code === 'KeyP') return;
    keys[e.key.toLowerCase()] = true;
    if (gameId === 'tank' && (e.key === ' ' || e.code === 'Space')) { e.preventDefault(); keys.fire = true; }
    if (gameId === 'rts' && e.key >= '1' && e.key <= '6') {
      var map = { '1': 'worker', '2': 'melee', '3': 'ranged', '4': 'bomber', '5': 'tanker', '6': 'duck' };
      send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'train', unitType: map[e.key] } });
      toast(map[e.key] + ' 대기열에 추가');
      pendingBuild = null;
      renderToolbarHighlight();
    }
    if (gameId === 'lanepush') {
      var lk = e.key.toLowerCase();
      if (lk === 'q' || lk === 'w' || lk === 'e' || lk === 'r') {
        e.preventDefault();
        laneCmd.skill = lk;
      }
      if (e.key >= '1' && e.key <= '5') {
        var cid = LP_CHAMP_META[Number(e.key) - 1];
        if (cid) { laneCmd.pick = cid.id; toast(cid.name + ' 선택'); }
      }
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
  }
  function onKeyUp(e) {
    keys[e.key.toLowerCase()] = false;
    if (e.key === ' ' || e.code === 'Space') keys.fire = false;
  }

  function tickInput() {
    if (gamePaused || view !== 'play' || !ws || ws.readyState !== 1) return;
    var payload = buildInput();
    if (payload) send({ type: 'input', payload: payload });
    if (gameId === 'tank') {
      keys.fire = false;
      fireLatch = false;
      // Dead: local free-cam still needs redraw between server ticks
      if (lastState) {
        var meTk = findMeTank(lastState);
        if (!meTk || !meTk.alive || meTk.eliminated) {
          getTankCamera(lastState, 0.033);
          drawFrame();
        }
      }
    }
  }

  function getTankCamera(st, dt) {
    var viewW = 900, viewH = 600;
    var worldW = st.W || 2800, worldH = st.H || 2000;
    var me = findMeTank(st);
    var step = typeof dt === 'number' ? dt : 0.033;
    var spd = 420;
    if (me && me.alive) {
      tankCam.free = false;
      tankCam.x = me.x - viewW / 2;
      tankCam.y = me.y - viewH / 2;
    } else {
      if (!tankCam.free) {
        tankCam.free = true;
        if (me) {
          tankCam.x = me.x - viewW / 2;
          tankCam.y = me.y - viewH / 2;
        } else if (tankCam.x == null || tankCam.y == null) {
          tankCam.x = worldW / 2 - viewW / 2;
          tankCam.y = worldH / 2 - viewH / 2;
        }
      }
      var dx = 0, dy = 0;
      if (keys.w || keys.arrowup) dy -= 1;
      if (keys.s || keys.arrowdown) dy += 1;
      if (keys.a || keys.arrowleft) dx -= 1;
      if (keys.d || keys.arrowright) dx += 1;
      if (dx || dy) {
        var len = Math.hypot(dx, dy) || 1;
        tankCam.x += (dx / len) * spd * step;
        tankCam.y += (dy / len) * spd * step;
      }
    }
    if (tankCam.x == null) tankCam.x = 0;
    if (tankCam.y == null) tankCam.y = 0;
    tankCam.x = Math.max(0, Math.min(Math.max(0, worldW - viewW), tankCam.x));
    tankCam.y = Math.max(0, Math.min(Math.max(0, worldH - viewH), tankCam.y));
    return { camX: tankCam.x, camY: tankCam.y, viewW: viewW, viewH: viewH, worldW: worldW, worldH: worldH };
  }

  function canvasToWorld(cv, clientX, clientY) {
    var r = cv.getBoundingClientRect();
    var sx = ((clientX - r.left) / r.width) * canvasW;
    var sy = ((clientY - r.top) / r.height) * canvasH;
    if (gameId === 'tank' && lastState) {
      var cam = getTankCamera(lastState, 0);
      var scale = Math.min(canvasW / cam.viewW, canvasH / cam.viewH) || 1;
      var ox = (canvasW - cam.viewW * scale) / 2;
      var oy = (canvasH - cam.viewH * scale) / 2;
      return { x: (sx - ox) / scale + cam.camX, y: (sy - oy) / scale + cam.camY };
    }
    return { x: sx, y: sy };
  }

  function buildInput() {
    if (gameId === 'tank') {
      var aim = 0;
      var me = lastState ? findMeTank(lastState) : null;
      var dead = !!(me && (!me.alive || me.eliminated));
      if (me && me.alive) {
        aim = Math.atan2(mouse.ay - me.y, mouse.ax - me.x);
        mouse.tx = me.x; mouse.ty = me.y;
      } else {
        var cam = lastState ? getTankCamera(lastState, 0) : null;
        var cx = cam ? cam.camX + cam.viewW / 2 : canvasW / 2;
        var cy = cam ? cam.camY + cam.viewH / 2 : canvasH / 2;
        aim = Math.atan2(mouse.ay - cy, mouse.ax - cx);
      }
      return {
        up: dead ? false : !!(keys.w || keys.arrowup),
        down: dead ? false : !!(keys.s || keys.arrowdown),
        left: dead ? false : !!(keys.a || keys.arrowleft),
        right: dead ? false : !!(keys.d || keys.arrowright),
        aim: aim,
        fire: dead ? false : !!(keys.fire || mouse.down || fireLatch)
      };
    }
    if (gameId === 'snakes') {
      var dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      var dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
      if (dx && dy) dy = 0;
      if (dx || dy) lastSnakeDir = { dirX: dx, dirY: dy };
      return { dirX: lastSnakeDir.dirX, dirY: lastSnakeDir.dirY, dx: lastSnakeDir.dirX, dy: lastSnakeDir.dirY };
    }
    if (gameId === 'airhockey') {
      return { x: mouse.ax, y: mouse.ay };
    }
    if (gameId === 'lanepush') {
      var out = {
        aimX: mouse.ax,
        aimY: mouse.ay,
        moveX: laneCmd.moveX,
        moveY: laneCmd.moveY,
        skill: laneCmd.skill,
        pick: laneCmd.pick,
        buy: laneCmd.buy,
        level: laneCmd.level
      };
      laneCmd.moveX = null; laneCmd.moveY = null;
      laneCmd.skill = null; laneCmd.pick = null;
      laneCmd.buy = null; laneCmd.level = null;
      return out;
    }
    // rts / ageofwar / nexuswar: event-driven only
    return null;
  }

  function findMeTank(st) {
    var tanks = st.tanks || [];
    for (var i = 0; i < tanks.length; i++) {
      if (tanks[i].id === selfId || tanks[i].playerId === selfId || tanks[i].slot === mySlot()) return tanks[i];
    }
    return tanks[mySlot()] || null;
  }
  function mySlot() {
    if (!room || !room.players) return 0;
    for (var i = 0; i < room.players.length; i++) {
      if (room.players[i].id === selfId) return room.players[i].slot != null ? room.players[i].slot : i;
    }
    return 0;
  }
  function myPlayer() {
    if (!room || !room.players) return null;
    for (var i = 0; i < room.players.length; i++) if (room.players[i].id === selfId) return room.players[i];
    return null;
  }

  function render() {
    if (!refs.body) return;
    if (view === 'browse') { renderBrowse(); return; }
    if (view === 'room') { renderRoom(); return; }
    if (view === 'ended') { renderEnded(); return; }
    if (view === 'play') { renderPlay(); return; }
  }

  function renderBrowse(rooms) {
    if (view !== 'browse') return;
    if (rooms) {
      lastBrowseSig = roomsSig(rooms);
      lastBrowseRooms = rooms;
    } else {
      rooms = lastBrowseRooms || [];
    }
    var m = meta(gameId);
    var max = MAX_PLAYERS[gameId] || 2;
    if (gameId === 'rts') max = (RTS_MODE_META[rtsCreateMode] || RTS_MODE_META['1v1']).max;
    if (gameId === 'memorymp') max = (MEMORY_MODE_META[memoryCreateMode] || MEMORY_MODE_META['1v1']).max;
    if (gameId === 'lanepush') max = (SHARED_MODE_META[laneCreateMode] || SHARED_MODE_META['1v1']).max;
    if (gameId === 'nexuswar') max = (SHARED_MODE_META[nexusCreateMode] || SHARED_MODE_META['1v1']).max;
    if (isBoard()) {
      if (gameId !== 'yut' && (boardCreateMode === 'ffa3' || boardCreateMode === 'ffa4')) boardCreateMode = '1v1';
      max = (BOARD_MODE_META[boardCreateMode] || BOARD_MODE_META['1v1']).max;
    }
    var modeRow = '';
    if (gameId === 'tank') {
      modeRow = '<div class="hkmp-row" style="margin:0">' +
        '<button type="button" class="hkmp-btn' + (tankCreateMode === 'solo' ? ' primary' : '') + '" data-mode="solo">싱글 vs AI</button>' +
        '<button type="button" class="hkmp-btn' + (tankCreateMode === 'ffa' ? ' primary' : '') + '" data-mode="ffa">자유대전 FFA</button>' +
        '<button type="button" class="hkmp-btn' + (tankCreateMode === 'team' ? ' primary' : '') + '" data-mode="team">2vs2 팀전</button>' +
        '<span class="hkmp-note">싱글 Ready 1명 · 팀전 3명이면 AI</span></div>';
    }
    if (gameId === 'ageofwar' || gameId === 'snakes' || gameId === 'airhockey') {
      var sm = gameId === 'ageofwar' ? aowCreateMode : (gameId === 'snakes' ? snakesCreateMode : hockeyCreateMode);
      modeRow = '<div class="hkmp-row" style="margin:0">' +
        '<button type="button" class="hkmp-btn' + (sm === 'solo' ? ' primary' : '') + '" data-simple-mode="solo">싱글 vs AI</button>' +
        '<button type="button" class="hkmp-btn' + (sm === 'versus' ? ' primary' : '') + '" data-simple-mode="versus">멀티</button>' +
        '<span class="hkmp-note">싱글은 Ready 한 명으로 시작 · AI 자동</span></div>';
    }
    if (gameId === 'rts') {
      modeRow = '<div class="hkmp-row" style="margin:0">' +
        [['solo', '싱글 vs AI'], ['1v1', '1:1'], ['ffa3', '1:1:1'], ['ffa4', '1:1:1:1'], ['2v2', '2:2']].map(function (mm) {
          return '<button type="button" class="hkmp-btn' + (rtsCreateMode === mm[0] ? ' primary' : '') + '" data-rts-mode="' + mm[0] + '">' + mm[1] + '</button>';
        }).join('') +
        '<span class="hkmp-note">싱글은 Ready 한 명으로 시작 · AI 자동</span></div>';
      if (rtsCreateMode === 'solo') {
        modeRow += '<div class="hkmp-row" style="margin:0">' +
          [['easy', '초보'], ['medium', '중급'], ['hard', '고수'], ['elite', '초고수']].map(function (dd) {
            return '<button type="button" class="hkmp-btn' + (rtsCreateAiDiff === dd[0] ? ' primary' : '') + '" data-rts-diff="' + dd[0] + '">AI ' + dd[1] + '</button>';
          }).join('') +
          '<span class="hkmp-note">AI 난이도</span></div>';
      }
    }
    if (gameId === 'memorymp') {
      modeRow = '<div class="hkmp-row" style="margin:0">' +
        [['solo', '싱글 vs AI'], ['1v1', '1:1'], ['ffa3', '1:1:1'], ['2v2', '2:2']].map(function (mm) {
          return '<button type="button" class="hkmp-btn' + (memoryCreateMode === mm[0] ? ' primary' : '') + '" data-mem-mode="' + mm[0] + '">' + mm[1] + '</button>';
        }).join('') +
        '<span class="hkmp-note">싱글 Ready 1명 · 2:2는 팀원이 1장씩</span></div>' +
        '<div class="hkmp-row" style="margin:0">' +
        MEMORY_SIZE_META.map(function (sz) {
          return '<button type="button" class="hkmp-btn' + (memoryPairs === sz.pairs ? ' primary' : '') + '" data-mem-pairs="' + sz.pairs + '">' + sz.label + '</button>';
        }).join('') + '</div>';
    }
    if (gameId === 'lanepush' || gameId === 'nexuswar') {
      var curMode = gameId === 'lanepush' ? laneCreateMode : nexusCreateMode;
      modeRow = '<div class="hkmp-row" style="margin:0">' +
        [['solo', '싱글 vs AI'], ['1v1', '1:1'], ['ffa3', '1:1:1'], ['2v2', '2:2']].map(function (mm) {
          return '<button type="button" class="hkmp-btn' + (curMode === mm[0] ? ' primary' : '') + '" data-shared-mode="' + mm[0] + '">' + mm[1] + '</button>';
        }).join('') +
        '<span class="hkmp-note">' + (gameId === 'lanepush' ? '싱글은 Ready 한 명 · AI 자동' : '싱글은 Ready 한 명 · AI 자동') + '</span></div>';
    }
    if (isBoard()) {
      var boardModes = [['solo', '1:AI'], ['1v1', '1:1'], ['2v2', '2:2']];
      if (gameId === 'yut') boardModes = [['solo', '1:AI'], ['1v1', '2팀'], ['ffa3', '3팀'], ['ffa4', '4팀'], ['2v2', '2:2']];
      modeRow = '<div class="hkmp-row" style="margin:0">' +
        boardModes.map(function (mm) {
          return '<button type="button" class="hkmp-btn' + (boardCreateMode === mm[0] ? ' primary' : '') + '" data-board-mode="' + mm[0] + '">' + mm[1] + '</button>';
        }).join('') +
        '<span class="hkmp-note">' + (gameId === 'yut' ? '팀마다 말 4개 · 3·4팀은 각자 대전 · 2:2는 팀전' : '1:AI는 Ready 한 명 · 2:2는 2명 이상이면 AI 합류') + '</span></div>';
    }
    var creating = pendingCreate;
    var connected = !!(ws && ws.readyState === 1);
    refs.body.innerHTML =
      '<div class="hkmp-create-wrap">' + modeRow +
      '<button type="button" class="hkmp-btn primary" data-act="create" style="align-self:flex-start;font-size:15px;padding:12px 18px"' +
      (creating ? ' disabled' : '') + '>' + (creating ? '방 생성 중…' : '방 만들기') + '</button>' +
      '<div class="hkmp-note">' + esc(m.desc) + ' · 최대 ' + max + '명 · ' +
      (connected ? '<span style="color:#9ae6b4">연결됨</span>' : '<span style="color:#f6ad55">연결 중…</span>') +
      ' · 아래 방을 눌러 참가</div></div>' +
      '<h3 style="margin:8px 0 10px;color:#ecd18b;font-family:Georgia,serif">대기 중인 방</h3>' +
      '<div class="hkmp-list" data-list>' + browseListHtml(rooms, max) + '</div>';
    bindBrowseListClicks(refs.body.querySelector('[data-list]'));
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-mode]'), function (btn) {
      btn.onclick = function () {
        var m = btn.getAttribute('data-mode');
        tankCreateMode = m === 'team' ? 'team' : (m === 'solo' ? 'solo' : 'ffa');
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-simple-mode]'), function (btn) {
      btn.onclick = function () {
        var m = btn.getAttribute('data-simple-mode') === 'solo' ? 'solo' : 'versus';
        if (gameId === 'ageofwar') aowCreateMode = m;
        if (gameId === 'snakes') snakesCreateMode = m;
        if (gameId === 'airhockey') hockeyCreateMode = m;
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-rts-mode]'), function (btn) {
      btn.onclick = function () {
        var rm = btn.getAttribute('data-rts-mode');
        if (RTS_MODE_META[rm]) rtsCreateMode = rm;
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-rts-diff]'), function (btn) {
      btn.onclick = function () {
        var dd = btn.getAttribute('data-rts-diff');
        if (RTS_AI_DIFF_META[dd]) rtsCreateAiDiff = dd;
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-mem-mode]'), function (btn) {
      btn.onclick = function () {
        var mm = btn.getAttribute('data-mem-mode');
        if (MEMORY_MODE_META[mm]) memoryCreateMode = mm;
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-mem-pairs]'), function (btn) {
      btn.onclick = function () {
        var pp = Number(btn.getAttribute('data-mem-pairs'));
        if (pp) memoryPairs = pp;
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-shared-mode]'), function (btn) {
      btn.onclick = function () {
        var sm = btn.getAttribute('data-shared-mode');
        if (!SHARED_MODE_META[sm]) return;
        if (gameId === 'lanepush') laneCreateMode = sm;
        if (gameId === 'nexuswar') nexusCreateMode = sm;
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-board-mode]'), function (btn) {
      btn.onclick = function () {
        var bm = btn.getAttribute('data-board-mode');
        if (!BOARD_MODE_META[bm]) return;
        boardCreateMode = bm;
        lastBrowseSig = '';
        renderBrowse();
      };
    });
    refs.body.querySelector('[data-act="create"]').onclick = function () {
      if (pendingCreate) { toast('방 생성 요청 중입니다…'); return; }
      requestCreateRoom();
    };
  }

  function renderRoom() {
    if (!room) { view = 'browse'; render(); return; }
      var players = room.players || [];
    var me = myPlayer();
    var minNeed = (gameId === 'snakes' || gameId === 'tank') ? 2 : (room.max || MAX_PLAYERS[gameId] || 2);
    if (gameId === 'rts') minNeed = room.max || ((RTS_MODE_META[room.mode] && RTS_MODE_META[room.mode].max) || 2);
    if (gameId === 'memorymp') minNeed = room.max || ((MEMORY_MODE_META[room.mode] && MEMORY_MODE_META[room.mode].max) || 2);
    if (gameId === 'lanepush' || gameId === 'nexuswar') minNeed = room.max || ((SHARED_MODE_META[room.mode] && SHARED_MODE_META[room.mode].max) || 2);
    if (isBoard()) minNeed = room.max || ((BOARD_MODE_META[room.mode] && BOARD_MODE_META[room.mode].max) || 2);
    if (gameId === 'ageofwar' || gameId === 'airhockey') minNeed = 2;
    var soloMode = room.mode === 'solo';
    if (soloMode) minNeed = 1;
    var maxP = room.max || MAX_PLAYERS[gameId] || 2;
    var pendingRoom = !!room._pending;
    var humans = players.filter(function (p) { return !p.isAi; });
    var humansReady = humans.length && humans.every(function (p) { return p.ready; });
    var allReady = !pendingRoom && (
      soloMode
        ? (humans.length >= 1 && humansReady)
        : (players.length >= minNeed && players.every(function (p) { return p.ready || p.isAi; }))
    );
    var rtsLabel = (gameId === 'rts' && room.mode && RTS_MODE_META[room.mode]) ? RTS_MODE_META[room.mode].label : '';
    if ((gameId === 'lanepush' || gameId === 'nexuswar') && room.mode && SHARED_MODE_META[room.mode]) {
      rtsLabel = SHARED_MODE_META[room.mode].label;
    }
    if (isBoard() && room.mode && BOARD_MODE_META[room.mode]) rtsLabel = BOARD_MODE_META[room.mode].label;
    if (soloMode && gameId === 'rts') {
      var curDiff = room.aiDiff || 'medium';
      var diffLabel = (RTS_AI_DIFF_META[curDiff] && RTS_AI_DIFF_META[curDiff].label) || '중급';
      rtsLabel = (rtsLabel || '싱글 vs AI') + ' · AI ' + diffLabel;
    }
    if (gameId === 'tank' && room.mode === 'solo') rtsLabel = '싱글 vs AI';
    if (gameId === 'tank' && room.mode === 'team') rtsLabel = '팀전';
    if (gameId === 'tank' && room.mode === 'ffa') rtsLabel = 'FFA';
    var memLabel = '';
    if (gameId === 'memorymp') {
      memLabel = ((MEMORY_MODE_META[room.mode] && MEMORY_MODE_META[room.mode].label) || room.mode || '1:1');
      if (room.pairs) memLabel += ' · ' + room.pairs + '쌍';
    }
    refs.body.innerHTML =
      '<div class="hkmp-row"><span class="hkmp-pill">' + (pendingRoom ? '방 생성 중…' : ('대기실 · ' + humans.length + '/' + (soloMode ? 1 : maxP) + '명')) + (rtsLabel ? ' · ' + rtsLabel : '') + (memLabel ? ' · ' + memLabel : '') + '</span>' +
      '<button type="button" class="hkmp-btn" data-act="leave"' + (pendingRoom ? ' disabled' : '') + '>나가기</button></div>' +
      '<div class="hkmp-players">' + players.map(function (p, i) {
        var ready = !!p.ready || !!p.isAi;
        var isMe = p.id === selfId || p.id === 'me';
        var teamTag = '';
        if (gameId === 'rts' && room.mode === '2v2') teamTag = ' · 팀' + ((p.slot != null ? p.slot : i) < 2 ? 'A' : 'B');
        if ((gameId === 'lanepush' || gameId === 'nexuswar' || gameId === 'memorymp' || isBoard()) && room.mode === '2v2') teamTag = ' · 팀' + ((p.slot != null ? p.slot : i) < 2 ? 'A' : 'B');
        if (gameId === 'yut' && room.mode !== '2v2') {
          var ytSlot = p.slot != null ? p.slot : i;
          teamTag = ' · ' + yutTeamName(room.mode === 'ffa3' || room.mode === 'ffa4' ? ytSlot : (ytSlot % 2)) + '팀';
        }
        if (gameId === 'memorymp' && room.mode === '2v2' && !teamTag) teamTag = ' · 팀' + ((p.slot != null ? p.slot : i) < 2 ? 'A' : 'B');
        return '<div class="hkmp-player' + (isMe ? ' me' : '') + '"><span class="hkmp-dot' + (ready ? ' on' : '') + '"></span>' +
          '<strong>' + esc(p.name || ('P' + (i + 1))) + (p.isAi ? ' ·AI' : '') + '</strong>' +
          '<span style="flex:1;color:#88a09a;font-size:12px">' + (pendingRoom ? '생성 중' : (p.isAi ? 'Ready' : (ready ? 'Ready' : '대기'))) + teamTag + (isMe ? ' · 나' : '') + '</span></div>';
      }).join('') + '</div>' +
      (soloMode && gameId === 'rts' && !pendingRoom
        ? ('<div class="hkmp-row" style="margin:0 0 8px">' +
          [['easy', '초보'], ['medium', '중급'], ['hard', '고수'], ['elite', '초고수']].map(function (dd) {
            return '<button type="button" class="hkmp-btn' + ((room.aiDiff || 'medium') === dd[0] ? ' primary' : '') + '" data-room-rts-diff="' + dd[0] + '">AI ' + dd[1] + '</button>';
          }).join('') + '</div>')
        : '') +
      '<div class="hkmp-row">' +
      '<button type="button" class="hkmp-btn primary" data-act="ready"' + (pendingRoom || (me && me.ready) ? ' disabled' : '') + '>Ready</button>' +
      '</div>' +
      '<div class="hkmp-note">' +
        (pendingRoom ? '서버 응답을 기다리는 중…' :
        ((gameId === 'tank' && room.mode ? ((rtsLabel || '탱크') + ' · ') : '') +
        (gameId === 'rts' ? ((rtsLabel || 'RTS') + (soloMode ? ' · AI 대전 · ' : ' · 본진·일꾼 자동 배치 · ')) : '') +
        (gameId === 'ageofwar' ? ((soloMode ? '싱글 vs AI' : '전쟁시대') + ' · ') : '') +
        (gameId === 'snakes' ? ((soloMode ? '싱글 vs AI' : '스네이크') + ' · ') : '') +
        (gameId === 'airhockey' ? ((soloMode ? '싱글 vs AI' : '에어하키') + ' · ') : '') +
        (gameId === 'lanepush' ? ((rtsLabel || '레인푸시') + (soloMode ? ' · AI 대전 · ' : ' · 챔피언 픽 후 라인전 · ')) : '') +
        (gameId === 'nexuswar' ? ((rtsLabel || '점령전') + (soloMode ? ' · AI 대전 · ' : ' · 거점 드래그 · ')) : '') +
        (gameId === 'memorymp' ? ((memLabel || '메모리') + (soloMode ? ' · AI 대전 · ' : (room.mode === '2v2' ? ' · 팀원 각 1장씩 · ' : ' · '))) : '') +
        (isBoard() ? ((rtsLabel || meta(gameId).name) + (soloMode ? ' · AI 대전 · ' : (room.mode === '2v2' ? ' · 팀전 · ' : ' · '))) : '') +
        (allReady ? '모두 준비됨 — 곧 시작합니다' :
        (soloMode ? 'Ready하면 AI와 바로 시작' :
        (humans.length < minNeed ? '대기 중… (' + humans.length + '명, ' + minNeed + '명 필요)' : '모두 Ready하면 자동 시작'))) +
        (gameId === 'tank' && room.mode === 'team' ? ' · 3명이면 AI 합류' : ''))) + '</div>';
    var leaveBtn = refs.body.querySelector('[data-act="leave"]');
    var readyBtn = refs.body.querySelector('[data-act="ready"]');
    if (!pendingRoom && leaveBtn) {
      leaveBtn.onclick = function () {
        send({ type: 'leave' });
        room = null; view = 'browse'; render();
        if (ws && ws.readyState === 1) send({ type: 'watch', game: gameId });
      };
    }
    if (!pendingRoom && readyBtn) {
      readyBtn.onclick = function () { send({ type: 'ready' }); };
    }
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-room-rts-diff]'), function (btn) {
      btn.onclick = function () {
        var dd = btn.getAttribute('data-room-rts-diff');
        if (!RTS_AI_DIFF_META[dd]) return;
        send({ type: 'rts_ai_diff', aiDiff: dd });
        room.aiDiff = dd;
        renderRoom();
      };
    });
  }

  function renderPlay() {
    memoryBoardSig = '';
    boardSig = '';
    boardSel = null;
    if (gameId === 'memorymp') {
      renderPlayMemory();
      return;
    }
    if (isBoard()) {
      renderPlayBoard();
      return;
    }
    canvasW = (lastState && (lastState.W || lastState.w || lastState.width)) || defaultSize().w;
    canvasH = (lastState && (lastState.H || lastState.h || lastState.height)) || defaultSize().h;
    setGamePaused(false);
    if (gameId === 'snakes') lastSnakeDir = { dirX: 1, dirY: 0 };
    refs.body.innerHTML =
      '<div class="hkmp-hud" data-hud></div>' +
      (gameId === 'rts' || gameId === 'ageofwar' || gameId === 'lanepush' || gameId === 'nexuswar' ? '<div class="hkmp-toolbar" data-tools></div>' : '') +
      '<div class="hkmp-stage"><canvas width="' + canvasW + '" height="' + canvasH + '"></canvas>' +
      '<div class="hkmp-pause" aria-hidden="true"><div class="hkmp-pause-box"><strong>일시정지</strong><span>P 키로 계속 · Ctrl+Q 오더 화면</span></div></div></div>' +
      '<div class="hkmp-note" data-help></div>';
    refs.hud = refs.body.querySelector('[data-hud]');
    refs.canvas = refs.body.querySelector('canvas');
    refs.pause = refs.body.querySelector('.hkmp-pause');
    refs.help = refs.body.querySelector('[data-help]');
    refs.tools = refs.body.querySelector('[data-tools]');
    refs.help.textContent = helpText();
    if (refs.tools) buildToolbar();
    bindCanvas(refs.canvas);
    updateHud();
    drawFrame();
  }

  function renderPlayMemory() {
    setGamePaused(false);
    if (memoryWaveRaf) {
      try { cancelAnimationFrame(memoryWaveRaf); } catch (_) {}
      memoryWaveRaf = 0;
    }
    memoryWaveKey = '';
    memoryBoardSig = '';
    refs.body.innerHTML =
      '<div class="hkmp-hud" data-hud></div>' +
      '<div class="hkmp-memory-wrap"><div class="hkmp-memory" data-mem-grid></div></div>' +
      '<div class="hkmp-pause" aria-hidden="true"><div class="hkmp-pause-box"><strong>일시정지</strong><span>P 키로 계속 · Ctrl+Q 오더 화면</span></div></div>' +
      '<div class="hkmp-note" data-help></div>';
    refs.hud = refs.body.querySelector('[data-hud]');
    refs.memGrid = refs.body.querySelector('[data-mem-grid]');
    refs.pause = refs.body.querySelector('.hkmp-pause');
    refs.help = refs.body.querySelector('[data-help]');
    refs.canvas = null;
    refs.help.textContent = helpText();
    updateMemoryBoard();
    updateHud();
  }

  function stopMemoryWave() {
    if (memoryWaveRaf) {
      try { cancelAnimationFrame(memoryWaveRaf); } catch (_) {}
      memoryWaveRaf = 0;
    }
    if (refs.memGrid) refs.memGrid.classList.remove('wave');
  }

  function paintMemoryWaveLocal(icons, openFlags) {
    if (!refs.memGrid) return;
    var nodes = refs.memGrid.querySelectorAll('[data-i]');
    for (var i = 0; i < nodes.length; i++) {
      var on = !!openFlags[i];
      nodes[i].classList.toggle('open', on);
      nodes[i].classList.remove('mine');
      nodes[i].disabled = true;
      nodes[i].textContent = '';
      if (on && icons[i]) {
        nodes[i].innerHTML = '<span class="hkmp-memory-face">' + icons[i] + '</span>';
      }
    }
  }

  function ensureMemoryWave(st) {
    if (!refs.memGrid || !st) return false;
    var now = Date.now();
    if (!(st.previewEnds && now < st.previewEnds)) {
      if (memoryWaveRaf) stopMemoryWave();
      return false;
    }
    var cards = st.cards || [];
    var cols = st.cols || 6;
    var key = String(st.previewStart) + ':' + cards.length + ':' + cols;
    if (memoryWaveKey === key && memoryWaveRaf) return true;
    memoryWaveKey = key;
    memoryBoardSig = 'wave:' + key;
    stopMemoryWave();
    refs.memGrid.classList.add('wave');
    refs.memGrid.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
    refs.memGrid.style.gridTemplateRows = 'repeat(' + (st.rows || Math.ceil(cards.length / cols) || 6) + ',minmax(0,1fr))';
    var icons = cards.map(function (c) { return c.icon || ''; });
    refs.memGrid.innerHTML = cards.map(function (c, i) {
      return '<button type="button" class="hkmp-memory-card" data-i="' + i + '" disabled></button>';
    }).join('');
    var step = st.previewStep || 22;
    var hold = st.previewHold || 90;
    var start = st.previewStart || now;
    function tick() {
      if (!refs.memGrid || gameId !== 'memorymp') { memoryWaveRaf = 0; return; }
      var elapsed = Date.now() - start;
      var flags = [];
      for (var i = 0; i < cards.length; i++) {
        var openAt = i * step;
        flags[i] = elapsed >= openAt && elapsed < openAt + hold;
      }
      paintMemoryWaveLocal(icons, flags);
      if (Date.now() < (st.previewEnds || 0)) {
        memoryWaveRaf = requestAnimationFrame(tick);
      } else {
        memoryWaveRaf = 0;
        if (refs.memGrid) refs.memGrid.classList.remove('wave');
        memoryBoardSig = '';
        updateMemoryBoard();
        updateHud();
      }
    }
    memoryWaveRaf = requestAnimationFrame(tick);
    return true;
  }

  function updateMemoryBoard() {
    if (gameId !== 'memorymp' || !refs.memGrid) return;
    var st = lastState || {};
    if (ensureMemoryWave(st)) return;
    var cards = st.cards || [];
    var cols = st.cols || 6;
    var previewing = !!(st.previewing || (st.previewEnds && st.previewEnds > Date.now()));
    var myTurn = !previewing && st.currentPickerId != null && (st.currentPickerId === selfId || st.currentPickerId == selfId);
    var locked = previewing || !!(st.lockUntil && st.lockUntil > Date.now());
    var sig = cols + '|' + cards.map(function (c) {
      return (c.done ? 'd' : (c.open ? 'o' : 'c')) + (c.icon || '') + (c.wave ? 'w' : '');
    }).join('') + '|' + st.currentPickerId + '|' + (locked ? 'L' : '');
    if (sig === memoryBoardSig && refs.memGrid.children.length === cards.length) {
      Array.prototype.forEach.call(refs.memGrid.querySelectorAll('[data-i]'), function (btn) {
        btn.classList.toggle('mine', myTurn && !locked && !btn.classList.contains('done') && !btn.classList.contains('open'));
        btn.disabled = locked || !myTurn || btn.classList.contains('done') || btn.classList.contains('open');
      });
      return;
    }
    memoryBoardSig = sig;
    refs.memGrid.classList.toggle('wave', previewing);
    refs.memGrid.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
    refs.memGrid.style.gridTemplateRows = 'repeat(' + (st.rows || Math.ceil(cards.length / cols) || 6) + ',minmax(0,1fr))';
    refs.memGrid.innerHTML = cards.map(function (c, i) {
      var show = c.open || c.done;
      var cls = 'hkmp-memory-card' + (c.open ? ' open' : '') + (c.done ? ' done' : '') + (myTurn && !locked && !c.open && !c.done ? ' mine' : '');
      var dis = locked || !myTurn || c.open || c.done;
      return '<button type="button" class="' + cls + '" data-i="' + i + '"' + (dis ? ' disabled' : '') + '>' + (show && c.icon ? '<span class="hkmp-memory-face">' + c.icon + '</span>' : '') + '</button>';
    }).join('');
    Array.prototype.forEach.call(refs.memGrid.querySelectorAll('[data-i]'), function (btn) {
      btn.onclick = function () {
        if (btn.disabled) return;
        var i = Number(btn.getAttribute('data-i'));
        send({ type: 'input', payload: { flip: i } });
      };
    });
  }

  var CHESS_U = { '0K': '♔', '0Q': '♕', '0R': '♖', '0B': '♗', '0N': '♘', '0P': '♙', '1K': '♚', '1Q': '♛', '1R': '♜', '1B': '♝', '1N': '♞', '1P': '♟' };
  var JANGGI_U = { K: ['楚', '漢'], R: '車', N: '馬', B: '象', A: '士', C: '包', P: ['卒', '兵'] };

  function renderPlayBoard() {
    setGamePaused(false);
    boardSel = null;
    boardSig = '';
    yutThrowSeen = '';
    yutPrevMals = null;
    yutAnimReady = false;
    yutSel = null;
    yutThrowI = 0;
    yutFxSeen = 0;
    jgFxSeen = 0;
    jgMoveSeen = '';
    refs.body.innerHTML =
      '<div class="hkmp-hud" data-hud></div>' +
      '<div class="hkmp-board-wrap" data-board></div>' +
      '<div class="hkmp-row" data-board-act style="justify-content:center;margin-top:10px"></div>' +
      '<div class="hkmp-pause" aria-hidden="true"><div class="hkmp-pause-box"><strong>일시정지</strong><span>P 키로 계속 · Ctrl+Q 오더 화면</span></div></div>' +
      '<div class="hkmp-note" data-help></div>';
    refs.hud = refs.body.querySelector('[data-hud]');
    refs.board = refs.body.querySelector('[data-board]');
    refs.boardAct = refs.body.querySelector('[data-board-act]');
    refs.pause = refs.body.querySelector('.hkmp-pause');
    refs.help = refs.body.querySelector('[data-help]');
    refs.canvas = null;
    refs.help.textContent = helpText();
    updateBoardUi();
    updateHud();
  }

  function boardMyTurn(st) {
    return !!(st && st.turnId != null && (st.turnId === selfId || st.turnId == selfId));
  }

  function pieceGlyph(p, kind) {
    if (!p) return '';
    if (kind === 'chess') return CHESS_U[p.s + p.t] || p.t;
    if (kind === 'janggi') {
      if (p.t === 'K' || p.t === 'P') return (JANGGI_U[p.t] || [])[p.s] || p.t;
      return JANGGI_U[p.t] || p.t;
    }
    return '';
  }

  function boardMySide() {
    if (room && room.mode === '2v2') return mySlot() < 2 ? 0 : 1;
    if (room && (room.mode === 'ffa3' || room.mode === 'ffa4')) return mySlot();
    return mySlot() % 2;
  }
  function yutTeamName(t) {
    return YUT_TEAM_NAMES[t] || ('팀' + ((t | 0) + 1));
  }
  function yutTeamColor(t) {
    return YUT_TEAM_COL[t] || '#efd28a';
  }

  function cloneBoard(b) {
    return (b || []).map(function (row) {
      return (row || []).map(function (c) { return c ? { t: c.t, s: c.s } : 0; });
    });
  }

  var CHESS_N = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
  var CHESS_K = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function chessIn(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function chessSlide(board, r, c, side, dirs, out) {
    dirs.forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      while (chessIn(rr, cc)) {
        var x = board[rr][cc];
        if (!x) out.push([rr, cc]);
        else { if (x.s !== side) out.push([rr, cc]); break; }
        rr += d[0]; cc += d[1];
      }
    });
  }
  function chessPseudo(board, r, c, p, forAttack) {
    var out = [], s = p.s;
    if (p.t === 'P') {
      var dir = s === 0 ? -1 : 1, start = s === 0 ? 6 : 1;
      if (!forAttack) {
        if (chessIn(r + dir, c) && !board[r + dir][c]) {
          out.push([r + dir, c]);
          if (r === start && chessIn(r + dir * 2, c) && !board[r + dir * 2][c]) out.push([r + dir * 2, c]);
        }
      }
      [-1, 1].forEach(function (dc) {
        var rr = r + dir, cc = c + dc;
        if (!chessIn(rr, cc)) return;
        if (forAttack || (board[rr][cc] && board[rr][cc].s !== s)) out.push([rr, cc]);
      });
    } else if (p.t === 'N') {
      CHESS_N.forEach(function (d) {
        var rr = r + d[0], cc = c + d[1];
        if (!chessIn(rr, cc)) return;
        var x = board[rr][cc];
        if (!x || x.s !== s) out.push([rr, cc]);
      });
    } else if (p.t === 'B') chessSlide(board, r, c, s, CHESS_K.filter(function (d) { return d[0] && d[1]; }), out);
    else if (p.t === 'R') chessSlide(board, r, c, s, CHESS_K.filter(function (d) { return !d[0] || !d[1]; }), out);
    else if (p.t === 'Q') chessSlide(board, r, c, s, CHESS_K, out);
    else if (p.t === 'K') {
      CHESS_K.forEach(function (d) {
        var rr = r + d[0], cc = c + d[1];
        if (!chessIn(rr, cc)) return;
        var x = board[rr][cc];
        if (!x || x.s !== s) out.push([rr, cc]);
      });
    }
    return out;
  }
  function chessFindKing(board, side) {
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = board[r][c];
      if (p && p.t === 'K' && p.s === side) return [r, c];
    }
    return null;
  }
  function chessSquareAttacked(board, tr, tc, bySide) {
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = board[r][c];
      if (!p || p.s !== bySide) continue;
      var moves = chessPseudo(board, r, c, p, true);
      for (var i = 0; i < moves.length; i++) if (moves[i][0] === tr && moves[i][1] === tc) return true;
    }
    return false;
  }
  function chessCastleOk(board, side, kingSide, flags) {
    flags = flags || {};
    var row = side === 0 ? 7 : 0;
    if (chessSquareAttacked(board, row, 4, 1 - side)) return false;
    if (kingSide) {
      if (flags[side === 0 ? 'wK' : 'bK']) return false;
      if (board[row][5] || board[row][6]) return false;
      if (chessSquareAttacked(board, row, 5, 1 - side) || chessSquareAttacked(board, row, 6, 1 - side)) return false;
      var rook = board[row][7];
      return rook && rook.t === 'R' && rook.s === side;
    }
    if (flags[side === 0 ? 'wQ' : 'bQ']) return false;
    if (board[row][1] || board[row][2] || board[row][3]) return false;
    if (chessSquareAttacked(board, row, 3, 1 - side) || chessSquareAttacked(board, row, 2, 1 - side)) return false;
    var rookQ = board[row][0];
    return rookQ && rookQ.t === 'R' && rookQ.s === side;
  }
  function chessLegal(board, r, c, nr, nc, flags) {
    var p = board[r][c];
    if (!p) return false;
    var dests = chessPseudo(board, r, c, p, false);
    if (p.t === 'K' && r === (p.s === 0 ? 7 : 0) && c === 4 && Math.abs(nc - c) === 2 && nr === r) {
      return chessCastleOk(board, p.s, nc > c, flags);
    }
    if (!dests.some(function (m) { return m[0] === nr && m[1] === nc; })) return false;
    var next = cloneBoard(board);
    next[nr][nc] = p;
    next[r][c] = 0;
    if (p.t === 'P' && (nr === 0 || nr === 7)) next[nr][nc] = { t: 'Q', s: p.s };
    var k = chessFindKing(next, p.s);
    if (!k) return false;
    return !chessSquareAttacked(next, k[0], k[1], 1 - p.s);
  }
  function chessDests(board, r, c, flags) {
    var p = board[r] && board[r][c];
    if (!p) return [];
    var dests = chessPseudo(board, r, c, p, false);
    if (p.t === 'K') dests.push([r, c + 2], [r, c - 2]);
    var out = [];
    dests.forEach(function (m) {
      if (chessIn(m[0], m[1]) && chessLegal(board, r, c, m[0], m[1], flags || {})) out.push(m);
    });
    return out;
  }

  function jgIn(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }
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
      [[7, 5], [8, 4], [9, 3]]
    ];
  }
  function janggiPalaceDiagStep(r, c, nr, nc) {
    if (Math.abs(nr - r) !== 1 || Math.abs(nc - c) !== 1) return false;
    if (!janggiInPalace(r, c) || !janggiInPalace(nr, nc)) return false;
    return janggiPalaceDiags().some(function (line) {
      var i = -1, j = -1, k;
      for (k = 0; k < line.length; k++) {
        if (line[k][0] === r && line[k][1] === c) i = k;
        if (line[k][0] === nr && line[k][1] === nc) j = k;
      }
      return i >= 0 && j >= 0;
    });
  }
  function janggiPseudo(board, r, c, p) {
    var out = [], s = p.s;
    function push(rr, cc) {
      if (!jgIn(rr, cc)) return;
      var x = board[rr][cc];
      if (!x || x.s !== s) out.push([rr, cc]);
    }
    function slideLine(points, cannon) {
      var idx = -1, k;
      for (k = 0; k < points.length; k++) {
        if (points[k][0] === r && points[k][1] === c) idx = k;
      }
      if (idx < 0) return;
      [-1, 1].forEach(function (dir) {
        var jumped = false, p;
        for (p = idx + dir; p >= 0 && p < points.length; p += dir) {
          var rr = points[p][0], cc = points[p][1], x = board[rr][cc];
          if (!cannon) {
            if (!x) out.push([rr, cc]);
            else { if (x.s !== s) out.push([rr, cc]); break; }
          } else if (!jumped) {
            if (x) { if (x.t === 'C') break; jumped = true; }
          } else {
            if (!x) out.push([rr, cc]);
            else { if (x.t !== 'C' && x.s !== s) out.push([rr, cc]); break; }
          }
        }
      });
    }
    if (p.t === 'R') {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var rr = r + d[0], cc = c + d[1];
        while (jgIn(rr, cc)) {
          var x = board[rr][cc];
          if (!x) out.push([rr, cc]);
          else { if (x.s !== s) out.push([rr, cc]); break; }
          rr += d[0]; cc += d[1];
        }
      });
      janggiPalaceDiags().forEach(function (line) { slideLine(line, false); });
    } else if (p.t === 'C') {
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var rr = r + d[0], cc = c + d[1], jumped = false;
        while (jgIn(rr, cc)) {
          var x = board[rr][cc];
          if (!jumped) {
            if (x) { if (x.t === 'C') break; jumped = true; }
          } else {
            if (!x) out.push([rr, cc]);
            else { if (x.t !== 'C' && x.s !== s) out.push([rr, cc]); break; }
          }
          rr += d[0]; cc += d[1];
        }
      });
      janggiPalaceDiags().forEach(function (line) { slideLine(line, true); });
    } else if (p.t === 'N') {
      [[1, 0, 2, 1], [1, 0, 2, -1], [-1, 0, -2, 1], [-1, 0, -2, -1], [0, 1, 1, 2], [0, 1, -1, 2], [0, -1, 1, -2], [0, -1, -1, -2]].forEach(function (leg) {
        if (!jgIn(r + leg[0], c + leg[1]) || board[r + leg[0]][c + leg[1]]) return;
        push(r + leg[2], c + leg[3]);
      });
    } else if (p.t === 'B') {
      [[1, 0, 2, 1, 3, 2], [1, 0, 2, -1, 3, -2], [-1, 0, -2, 1, -3, 2], [-1, 0, -2, -1, -3, -2], [0, 1, 1, 2, 2, 3], [0, 1, -1, 2, -2, 3], [0, -1, 1, -2, 2, -3], [0, -1, -1, -2, -2, -3]].forEach(function (leg) {
        if (!jgIn(r + leg[0], c + leg[1]) || board[r + leg[0]][c + leg[1]]) return;
        if (!jgIn(r + leg[2], c + leg[3]) || board[r + leg[2]][c + leg[3]]) return;
        push(r + leg[4], c + leg[5]);
      });
    } else if (p.t === 'A' || p.t === 'K') {
      [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (d) {
        var rr = r + d[0], cc = c + d[1];
        if (!janggiPalace(rr, cc, s) && !(p.t === 'K' && janggiInPalace(rr, cc) && janggiPalace(r, c, s))) return;
        if (!janggiInPalace(rr, cc)) return;
        if (d[0] !== 0 && d[1] !== 0 && !janggiPalaceDiagStep(r, c, rr, cc)) return;
        push(rr, cc);
      });
    } else if (p.t === 'P') {
      var fwd = s === 0 ? -1 : 1;
      push(r + fwd, c);
      push(r, c - 1);
      push(r, c + 1);
      [-1, 1].forEach(function (dc) {
        if (janggiPalaceDiagStep(r, c, r + fwd, c + dc)) push(r + fwd, c + dc);
      });
    }
    return out;
  }
  function janggiFindKing(board, side) {
    for (var r = 0; r < 10; r++) for (var c = 0; c < 9; c++) {
      var p = board[r][c];
      if (p && p.t === 'K' && p.s === side) return [r, c];
    }
    return null;
  }
  function janggiInCheck(board, side) {
    var king = janggiFindKing(board, side);
    if (!king) return true;
    var opp = 1 - side, r, c, p;
    for (r = 0; r < 10; r++) for (c = 0; c < 9; c++) {
      p = board[r][c];
      if (!p || p.s !== opp) continue;
      if (janggiPseudo(board, r, c, p).some(function (m) { return m[0] === king[0] && m[1] === king[1]; })) return true;
    }
    return false;
  }
  function janggiLegal(board, r, c, nr, nc) {
    var p = board[r][c];
    if (!p) return false;
    if (!janggiPseudo(board, r, c, p).some(function (m) { return m[0] === nr && m[1] === nc; })) return false;
    var next = cloneBoard(board);
    next[nr][nc] = p;
    next[r][c] = 0;
    if (!janggiFindKing(next, p.s)) return false;
    if (janggiInCheck(next, p.s)) return false;
    return true;
  }
  function janggiDests(board, r, c) {
    var p = board[r] && board[r][c];
    if (!p) return [];
    return janggiPseudo(board, r, c, p).filter(function (m) { return janggiLegal(board, r, c, m[0], m[1]); });
  }

  function gomokuLinesSvg() {
    var i, h = '', stars = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
    for (i = 0; i < 15; i++) {
      h += '<line x1="' + i + '" y1="0" x2="' + i + '" y2="14"/>';
      h += '<line x1="0" y1="' + i + '" x2="14" y2="' + i + '"/>';
    }
    stars.forEach(function (s) {
      h += '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="0.18"/>';
    });
    return '<svg class="hkmp-go-lines" viewBox="0 0 14 14" preserveAspectRatio="none"><g stroke="#2a1810" stroke-width="0.055" fill="#2a1810">' + h + '</g></svg>';
  }
  function janggiLinesSvg() {
    var i, h = '';
    for (i = 0; i <= 9; i++) h += '<line x1="0" y1="' + i + '" x2="8" y2="' + i + '"/>';
    for (i = 0; i <= 8; i++) h += '<line x1="' + i + '" y1="0" x2="' + i + '" y2="9"/>';
    h += '<line x1="3" y1="0" x2="5" y2="2"/><line x1="5" y1="0" x2="3" y2="2"/>';
    h += '<line x1="3" y1="7" x2="5" y2="9"/><line x1="5" y1="7" x2="3" y2="9"/>';
    return '<svg class="hkmp-jg-lines" viewBox="0 0 8 9" preserveAspectRatio="none"><g stroke="#4a2a12" stroke-width="0.055" fill="none">' + h + '</g>' +
      '<text x="4" y="1.05" text-anchor="middle" font-size="0.72" fill="#153a6b44" font-family="Noto Serif KR,Batang,serif" font-weight="700">漢</text>' +
      '<text x="4" y="8.35" text-anchor="middle" font-size="0.72" fill="#c41e3a44" font-family="Noto Serif KR,Batang,serif" font-weight="700">楚</text></svg>';
  }
  function destHintClass(board, r, c, dests) {
    var map = {};
    (dests || []).forEach(function (m) {
      map[m[0] + ',' + m[1]] = (board[m[0]] && board[m[0]][m[1]]) ? ' cap' : ' hint';
    });
    return map[r + ',' + c] || '';
  }

  function yutSkinCss() {
    return [
      '.hkmp-yut-layout{display:flex;flex-direction:column;align-items:stretch;gap:10px;width:100%}',
      '.hkmp-yut-banner{width:100%;text-align:center;padding:10px 14px;border-radius:14px;border:2px solid #c9a227;background:linear-gradient(180deg,#fff4d4,#e8c98a);color:#5a1a12;font-weight:900;font-size:clamp(16px,4.2vw,22px);letter-spacing:.04em;box-shadow:inset 0 1px 0 #fff8,0 4px 0 #8a5a22;font-family:"Noto Serif KR",Batang,Georgia,serif}',
      '.hkmp-yut-banner b{color:#9b1b1b}',
      '.hkmp-yut-row{display:flex;flex-direction:row;flex-wrap:nowrap;gap:12px;justify-content:center;align-items:stretch;width:100%}',
      '.hkmp-yut{position:relative;width:min(100%,min(70vw,520px));flex:1 1 auto;max-width:520px;aspect-ratio:1;margin:0;background:#c45c3a;background-image:radial-gradient(circle at 50% 50%,#d96a44 0 18%,transparent 19%),repeating-linear-gradient(90deg,rgba(90,20,10,.08) 0 2px,transparent 2px 7px),repeating-linear-gradient(0deg,rgba(90,20,10,.06) 0 2px,transparent 2px 8px),radial-gradient(circle at 50% 42%,#c45c3a,#8b2e1c 70%,#5a1810);border-radius:8px;border:10px solid #5c2a14;box-shadow:inset 0 0 0 3px #e8c98a,inset 0 0 40px #0004,0 10px 28px #0006;overflow:visible}',
      '.hkmp-yut:before{content:"";position:absolute;inset:10px;border:1px solid #ead18f55;border-radius:4px;pointer-events:none}',
      '.hkmp-yut-path{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}',
      '.hkmp-yut-node{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:#f3e4b8;border:2px solid #5a3a1a;box-shadow:inset 0 1px 0 #fff8,0 2px 4px #0005;z-index:1;cursor:default;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      '.hkmp-yut-node.corner{width:40px;height:40px;margin:-20px 0 0 -20px;background:#fff0c8;border-width:3px;border-color:#7a4a18}',
      '.hkmp-yut-node.center{width:46px;height:46px;margin:-23px 0 0 -23px;background:radial-gradient(circle at 40% 35%,#fff6d8,#e8c070);border-width:3px}',
      '.hkmp-yut-node .hkmp-yut-nlbl{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:9px;font-weight:900;color:#6a2a12;pointer-events:none;white-space:nowrap;font-family:"Noto Serif KR",Batang,serif}',
      '.hkmp-yut-node.corner .hkmp-yut-nlbl,.hkmp-yut-node.center .hkmp-yut-nlbl{font-size:11px}',
      '.hkmp-yut-node.lit{z-index:8;cursor:pointer;box-shadow:0 0 0 4px #ffe566,0 0 18px #ffb000,inset 0 0 8px #fff;animation:hkmp-yut-pulse .7s ease infinite;transform:scale(1.18)}',
      '.hkmp-yut-node.lit.goal{box-shadow:0 0 0 5px #9ae6b4,0 0 22px #2f9e58;background:#d8f5c8}',
      '.hkmp-mal{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #fff8e8;z-index:5;box-shadow:0 3px 8px #0008,inset 0 2px 0 #fff6;transition:left .5s cubic-bezier(.2,.8,.2,1),top .5s cubic-bezier(.2,.8,.2,1),transform .18s ease;display:grid;place-items:center;font-size:17px;font-weight:900;color:#fff;line-height:1;-webkit-user-select:none;user-select:none;touch-action:manipulation;cursor:pointer;-webkit-tap-highlight-color:transparent;text-shadow:0 1px 2px #0009}',
      '.hkmp-mal.home{opacity:.7;transform:scale(.78);cursor:default}',
      '.hkmp-mal.wait{box-shadow:0 0 0 2px #fff6,0 3px 8px #0008}',
      '.hkmp-mal.sel{transform:scale(1.16);box-shadow:0 0 0 4px #ffe566,0 0 16px #fff;z-index:7}',
      '.hkmp-mal.can{box-shadow:0 0 0 3px #9ae6b4,0 3px 8px #0008}',
      '.hkmp-mal .hkmp-mal-n{font-size:15px}',
      '.hkmp-mal .hkmp-mal-stack{position:absolute;right:-6px;top:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#1a1208;color:#ffe566;font-size:12px;display:grid;place-items:center;border:2px solid #fff}',
      '.hkmp-yut-side{flex:0 0 168px;width:168px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:10px;padding:14px 12px;background:linear-gradient(180deg,#f6ead0,#e2c48a);border-radius:16px;border:3px solid #8a5a22;min-height:240px;box-sizing:border-box;box-shadow:inset 0 1px 0 #fff8,0 6px 16px #0004}',
      '.hkmp-yut-act{width:100%;display:flex;flex-direction:column;gap:8px;align-items:stretch}',
      '.hkmp-yut-act .hkmp-btn{width:100%}',
      '.hkmp-yut-sticks{display:flex;gap:10px;align-items:flex-end;height:120px;perspective:420px}',
      '.hkmp-stick{width:22px;height:96px;border-radius:9px;background:#e8c47a;border:1px solid #6b4a22;box-shadow:1px 2px 4px #0006;transform-origin:center center;position:relative;transform-style:preserve-3d}',
      '.hkmp-stick i{display:block;width:8px;height:8px;margin:16px auto 0;border-radius:50%;background:transparent}',
      '.hkmp-stick.face{background:linear-gradient(90deg,#5a3418,#2a160c);border-color:#1a0c08}',
      '.hkmp-stick.back{background:linear-gradient(90deg,#fff1c8,#d4b06a)}',
      '.hkmp-stick.back i{background:#8b1a1a;box-shadow:0 28px 0 #8b1a1a,0 56px 0 #8b1a1a}',
      '.hkmp-stick.toss{animation:hkmp-stick-flip .9s cubic-bezier(.2,.7,.2,1)}',
      '.hkmp-yut-yname{color:#7a1a12;font-weight:900;font-size:26px;min-height:32px;font-family:"Noto Serif KR",Batang,serif;text-shadow:0 1px 0 #fff8}',
      '.hkmp-yut-hist{width:100%;text-align:center;color:#5a2a12;font-weight:800;font-size:13px;line-height:1.45;word-break:keep-all}',
      '.hkmp-yut-hist b{color:#9b1b1b;font-size:15px}',
      '.hkmp-yut-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:6px}',
      '.hkmp-yut-chip{border:0;border-radius:999px;padding:5px 10px;font-weight:800;font-size:13px;background:#ead18f;color:#3a1a10;cursor:pointer;box-shadow:0 1px 0 #0003}',
      '.hkmp-yut-chip.on{background:#ffe566;box-shadow:0 0 0 2px #9b1b1b,0 1px 0 #0003}',
      '.hkmp-yut-hint{font-size:12px;color:#6a3a18;text-align:center;font-weight:700}',
      '.hkmp-yut-boom{position:fixed;inset:0;z-index:10020;pointer-events:none;display:none}',
      '.hkmp-yut-boom.go{display:block}',
      '.hkmp-yut-boom-flash{position:absolute;inset:0;opacity:0}',
      '.hkmp-yut-boom.go[data-kind="capture"] .hkmp-yut-boom-flash{background:radial-gradient(circle,#ff2a00cc,#7a0000aa 42%,#ffcc0044);animation:hkmp-yut-flash 1.15s ease forwards}',
      '.hkmp-yut-boom.go[data-kind="stack"] .hkmp-yut-boom-flash{background:radial-gradient(circle,#ffe566cc,#e0a020aa 42%,#fff8);animation:hkmp-yut-flash 1.05s ease forwards}',
      '.hkmp-yut-boom.go[data-kind="goal"] .hkmp-yut-boom-flash{background:radial-gradient(circle,#9ae6b4bb,#2f9e5888);animation:hkmp-yut-flash .9s ease forwards}',
      '.hkmp-yut-boom.go[data-kind="win"] .hkmp-yut-boom-flash{background:radial-gradient(circle,#ffe566ee,#e23d28aa 50%,#3d7cff66);animation:hkmp-yut-flash 1.6s ease forwards}',
      '.hkmp-yut-boom.go[data-kind="lose"] .hkmp-yut-boom-flash{background:radial-gradient(circle,#222c,#000d);animation:hkmp-yut-flash 1.3s ease forwards}',
      '.hkmp-yut-boom-shock{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:10px solid #fff;opacity:0}',
      '.hkmp-yut-boom.go .hkmp-yut-boom-shock{animation:hkmp-yut-shock 1s cubic-bezier(.1,.7,.2,1) forwards}',
      '.hkmp-yut-boom.go[data-kind="stack"] .hkmp-yut-boom-shock{border-color:#ffe566}',
      '.hkmp-yut-boom-txt{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) scale(.2) rotate(-18deg);font-size:clamp(52px,16vw,120px);font-weight:900;color:#fff;font-family:"Noto Serif KR",Batang,Impact,serif;letter-spacing:-.04em;text-shadow:0 0 8px #000,6px 8px 0 #7a0000,-4px -3px 0 #ff0,0 18px 40px #000;opacity:0;white-space:nowrap}',
      '.hkmp-yut-boom.go .hkmp-yut-boom-txt{animation:hkmp-yut-slam 1.15s cubic-bezier(.15,1.4,.3,1) forwards}',
      '.hkmp-yut-boom.go[data-kind="stack"] .hkmp-yut-boom-txt{text-shadow:0 0 8px #000,6px 8px 0 #7a5a00,-4px -3px 0 #fff,0 18px 40px #000}',
      '.hkmp-yut-bits{position:absolute;inset:0;overflow:hidden}',
      '.hkmp-yut-bit{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px;border-radius:2px;background:#ffe566;opacity:0}',
      '.hkmp-yut-boom.go .hkmp-yut-bit{animation:hkmp-yut-bit 1.1s ease-out forwards}',
      '.hk-mp-overlay.yut-quake{animation:hkmp-yut-quake 1.05s ease}',
      '.hk-mp-overlay.yut-quake2{animation:hkmp-yut-quake2 .95s ease}',
      '.hkmp-ended.yut-end{padding:28px 16px;text-align:center;border-radius:20px;overflow:hidden;position:relative}',
      '.hkmp-ended.yut-end.win{background:radial-gradient(circle at 50% 30%,#ffe566,#c45c3a 62%,#5a1810);animation:hkmp-yut-winbg 1.2s ease}',
      '.hkmp-ended.yut-end.lose{background:radial-gradient(circle at 50% 30%,#6a6a6a,#2a1512 62%,#120808)}',
      '.hkmp-ended.yut-end h2{font-size:clamp(48px,14vw,92px)!important;margin:8px 0 12px;font-family:"Noto Serif KR",Batang,Impact,serif;text-shadow:0 6px 0 #0006,0 0 24px #fff8;animation:hkmp-yut-slam 1s cubic-bezier(.15,1.4,.3,1) both}',
      '@keyframes hkmp-stick-flip{0%{transform:translateY(0) rotateX(0) rotateY(0)}18%{transform:translateY(-78px) rotateX(200deg) rotateY(90deg)}40%{transform:translateY(-18px) rotateX(400deg) rotateY(200deg)}62%{transform:translateY(-54px) rotateX(620deg) rotateY(300deg)}82%{transform:translateY(-8px) rotateX(800deg) rotateY(360deg)}100%{transform:translateY(0) rotateX(720deg) rotateY(360deg)}}',
      '@keyframes hkmp-yut-pulse{0%,100%{box-shadow:0 0 0 4px #ffe566,0 0 12px #ffb000}50%{box-shadow:0 0 0 8px #fff38a,0 0 26px #ff7}}',
      '@keyframes hkmp-yut-flash{0%{opacity:0}8%{opacity:1}18%{opacity:.85}100%{opacity:0}}',
      '@keyframes hkmp-yut-shock{0%{transform:scale(.2);opacity:1;border-width:18px}100%{transform:scale(18);opacity:0;border-width:0}}',
      '@keyframes hkmp-yut-slam{0%{transform:translate(-50%,-50%) scale(.15) rotate(-24deg);opacity:0}22%{transform:translate(-50%,-50%) scale(1.35) rotate(8deg);opacity:1}40%{transform:translate(-50%,-50%) scale(.92) rotate(-4deg);opacity:1}70%{transform:translate(-50%,-50%) scale(1.08) rotate(2deg);opacity:1}100%{transform:translate(-50%,-50%) scale(1.02) rotate(-1deg);opacity:0}}',
      '@keyframes hkmp-yut-bit{0%{transform:translate(0,0) rotate(0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(260deg) scale(.2);opacity:0}}',
      '@keyframes hkmp-yut-quake{0%,100%{transform:translate(0) rotate(0)}8%{transform:translate(-22px,12px) rotate(-3deg)}16%{transform:translate(24px,-10px) rotate(3.4deg)}24%{transform:translate(-18px,-14px) rotate(-2.2deg)}32%{transform:translate(20px,10px) rotate(2.8deg)}44%{transform:translate(-12px,8px) rotate(-1.6deg)}58%{transform:translate(10px,-6px) rotate(1.2deg)}76%{transform:translate(-4px,3px)}100%{transform:none}}',
      '@keyframes hkmp-yut-quake2{0%,100%{transform:translate(0)}10%{transform:translate(16px,-8px) rotate(2deg)}22%{transform:translate(-18px,10px) rotate(-2.4deg)}36%{transform:translate(12px,8px)}52%{transform:translate(-10px,-6px)}70%{transform:translate(6px,3px)}100%{transform:none}}',
      '@keyframes hkmp-yut-winbg{0%{filter:brightness(3) saturate(2)}100%{filter:none}}',
      '@media(max-width:560px){.hkmp-yut-side{flex:0 0 118px;width:118px;padding:8px 6px;min-height:0}.hkmp-yut-row{gap:6px}.hkmp-stick{height:64px;width:14px}.hkmp-yut-sticks{height:72px;gap:4px}.hkmp-mal{width:36px;height:36px;margin:-18px 0 0 -18px}.hkmp-yut-node{width:22px;height:22px;margin:-11px 0 0 -11px}.hkmp-yut-node.corner{width:30px;height:30px;margin:-15px 0 0 -15px}.hkmp-yut-node.center{width:34px;height:34px;margin:-17px 0 0 -17px}.hkmp-board-wrap{width:min(100%,100%)}}'
    ].join('');
  }
  function yutPathSvg(nodes) {
    function pt(i) {
      var n = nodes[i];
      if (!n) return '0,0';
      return (n.x * 100).toFixed(2) + ',' + (n.y * 100).toFixed(2);
    }
    function poly(ids) {
      return '<polyline points="' + ids.map(pt).join(' ') + '"/>';
    }
    var outer = [];
    for (var i = 0; i < 20; i++) outer.push(i);
    outer.push(0);
    return '<svg class="hkmp-yut-path" viewBox="0 0 100 100" preserveAspectRatio="none"><g fill="none" stroke="#ead18fdd" stroke-width="2.4">' +
      poly(outer) + poly([5, 21, 22, 20, 23, 24, 15]) + poly([10, 25, 26, 20, 27, 28, 0]) +
      '</g></svg>';
  }
  function yutMalXY(m, nodes, teams) {
    var benches = [
      { x: 4, y: 96 },
      { x: 4, y: 4 },
      { x: 96, y: 4 },
      { x: 96, y: 96 }
    ];
    var b = benches[m.team] || benches[0];
    if (m.home) {
      var hx = b.x < 50 ? b.x + 12 : b.x - 12;
      var hy = b.y < 50 ? b.y + 12 : b.y - 12;
      return { x: hx + (m.i % 2) * 4.5, y: hy + (m.i > 1 ? 4.5 : 0), home: true, wait: false };
    }
    if (m.pos < 0) {
      return { x: b.x + (m.i % 2) * 7.2, y: b.y + (m.i > 1 ? 7.2 : 0), home: false, wait: true };
    }
    var nd = nodes[m.pos] || nodes[0] || { x: 0.5, y: 0.5 };
    return { x: nd.x * 100, y: nd.y * 100, home: false, wait: false };
  }
  function playYutToss(sticks, name) {
    var els = refs.board.querySelectorAll('.hkmp-stick');
    if (!els.length) return;
    Array.prototype.forEach.call(els, function (el, i) {
      el.classList.remove('toss', 'back', 'face');
      void el.offsetWidth;
      el.style.animationDelay = (i * 0.08) + 's';
      el.classList.add('toss');
      setTimeout(function () {
        el.classList.remove('toss');
        el.style.animationDelay = '';
        if (sticks && sticks[i]) el.classList.add('back');
        else el.classList.add('face');
      }, 900 + i * 80);
    });
    var nameEl = refs.board.querySelector('.hkmp-yut-yname');
    if (nameEl) {
      nameEl.textContent = '';
      setTimeout(function () { nameEl.textContent = name || ''; }, 920);
    }
  }
  function playYutFx(kind) {
    if (!root) return;
    var boom = root.querySelector('.hkmp-yut-boom');
    if (!boom) {
      boom = el('div', 'hkmp-yut-boom');
      boom.innerHTML = '<div class="hkmp-yut-boom-flash"></div><div class="hkmp-yut-boom-shock"></div><div class="hkmp-yut-bits"></div><div class="hkmp-yut-boom-txt"></div>';
      root.appendChild(boom);
    }
    var txtMap = { capture: '잡았다!!!', stack: '업기!!!', goal: '골인!!!', win: '승리!!!', lose: '패배...' };
    var txt = boom.querySelector('.hkmp-yut-boom-txt');
    if (txt) txt.textContent = txtMap[kind] || '!!!';
    var bits = boom.querySelector('.hkmp-yut-bits');
    if (bits) {
      var n = kind === 'win' ? 42 : 28;
      var h = '';
      for (var i = 0; i < n; i++) {
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        var dist = 120 + Math.random() * 280;
        var col = kind === 'stack' ? (i % 2 ? '#ffe566' : '#fff') : (kind === 'capture' ? (i % 2 ? '#ff2a00' : '#ffe566') : (i % 3 === 0 ? '#3d7cff' : (i % 3 === 1 ? '#e23d28' : '#ffe566')));
        h += '<i class="hkmp-yut-bit" style="--dx:' + Math.cos(ang) * dist + 'px;--dy:' + Math.sin(ang) * dist + 'px;background:' + col + ';animation-delay:' + (Math.random() * 0.12) + 's;width:' + (10 + Math.random() * 16) + 'px;height:' + (10 + Math.random() * 16) + 'px"></i>';
      }
      bits.innerHTML = h;
    }
    boom.setAttribute('data-kind', kind || 'capture');
    boom.classList.remove('go');
    void boom.offsetWidth;
    boom.classList.add('go');
    root.classList.remove('yut-quake', 'yut-quake2');
    void root.offsetWidth;
    root.classList.add(kind === 'stack' ? 'yut-quake2' : 'yut-quake');
    setTimeout(function () {
      boom.classList.remove('go');
      if (root) root.classList.remove('yut-quake', 'yut-quake2');
    }, kind === 'win' ? 1600 : 1200);
  }
  function playJanggiFx(kind) {
    if (!root) return;
    kind = kind || 'move';
    var boom = root.querySelector('.hkmp-jg-boom');
    if (!boom) {
      boom = el('div', 'hkmp-jg-boom');
      boom.innerHTML = '<div class="hkmp-jg-boom-flash"></div><div class="hkmp-jg-boom-shock"></div><div class="hkmp-jg-bits"></div><div class="hkmp-jg-boom-txt"></div>';
      root.appendChild(boom);
    }
    var txtMap = {
      move: '탁!!!',
      capture: '잡았다!!!',
      check: '장군!!!',
      mate: '한!!!',
      win: '한!!!',
      bikjang: '빅장!!!',
      start: '대국!!!',
      pass: '한수쉼',
      setup: '배치',
      lose: '패배...'
    };
    var txt = boom.querySelector('.hkmp-jg-boom-txt');
    if (txt) txt.textContent = txtMap[kind] || '!!!';
    var bits = boom.querySelector('.hkmp-jg-bits');
    if (bits) {
      var heavy = kind === 'mate' || kind === 'win' || kind === 'check' || kind === 'capture' || kind === 'bikjang';
      var n = kind === 'mate' || kind === 'win' ? 48 : (heavy ? 36 : 18);
      var h = '';
      for (var i = 0; i < n; i++) {
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.45;
        var dist = 90 + Math.random() * (heavy ? 340 : 200);
        var col = kind === 'bikjang'
          ? (i % 2 ? '#3d7cff' : '#efd28a')
          : (kind === 'check' || kind === 'mate' || kind === 'win'
            ? (i % 3 === 0 ? '#c41e3a' : (i % 3 === 1 ? '#ffe566' : '#fff'))
            : (kind === 'capture' ? (i % 2 ? '#ff2a00' : '#ffe566') : (i % 2 ? '#c9a227' : '#fff')));
        h += '<i class="hkmp-jg-bit" style="--dx:' + Math.cos(ang) * dist + 'px;--dy:' + Math.sin(ang) * dist + 'px;background:' + col + ';animation-delay:' + (Math.random() * 0.14) + 's;width:' + (10 + Math.random() * 18) + 'px;height:' + (10 + Math.random() * 18) + 'px"></i>';
      }
      bits.innerHTML = h;
    }
    boom.setAttribute('data-kind', kind);
    boom.classList.remove('go');
    void boom.offsetWidth;
    boom.classList.add('go');
    root.classList.remove('jg-quake', 'jg-quake2', 'yut-quake', 'yut-quake2');
    void root.offsetWidth;
    root.classList.add(heavyQuake(kind) ? 'jg-quake' : 'jg-quake2');
    var wrap = refs.board && refs.board.querySelector('.hkmp-jg');
    if (wrap) {
      wrap.classList.remove('jg-slam');
      void wrap.offsetWidth;
      wrap.classList.add('jg-slam');
    }
    var dur = kind === 'mate' || kind === 'win' ? 1700 : (kind === 'check' || kind === 'capture' ? 1300 : 900);
    setTimeout(function () {
      boom.classList.remove('go');
      if (root) root.classList.remove('jg-quake', 'jg-quake2');
    }, dur);
  }
  function heavyQuake(kind) {
    return kind === 'capture' || kind === 'check' || kind === 'mate' || kind === 'win' || kind === 'bikjang';
  }
  function boardEndOutcomeHtml(n, win) {
    var h = '', i;
    for (i = 0; i < n; i++) {
      var left = (Math.random() * 100).toFixed(1);
      var delay = (Math.random() * 0.7).toFixed(2);
      var dur = (1.2 + Math.random() * 1.1).toFixed(2);
      var col = win
        ? (i % 4 === 0 ? '#ffe566' : (i % 4 === 1 ? '#e23d28' : (i % 4 === 2 ? '#fff' : '#3d7cff')))
        : (i % 2 ? '#555' : '#888');
      h += '<i class="hkmp-end-piece" style="left:' + left + '%;background:' + col + ';animation-delay:' + delay + 's;animation-duration:' + dur + 's;width:' + (8 + Math.random() * 14) + 'px;height:' + (10 + Math.random() * 18) + 'px"></i>';
    }
    return h;
  }
  function playBoardEndFx(outcome) {
    if (!root) return;
    outcome = outcome === 'win' || outcome === 'draw' ? outcome : 'lose';
    var boom = root.querySelector('.hkmp-endfx');
    if (!boom) {
      boom = el('div', 'hkmp-endfx');
      boom.innerHTML = '<div class="hkmp-endfx-flash"></div><div class="hkmp-endfx-rays"></div><div class="hkmp-endfx-shock"></div><div class="hkmp-endfx-shock hkmp-endfx-shock2"></div><div class="hkmp-endfx-bits"></div><div class="hkmp-endfx-rain"></div><div class="hkmp-endfx-txt"></div>';
      root.appendChild(boom);
    }
    var txtMap = { win: '승리!!!', lose: '패배...', draw: '무승부' };
    var txt = boom.querySelector('.hkmp-endfx-txt');
    if (txt) txt.textContent = txtMap[outcome] || '!!!';
    var bits = boom.querySelector('.hkmp-endfx-bits');
    if (bits) {
      var n = outcome === 'win' ? 56 : (outcome === 'lose' ? 36 : 28);
      var h = '';
      for (var i = 0; i < n; i++) {
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        var dist = 80 + Math.random() * (outcome === 'win' ? 380 : 240);
        var col = outcome === 'win'
          ? (i % 3 === 0 ? '#ffe566' : (i % 3 === 1 ? '#e23d28' : '#fff'))
          : (outcome === 'draw' ? (i % 2 ? '#3d7cff' : '#efd28a') : (i % 2 ? '#666' : '#222'));
        h += '<i class="hkmp-endfx-bit" style="--dx:' + Math.cos(ang) * dist + 'px;--dy:' + Math.sin(ang) * dist + 'px;background:' + col + ';animation-delay:' + (Math.random() * 0.16) + 's;width:' + (10 + Math.random() * 20) + 'px;height:' + (10 + Math.random() * 20) + 'px"></i>';
      }
      bits.innerHTML = h;
    }
    var rain = boom.querySelector('.hkmp-endfx-rain');
    if (rain) {
      var rh = '', r, nRain = outcome === 'win' ? 42 : 16;
      for (r = 0; r < nRain; r++) {
        var c2 = outcome === 'win'
          ? (r % 3 === 0 ? '#ffe566' : (r % 3 === 1 ? '#ff2a00' : '#fff'))
          : '#444';
        rh += '<i class="hkmp-endfx-drop" style="left:' + (Math.random() * 100) + '%;background:' + c2 + ';animation-delay:' + (Math.random() * 0.45) + 's;width:' + (8 + Math.random() * 12) + 'px;height:' + (12 + Math.random() * 16) + 'px"></i>';
      }
      rain.innerHTML = rh;
    }
    boom.setAttribute('data-kind', outcome);
    boom.classList.remove('go');
    void boom.offsetWidth;
    boom.classList.add('go');
    root.classList.remove('end-win-quake', 'end-lose-quake', 'end-draw-quake', 'jg-quake', 'yut-quake');
    void root.offsetWidth;
    root.classList.add(outcome === 'win' ? 'end-win-quake' : (outcome === 'lose' ? 'end-lose-quake' : 'end-draw-quake'));
    var dur = outcome === 'win' ? 1800 : 1500;
    setTimeout(function () {
      boom.classList.remove('go');
      if (root) root.classList.remove('end-win-quake', 'end-lose-quake', 'end-draw-quake');
    }, dur);
  }
  function playJanggiMoveAnim(last) {
    if (!last || !refs.board) return;
    var key = last.fr + ',' + last.fc + '>' + last.tr + ',' + last.tc;
    if (key === jgMoveSeen) return;
    jgMoveSeen = key;
    Array.prototype.forEach.call(document.querySelectorAll('.hkmp-jg-fly'), function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    var destBtn = refs.board.querySelector('[data-r="' + last.tr + '"][data-c="' + last.tc + '"]');
    var fromBtn = refs.board.querySelector('[data-r="' + last.fr + '"][data-c="' + last.fc + '"]');
    var destPiece = destBtn && destBtn.querySelector('.hkmp-jg-piece');
    if (!destBtn || !fromBtn || !destPiece) return;
    var fromRect = fromBtn.getBoundingClientRect();
    var toRect = destBtn.getBoundingClientRect();
    var pw = destPiece.offsetWidth || 36;
    var ph = destPiece.offsetHeight || 36;
    destPiece.style.opacity = '0';
    var fly = destPiece.cloneNode(true);
    fly.classList.add('hkmp-jg-fly');
    fly.style.width = pw + 'px';
    fly.style.height = ph + 'px';
    fly.style.left = (fromRect.left + fromRect.width / 2 - pw / 2) + 'px';
    fly.style.top = (fromRect.top + fromRect.height / 2 - ph / 2) + 'px';
    fly.style.transform = 'scale(1.08)';
    document.body.appendChild(fly);
    requestAnimationFrame(function () {
      fly.style.transition = 'left .4s cubic-bezier(.15,.9,.25,1), top .4s cubic-bezier(.15,.9,.25,1), transform .4s cubic-bezier(.15,.9,.25,1)';
      fly.style.left = (toRect.left + toRect.width / 2 - pw / 2) + 'px';
      fly.style.top = (toRect.top + toRect.height / 2 - ph / 2) + 'px';
      fly.style.transform = 'scale(1.22) rotate(10deg)';
    });
    setTimeout(function () {
      destPiece.style.opacity = '';
      destPiece.style.animation = 'hkmp-jg-land .28s ease';
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      var burst = document.createElement('span');
      burst.className = 'hkmp-jg-cell-burst';
      destBtn.appendChild(burst);
      setTimeout(function () { if (burst.parentNode) burst.parentNode.removeChild(burst); }, 620);
    }, 410);
  }
  function yutDestsForMal(st, malIndex) {
    var mals = st.mals || [];
    var m = mals[malIndex];
    if (!m) return [];
    var legal = (st.legalAll && st.legalAll[yutThrowI]) || st.legal || [];
    var i, om;
    for (i = 0; i < legal.length; i++) {
      if (legal[i].mal === malIndex) return legal[i].dests || [];
      om = mals[legal[i].mal];
      if (om && m.pos >= 0 && om.team === m.team && om.pos === m.pos && !m.home) return legal[i].dests || [];
    }
    return [];
  }
  function yutCanSelect(st, malIndex, myTurn) {
    if (!myTurn || !st || st.pending !== 'move') return false;
    return yutDestsForMal(st, malIndex).length > 0;
  }
  function bindYutBoard() {
    if (!refs.board) return;
    refs.board.onclick = function (e) {
      var st = lastState || {};
      var myTurn = boardMyTurn(st);
      var t = e.target;
      if (t && t.nodeType === 3) t = t.parentElement;
      var malEl = t && t.closest ? t.closest('.hkmp-mal') : null;
      var nodeEl = t && t.closest ? t.closest('.hkmp-yut-node') : null;
      function sendMove(mal, dest) {
        send({ type: 'input', payload: { act: 'move', mal: mal, dest: dest, throwI: yutThrowI } });
        yutSel = null;
      }
      function destOfNode(nid, dests) {
        if (nid === 0 && (dests.indexOf('home') >= 0 || dests.indexOf(99) >= 0)) return 'home';
        if (dests.indexOf(nid) >= 0) return nid;
        return null;
      }
      if (malEl) {
        var mi = Number(malEl.getAttribute('data-mal'));
        var mals = st.mals || [];
        var clicked = mals[mi];
        if (yutSel != null && myTurn && st.pending === 'move') {
          var destsSel = yutDestsForMal(st, yutSel);
          if (destsSel.indexOf(-1) >= 0 && mi === yutSel) {
            sendMove(yutSel, -1);
            return;
          }
          if (clicked && clicked.pos >= 0 && !clicked.home) {
            var land = destOfNode(clicked.pos, destsSel);
            if (land != null) {
              sendMove(yutSel, land);
              return;
            }
          }
        }
        if (!yutCanSelect(st, mi, myTurn)) return;
        yutSel = mi;
        boardSig = '';
        updateYutUi(st, myTurn);
        return;
      }
      if (nodeEl && nodeEl.classList.contains('lit')) {
        if (yutSel == null) return;
        var dests = yutDestsForMal(st, yutSel);
        var nid = Number(nodeEl.getAttribute('data-id'));
        var sendDest = destOfNode(nid, dests);
        if (sendDest == null) return;
        sendMove(yutSel, sendDest);
        return;
      }
      if (yutSel != null) {
        yutSel = null;
        boardSig = '';
        updateYutUi(st, myTurn);
      }
    };
  }
  function bindYutActions(st, myTurn) {
    var mount = refs.board && refs.board.querySelector('[data-yut-act]');
    if (!mount && refs.boardAct) mount = refs.boardAct;
    if (!mount) return;
    var yact = '';
    if (myTurn && st.pending === 'throw') yact = '<button type="button" class="hkmp-btn primary" data-act="throw">' + ((st.throws && st.throws.length) ? '한 번 더 던지기' : '윷 던지기') + '</button>';
    else if (myTurn && st.pending === 'move') {
      var hint = '쌓인 결과를 고른 뒤, 말을 눌러 빛나는 칸으로 이동';
      if (yutSel != null && yutDestsForMal(st, yutSel).indexOf(-1) >= 0) {
        yact = '<button type="button" class="hkmp-btn primary" data-act="backdo">출발 전으로</button>';
      }
      yact += '<div class="hkmp-yut-hint">' + hint + '</div>';
    }
    mount.innerHTML = yact;
    Array.prototype.forEach.call(mount.querySelectorAll('[data-act]'), function (btn) {
      btn.onclick = function () {
        var act = btn.getAttribute('data-act');
        if (act === 'backdo' && yutSel != null) {
          send({ type: 'input', payload: { act: 'move', mal: yutSel, dest: -1, throwI: yutThrowI } });
          yutSel = null;
          return;
        }
        send({ type: 'input', payload: { act: act } });
      };
    });
    if (refs.boardAct && refs.boardAct !== mount) refs.boardAct.innerHTML = '';
  }
  function updateYutUi(st, myTurn) {
    var nodes = st.nodes || [];
    var mals = st.mals || [];
    var teams = st.teams || 2;
    var turnTeam = st.turnTeam != null ? st.turnTeam : boardMySide();
    var throws = st.throws || [];
    if (yutThrowI >= throws.length) yutThrowI = Math.max(0, throws.length - 1);
    var key = (st.throwId || '') + '|' + (st.pending || '') + '|' + (st.turnId || '') + '|' + (yutSel == null ? '' : yutSel) + '|' + yutThrowI + '|' + JSON.stringify(throws) + '|' + JSON.stringify(mals) + '|' + myTurn + '|' + (st.fx && st.fx.id);
    var needDom = refs.board.getAttribute('data-kind') !== 'yut' || !refs.board.querySelector('.hkmp-yut-row') || refs.board.querySelectorAll('.hkmp-mal').length !== mals.length || refs.board.querySelectorAll('.hkmp-yut-node').length !== nodes.length;
    if (!needDom && key === boardSig) return;
    if (needDom) {
      var corners = { 0: 1, 5: 1, 10: 1, 15: 1, 20: 1 };
      var labels = { 0: '날', 5: '참', 10: '모', 15: '방', 20: '중심' };
      refs.board.setAttribute('data-kind', 'yut');
      refs.board.innerHTML =
        '<div class="hkmp-yut-layout">' +
        '<div class="hkmp-yut-banner" data-yut-banner></div>' +
        '<div class="hkmp-yut-row">' +
        '<div class="hkmp-yut">' + yutPathSvg(nodes) +
        nodes.map(function (n, ni) {
          var id = n.id != null ? n.id : ni;
          var cls = 'hkmp-yut-node' + (corners[id] ? (id === 20 ? ' center' : ' corner') : '');
          var lab = labels[id] ? '<span class="hkmp-yut-nlbl">' + labels[id] + '</span>' : '';
          var title = id === 0 ? ' title="날 · 출발 / 도착 후 한 칸 더 나가야 골인"' : (labels[id] ? ' title="' + labels[id] + '"' : '');
          return '<div class="' + cls + '" data-id="' + id + '"' + title + ' style="left:' + (n.x * 100) + '%;top:' + (n.y * 100) + '%">' + lab + '</div>';
        }).join('') +
        mals.map(function (m, i) {
          return '<div class="hkmp-mal" data-mal="' + i + '" style="left:-20%;top:-20%;background:' + yutTeamColor(m.team) + '"><span class="hkmp-mal-n">' + ((m.i || 0) + 1) + '</span></div>';
        }).join('') +
        '</div>' +
        '<div class="hkmp-yut-side"><div class="hkmp-yut-sticks">' +
        [0, 1, 2, 3].map(function () { return '<div class="hkmp-stick"><i></i></div>'; }).join('') +
        '</div><div class="hkmp-yut-yname"></div><div class="hkmp-yut-hist" data-yut-hist></div><div class="hkmp-yut-act" data-yut-act></div></div></div></div>';
      yutAnimReady = false;
      yutThrowSeen = '';
      yutSel = null;
      requestAnimationFrame(function () { yutAnimReady = true; });
      bindYutBoard();
    }
    var banner = refs.board.querySelector('[data-yut-banner]');
    if (banner) {
      var tName = yutTeamName(turnTeam);
      var mine = myTurn;
      banner.innerHTML = '<b>' + esc(tName) + '팀</b> 차례' + (mine ? ' · 당신' : '') +
        (st.pending === 'throw' ? ((st.throws && st.throws.length) ? ' · 한 번 더 던지세요' : ' · 윷을 던지세요') : (st.pending === 'move' ? ' · 결과를 골라 말을 옮기세요' : ''));
      banner.style.borderColor = yutTeamColor(turnTeam);
    }
    var hist = refs.board.querySelector('[data-yut-hist]');
    if (hist) {
      var chain = throws.length ? throws : ((st.turnThrows && st.turnThrows.length) ? st.turnThrows.map(function (name) { return { name: name }; }) : []);
      if (!chain.length) hist.innerHTML = '결과 이력';
      else if (st.pending === 'move' && myTurn && throws.length) {
        hist.innerHTML = '<div class="hkmp-yut-chips">' + throws.map(function (t, i) {
          return '<button type="button" class="hkmp-yut-chip' + (i === yutThrowI ? ' on' : '') + '" data-throw-i="' + i + '">' + esc(t.name || '') + '</button>';
        }).join('') + '</div>';
        Array.prototype.forEach.call(hist.querySelectorAll('[data-throw-i]'), function (btn) {
          btn.onclick = function (ev) {
            ev.stopPropagation();
            yutThrowI = Number(btn.getAttribute('data-throw-i')) || 0;
            yutSel = null;
            boardSig = '';
            updateYutUi(st, myTurn);
          };
        });
      } else {
        hist.innerHTML = '<b>' + chain.map(function (x) { return esc(typeof x === 'string' ? x : (x.name || '')); }).join(' → ') + '</b>';
      }
    }
    var lit = {};
    if (yutSel != null && myTurn && st.pending === 'move') {
      yutDestsForMal(st, yutSel).forEach(function (d) {
        if (d === 'home' || d === 99) lit[0] = 'goal';
        else lit[d] = (lit[d] === 'goal') ? 'goal' : 'lit';
      });
    }
    Array.prototype.forEach.call(refs.board.querySelectorAll('.hkmp-yut-node'), function (el) {
      var id = Number(el.getAttribute('data-id'));
      el.classList.toggle('lit', !!lit[id] || lit[id] === 'goal');
      el.classList.toggle('goal', lit[id] === 'goal');
    });
    var shown = {};
    Array.prototype.forEach.call(refs.board.querySelectorAll('.hkmp-mal'), function (el) {
      var i = Number(el.getAttribute('data-mal'));
      var m = mals[i];
      if (!m) { el.style.display = 'none'; return; }
      if (m.pos >= 0 && !m.home) {
        var sk = m.team + ':' + m.pos;
        if (shown[sk] != null) { el.style.display = 'none'; return; }
        shown[sk] = i;
      }
      var xy = yutMalXY(m, nodes, teams);
      if (!yutAnimReady) el.style.transition = 'none';
      else el.style.transition = '';
      el.style.display = '';
      el.style.left = xy.x + '%';
      el.style.top = xy.y + '%';
      el.style.background = yutTeamColor(m.team);
      el.style.color = '#fff';
      var stack = m.stacked || 1;
      el.innerHTML = '<span class="hkmp-mal-n">' + ((m.i || 0) + 1) + '</span>' + (stack > 1 ? '<span class="hkmp-mal-stack">×' + stack + '</span>' : '');
      el.classList.toggle('home', !!xy.home);
      el.classList.toggle('wait', !!xy.wait);
      el.classList.toggle('sel', yutSel === i || (yutSel != null && mals[yutSel] && m.pos >= 0 && mals[yutSel].pos === m.pos && mals[yutSel].team === m.team && !m.home));
      el.classList.toggle('can', yutCanSelect(st, i, myTurn) && yutSel == null);
      el.style.cursor = (xy.home || !yutCanSelect(st, i, myTurn)) ? 'default' : 'pointer';
    });
    var throwKey = String(st.throwId || 0) + ':' + JSON.stringify((st.lastYut && st.lastYut.sticks) || []);
    if (st.lastYut && throwKey !== yutThrowSeen) {
      yutThrowSeen = throwKey;
      playYutToss(st.lastYut.sticks, st.lastYut.name);
      yutSel = null;
    } else if (!st.lastYut) {
      var nameEl = refs.board.querySelector('.hkmp-yut-yname');
      if (nameEl && !nameEl.textContent) nameEl.textContent = '대기';
    }
    if (st.fx && st.fx.id && st.fx.id !== yutFxSeen) {
      yutFxSeen = st.fx.id;
      playYutFx(st.fx.kind || 'capture');
    }
    if (st.pending !== 'move') yutSel = null;
    bindYutBoard();
    if (key !== boardSig) {
      boardSig = key;
      bindYutActions(st, myTurn);
    }
  }

  function updateBoardUi() {
    if (!isBoard() || !refs.board) return;
    var st = lastState || {};
    var myTurn = boardMyTurn(st);
    if (gameId === 'yut') {
      updateYutUi(st, myTurn);
      return;
    }
    var sig = gameId + '|' + (st.turnId || '') + '|' + (st.pending || '') + '|' + (st.log || '') + '|' + JSON.stringify(st.last || null) + '|' + (boardSel ? boardSel.join(',') : '') + '|' + JSON.stringify(st.board || st.cells || st.mals || null) + '|' + (st.fx && st.fx.id || '') + '|' + JSON.stringify(st.setupReady || null) + '|' + JSON.stringify(st.layoutInner || null) + '|' + (st.check ? 1 : 0);
    if (sig === boardSig) return;
    boardSig = sig;

    if (gameId === 'gomoku') {
      var b = st.board || [];
      refs.board.innerHTML = '<div class="hkmp-go">' + gomokuLinesSvg() + '<div class="hkmp-go-pts">' +
        b.map(function (row, r) {
          return row.map(function (v, c) {
            var last = st.last && st.last.r === r && st.last.c === c;
            var stone = v === 1 ? '<span class="hkmp-go-stone b"></span>' : v === 2 ? '<span class="hkmp-go-stone w"></span>' : '';
            return '<button type="button" class="hkmp-go-pt' + (last ? ' last' : '') + '" data-r="' + r + '" data-c="' + c + '"' + ((!myTurn || v) ? ' disabled' : '') + '>' + stone + '</button>';
          }).join('');
        }).join('') + '</div></div>';
      Array.prototype.forEach.call(refs.board.querySelectorAll('[data-r]'), function (btn) {
        btn.onclick = function () {
          if (btn.disabled) return;
          send({ type: 'input', payload: { r: Number(btn.getAttribute('data-r')), c: Number(btn.getAttribute('data-c')) } });
        };
      });
      refs.boardAct.innerHTML = '';
      return;
    }

    if (gameId === 'chess' || gameId === 'janggi') {
      var board = st.board || [];
      var dests = [];
      var setupPhase = gameId === 'janggi' && st.pending === 'setup';
      if (boardSel && !setupPhase) {
        dests = gameId === 'chess' ? chessDests(board, boardSel[0], boardSel[1], st.flags) : janggiDests(board, boardSel[0], boardSel[1]);
      }
      var wrapClass = gameId === 'chess' ? 'hkmp-chess' : ('hkmp-jg' + (st.check ? ' jg-check' : ''));
      var extra = '';
      if (gameId === 'janggi') {
        extra = janggiLinesSvg();
        if (setupPhase) extra += '<div class="hkmp-jg-banner setup">상·마 배치</div>';
        else if (st.check) extra += '<div class="hkmp-jg-banner">장군!</div>';
      }
      var gridOpen = gameId === 'janggi' ? '<div class="hkmp-jg-grid">' : '';
      var gridClose = gameId === 'janggi' ? '</div>' : '';
      var chkKing = null;
      if (gameId === 'janggi' && st.check) {
        var chkSide = st.turnSide != null ? st.turnSide : (myTurn ? boardMySide() : 1 - boardMySide());
        chkKing = janggiFindKing(board, chkSide);
      }
      refs.board.innerHTML = '<div class="' + wrapClass + '">' + extra + gridOpen +
        board.map(function (row, r) {
          return row.map(function (p, c) {
            var light = (r + c) % 2 === 0;
            var sel = boardSel && boardSel[0] === r && boardSel[1] === c;
            var last = st.last && ((st.last.fr === r && st.last.fc === c) || (st.last.tr === r && st.last.tc === c));
            var hint = destHintClass(board, r, c, dests);
            var kingChk = chkKing && chkKing[0] === r && chkKing[1] === c;
            var cls = 'hkmp-cell' + (gameId === 'chess' ? (light ? ' light' : ' dark') : '') + (sel ? ' sel' : '') + (last ? ' last' : '') + (kingChk ? ' chk' : '') + hint;
            var inner = '';
            if (p && gameId === 'chess') inner = '<span class="hkmp-ch-piece ' + (p.s === 0 ? 'w' : 'b') + '">' + pieceGlyph(p, 'chess') + '</span>';
            if (p && gameId === 'janggi') inner = '<span class="hkmp-jg-piece s' + p.s + ' t-' + p.t + '">' + pieceGlyph(p, 'janggi') + '</span>';
            return '<button type="button" class="' + cls + '" data-r="' + r + '" data-c="' + c + '">' + inner + '</button>';
          }).join('');
        }).join('') + gridClose + '</div>';
      Array.prototype.forEach.call(refs.board.querySelectorAll('[data-r]'), function (btn) {
        btn.onclick = function () {
          if (setupPhase) return;
          if (!myTurn) return;
          var r = Number(btn.getAttribute('data-r')), c = Number(btn.getAttribute('data-c'));
          var cell = board[r] && board[r][c];
          var mySide = boardMySide();
          var legal = dests.some(function (m) { return m[0] === r && m[1] === c; });
          if (!boardSel) {
            if (cell && cell.s === mySide) {
              boardSel = [r, c];
              boardSig = '';
              updateBoardUi();
            }
            return;
          }
          if (boardSel[0] === r && boardSel[1] === c) {
            boardSel = null;
            boardSig = '';
            updateBoardUi();
            return;
          }
          if (cell && cell.s === mySide) {
            boardSel = [r, c];
            boardSig = '';
            updateBoardUi();
            return;
          }
          if (!legal) {
            boardSel = null;
            boardSig = '';
            updateBoardUi();
            return;
          }
          send({ type: 'input', payload: { fr: boardSel[0], fc: boardSel[1], tr: r, tc: c } });
          boardSel = null;
        };
      });
      if (gameId === 'janggi') {
        var mySideAct = boardMySide();
        var actHtml = '';
        if (setupPhase) {
          var iReady = !!(st.setupReady && st.setupReady[mySideAct]);
          var innerOn = !(st.layoutInner && st.layoutInner[mySideAct] === false);
          if (!iReady) {
            actHtml =
              '<button type="button" class="hkmp-btn' + (innerOn ? ' primary' : '') + '" data-jg="inner">내상</button>' +
              '<button type="button" class="hkmp-btn' + (!innerOn ? ' primary' : '') + '" data-jg="outer">외상</button>' +
              '<button type="button" class="hkmp-btn primary" data-jg="ready">배치 완료</button>';
          } else {
            actHtml = '<span class="hkmp-note" style="margin:0">배치 완료 · 상대 대기</span>';
          }
        } else if (myTurn && !st.check) {
          actHtml = '<button type="button" class="hkmp-btn" data-jg="pass">한수쉼</button>';
        }
        refs.boardAct.innerHTML = actHtml;
        Array.prototype.forEach.call(refs.boardAct.querySelectorAll('[data-jg]'), function (btn) {
          btn.onclick = function () {
            var a = btn.getAttribute('data-jg');
            if (a === 'inner') send({ type: 'input', payload: { act: 'layout', inner: true } });
            else if (a === 'outer') send({ type: 'input', payload: { act: 'layout', inner: false } });
            else if (a === 'ready') send({ type: 'input', payload: { act: 'ready' } });
            else if (a === 'pass') send({ type: 'input', payload: { act: 'pass' } });
          };
        });
        if (st.last) playJanggiMoveAnim(st.last);
        if (st.fx && st.fx.id && st.fx.id !== jgFxSeen) {
          jgFxSeen = st.fx.id;
          playJanggiFx(st.fx.kind || 'move');
        }
      } else {
        refs.boardAct.innerHTML = '';
      }
      return;
    }

  }

  function defaultSize() {
    if (gameId === 'rts') return { w: 1800, h: 1200 };
    if (gameId === 'ageofwar') return { w: 1100, h: 420 };
    if (gameId === 'tank') return { w: 960, h: 640 };
    if (gameId === 'snakes') return { w: 1152, h: 768 };
    if (gameId === 'airhockey') return { w: 700, h: 400 };
    if (gameId === 'lanepush') return { w: 1400, h: 480 };
    if (gameId === 'nexuswar') return { w: 900, h: 600 };
    return { w: 800, h: 600 };
  }
  function helpText() {
    return {
      tank: 'WASD · 마우스 조준/발사 · HP5 · 중앙 아이템(회복/속도/실드/연사) · 목숨 3',
      rts: '좌클릭 본진/배럭 선택 · 시대 업그레이드 · 우클릭 이동/공격 · 본진은 유닛 공격 불가(포탑·배럭으로) · 밝은 시야에서만 건설',
      ageofwar: '유닛 생산 · 시대 진화 · 특수공격 · 상대 기지 파괴',
      snakes: '방향키/WASD · 목숨 3 · 탈락 후 관전 · 최후 1인 승리',
      airhockey: '마우스/터치로 패들 · 충돌할수록 퍽이 점점 빨라집니다',
      memorymp: '시작 시 파도 미리보기 · 내 차례에 카드 선택 · 2:2는 팀원이 한 장씩',
      lanepush: '우클릭 이동 · QWER 스킬 · 1~5 픽 · 미니언 막타로 골드 · 타워→본진 파괴',
      nexuswar: '내 거점에서 드래그해 출동 · Shift 전군 · 상대 본진 점령 승리',
      gomoku: '교차점에 돌을 놓으세요. 5목이 먼저 승리.',
      chess: '기물을 누르면 갈 수 있는 칸이 표시됩니다. 칸을 눌러 이동 · 체크메이트로 승리.',
      janggi: '한국 장기. 시작 전 내상/외상. 졸·병은 처음부터 앞·좌·우(뒤 불가). 포는 반드시 한 점을 뛰어넘고 포끼리 못 넘고 못 잡음. 상은 한 칸 직선+두 칸 대각(막히면 불가). 궁 안 대각. 장군은 피해야 함. 빅장(양왕 마주봄)은 무승부. 장군이 아닐 때 한수쉼, 연속 두 번이면 무승부.',
      yut: '반시계. 첫 출발은 날에서 칸을 세요(도=날 다음, 모=첫 모서리). 윷·모는 바로 안 옮기고 더 던진 뒤 결과를 쌓아 원하는 순서로 이동. 모서리·중심에 멈추면 지름길, 지나치면 직진. 날에 멈추면 아직 안 남 — 한 칸 더 나가야 골인. 업기·잡기, 잡으면 결과 다 쓴 뒤 한 번 더. 빽도는 한 칸 뒤.',
    }[gameId] || '';
  }

  function buildToolbar() {
    if (!refs.tools) return;
    if (gameId === 'rts') {
      var st = lastState || {};
      var age = (st.ages && st.ages[mySlot()] != null) ? st.ages[mySlot()] : 0;
      var tools = [
        ['build:nexus', '확장본진 ·400'],
        ['build:barracks', '배럭 ·150'],
        ['build:turret', '포탑 ·120']
      ];
      tools.push(['upgradeAge', age >= 3 ? '본진 시대 MAX' : ('본진 시대업 ·' + ([0, 5000, 10000, 20000][age + 1] || '—'))]);
      tools.push(['train:worker', '일꾼 ·' + rtsClientWorkerCost(st)]);
      var byAge = [
        [['melee'], ['ranged'], ['duck']],
        [['swordsman'], ['archer']],
        [['knight'], ['crossbow'], ['bomber']],
        [['champion'], ['musketeer'], ['tanker'], ['cannon']]
      ];
      for (var ai = 0; ai <= age && ai < byAge.length; ai++) {
        byAge[ai].forEach(function (u) {
          var id = u[0];
          tools.push(['train:' + id, (RTS_UNIT_LABELS[id] || id) + ' ·' + (RTS_UNIT_COST[id] || '?')]);
        });
      }
      refs.tools.innerHTML = tools.map(function (x) {
        return '<button type="button" class="hkmp-btn" data-tool="' + x[0] + '">' + x[1] + '</button>';
      }).join('');
      refs.tools.setAttribute('data-age', String(age));
      refs.tools.setAttribute('data-wc', String(rtsClientWorkerCost(st)));
      Array.prototype.forEach.call(refs.tools.querySelectorAll('[data-tool]'), function (btn) {
        btn.onclick = function () {
          var key = btn.getAttribute('data-tool');
          if (key === 'upgradeAge') {
            send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'upgradeAge' } });
            toast('본진 시대 업그레이드 요청');
            return;
          }
          var t = key.split(':');
          if (t[0] === 'build') {
            pendingBuild = { mode: 'build', buildType: t[1] };
            toast(t[1] === 'nexus' ? '일꾼 옆에 확장 본진 위치를 클릭' : '건설 위치를 클릭');
            renderToolbarHighlight();
          } else {
            send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'train', unitType: t[1] } });
            pendingBuild = null;
            renderToolbarHighlight();
            toast((RTS_UNIT_LABELS[t[1]] || t[1]) + ' 대기열에 추가');
          }
        };
      });
      refs.tools.setAttribute('data-age', String(age));
      refs.tools.setAttribute('data-wc', String(rtsClientWorkerCost(st)));
      refs.tools.setAttribute('data-rts', String(age) + ':' + String(rtsClientWorkerCost(st)));
    } else if (gameId === 'ageofwar') {
      var stAge = lastState || {};
      var age = (stAge.age && stAge.age[mySlot()] != null) ? stAge.age[mySlot()] : 0;
      var names = aowUnitNames[age] || aowUnitNames[0];
      var costs = aowCosts[age] || aowCosts[0];
      var htmlA = '';
      for (var ui = 0; ui < 3; ui++) {
        htmlA += '<button type="button" class="hkmp-btn" data-aow="spawn:' + ui + '">' + names[ui] + ' ·' + costs[ui] + '</button>';
      }
      htmlA += '<button type="button" class="hkmp-btn primary" data-aow="evolve">시대 진화</button>';
      htmlA += '<button type="button" class="hkmp-btn" data-aow="special">특수공격</button>';
      refs.tools.innerHTML = htmlA;
      Array.prototype.forEach.call(refs.tools.querySelectorAll('[data-aow]'), function (btn) {
        btn.onclick = function () {
          var a = btn.getAttribute('data-aow');
          if (a.indexOf('spawn:') === 0) send({ type: 'input', payload: { action: 'spawn', unitIndex: Number(a.split(':')[1]) } });
          else if (a === 'evolve') send({ type: 'input', payload: { action: 'evolve' } });
          else if (a === 'special') send({ type: 'input', payload: { action: 'special' } });
        };
      });
    } else if (gameId === 'lanepush') {
      var stLp = lastState || {};
      var meLp = findMeLaneChamp(stLp);
      var htmlLp = '';
      if (stLp.phase === 'pick' || !meLp || !meLp.champId) {
        htmlLp = LP_CHAMP_META.map(function (c, i) {
          return '<button type="button" class="hkmp-btn" data-lp="pick:' + c.id + '">' + (i + 1) + '. ' + c.name + ' ·' + c.role + '</button>';
        }).join('');
      } else {
        htmlLp =
          '<button type="button" class="hkmp-btn" data-lp="level:q">Q업</button>' +
          '<button type="button" class="hkmp-btn" data-lp="level:w">W업</button>' +
          '<button type="button" class="hkmp-btn" data-lp="level:e">E업</button>' +
          '<button type="button" class="hkmp-btn" data-lp="level:r">R업</button>' +
          '<button type="button" class="hkmp-btn" data-lp="buy:ad">공격력 ·120</button>' +
          '<button type="button" class="hkmp-btn" data-lp="buy:hp">체력 ·100</button>';
      }
      refs.tools.innerHTML = htmlLp;
      Array.prototype.forEach.call(refs.tools.querySelectorAll('[data-lp]'), function (btn) {
        btn.onclick = function () {
          var a = btn.getAttribute('data-lp').split(':');
          if (a[0] === 'pick') { laneCmd.pick = a[1]; toast('챔피언 선택'); }
          else if (a[0] === 'level') { laneCmd.level = a[1]; toast(a[1].toUpperCase() + ' 스킬 레벨업'); }
          else if (a[0] === 'buy') { laneCmd.buy = a[1]; toast('구매 요청'); }
        };
      });
    } else if (gameId === 'nexuswar') {
      refs.tools.innerHTML =
        '<span class="hkmp-note" style="margin:0">내 거점 → 다른 거점으로 드래그 · Shift=전군 · 절반 기본</span>';
    }
    renderToolbarHighlight();
  }
  function renderToolbarHighlight() {
    if (!refs.tools) return;
    Array.prototype.forEach.call(refs.tools.querySelectorAll('[data-tool]'), function (btn) {
      var t = btn.getAttribute('data-tool');
      var on = false;
      if (gameId === 'rts' && pendingBuild) {
        on = (pendingBuild.mode === 'build' && t === 'build:' + pendingBuild.buildType) ||
          (pendingBuild.mode === 'train' && t === 'train:' + pendingBuild.unitType);
      }
      btn.classList.toggle('active', on);
    });
  }

  function bindCanvas(cv) {
    if (!cv) return;
    function pos(e) {
      var t = e.touches && e.touches[0] ? e.touches[0] : e;
      return canvasToWorld(cv, t.clientX, t.clientY);
    }
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('mousemove', function (e) {
      var p = pos(e); mouse.ax = p.x; mouse.ay = p.y;
      if (drag && drag.mode === 'select') {
        drag.x2 = p.x; drag.y2 = p.y;
        drawFrame();
      }
    });
    cv.addEventListener('mousedown', function (e) {
      var p = pos(e);
      mouse.ax = p.x; mouse.ay = p.y;
      if (e.button === 2) {
        if (gameId === 'rts') {
          var ids = rtsSelectedUnitIds();
          if (!ids.length) {
            toast('먼저 유닛을 선택하세요');
            return;
          }
          var hit = findRtsEntityAt(p.x, p.y);
          var my = mySlot();
          if (hit && hit.owner !== my && hit.hp > 0 && !hit.fogGhost) {
            var ally = false;
            if (lastState && lastState.mode === '2v2') {
              ally = (hit.owner < 2) === (my < 2);
            }
            if (!ally) {
              if (hit.type === 'nexus') {
                send({ type: 'input', payload: { selectIds: ids, cmd: 'move', x: p.x, y: p.y } });
                toast('본진은 유닛으로 공격할 수 없습니다 (포탑·배럭만)');
                return;
              }
              send({ type: 'input', payload: { selectIds: ids, cmd: 'attack', targetId: hit.id, x: p.x, y: p.y } });
              return;
            }
          }
          // Ground / ally click → force move (interrupts attack)
          send({ type: 'input', payload: { selectIds: ids, cmd: 'move', x: p.x, y: p.y } });
        }
        if (gameId === 'lanepush') {
          laneCmd.moveX = p.x;
          laneCmd.moveY = p.y;
        }
        return;
      }
      if (e.button !== 0) return;
      mouse.down = true;
      if (gameId === 'tank') fireLatch = true;
      if (gameId === 'nexuswar') {
        nwDragFrom = findNwNodeAt(p.x, p.y);
        return;
      }
      if (gameId === 'rts') {
        if (pendingBuild) {
          if (pendingBuild.mode === 'build') {
            if (!rtsClientInVision(lastState, p.x, p.y)) {
              toast('밝은 시야에서만 건물을 지을 수 있습니다');
              return;
            }
            if (pendingBuild.buildType === 'turret') {
              var nexus = null;
              var ents = (lastState && lastState.entities) || [];
              for (var ni = 0; ni < ents.length; ni++) {
                if (ents[ni].type === 'nexus' && ents[ni].owner === mySlot()) { nexus = ents[ni]; break; }
              }
              if (nexus && Math.hypot(p.x - nexus.x, p.y - nexus.y) < 110) {
                toast('본진 근처에는 포탑을 지을 수 없습니다');
                return;
              }
            }
          }
          var payload = { selectIds: selectIds.slice(), x: p.x, y: p.y, cmd: 'build' };
          if (pendingBuild.mode === 'build') payload.buildType = pendingBuild.buildType;
          else payload.unitType = pendingBuild.unitType;
          send({ type: 'input', payload: payload });
          pendingBuild = null; renderToolbarHighlight();
          return;
        }
        drag = { mode: 'select', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      }
    });
    cv.addEventListener('mouseup', function (e) {
      mouse.down = false;
      if (gameId === 'nexuswar' && e.button === 0) {
        var pUp = pos(e);
        var toNode = findNwNodeAt(pUp.x, pUp.y);
        if (nwDragFrom && toNode && toNode.id !== nwDragFrom.id) {
          send({
            type: 'input',
            payload: {
              cmd: 'send',
              from: nwDragFrom.id,
              to: toNode.id,
              ratio: e.shiftKey ? 1 : 0.5
            }
          });
          toast((e.shiftKey ? '전군 ' : '절반 ') + '출동');
        }
        nwDragFrom = null;
        drawFrame();
      }
      if (gameId === 'rts' && drag && drag.mode === 'select' && e.button === 0) {
        finishSelect();
        drag = null;
        drawFrame();
      }
    });
    cv.addEventListener('mouseleave', function () { mouse.down = false; });
    cv.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var p = pos(e); mouse.ax = p.x; mouse.ay = p.y; mouse.down = true;
      if (gameId === 'tank') fireLatch = true;
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var p = pos(e); mouse.ax = p.x; mouse.ay = p.y;
    }, { passive: false });
    cv.addEventListener('touchend', function () { mouse.down = false; }, { passive: true });
  }

  function findRtsEntityAt(x, y) {
    var ents = (lastState && lastState.entities) || [];
    var best = null, bd = 1e9;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (!e || e.hp <= 0 || e.fogGhost) continue;
      var hitR;
      if (e.kind === 'building' || e.type === 'nexus' || e.type === 'barracks' || e.type === 'advBarracks' || e.type === 'turret') {
        hitR = Math.max(e.w || 40, e.h || 40) * 0.55;
      } else {
        hitR = (e.r || 12) + 6;
      }
      var d = Math.hypot((e.x || 0) - x, (e.y || 0) - y);
      if (d <= hitR && d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  function rtsSelectedUnitIds() {
    var ents = (lastState && lastState.entities) || [];
    var slot = mySlot();
    var out = [];
    for (var i = 0; i < selectIds.length; i++) {
      for (var j = 0; j < ents.length; j++) {
        var e = ents[j];
        if (!e || e.id != selectIds[i]) continue;
        if (e.kind === 'unit' && e.owner === slot && e.hp > 0 && !e.fogGhost) out.push(e.id);
      }
    }
    return out;
  }
  function finishSelect() {
    if (!lastState || !drag) return;
    var x1 = Math.min(drag.x1, drag.x2), x2 = Math.max(drag.x1, drag.x2);
    var y1 = Math.min(drag.y1, drag.y2), y2 = Math.max(drag.y1, drag.y2);
    var ents = lastState.entities || [];
    var slot = mySlot();
    var tiny = Math.abs(drag.x2 - drag.x1) < 6 && Math.abs(drag.y2 - drag.y1) < 6;
    selectIds = [];
    function hitBox(e, pad) {
      var hw = (e.w || (e.r || 12) * 2) / 2 + (pad || 0);
      var hh = (e.h || (e.r || 12) * 2) / 2 + (pad || 0);
      return Math.abs((e.x || 0) - drag.x1) <= hw && Math.abs((e.y || 0) - drag.y1) <= hh;
    }
    function inRect(e) {
      return (e.x || 0) >= x1 && (e.x || 0) <= x2 && (e.y || 0) >= y1 && (e.y || 0) <= y2;
    }
    if (tiny) {
      // Prefer units under cursor; buildings only if no unit
      var unitHit = null, bldHit = null;
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i];
        if (!e || e.owner !== slot || e.hp <= 0 || e.fogGhost) continue;
        if (e.kind === 'unit') {
          if (Math.hypot((e.x || 0) - drag.x1, (e.y || 0) - drag.y1) < 20) {
            if (!unitHit) unitHit = e;
          }
        } else if (e.type === 'nexus' || e.type === 'barracks' || e.type === 'advBarracks') {
          if (hitBox(e, 4)) {
            if (!bldHit) bldHit = e;
          }
        }
      }
      if (unitHit) selectIds = [unitHit.id];
      else if (bldHit) selectIds = [bldHit.id];
      send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: null } });
      return;
    }
    ents.forEach(function (u) {
      if (!u || u.owner !== slot || u.hp <= 0 || u.fogGhost) return;
      if (u.kind === 'unit' && inRect(u)) selectIds.push(u.id);
      else if ((u.type === 'nexus' || u.type === 'barracks' || u.type === 'advBarracks') && inRect(u)) selectIds.push(u.id);
    });
    send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: null } });
  }

  function updateHud() {
    if (!refs.hud) return;
    var st = lastState || {};
    var html = '';
    if (room && room.code) html += '<span class="hkmp-pill">방 <b>' + esc(room.code) + '</b></span>';
    if (gameId === 'tank') {
      var wins = st.wins || [];
      html += '<span class="hkmp-pill">' + (st.mode === 'team' ? '팀전' : 'FFA') + '</span>';
      html += '<span class="hkmp-pill">생존 <b>' + ((st.tanks || []).filter(function (x) { return !x.eliminated; }).length) + '</b></span>';
      var t = findMeTank(st);
      if (t) {
        var hearts = '';
        var ml = t.maxLives || 3;
        for (var hi = 0; hi < ml; hi++) hearts += hi < (t.lives != null ? t.lives : 0) ? '♥' : '♡';
        html += '<span class="hkmp-pill">목숨 <b style="color:#ff8a7a">' + hearts + '</b></span>';
        html += '<span class="hkmp-pill">HP <b>' + (t.alive ? (t.hp != null ? t.hp : 5) : 0) + '/' + (t.maxHp || 5) + '</b></span>';
        if (t.shield) html += '<span class="hkmp-pill" style="color:#6ec8ff">실드 <b>' + t.shield + '</b></span>';
        if (t.boostUntil && t.boostUntil > Date.now()) html += '<span class="hkmp-pill" style="color:#9ae6b4">부스트</span>';
        if (t.rapidUntil && t.rapidUntil > Date.now()) html += '<span class="hkmp-pill" style="color:#f6ad55">연사</span>';
        if (t.eliminated) html += '<span class="hkmp-pill" style="color:#efd28a">탈락 · 관전</span>';
        else if (!t.alive) html += '<span class="hkmp-pill" style="color:#f6ad55">부활 대기</span>';
      }
    } else if (gameId === 'rts') {
      var golds = st.gold || [];
      html += '<span class="hkmp-pill">' + ((st.mode && RTS_MODE_META[st.mode]) ? RTS_MODE_META[st.mode].label : 'RTS') + '</span>';
      if (st.aiDiff && RTS_AI_DIFF_META[st.aiDiff]) {
        html += '<span class="hkmp-pill">AI <b>' + RTS_AI_DIFF_META[st.aiDiff].label + '</b></span>';
      }
      html += '<span class="hkmp-pill">시대 <b>' + (RTS_AGE_NAMES[(st.ages && st.ages[mySlot()]) || 0] || '암흑시대') + '</b></span>';
      html += '<span class="hkmp-pill">미네랄 <b>' + (golds[mySlot()] != null ? golds[mySlot()] : 0) + '</b></span>';
      html += '<span class="hkmp-pill">선택 <b>' + selectIds.length + '</b></span>';
      (function () {
        var ents = st.entities || [];
        var slotNow = mySlot();
        for (var si = 0; si < selectIds.length; si++) {
          for (var ei = 0; ei < ents.length; ei++) {
            var se = ents[ei];
            if (!se || se.id != selectIds[si] || se.owner !== slotNow) continue;
            if (se.type === 'barracks' || se.type === 'advBarracks') {
              html += '<span class="hkmp-pill" style="color:#9ae6b4">생산지 <b>' +
                (se.type === 'advBarracks' ? '고급배럭' : '배럭') + '</b></span>';
              return;
            }
            if (se.type === 'nexus') {
              html += '<span class="hkmp-pill" style="color:#9ae6b4">생산지 <b>' + esc(se.label || '본진') + '</b></span>';
              return;
            }
          }
        }
      })();
      if (st.mode === '2v2') html += '<span class="hkmp-pill">팀 <b>' + (mySlot() < 2 ? 'A' : 'B') + '</b></span>';
      var qParts = [];
      var meSlot = mySlot();
      (st.entities || []).forEach(function (e) {
        if (e.owner !== meSlot || e.kind !== 'building' || !e.queue || !e.queue.length) return;
        var job = e.queue[0];
        var need = (job && job.need) || 4;
        var left = Math.max(0, need - (e.trainT || 0));
        var label = e.type === 'nexus' ? '본진' : (e.type === 'barracks' ? '배럭' : (e.type === 'advBarracks' ? '고급배럭' : (RTS_UNIT_LABELS[e.type] || e.type)));
        qParts.push(label + ':' + (job.type || '?') + ' ' + left.toFixed(1) + 's' + (e.queue.length > 1 ? ' +' + (e.queue.length - 1) : ''));
      });
      if (qParts.length) html += '<span class="hkmp-pill" style="color:#efd28a">생산 <b>' + qParts.join(' · ') + '</b></span>';
      else html += '<span class="hkmp-pill">생산 <b>대기 없음</b></span>';
    } else if (gameId === 'ageofwar') {
      var gold = st.gold || [];
      var xp = st.xp || [];
      var age = st.age || [];
      var hp = st.baseHp || [];
      var maxHp = st.baseMax || [];
      var me = mySlot();
      html += '<span class="hkmp-pill">시대 <b>' + (aowAgeNames[age[me]] || '?') + '</b></span>';
      html += '<span class="hkmp-pill">골드 <b>' + (gold[me] != null ? gold[me] : 0) + '</b></span>';
      html += '<span class="hkmp-pill">XP <b>' + (xp[me] != null ? xp[me] : 0) + '</b></span>';
      html += '<span class="hkmp-pill">기지 <b>' + Math.max(0, Math.round(hp[me] || 0)) + '/' + Math.round(maxHp[me] || 0) + '</b></span>';
      var scd = (st.specialCd && st.specialCd[me]) || 0;
      html += '<span class="hkmp-pill">특수 <b>' + (scd > 0 ? (scd.toFixed(0) + 's') : 'READY') + '</b></span>';
    } else if (gameId === 'snakes') {
      var snakes = st.snakes || [];
      var alive = snakes.filter(function (s) { return !s.eliminated && s.alive !== false; }).length;
      html += '<span class="hkmp-pill">생존 <b>' + alive + '</b></span>';
      var mine = snakes.filter(function (s) { return s.id === selfId || s.id == selfId; })[0];
      if (mine) {
        var hearts = '';
        var ml = mine.maxLives || 3;
        for (var hi = 0; hi < ml; hi++) hearts += hi < (mine.lives != null ? mine.lives : 0) ? '♥' : '♡';
        html += '<span class="hkmp-pill">목숨 <b style="color:#ff8a7a">' + hearts + '</b></span>';
        html += '<span class="hkmp-pill">길이 <b>' + ((mine.body && mine.body.length) || 0) + '</b></span>';
        html += '<span class="hkmp-pill">점수 <b>' + (mine.score || 0) + '</b></span>';
        if (mine.eliminated) html += '<span class="hkmp-pill" style="color:#efd28a">관전 중</span>';
      }
    } else if (gameId === 'airhockey') {
      var sc = st.score || st.scores || [0, 0];
      html += '<span class="hkmp-pill">점수 <b>' + (sc[0] || 0) + ' : ' + (sc[1] || 0) + '</b></span>';
    } else if (gameId === 'lanepush') {
      var meC = findMeLaneChamp(st);
      html += '<span class="hkmp-pill">' + ((SHARED_MODE_META[st.mode] && SHARED_MODE_META[st.mode].label) || '레인') + '</span>';
      if (st.phase === 'pick') {
        html += '<span class="hkmp-pill" style="color:#9ae6b4">픽 타임 <b>' + Math.max(0, Math.ceil(st.pickLeft || 0)) + 's</b></span>';
      }
      if (meC) {
        var cn = LP_CHAMP_META.filter(function (c) { return c.id === meC.champId; })[0];
        html += '<span class="hkmp-pill">챔프 <b>' + esc((cn && cn.name) || meC.champId || '?') + '</b></span>';
        html += '<span class="hkmp-pill">Lv <b>' + (meC.level || 1) + '</b></span>';
        html += '<span class="hkmp-pill">골드 <b>' + Math.floor(meC.gold || 0) + '</b></span>';
        html += '<span class="hkmp-pill">HP <b>' + Math.max(0, Math.round(meC.hp || 0)) + '/' + Math.round(meC.maxHp || 0) + '</b></span>';
        if (meC.skillPts > 0) html += '<span class="hkmp-pill" style="color:#9ae6b4">스킬포인트 <b>' + meC.skillPts + '</b></span>';
        var cds = meC.cds || {};
        html += '<span class="hkmp-pill">Q' + (cds.q > 0 ? Math.ceil(cds.q) : '✓') +
          ' W' + (cds.w > 0 ? Math.ceil(cds.w) : '✓') +
          ' E' + (cds.e > 0 ? Math.ceil(cds.e) : '✓') +
          ' R' + (cds.r > 0 ? Math.ceil(cds.r) : '✓') + '</span>';
      }
    } else if (gameId === 'nexuswar') {
      html += '<span class="hkmp-pill">' + ((SHARED_MODE_META[st.mode] && SHARED_MODE_META[st.mode].label) || '점령') + '</span>';
      var myOwn = nwOwnerKeyClient(mySlot(), st.mode);
      var mineNodes = (st.nodes || []).filter(function (n) { return n.owner === myOwn; }).length;
      var myUnits = (st.nodes || []).reduce(function (a, n) { return a + (n.owner === myOwn ? n.units : 0); }, 0);
      html += '<span class="hkmp-pill">거점 <b>' + mineNodes + '</b></span>';
      html += '<span class="hkmp-pill">병력 <b>' + Math.floor(myUnits) + '</b></span>';
      html += '<span class="hkmp-pill">함대 <b>' + ((st.fleets || []).filter(function (f) { return f.owner === myOwn; }).length) + '</b></span>';
    } else if (gameId === 'memorymp') {
      var scores = st.scores || [];
      var label = (MEMORY_MODE_META[st.mode] && MEMORY_MODE_META[st.mode].label) || st.mode || '';
      var previewingHud = !!(st.previewing || (st.previewEnds && st.previewEnds > Date.now()));
      html += '<span class="hkmp-pill">' + esc(label) + (st.pairs ? ' · ' + st.pairs + '쌍' : '') + '</span>';
      html += '<span class="hkmp-pill">매치 <b>' + (st.matched || 0) + '/' + (st.pairs || 0) + '</b></span>';
      if (st.mode === '2v2') {
        html += '<span class="hkmp-pill">점수 <b>팀A ' + (scores[0] || 0) + ' : 팀B ' + (scores[1] || 0) + '</b></span>';
        if (!previewingHud) html += '<span class="hkmp-pill">턴 <b>팀' + ((st.turnTeam === 1) ? 'B' : 'A') + '</b></span>';
      } else {
        var scoreBits = (st.playerMeta || []).map(function (pm, i) {
          return esc(pm.name || ('P' + (i + 1))) + ' ' + (scores[pm.slot != null ? pm.slot : i] || 0);
        });
        if (scoreBits.length) html += '<span class="hkmp-pill">점수 <b>' + scoreBits.join(' · ') + '</b></span>';
      }
      if (previewingHud) {
        html += '<span class="hkmp-pill" style="color:#9ae6b4">미리보기</span>';
      } else {
        var pickerName = '';
        (st.playerMeta || []).forEach(function (pm) {
          if (pm.id === st.currentPickerId || pm.id == st.currentPickerId) pickerName = pm.name;
        });
        var myTurnHud = st.currentPickerId != null && (st.currentPickerId === selfId || st.currentPickerId == selfId);
        html += '<span class="hkmp-pill" style="color:' + (myTurnHud ? '#9ae6b4' : '#efd28a') + '">' +
          (myTurnHud ? '내 차례' : ('차례 · ' + esc(pickerName || '?'))) + '</span>';
      }
    } else if (isBoard()) {
      var blabel = (BOARD_MODE_META[st.mode] && BOARD_MODE_META[st.mode].label) || st.mode || '';
      html += '<span class="hkmp-pill">' + esc(blabel) + '</span>';
      var turnName = '';
      (st.playerMeta || []).forEach(function (pm) {
        if (pm.id === st.turnId || pm.id == st.turnId) turnName = pm.name;
      });
      var myB = st.turnId != null && (st.turnId === selfId || st.turnId == selfId);
      if (!(gameId === 'janggi' && st.pending === 'setup')) {
        html += '<span class="hkmp-pill" style="color:' + (myB ? '#9ae6b4' : '#efd28a') + '">' + (myB ? '내 차례' : ('차례 · ' + esc(turnName || '?'))) + '</span>';
      }
      if (gameId === 'janggi') {
        html += '<span class="hkmp-pill">' + (boardMySide() === 0 ? '초(楚)' : '한(漢)') + '</span>';
        if (st.pending === 'setup') html += '<span class="hkmp-pill" style="color:#efd28a">상·마 배치</span>';
        if (st.check) html += '<span class="hkmp-pill" style="color:#ff8a7a">장군!</span>';
      }
      if (st.log) html += '<span class="hkmp-pill">' + esc(st.log) + '</span>';
      if (gameId === 'gomoku' && st.stones != null) html += '<span class="hkmp-pill">돌 <b>' + st.stones + '</b></span>';
      if (gameId === 'yut' && st.mals) {
        var yt = boardMySide();
        var leftM = st.mals.filter(function (m) { return m.team === yt && !m.home; }).length;
        html += '<span class="hkmp-pill" style="color:' + yutTeamColor(st.turnTeam != null ? st.turnTeam : yt) + '"><b>' +
          yutTeamName(st.turnTeam != null ? st.turnTeam : yt) + '팀</b> 차례</span>';
        html += '<span class="hkmp-pill">남은 말 <b>' + leftM + '/4</b></span>';
        if (st.turnThrows && st.turnThrows.length) html += '<span class="hkmp-pill">' + esc(st.turnThrows.join(' → ')) + '</span>';
        else if (st.lastYut) html += '<span class="hkmp-pill">' + esc(st.lastYut.name || '') + '</span>';
      }
    }
    refs.hud.innerHTML = html;
    if (gameId === 'rts' && refs.tools && view === 'play') {
      var ageRts = (st.ages && st.ages[mySlot()] != null) ? st.ages[mySlot()] : 0;
      var wcRts = rtsClientWorkerCost(st);
      var rtsKey = String(ageRts) + ':' + String(wcRts);
      if (refs.tools.getAttribute('data-rts') !== rtsKey) {
        refs.tools.setAttribute('data-rts', rtsKey);
        buildToolbar();
      } else {
        var wBtn = refs.tools.querySelector('[data-tool="train:worker"]');
        if (wBtn) wBtn.textContent = '일꾼 ·' + wcRts;
      }
    }
    if (gameId === 'lanepush' && refs.tools && view === 'play') {
      var phaseKey = String((st.phase || '') + ':' + !!(findMeLaneChamp(st) && findMeLaneChamp(st).champId));
      if (refs.tools.getAttribute('data-lp') !== phaseKey) {
        refs.tools.setAttribute('data-lp', phaseKey);
        buildToolbar();
      }
    }
    if (gameId === 'ageofwar' && refs.tools && view === 'play') {
      var ageNow = (st.age && st.age[mySlot()] != null) ? st.age[mySlot()] : 0;
      if (refs.tools.getAttribute('data-age') !== String(ageNow)) {
        refs.tools.setAttribute('data-age', String(ageNow));
        buildToolbar();
      }
    }
  }

  function drawFrame() {
    if (gameId === 'memorymp') {
      updateMemoryBoard();
      return;
    }
    if (isBoard()) {
      updateBoardUi();
      return;
    }
    var cv = refs.canvas;
    if (!cv || gamePaused) return;
    var st = lastState;
    if (st) {
      if (gameId === 'tank') {
        var ds = defaultSize();
        canvasW = ds.w; canvasH = ds.h;
      } else {
        canvasW = st.W || st.w || st.width || canvasW;
        canvasH = st.H || st.h || st.height || canvasH;
      }
      if (cv.width !== canvasW) cv.width = canvasW;
      if (cv.height !== canvasH) cv.height = canvasH;
    }
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    fillBg(ctx, cv.width, cv.height);
    if (!st) {
      ctx.fillStyle = '#88a09a'; ctx.font = '16px Georgia,serif'; ctx.textAlign = 'center';
      ctx.fillText('상태 동기화 중…', cv.width / 2, cv.height / 2);
      return;
    }
    try {
      if (gameId === 'tank') drawTank(ctx, st);
      else if (gameId === 'rts') drawRts(ctx, st);
      else if (gameId === 'ageofwar') drawAgeOfWar(ctx, st);
      else if (gameId === 'snakes') drawSnakes(ctx, st);
      else if (gameId === 'airhockey') drawHockey(ctx, st);
      else if (gameId === 'lanepush') drawLanePush(ctx, st);
      else if (gameId === 'nexuswar') drawNexusWar(ctx, st);
    } catch (err) {
      if (window.console) console.error('draw', gameId, err);
      ctx.fillStyle = '#ff8a7a';
      ctx.font = '14px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText('화면 오류 — 새로고침 해주세요', canvasW / 2, canvasH / 2);
    }
    if (drag && drag.mode === 'select') {
      ctx.strokeStyle = '#efd28a'; ctx.lineWidth = 1;
      ctx.strokeRect(Math.min(drag.x1, drag.x2), Math.min(drag.y1, drag.y2), Math.abs(drag.x2 - drag.x1), Math.abs(drag.y2 - drag.y1));
    }
  }

  function fillBg(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#12363c'); g.addColorStop(1, '#07151a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  function drawTank(ctx, st) {
    var me = findMeTank(st);
    var cam = getTankCamera(st, 0);
    var camX = cam.camX, camY = cam.camY;
    var viewW = cam.viewW, viewH = cam.viewH;
    var worldW = cam.worldW, worldH = cam.worldH;
    var scale = Math.min(canvasW / viewW, canvasH / viewH);
    ctx.save();
    ctx.translate((canvasW - viewW * scale) / 2, (canvasH - viewH * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);

    ctx.fillStyle = '#0a1a1f';
    ctx.fillRect(0, 0, worldW, worldH);
    ctx.strokeStyle = '#ffffff0c';
    for (var gx = 0; gx < worldW; gx += 120) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, worldH); ctx.stroke(); }
    for (var gy = 0; gy < worldH; gy += 120) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(worldW, gy); ctx.stroke(); }

    (st.walls || []).forEach(function (w) {
      if (w.hp != null && w.hp <= 0) return;
      ctx.fillStyle = w.solid ? '#2a4a4e' : '#5a3a2a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      if (!w.solid && w.hp != null) {
        ctx.fillStyle = '#0008'; ctx.fillRect(w.x, w.y - 6, w.w, 3);
        ctx.fillStyle = '#f6ad55'; ctx.fillRect(w.x, w.y - 6, w.w * (w.hp / 3), 3);
      }
    });
    (st.items || []).forEach(function (it) {
      if (!it || it.taken) return;
      var col = it.type === 'heal' ? '#9ae6b4' : it.type === 'speed' ? '#6ec8ff' : it.type === 'shield' ? '#c4b5fd' : '#f6ad55';
      var label = it.type === 'heal' ? '+' : it.type === 'speed' ? '≫' : it.type === 'shield' ? '◇' : '⚡';
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.fillStyle = col + '33';
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a1a1f';
      ctx.font = 'bold 11px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 1);
      ctx.restore();
    });
    (st.bullets || []).forEach(function (b) {
      ctx.fillStyle = '#efd28a';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    (st.tanks || []).forEach(function (tk, i) {
      if (!tk.alive) return;
      var col = COLORS[tk.slot != null ? tk.slot : i];
      ctx.save();
      ctx.translate(tk.x, tk.y);
      if ((tk.shield || 0) > 0) {
        ctx.strokeStyle = '#c4b5fdcc';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(tk.aim || 0);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24, 0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#0008'; ctx.fillRect(tk.x - 14, tk.y - 26, 28, 4);
      ctx.fillStyle = '#9ae6b4'; ctx.fillRect(tk.x - 14, tk.y - 26, 28 * Math.max(0, (tk.hp || 5) / (tk.maxHp || 5)), 4);
      drawNameTag(ctx, (tk.name || ('P' + (i + 1))) + (tk.isAi ? ' ·AI' : ''), tk.x, tk.y - 34, COLORS[tk.slot != null ? tk.slot : i]);
      var lifeMarks = '';
      var mlv = tk.maxLives || 3;
      for (var li = 0; li < mlv; li++) lifeMarks += li < (tk.lives != null ? tk.lives : 0) ? '♥' : '♡';
      ctx.save();
      ctx.font = '11px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8a7a';
      ctx.fillText(lifeMarks, tk.x, tk.y - 46);
      ctx.restore();
      if (st.mode === 'team') {
        ctx.fillStyle = tk.team === 0 ? '#6ec8ff' : '#ff8a7a';
        ctx.fillRect(tk.x - 10, tk.y + 20, 20, 3);
      }
    });
    ctx.restore();

    var mmW = 168, mmH = 118, mmX = canvasW - mmW - 12, mmY = 12;
    ctx.fillStyle = '#000a'; ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
    ctx.fillStyle = '#0d2429'; ctx.fillRect(mmX, mmY, mmW, mmH);
    var sx = mmW / worldW, sy = mmH / worldH;
    ctx.strokeStyle = '#efd28a88'; ctx.strokeRect(mmX + camX * sx, mmY + camY * sy, viewW * sx, viewH * sy);
    (st.items || []).forEach(function (it) {
      if (!it || it.taken) return;
      ctx.fillStyle = it.type === 'heal' ? '#9ae6b4' : it.type === 'speed' ? '#6ec8ff' : it.type === 'shield' ? '#c4b5fd' : '#f6ad55';
      ctx.fillRect(mmX + it.x * sx - 1.5, mmY + it.y * sy - 1.5, 3, 3);
    });
    (st.tanks || []).forEach(function (tk, i) {
      if (!tk.alive) return;
      ctx.fillStyle = COLORS[tk.slot != null ? tk.slot : i];
      ctx.fillRect(mmX + tk.x * sx - 2, mmY + tk.y * sy - 2, 4, 4);
    });

    if (me && (!me.alive || me.eliminated)) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, canvasH - 40, canvasW, 40);
      ctx.fillStyle = '#efd28a';
      ctx.font = 'bold 15px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText(me.eliminated ? '탈락 · WASD로 시야 이동' : '부활 대기 · WASD로 시야 이동', canvasW / 2, canvasH - 15);
    }
  }

  function drawAowUnit(ctx, u, col) {
    var x = u.x;
    var y = u.y;
    var r = u.r || 12;
    var facing = u.owner === 0 ? 1 : -1;
    var t = u.type || '';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);

    function body(shade) {
      ctx.fillStyle = shade || col;
    }
    function strokeSoft() {
      ctx.strokeStyle = '#0007';
      ctx.lineWidth = 1.5;
    }

    if (t === 'club') {
      body();
      ctx.beginPath(); ctx.ellipse(0, -r * 0.9, r * 0.7, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(r * 0.2, -r * 1.6, 5, r * 1.4);
      ctx.beginPath(); ctx.arc(r * 0.45, -r * 1.7, 7, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'sling') {
      body();
      ctx.beginPath(); ctx.ellipse(0, -r * 0.85, r * 0.55, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r * 0.9, -r * 1.2, 10, -0.8, 0.8); ctx.stroke();
      ctx.fillStyle = '#8a6a40';
      ctx.beginPath(); ctx.arc(r * 1.5, -r * 1.35, 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'dino') {
      body('#3d6b45');
      ctx.beginPath(); ctx.ellipse(2, -r * 0.7, r * 1.15, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      body();
      ctx.beginPath(); ctx.ellipse(r * 0.95, -r * 1.15, r * 0.55, r * 0.45, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5f0df';
      ctx.fillRect(-r * 0.9, -r * 0.2, 5, r * 0.55);
      ctx.fillRect(r * 0.15, -r * 0.15, 5, r * 0.5);
      ctx.fillStyle = '#efd28a';
      ctx.beginPath(); ctx.moveTo(r * 1.4, -r * 1.1); ctx.lineTo(r * 1.85, -r * 0.95); ctx.lineTo(r * 1.35, -r * 0.85); ctx.fill();
    } else if (t === 'sword') {
      body();
      ctx.beginPath(); ctx.moveTo(0, -r * 1.7); ctx.lineTo(r * 0.65, -r * 0.2); ctx.lineTo(0, 0); ctx.lineTo(-r * 0.65, -r * 0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8dde6';
      ctx.fillRect(r * 0.35, -r * 1.85, 4, r * 1.2);
      ctx.fillStyle = '#8a7040';
      ctx.fillRect(r * 0.15, -r * 0.7, 12, 3);
    } else if (t === 'archer') {
      body();
      ctx.beginPath(); ctx.ellipse(0, -r * 0.9, r * 0.5, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(r * 0.55, -r, 12, -1.2, 1.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.55, -r - 12); ctx.lineTo(r * 0.55, -r + 12); ctx.stroke();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r); ctx.lineTo(r * 1.4, -r); ctx.stroke();
    } else if (t === 'knight') {
      body('#5a6a78');
      ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 1.1, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      body();
      ctx.beginPath(); ctx.ellipse(r * 0.35, -r * 1.15, r * 0.5, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efd28a';
      ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 1.7); ctx.lineTo(r * 0.55, -r * 1.25); ctx.lineTo(r * 0.15, -r * 1.25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(-r * 0.7, -r * 0.15, 5, r * 0.45);
      ctx.fillRect(r * 0.35, -r * 0.1, 5, r * 0.4);
    } else if (t === 'duel') {
      body();
      ctx.beginPath(); ctx.ellipse(0, -r * 1.05, r * 0.45, r * 1.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8eef8';
      ctx.fillRect(r * 0.4, -r * 2.0, 3, r * 1.5);
      ctx.fillStyle = '#8a7040';
      ctx.fillRect(r * 0.25, -r * 0.55, 10, 2.5);
    } else if (t === 'musket') {
      body();
      ctx.beginPath(); ctx.ellipse(0, -r * 0.9, r * 0.5, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a2a18';
      ctx.fillRect(r * 0.2, -r * 1.15, r * 1.6, 5);
      ctx.fillStyle = '#2a2010';
      ctx.fillRect(r * 0.15, -r * 0.85, 8, 10);
    } else if (t === 'cannon') {
      body('#4a5560');
      ctx.fillRect(-r * 0.9, -r * 0.55, r * 1.8, r * 0.55);
      ctx.fillStyle = '#2a3038';
      ctx.beginPath(); ctx.arc(-r * 0.55, -2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.55, -2, 7, 0, Math.PI * 2); ctx.fill();
      body('#6a7380');
      ctx.fillRect(r * 0.2, -r * 0.95, r * 1.35, 10);
      ctx.fillStyle = '#1a1e24';
      ctx.beginPath(); ctx.arc(r * 1.5, -r * 0.75, 5, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'meleeInf') {
      body();
      ctx.fillRect(-r * 0.55, -r * 1.4, r * 1.1, r * 1.4);
      ctx.fillStyle = '#2a3038';
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 1.4); ctx.lineTo(0, -r * 1.85); ctx.lineTo(r * 0.5, -r * 1.4); ctx.fill();
      ctx.fillStyle = '#c0c8d0';
      ctx.fillRect(r * 0.4, -r * 1.5, 4, r * 1.1);
    } else if (t === 'infantry') {
      body();
      ctx.fillRect(-r * 0.5, -r * 1.35, r, r * 1.35);
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(-r * 0.55, -r * 1.5, r * 1.1, 8);
      ctx.fillStyle = '#3a3228';
      ctx.fillRect(r * 0.25, -r * 1.2, r * 1.4, 4);
    } else if (t === 'tankU') {
      body('#4a5a48');
      ctx.fillRect(-r * 1.05, -r * 0.7, r * 2.1, r * 0.7);
      ctx.fillStyle = '#2a3428';
      ctx.fillRect(-r * 1.1, -r * 0.25, r * 2.2, 10);
      body();
      ctx.fillRect(-r * 0.45, -r * 1.15, r * 0.9, r * 0.55);
      ctx.fillStyle = '#1a2018';
      ctx.fillRect(r * 0.2, -r * 0.95, r * 1.3, 6);
    } else if (t === 'blade') {
      body('#5a7a9a');
      ctx.beginPath(); ctx.moveTo(0, -r * 1.75); ctx.lineTo(r * 0.55, -r * 0.15); ctx.lineTo(0, 0); ctx.lineTo(-r * 0.55, -r * 0.15); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7ef0ff'; ctx.lineWidth = 2.5; ctx.shadowColor = '#7ef0ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.4); ctx.lineTo(r * 0.55, -r * 2.0); ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (t === 'blaster') {
      body('#6a5a9a');
      ctx.beginPath(); ctx.ellipse(0, -r * 0.95, r * 0.55, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c080ff';
      ctx.fillRect(r * 0.25, -r * 1.2, r * 1.35, 6);
      ctx.beginPath(); ctx.arc(r * 1.55, -r * 1.05, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efd28a';
      ctx.beginPath(); ctx.arc(0, -r * 1.55, 4, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'war') {
      body('#3a4a5a');
      ctx.fillRect(-r * 1.1, -r * 1.35, r * 2.2, r * 1.1);
      ctx.fillStyle = '#1a2430';
      ctx.fillRect(-r * 0.95, -r * 0.35, 10, r * 0.55);
      ctx.fillRect(r * 0.35, -r * 0.35, 10, r * 0.55);
      body('#5ad0e8');
      ctx.fillRect(-r * 0.35, -r * 1.85, r * 0.7, r * 0.55);
      ctx.fillStyle = '#7ef0ff';
      ctx.fillRect(r * 0.55, -r * 1.55, r * 1.2, 7);
    } else {
      body();
      ctx.beginPath(); ctx.arc(0, -r, r, 0, Math.PI * 2); ctx.fill();
    }

    // feet / ground contact hint
    ctx.fillStyle = '#0003';
    ctx.beginPath(); ctx.ellipse(0, -2, r * 0.7, 4, 0, 0, Math.PI * 2); ctx.fill();
    strokeSoft();
    ctx.restore();
  }

  function drawAgeOfWar(ctx, st) {
    var w = canvasW, h = canvasH;
    var ages = st.age || [0, 0];
    var sk = ['#1a1510', '#152018', '#1a2030', '#101820', '#0b1020'][Math.max(ages[0] || 0, ages[1] || 0)] || '#122022';
    ctx.fillStyle = sk; ctx.fillRect(0, 0, w, h);
    var gy = st.groundY || 320;
    ctx.fillStyle = '#2a3a2a'; ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = '#3d5238'; ctx.fillRect(0, gy, w, 8);

    function drawBase(x, owner) {
      var hp = (st.baseHp && st.baseHp[owner]) || 0;
      var mx = (st.baseMax && st.baseMax[owner]) || 1;
      var age = ages[owner] || 0;
      ctx.fillStyle = COLORS[owner];
      if (age >= 4) {
        ctx.fillRect(x - 40, gy - 100, 80, 100);
        ctx.fillStyle = '#7ef0ff66';
        ctx.fillRect(x - 28, gy - 88, 56, 36);
      } else if (age >= 2) {
        ctx.fillRect(x - 38, gy - 95, 76, 95);
        ctx.fillStyle = '#0005';
        ctx.fillRect(x - 30, gy - 70, 22, 28);
        ctx.fillRect(x + 8, gy - 70, 22, 28);
      } else {
        ctx.fillRect(x - 36, gy - 90, 72, 90);
        ctx.fillStyle = '#0006'; ctx.fillRect(x - 28, gy - 70, 56, 40);
      }
      ctx.fillStyle = '#0008'; ctx.fillRect(x - 34, gy - 108, 68, 5);
      ctx.fillStyle = '#9ae6b4'; ctx.fillRect(x - 34, gy - 108, 68 * Math.max(0, hp / mx), 5);
      ctx.fillStyle = '#f5f0df'; ctx.font = '12px Georgia,serif'; ctx.textAlign = 'center';
      ctx.fillText(aowAgeNames[age] || '', x, gy - 116);
    }
    drawBase(70, 0);
    drawBase(w - 70, 1);

    (st.units || []).forEach(function (u) {
      if (u.hp <= 0) return;
      drawAowUnit(ctx, u, COLORS[u.owner || 0]);
      var top = u.y - (u.r || 12) * 1.9 - 6;
      ctx.fillStyle = '#0008'; ctx.fillRect(u.x - 14, top, 28, 3);
      ctx.fillStyle = '#9ae6b4'; ctx.fillRect(u.x - 14, top, 28 * Math.max(0, u.hp / (u.maxHp || 1)), 3);
    });

    (st.fx || []).forEach(function (f) {
      if (f.kind === 'shot') {
        ctx.strokeStyle = (COLORS[f.owner || 0] || '#efd28a') + 'cc';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(f.x2, f.y2, 3, 0, Math.PI * 2); ctx.fill();
      }
      if (f.kind === 'special') {
        ctx.fillStyle = 'rgba(239,210,138,0.18)';
        ctx.fillRect(0, gy - 120, w, 120);
      }
      if (f.kind === 'evolve') {
        ctx.fillStyle = COLORS[f.owner || 0];
        ctx.globalAlpha = Math.min(1, f.life);
        ctx.font = 'bold 28px Georgia,serif'; ctx.textAlign = 'center';
        ctx.fillText('EVOLVE!', f.owner === 0 ? 160 : w - 160, gy - 140);
        ctx.globalAlpha = 1;
      }
    });
  }


  function rtsUnitAtkStyle(type) {
    if (type === 'bomber') return 'boom';
    if (type === 'musketeer') return 'shot';
    if (type === 'cannon') return 'cannon';
    if (type === 'archer' || type === 'ranged' || type === 'crossbow') return 'arrow';
    if (type === 'knight') return 'thrust';
    return 'slash';
  }
  function rtsNoteUnitAttack(e) {
    if (!e || e.id == null) return;
    var prev = rtsAtkPrevCd[e.id];
    var cd = e.atkCd != null ? e.atkCd : 0;
    var flash = e.atkFlash != null ? e.atkFlash : 0;
    var fired = flash > 0.05 || (prev != null && cd > prev + 0.08);
    rtsAtkPrevCd[e.id] = cd;
    if (!fired) return;
    var ang = 0;
    if (e.faceX != null && e.faceY != null) ang = Math.atan2(e.faceY - e.y, e.faceX - e.x);
    else if (e.tx != null && e.ty != null) ang = Math.atan2(e.ty - e.y, e.tx - e.x);
    rtsAtkSwing[e.id] = {
      until: Date.now() + 220,
      ang: ang,
      style: rtsUnitAtkStyle(e.type),
      t0: Date.now()
    };
  }
  function drawRtsUnitShape(ctx, e, col) {
    var r = e.r || 8;
    var t = e.type;
    var swing = rtsAtkSwing[e.id];
    var now = Date.now();
    var swingT = 0;
    var ang = 0;
    if (swing && swing.until > now) {
      swingT = Math.min(1, (now - swing.t0) / 200);
      ang = swing.ang || 0;
    } else if (e.faceX != null && e.faceY != null) {
      ang = Math.atan2(e.faceY - e.y, e.faceX - e.x);
    } else if (e.tx != null && e.ty != null) {
      ang = Math.atan2(e.ty - e.y, e.tx - e.x);
    }
    // Attack body motion: wind-up then lunge
    var lunge = 0;
    var squash = 1;
    if (swingT > 0) {
      if (swingT < 0.35) {
        lunge = -3 * (swingT / 0.35);
        squash = 1.08;
      } else {
        var f = (swingT - 0.35) / 0.65;
        lunge = 7 * Math.sin(f * Math.PI);
        squash = 1 - 0.12 * Math.sin(f * Math.PI);
      }
    }
    var bob = Math.sin((now / 140) + (e.id || 0)) * (t === 'duck' ? 2.2 : 0.8);
    var x = e.x + Math.cos(ang) * lunge;
    var y = e.y + bob + Math.sin(ang) * lunge;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang * 0.15);
    ctx.scale(1 / squash, squash);
    ctx.translate(-x, -y);
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0009';
    ctx.lineWidth = 1.6;

    if (t === 'worker') {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.95, y + r * 0.75);
      ctx.lineTo(x - r * 0.95, y + r * 0.75);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c4a574';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + r * 0.2, y - r * 0.2);
      ctx.lineTo(x + r * 1.15, y - r * 0.9);
      ctx.stroke();
      ctx.fillStyle = '#8b7355';
      ctx.beginPath(); ctx.arc(x + r * 1.2, y - r, 3.5, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'melee') {
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y + 1, r * 0.75, r * 1.1, 0.15, 0, Math.PI * 2);
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + (swingT > 0 ? (-0.9 + swingT * 2.2) : 0.2));
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(2, -2, r * 1.35, 4);
      ctx.beginPath();
      ctx.moveTo(r * 1.35 + 2, -5);
      ctx.lineTo(r * 1.7 + 2, 0);
      ctx.lineTo(r * 1.35 + 2, 5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (t === 'swordsman') {
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y, r * 0.7, r * 1.05, 0, 0, Math.PI * 2);
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      var sw = swingT > 0 ? (-1.1 + swingT * 2.4) : 0.35;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-r * 0.2, 2); ctx.lineTo(Math.cos(sw) * r * 1.5, Math.sin(sw) * r * 1.5 - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.2, 2); ctx.lineTo(Math.cos(sw + 0.9) * r * 1.35, Math.sin(sw + 0.9) * r * 1.35 - 2); ctx.stroke();
      ctx.restore();
    } else if (t === 'champion') {
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y, r * 0.85, r * 1.15, 0, 0, Math.PI * 2);
      else ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6e05e';
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.55);
      ctx.lineTo(x + 7, y - r * 1.05);
      ctx.lineTo(x + 3, y - r * 1.05);
      ctx.lineTo(x + 3, y - r * 0.7);
      ctx.lineTo(x - 3, y - r * 0.7);
      ctx.lineTo(x - 3, y - r * 1.05);
      ctx.lineTo(x - 7, y - r * 1.05);
      ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + (swingT > 0 ? (-0.7 + swingT * 1.8) : 0.15));
      ctx.fillStyle = '#f6e05e';
      ctx.fillRect(4, -2.5, r * 1.5, 5);
      ctx.restore();
      if (swingT > 0.3) {
        ctx.strokeStyle = '#f6e05e88';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 4 + swingT * 8, ang - 1.2, ang + 1.2); ctx.stroke();
      }
    } else if (t === 'ranged' || t === 'archer' || t === 'crossbow') {
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.85, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.85, y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      var pull = swingT > 0 && swingT < 0.45 ? -4 : (swingT >= 0.45 ? 6 : 0);
      ctx.strokeStyle = t === 'crossbow' ? '#ed8936' : '#68d391';
      ctx.lineWidth = t === 'crossbow' ? 2.5 : 2;
      ctx.beginPath(); ctx.arc(2, 0, r * 1.0, -1.1, 1.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.3, 0); ctx.lineTo(r * 1.15 + pull, 0); ctx.stroke();
      if (swingT > 0.4) {
        ctx.fillStyle = '#f5f0df';
        ctx.fillRect(r * 0.6, -1.5, r * 0.9, 3);
      }
      ctx.restore();
    } else if (t === 'musketeer') {
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      var kick = swingT > 0.35 ? -3 : (swingT > 0 ? 2 : 0);
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(-4 + kick, -3, r * 1.7, 5);
      ctx.fillStyle = '#f6e05e';
      ctx.beginPath(); ctx.arc(r * 1.55 + kick, -0.5, 2.5, 0, Math.PI * 2); ctx.fill();
      if (swingT > 0.35 && swingT < 0.85) {
        ctx.fillStyle = '#fff8';
        ctx.beginPath(); ctx.arc(r * 1.9, 0, 4 + (1 - swingT) * 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (t === 'knight') {
      var kw = r * 1.9, kh = r * 1.25;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - kw / 2, y - kh / 2, kw, kh, 4);
      else ctx.rect(x - kw / 2, y - kh / 2, kw, kh);
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + (swingT > 0 ? (-0.4 + swingT * 1.1) : 0));
      ctx.fillStyle = '#f6e05e';
      ctx.beginPath();
      ctx.moveTo(kw / 2 - 2, 0);
      ctx.lineTo(kw / 2 + r * 1.0, -5);
      ctx.lineTo(kw / 2 + r * 1.0, 5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#c53030';
      ctx.fillRect(x - 3, y - kh / 2 - 6, 6, 6);
    } else if (t === 'tanker') {
      var tw = r * 2.3, th = r * 1.7;
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(x - tw / 2, y - th / 2, tw, th);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - tw / 2, y - th / 2, tw, th);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(x - tw / 2 - 3, y - th / 2, 4, th);
      if (swingT > 0) {
        ctx.strokeStyle = '#63b3edaa';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 8 + swingT * 10, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (t === 'bomber') {
      ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c53030';
      ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f6e05e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.9);
      ctx.quadraticCurveTo(x + 6, y - r * 1.4, x + 2, y - r * 1.7);
      ctx.stroke();
      if (swingT > 0) {
        ctx.strokeStyle = '#fc8181';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, r + swingT * 28, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (t === 'cannon') {
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(x - r * 0.9, y - r * 0.55, r * 1.8, r * 1.1);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x - r * 0.55, y + r * 0.55, r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.45, y + r * 0.55, r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      var recoil = swingT > 0.3 ? -5 : 0;
      ctx.fillStyle = '#1a202c';
      ctx.fillRect(r * 0.1 + recoil, -4, r * 1.5, 7);
      ctx.fillStyle = '#e53e3e';
      ctx.beginPath(); ctx.arc(r * 1.6 + recoil, -0.5, 3, 0, Math.PI * 2); ctx.fill();
      if (swingT > 0.35 && swingT < 0.9) {
        ctx.fillStyle = '#f6ad55';
        ctx.beginPath(); ctx.arc(r * 2.0, 0, 5 + (1 - swingT) * 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (t === 'duck') {
      ctx.fillStyle = '#ecc94b';
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y + 2, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + r * 0.6, y - r * 0.35, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dd6b20';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.95, y - r * 0.35);
      ctx.lineTo(x + r * 1.55, y - r * 0.15);
      ctx.lineTo(x + r * 0.95, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c53030';
      ctx.beginPath(); ctx.arc(x + r * 0.75, y - r * 0.45, 2, 0, Math.PI * 2); ctx.fill();
      if (swingT > 0) {
        ctx.strokeStyle = '#dd6b20aa';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 4 + swingT * 8, ang - 1, ang + 1); ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRtsAttackBeams(ctx, st) {
    (st.beams || []).forEach(function (b) {
      var life = b.life != null ? b.life : 0;
      var maxL = b.maxLife || 0.2;
      var prog = 1 - Math.max(0, Math.min(1, life / maxL));
      var style = b.style || 'slash';
      var col = COLORS[b.owner != null ? b.owner : 0] || '#efd28a';
      if (b.fromId != null && !rtsAtkSwing[b.fromId]) {
        rtsAtkSwing[b.fromId] = {
          until: Date.now() + 220,
          ang: Math.atan2(b.y2 - b.y1, b.x2 - b.x1),
          style: style,
          t0: Date.now()
        };
      }
      if (style === 'boom') {
        var rad = 10 + prog * 42;
        ctx.strokeStyle = '#fc8181';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 1 - prog;
        ctx.beginPath(); ctx.arc(b.x1, b.y1, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#f6ad5588';
        ctx.beginPath(); ctx.arc(b.x1, b.y1, rad * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }
      if (style === 'slash' || style === 'thrust') {
        var mid = prog < 0.5 ? prog * 2 : 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = style === 'thrust' ? 3 : 2.5;
        ctx.globalAlpha = 0.95 - prog * 0.7;
        ctx.beginPath();
        ctx.arc(b.x1, b.y1, 18 + mid * 10, Math.atan2(b.y2 - b.y1, b.x2 - b.x1) - 1.1, Math.atan2(b.y2 - b.y1, b.x2 - b.x1) + 0.4);
        ctx.stroke();
        if (style === 'thrust') {
          var tx = b.x1 + (b.x2 - b.x1) * Math.min(1, prog * 1.4);
          var ty = b.y1 + (b.y2 - b.y1) * Math.min(1, prog * 1.4);
          ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(tx, ty); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        return;
      }
      if (style === 'arrow') {
        var ax = b.x1 + (b.x2 - b.x1) * Math.min(1, prog * 1.15);
        var ay = b.y1 + (b.y2 - b.y1) * Math.min(1, prog * 1.15);
        var a = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
        ctx.strokeStyle = '#f5f0df';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - prog * 0.4;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.fillStyle = '#ed8936';
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(a) * 7, ay + Math.sin(a) * 7);
        ctx.lineTo(ax + Math.cos(a + 2.5) * 6, ay + Math.sin(a + 2.5) * 6);
        ctx.lineTo(ax + Math.cos(a - 2.5) * 6, ay + Math.sin(a - 2.5) * 6);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }
      // shot / cannon / default laser
      ctx.strokeStyle = style === 'cannon' ? '#f6ad55' : (col + 'cc');
      ctx.lineWidth = style === 'cannon' ? 4 : 2.5;
      ctx.globalAlpha = 0.9 - prog * 0.6;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x2, b.y2, style === 'cannon' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
      if (style === 'shot' || style === 'cannon') {
        ctx.fillStyle = '#fff8';
        ctx.beginPath(); ctx.arc(b.x1, b.y1, 3 + prog * 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  function drawRtsHpBar(ctx, x, y, w, hp, maxHp) {
    if (maxHp == null || maxHp <= 0) return;
    var ratio = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = '#0009'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = ratio > 0.45 ? '#9ae6b4' : ratio > 0.2 ? '#f6ad55' : '#fc8181';
    ctx.fillRect(x - w / 2, y, w * ratio, 4);
  }

  function rtsClientWorkerCost(st) {
    if (st && st.workerCost != null && isFinite(Number(st.workerCost))) {
      return Math.max(50, Number(st.workerCost) | 0);
    }
    var me = mySlot();
    var n = 0;
    var ents = (st && st.entities) || [];
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (!e || e.hp <= 0) continue;
      if (e.owner !== me && e.owner != me) continue;
      if (e.type === 'worker') n++;
      if (e.kind === 'building' && e.queue && e.queue.length) {
        for (var q = 0; q < e.queue.length; q++) {
          if (e.queue[q] && e.queue[q].type === 'worker') n++;
        }
      }
    }
    var over = Math.max(0, n + 1 - 10);
    return 50 + over * 5;
  }
  function rtsClientVisionR(e) {
    if (!e) return 0;
    if (e.type === 'nexus') return 340;
    if (e.type === 'barracks' || e.type === 'advBarracks') return 200;
    if (e.type === 'turret') return 220;
    if (e.type === 'worker') return 210;
    if (e.type === 'ranged' || e.type === 'archer' || e.type === 'crossbow' || e.type === 'musketeer') return 240;
    return 200;
  }
  function rtsClientExplored(st, x, y) {
    if (!st || !st.fog || !st.fogTile) return true;
    var c = Math.floor(x / st.fogTile);
    var r = Math.floor(y / st.fogTile);
    if (c < 0 || r < 0 || c >= st.fogCols || r >= st.fogRows) return false;
    return !!st.fog[r * st.fogCols + c];
  }
  function rtsClientInVision(st, x, y) {
    var me = mySlot();
    var ents = (st && st.entities) || [];
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (!e || e.fogGhost || e.hp <= 0) continue;
      if (e.owner !== me && e.owner != me) continue;
      if (Math.hypot((e.x || 0) - x, (e.y || 0) - y) <= rtsClientVisionR(e)) return true;
    }
    return false;
  }
  function drawRtsFog(ctx, st) {
    if (!st || !st.fog || !st.fogTile || !st.fogCols || !st.fogRows) return;
    var tile = st.fogTile;
    var fog = st.fog;
    for (var r = 0; r < st.fogRows; r++) {
      for (var c = 0; c < st.fogCols; c++) {
        var idx = r * st.fogCols + c;
        var cx = c * tile + tile / 2;
        var cy = r * tile + tile / 2;
        if (!fog[idx]) {
          ctx.fillStyle = '#02060bcc';
          ctx.fillRect(c * tile, r * tile, tile + 1, tile + 1);
        } else if (!rtsClientInVision(st, cx, cy)) {
          ctx.fillStyle = '#04101899';
          ctx.fillRect(c * tile, r * tile, tile + 1, tile + 1);
        }
      }
    }
  }
  function drawRts(ctx, st) {
    (st.obstacles || []).forEach(function (o) {
      if (o.kind === 'water') {
        if (!rtsClientExplored(st, o.x, o.y)) return;
        ctx.fillStyle = '#1a4a6acc';
        ctx.strokeStyle = '#6ec8ff66';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 16);
        else ctx.rect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
        ctx.fill(); ctx.stroke();
      } else if (o.kind === 'rock') {
        if (!rtsClientExplored(st, o.x, o.y)) return;
        ctx.fillStyle = '#5a6670';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y - (o.r || 28));
        ctx.lineTo(o.x + (o.r || 28) * 0.9, o.y - (o.r || 28) * 0.2);
        ctx.lineTo(o.x + (o.r || 28) * 0.55, o.y + (o.r || 28) * 0.85);
        ctx.lineTo(o.x - (o.r || 28) * 0.6, o.y + (o.r || 28) * 0.75);
        ctx.lineTo(o.x - (o.r || 28) * 0.95, o.y - (o.r || 28) * 0.15);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff22';
        ctx.beginPath(); ctx.arc(o.x - 6, o.y - 8, 5, 0, Math.PI * 2); ctx.fill();
      }
    });
    (st.minerals || []).forEach(function (m) {
      ctx.fillStyle = '#6ec8ff'; ctx.beginPath(); ctx.arc(m.x, m.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9f3ff'; ctx.beginPath(); ctx.arc(m.x - 3, m.y - 3, 4, 0, Math.PI * 2); ctx.fill();
    });
    (st.entities || []).forEach(function (e) {
      var col = COLORS[e.owner != null ? e.owner : 0] || '#efd28a';
      if (e.fogGhost) col = '#6a7a88';
      if (e.kind === 'building' || e.type === 'nexus' || e.type === 'barracks' || e.type === 'advBarracks' || e.type === 'turret') {
        var bw = e.w || 40, bh = e.h || 40;
        var constructing = !!(e.building && e.buildTotal);
        if (constructing) ctx.globalAlpha = e.fogGhost ? 0.25 : 0.55;
        else if (e.fogGhost) ctx.globalAlpha = 0.45;
        else ctx.globalAlpha = 1;
        if (e.type === 'nexus') {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y - bh / 2);
          ctx.lineTo(e.x + bw / 2, e.y);
          ctx.lineTo(e.x, e.y + bh / 2);
          ctx.lineTo(e.x - bw / 2, e.y);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#efd28acc'; ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = '#fff8'; ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          drawNameTag(ctx, e.label || '본진', e.x, e.y - bh / 2 - 12, e.fogGhost ? '#9aa8b4' : '#f5f0df');
        } else if (e.type === 'barracks' || e.type === 'advBarracks') {
          ctx.fillStyle = col;
          ctx.fillRect(e.x - bw / 2, e.y - bh / 2, bw, bh);
          ctx.fillStyle = '#0004';
          ctx.fillRect(e.x - bw / 2 + 6, e.y - 8, bw - 12, 16);
          if (e.type === 'advBarracks') {
            ctx.strokeStyle = '#efd28a';
            ctx.lineWidth = 2;
            ctx.strokeRect(e.x - bw / 2 + 3, e.y - bh / 2 + 3, bw - 6, bh - 6);
            ctx.fillStyle = '#efd28a';
            ctx.beginPath();
            ctx.moveTo(e.x, e.y - bh / 2 - 2);
            ctx.lineTo(e.x + 7, e.y - bh / 2 + 10);
            ctx.lineTo(e.x - 7, e.y - bh / 2 + 10);
            ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
          if (!e.fogGhost) {
            drawNameTag(ctx, e.type === 'advBarracks' ? '고급배럭' : '배럭', e.x, e.y - bh / 2 - 10, '#c8d6c0');
          }
        } else {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(bw, bh) / 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#0006'; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (!e.fogGhost) {
          drawRtsHpBar(ctx, e.x, e.y - bh / 2 - 8, Math.max(36, bw * 0.7), e.hp, e.maxHp);
          if (selectIds.indexOf(e.id) >= 0 || selectIds.some(function (id) { return id == e.id; })) {
            ctx.strokeStyle = '#efd28a';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(e.x - bw / 2 - 4, e.y - bh / 2 - 4, bw + 8, bh + 8);
          }
          if (constructing) {
            var bprog = 1 - Math.max(0, Math.min(1, (e.buildLeft || 0) / (e.buildTotal || 1)));
            var bw2 = Math.max(40, bw * 0.9);
            ctx.fillStyle = '#000a';
            ctx.fillRect(e.x - bw2 / 2, e.y - 4, bw2, 8);
            ctx.fillStyle = '#f6ad55';
            ctx.fillRect(e.x - bw2 / 2, e.y - 4, bw2 * bprog, 8);
            ctx.fillStyle = '#efd28a';
            ctx.font = 'bold 11px Georgia,serif';
            ctx.textAlign = 'center';
            ctx.fillText('건설 ' + Math.round(bprog * 100) + '%', e.x, e.y + bh / 2 + 14);
          } else if (e.queue && e.queue.length) {
            var job = e.queue[0];
            var need = (job && job.need) || 4;
            var prog = Math.max(0, Math.min(1, (e.trainT || 0) / need));
            var bw3 = Math.max(36, bw * 0.85);
            ctx.fillStyle = '#0009';
            ctx.fillRect(e.x - bw3 / 2, e.y + bh / 2 + 4, bw3, 5);
            ctx.fillStyle = '#6ec8ff';
            ctx.fillRect(e.x - bw3 / 2, e.y + bh / 2 + 4, bw3 * prog, 5);
            ctx.fillStyle = '#efd28a';
            ctx.font = '10px Georgia,serif';
            ctx.textAlign = 'center';
            ctx.fillText(((RTS_UNIT_LABELS[job.type] || job.type) || '') + (e.queue.length > 1 ? ' +' + (e.queue.length - 1) : ''), e.x, e.y + bh / 2 + 18);
          }
        }
      } else if (e.kind === 'unit') {
        if (!isFinite(e.x) || !isFinite(e.y)) return;
        rtsNoteUnitAttack(e);
        drawRtsUnitShape(ctx, e, col);
        if (selectIds.indexOf(e.id) >= 0 || selectIds.some(function (id) { return id == e.id; })) {
          ctx.strokeStyle = '#efd28a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 8) + 6, 0, Math.PI * 2); ctx.stroke();
        }
        drawRtsHpBar(ctx, e.x, e.y - (e.r || 8) - 8, 22, e.hp, e.maxHp);
        if (selectIds.indexOf(e.id) >= 0 || selectIds.some(function (id) { return id == e.id; })) {
          drawNameTag(ctx, RTS_UNIT_LABELS[e.type] || e.type, e.x, e.y - (e.r || 8) - 12, '#f5f0df');
        }
      }
    });
    drawRtsAttackBeams(ctx, st);
    drawRtsFog(ctx, st);
  }

  function drawNameTag(ctx, label, x, y, col) {
    var text = String(label || '');
    if (!text) return;
    ctx.save();
    ctx.font = 'bold 13px Georgia,"Noto Sans KR",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#051015cc';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = col || '#f5f0df';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawSnakes(ctx, st) {
    var cols = st.cols || 72;
    var rows = st.rows || 48;
    var cell = st.cell || Math.floor(Math.min(canvasW / cols, canvasH / rows)) || 16;
    var w = cols * cell;
    var h = rows * cell;
    // midnight-like board
    ctx.fillStyle = '#07171c';
    ctx.fillRect(0, 0, canvasW, canvasH);
    var ox = Math.floor((canvasW - w) / 2);
    var oy = Math.floor((canvasH - h) / 2);
    ctx.fillStyle = '#0a1c22';
    ctx.fillRect(ox, oy, w, h);
    ctx.strokeStyle = '#0e292c';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= cols; gx++) {
      ctx.beginPath(); ctx.moveTo(ox + gx * cell, oy); ctx.lineTo(ox + gx * cell, oy + h); ctx.stroke();
    }
    for (var gy = 0; gy <= rows; gy++) {
      ctx.beginPath(); ctx.moveTo(ox, oy + gy * cell); ctx.lineTo(ox + w, oy + gy * cell); ctx.stroke();
    }
    (st.food || []).forEach(function (f) {
      var fx = ox + f.x * cell + cell / 2;
      var fy = oy + f.y * cell + cell / 2;
      ctx.fillStyle = '#e2bd64';
      ctx.shadowColor = '#efd685';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(fx, fy, cell * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
    var meEliminated = false;
    (st.snakes || []).forEach(function (s, i) {
      if (s.id === selfId || s.id == selfId) meEliminated = !!s.eliminated;
      if (s.alive === false || s.eliminated) return;
      var body = s.body || [];
      var col = COLORS[s.slot != null ? s.slot : i];
      body.forEach(function (p, j) {
        var x = ox + p.x * cell + 1;
        var y = oy + p.y * cell + 1;
        var sz = cell - 2;
        if (j === 0) {
          ctx.fillStyle = col;
          if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(x - 1, y - 1, sz + 2, sz + 2, 5); ctx.fill();
          } else {
            ctx.fillRect(x - 1, y - 1, sz + 2, sz + 2);
          }
          ctx.fillStyle = '#fff8';
          ctx.fillRect(x + 3, y + 3, Math.max(2, sz * 0.25), Math.max(2, sz * 0.25));
          if (s.id === selfId || s.id == selfId) {
            ctx.strokeStyle = '#efd28a';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 2, y - 2, sz + 4, sz + 4);
          }
        } else {
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.88;
          if (ctx.roundRect) {
            ctx.beginPath(); ctx.roundRect(x, y, sz, sz, 4); ctx.fill();
          } else {
            ctx.fillRect(x, y, sz, sz);
          }
          ctx.globalAlpha = 1;
        }
      });
      if (body[0]) {
        var hx = ox + body[0].x * cell + cell / 2;
        var hy = oy + body[0].y * cell - 2;
        var nm = s.name || ('P' + ((s.slot != null ? s.slot : i) + 1));
        var lifeMarks = '';
        var ml = s.maxLives || 3;
        for (var li = 0; li < ml; li++) lifeMarks += li < (s.lives != null ? s.lives : 0) ? '♥' : '♡';
        drawNameTag(ctx, nm, hx, hy - 12, col);
        ctx.save();
        ctx.font = '11px Georgia,serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff8a7a';
        ctx.fillText(lifeMarks, hx, hy);
        ctx.restore();
      }
    });
    if (meEliminated) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, canvasH - 42, canvasW, 42);
      ctx.fillStyle = '#efd28a';
      ctx.font = 'bold 16px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText('탈락 · 관전 중', canvasW / 2, canvasH - 16);
    }
  }

  function findMeLaneChamp(st) {
    var list = (st && st.champs) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].playerId === selfId || list[i].playerId == selfId || list[i].owner === mySlot()) return list[i];
    }
    return list[mySlot()] || null;
  }
  function nwOwnerKeyClient(slot, mode) {
    if (mode === '2v2') return slot < 2 ? 0 : 1;
    return slot;
  }
  function findNwNodeAt(x, y) {
    var nodes = (lastState && lastState.nodes) || [];
    var best = null, bd = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var d = Math.hypot((n.x || 0) - x, (n.y || 0) - y);
      if (d <= (n.r || 26) + 8 && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function drawLanePush(ctx, st) {
    var w = st.W || canvasW, h = st.H || canvasH;
    ctx.fillStyle = '#0a1c22';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#123038';
    ctx.fillRect(0, h * 0.28, w, h * 0.44);
    ctx.strokeStyle = '#ffffff12';
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    function bar(x, y, bw, hp, maxHp) {
      if (!maxHp) return;
      var r = Math.max(0, Math.min(1, hp / maxHp));
      ctx.fillStyle = '#0009'; ctx.fillRect(x - bw / 2, y, bw, 5);
      ctx.fillStyle = r > 0.4 ? '#9ae6b4' : '#fc8181';
      ctx.fillRect(x - bw / 2, y, bw * r, 5);
    }
    (st.bases || []).forEach(function (b) {
      if (b.hp <= 0) return;
      ctx.fillStyle = COLORS[b.team != null ? b.team : b.owner] || '#efd28a';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - b.r); ctx.lineTo(b.x + b.r, b.y); ctx.lineTo(b.x, b.y + b.r); ctx.lineTo(b.x - b.r, b.y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#efd28a'; ctx.lineWidth = 2; ctx.stroke();
      drawNameTag(ctx, '본진', b.x, b.y - b.r - 10, '#f5f0df');
      bar(b.x, b.y + b.r + 6, 50, b.hp, b.maxHp);
    });
    (st.towers || []).forEach(function (t) {
      if (t.hp <= 0) return;
      ctx.fillStyle = COLORS[t.team != null ? t.team : t.owner] || '#efd28a';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r || 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0005'; ctx.fillRect(t.x - 6, t.y - (t.r || 28), 12, (t.r || 28));
      bar(t.x, t.y + (t.r || 28) + 6, 40, t.hp, t.maxHp);
    });
    (st.minions || []).forEach(function (m) {
      ctx.fillStyle = COLORS[m.team != null ? m.team : m.owner] || '#fff';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r || 10, 0, Math.PI * 2); ctx.fill();
      bar(m.x, m.y - (m.r || 10) - 8, 18, m.hp, m.maxHp);
    });
    (st.champs || []).forEach(function (c) {
      if (!c.alive) return;
      var col = COLORS[c.team != null ? c.team : c.owner] || '#efd28a';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(c.x, c.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff8'; ctx.lineWidth = 2; ctx.stroke();
      if (c.owner === mySlot()) {
        ctx.strokeStyle = '#efd28a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(c.x, c.y, 22, 0, Math.PI * 2); ctx.stroke();
      }
      var nm = LP_CHAMP_META.filter(function (x) { return x.id === c.champId; })[0];
      drawNameTag(ctx, (nm && nm.name) || c.name || '?', c.x, c.y - 28, col);
      bar(c.x, c.y + 22, 36, c.hp, c.maxHp);
    });
    (st.shots || []).forEach(function (sh) {
      ctx.fillStyle = '#f6e05e';
      ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r || 8, 0, Math.PI * 2); ctx.fill();
    });
    (st.fx || []).forEach(function (f) {
      if (f.kind === 'aoe') {
        ctx.strokeStyle = '#efd28a88'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r || 100, 0, Math.PI * 2); ctx.stroke();
      } else if (f.kind === 'beam') {
        ctx.strokeStyle = '#6ec8ffaa'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      }
    });
    if (st.phase === 'pick') {
      ctx.fillStyle = '#041018aa';
      ctx.fillRect(0, 0, w, 48);
      ctx.fillStyle = '#efd28a';
      ctx.font = 'bold 18px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText('챔피언 선택 · ' + Math.ceil(st.pickLeft || 0) + 's', w / 2, 30);
    }
  }
  function drawNexusWar(ctx, st) {
    var w = st.W || canvasW, h = st.H || canvasH;
    ctx.fillStyle = '#081820';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 18; i++) {
      ctx.fillStyle = i % 2 ? '#0d283088' : '#0a202888';
      ctx.beginPath();
      ctx.arc((i * 97) % w, (i * 53) % h, 40 + (i % 5) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    (st.fleets || []).forEach(function (f) {
      ctx.strokeStyle = (COLORS[f.owner] || '#efd28a') + '99';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
      ctx.fillStyle = COLORS[f.owner] || '#efd28a';
      ctx.beginPath(); ctx.arc(f.x, f.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5f0df';
      ctx.font = '11px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.floor(f.units || 0)), f.x, f.y - 12);
    });
    if (nwDragFrom) {
      ctx.strokeStyle = '#efd28a88';
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(nwDragFrom.x, nwDragFrom.y); ctx.lineTo(mouse.ax, mouse.ay); ctx.stroke();
      ctx.setLineDash([]);
    }
    (st.nodes || []).forEach(function (n) {
      var col = n.owner < 0 ? '#6a7a88' : (COLORS[n.owner] || '#efd28a');
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r || 26, 0, Math.PI * 2); ctx.fill();
      if (n.nexus) {
        ctx.strokeStyle = '#efd28a'; ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#0006'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = '#f5f0df';
      ctx.font = 'bold 14px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.floor(n.units || 0)), n.x, n.y + 5);
      drawNameTag(ctx, n.nexus ? '본진' : '거점', n.x, n.y - (n.r || 26) - 8, col);
    });
  }

  function drawHockey(ctx, st) {
    var w = canvasW, h = canvasH;
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.beginPath(); ctx.moveTo(w / 2, 8); ctx.lineTo(w / 2, h - 8); ctx.stroke();
    var gh = st.goalHalf || 70;
    ctx.strokeRect(0, h / 2 - gh, 12, gh * 2); ctx.strokeRect(w - 12, h / 2 - gh, 12, gh * 2);
    (st.paddles || []).forEach(function (p, i) {
      ctx.fillStyle = COLORS[i];
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 18, 0, Math.PI * 2); ctx.fill();
    });
    var puck = st.puck;
    if (puck) {
      var px = puck.x, py = puck.y;
      if (hockeySmooth) { px = hockeySmooth.x; py = hockeySmooth.y; }
      ctx.fillStyle = '#f5f0df';
      ctx.shadowColor = '#efd68588';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(px, py, puck.r || 10, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function renderEnded() {
    var winner = '알 수 없음';
    var wid = endedInfo && endedInfo.winnerId;
    var iWon = wid != null && (wid === selfId || wid == selfId);
    var ranks = (endedInfo && endedInfo.ranks) || (lastState && lastState.ranks) || [];
    var myYutTeam = boardMySide();
    var myRank = null;
    if (gameId === 'yut' && ranks.length) {
      ranks.forEach(function (r) {
        if ((r.team | 0) === (myYutTeam | 0)) myRank = r;
      });
      if (myRank) iWon = myRank.place === 1;
      else if (!iWon && wid != null && lastState && lastState.playerMeta) {
        var myTeam = null, winTeam = null;
        lastState.playerMeta.forEach(function (pm) {
          if (pm.id === selfId || pm.id == selfId) myTeam = pm.team;
          if (pm.id === wid || pm.id == wid) winTeam = pm.team;
        });
        if (myTeam != null && winTeam != null && myTeam === winTeam) iWon = true;
      }
    } else if (!iWon && (gameId === 'memorymp' || isBoard()) && wid != null && lastState && lastState.mode === '2v2' && lastState.playerMeta) {
      var myTeam2 = null, winTeam2 = null;
      lastState.playerMeta.forEach(function (pm) {
        if (pm.id === selfId || pm.id == selfId) myTeam2 = pm.team;
        if (pm.id === wid || pm.id == wid) winTeam2 = pm.team;
      });
      if (myTeam2 != null && winTeam2 != null && myTeam2 === winTeam2) iWon = true;
    }
    if (wid != null && room && room.players) {
      for (var i = 0; i < room.players.length; i++) {
        if (room.players[i].id === wid || room.players[i].id == wid) { winner = room.players[i].name; break; }
      }
    }
    if (endedInfo && (endedInfo.winnerName || endedInfo.winner)) winner = endedInfo.winnerName || endedInfo.winner;
    var title;
    if (gameId === 'snakes' && wid != null) {
      title = esc(String(winner || '근무자')) + ' 근무자 승리';
    } else if (iWon) {
      title = '승리!';
      winner = (winner && winner !== '알 수 없음' ? winner + ' (당신)' : '당신');
    } else {
      title = wid != null || (gameId === 'yut' && myRank) ? '패배' : '경기 종료';
    }
    var reasonText = endedInfo && endedInfo.reason ? translateErr(endedInfo.reason) : '';
    if (gameId === 'rts' && endedInfo && endedInfo.reason === 'nexus') {
      reasonText = iWon ? '상대 본진을 파괴했습니다!' : '본진이 파괴되었습니다';
    }
    if ((gameId === 'lanepush' || gameId === 'nexuswar') && endedInfo && endedInfo.reason === 'nexus') {
      reasonText = iWon ? '상대 본진을 무너뜨렸습니다!' : '본진이 함락되었습니다';
    }
    if (gameId === 'ageofwar' && endedInfo && endedInfo.reason === 'base') {
      reasonText = iWon ? '상대 기지를 파괴했습니다!' : '기지가 파괴되었습니다';
    }
    if (gameId === 'snakes' && endedInfo && endedInfo.reason === 'last_alive') {
      reasonText = '최후의 생존자';
    }
    if (gameId === 'memorymp') {
      if (endedInfo && endedInfo.reason === 'draw') {
        title = '무승부';
        reasonText = '같은 점수로 끝났습니다';
        iWon = false;
      } else if (endedInfo && endedInfo.reason === 'memory_complete') {
        reasonText = iWon ? '가장 많은 짝을 맞췄습니다!' : '짝 찾기 완료';
      }
    }
    if (isBoard() && endedInfo && endedInfo.reason) {
      var br = endedInfo.reason;
      if (br === 'draw') { title = '무승부'; reasonText = '무승부입니다'; iWon = false; }
      else if (br === 'five') reasonText = iWon ? '5목을 만들었습니다!' : '상대가 5목을 만들었습니다';
      else if (br === 'checkmate') reasonText = iWon ? '체크메이트!' : '체크메이트로 패배';
      else if (br === 'king') reasonText = iWon ? '왕을 잡았습니다!' : '왕이 잡혔습니다';
      else if (br === 'han') reasonText = iWon ? '한! 상대 왕이 외통수입니다' : '한으로 패배했습니다';
      else if (br === 'bikjang') { title = '무승부'; reasonText = '빅장 · 양왕이 마주쳐 무승부입니다'; iWon = false; }
      else if (br === 'bankrupt') reasonText = iWon ? '상대가 파산했습니다' : '파산했습니다';
      else if (br === 'yut') {
        var winTeamName = (ranks[0] && ranks[0].name) || (myRank && iWon ? myRank.name : '');
        if (!winTeamName && lastState && lastState.playerMeta) {
          lastState.playerMeta.forEach(function (pm) {
            if (pm.id === wid || pm.id == wid) winTeamName = yutTeamName(pm.team);
          });
        }
        if (myRank && ranks.length >= 3) {
          reasonText = myRank.place === 1
            ? (myRank.name + '팀 1등 · 말 4개가 모두 골인했습니다!')
            : (myRank.name + '팀 ' + myRank.place + '등 · 골인 ' + myRank.home + '/4');
        } else {
          reasonText = iWon
            ? ((winTeamName ? winTeamName + '팀 · ' : '') + '말 4개가 모두 골인했습니다!')
            : ((winTeamName ? winTeamName + '팀이 이겼습니다. ' : '') + '상대 말이 모두 골인했습니다');
        }
      }
    }
    var loudEnd = gameId === 'gomoku' || gameId === 'chess' || gameId === 'janggi' || gameId === 'yut';
    var endOutcome = 'lose';
    if (loudEnd) {
      if (iWon) endOutcome = 'win';
      else if (gameId === 'yut' && (wid != null || myRank)) endOutcome = 'lose';
      else if (wid == null || (endedInfo && (endedInfo.reason === 'draw' || endedInfo.reason === 'bikjang'))) endOutcome = 'draw';
      if (gameId === 'yut' && myRank && ranks.length >= 3) {
        title = myRank.place === 1 ? '1등!!!' : (myRank.place + '등');
      } else {
        title = endOutcome === 'win' ? '승리!!!' : (endOutcome === 'lose' ? '패배...' : '무승부');
      }
    }
    var endSkin = '';
    if (loudEnd) endSkin = ' board-end ' + endOutcome;
    else if (gameId === 'yut') endSkin = ' yut-end ' + (iWon ? 'win' : 'lose');
    else if (gameId === 'janggi') endSkin = ' jg-end ' + (iWon ? 'win' : 'lose');
    var confetti = loudEnd && endOutcome !== 'draw' ? ('<div class="hkmp-end-confetti">' + boardEndOutcomeHtml(endOutcome === 'win' ? 36 : 18, endOutcome === 'win') + '</div>') : '';
    var rankHtml = '';
    if (gameId === 'yut' && ranks.length) {
      rankHtml = '<ol class="hkmp-yut-ranks">' + ranks.map(function (r) {
        var me = (r.team | 0) === (myYutTeam | 0);
        return '<li class="' + (me ? 'me' : '') + '" style="border-left:4px solid ' + yutTeamColor(r.team) + '"><span>' +
          r.place + '등 · ' + esc(r.name || '') + '팀</span><span>골인 ' + (r.home | 0) + '/4</span></li>';
      }).join('') + '</ol>';
    }
    var subLine = '';
    if (gameId !== 'snakes') {
      if (loudEnd && endOutcome === 'draw') subLine = '무승부입니다';
      else if (gameId === 'yut' && myRank && ranks.length >= 3) {
        subLine = myRank.place === 1 ? '우승' : (myRank.place + '등입니다');
      } else {
        subLine = (iWon ? '승리' : (wid != null || myRank ? '패배' : '종료')) + ' · 승자: <b style="color:#efd28a">' + esc(String(winner)) + '</b>';
      }
    }
    refs.body.innerHTML =
      '<div class="hkmp-ended' + endSkin + '">' +
      (loudEnd && endOutcome === 'win' ? '<div class="hkmp-end-rays"></div>' : '') +
      (loudEnd && endOutcome === 'lose' ? '<div class="hkmp-end-crack"></div>' : '') +
      confetti +
      '<h2' + (loudEnd ? ' class="hkmp-end-title"' : (' style="font-size:' + ((iWon || gameId === 'snakes') ? '36px' : '30px') + ';color:' + (iWon ? '#9ae6b4' : '#efd28a') + '"')) + '>' +
      (gameId === 'snakes' ? title : esc(title)) + '</h2>' +
      (subLine ? '<p style="color:#b1c1bd;position:relative;z-index:2">' + subLine + '</p>' : '') +
      (reasonText ? '<p class="hkmp-note">' + esc(reasonText) + '</p>' : '') +
      rankHtml +
      (room && room.code ? '<p class="hkmp-note">방 ' + esc(room.code) + '</p>' : '') +
      '<div class="hkmp-row hkmp-end-actions" style="justify-content:center;margin-top:18px">' +
      '<button type="button" class="hkmp-btn primary" data-act="rematch">다시하기</button>' +
      '<button type="button" class="hkmp-btn" data-act="leave">로비로</button></div></div>';
    refs.body.querySelector('[data-act="rematch"]').onclick = function () {
      send({ type: 'rematch' });
    };
    refs.body.querySelector('[data-act="leave"]').onclick = function () {
      send({ type: 'leave' });
      room = null; endedInfo = null; lastState = null; view = 'browse'; render(); requestList();
    };
    setTimeout(function () {
      var acts = refs.body && refs.body.querySelector('.hkmp-end-actions');
      if (acts) acts.classList.add('show');
    }, loudEnd ? 1200 : 200);
    if (loudEnd) {
      playBoardEndFx(endOutcome);
      setTimeout(function () { playBoardEndFx(endOutcome); }, 620);
    }
  }

  window.HKMpGames = {
    init: function (options) {
      config = options || {};
      inject();
      function warm() {
        if (ws || connecting) return;
        ensureConnected(function () { scheduleIdleDisconnect(); });
      }
      // Warm ASAP (and again shortly after operator name is usually ready)
      setTimeout(warm, 0);
      setTimeout(warm, 1200);
      return this;
    },
    openLobby: openLobby,
    close: closeOverlay,
    hideBehindOrders: hideBehindOrders,
    resumeFromOrders: resumeFromOrders,
    isOpen: isOverlayOpen,
    isStashed: function () { return !!stashedBehindOrders; }
  };
})(window, document);
