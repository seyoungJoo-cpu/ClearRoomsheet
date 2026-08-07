(function (window, document) {
  'use strict';

  var META = {
    tank: { icon: '🛡️', name: '탱크대전', desc: '1:1 실시간 탱크 대전 · 방 만들기' },
    rts: { icon: '🏰', name: '미니 RTS', desc: '본진 파괴 멀티 RTS · 방' },
    towerdefense: { icon: '🗼', name: '타워 디펜스', desc: '서로에게 몬스터 보내기 · 방' },
    snakes: { icon: '🪱', name: '멀티 스네이크', desc: '최대 8인 슬리더 대전 · 방' },
    airhockey: { icon: '🏒', name: '에어하키', desc: '반응속도 에어하키 · 방' }
  };
  var MAX_PLAYERS = { tank: 2, rts: 2, towerdefense: 2, snakes: 8, airhockey: 2 };
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
  var view = 'browse'; // browse | room | play | ended
  var lastBrowseRooms = [];
  var keys = {}, mouse = { x: 0, y: 0, down: false, right: false, ax: 0, ay: 0 };
  var selectIds = [], drag = null, pendingBuild = null, pendingTd = null;
  var canvasW = 800, canvasH = 600, fireLatch = false;
  var gamePaused = false;

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
      '.hk-mp-overlay.open{display:block}.hkmp-shell{width:min(960px,calc(100% - 28px));margin:auto;padding:22px 0 36px;box-sizing:border-box}',
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
    intentionalClose = true;
    pendingCreate = false;
    if (createWatchTimer) clearTimeout(createWatchTimer);
    stopInput();
    stopList();
    disconnect();
    room = null; lastState = null; endedInfo = null; gameId = ''; view = 'browse';
    setGamePaused(false);
    if (root) root.classList.remove('open');
  }

  function openLobby(id) {
    if (!META[id]) { toast('알 수 없는 멀티 게임'); return; }
    inject();
    var launch = function () {
      gameId = id;
      room = null; lastState = null; endedInfo = null; view = 'browse';
      selectIds = []; pendingBuild = null; pendingTd = null;
      refs.title.textContent = meta(id).icon + ' ' + meta(id).name;
      root.classList.add('open');
      render();
      ensureConnected(function () {
        requestList();
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
    // Already opening — keep waiters, do not tear down the socket
    if (connecting || (ws && ws.readyState === 0)) return;
    openSocket();
  }
  function openSocket() {
    intentionalClose = false;
    connecting = true;
    reconnecting = !!ws;
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
      send({ type: 'hello', name: name() || 'Guest' });
      flushConnectWaiters();
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleMessage(msg);
    };
    ws.onerror = function () {
      // onclose usually follows; avoid double toasts when retrying
    };
    ws.onclose = function () {
      var wasIntentional = intentionalClose;
      connecting = false;
      ws = null;
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
        }, 450 * connectRetry);
        return;
      }
      if (connectWaiters.length) {
        clearConnectWaiters(reconnecting ? '재연결 실패' : '멀티플레이 연결 오류');
        pendingCreate = false;
      } else if (!intentionalClose) {
        toast('서버 연결이 끊어졌습니다');
      }
    };
  }
  function disconnect(quiet) {
    intentionalClose = true;
    connecting = false;
    connectWaiters = [];
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
    pendingCreate = true;
    if (createWatchTimer) clearTimeout(createWatchTimer);
    ensureConnected(function () {
      var ok = send({ type: 'create', game: gameId, name: name() || 'Guest' });
      if (!ok) {
        pendingCreate = false;
        toast('방 생성 전송 실패 — 다시 눌러주세요');
        return;
      }
      toast('방 생성 중…');
      createWatchTimer = setTimeout(function () {
        if (!pendingCreate) return;
        if (view === 'room' && room && room.code) { pendingCreate = false; return; }
        pendingCreate = false;
        toast('방 생성 응답이 없습니다. 다시 시도해주세요');
      }, 4000);
    });
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
    if (msg.type === 'error') {
      toast(translateErr(msg.message || msg.error) || '오류가 발생했습니다');
      return;
    }
    if (msg.type === 'lobby_list') {
      if (msg.game && msg.game !== gameId) return;
      renderBrowse(msg.rooms || []);
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
        if (lastState && (lastState.W || lastState.H)) {
          canvasW = lastState.W || canvasW;
          canvasH = lastState.H || canvasH;
        }
        drawFrame();
        updateHud();
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
      opponent_left: '상대가 나갔습니다',
      match: '경기 종료',
      last_alive: '최후 생존',
      life: '라이프 전멸',
      score: '목표 점수 달성'
    };
    return map[code] || code;
  }

  function requestList() {
    if (!gameId) return;
    send({ type: 'list', game: gameId });
  }
  function startList() {
    stopList();
    listTimer = setInterval(function () {
      if (view === 'browse') requestList();
    }, 1200);
  }
  function stopList() {
    if (listTimer) clearInterval(listTimer);
    listTimer = 0;
  }

  function startInput() {
    stopInput();
    bindPlayKeys(true);
    inputTimer = setInterval(tickInput, 33);
  }
  function stopInput() {
    if (inputTimer) clearInterval(inputTimer);
    inputTimer = 0;
    bindPlayKeys(false);
    keys = {};
    fireLatch = false;
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
      send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'build', unitType: map[e.key] } });
      pendingBuild = null;
      renderToolbarHighlight();
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
    if (gameId === 'tank') { keys.fire = false; fireLatch = false; }
  }

  function canvasToWorld(cv, clientX, clientY) {
    var r = cv.getBoundingClientRect();
    var sx = (clientX - r.left) / r.width;
    var sy = (clientY - r.top) / r.height;
    return { x: sx * canvasW, y: sy * canvasH };
  }

  function buildInput() {
    if (gameId === 'tank') {
      var aim = 0;
      var me = lastState ? findMeTank(lastState) : null;
      if (me) {
        aim = Math.atan2(mouse.ay - me.y, mouse.ax - me.x);
        mouse.tx = me.x; mouse.ty = me.y;
      } else {
        aim = Math.atan2(mouse.ay - canvasH / 2, mouse.ax - canvasW / 2);
      }
      return {
        up: !!(keys.w || keys.arrowup),
        down: !!(keys.s || keys.arrowdown),
        left: !!(keys.a || keys.arrowleft),
        right: !!(keys.d || keys.arrowright),
        aim: aim,
        fire: !!(keys.fire || mouse.down || fireLatch)
      };
    }
    if (gameId === 'snakes') {
      var sx = mouse.sx != null ? mouse.sx : canvasW / 2;
      var sy = mouse.sy != null ? mouse.sy : canvasH / 2;
      if (keys.arrowup || keys.arrowdown || keys.arrowleft || keys.arrowright || keys.w || keys.a || keys.s || keys.d) {
        var dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
        var dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
        if (dx || dy) return { dx: dx, dy: dy, angle: Math.atan2(dy, dx) };
      }
      return { angle: Math.atan2(mouse.ay - sy, mouse.ax - sx), dx: mouse.ax - sx, dy: mouse.ay - sy };
    }
    if (gameId === 'airhockey') {
      return { x: mouse.ax, y: mouse.ay };
    }
    // rts / towerdefense: event-driven only
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
    if (rooms) lastBrowseRooms = rooms;
    else rooms = lastBrowseRooms || [];
    var m = meta(gameId);
    var max = MAX_PLAYERS[gameId] || 2;
    refs.body.innerHTML =
      '<div class="hkmp-create-wrap">' +
      '<button type="button" class="hkmp-btn primary" data-act="create" style="align-self:flex-start;font-size:15px;padding:12px 18px">방 만들기</button>' +
      '<div class="hkmp-note">' + esc(m.desc) + ' · 최대 ' + max + '명 · 아래 방을 눌러 참가</div></div>' +
      '<h3 style="margin:8px 0 10px;color:#ecd18b;font-family:Georgia,serif">대기 중인 방</h3>' +
      '<div class="hkmp-list" data-list></div>';
    var list = refs.body.querySelector('[data-list]');
    if (!rooms.length) {
      list.innerHTML = '<div class="hkmp-note">아직 열린 방이 없습니다. 위에서 방을 만들어 주세요.</div>';
    } else {
      list.innerHTML = rooms.map(function (r) {
        var code = r.code || r.roomCode || '';
        var cnt = typeof r.players === 'number' ? r.players : (r.count != null ? r.count : (r.players && r.players.length) || r.n || 0);
        var roomMax = r.max || max;
        var names = Array.isArray(r.names) ? r.names.filter(Boolean).join(', ') : '';
        var host = (r.host && String(r.host)) || names || ('대기방');
        var full = cnt >= roomMax;
        return '<button type="button" class="hkmp-room" data-join="' + esc(code) + '"' + (full ? ' disabled' : '') + '>' +
          '<b>' + esc(host) + '</b>' +
          '<span>' + cnt + '/' + roomMax + (full ? ' · 가득 참' : ' · 클릭해서 참가') + '</span>' +
          (full ? '' : '<span class="hkmp-join-hint">참가</span>') +
          '</button>';
      }).join('');
    }
    refs.body.querySelector('[data-act="create"]').onclick = function () {
      if (pendingCreate) { toast('방 생성 요청 중입니다…'); return; }
      requestCreateRoom();
    };
    Array.prototype.forEach.call(refs.body.querySelectorAll('[data-join]'), function (btn) {
      btn.onclick = function () {
        if (btn.disabled) return;
        var code = btn.getAttribute('data-join');
        requestJoinRoom(code);
      };
    });
  }

  function renderRoom() {
    if (!room) { view = 'browse'; render(); return; }
    var players = room.players || [];
    var me = myPlayer();
    var allReady = players.length >= 2 && players.every(function (p) { return p.ready; });
    var need = gameId === 'snakes' ? 2 : (room.max || MAX_PLAYERS[gameId] || 2);
    refs.body.innerHTML =
      '<div class="hkmp-row"><span class="hkmp-pill">대기실 · ' + players.length + '/' + need + '명</span>' +
      '<button type="button" class="hkmp-btn" data-act="leave">나가기</button></div>' +
      '<div class="hkmp-players">' + players.map(function (p, i) {
        var ready = !!p.ready;
        var isMe = p.id === selfId;
        return '<div class="hkmp-player' + (isMe ? ' me' : '') + '"><span class="hkmp-dot' + (ready ? ' on' : '') + '"></span>' +
          '<strong>' + esc(p.name || ('P' + (i + 1))) + '</strong>' +
          '<span style="flex:1;color:#88a09a;font-size:12px">' + (ready ? 'Ready' : '대기') + (isMe ? ' · 나' : '') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="hkmp-row">' +
      '<button type="button" class="hkmp-btn primary" data-act="ready"' + (me && me.ready ? ' disabled' : '') + '>Ready</button>' +
      '</div>' +
      '<div class="hkmp-note">' + (allReady && players.length >= need ? '모두 준비됨 — 곧 시작합니다' :
        (players.length < need ? '상대를 기다리는 중… (' + players.length + '/' + need + ')' : '모두 Ready하면 자동 시작')) + '</div>';
    refs.body.querySelector('[data-act="leave"]').onclick = function () {
      send({ type: 'leave' });
      room = null; view = 'browse'; render(); requestList();
    };
    refs.body.querySelector('[data-act="ready"]').onclick = function () { send({ type: 'ready' }); };
  }

  function renderPlay() {
    canvasW = (lastState && (lastState.W || lastState.w || lastState.width)) || defaultSize().w;
    canvasH = (lastState && (lastState.H || lastState.h || lastState.height)) || defaultSize().h;
    setGamePaused(false);
    refs.body.innerHTML =
      '<div class="hkmp-hud" data-hud></div>' +
      (gameId === 'rts' || gameId === 'towerdefense' ? '<div class="hkmp-toolbar" data-tools></div>' : '') +
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

  function defaultSize() {
    if (gameId === 'rts') return { w: 1200, h: 800 };
    if (gameId === 'towerdefense') return { w: 900, h: 500 };
    if (gameId === 'snakes') return { w: 1400, h: 900 };
    if (gameId === 'airhockey') return { w: 700, h: 400 };
    return { w: 800, h: 600 };
  }
  function helpText() {
    return {
      tank: 'WASD 이동 · 마우스 조준 · 클릭/스페이스 발사 · P 일시정지 · Ctrl+Q 오더',
      rts: '좌드래그 선택 · 우클릭 이동(공격 중에도 이동) · 적 우클릭 공격 · 본진 자동 레이저',
      towerdefense: '타워/유닛 선택 후 내 라인 슬롯 클릭',
      snakes: '마우스 방향 또는 화살표/WASD',
      airhockey: '마우스/터치로 패들 이동'
    }[gameId] || '';
  }

  function buildToolbar() {
    if (!refs.tools) return;
    if (gameId === 'rts') {
      refs.tools.innerHTML = [
        ['build:barracks', '배럭 ·150'], ['build:turret', '포탑 ·120 (본진 근처 불가)'],
        ['train:worker', '일꾼(1) ·50'], ['train:melee', '전사(2) ·80'], ['train:ranged', '사수(3) ·100'],
        ['train:bomber', '폭탄(4) ·140'], ['train:tanker', '탱커(5) ·160'], ['train:duck', '오리(6) ·40']
      ].map(function (x) {
        return '<button type="button" class="hkmp-btn" data-tool="' + x[0] + '">' + x[1] + '</button>';
      }).join('');
      Array.prototype.forEach.call(refs.tools.querySelectorAll('[data-tool]'), function (btn) {
        btn.onclick = function () {
          var t = btn.getAttribute('data-tool').split(':');
          if (t[0] === 'build') {
            pendingBuild = { mode: 'build', buildType: t[1] };
            renderToolbarHighlight();
          } else {
            send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'build', unitType: t[1] } });
            pendingBuild = null;
            renderToolbarHighlight();
            toast(t[1] + ' 생산 요청');
          }
        };
      });
    } else if (gameId === 'towerdefense') {
      refs.tools.innerHTML = [
        ['tower:single', '타워·단일'], ['tower:aoe', '타워·범위'], ['tower:slow', '타워·슬로우'],
        ['send:fast', '유닛·빠름'], ['send:tank', '유닛·탱커'], ['send:swarm', '유닛·다수']
      ].map(function (x) {
        return '<button type="button" class="hkmp-btn" data-tool="' + x[0] + '">' + x[1] + '</button>';
      }).join('');
      Array.prototype.forEach.call(refs.tools.querySelectorAll('[data-tool]'), function (btn) {
        btn.onclick = function () {
          var t = btn.getAttribute('data-tool').split(':');
          pendingTd = { action: t[0], kind: t[1] };
          renderToolbarHighlight();
        };
      });
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
      if (gameId === 'towerdefense' && pendingTd) {
        on = t === pendingTd.action + ':' + pendingTd.kind;
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
          var hit = findRtsEntityAt(p.x, p.y);
          var my = mySlot();
          if (hit && hit.owner !== my && hit.hp > 0) {
            send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'attack', targetId: hit.id, x: p.x, y: p.y } });
          } else {
            send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: 'move', x: p.x, y: p.y } });
          }
        }
        return;
      }
      if (e.button !== 0) return;
      mouse.down = true;
      if (gameId === 'tank') fireLatch = true;
      if (gameId === 'rts') {
        if (pendingBuild) {
          if (pendingBuild.mode === 'build' && pendingBuild.buildType === 'turret') {
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
          var payload = { selectIds: selectIds.slice(), x: p.x, y: p.y, cmd: 'build' };
          if (pendingBuild.mode === 'build') payload.buildType = pendingBuild.buildType;
          else payload.unitType = pendingBuild.unitType;
          send({ type: 'input', payload: payload });
          pendingBuild = null; renderToolbarHighlight();
          return;
        }
        drag = { mode: 'select', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      }
      if (gameId === 'towerdefense' && pendingTd) {
        if (pendingTd.action === 'send') {
          send({ type: 'input', payload: { action: 'send', kind: pendingTd.kind, slotIndex: -1 } });
        } else {
          send({ type: 'input', payload: { action: 'tower', kind: pendingTd.kind, slotIndex: pickTdSlot(p.x, p.y) } });
        }
      }
    });
    cv.addEventListener('mouseup', function (e) {
      mouse.down = false;
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
      if (gameId === 'towerdefense' && pendingTd) {
        if (pendingTd.action === 'send') {
          send({ type: 'input', payload: { action: 'send', kind: pendingTd.kind, slotIndex: -1 } });
        } else {
          send({ type: 'input', payload: { action: 'tower', kind: pendingTd.kind, slotIndex: pickTdSlot(p.x, p.y) } });
        }
      }
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var p = pos(e); mouse.ax = p.x; mouse.ay = p.y;
    }, { passive: false });
    cv.addEventListener('touchend', function () { mouse.down = false; }, { passive: true });
  }

  function finishSelect() {
    if (!lastState || !drag) return;
    var x1 = Math.min(drag.x1, drag.x2), x2 = Math.max(drag.x1, drag.x2);
    var y1 = Math.min(drag.y1, drag.y2), y2 = Math.max(drag.y1, drag.y2);
    var units = (lastState.entities || []).filter(function (u) { return u.kind === 'unit'; });
    var slot = mySlot();
    var tiny = Math.abs(drag.x2 - drag.x1) < 6 && Math.abs(drag.y2 - drag.y1) < 6;
    selectIds = [];
    units.forEach(function (u) {
      if (u.owner !== slot) return;
      if (tiny) {
        if (Math.hypot((u.x || 0) - drag.x1, (u.y || 0) - drag.y1) < 18) selectIds.push(u.id);
      } else if ((u.x || 0) >= x1 && (u.x || 0) <= x2 && (u.y || 0) >= y1 && (u.y || 0) <= y2) {
        selectIds.push(u.id);
      }
    });
    send({ type: 'input', payload: { selectIds: selectIds.slice(), cmd: null } });
  }

  function pickTdSlot(x, y) {
    var st = lastState || {};
    var mine = (st.slots && st.slots[mySlot()]) || [];
    if (!mine.length) return 0;
    var best = 0, bestD = 1e9;
    for (var i = 0; i < mine.length; i++) {
      var s = mine[i];
      var d = Math.hypot((s.x || 0) - x, (s.y || 0) - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function updateHud() {
    if (!refs.hud) return;
    var st = lastState || {};
    var html = '';
    if (room && room.code) html += '<span class="hkmp-pill">방 <b>' + esc(room.code) + '</b></span>';
    if (gameId === 'tank') {
      var wins = st.wins || [];
      html += '<span class="hkmp-pill">라운드 <b>' + (st.round || 1) + '</b></span>';
      html += '<span class="hkmp-pill">스코어 <b>' + (wins[0] || 0) + ' : ' + (wins[1] || 0) + '</b></span>';
      var t = findMeTank(st);
      if (t) html += '<span class="hkmp-pill">HP <b>' + (t.hp != null ? t.hp : 3) + '</b></span>';
    } else if (gameId === 'rts') {
      var golds = st.gold || [];
      html += '<span class="hkmp-pill">미네랄 <b>' + (golds[mySlot()] != null ? golds[mySlot()] : 0) + '</b></span>';
      html += '<span class="hkmp-pill">선택 <b>' + selectIds.length + '</b></span>';
    } else if (gameId === 'towerdefense') {
      var lives = st.life || st.lives || [];
      var gold = st.gold || [];
      html += '<span class="hkmp-pill">라이프 <b>' + (lives[mySlot()] != null ? lives[mySlot()] : '?') + '</b></span>';
      html += '<span class="hkmp-pill">골드 <b>' + (gold[mySlot()] != null ? gold[mySlot()] : 0) + '</b></span>';
    } else if (gameId === 'snakes') {
      var snakes = st.snakes || [];
      var alive = snakes.filter(function (s) { return s.alive !== false; }).length;
      html += '<span class="hkmp-pill">생존 <b>' + alive + '</b></span>';
      var mine = snakes.filter(function (s) { return s.id === selfId; })[0];
      if (mine) html += '<span class="hkmp-pill">길이 <b>' + ((mine.body && mine.body.length) || 0) + '</b></span>';
    } else if (gameId === 'airhockey') {
      var sc = st.score || st.scores || [0, 0];
      html += '<span class="hkmp-pill">점수 <b>' + (sc[0] || 0) + ' : ' + (sc[1] || 0) + '</b></span>';
    }
    refs.hud.innerHTML = html;
  }

  function drawFrame() {
    var cv = refs.canvas;
    if (!cv || gamePaused) return;
    var st = lastState;
    if (st) {
      canvasW = st.W || st.w || st.width || canvasW;
      canvasH = st.H || st.h || st.height || canvasH;
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
    if (gameId === 'tank') drawTank(ctx, st);
    else if (gameId === 'rts') drawRts(ctx, st);
    else if (gameId === 'towerdefense') drawTd(ctx, st);
    else if (gameId === 'snakes') drawSnakes(ctx, st);
    else if (gameId === 'airhockey') drawHockey(ctx, st);
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
    (st.walls || []).forEach(function (w) {
      if (w.hp != null && w.hp <= 0) return;
      ctx.fillStyle = w.solid ? '#2a4a4e' : '#5a3a2a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      if (w.hp != null && !w.solid) {
        ctx.fillStyle = '#efd28a55';
        ctx.fillRect(w.x, w.y, w.w * Math.max(0, w.hp) / 3, 3);
      }
    });
    (st.bullets || []).forEach(function (b) {
      ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    });
    (st.tanks || []).forEach(function (t, i) {
      if (!t.alive) return;
      var col = COLORS[t.slot != null ? t.slot : i];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.aim || 0);
      ctx.strokeStyle = '#f5f0df'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24, 0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#0008'; ctx.fillRect(t.x - 14, t.y - 26, 28, 4);
      ctx.fillStyle = '#9ae6b4'; ctx.fillRect(t.x - 14, t.y - 26, 28 * Math.max(0, (t.hp || 3) / 3), 4);
      if (t.id === selfId) { mouse.tx = t.x; mouse.ty = t.y; }
    });
  }

  function findRtsEntityAt(x, y) {
    var st = lastState;
    if (!st || !st.entities) return null;
    var best = null, bd = 22;
    for (var i = 0; i < st.entities.length; i++) {
      var e = st.entities[i];
      if (!e || e.hp <= 0) continue;
      var rad = e.kind === 'building' ? Math.max(e.w || 40, e.h || 40) / 2 : (e.r || 8) + 4;
      var d = Math.hypot((e.x || 0) - x, (e.y || 0) - y);
      if (d < rad && d < bd) { bd = d; best = e; }
    }
    return best;
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
    } else if (e.type === 'melee') {
      ctx.beginPath();
      ctx.moveTo(e.x - r, e.y - r * 0.6);
      ctx.lineTo(e.x + r, e.y - r * 0.6);
      ctx.lineTo(e.x + r * 0.7, e.y + r);
      ctx.lineTo(e.x - r * 0.7, e.y + r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.type === 'ranged') {
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - r);
      ctx.lineTo(e.x + r, e.y);
      ctx.lineTo(e.x, e.y + r);
      ctx.lineTo(e.x - r, e.y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.type === 'bomber') {
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#122421';
      ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'tanker') {
      var w = r * 1.8, h = r * 1.5;
      ctx.fillRect(e.x - w / 2, e.y - h / 2, w, h);
      ctx.strokeRect(e.x - w / 2, e.y - h / 2, w, h);
    } else if (e.type === 'duck') {
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 1, r * 1.1, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
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

  function drawRts(ctx, st) {
    (st.obstacles || []).forEach(function (o) {
      if (o.kind === 'water') {
        ctx.fillStyle = '#1a4a6acc';
        ctx.strokeStyle = '#6ec8ff66';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 16);
        else ctx.rect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
        ctx.fill(); ctx.stroke();
      } else if (o.kind === 'rock') {
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
      var col = COLORS[e.owner != null ? e.owner : 0];
      if (e.kind === 'building') {
        var bw = e.w || 40, bh = e.h || 40;
        if (e.type === 'nexus') {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y - bh / 2);
          ctx.lineTo(e.x + bw / 2, e.y);
          ctx.lineTo(e.x, e.y + bh / 2);
          ctx.lineTo(e.x - bw / 2, e.y);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#efd28aaa'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = '#fff6'; ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); ctx.fill();
        } else if (e.type === 'barracks') {
          ctx.fillStyle = col;
          ctx.fillRect(e.x - bw / 2, e.y - bh / 2, bw, bh);
          ctx.fillStyle = '#0004';
          ctx.fillRect(e.x - bw / 2 + 6, e.y - 8, bw - 12, 16);
        } else {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(bw, bh) / 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#0006'; ctx.stroke();
        }
        drawRtsHpBar(ctx, e.x, e.y - bh / 2 - 8, Math.max(36, bw * 0.7), e.hp, e.maxHp);
      } else if (e.kind === 'unit') {
        drawRtsUnitShape(ctx, e, col);
        if (selectIds.indexOf(e.id) >= 0 || selectIds.some(function (id) { return id == e.id; })) {
          ctx.strokeStyle = '#efd28a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, (e.r || 8) + 6, 0, Math.PI * 2); ctx.stroke();
        }
        drawRtsHpBar(ctx, e.x, e.y - (e.r || 8) - 8, 22, e.hp, e.maxHp);
      }
    });
    (st.beams || []).forEach(function (b) {
      ctx.strokeStyle = b.owner === 0 ? '#efd28acc' : '#6ec8ffcc';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x2, b.y2, 3, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawTd(ctx, st) {
    var h = canvasH;
    ctx.fillStyle = '#0c2228';
    ctx.fillRect(160, 0, 120, h); ctx.fillRect(620, 0, 120, h);
    var lanes = st.slots || [];
    lanes.forEach(function (laneSlots) {
      (laneSlots || []).forEach(function (s) {
        ctx.strokeStyle = '#cbb27055'; ctx.strokeRect(s.x - 14, s.y - 14, 28, 28);
        if (s.tower) {
          ctx.fillStyle = s.tower.kind === 'aoe' ? '#d6a2ff' : s.tower.kind === 'slow' ? '#6ec8ff' : '#efd28a';
          ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, Math.PI * 2); ctx.fill();
        }
      });
    });
    (st.creeps || []).forEach(function (c) {
      ctx.fillStyle = c.kind === 'tank' ? '#ff8a7a' : c.kind === 'swarm' ? '#9ae6b4' : '#f6ad55';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r || 6, 0, Math.PI * 2); ctx.fill();
      if (c.hp != null && c.maxHp) {
        ctx.fillStyle = '#0008'; ctx.fillRect(c.x - 8, c.y - 14, 16, 3);
        ctx.fillStyle = '#9ae6b4'; ctx.fillRect(c.x - 8, c.y - 14, 16 * c.hp / c.maxHp, 3);
      }
    });
    var life = st.life || [];
    ctx.fillStyle = '#88a09a'; ctx.font = '12px Georgia,serif';
    ctx.fillText('P1 ♥ ' + (life[0] != null ? life[0] : ''), 180, 18);
    ctx.fillText('P2 ♥ ' + (life[1] != null ? life[1] : ''), 640, 18);
  }

  function drawSnakes(ctx, st) {
    (st.food || st.orbs || []).forEach(function (f) {
      ctx.fillStyle = '#efd28a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r || 4, 0, Math.PI * 2); ctx.fill();
    });
    (st.snakes || []).forEach(function (s, i) {
      if (s.alive === false) return;
      var body = s.body || s.segments || [];
      var col = s.color || COLORS[s.slot != null ? s.slot : i];
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round';
      if (body.length) {
        ctx.beginPath();
        body.forEach(function (p, j) {
          if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        var head = body[0];
        ctx.beginPath(); ctx.arc(head.x, head.y, 5, 0, Math.PI * 2); ctx.fill();
        if (s.id === selfId || s.playerId === selfId) { mouse.sx = head.x; mouse.sy = head.y; }
      } else if (s.x != null) {
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
      }
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
      ctx.fillStyle = '#f5f0df';
      ctx.beginPath(); ctx.arc(puck.x, puck.y, puck.r || 10, 0, Math.PI * 2); ctx.fill();
    }
  }

  function renderEnded() {
    var winner = '알 수 없음';
    var wid = endedInfo && endedInfo.winnerId;
    var iWon = wid != null && wid === selfId;
    if (wid != null && room && room.players) {
      for (var i = 0; i < room.players.length; i++) {
        if (room.players[i].id === wid) { winner = room.players[i].name; break; }
      }
    }
    if (endedInfo && (endedInfo.winnerName || endedInfo.winner)) winner = endedInfo.winnerName || endedInfo.winner;
    if (iWon) winner = (winner && winner !== '알 수 없음' ? winner + ' (당신)' : '당신');
    var title = iWon ? '승리!' : (wid != null ? '패배' : '경기 종료');
    var reasonText = endedInfo && endedInfo.reason ? translateErr(endedInfo.reason) : '';
    if (gameId === 'rts' && endedInfo && endedInfo.reason === 'nexus') {
      reasonText = iWon ? '상대 본진을 파괴했습니다!' : '본진이 파괴되었습니다';
    }
    refs.body.innerHTML =
      '<div class="hkmp-ended"><h2 style="font-size:' + (iWon ? '42px' : '30px') + ';color:' + (iWon ? '#9ae6b4' : '#efd28a') + '">' + title + '</h2>' +
      '<p style="color:#b1c1bd">승자: <b style="color:#efd28a">' + esc(String(winner)) + '</b></p>' +
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
    init: function (options) { config = options || {}; inject(); return this; },
    openLobby: openLobby,
    close: closeOverlay
  };
})(window, document);
