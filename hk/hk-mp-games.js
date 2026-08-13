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
    nexuswar: { icon: '🌐', name: '점령전', desc: '싱글/대결 · 거점 점령 스노우볼' }
  };
  var MAX_PLAYERS = { tank: 4, rts: 4, ageofwar: 2, snakes: 8, airhockey: 2, memorymp: 4, lanepush: 4, nexuswar: 4 };
  var tankCreateMode = 'ffa';
  var rtsCreateMode = '1v1';
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
    worker: '일꾼', melee: '민병', ranged: '투석병', duck: '오리',
    swordsman: '검병', archer: '궁병', knight: '기사', crossbow: '석궁병',
    bomber: '투석기', champion: '챔피언', musketeer: '화승총병', tanker: '팔라딘', cannon: '대포'
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
  var hockeySmooth = null;
  var hockeyRaf = 0;
  var hockeyLastScore = '';
  var tankCam = { x: null, y: null, free: false };

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
      '.hkmp-memory-wrap{width:min(100%,340px);aspect-ratio:3/4;height:auto;max-height:min(72vh,560px);margin:0 auto;padding:0;display:flex;align-items:center;justify-content:center}',
      '.hkmp-memory{width:100%;height:100%;display:grid;gap:6px;perspective:900px;-webkit-user-select:none;user-select:none;box-sizing:border-box}',
      '.hkmp-memory.wave .hkmp-memory-card{transition:transform .14s ease,background .14s ease,color .14s ease}',
      '.hkmp-memory-card{min-width:0;min-height:0;width:100%;height:100%;aspect-ratio:3/4;border:0;border-radius:10px;background:linear-gradient(160deg,#1f5650,#0d252c);color:transparent;font-size:clamp(22px,4.6vw,40px);line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;text-align:center;transition:.22s;box-shadow:inset 0 0 0 1px #d2b77044,0 4px 10px #0005;-webkit-user-select:none;user-select:none}',
      '.hkmp-memory-card.open,.hkmp-memory-card.done{background:#f0dfa8;color:#142826;transform:rotateY(180deg);text-shadow:0 1px 0 #fff6}.hkmp-memory-card.done{background:#9fcbb0;opacity:.78;cursor:default}',
      '.hkmp-memory-card .hkmp-memory-face{display:flex;align-items:center;justify-content:center;width:100%;height:100%;line-height:1;transform:rotateY(180deg)}.hkmp-memory-card.mine{box-shadow:inset 0 0 0 2px #efd28a,0 0 0 1px #efd28a55}.hkmp-memory-card:disabled{cursor:default;opacity:.85}',
      '.hkmp-toast{position:fixed;left:50%;bottom:28px;z-index:10003;transform:translate(-50%,25px);opacity:0;background:#ead18f;color:#122421;padding:12px 18px;border-radius:999px;font-weight:800;box-shadow:0 10px 35px #0008;transition:.25s;pointer-events:none}.hkmp-toast.show{transform:translate(-50%,0);opacity:1}',
      '@media(max-width:560px){.hkmp-shell{width:calc(100% - 16px);padding-top:12px}.hkmp-panel{padding:14px}}'
    ].join('');
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
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ')) {
      e.preventDefault();
      e.stopPropagation();
      exitToOrders();
      return;
    }
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

  function closeOverlay() {
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
        : (gameId === 'airhockey' ? hockeyCreateMode : null))))))),
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
      if (gameId === 'rts') payload.mode = rtsCreateMode;
      if (gameId === 'lanepush') payload.mode = laneCreateMode;
      if (gameId === 'nexuswar') payload.mode = nexusCreateMode;
      if (gameId === 'ageofwar') payload.mode = aowCreateMode === 'solo' ? 'solo' : null;
      if (gameId === 'snakes') payload.mode = snakesCreateMode === 'solo' ? 'solo' : null;
      if (gameId === 'airhockey') payload.mode = hockeyCreateMode === 'solo' ? 'solo' : null;
      if (gameId === 'memorymp') {
        payload.mode = memoryCreateMode;
        payload.pairs = memoryPairs;
      }
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
      endedInfo = null;
      if (room.status === 'playing') {
        view = 'play';
        if (!lastState) lastState = null;
        startInput();
      } else if (room.status === 'ended') {
        view = 'ended';
        stopInput();
      } else {
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
      score: '목표 점수 달성'
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
    list.innerHTML = browseListHtml(lastBrowseRooms, max);
    bindBrowseListClicks(list);
  }

  function startInput() {
    stopInput();
    tankCam = { x: null, y: null, free: false };
    bindPlayKeys(true);
    if (gameId === 'memorymp') return;
    // Air hockey uses RAF smooth for prediction — avoid a second 60fps input timer
    if (gameId === 'airhockey') {
      startHockeySmooth();
      inputTimer = setInterval(tickInput, 50);
    } else if (gameId === 'lanepush') {
      inputTimer = setInterval(tickInput, 16);
    } else {
      inputTimer = setInterval(tickInput, 40);
    }
  }
  function stopInput() {
    if (inputTimer) clearInterval(inputTimer);
    inputTimer = 0;
    bindPlayKeys(false);
    keys = {};
    fireLatch = false;
    stopHockeySmooth();
    stopMemoryWave();
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
    if (soloMode && !rtsLabel) rtsLabel = '싱글 vs AI';
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
        if ((gameId === 'lanepush' || gameId === 'nexuswar' || gameId === 'memorymp') && room.mode === '2v2') teamTag = ' · 팀' + ((p.slot != null ? p.slot : i) < 2 ? 'A' : 'B');
        if (gameId === 'memorymp' && room.mode === '2v2' && !teamTag) teamTag = ' · 팀' + ((p.slot != null ? p.slot : i) < 2 ? 'A' : 'B');
        return '<div class="hkmp-player' + (isMe ? ' me' : '') + '"><span class="hkmp-dot' + (ready ? ' on' : '') + '"></span>' +
          '<strong>' + esc(p.name || ('P' + (i + 1))) + (p.isAi ? ' ·AI' : '') + '</strong>' +
          '<span style="flex:1;color:#88a09a;font-size:12px">' + (pendingRoom ? '생성 중' : (p.isAi ? 'Ready' : (ready ? 'Ready' : '대기'))) + teamTag + (isMe ? ' · 나' : '') + '</span></div>';
      }).join('') + '</div>' +
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
  }

  function renderPlay() {
    memoryBoardSig = '';
    if (gameId === 'memorymp') {
      renderPlayMemory();
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
      rts: '좌클릭 본진/배럭 선택 · 시대·배럭 업그레이드 · 우클릭 이동/공격 · 본진은 유닛 공격 불가(포탑·배럭으로) · 밝은 시야에서만 건설',
      ageofwar: '유닛 생산 · 시대 진화 · 특수공격 · 상대 기지 파괴',
      snakes: '방향키/WASD · 목숨 3 · 탈락 후 관전 · 최후 1인 승리',
      airhockey: '마우스/터치로 패들 · 충돌할수록 퍽이 점점 빨라집니다',
      memorymp: '시작 시 파도 미리보기 · 내 차례에 카드 선택 · 2:2는 팀원이 한 장씩',
      lanepush: '우클릭 이동 · QWER 스킬 · 1~5 픽 · 미니언 막타로 골드 · 타워→본진 파괴',
      nexuswar: '내 거점에서 드래그해 출동 · Shift 전군 · 상대 본진 점령 승리',
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
      if (age >= 2) tools.push(['build:advBarracks', '고급배럭 ·280']);
      tools.push(['upgradeAge', age >= 3 ? '본진 시대 MAX' : ('본진 시대업 ·' + ([0, 1000, 1500, 2000][age + 1] || '—'))]);
      tools.push(['upgradeBarracks', '배럭 업 ·' + ([0, 120, 200, 300][Math.min(3, age)] || '120')]);
      tools.push(['train:worker', '일꾼 ·' + rtsClientWorkerCost(st)]);
      var byAge = [
        [['melee', '민병 ·80'], ['ranged', '투석병 ·100'], ['duck', '오리 ·30']],
        [['swordsman', '검병 ·110'], ['archer', '궁병 ·120']],
        [['knight', '기사 ·180'], ['crossbow', '석궁병 ·150'], ['bomber', '투석기 ·160']],
        [['champion', '챔피언 ·220'], ['musketeer', '화승총 ·200'], ['tanker', '팔라딘 ·240'], ['cannon', '대포 ·280']]
      ];
      for (var ai = 0; ai <= age && ai < byAge.length; ai++) {
        byAge[ai].forEach(function (u) {
          tools.push(['train:' + u[0], u[1]]);
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
          if (key === 'upgradeBarracks') {
            send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'upgradeBarracks' } });
            toast('배럭 업그레이드 요청 (본진 시대 먼저)');
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
                (se.type === 'advBarracks' ? '고급배럭' : '배럭') +
                ' T' + ((se.tier != null ? se.tier : 0) + 1) + '</b></span>';
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


  function drawRtsUnitShape(ctx, e, col) {
    var r = e.r || 8;
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0008';
    ctx.lineWidth = 1.5;
    if (e.type === 'worker') {
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - r);
      ctx.lineTo(e.x + r * 0.9, e.y + r * 0.7);
      ctx.lineTo(e.x - r * 0.9, e.y + r * 0.7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.type === 'melee' || e.type === 'swordsman' || e.type === 'champion') {
      // AoE-style infantry: oval body + spear/sword tip
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(e.x, e.y + 1, r * 0.7, r * 1.05, 0, 0, Math.PI * 2);
      else ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = e.type === 'champion' ? '#efd28a' : '#d9e2ec';
      ctx.fillRect(e.x - 1.5, e.y - r * 1.35, 3, r * 0.9);
      if (e.type === 'champion') {
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - r * 1.5);
        ctx.lineTo(e.x + 5, e.y - r * 1.1);
        ctx.lineTo(e.x - 5, e.y - r * 1.1);
        ctx.closePath(); ctx.fill();
      }
    } else if (e.type === 'ranged' || e.type === 'archer' || e.type === 'crossbow' || e.type === 'musketeer') {
      // bowman / gunner: diamond + bow arc
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - r);
      ctx.lineTo(e.x + r * 0.85, e.y);
      ctx.lineTo(e.x, e.y + r);
      ctx.lineTo(e.x - r * 0.85, e.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f5f0dfcc';
      ctx.lineWidth = e.type === 'musketeer' ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(e.x + r * 0.2, e.y, r * 0.95, -1.1, 1.1);
      ctx.stroke();
      if (e.type === 'musketeer') {
        ctx.strokeStyle = '#2d3748';
        ctx.beginPath();
        ctx.moveTo(e.x - r * 0.2, e.y);
        ctx.lineTo(e.x + r * 1.2, e.y - 2);
        ctx.stroke();
      }
    } else if (e.type === 'knight' || e.type === 'tanker') {
      // cavalry / paladin: wide shield body
      var w = r * (e.type === 'tanker' ? 2.1 : 1.85), h = r * (e.type === 'tanker' ? 1.6 : 1.4);
      ctx.fillRect(e.x - w / 2, e.y - h / 2, w, h);
      ctx.strokeRect(e.x - w / 2, e.y - h / 2, w, h);
      ctx.fillStyle = '#efd28a';
      ctx.beginPath();
      ctx.moveTo(e.x + w / 2 - 2, e.y);
      ctx.lineTo(e.x + w / 2 + r * 0.7, e.y - 4);
      ctx.lineTo(e.x + w / 2 + r * 0.7, e.y + 4);
      ctx.closePath(); ctx.fill();
    } else if (e.type === 'bomber' || e.type === 'cannon') {
      // siege: round body + barrel
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a202c';
      ctx.fillRect(e.x + r * 0.1, e.y - 3, r * (e.type === 'cannon' ? 1.3 : 0.9), 6);
      ctx.fillStyle = '#122421';
      ctx.beginPath(); ctx.arc(e.x - r * 0.25, e.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'duck') {
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(e.x, e.y + 1, r * 1.1, r * 0.75, 0, 0, Math.PI * 2);
      else ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + r * 0.55, e.y - r * 0.35, r * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f6ad55';
      ctx.beginPath();
      ctx.moveTo(e.x + r * 0.85, e.y - r * 0.35);
      ctx.lineTo(e.x + r * 1.45, e.y - r * 0.2);
      ctx.lineTo(e.x + r * 0.85, e.y - r * 0.05);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
    }
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
        drawRtsUnitShape(ctx, e, col);
        if (selectIds.indexOf(e.id) >= 0 || selectIds.some(function (id) { return id == e.id; })) {
          ctx.strokeStyle = '#efd28a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 8) + 6, 0, Math.PI * 2); ctx.stroke();
        }
        drawRtsHpBar(ctx, e.x, e.y - (e.r || 8) - 8, 22, e.hp, e.maxHp);
      }
    });
    (st.beams || []).forEach(function (b) {
      ctx.strokeStyle = (COLORS[b.owner != null ? b.owner : 0] || '#efd28a') + 'cc';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x2, b.y2, 3, 0, Math.PI * 2); ctx.fill();
    });
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
    if (!iWon && gameId === 'memorymp' && wid != null && lastState && lastState.mode === '2v2' && lastState.playerMeta) {
      var myTeam = null, winTeam = null;
      lastState.playerMeta.forEach(function (pm) {
        if (pm.id === selfId || pm.id == selfId) myTeam = pm.team;
        if (pm.id === wid || pm.id == wid) winTeam = pm.team;
      });
      if (myTeam != null && winTeam != null && myTeam === winTeam) iWon = true;
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
      title = wid != null ? '패배' : '경기 종료';
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
    refs.body.innerHTML =
      '<div class="hkmp-ended"><h2 style="font-size:' + ((iWon || gameId === 'snakes') ? '36px' : '30px') + ';color:' + (iWon ? '#9ae6b4' : '#efd28a') + '">' +
      (gameId === 'snakes' ? title : esc(title)) + '</h2>' +
      (gameId === 'snakes' ? '' : '<p style="color:#b1c1bd">승자: <b style="color:#efd28a">' + esc(String(winner)) + '</b></p>') +
      (reasonText ? '<p class="hkmp-note">' + esc(reasonText) + '</p>' : '') +
      (room && room.code ? '<p class="hkmp-note">방 ' + esc(room.code) + '</p>' : '') +
      '<div class="hkmp-row" style="justify-content:center;margin-top:18px">' +
      '<button type="button" class="hkmp-btn primary" data-act="rematch">Rematch</button>' +
      '<button type="button" class="hkmp-btn" data-act="leave">Leave lobby</button></div></div>';
    refs.body.querySelector('[data-act="rematch"]').onclick = function () {
      send({ type: 'rematch' });
    };
    refs.body.querySelector('[data-act="leave"]').onclick = function () {
      send({ type: 'leave' });
      room = null; endedInfo = null; lastState = null; view = 'browse'; render(); requestList();
    };
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
    close: closeOverlay
  };
})(window, document);
