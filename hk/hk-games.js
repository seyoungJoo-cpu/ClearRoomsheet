(function (window, document) {
  'use strict';

  var GAME_IDS = ['candy', 'merge2048', 'snake', 'memory', 'breakout', 'jump', 'tetris', 'pong', 'flappy', 'mines', 'reaction', 'dodge', 'tank', 'rts', 'towerdefense', 'snakes', 'airhockey'];
  var MP_IDS = ['tank', 'rts', 'towerdefense', 'snakes', 'airhockey'];
  var META = {
    candy: { icon: '🍬', name: '캔디 스위트', desc: '1분 안에 보석을 맞추는 타임어택' },
    merge2048: { icon: '🔢', name: '2048 라운지', desc: '같은 숫자를 합쳐 2048에 도전' },
    snake: { icon: '🐍', name: '미드나잇 스네이크', desc: '벽을 피해 야식을 모아보세요' },
    memory: { icon: '🛎️', name: '호텔 메모리', desc: '호텔 아이콘 12쌍을 빠르게 찾기' },
    breakout: { icon: '🧱', name: '루프탑 브레이크', desc: '5단계 벽돌 격파 · 아이템 수집' },
    jump: { icon: '🪽', name: '스카이 점프', desc: '발판을 밟고 끝없이 높이 오르기' },
    tetris: { icon: '🟪', name: '타워 테트리스', desc: '블록을 쌓아 라인을 지우는 클래식' },
    pong: { icon: '🏓', name: '로비 핑퐁', desc: '빠른 공·짧은 패들로 고난도 랠리' },
    flappy: { icon: '🕊️', name: '벨보이 플라이', desc: '탭으로 날아 기둥 사이를 통과' },
    mines: { icon: '💣', name: '스위트 마인', desc: '지뢰를 피해 안전한 칸을 열기' },
    reaction: { icon: '🔔', name: '벨 리액션', desc: '종을 빠르게 눌러 반응 속도 겨루기' },
    dodge: { icon: '🧳', name: '러기지 닷지', desc: '떨어지는 짐을 피하며 버티기' },
    tank: { icon: '🛡️', name: '탱크대전', desc: '1:1 실시간 탱크 멀티 · 방 만들기' },
    rts: { icon: '🏰', name: '미니 RTS', desc: '본진 파괴 멀티 RTS · 방' },
    towerdefense: { icon: '🗼', name: '타워 디펜스', desc: '서로에게 몬스터 보내기 · 멀티 방' },
    snakes: { icon: '🪱', name: '멀티 스네이크', desc: '최대 8인 슬리더 대전 · 방' },
    airhockey: { icon: '🏒', name: '에어하키', desc: '반응속도 에어하키 · 멀티 방' }
  };
  var config = {};
  var root, refs = {}, active = null, toastTimer = 0;
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
    if (!active || !refs.game || !refs.game.classList.contains('show')) return;
    setGamePaused(!gamePaused);
    toast(gamePaused ? '일시정지 (P로 계속)' : '게임 재개');
  }
  function exitToOrders() {
    close();
    if (window.HKMpGames && typeof HKMpGames.close === 'function') {
      try { HKMpGames.close(); } catch (_) {}
    }
    if (typeof config.onExitToOrders === 'function') {
      try { config.onExitToOrders(); } catch (_) {}
    }
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function name() {
    try { return String((config.getOperatorName && config.getOperatorName()) || '').trim(); }
    catch (_) { return ''; }
  }
  function ranks() {
    var value;
    try { value = config.loadRanks && config.loadRanks(); } catch (_) {}
    value = value || {};
    value.boards = value.boards || {};
    GAME_IDS.forEach(function (id) {
      if (!Array.isArray(value.boards[id])) value.boards[id] = [];
      value.boards[id] = value.boards[id].filter(function (x) {
        return x && typeof x.name === 'string' && isFinite(Number(x.score));
      }).sort(function (a, b) { return Number(b.score) - Number(a.score) || Number(a.at || 0) - Number(b.at || 0); });
    });
    return value;
  }
  function best(id, who) {
    var row = ranks().boards[id].filter(function (x) { return x.name === who; })[0];
    return row ? Number(row.score) : 0;
  }
  function formatScore(n) { return Math.max(0, Math.round(Number(n) || 0)).toLocaleString('ko-KR'); }
  function toast(text) {
    clearTimeout(toastTimer);
    refs.toast.textContent = text;
    refs.toast.classList.add('show');
    toastTimer = setTimeout(function () { refs.toast.classList.remove('show'); }, 2400);
  }
  function save(id, score) {
    if (MP_IDS.indexOf(id) >= 0) return;
    score = Math.max(0, Math.round(Number(score) || 0));
    var who = name();
    if (!score || !who || !config.saveScore) return;
    try {
      config.saveScore(id, score);
      toast('랭킹 반영: ' + who + ' ' + formatScore(score));
      renderRanking(id);
    } catch (err) {
      toast('기록 저장에 실패했습니다');
      if (window.console) console.error(err);
    }
  }
  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function inject() {
    if (root) return;
    var style = el('style');
    style.textContent = [
      '.hk-games-overlay{position:fixed;inset:0;z-index:10000;display:none;color:#f5f0df;background:radial-gradient(circle at 85% 8%,#12453c 0,transparent 34%),linear-gradient(145deg,#07131d,#0a2025 58%,#07151b);font-family:Georgia,"Noto Serif KR","Apple SD Gothic Neo","Malgun Gothic",serif;overflow:auto;overscroll-behavior:contain}',
      '.hk-games-overlay.open{display:block}.hkg-shell{width:min(1180px,calc(100% - 32px));margin:auto;min-height:100%;padding:28px 0 40px;box-sizing:border-box}.hkg-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}',
      '.hkg-brand{display:flex;align-items:center;gap:12px}.hkg-mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid #c5a96a;border-radius:50%;color:#e8cf91;font-family:serif;font-size:22px;cursor:pointer;background:transparent;padding:0}.hkg-mark:hover{border-color:#efd28a;color:#fff6dc;background:#ffffff10}.hkg-eyebrow{color:#cdb575;font-size:11px;letter-spacing:.22em;text-transform:uppercase}.hkg-brand strong{display:block;font-family:Georgia,serif;font-size:20px;letter-spacing:.03em}',
      '.hkg-btn{appearance:none;border:1px solid #8f7b4f;background:#122a2d;color:#f4e8c9;border-radius:12px;padding:10px 15px;font-weight:700;cursor:pointer;transition:.18s}.hkg-btn:hover{transform:translateY(-1px);border-color:#d5bd80;background:#18383a}.hkg-btn.primary{color:#15211f;background:linear-gradient(135deg,#f0d796,#bea15e);border:0}.hkg-btn.icon{font-size:18px;padding:8px 12px}',
      '.hkg-hero{padding:28px 30px;border:1px solid rgba(220,194,126,.26);border-radius:24px;background:linear-gradient(115deg,rgba(13,52,49,.9),rgba(8,25,32,.92));box-shadow:0 24px 70px #0007}.hkg-hero h1{font-family:Georgia,serif;font-size:clamp(34px,6vw,68px);line-height:.95;margin:5px 0 12px;color:#fff6dc}.hkg-hero p{margin:0;color:#aebfba}.hkg-who{margin-top:15px;color:#e5cd91;font-size:13px}',
      '.hkg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}.hkg-card{position:relative;text-align:left;min-height:225px;padding:22px;border:1px solid #ffffff18;border-radius:20px;color:inherit;background:linear-gradient(145deg,#123034dd,#0b1c25ee);box-shadow:0 14px 35px #0004;cursor:pointer;overflow:hidden;transition:.22s}.hkg-card:hover{transform:translateY(-4px);border-color:#cbb27088}.hkg-card:after{content:"";position:absolute;width:90px;height:90px;right:-25px;top:-25px;border-radius:50%;background:#d5bb7020}.hkg-card-icon{font-size:35px}.hkg-card h2{font-family:Georgia,serif;margin:10px 0 5px;font-size:22px}.hkg-card-desc{font-size:13px;color:#9fb2ad;min-height:38px}.hkg-best{margin:14px 0 9px;color:#ebd28f;font-weight:800}.hkg-mini{font-size:12px;color:#b9c8c3;line-height:1.65}.hkg-mini b{display:inline-block;width:18px;color:#d9bd78}',
      '.hkg-game{display:none}.hkg-game.show{display:block}.hkg-game-head{display:flex;align-items:center;gap:12px;margin-bottom:15px}.hkg-game-head h1{font-family:Georgia,serif;margin:0;font-size:clamp(25px,4vw,40px);flex:1}.hkg-hud{display:flex;gap:10px;flex-wrap:wrap}.hkg-pill{padding:8px 12px;border:1px solid #ffffff1c;background:#0d2429;border-radius:12px;font-size:13px}.hkg-pill b{color:#efd58f;margin-left:5px}',
      '.hkg-layout{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:18px}.hkg-stage,.hkg-ranking{border:1px solid #ffffff17;border-radius:20px;background:#091a21cc;box-shadow:0 20px 55px #0005}.hkg-stage{min-height:560px;padding:20px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;touch-action:none}.hkg-stage-inner{width:100%;text-align:center}.hkg-ranking{padding:20px;align-self:start}.hkg-ranking h3{font-family:Georgia,serif;color:#ecd18b;margin:0 0 13px}.hkg-rank{display:grid;grid-template-columns:26px 1fr auto;gap:7px;padding:9px 0;border-bottom:1px solid #ffffff10;font-size:13px}.hkg-rank.me{color:#f2d88f}.hkg-empty{padding:25px 0;color:#708b87;text-align:center}.hkg-actions{display:flex;justify-content:center;gap:9px;margin-top:15px}.hkg-note{color:#88a09a;font-size:12px;margin-top:10px}',
      '.hkg-candy{width:min(100%,560px);display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin:auto;position:relative}.hkg-gem{aspect-ratio:1;border:0;border-radius:14px;background:#0d292d;display:grid;place-items:center;cursor:pointer;padding:8%;transition:transform .2s cubic-bezier(.2,.8,.2,1),opacity .22s,box-shadow .2s}.hkg-gem:before{content:"";width:82%;height:82%;border-radius:42% 58% 50% 50%;background:var(--gem);box-shadow:inset 0 7px 8px #fff6,inset 0 -8px 10px #0004,0 4px 7px #0006;transform:rotate(45deg)}.hkg-gem.sel{transform:scale(.87);box-shadow:0 0 0 3px #efd484}.hkg-gem.pop{transform:scale(.12) rotate(28deg);opacity:0;filter:brightness(1.8)}.hkg-stage.shake{animation:hkg-shake .28s ease}@keyframes hkg-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}.hkg-float{position:absolute;pointer-events:none;font-weight:800;color:#efd28a;text-shadow:0 2px 8px #000a;animation:hkg-float .9s ease forwards;z-index:6;font-size:18px}@keyframes hkg-float{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-36px) scale(1.15)}}',
      '.hkg-2048{width:min(100%,480px);aspect-ratio:1;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#173033;padding:10px;border-radius:18px;margin:auto}.hkg-tile{display:grid;place-items:center;border-radius:11px;background:#284144;color:#f5ecd5;font-size:clamp(20px,5vw,40px);font-weight:900;transition:.12s}.hkg-tile[data-v="0"]{color:transparent}.hkg-tile[data-v="2"]{background:#eee4cf;color:#263c3a}.hkg-tile[data-v="4"]{background:#e7cf9a;color:#263c3a}.hkg-tile[data-v="8"]{background:#df9b55}.hkg-tile[data-v="16"]{background:#d87947}.hkg-tile[data-v="32"]{background:#c9553e}.hkg-tile[data-v="64"]{background:#a83332}.hkg-tile[data-v="128"],.hkg-tile[data-v="256"]{background:#b99b45}.hkg-tile[data-v="512"],.hkg-tile[data-v="1024"],.hkg-tile[data-v="2048"]{background:#dfbf55;color:#142623;box-shadow:0 0 24px #e6c75c88}',
      '.hkg-memory{width:min(100%,640px);display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin:auto;perspective:800px;-webkit-user-select:none;user-select:none}.hkg-memory-card{aspect-ratio:1;border:0;border-radius:14px;background:linear-gradient(145deg,#1b4945,#102d32);color:transparent;font-size:clamp(25px,6vw,46px);cursor:pointer;transform-style:preserve-3d;transition:.28s;box-shadow:inset 0 0 0 1px #d2b77036;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;-webkit-touch-callout:none}.hkg-memory-card.open,.hkg-memory-card.done{transform:rotateY(180deg);background:#e8d39d;color:#18302e}.hkg-memory-card.done{background:#a9d0b9;opacity:.72}',
      '.hkg-mines{width:min(100%,420px);display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin:auto}.hkg-mine{aspect-ratio:1;border:0;border-radius:8px;background:#1a3a3f;color:#f0e6c8;font-weight:800;font-size:clamp(12px,3vw,16px);cursor:pointer;box-shadow:inset 0 0 0 1px #ffffff14}.hkg-mine.open{background:#0d2428;cursor:default}.hkg-mine.flag{background:#3a2f1a;color:#efd28a}.hkg-mine.boom{background:#7a2f2f;color:#fff}.hkg-reaction{width:min(100%,520px);aspect-ratio:1;margin:auto;position:relative;border-radius:18px;background:radial-gradient(circle at 50% 40%,#1a4540,#07151a);overflow:hidden;touch-action:manipulation}.hkg-bell{position:absolute;width:72px;height:72px;border:0;border-radius:50%;background:radial-gradient(circle at 30% 25%,#fff6,#efd28a 35%,#b89245);box-shadow:0 8px 24px #0007;font-size:32px;cursor:pointer;transform:translate(-50%,-50%);animation:hkg-pop .35s ease}.hkg-bell:active{transform:translate(-50%,-50%) scale(.9)}@keyframes hkg-pop{from{transform:translate(-50%,-50%) scale(.2);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}',
      '.hkg-pause{position:absolute;inset:0;display:none;place-items:center;background:#061218b8;backdrop-filter:blur(2px);z-index:5}.hkg-pause.show{display:grid}.hkg-pause-box{padding:22px 28px;border:1px solid #cbb27088;border-radius:18px;background:#0d2429ee;text-align:center;box-shadow:0 16px 40px #0008}.hkg-pause-box strong{display:block;font-family:Georgia,serif;color:#efd28a;font-size:28px;margin-bottom:8px}.hkg-pause-box span{color:#b1c1bd;font-size:13px}.hkg-canvas{display:block;width:min(100%,620px);height:auto;max-height:68vh;margin:auto;border-radius:16px;background:#07151a;box-shadow:inset 0 0 0 1px #ffffff12;touch-action:none}.hkg-message{position:absolute;inset:0;display:none;place-items:center;background:#061218cc;backdrop-filter:blur(3px);z-index:4}.hkg-message.show{display:grid}.hkg-message-box{padding:25px;text-align:center}.hkg-message h2{font-family:Georgia,serif;color:#efd28a;font-size:31px;margin:0 0 7px}.hkg-message p{color:#b1c1bd}.hkg-toast{position:fixed;left:50%;bottom:28px;z-index:10002;transform:translate(-50%,25px);opacity:0;background:#ead18f;color:#122421;padding:12px 18px;border-radius:999px;font-weight:800;box-shadow:0 10px 35px #0008;transition:.25s;pointer-events:none}.hkg-toast.show{transform:translate(-50%,0);opacity:1}',
      '@media(max-width:850px){.hkg-grid{grid-template-columns:repeat(2,1fr)}.hkg-layout{grid-template-columns:1fr}.hkg-ranking{order:2}.hkg-stage{min-height:460px}}@media(max-width:560px){.hkg-shell{width:min(100% - 18px,1180px);padding-top:12px}.hkg-grid{grid-template-columns:1fr}.hkg-card{min-height:195px}.hkg-hero{padding:22px}.hkg-stage{padding:10px;min-height:390px}.hkg-game-head{flex-wrap:wrap}.hkg-game-head h1{order:2;flex-basis:70%}.hkg-hud{order:3;width:100%}.hkg-candy{gap:3px}.hkg-gem{border-radius:9px}.hkg-2048{gap:6px;padding:7px}}'
    ].join('');
    document.head.appendChild(style);
    root = el('div', 'hk-games-overlay');
    root.innerHTML =
      '<div class="hkg-shell"><header class="hkg-top"><div class="hkg-brand"><button type="button" class="hkg-mark" title="랭킹 초기화" aria-label="랭킹 초기화">L</button><div><span class="hkg-eyebrow">Front Lounge</span><strong>Lotte Break</strong></div></div><button class="hkg-btn icon hkg-close" aria-label="닫기">✕</button></header>' +
      '<main class="hkg-hub"><section class="hkg-hero"><span class="hkg-eyebrow">A moment for yourself</span><h1>Lotte Break</h1><p>잠깐의 휴식, 가볍게 즐기고 동료들과 기록을 나눠보세요.</p><div class="hkg-who"></div></section><section class="hkg-grid"></section></main>' +
      '<main class="hkg-game"><header class="hkg-game-head"><button class="hkg-btn hkg-back">← 라운지</button><h1></h1><div class="hkg-hud"></div></header><div class="hkg-layout"><section class="hkg-stage"><div class="hkg-stage-inner"></div><div class="hkg-pause" aria-hidden="true"><div class="hkg-pause-box"><strong>일시정지</strong><span>P 키로 계속 · Ctrl+Q 오더 화면</span></div></div><div class="hkg-message"><div class="hkg-message-box"></div></div></section><aside class="hkg-ranking"></aside></div></main></div><div class="hkg-toast" role="status"></div>';
    document.body.appendChild(root);
    refs.hub = root.querySelector('.hkg-hub');
    refs.grid = root.querySelector('.hkg-grid');
    refs.game = root.querySelector('.hkg-game');
    refs.title = refs.game.querySelector('h1');
    refs.hud = root.querySelector('.hkg-hud');
    refs.stage = root.querySelector('.hkg-stage-inner');
    refs.message = root.querySelector('.hkg-message');
    refs.pause = root.querySelector('.hkg-pause');
    refs.ranking = root.querySelector('.hkg-ranking');
    refs.toast = root.querySelector('.hkg-toast');
    root.querySelector('.hkg-close').addEventListener('click', close);
    root.querySelector('.hkg-back').addEventListener('click', showHub);
    root.querySelector('.hkg-mark').addEventListener('click', promptResetRanks);
    document.addEventListener('keydown', globalKey);
  }
  function promptResetRanks() {
    var pw = window.prompt('랭킹을 초기화하려면 비밀번호를 입력하세요.');
    if (pw == null) return;
    if (String(pw).trim() !== '1111') {
      toast('비밀번호가 올바르지 않습니다');
      return;
    }
    if (!window.confirm('모든 미니게임 랭킹을 초기화할까요?')) return;
    try {
      if (config.resetRanks) config.resetRanks();
      toast('랭킹이 초기화되었습니다');
      if (active && active.id) renderRanking(active.id);
      else if (refs.hub && refs.hub.offsetParent !== null) renderHub();
      else renderHub();
    } catch (err) {
      toast('랭킹 초기화에 실패했습니다');
      if (window.console) console.error(err);
    }
  }
  function globalKey(e) {
    if (!root || !root.classList.contains('open')) return;
    if (isTypingTarget(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ')) {
      e.preventDefault();
      e.stopPropagation();
      exitToOrders();
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'p' || e.key === 'P' || e.code === 'KeyP')) {
      if (active && refs.game && refs.game.classList.contains('show')) {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (gamePaused) { setGamePaused(false); return; }
      if (active) showHub(); else close();
    }
  }
  function open() {
    inject();
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    setGamePaused(false);
    showHub();
  }
  function close() {
    if (!root) return;
    cleanup();
    setGamePaused(false);
    root.classList.remove('open');
    document.body.style.overflow = '';
  }
  function cleanup() {
    if (active && active.destroy) active.destroy();
    active = null;
    setGamePaused(false);
    if (refs.message) refs.message.classList.remove('show');
    if (refs.stage) refs.stage.innerHTML = '';
  }
  function renderHub() {
    var data = ranks(), who = name();
    root.querySelector('.hkg-who').textContent = who ? who + ' 님의 브레이크 룸' : '게임을 시작할 때 근무자 이름을 확인합니다.';
    refs.grid.innerHTML = GAME_IDS.map(function (id) {
      var m = META[id], top = data.boards[id].slice(0, 3);
      var mini = top.length ? top.map(function (x, i) {
        return '<div><b>' + (i + 1) + '</b>' + esc(x.name) + ' · ' + formatScore(x.score) + '</div>';
      }).join('') : '<span>아직 기록이 없습니다</span>';
      return '<button class="hkg-card" data-game="' + id + '"><span class="hkg-card-icon">' + m.icon + '</span><h2>' + m.name + '</h2><div class="hkg-card-desc">' + m.desc + '</div><div class="hkg-best">MY BEST · ' + formatScore(best(id, who)) + '</div><div class="hkg-mini">' + mini + '</div></button>';
    }).join('');
    Array.prototype.forEach.call(refs.grid.querySelectorAll('[data-game]'), function (card) {
      card.addEventListener('click', function () {
        var launch = function () { startGame(card.getAttribute('data-game')); };
        if (name()) launch();
        else if (config.requireOperator) config.requireOperator(launch);
        else toast('근무자 이름을 먼저 선택해주세요');
      });
    });
  }
  function showHub() {
    cleanup();
    refs.game.classList.remove('show');
    refs.hub.style.display = '';
    renderHub();
  }
  function startGame(id) {
    if (MP_IDS.indexOf(id) >= 0) {
      cleanup();
      refs.hub.style.display = '';
      refs.game.classList.remove('show');
      renderHub();
      if (window.HKMpGames) HKMpGames.openLobby(id);
      else toast('멀티플레이 모듈 없음');
      return;
    }
    cleanup();
    refs.hub.style.display = 'none';
    refs.game.classList.add('show');
    refs.title.textContent = META[id].icon + ' ' + META[id].name;
    refs.stage.innerHTML = '';
    refs.hud.innerHTML = '';
    refs.message.classList.remove('show');
    setGamePaused(false);
    renderRanking(id);
    active = games[id]();
  }
  function renderRanking(id) {
    if (!refs.ranking) return;
    var who = name(), board = ranks().boards[id].slice(0, 10);
    refs.ranking.innerHTML = '<h3>Top 10 · ' + META[id].name + '</h3>' +
      (board.length ? board.map(function (x, i) {
        return '<div class="hkg-rank ' + (x.name === who ? 'me' : '') + '"><b>' + (i + 1) + '</b><span>' + esc(x.name) + '</span><strong>' + formatScore(x.score) + '</strong></div>';
      }).join('') : '<div class="hkg-empty">첫 기록의 주인공이 되어보세요.</div>');
  }
  function controller() {
    var removers = [], frames = [], timers = [], alive = true;
    removers.push(function () { alive = false; });
    return {
      on: function (node, type, fn, opts) { node.addEventListener(type, fn, opts); removers.push(function () { node.removeEventListener(type, fn, opts); }); },
      raf: function (fn) {
        function tick(t) {
          if (!alive || !active) return;
          if (gamePaused) {
            var waitId = requestAnimationFrame(tick);
            frames.push(waitId);
            return;
          }
          fn(t);
        }
        var id = requestAnimationFrame(tick);
        frames.push(id);
        return id;
      },
      timer: function (fn, ms) {
        function fire() {
          if (!alive) return;
          if (gamePaused) {
            var again = setTimeout(fire, 100);
            timers.push(again);
            return;
          }
          fn();
        }
        var id = setTimeout(fire, ms);
        timers.push(id);
        return id;
      },
      clearTimers: function () { timers.forEach(clearTimeout); timers = []; },
      destroy: function () { alive = false; removers.forEach(function (x) { x(); }); frames.forEach(cancelAnimationFrame); timers.forEach(clearTimeout); removers = []; frames = []; timers = []; }
    };
  }
  function setHud(items) {
    refs.hud.innerHTML = items.map(function (x) { return '<span class="hkg-pill">' + x[0] + '<b data-hud="' + x[2] + '">' + x[1] + '</b></span>'; }).join('');
  }
  function hud(key, value) {
    var node = refs.hud.querySelector('[data-hud="' + key + '"]');
    if (node) node.textContent = value;
  }
  function actions(restart, score, note) {
    var box = el('div', 'hkg-actions', '<button class="hkg-btn primary">다시 시작</button><button class="hkg-btn hkg-save">기록 저장</button>');
    box.querySelector('.primary').addEventListener('click', restart);
    box.querySelector('.hkg-save').addEventListener('click', function () { save(active.id, score()); });
    refs.stage.appendChild(box);
    if (note) refs.stage.appendChild(el('div', 'hkg-note', note));
  }
  function gameOver(title, text, restart, score) {
    save(active.id, score);
    refs.message.querySelector('.hkg-message-box').innerHTML = '<h2>' + title + '</h2><p>' + text + '</p><button class="hkg-btn primary">다시 도전</button>';
    refs.message.querySelector('button').onclick = restart;
    refs.message.classList.add('show');
  }
  function shakeStage() {
    var stage = root && root.querySelector('.hkg-stage');
    if (!stage) return;
    stage.classList.remove('shake');
    void stage.offsetWidth;
    stage.classList.add('shake');
  }
  function floatScore(x, y, text, parent) {
    var host = parent || refs.stage;
    if (!host) return;
    var node = el('div', 'hkg-float', text);
    node.style.left = Math.round(x) + 'px';
    node.style.top = Math.round(y) + 'px';
    host.style.position = host.style.position || 'relative';
    host.appendChild(node);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 950);
  }
  function makeFx() {
    var parts = [];
    return {
      burst: function (x, y, color, n, speed) {
        n = n || 12; speed = speed || 180;
        for (var i = 0; i < n; i++) {
          var a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
          var sp = speed * (0.45 + Math.random());
          parts.push({
            x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
            life: 0.35 + Math.random() * 0.45, max: 0.8, r: 2 + Math.random() * 3.5, color: color || '#efd28a'
          });
        }
      },
      spark: function (x, y, color) {
        this.burst(x, y, color || '#fff4d0', 8, 120);
      },
      update: function (dt) {
        parts.forEach(function (p) {
          p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.vx *= 0.98;
        });
        parts = parts.filter(function (p) { return p.life > 0; });
      },
      draw: function (ctx) {
        parts.forEach(function (p) {
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    };
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function heroNameText() {
    var n = String(name() || '').trim();
    return n || 'ME';
  }
  function fitHeroLabel(ctx, label, maxW) {
    var t = String(label || 'ME');
    while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
    return t;
  }
  function drawHeroShape(ctx, x, y, w, h, opts) {
    opts = opts || {};
    var label = heroNameText();
    var r = opts.radius != null ? opts.radius : Math.min(12, w / 3, h / 3);
    var ang = opts.angle || 0;
    ctx.save();
    if (ang) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(ang);
      x = -w / 2;
      y = -h / 2;
    }
    var g = ctx.createLinearGradient(x, y, x + w * 0.15, y + h);
    g.addColorStop(0, opts.top || '#fff4d2');
    g.addColorStop(0.4, opts.mid || '#efd28a');
    g.addColorStop(1, opts.bot || '#b89245');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + 3, y + h - 5, w - 6, 3);
    ctx.fillStyle = opts.ink || '#1a302c';
    var fontSize = opts.font || Math.max(9, Math.min(14, Math.floor(Math.min(w * 0.32, h * 0.42))));
    ctx.font = '700 ' + fontSize + 'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    label = fitHeroLabel(ctx, label, w - 8);
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
  }

  var games = {};

  games.candy = function () {
    var c = controller(), board = [], selected = -1, score = 0, busy = false, alive = true;
    var colors = ['#ef5350', '#ffca45', '#4bc6a6', '#55a9e8', '#d86bd7', '#f08b43'];
    var TIME = 60, left = TIME, started = Date.now(), colorCount = 5;
    refs.stage.innerHTML = '<div class="hkg-candy"></div>';
    var grid = refs.stage.firstChild;
    setHud([['점수', '0', 'score'], ['남은 시간', '1:00', 'time'], ['콤보', 'x1', 'combo']]);
    function fmt(sec) {
      sec = Math.max(0, Math.ceil(sec));
      var s = Math.max(0, Math.ceil(sec) % 60);
      return Math.floor(Math.max(0, Math.ceil(sec)) / 60) + ':' + (s < 10 ? '0' : '') + s;
    }
    function random() { return Math.floor(Math.random() * colorCount); }
    function seed() {
      board = [];
      for (var i = 0; i < 64; i++) {
        var v;
        do { v = random(); } while ((i % 8 > 1 && board[i - 1] === v && board[i - 2] === v) || (i > 15 && board[i - 8] === v && board[i - 16] === v));
        board.push(v);
      }
      draw();
    }
    function draw(pop) {
      grid.innerHTML = board.map(function (v, i) {
        return '<button class="hkg-gem ' + (i === selected ? 'sel ' : '') + (pop && pop[i] ? 'pop' : '') + '" data-i="' + i + '" style="--gem:radial-gradient(circle at 30% 25%,#fff,' + colors[v] + ' 28%, ' + colors[v] + ' 62%,#152a30)"></button>';
      }).join('');
    }
    function matches() {
      var found = {}, r, col, i, start, length;
      for (r = 0; r < 8; r++) {
        start = 0;
        for (col = 1; col <= 8; col++) {
          if (col === 8 || board[r * 8 + col] !== board[r * 8 + start]) {
            length = col - start;
            if (length >= 3) for (i = start; i < col; i++) found[r * 8 + i] = 1;
            start = col;
          }
        }
      }
      for (col = 0; col < 8; col++) {
        start = 0;
        for (r = 1; r <= 8; r++) {
          if (r === 8 || board[col + r * 8] !== board[col + start * 8]) {
            length = r - start;
            if (length >= 3) for (i = start; i < r; i++) found[col + i * 8] = 1;
            start = r;
          }
        }
      }
      return found;
    }
    function settle(combo, done) {
      var hit = matches(), keys = Object.keys(hit);
      if (!keys.length) { busy = false; hud('combo', 'x1'); if (done) done(); return; }
      busy = true;
      var gain = keys.length * 12 * combo;
      score += gain; hud('score', formatScore(score)); hud('combo', 'x' + combo);
      draw(hit);
      shakeStage();
      var rect = grid.getBoundingClientRect(), hostRect = refs.stage.getBoundingClientRect();
      floatScore(rect.left - hostRect.left + rect.width / 2, rect.top - hostRect.top + 20, '+' + gain, refs.stage);
      c.timer(function () {
        for (var col = 0; col < 8; col++) {
          var keep = [];
          for (var row = 7; row >= 0; row--) if (!hit[col + row * 8]) keep.push(board[col + row * 8]);
          for (row = 7; row >= 0; row--) board[col + row * 8] = keep[7 - row] == null ? random() : keep[7 - row];
        }
        draw(); c.timer(function () { settle(combo + 1, done); }, 160);
      }, 190);
    }
    function tick() {
      if (!alive) return;
      left = TIME - (Date.now() - started) / 1000;
      hud('time', fmt(left));
      if (left <= 40 && colorCount < 6) { colorCount = 6; toast('색이 늘어났어요!'); }
      if (left <= 20 && colorCount < 6) colorCount = 6;
      if (left <= 0) {
        alive = false; left = 0; hud('time', '0:00');
        gameOver('타임 오버!', '최종 점수 ' + formatScore(score), function () { startGame('candy'); }, score);
        return;
      }
      c.timer(tick, 200);
    }
    function click(e) {
      var node = e.target.closest('.hkg-gem');
      if (!node || busy || !alive) return;
      var i = Number(node.getAttribute('data-i'));
      if (selected < 0) { selected = i; draw(); return; }
      var a = selected; selected = -1;
      var adjacent = Math.abs(a - i) === 8 || (Math.floor(a / 8) === Math.floor(i / 8) && Math.abs(a - i) === 1);
      if (!adjacent) { selected = i; draw(); return; }
      var temp = board[a]; board[a] = board[i]; board[i] = temp;
      if (!Object.keys(matches()).length) { temp = board[a]; board[a] = board[i]; board[i] = temp; draw(); toast('매치가 만들어지는 두 캔디를 바꿔보세요'); return; }
      draw(); settle(1, function () {});
    }
    c.on(grid, 'click', click);
    seed(); tick();
    actions(function () { startGame('candy'); }, function () { return score; }, '1분 안에 인접한 캔디를 바꿔 맞추세요. 시간이 지날수록 색이 늘어납니다.');
    return { id: 'candy', destroy: c.destroy };
  };

  games.merge2048 = function () {
    var c = controller(), board, score, over = false, touch, moves = 0;
    refs.stage.innerHTML = '<div class="hkg-2048"></div>';
    var grid = refs.stage.firstChild;
    setHud([['점수', '0', 'score'], ['최고', formatScore(best('merge2048', name())), 'best'], ['이동', '0', 'moves']]);
    function add() {
      var empty = []; board.forEach(function (v, i) { if (!v) empty.push(i); });
      if (!empty.length) return;
      var fourChance = Math.min(0.22, 0.1 + moves * 0.004);
      board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < (1 - fourChance) ? 2 : 4;
    }
    function draw() {
      grid.innerHTML = board.map(function (v) { return '<div class="hkg-tile" data-v="' + Math.min(v, 2048) + '">' + (v || '') + '</div>'; }).join('');
      hud('score', formatScore(score)); hud('moves', moves);
    }
    function line(values) {
      var a = values.filter(Boolean), out = [], gained = 0;
      for (var i = 0; i < a.length; i++) {
        if (a[i] === a[i + 1]) { out.push(a[i] * 2); gained += a[i] * 2; i++; } else out.push(a[i]);
      }
      while (out.length < 4) out.push(0);
      score += gained; return out;
    }
    function move(dir) {
      if (over) return;
      var old = board.join(','), next = Array(16).fill(0), r, col, vals, out, i;
      for (i = 0; i < 4; i++) {
        vals = [];
        for (var j = 0; j < 4; j++) {
          r = dir === 'left' || dir === 'right' ? i : j;
          col = dir === 'left' || dir === 'right' ? j : i;
          vals.push(board[r * 4 + col]);
        }
        if (dir === 'right' || dir === 'down') vals.reverse();
        out = line(vals);
        if (dir === 'right' || dir === 'down') out.reverse();
        for (j = 0; j < 4; j++) {
          r = dir === 'left' || dir === 'right' ? i : j;
          col = dir === 'left' || dir === 'right' ? j : i;
          next[r * 4 + col] = out[j];
        }
      }
      board = next;
      if (old === board.join(',')) return;
      moves++; add(); draw();
      if (board.indexOf(2048) >= 0 && !grid.dataset.won) { grid.dataset.won = '1'; toast('2048 달성! 계속 플레이할 수 있어요'); }
      if (!canMove()) { over = true; gameOver('더 움직일 수 없어요', '최종 점수 ' + formatScore(score), function () { startGame('merge2048'); }, score); }
    }
    function canMove() {
      if (board.indexOf(0) >= 0) return true;
      for (var i = 0; i < 16; i++) if ((i % 4 < 3 && board[i] === board[i + 1]) || (i < 12 && board[i] === board[i + 4])) return true;
      return false;
    }
    function key(e) {
      var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    }
    c.on(document, 'keydown', key);
    c.on(grid, 'touchstart', function (e) { touch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    c.on(grid, 'touchend', function (e) {
      if (!touch) return; var dx = e.changedTouches[0].clientX - touch[0], dy = e.changedTouches[0].clientY - touch[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });
    board = Array(16).fill(0); score = 0; add(); add(); draw();
    actions(function () { startGame('merge2048'); }, function () { return score; }, '방향키 또는 화면 스와이프로 같은 숫자를 합치세요.');
    return { id: 'merge2048', destroy: c.destroy };
  };

  function canvasBase(width, height) {
    var canvas = el('canvas', 'hkg-canvas'); canvas.width = width; canvas.height = height; refs.stage.appendChild(canvas);
    return { canvas: canvas, ctx: canvas.getContext('2d') };
  }

  games.snake = function () {
    var c = controller(), cv = canvasBase(600, 600), ctx = cv.ctx, snake, dir, next, food, score, last = 0, step = 118, dead = false, touch, fx = makeFx(), anim = 0;
    setHud([['점수', '0', 'score'], ['속도', '1.0x', 'speed']]);
    function spawn() { do { food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) }; } while (snake.some(function (p) { return p.x === food.x && p.y === food.y; })); }
    function input(x, y) { if (dir.x + x || dir.y + y) next = { x: x, y: y }; }
    function key(e) {
      var m = { ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0], ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1] };
      if (m[e.key]) { e.preventDefault(); input(m[e.key][0], m[e.key][1]); }
    }
    function draw(alpha) {
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, 600, 600);
      ctx.strokeStyle = '#0e292c'; for (var i = 0; i <= 20; i++) { ctx.beginPath(); ctx.moveTo(i * 30, 0); ctx.lineTo(i * 30, 600); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * 30); ctx.lineTo(600, i * 30); ctx.stroke(); }
      var pulse = 10 + Math.sin(anim * 6) * 2;
      ctx.fillStyle = '#e2bd64'; ctx.shadowColor = '#efd685'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(food.x * 30 + 15, food.y * 30 + 15, pulse, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      snake.forEach(function (p, i) {
        var t = alpha || 0;
        var ox = i + 1 < snake.length ? snake[i + 1].x : p.x - dir.x;
        var oy = i + 1 < snake.length ? snake[i + 1].y : p.y - dir.y;
        var x = (ox + (p.x - ox) * t) * 30 + 2;
        var y = (oy + (p.y - oy) * t) * 30 + 2;
        if (!i) {
          drawHeroShape(ctx, x - 2, y - 2, 30, 30, { radius: 10, font: 10, top: '#c8f0d4', mid: '#9ad2a9', bot: '#3f8a6a' });
        } else {
          ctx.fillStyle = '#43a982';
          ctx.beginPath(); ctx.roundRect(x, y, 26, 26, 8); ctx.fill();
        }
      });
      fx.draw(ctx);
    }
    function loop(t) {
      if (dead) return;
      var dt = Math.min(0.033, (t - (loop._last || t)) / 1000 || 0); loop._last = t;
      anim += dt; fx.update(dt);
      var alpha = Math.min(1, (t - last) / step);
      if (t - last >= step) {
        last = t; dir = next; var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20 || snake.some(function (p) { return p.x === head.x && p.y === head.y; })) {
          dead = true; fx.burst(snake[0].x * 30 + 15, snake[0].y * 30 + 15, '#ef5350', 18, 220); shakeStage();
          gameOver('벽에 닿았어요', '야식 ' + (score / 10) + '개 · ' + formatScore(score) + '점', function () { startGame('snake'); }, score); return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score += 10; step = Math.max(55, step - 3.5); hud('score', score); hud('speed', (118 / step).toFixed(1) + 'x');
          fx.burst(food.x * 30 + 15, food.y * 30 + 15, '#efd28a', 16, 200); spawn();
        } else snake.pop();
        alpha = 0;
      }
      draw(alpha); c.raf(loop);
    }
    c.on(document, 'keydown', key);
    c.on(cv.canvas, 'touchstart', function (e) { touch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    c.on(cv.canvas, 'touchend', function (e) { var dx = e.changedTouches[0].clientX - touch[0], dy = e.changedTouches[0].clientY - touch[1]; if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? 1 : -1, 0); else input(0, dy > 0 ? 1 : -1); }, { passive: true });
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; dir = next = { x: 1, y: 0 }; score = 0; spawn(); draw(1); c.raf(loop);
    actions(function () { startGame('snake'); }, function () { return score; }, '방향키/WASD 또는 스와이프로 조작하세요. 먹을수록 점점 빨라집니다.');
    return { id: 'snake', destroy: c.destroy };
  };

  games.memory = function () {
    var c = controller(), icons = ['🛏️', '🔑', '🛎️', '⭐', '☕', '🧖', '🍷', '🧳', '🧹', '📜', '🫧', '🧸'], cards, first = -1, locked = false, moves = 0, matched = 0, started = Date.now(), seconds = 0, timer;
    refs.stage.innerHTML = '<div class="hkg-memory"></div>';
    var grid = refs.stage.firstChild;
    setHud([['이동', '0', 'moves'], ['시간', '0초', 'time'], ['점수', '1,400', 'score']]);
    function calc() { return Math.max(100, 1400 - moves * 10 - seconds * 2); }
    function draw() {
      grid.innerHTML = cards.map(function (x, i) {
        var show = x.open || x.done;
        return '<button type="button" class="hkg-memory-card ' + (x.open ? 'open ' : '') + (x.done ? 'done' : '') + '" data-i="' + i + '" draggable="false">' + (show ? x.icon : '') + '</button>';
      }).join('');
    }
    function click(e) {
      var node = e.target.closest('[data-i]'); if (!node || locked) return;
      var i = Number(node.dataset.i); if (cards[i].open || cards[i].done) return;
      cards[i].open = true; draw();
      if (first < 0) { first = i; return; }
      moves++; hud('moves', moves);
      if (cards[first].icon === cards[i].icon) {
        cards[first].done = cards[i].done = true; matched += 2; first = -1; draw();
        floatScore(grid.offsetWidth / 2, 40, 'MATCH!', refs.stage);
        if (matched === 24) { clearInterval(timer); var score = calc(); hud('score', formatScore(score)); gameOver('모든 짝을 찾았어요!', moves + '번 이동 · ' + seconds + '초 · ' + score + '점', function () { startGame('memory'); }, score); }
      } else {
        locked = true; c.timer(function () { cards[first].open = cards[i].open = false; first = -1; locked = false; draw(); }, 480);
      }
      hud('score', formatScore(calc()));
    }
    cards = icons.concat(icons).sort(function () { return Math.random() - .5; }).map(function (icon) { return { icon: icon, open: false, done: false }; });
    draw();
    c.on(grid, 'click', click);
    c.on(grid, 'dragstart', function (e) { e.preventDefault(); });
    c.on(grid, 'selectstart', function (e) { e.preventDefault(); });
    timer = setInterval(function () { if (gamePaused) return; seconds = Math.floor((Date.now() - started) / 1000); hud('time', seconds + '초'); hud('score', formatScore(calc())); }, 500);
    var originalDestroy = c.destroy; c.destroy = function () { clearInterval(timer); originalDestroy(); };
    actions(function () { startGame('memory'); }, calc, '24장(12쌍) 카드를 맞춰 보세요. 이동·시간이 적을수록 고득점입니다.');
    return { id: 'memory', destroy: c.destroy };
  };

  games.breakout = function () {
    var c = controller(), cv = canvasBase(720, 520), ctx = cv.ctx;
    var paddle, ball, bricks, items = [], score = 0, lives = 3, stage = 1, running = true, last = 0, keys = {}, fx = makeFx();
    var baseSpeed = 1, paddleTimer = 0, ballTimer = 0, stuckGuard = 0;
    var ITEM_META = {
      wide: { label: 'WIDE', color: '#9ae6b4' },
      narrow: { label: 'SLIM', color: '#fc8181' },
      slow: { label: 'SLOW', color: '#90cdf4' },
      fast: { label: 'FAST', color: '#f6ad55' },
      life: { label: '1UP', color: '#efd28a' }
    };
    setHud([['점수', '0', 'score'], ['공', '3', 'lives'], ['단계', '1/5', 'stage'], ['벽돌', '0', 'bricks']]);
    function stageCfg(n) {
      var rows = [4, 5, 6, 6, 7][n - 1];
      var cols = [10, 10, 10, 11, 11][n - 1];
      var padW = [112, 104, 96, 88, 80][n - 1];
      var spd = [300, 340, 380, 430, 480][n - 1];
      var drop = [0.28, 0.3, 0.32, 0.34, 0.36][n - 1];
      return { rows: rows, cols: cols, padW: padW, spd: spd, drop: drop };
    }
    function normalizeBallSpeed() {
      var cfg = stageCfg(stage);
      var target = cfg.spd * baseSpeed * (ballTimer > 0 ? (ballTimerType === 'slow' ? 0.72 : 1.22) : 1);
      var mag = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 1;
      var minV = target * 0.92, maxV = target * 1.35;
      var next = Math.max(minV, Math.min(maxV, mag));
      ball.vx = (ball.vx / mag) * next;
      ball.vy = (ball.vy / mag) * next;
      if (Math.abs(ball.vy) < target * 0.35) ball.vy = (ball.vy < 0 ? -1 : 1) * target * 0.55;
    }
    var ballTimerType = '';
    function resetBall() {
      var cfg = stageCfg(stage);
      var v = cfg.spd * baseSpeed;
      ball = { x: paddle.x + paddle.w / 2, y: paddle.y - 14, vx: (Math.random() > .5 ? 1 : -1) * v * 0.78, vy: -v, r: 7 };
      normalizeBallSpeed();
    }
    function setupStage(keepScore) {
      var cfg = stageCfg(stage);
      if (!keepScore) score = 0;
      items = [];
      paddle = { x: (720 - cfg.padW) / 2, y: 478, w: cfg.padW, h: 18, baseW: cfg.padW };
      bricks = [];
      var colors = ['#d1b566', '#4fa98b', '#d47756', '#5f99af', '#b96d79', '#9b7ed8', '#e07a5f'];
      var gapX = 6, gapY = 6;
      var bw = (720 - 24 - (cfg.cols - 1) * gapX) / cfg.cols;
      var bh = 20;
      for (var r = 0; r < cfg.rows; r++) {
        for (var col = 0; col < cfg.cols; col++) {
          bricks.push({
            x: 12 + col * (bw + gapX),
            y: 42 + r * (bh + gapY),
            w: bw,
            h: bh,
            color: colors[r % colors.length],
            hp: stage >= 4 && r < 2 ? 2 : 1
          });
        }
      }
      paddleTimer = 0; ballTimer = 0; ballTimerType = ''; baseSpeed = 1 + (stage - 1) * 0.04;
      resetBall();
      hud('stage', stage + '/5');
      hud('bricks', bricks.length);
      hud('lives', lives);
      hud('score', score);
    }
    function spawnItem(x, y) {
      if (Math.random() > stageCfg(stage).drop) return;
      var kinds = ['wide', 'narrow', 'slow', 'fast', 'life'];
      var kind = kinds[Math.floor(Math.random() * kinds.length)];
      items.push({ x: x, y: y, kind: kind, w: 46, h: 18, vy: 120 + stage * 12 });
    }
    function applyItem(kind) {
      var meta = ITEM_META[kind];
      if (meta) floatScore(paddle.x + paddle.w / 2, paddle.y - 20, meta.label, refs.stage);
      if (kind === 'wide') {
        paddle.w = Math.min(168, paddle.baseW + 42);
        paddle.x = Math.max(0, Math.min(720 - paddle.w, paddle.x - 21));
        paddleTimer = 9;
      } else if (kind === 'narrow') {
        paddle.w = Math.max(54, paddle.baseW - 28);
        paddle.x = Math.max(0, Math.min(720 - paddle.w, paddle.x + 14));
        paddleTimer = 8;
      } else if (kind === 'slow') {
        ballTimerType = 'slow'; ballTimer = 7; normalizeBallSpeed();
      } else if (kind === 'fast') {
        ballTimerType = 'fast'; ballTimer = 6; normalizeBallSpeed();
      } else if (kind === 'life') {
        lives = Math.min(6, lives + 1); hud('lives', lives);
      }
    }
    function nextStageOrClear() {
      if (stage < 5) {
        stage++;
        fx.burst(360, 200, '#efd28a', 28, 260);
        floatScore(360, 180, 'STAGE ' + stage, refs.stage);
        setupStage(true);
        score += 80 * (stage - 1);
        hud('score', score);
        return;
      }
      running = false;
      fx.burst(360, 200, '#efd28a', 40, 300);
      gameOver('5단계 클리어!', '최종 ' + formatScore(score) + '점', function () { startGame('breakout'); }, score);
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, 520); g.addColorStop(0, '#0b2529'); g.addColorStop(1, '#061318'); ctx.fillStyle = g; ctx.fillRect(0, 0, 720, 520);
      bricks.forEach(function (b) {
        ctx.globalAlpha = b.hp > 1 ? 1 : 0.95;
        ctx.fillStyle = b.color; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 5); else ctx.rect(b.x, b.y, b.w, b.h);
        ctx.fill();
        ctx.fillStyle = '#ffffff30'; ctx.fillRect(b.x + 4, b.y + 3, b.w - 8, 3);
        if (b.hp > 1) {
          ctx.strokeStyle = '#fff8'; ctx.lineWidth = 1.5;
          ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
        }
        ctx.globalAlpha = 1;
      });
      items.forEach(function (it) {
        var m = ITEM_META[it.kind] || { label: '?', color: '#fff' };
        ctx.fillStyle = m.color; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h, 6); else ctx.rect(it.x - it.w / 2, it.y - it.h / 2, it.w, it.h);
        ctx.fill();
        ctx.fillStyle = '#122421'; ctx.font = 'bold 10px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(m.label, it.x, it.y + 0.5);
      });
      drawHeroShape(ctx, paddle.x, paddle.y, paddle.w, paddle.h, { radius: 8, font: 10 });
      ctx.fillStyle = '#fff4d0'; ctx.shadowColor = '#efd685'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      fx.draw(ctx);
    }
    function loop(t) {
      if (!running) return; var dt = Math.min(.022, (t - last) / 1000 || 0); last = t;
      fx.update(dt);
      if (paddleTimer > 0) {
        paddleTimer -= dt;
        if (paddleTimer <= 0) {
          paddle.w = paddle.baseW;
          paddle.x = Math.max(0, Math.min(720 - paddle.w, paddle.x));
        }
      }
      if (ballTimer > 0) {
        ballTimer -= dt;
        if (ballTimer <= 0) { ballTimerType = ''; normalizeBallSpeed(); }
      }
      var steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      paddle.x = Math.max(0, Math.min(720 - paddle.w, paddle.x + steer * (540 + stage * 18) * dt));
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      stuckGuard += dt;
      if (stuckGuard > 4) { normalizeBallSpeed(); stuckGuard = 0; }
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); fx.spark(ball.x, ball.y, '#9ad2a9'); }
      if (ball.x > 720 - ball.r) { ball.x = 720 - ball.r; ball.vx = -Math.abs(ball.vx); fx.spark(ball.x, ball.y, '#9ad2a9'); }
      if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); fx.spark(ball.x, ball.y, '#9ad2a9'); }
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y < paddle.y + paddle.h && ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
        ball.y = paddle.y - ball.r;
        var hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        var cfg = stageCfg(stage);
        ball.vx = hit * (360 + stage * 18) * baseSpeed;
        ball.vy = -Math.abs(Math.max(cfg.spd * 0.85, Math.abs(ball.vy))) * 1.035;
        normalizeBallSpeed();
        stuckGuard = 0;
        fx.spark(ball.x, ball.y, '#efd28a');
      }
      for (var i = bricks.length - 1; i >= 0; i--) {
        var b = bricks[i];
        if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w && ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
          var overlapL = ball.x + ball.r - b.x;
          var overlapR = b.x + b.w - (ball.x - ball.r);
          var overlapT = ball.y + ball.r - b.y;
          var overlapB = b.y + b.h - (ball.y - ball.r);
          var minX = Math.min(overlapL, overlapR);
          var minY = Math.min(overlapT, overlapB);
          if (minX < minY) ball.vx *= -1; else ball.vy *= -1;
          b.hp -= 1;
          if (b.hp <= 0) {
            bricks.splice(i, 1);
            score += 10 + stage * 4;
            spawnItem(b.x + b.w / 2, b.y + b.h / 2);
            fx.burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 14, 200);
          } else {
            score += 4;
            fx.spark(ball.x, ball.y, b.color);
          }
          baseSpeed = Math.min(1.55, baseSpeed + 0.008);
          normalizeBallSpeed();
          hud('score', score); hud('bricks', bricks.length);
          break;
        }
      }
      for (var j = items.length - 1; j >= 0; j--) {
        var it = items[j];
        it.y += it.vy * dt;
        if (it.y - it.h / 2 > 530) { items.splice(j, 1); continue; }
        if (it.y + it.h / 2 >= paddle.y && it.y - it.h / 2 <= paddle.y + paddle.h &&
            it.x + it.w / 2 >= paddle.x && it.x - it.w / 2 <= paddle.x + paddle.w) {
          applyItem(it.kind);
          items.splice(j, 1);
          fx.burst(it.x, it.y, (ITEM_META[it.kind] || {}).color || '#efd28a', 12, 160);
        }
      }
      if (!bricks.length) { nextStageOrClear(); if (!running) return; }
      if (ball.y > 540) {
        lives--; hud('lives', lives); shakeStage(); items = [];
        if (!lives) { running = false; gameOver('공을 놓쳤어요', '단계 ' + stage + ' · ' + formatScore(score) + '점', function () { startGame('breakout'); }, score); return; }
        paddle.w = paddle.baseW; paddleTimer = 0; ballTimer = 0; ballTimerType = '';
        resetBall();
      }
      draw(); c.raf(loop);
    }
    function key(e) {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].indexOf(e.key) < 0) return;
      e.preventDefault();
      keys[e.key.toLowerCase()] = e.type === 'keydown';
      keys[e.key] = e.type === 'keydown';
    }
    c.on(document, 'keydown', key); c.on(document, 'keyup', key);
    setupStage(false); draw(); c.raf(loop);
    actions(function () { startGame('breakout'); }, function () { return score; }, '←→ / A·D · 벽돌을 깨면 아이템 · 5단계 클리어에 도전하세요. 공은 1개입니다.');
    return { id: 'breakout', destroy: c.destroy };
  };

  games.jump = function () {
    var c = controller(), cv = canvasBase(520, 700), ctx = cv.ctx, player, platforms, keys = {}, score = 0, running = true, last = 0, touchX = null, fx = makeFx();
    setHud([['높이', '0', 'score'], ['최고', formatScore(best('jump', name())), 'best']]);
    function setup() {
      player = { x: 238, y: 580, w: 46, h: 40, vx: 0, vy: -650 };
      platforms = [{ x: 200, y: 640, w: 120 }];
      for (var y = 550; y > -100; y -= 78 + Math.random() * 28) platforms.push({ x: 20 + Math.random() * 390, y: y, w: 78 + Math.random() * 34 });
    }
    function gapScale() { return Math.max(0.72, 1 - score / 18000); }
    function addPlatforms() {
      var top = Math.min.apply(null, platforms.map(function (p) { return p.y; }));
      var g = gapScale();
      while (top > -120) {
        top -= (72 + Math.random() * 40) / g;
        platforms.push({ x: 15 + Math.random() * 400, y: top, w: (70 + Math.random() * 40) * g });
      }
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, 700); g.addColorStop(0, '#123e42'); g.addColorStop(1, '#07161c'); ctx.fillStyle = g; ctx.fillRect(0, 0, 520, 700);
      ctx.fillStyle = '#ffffff12'; for (var i = 0; i < 35; i++) { ctx.beginPath(); ctx.arc((i * 83) % 520, (i * 137 + score * 0.02) % 700, i % 3 + 1, 0, 7); ctx.fill(); }
      platforms.forEach(function (p) { ctx.fillStyle = '#d6bc75'; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, 11, 6); ctx.fill(); ctx.fillStyle = '#719b7a'; ctx.fillRect(p.x + 7, p.y + 10, p.w - 14, 4); });
      drawHeroShape(ctx, player.x, player.y, player.w, player.h, { radius: 12, font: 11 });
      fx.draw(ctx);
    }
    function loop(t) {
      if (!running) return; var dt = Math.min(.022, (t - last) / 1000 || 0); last = t; fx.update(dt);
      var steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (touchX != null) steer = touchX < player.x + player.w / 2 ? -1 : 1;
      player.vx += steer * 1300 * dt; player.vx *= Math.pow(.05, dt); player.vx = Math.max(-280, Math.min(280, player.vx));
      player.x += player.vx * dt; player.vy += 1480 * dt; var oldBottom = player.y + player.h; player.y += player.vy * dt;
      if (player.x < -player.w) player.x = 520; if (player.x > 520) player.x = -player.w;
      if (player.vy > 0) platforms.some(function (p) {
        if (oldBottom <= p.y && player.y + player.h >= p.y && player.x + player.w > p.x && player.x < p.x + p.w) {
          player.y = p.y - player.h; player.vy = -690; fx.spark(player.x + player.w / 2, player.y + player.h, '#d6bc75'); return true;
        }
        return false;
      });
      if (player.y < 270) {
        var shift = 270 - player.y; player.y = 270; platforms.forEach(function (p) { p.y += shift; });
        score += Math.round(shift); hud('score', formatScore(score));
        platforms = platforms.filter(function (p) { return p.y < 730; }); addPlatforms();
      }
      if (player.y > 730) { running = false; shakeStage(); gameOver('아래로 떨어졌어요', '오른 높이 ' + formatScore(score), function () { startGame('jump'); }, score); return; }
      draw(); c.raf(loop);
    }
    function key(e) { if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].indexOf(e.key) >= 0) { e.preventDefault(); keys[e.key.toLowerCase()] = e.type === 'keydown'; keys[e.key] = e.type === 'keydown'; } }
    c.on(document, 'keydown', key); c.on(document, 'keyup', key);
    c.on(cv.canvas, 'touchstart', function (e) { e.preventDefault(); var r = cv.canvas.getBoundingClientRect(); touchX = (e.touches[0].clientX - r.left) * 520 / r.width; }, { passive: false });
    c.on(cv.canvas, 'touchmove', function (e) { var r = cv.canvas.getBoundingClientRect(); touchX = (e.touches[0].clientX - r.left) * 520 / r.width; }, { passive: true });
    c.on(cv.canvas, 'touchend', function () { touchX = null; }, { passive: true });
    setup(); draw(); c.raf(loop);
    actions(function () { startGame('jump'); }, function () { return score; }, '좌우 방향키/A·D 또는 화면 좌우를 눌러 이동하세요. 높이 오를수록 발판이 좁아집니다.');
    return { id: 'jump', destroy: c.destroy };
  };

  games.tetris = function () {
    var c = controller(), cv = canvasBase(360, 680), ctx = cv.ctx, W = 10, H = 20, cell = 34, padX = 10, padY = 10;
    var shapes = [[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]]];
    var colors = ['#55c2c8', '#efd28a', '#d86bd7', '#55a9e8', '#f08b43', '#4bc6a6', '#ef5350'];
    var grid, piece, nextId, score = 0, lines = 0, drop = 0, softDrop = 0, step = 620, over = false, held = {}, fx = makeFx(), flashRows = [];
    setHud([['점수', '0', 'score'], ['라인', '0', 'lines'], ['레벨', '1', 'level']]);
    function empty() { return Array.from({ length: H }, function () { return Array(W).fill(0); }); }
    function level() { return 1 + Math.floor(lines / 8); }
    function spawn() {
      nextId = nextId == null ? Math.floor(Math.random() * shapes.length) : nextId;
      var id = nextId; nextId = Math.floor(Math.random() * shapes.length);
      piece = { id: id, m: shapes[id].map(function (r) { return r.slice(); }), x: 3, y: 0 };
      if (collide(piece.x, piece.y, piece.m)) { over = true; gameOver('타워가 무너졌어요', '라인 ' + lines + ' · ' + formatScore(score), function () { startGame('tetris'); }, score); }
    }
    function collide(x, y, m) {
      for (var r = 0; r < m.length; r++) for (var col = 0; col < m[r].length; col++) {
        if (!m[r][col]) continue;
        var nx = x + col, ny = y + r;
        if (nx < 0 || nx >= W || ny >= H || (ny >= 0 && grid[ny][nx])) return true;
      }
      return false;
    }
    function merge() {
      piece.m.forEach(function (row, r) { row.forEach(function (v, col) { if (v && piece.y + r >= 0) grid[piece.y + r][piece.x + col] = piece.id + 1; }); });
      var cleared = [], r;
      for (r = H - 1; r >= 0; r--) if (grid[r].every(Boolean)) cleared.push(r);
      if (cleared.length) {
        flashRows = cleared.slice();
        cleared.forEach(function (row) {
          for (var x = 0; x < W; x++) fx.burst(padX + x * cell + cell / 2, padY + row * cell + cell / 2, '#fff4d0', 4, 140);
        });
        c.timer(function () {
          cleared.sort(function (a, b) { return b - a; }).forEach(function (row) {
            grid.splice(row, 1); grid.unshift(Array(W).fill(0));
          });
          flashRows = [];
          lines += cleared.length;
          score += [0, 120, 300, 520, 900][cleared.length] * level();
          step = Math.max(110, 620 - (level() - 1) * 48);
          hud('score', formatScore(score)); hud('lines', lines); hud('level', level());
          spawn();
        }, 120);
      } else spawn();
    }
    function rotate() {
      var m = piece.m, rotated = m[0].map(function (_, i) { return m.map(function (row) { return row[i]; }).reverse(); });
      if (!collide(piece.x, piece.y, rotated)) piece.m = rotated;
      else if (!collide(piece.x - 1, piece.y, rotated)) { piece.x--; piece.m = rotated; }
      else if (!collide(piece.x + 1, piece.y, rotated)) { piece.x++; piece.m = rotated; }
    }
    function soft() { if (!collide(piece.x, piece.y + 1, piece.m)) piece.y++; else merge(); }
    function hard() { while (!collide(piece.x, piece.y + 1, piece.m)) { piece.y++; score += 2; } hud('score', formatScore(score)); merge(); }
    function drawCell(x, y, color, ghost) {
      var px = padX + x * cell, py = padY + y * cell;
      if (ghost) {
        ctx.globalAlpha = 0.28; ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.strokeRect(px + 3, py + 3, cell - 6, cell - 6); ctx.globalAlpha = 1; return;
      }
      var g = ctx.createLinearGradient(px, py, px + cell, py + cell);
      g.addColorStop(0, '#ffffff55'); g.addColorStop(0.22, color); g.addColorStop(1, '#00000055');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(px + 1, py + 1, cell - 2, cell - 2, 7); ctx.fill();
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffffff40'; ctx.fillRect(px + 5, py + 4, cell - 12, 4);
      ctx.fillStyle = '#00000033'; ctx.fillRect(px + 5, py + cell - 8, cell - 12, 3);
    }
    function ghostY() {
      var y = piece.y; while (!collide(piece.x, y + 1, piece.m)) y++; return y;
    }
    function draw() {
      var bg = ctx.createLinearGradient(0, 0, 0, 680);
      bg.addColorStop(0, '#0d2a30'); bg.addColorStop(1, '#061218');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 360, 680);
      ctx.fillStyle = '#08181d'; ctx.beginPath(); ctx.roundRect(padX - 4, padY - 4, W * cell + 8, H * cell + 8, 12); ctx.fill();
      ctx.strokeStyle = '#ffffff10';
      for (var i = 0; i <= W; i++) { ctx.beginPath(); ctx.moveTo(padX + i * cell, padY); ctx.lineTo(padX + i * cell, padY + H * cell); ctx.stroke(); }
      for (var j = 0; j <= H; j++) { ctx.beginPath(); ctx.moveTo(padX, padY + j * cell); ctx.lineTo(padX + W * cell, padY + j * cell); ctx.stroke(); }
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        if (grid[y][x]) {
          if (flashRows.indexOf(y) >= 0) {
            ctx.fillStyle = '#fff8'; ctx.fillRect(padX + x * cell, padY + y * cell, cell, cell);
          } else drawCell(x, y, colors[grid[y][x] - 1]);
        }
      }
      if (piece && !flashRows.length) {
        var gy = ghostY();
        piece.m.forEach(function (row, r) { row.forEach(function (v, col) { if (v) drawCell(piece.x + col, gy + r, colors[piece.id], true); }); });
        piece.m.forEach(function (row, r) { row.forEach(function (v, col) { if (v) drawCell(piece.x + col, piece.y + r, colors[piece.id]); }); });
      }
      fx.draw(ctx);
    }
    function loop(t) {
      if (over) return;
      var dt = Math.min(0.033, (t - (loop._last || t)) / 1000 || 0); loop._last = t;
      fx.update(dt);
      if (flashRows.length) { draw(); c.raf(loop); return; }
      if (!drop) drop = t;
      if (t - drop >= step) { drop = t; soft(); }
      if (held.left && t - (held._leftAt || 0) > 140) { held._leftAt = t; if (!collide(piece.x - 1, piece.y, piece.m)) piece.x--; }
      if (held.right && t - (held._rightAt || 0) > 140) { held._rightAt = t; if (!collide(piece.x + 1, piece.y, piece.m)) piece.x++; }
      if (held.down) {
        if (!softDrop || t - softDrop >= 55) { softDrop = t; soft(); score += 1; hud('score', formatScore(score)); }
      }
      draw(); c.raf(loop);
    }
    function key(e) {
      var map = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'down', s: 'down', S: 'down', ArrowUp: 'up', w: 'up', W: 'up', ' ': 'space' };
      var k = map[e.key]; if (!k) return;
      e.preventDefault();
      if (e.type === 'keyup') { held[k] = false; return; }
      if (e.repeat && (k === 'up' || k === 'space')) return;
      if (k === 'left') { held.left = true; held._leftAt = performance.now(); if (!collide(piece.x - 1, piece.y, piece.m)) piece.x--; }
      else if (k === 'right') { held.right = true; held._rightAt = performance.now(); if (!collide(piece.x + 1, piece.y, piece.m)) piece.x++; }
      else if (k === 'down') { held.down = true; softDrop = 0; }
      else if (k === 'up') rotate();
      else if (k === 'space') hard();
    }
    c.on(document, 'keydown', key); c.on(document, 'keyup', key);
    c.on(cv.canvas, 'click', function () { rotate(); });
    grid = empty(); spawn(); draw(); c.raf(loop);
    actions(function () { startGame('tetris'); }, function () { return score; }, '←→ 이동 · ↑/클릭 회전 · ↓ 소프트드롭 · Space 하드드롭');
    return { id: 'tetris', destroy: c.destroy };
  };

  games.pong = function () {
    var c = controller(), cv = canvasBase(640, 420), ctx = cv.ctx, paddle, ball, score = 0, lives = 2, running = true, last = 0, fx = makeFx(), speed = 1.15, rally = 0;
    setHud([['점수', '0', 'score'], ['목숨', '2', 'lives'], ['최고', formatScore(best('pong', name())), 'best']]);
    function reset() {
      paddle = { x: 275, y: 378, w: 78, h: 16 };
      var v = 340 * speed;
      var ang = (Math.random() * 0.7 + 0.35) * (Math.random() > .5 ? 1 : -1);
      ball = { x: 320, y: 200, vx: Math.sin(ang) * v, vy: -Math.abs(Math.cos(ang)) * v, r: 7 };
    }
    function draw() {
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, 640, 420);
      ctx.strokeStyle = '#ffffff18'; ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.moveTo(0, 210); ctx.lineTo(640, 210); ctx.stroke(); ctx.setLineDash([]);
      drawHeroShape(ctx, paddle.x, paddle.y, paddle.w, paddle.h, { radius: 7, font: 10 });
      ctx.fillStyle = '#fff4d0'; ctx.shadowColor = '#efd685'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      fx.draw(ctx);
    }
    function clampBall() {
      var mag = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || 1;
      var minV = 300 * speed, maxV = 620 * speed;
      var next = Math.max(minV, Math.min(maxV, mag));
      ball.vx = (ball.vx / mag) * next;
      ball.vy = (ball.vy / mag) * next;
      if (Math.abs(ball.vy) < minV * 0.4) ball.vy = (ball.vy < 0 ? -1 : 1) * minV * 0.55;
    }
    function loop(t) {
      if (!running) return; var dt = Math.min(.02, (t - last) / 1000 || 0); last = t; fx.update(dt);
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < ball.r || ball.x > 640 - ball.r) {
        ball.vx *= -1;
        ball.x = Math.max(ball.r, Math.min(640 - ball.r, ball.x));
        fx.spark(ball.x, ball.y);
      }
      if (ball.y < ball.r) {
        ball.y = ball.r; ball.vy = Math.abs(ball.vy);
        score += 8; rally++; speed = Math.min(2.85, speed + 0.045 + rally * 0.004);
        hud('score', score); clampBall(); fx.spark(ball.x, ball.y, '#9ad2a9');
      }
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.x >= paddle.x - 4 && ball.x <= paddle.x + paddle.w + 4) {
        ball.y = paddle.y - ball.r;
        var hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        hit = Math.max(-1, Math.min(1, hit));
        ball.vx = hit * (380 + speed * 90) + (Math.random() - 0.5) * 40;
        ball.vy = -Math.abs(ball.vy) * 1.06;
        score += 12; rally++; speed = Math.min(2.85, speed + 0.05);
        hud('score', score); clampBall(); fx.burst(ball.x, ball.y, '#efd28a', 10, 160);
      }
      if (ball.y > 430) {
        lives--; hud('lives', lives); shakeStage(); rally = Math.max(0, rally - 3);
        if (!lives) { running = false; gameOver('랠리 종료', formatScore(score) + '점', function () { startGame('pong'); }, score); return; }
        speed = Math.max(1.15, speed * 0.92);
        reset();
      }
      draw(); c.raf(loop);
    }
    function point(e) {
      var rect = cv.canvas.getBoundingClientRect(), x = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) * 640 / rect.width;
      paddle.x = Math.max(0, Math.min(640 - paddle.w, x - paddle.w / 2));
    }
    c.on(cv.canvas, 'mousemove', point); c.on(cv.canvas, 'touchmove', function (e) { e.preventDefault(); point(e); }, { passive: false });
    reset(); draw(); c.raf(loop);
    actions(function () { startGame('pong'); }, function () { return score; }, '짧은 패들 · 빠른 가속. 목숨 2로 최대한 오래 버텨보세요.');
    return { id: 'pong', destroy: c.destroy };
  };

  games.flappy = function () {
    var c = controller(), cv = canvasBase(420, 640), ctx = cv.ctx, bird, pipes, score = 0, running = true, started = false, last = 0, grav = 1720, fx = makeFx(), wing = 0;
    setHud([['점수', '0', 'score'], ['최고', formatScore(best('flappy', name())), 'best']]);
    function setup() { bird = { x: 90, y: 280, vy: 0, r: 18, w: 54, h: 30 }; pipes = []; score = 0; started = false; running = true; }
    function difficulty() {
      return {
        gap: Math.max(118, 158 - score * 2.2),
        speed: 175 + Math.min(90, score * 4.5),
        spacing: Math.max(170, 230 - score * 2)
      };
    }
    function addPipe() {
      var d = difficulty();
      var top = 70 + Math.random() * (500 - d.gap);
      pipes.push({ x: 440, top: top, gap: d.gap, passed: false });
    }
    function flap() { if (!running) return; if (!started) { started = true; addPipe(); } bird.vy = -450; fx.spark(bird.x, bird.y + 8, '#ffffff88'); }
    function drawHeroBird(x, y, ang) {
      drawHeroShape(ctx, x - bird.w / 2, y - bird.h / 2, bird.w, bird.h, {
        angle: ang,
        radius: 12,
        font: 11,
        top: '#fff1c8',
        mid: '#efd28a',
        bot: '#b89245'
      });
      // small wing accent
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = '#d6bc75';
      ctx.beginPath();
      ctx.ellipse(-22, 2, 7, 4 + Math.sin(wing) * 1.5, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    function drawPipe(p) {
      var cap = 16;
      var body = ctx.createLinearGradient(p.x, 0, p.x + 54, 0);
      body.addColorStop(0, '#245a4f'); body.addColorStop(0.5, '#3f8a74'); body.addColorStop(1, '#1d463e');
      ctx.fillStyle = body;
      ctx.fillRect(p.x, 0, 54, p.top);
      ctx.fillRect(p.x, p.top + p.gap, 54, 640 - p.top - p.gap);
      ctx.fillStyle = '#d6bc75';
      ctx.beginPath(); ctx.roundRect(p.x - 5, p.top - cap, 64, cap, 5); ctx.fill();
      ctx.beginPath(); ctx.roundRect(p.x - 5, p.top + p.gap, 64, cap, 5); ctx.fill();
      ctx.fillStyle = '#ffffff22'; ctx.fillRect(p.x + 6, 8, 8, Math.max(0, p.top - 24));
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, '#1a5560'); g.addColorStop(0.55, '#0d3038'); g.addColorStop(1, '#07151a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 420, 640);
      ctx.fillStyle = '#ffffff14';
      for (var i = 0; i < 18; i++) ctx.beginPath(), ctx.arc((i * 73 + score * 8) % 420, (i * 97) % 500, 1.5 + i % 2, 0, 7), ctx.fill();
      pipes.forEach(drawPipe);
      var ang = Math.max(-0.5, Math.min(0.7, bird.vy / 700));
      drawHeroBird(bird.x, bird.y, ang);
      fx.draw(ctx);
      if (!started) { ctx.fillStyle = '#f5ecd5'; ctx.font = '16px Georgia'; ctx.textAlign = 'center'; ctx.fillText('탭 / Space 로 시작', 210, 340); }
    }
    function loop(t) {
      if (!running) return; var dt = Math.min(.022, (t - last) / 1000 || 0); last = t; wing += dt * 12; fx.update(dt);
      if (started) {
        var d = difficulty();
        bird.vy += grav * dt; bird.y += bird.vy * dt;
        pipes.forEach(function (p) {
          p.x -= d.speed * dt;
          if (!p.passed && p.x + 54 < bird.x) {
            p.passed = true; score++; hud('score', score);
            fx.burst(bird.x, bird.y, '#efd28a', 12, 170);
          }
        });
        pipes = pipes.filter(function (p) { return p.x > -70; });
        if (!pipes.length || pipes[pipes.length - 1].x < d.spacing) addPipe();
        var hit = bird.y - bird.h / 2 < 0 || bird.y + bird.h / 2 > 640 || pipes.some(function (p) {
          return bird.x + bird.w / 2 > p.x && bird.x - bird.w / 2 < p.x + 54 && (bird.y - bird.h / 2 < p.top || bird.y + bird.h / 2 > p.top + p.gap);
        });
        if (hit) { running = false; shakeStage(); fx.burst(bird.x, bird.y, '#ef5350', 18, 220); gameOver('착지!', formatScore(score) + '개 통과', function () { startGame('flappy'); }, score); return; }
      }
      draw(); c.raf(loop);
    }
    function key(e) { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); flap(); } }
    c.on(document, 'keydown', key); c.on(cv.canvas, 'pointerdown', function (e) { e.preventDefault(); flap(); });
    setup(); draw(); c.raf(loop);
    actions(function () { startGame('flappy'); }, function () { return score; }, '탭 또는 Space로 날아오르세요. 점수에 따라 틈이 좁아집니다.');
    return { id: 'flappy', destroy: c.destroy };
  };

  games.mines = function () {
    var c = controller(), SIZE = 8, MINES = 12, cells, opened = 0, flags = 0, alive = true, score = 0, started = Date.now(), seeded = false;
    refs.stage.innerHTML = '<div class="hkg-mines"></div>';
    var grid = refs.stage.firstChild;
    setHud([['남은 지뢰', String(MINES), 'left'], ['점수', '0', 'score'], ['시간', '0초', 'time']]);
    function neighbors(i) {
      var x = i % SIZE, y = Math.floor(i / SIZE), out = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; var nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) out.push(ny * SIZE + nx);
      }
      return out;
    }
    function seed(safe) {
      cells = Array.from({ length: SIZE * SIZE }, function () { return { mine: false, open: false, flag: false, n: 0 }; });
      var placed = 0;
      while (placed < MINES) {
        var i = Math.floor(Math.random() * cells.length);
        if (cells[i].mine || i === safe || neighbors(safe).indexOf(i) >= 0) continue;
        cells[i].mine = true; placed++;
      }
      cells.forEach(function (cell, i) { if (!cell.mine) cell.n = neighbors(i).filter(function (j) { return cells[j].mine; }).length; });
      seeded = true; started = Date.now();
    }
    function calc() { return Math.max(50, 1100 - Math.floor((Date.now() - started) / 1000) * 5 - flags * 5); }
    function draw() {
      grid.innerHTML = cells.map(function (cell, i) {
        var cls = 'hkg-mine' + (cell.open ? ' open' : '') + (cell.flag ? ' flag' : '') + (cell.open && cell.mine ? ' boom' : '');
        var label = cell.open ? (cell.mine ? '💣' : (cell.n || '')) : (cell.flag ? '🚩' : '');
        return '<button class="' + cls + '" data-i="' + i + '">' + label + '</button>';
      }).join('');
      hud('left', Math.max(0, MINES - flags)); hud('score', formatScore(seeded ? calc() : 1100)); hud('time', Math.floor((Date.now() - started) / 1000) + '초');
    }
    function reveal(i) {
      var cell = cells[i]; if (cell.open || cell.flag) return;
      cell.open = true; opened++;
      if (!cell.mine && !cell.n) neighbors(i).forEach(reveal);
    }
    function click(e) {
      var node = e.target.closest('[data-i]'); if (!node || !alive) return;
      var i = Number(node.dataset.i);
      if (!seeded) seed(i);
      if (e.shiftKey || e.type === 'contextmenu') {
        if (!cells[i].open) { cells[i].flag = !cells[i].flag; flags += cells[i].flag ? 1 : -1; draw(); }
        return;
      }
      if (cells[i].flag) return;
      if (cells[i].mine) {
        alive = false; cells.forEach(function (x) { if (x.mine) x.open = true; }); draw(); shakeStage();
        gameOver('지뢰 발견!', '안전 칸 ' + opened + '개', function () { startGame('mines'); }, Math.max(10, opened * 8)); return;
      }
      reveal(i); score = calc(); draw();
      if (opened === SIZE * SIZE - MINES) { alive = false; score = calc() + 220; hud('score', formatScore(score)); gameOver('클리어!', formatScore(score) + '점', function () { startGame('mines'); }, score); }
    }
    cells = Array.from({ length: SIZE * SIZE }, function () { return { mine: false, open: false, flag: false, n: 0 }; });
    draw();
    c.on(grid, 'click', click); c.on(grid, 'contextmenu', function (e) { e.preventDefault(); click(e); });
    var tick = setInterval(function () { if (alive && !gamePaused) hud('time', Math.floor((Date.now() - started) / 1000) + '초'); }, 500);
    var od = c.destroy; c.destroy = function () { clearInterval(tick); od(); };
    actions(function () { startGame('mines'); }, function () { return score || (seeded ? calc() : 0); }, '좌클릭 열기 · 우클릭/Shift+클릭 깃발');
    return { id: 'mines', destroy: c.destroy };
  };

  games.reaction = function () {
    var c = controller(), hits = 0, misses = 0, score = 0, left = 20, round = 0, alive = true, bell = null, spawnAt = 0, hideTimer = 0;
    refs.stage.innerHTML = '<div class="hkg-reaction"></div>';
    var arena = refs.stage.firstChild;
    setHud([['남은 종', '20', 'left'], ['적중', '0', 'hits'], ['점수', '0', 'score']]);
    function clearBell() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
      if (bell && bell.parentNode) bell.parentNode.removeChild(bell);
      bell = null;
    }
    function windowMs() {
      // 초반 여유 → 후반도 너무 빠르지 않게 바닥을 높게
      return Math.max(1050, 1650 - round * 22);
    }
    function spawn() {
      if (!alive) return;
      clearBell();
      round++;
      bell = el('button', 'hkg-bell', '🔔');
      bell.style.left = (14 + Math.random() * 72) + '%';
      bell.style.top = (14 + Math.random() * 72) + '%';
      spawnAt = Date.now();
      arena.appendChild(bell);
      hideTimer = setTimeout(function () {
        hideTimer = 0;
        if (!alive || !bell) return;
        clearBell(); misses++; left--; hud('left', left);
        if (left <= 0) finish();
        else c.timer(spawn, 420 + Math.random() * 280);
      }, windowMs());
    }
    function finish() {
      alive = false; clearBell();
      score = Math.max(0, hits * 55 - misses * 12);
      hud('score', formatScore(score));
      gameOver(hits >= 14 ? '빠른 손!' : '라운드 종료', '적중 ' + hits + ' · 미적중 ' + misses + ' · ' + formatScore(score) + '점', function () { startGame('reaction'); }, score);
    }
    c.on(arena, 'click', function (e) {
      if (!alive) return;
      if (e.target === bell) {
        var ms = Date.now() - spawnAt;
        hits++; left--; score += Math.max(12, 90 - Math.floor(ms / 16));
        hud('hits', hits); hud('left', left); hud('score', formatScore(score));
        floatScore(e.offsetX || arena.clientWidth / 2, e.offsetY || 40, 'HIT!', arena);
        clearBell();
        if (left <= 0) finish();
        else c.timer(spawn, 380 + Math.random() * 320);
      } else {
        misses++; score = Math.max(0, score - 6); hud('score', formatScore(score));
      }
    });
    c.timer(spawn, 600);
    actions(function () { startGame('reaction'); }, function () { return score; }, '나타나는 종을 눌러보세요. 후반에도 여유 있게 맞춰집니다.');
    return { id: 'reaction', destroy: function () { clearBell(); c.destroy(); } };
  };

  games.dodge = function () {
    var c = controller(), cv = canvasBase(420, 640), ctx = cv.ctx, player, bags, score = 0, running = true, last = 0, keys = {}, touchX = null, fx = makeFx();
    setHud([['생존', '0', 'score'], ['최고', formatScore(best('dodge', name())), 'best']]);
    function setup() { player = { x: 184, y: 520, w: 52, h: 58 }; bags = []; score = 0; running = true; }
    function drawPlayer() {
      drawHeroShape(ctx, player.x, player.y, player.w, player.h, {
        radius: 12,
        font: 12,
        top: '#fff4d2',
        mid: '#efd28a',
        bot: '#b89245'
      });
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, '#12363c'); g.addColorStop(1, '#07151a'); ctx.fillStyle = g; ctx.fillRect(0, 0, 420, 640);
      ctx.fillStyle = '#ffffff10'; for (var i = 0; i < 20; i++) ctx.fillRect(0, (i * 40 + (score / 3) % 40), 420, 2);
      bags.forEach(function (b) {
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill();
        ctx.fillStyle = '#00000033'; ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 4);
        ctx.fillStyle = '#ffffff22'; ctx.fillRect(b.x + 5, b.y + 6, b.w - 10, 2);
      });
      drawPlayer(); fx.draw(ctx);
    }
    function loop(t) {
      if (!running) return; var dt = Math.min(.022, (t - last) / 1000 || 0); last = t; fx.update(dt);
      var steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (touchX != null) steer = touchX < player.x + player.w / 2 ? -1 : 1;
      player.x = Math.max(4, Math.min(420 - player.w - 4, player.x + steer * 360 * dt));
      var spawnRate = 0.04 + Math.min(0.055, score / 7000);
      var fall = 200 + Math.min(220, score / 18);
      if (Math.random() < spawnRate) {
        bags.push({
          x: Math.random() * 360, y: -50,
          w: 26 + Math.random() * 28, h: 20 + Math.random() * 16,
          vy: fall + Math.random() * 120,
          color: ['#c97b55', '#55a9e8', '#b96d79', '#d6bc75'][Math.floor(Math.random() * 4)]
        });
      }
      bags.forEach(function (b) { b.y += b.vy * dt; });
      bags = bags.filter(function (b) {
        if (b.y >= 700) { fx.spark(b.x + b.w / 2, 630, b.color); return false; }
        return true;
      });
      score += Math.round(dt * 65); hud('score', formatScore(score));
      var hit = bags.some(function (b) {
        return b.x < player.x + player.w - 4 && b.x + b.w > player.x + 4 && b.y < player.y + player.h - 4 && b.y + b.h > player.y + 10;
      });
      if (hit) { running = false; shakeStage(); fx.burst(player.x + player.w / 2, player.y + 20, '#ef5350', 20, 220); gameOver('짐에 맞았어요', '생존 ' + formatScore(score), function () { startGame('dodge'); }, score); return; }
      draw(); c.raf(loop);
    }
    function key(e) { if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].indexOf(e.key) >= 0) { e.preventDefault(); keys[e.key.toLowerCase()] = e.type === 'keydown'; keys[e.key] = e.type === 'keydown'; } }
    c.on(document, 'keydown', key); c.on(document, 'keyup', key);
    c.on(cv.canvas, 'touchstart', function (e) { e.preventDefault(); var r = cv.canvas.getBoundingClientRect(); touchX = (e.touches[0].clientX - r.left) * 420 / r.width; }, { passive: false });
    c.on(cv.canvas, 'touchmove', function (e) { var r = cv.canvas.getBoundingClientRect(); touchX = (e.touches[0].clientX - r.left) * 420 / r.width; }, { passive: true });
    c.on(cv.canvas, 'touchend', function () { touchX = null; }, { passive: true });
    setup(); draw(); c.raf(loop);
    actions(function () { startGame('dodge'); }, function () { return score; }, '좌우로 움직여 떨어지는 짐을 피하세요. 시간이 갈수록 더 많이 떨어집니다.');
    return { id: 'dodge', destroy: c.destroy };
  };

  window.HKGames = {
    init: function (options) { config = options || {}; inject(); return this; },
    open: open,
    close: close
  };
})(window, document);
