(function (window, document) {
  'use strict';

  var GAME_IDS = ['candy', 'merge2048', 'snake', 'memory', 'breakout', 'jump', 'tetris', 'pong', 'flappy', 'mines', 'reaction', 'dodge', 'suika', 'stack', 'crossy', 'simon', 'cleanroute', 'invaders', 'putting', 'crossland', 'hotelshare', 'tank', 'rts', 'ageofwar', 'snakes', 'airhockey', 'memorymp', 'lanepush', 'nexuswar', 'gomoku', 'chess', 'janggi', 'marble', 'yut'];
  var MP_IDS = ['tank', 'rts', 'ageofwar', 'snakes', 'airhockey', 'memorymp', 'lanepush', 'nexuswar', 'gomoku', 'chess', 'janggi', 'marble', 'yut'];
  var META = {
    candy: { icon: '🍬', name: 'NPS 마카롱 제공', desc: '10초 시작 · 깨면 시간 조금 추가 · 타임어택' },
    merge2048: { icon: '🔢', name: '업셀링 계산기', desc: '같은 숫자를 합쳐 2048에 도전' },
    snake: { icon: '🐍', name: '요리조리 컴플레인 피하기', desc: '벽을 피해 야식을 모아보세요' },
    memory: { icon: '🛎️', name: '호텔 메모리', desc: '카드 수 선택 · 호텔 아이콘 짝 맞추기' },
    breakout: { icon: '🧱', name: '루프탑 브레이크', desc: '5단계 벽돌 격파 · 아이템 수집' },
    jump: { icon: '🪽', name: '시그니엘 올라가기', desc: '2단 점프 · 서서히 올라가는 화면' },
    tetris: { icon: '🟪', name: '뷔페 접시 쌓기', desc: '클래식 10×20 · NEXT 미리보기 · 완만한 난이도' },
    pong: { icon: '🏓', name: '로비 핑퐁', desc: '빠른 공·짧은 패들로 고난도 랠리' },
    flappy: { icon: '🕊️', name: '벨보이 플라이', desc: '탭으로 날아 기둥 사이를 통과' },
    mines: { icon: '🛎️', name: '딜리버리하는 벨맨', desc: 'Space 점프 · Shift 와이어 · 고군분투 러닝' },
    reaction: { icon: '🔔', name: '벨 리액션', desc: '종을 빠르게 눌러 반응 속도 겨루기' },
    dodge: { icon: '🧳', name: '러기지 닷지', desc: '떨어지는 짐을 피하며 버티기' },
    suika: { icon: '🍉', name: '미니바 과일', desc: '같은 과일을 붙여 수박까지' },
    stack: { icon: '🧺', name: '타월 타워', desc: '타이밍에 맞춰 타월을 쌓기' },
    crossy: { icon: '🚶', name: '로비 무단횡단', desc: '캐리어·카트를 피해 로비를 건너기' },
    simon: { icon: '🔔', name: '벨 시퀀스', desc: '종 순서를 기억해 따라 누르기' },
    cleanroute: { icon: '🧹', name: '청소 루트', desc: '복도 먼지를 쓸고 컴플레인을 피하기' },
    invaders: { icon: '😠', name: '컴플레인 인베이더', desc: '내려오는 컴플레인을 격추' },
    putting: { icon: '⛳', name: '퍼팅 골프', desc: '18홀 · 맵 랜덤 · 점점 어려워짐' },
    crossland: { icon: '✚', name: '십자 땅따먹기', desc: '십자로 칸을 차지해 CPU보다 많이 먹기' },
    hotelshare: { icon: '🏨', name: '호텔지분얻기', desc: '선을 그어 호텔을 확보 · 갈스패닉' },
    tank: { icon: '🛡️', name: '탱크대전', desc: '싱글/FFA/팀전 · 초대형 맵' },
    rts: { icon: '🏰', name: '미니 RTS', desc: '싱글/대결 · 본진 파괴' },
    ageofwar: { icon: '⚔️', name: '전쟁시대', desc: '싱글/대결 · 시대 진화 라인전' },
    snakes: { icon: '🪱', name: '멀티 스네이크', desc: '싱글/대결 · 목숨 3' },
    airhockey: { icon: '🏒', name: '에어하키', desc: '싱글/대결 · 반응속도' },
    memorymp: { icon: '🛎️', name: '호텔 메모리 멀티', desc: '싱글/1:1/1:1:1/2:2' },
    lanepush: { icon: '🗡️', name: '레인 푸시', desc: '싱글/대결 · LOL 미니 라인전' },
    nexuswar: { icon: '🌐', name: '점령전', desc: '싱글/대결 · 거점 점령' },
    gomoku: { icon: '⚫', name: '오목', desc: '1:1 / 2:2 / 1:AI · 5목을 먼저' },
    chess: { icon: '♟️', name: '체스', desc: '1:1 / 2:2 / 1:AI · 클래식 체스' },
    janggi: { icon: '🐴', name: '장기', desc: '1:1 / 2:2 / 1:AI · 한·초 장기' },
    marble: { icon: '🎲', name: '모두의마블', desc: '1:1 / 2:2 / 1:AI · 주사위 보드' },
    yut: { icon: '🪵', name: '윷놀이', desc: '2~4팀 / 2:2 / 1:AI · 윷 던져 말 옮기기' }
  };
  var config = {};
  var root, refs = {}, active = null, toastTimer = 0;
  var gamePaused = false;
  var stashedBehindOrders = false;

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
  function isOverlayOpen() {
    return !!(root && root.classList.contains('open'));
  }
  function callExitToOrders() {
    if (typeof config.onExitToOrders === 'function') {
      try { config.onExitToOrders(); } catch (_) {}
    }
  }
  function hideBehindOrders() {
    if (!isOverlayOpen()) return;
    if (active && refs.game && refs.game.classList.contains('show')) {
      setGamePaused(true);
    }
    stashedBehindOrders = true;
    root.classList.remove('open');
    document.body.style.overflow = '';
  }
  function resumeFromOrders() {
    inject();
    stashedBehindOrders = false;
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function toggleOrdersShortcut() {
    var mp = window.HKMpGames;
    var mpOpen = !!(mp && typeof mp.isOpen === 'function' && mp.isOpen());
    var mpStashed = !!(mp && typeof mp.isStashed === 'function' && mp.isStashed());
    if (mpOpen) {
      if (typeof mp.hideBehindOrders === 'function') {
        try { mp.hideBehindOrders(); } catch (_) {}
      }
      hideBehindOrders();
      callExitToOrders();
      return;
    }
    if (isOverlayOpen()) {
      hideBehindOrders();
      callExitToOrders();
      return;
    }
    if (mpStashed) {
      resumeFromOrders();
      if (typeof mp.resumeFromOrders === 'function') {
        try { mp.resumeFromOrders(); } catch (_) {}
      }
      return;
    }
    if (stashedBehindOrders) {
      resumeFromOrders();
      if (active && refs.game && refs.game.classList.contains('show') && gamePaused) {
        toast('일시정지된 게임 · P로 계속');
      }
    }
  }
  function exitToOrders() {
    toggleOrdersShortcut();
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
  function formatScore(n) { return Math.round(Number(n) || 0).toLocaleString('ko-KR'); }
  function toast(text) {
    clearTimeout(toastTimer);
    refs.toast.textContent = text;
    refs.toast.classList.add('show');
    toastTimer = setTimeout(function () { refs.toast.classList.remove('show'); }, 2400);
  }
  function save(id, score) {
    if (MP_IDS.indexOf(id) >= 0) return;
    score = Math.round(Number(score) || 0);
    var who = name();
    // 0점은 저장하지 않음. 음수(벨 리액션 컴플레인 등)는 랭킹 등록 가능.
    if (!isFinite(score) || score === 0 || !who || !config.saveScore) return;
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
      '.hkg-candy{width:min(100%,560px);display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin:auto;position:relative}.hkg-gem{aspect-ratio:1;border:0;border-radius:14px;background:#0d292d;display:grid;place-items:center;cursor:pointer;padding:8%;position:relative;z-index:1;transition:transform .2s ease,opacity .18s}.hkg-gem:before{content:"";width:82%;height:82%;border-radius:42% 58% 50% 50%;background:var(--gem);box-shadow:inset 0 5px 6px #fff5,inset 0 -6px 8px #0003,0 3px 5px #0005;transform:rotate(45deg)}.hkg-gem.sel{transform:scale(.87);box-shadow:0 0 0 3px #efd484}.hkg-gem.pop{transform:scale(.12) rotate(28deg);opacity:0;filter:brightness(1.6)}.hkg-gem.pop:after{content:\"\";position:absolute;inset:-18%;border-radius:50%;box-shadow:0 0 0 2px #efd28a88,12px -10px 0 #efd28a66,-14px 8px 0 #9ad2a966,10px 14px 0 #f08b4388,-12px -12px 0 #fff8;animation:hkg-spark .28s ease forwards;pointer-events:none}@keyframes hkg-spark{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.35)}}.hkg-gem.swap{z-index:4;transition:transform .22s ease}.hkg-gem.fall{z-index:3;transition:transform .24s ease}.hkg-stage.shake{animation:hkg-shake .28s ease}@keyframes hkg-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}.hkg-float{position:absolute;pointer-events:none;font-weight:800;color:#efd28a;text-shadow:0 2px 8px #000a;animation:hkg-float .9s ease forwards;z-index:6;font-size:18px}@keyframes hkg-float{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-36px) scale(1.15)}}',
      '.hkg-2048{width:min(100%,480px);aspect-ratio:1;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#173033;padding:10px;border-radius:18px;margin:auto}.hkg-tile{display:grid;place-items:center;border-radius:11px;background:#284144;color:#f5ecd5;font-size:clamp(20px,5vw,40px);font-weight:900;transition:transform .16s ease,background .12s,box-shadow .16s}.hkg-tile.is-merge{animation:hkg-merge-pop .28s ease}.hkg-tile.is-spawn{animation:hkg-tile-spawn .22s ease}@keyframes hkg-merge-pop{0%{transform:scale(.82);box-shadow:0 0 0 0 #efd28a00}45%{transform:scale(1.14);box-shadow:0 0 22px #efd28aaa}100%{transform:scale(1);box-shadow:0 0 0 0 #efd28a00}}@keyframes hkg-tile-spawn{from{transform:scale(.55);opacity:.35}to{transform:scale(1);opacity:1}}.hkg-tile[data-v="0"]{color:transparent}.hkg-tile[data-v="2"]{background:#eee4cf;color:#263c3a}.hkg-tile[data-v="4"]{background:#e7cf9a;color:#263c3a}.hkg-tile[data-v="8"]{background:#df9b55}.hkg-tile[data-v="16"]{background:#d87947}.hkg-tile[data-v="32"]{background:#c9553e}.hkg-tile[data-v="64"]{background:#a83332}.hkg-tile[data-v="128"],.hkg-tile[data-v="256"]{background:#b99b45}.hkg-tile[data-v="512"],.hkg-tile[data-v="1024"],.hkg-tile[data-v="2048"]{background:#dfbf55;color:#142623;box-shadow:0 0 24px #e6c75c88}',
      '.hkg-memory-frame{width:min(100%,340px);aspect-ratio:3/4;height:auto;max-height:min(72vh,560px);margin:auto;display:flex;align-items:center;justify-content:center}.hkg-memory{width:100%;height:100%;display:grid;gap:6px;margin:0;perspective:900px;-webkit-user-select:none;user-select:none;box-sizing:border-box}.hkg-memory.wave .hkg-memory-card{transition:transform .14s ease,background .14s ease,color .14s ease}.hkg-memory-card{min-width:0;min-height:0;width:100%;height:100%;aspect-ratio:3/4;border:0;border-radius:10px;background:linear-gradient(160deg,#1f5650,#0d252c);color:transparent;font-size:clamp(22px,4.6vw,40px);line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;text-align:center;transform-style:preserve-3d;transition:.28s;box-shadow:inset 0 0 0 1px #d2b77044,0 4px 10px #0005;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;-webkit-touch-callout:none}.hkg-memory-card.open,.hkg-memory-card.done{transform:rotateY(180deg);background:#f0dfa8;color:#142826;text-shadow:0 1px 0 #fff6}.hkg-memory-card .hkg-memory-face{display:flex;align-items:center;justify-content:center;width:100%;height:100%;line-height:1;transform:rotateY(180deg)}.hkg-memory-card.done{background:#9fcbb0;opacity:.78}.hkg-memory-setup{width:min(100%,520px);margin:auto;text-align:center}.hkg-memory-setup h3{font-family:Georgia,serif;color:#efd28a;margin:0 0 12px;font-size:22px}.hkg-memory-sizes{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:14px 0 18px}',
      '.hkg-mines{width:min(100%,420px);display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin:auto}.hkg-mine{aspect-ratio:1;border:0;border-radius:8px;background:#1a3a3f;color:#f0e6c8;font-weight:800;font-size:clamp(12px,3vw,16px);cursor:pointer;box-shadow:inset 0 0 0 1px #ffffff14}.hkg-mine.open{background:#0d2428;cursor:default}.hkg-mine.flag{background:#3a2f1a;color:#efd28a}.hkg-mine.boom{background:#7a2f2f;color:#fff}.hkg-reaction{width:min(100%,520px);aspect-ratio:1;margin:auto;position:relative;border-radius:18px;background:radial-gradient(circle at 50% 40%,#1a4540,#07151a);overflow:hidden;touch-action:manipulation}.hkg-bell{position:absolute;width:104px;height:104px;border:0;border-radius:50%;background:radial-gradient(circle at 30% 25%,#fff6,#efd28a 35%,#b89245);box-shadow:0 8px 24px #0007;font-size:44px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:1;transform:translate(-50%,-50%);animation:hkg-pop .35s ease}.hkg-bell:active{transform:translate(-50%,-50%) scale(.9)}.hkg-bell.is-complaint{background:radial-gradient(circle at 30% 25%,#fff8,#f6e05e 40%,#d69e2e);font-size:40px;box-shadow:0 8px 24px #0007,0 0 0 2px #f6e05e88}@keyframes hkg-pop{from{transform:translate(-50%,-50%) scale(.2);opacity:0}to{transform:translate(-50%,-50%) scale(1);opacity:1}}',
      '.hkg-pause{position:absolute;inset:0;display:none;place-items:center;background:#061218cc;z-index:5}.hkg-pause.show{display:grid}.hkg-pause-box{padding:22px 28px;border:1px solid #cbb27088;border-radius:18px;background:#0d2429ee;text-align:center;box-shadow:0 16px 40px #0008}.hkg-pause-box strong{display:block;font-family:Georgia,serif;color:#efd28a;font-size:28px;margin-bottom:8px}.hkg-pause-box span{color:#b1c1bd;font-size:13px}.hkg-reset-modal{position:fixed;inset:0;z-index:10003;display:none;place-items:center;background:#061218cc;padding:18px;box-sizing:border-box}.hkg-reset-modal.show{display:grid}.hkg-reset-box{width:min(520px,100%);max-height:min(80vh,640px);overflow:auto;padding:22px 20px;border:1px solid #cbb27088;border-radius:18px;background:#0d2429ee;box-shadow:0 16px 40px #0008}.hkg-reset-box strong{display:block;font-family:Georgia,serif;color:#efd28a;font-size:24px;margin-bottom:6px}.hkg-reset-box p{margin:0 0 14px;color:#b1c1bd;font-size:13px}.hkg-reset-list{display:grid;gap:8px;margin:0 0 12px}.hkg-reset-list button{appearance:none;width:100%;text-align:left;border:1px solid #ffffff1c;background:#0a1c20;color:#f5f0df;border-radius:12px;padding:11px 13px;cursor:pointer;font:inherit}.hkg-reset-list button:hover{border-color:#cbb27088;background:#123034}.hkg-reset-list button.all{background:linear-gradient(135deg,#3a2f14,#1f2a1e);border-color:#cbb27066;color:#efd28a;font-weight:700}.hkg-canvas{display:block;width:auto;height:auto;max-width:min(100%,620px);max-height:68vh;margin:auto;border-radius:16px;background:#07151a;box-shadow:inset 0 0 0 1px #ffffff12;touch-action:none;object-fit:contain}.hkg-canvas.hkg-canvas-tetris{max-width:min(100%,340px);max-height:min(72vh,680px)}.hkg-dpad{display:grid;grid-template-columns:repeat(3,48px);gap:6px;justify-content:center;margin:12px auto 0;width:max-content}.hkg-dpad button{width:48px;height:48px;border:1px solid #8f7b4f;border-radius:12px;background:#122a2d;color:#efd28a;font-size:18px;cursor:pointer;touch-action:manipulation;padding:0;line-height:1}.hkg-dpad button:active{background:#1f5650}.hkg-dpad i{display:block;height:48px}.hkg-message{position:absolute;inset:0;display:none;place-items:center;background:#061218cc;z-index:4}.hkg-message.show{display:grid}.hkg-message-box{padding:25px;text-align:center}.hkg-message h2{font-family:Georgia,serif;color:#efd28a;font-size:31px;margin:0 0 7px}.hkg-message p{color:#b1c1bd}.hkg-toast{position:fixed;left:50%;bottom:28px;z-index:10002;transform:translate(-50%,25px);opacity:0;background:#ead18f;color:#122421;padding:12px 18px;border-radius:999px;font-weight:800;box-shadow:0 10px 35px #0008;transition:.25s;pointer-events:none}.hkg-toast.show{transform:translate(-50%,0);opacity:1}',
      '@media(max-width:850px){.hkg-grid{grid-template-columns:repeat(2,1fr)}.hkg-layout{grid-template-columns:1fr}.hkg-ranking{order:2}.hkg-stage{min-height:460px}}@media(max-width:560px){.hkg-shell{width:min(100% - 18px,1180px);padding-top:12px}.hkg-grid{grid-template-columns:1fr}.hkg-card{min-height:195px}.hkg-hero{padding:22px}.hkg-stage{padding:10px;min-height:390px}.hkg-game-head{flex-wrap:wrap}.hkg-game-head h1{order:2;flex-basis:70%}.hkg-hud{order:3;width:100%}.hkg-candy{gap:3px}.hkg-gem{border-radius:9px}.hkg-2048{gap:6px;padding:7px}}'
    ].join('');
    document.head.appendChild(style);
    root = el('div', 'hk-games-overlay');
    root.innerHTML =
      '<div class="hkg-shell"><header class="hkg-top"><div class="hkg-brand"><button type="button" class="hkg-mark" title="랭킹 초기화" aria-label="랭킹 초기화">L</button><div><span class="hkg-eyebrow">Front Lounge</span><strong>Lotte Break</strong></div></div><button class="hkg-btn icon hkg-close" aria-label="닫기">✕</button></header>' +
      '<main class="hkg-hub"><section class="hkg-hero"><span class="hkg-eyebrow">A moment for yourself</span><h1>Lotte Break</h1><p>잠깐의 휴식, 가볍게 즐기고 동료들과 기록을 나눠보세요.</p><div class="hkg-who"></div></section><section class="hkg-grid"></section></main>' +
      '<main class="hkg-game"><header class="hkg-game-head"><button class="hkg-btn hkg-back">← 라운지</button><h1></h1><div class="hkg-hud"></div></header><div class="hkg-layout"><section class="hkg-stage"><div class="hkg-stage-inner"></div><div class="hkg-pause" aria-hidden="true"><div class="hkg-pause-box"><strong>일시정지</strong><span>P 키로 계속 · Ctrl+Q 오더 화면</span></div></div><div class="hkg-message"><div class="hkg-message-box"></div></div></section><aside class="hkg-ranking"></aside></div></main></div><div class="hkg-toast" role="status"></div><div class="hkg-reset-modal" aria-hidden="true"><div class="hkg-reset-box"><strong>랭킹 초기화</strong><p>전체 또는 게임별로 초기화할 수 있습니다.</p><div class="hkg-reset-list"></div><button type="button" class="hkg-btn hkg-reset-cancel" style="width:100%">취소</button></div></div>';
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
    refs.resetModal = root.querySelector('.hkg-reset-modal');
    refs.resetList = root.querySelector('.hkg-reset-list');
    root.querySelector('.hkg-close').addEventListener('click', close);
    root.querySelector('.hkg-back').addEventListener('click', showHub);
    root.querySelector('.hkg-mark').addEventListener('click', promptResetRanks);
    root.querySelector('.hkg-reset-cancel').addEventListener('click', hideResetModal);
    if (refs.resetModal) {
      refs.resetModal.addEventListener('click', function (e) {
        if (e.target === refs.resetModal) hideResetModal();
      });
    }
    document.addEventListener('keydown', globalKey);
  }
  function rankGameIds() {
    return GAME_IDS.filter(function (id) { return MP_IDS.indexOf(id) < 0; });
  }
  function hideResetModal() {
    if (!refs.resetModal) return;
    refs.resetModal.classList.remove('show');
    refs.resetModal.setAttribute('aria-hidden', 'true');
  }
  function showResetModal() {
    if (!refs.resetModal || !refs.resetList) return;
    var ids = rankGameIds();
    refs.resetList.innerHTML =
      '<button type="button" class="all" data-reset="*">전체 게임 랭킹 초기화</button>' +
      ids.map(function (id) {
        var m = META[id] || { icon: '🎮', name: id };
        return '<button type="button" data-reset="' + id + '">' + m.icon + ' ' + m.name + '</button>';
      }).join('');
    Array.prototype.forEach.call(refs.resetList.querySelectorAll('[data-reset]'), function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-reset');
        var label = target === '*' ? '모든 미니게임 랭킹' : ((META[target] && META[target].name) || target) + ' 랭킹';
        if (!window.confirm(label + '을(를) 초기화할까요?')) return;
        try {
          if (config.resetRanks) config.resetRanks(target === '*' ? null : target);
          hideResetModal();
          toast(label + '이(가) 초기화되었습니다');
          if (active && active.id) renderRanking(active.id);
          else renderHub();
        } catch (err) {
          toast('랭킹 초기화에 실패했습니다');
          if (window.console) console.error(err);
        }
      });
    });
    refs.resetModal.classList.add('show');
    refs.resetModal.setAttribute('aria-hidden', 'false');
  }
  function promptResetRanks() {
    var pw = window.prompt('랭킹을 초기화하려면 비밀번호를 입력하세요.');
    if (pw == null) return;
    if (String(pw).trim() !== '1111') {
      toast('비밀번호가 올바르지 않습니다');
      return;
    }
    showResetModal();
  }
  function globalKey(e) {
    var isQ = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ');
    if (isQ) {
      var mp = window.HKMpGames;
      var canToggle = isOverlayOpen() || stashedBehindOrders ||
        !!(mp && ((typeof mp.isOpen === 'function' && mp.isOpen()) || (typeof mp.isStashed === 'function' && mp.isStashed())));
      if (!canToggle) return;
      e.preventDefault();
      e.stopPropagation();
      toggleOrdersShortcut();
      return;
    }
    if (!root || !root.classList.contains('open')) return;
    if (isTypingTarget(e.target)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'p' || e.key === 'P' || e.code === 'KeyP')) {
      if (active && refs.game && refs.game.classList.contains('show')) {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (refs.resetModal && refs.resetModal.classList.contains('show')) { hideResetModal(); return; }
      if (gamePaused) { setGamePaused(false); return; }
      if (active) showHub(); else close();
    }
  }
  function open() {
    inject();
    var mp = window.HKMpGames;
    if (mp && typeof mp.isStashed === 'function' && mp.isStashed()) {
      resumeFromOrders();
      if (typeof mp.resumeFromOrders === 'function') {
        try { mp.resumeFromOrders(); } catch (_) {}
      }
      return;
    }
    if (stashedBehindOrders) {
      resumeFromOrders();
      if (active && refs.game && refs.game.classList.contains('show') && gamePaused) {
        toast('일시정지된 게임 · P로 계속');
      }
      return;
    }
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    setGamePaused(false);
    showHub();
  }
  function close() {
    stashedBehindOrders = false;
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
    var removers = [], timers = [], alive = true, rafId = 0;
    removers.push(function () {
      alive = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    });
    return {
      on: function (node, type, fn, opts) { node.addEventListener(type, fn, opts); removers.push(function () { node.removeEventListener(type, fn, opts); }); },
      raf: function (fn) {
        function tick(t) {
          rafId = 0;
          if (!alive || !active) return;
          // 일시정지·백그라운드에서는 루프만 낮춤 (끊기지 않게 재개)
          if (gamePaused || (typeof document !== 'undefined' && document.hidden)) {
            var tid = setTimeout(function () {
              if (!alive) return;
              rafId = requestAnimationFrame(tick);
            }, 200);
            timers.push(tid);
            return;
          }
          fn(t);
        }
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
      },
      timer: function (fn, ms) {
        function fire() {
          if (!alive) return;
          if (gamePaused || (typeof document !== 'undefined' && document.hidden)) {
            var again = setTimeout(fire, 200);
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
      destroy: function () {
        alive = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        removers.forEach(function (x) { x(); });
        timers.forEach(clearTimeout);
        removers = [];
        timers = [];
      }
    };
  }
  /** 프레임 간격 — hitch 시 슬로모션이 되지 않게 1/30초까지 허용 */
  function frameDt(t, last) {
    var raw = (t - (last || t)) / 1000;
    if (!(raw > 0) || !isFinite(raw)) return 1 / 60;
    return Math.min(1 / 30, raw);
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
    var MAX_PARTS = 40;
    return {
      burst: function (x, y, color, n, speed) {
        n = Math.min(n || 6, 8);
        speed = speed || 160;
        if (parts.length > MAX_PARTS) parts.splice(0, parts.length - 20);
        for (var i = 0; i < n; i++) {
          var a = (Math.PI * 2 * i) / n + Math.random() * 0.35;
          var sp = speed * (0.5 + Math.random() * 0.7);
          parts.push({
            x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 36,
            life: 0.22 + Math.random() * 0.22, max: 0.5, r: 1.4 + Math.random() * 2, color: color || '#efd28a'
          });
        }
      },
      spark: function (x, y, color) {
        this.burst(x, y, color || '#fff4d0', 4, 100);
      },
      update: function (dt) {
        for (var i = parts.length - 1; i >= 0; i--) {
          var p = parts[i];
          p.life -= dt;
          if (p.life <= 0) {
            parts.splice(i, 1);
            continue;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 380 * dt;
          p.vx *= 0.985;
        }
      },
      draw: function (ctx) {
        if (!parts.length) return;
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          var s = p.r * 2;
          ctx.fillRect(p.x - p.r, p.y - p.r, s, s);
        }
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
  var _heroFitCache = { key: '', text: '' };
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
    // solid fill — 매 프레임 gradient 생성보다 가볍게
    ctx.fillStyle = opts.mid || '#efd28a';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 2, y + 2, Math.max(0, w - 4), Math.max(2, h * 0.2));
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x + 3, y + h - 5, w - 6, 3);
    ctx.fillStyle = opts.ink || '#1a302c';
    var fontSize = opts.font || Math.max(9, Math.min(14, Math.floor(Math.min(w * 0.32, h * 0.42))));
    var font = '700 ' + fontSize + 'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var cacheKey = label + '|' + fontSize + '|' + Math.round(w);
    if (_heroFitCache.key !== cacheKey) {
      _heroFitCache.key = cacheKey;
      _heroFitCache.text = fitHeroLabel(ctx, label, w - 8);
    }
    ctx.fillText(_heroFitCache.text, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
  }

  var games = {};

  games.candy = function () {
    var c = controller(), board = [], selected = -1, score = 0, busy = false, alive = true;
    var colors = ['#ef5350', '#ffca45', '#4bc6a6', '#55a9e8', '#d86bd7', '#f08b43'];
    var left = 10, lastTickAt = Date.now(), colorCount = 6, elapsed = 0;
    var TIME_PER_CANDY = 0.28;
    refs.stage.innerHTML = '<div class="hkg-candy"></div>';
    var grid = refs.stage.firstChild;
    setHud([['점수', '0', 'score'], ['남은 시간', '0:10', 'time'], ['콤보', 'x1', 'combo']]);
    function fmt(sec) {
      sec = Math.max(0, Math.ceil(sec));
      var s = sec % 60;
      return Math.floor(sec / 60) + ':' + (s < 10 ? '0' : '') + s;
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
    function gemAt(i) { return grid.querySelector('.hkg-gem[data-i="' + i + '"]'); }
    function animateSwap(a, b, revert, done) {
      busy = true;
      selected = -1;
      draw();
      var elA = gemAt(a), elB = gemAt(b);
      if (!elA || !elB) {
        if (!revert) {
          var t0 = board[a]; board[a] = board[b]; board[b] = t0;
          draw();
        }
        busy = false;
        if (done) done(!revert);
        return;
      }
      var ra = elA.getBoundingClientRect(), rb = elB.getBoundingClientRect();
      var dx = rb.left - ra.left, dy = rb.top - ra.top;
      elA.classList.add('swap'); elB.classList.add('swap');
      void elA.offsetWidth;
      elA.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      elB.style.transform = 'translate(' + (-dx) + 'px,' + (-dy) + 'px)';
      c.timer(function () {
        if (revert) {
          elA.style.transform = 'translate(0px,0px)';
          elB.style.transform = 'translate(0px,0px)';
          c.timer(function () {
            draw();
            busy = false;
            if (done) done(false);
          }, 220);
          return;
        }
        var temp = board[a]; board[a] = board[b]; board[b] = temp;
        draw();
        if (done) done(true);
      }, 260);
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
    function animateFall(moves, done) {
      draw();
      if (!moves.length) { if (done) done(); return; }
      var gap = 5;
      var sample = gemAt(moves[0].to) || gemAt(0);
      var cellH = sample ? sample.getBoundingClientRect().height : 40;
      moves.forEach(function (m) {
        var el = gemAt(m.to);
        if (!el) return;
        var dy = (m.fromRow - m.toRow) * (cellH + gap);
        if (!dy) return;
        el.classList.add('fall');
        el.style.transform = 'translateY(' + dy + 'px)';
      });
      void grid.offsetWidth;
      moves.forEach(function (m) {
        var el = gemAt(m.to);
        if (!el) return;
        el.style.transform = 'translateY(0)';
      });
      c.timer(function () {
        moves.forEach(function (m) {
          var el = gemAt(m.to);
          if (!el) return;
          el.classList.remove('fall');
          el.style.transform = '';
        });
        if (done) done();
      }, 300);
    }
    function settle(combo, done) {
      var hit = matches(), keys = Object.keys(hit);
      if (!keys.length) { busy = false; hud('combo', 'x1'); if (done) done(); return; }
      busy = true;
      var gain = keys.length * 12 * combo;
      score += gain; hud('score', formatScore(score)); hud('combo', 'x' + combo);
      var bonus = keys.length * TIME_PER_CANDY;
      left += bonus;
      hud('time', fmt(left));
      draw(hit);
      shakeStage();
      Object.keys(hit).forEach(function (idx) {
        var node = grid.querySelector('[data-i="' + idx + '"]');
        if (!node) return;
        var r = node.getBoundingClientRect(), host = refs.stage.getBoundingClientRect();
        floatScore(r.left - host.left + r.width / 2, r.top - host.top + r.height / 2, '✦', refs.stage);
      });
      var rect = grid.getBoundingClientRect(), hostRect = refs.stage.getBoundingClientRect();
      floatScore(rect.left - hostRect.left + rect.width / 2, rect.top - hostRect.top + 20, '+' + gain, refs.stage);
      floatScore(rect.left - hostRect.left + rect.width / 2, rect.top - hostRect.top + 48, '+' + (Math.round(bonus * 10) / 10) + '초', refs.stage);
      c.timer(function () {
        var moves = [];
        var next = board.slice();
        for (var col = 0; col < 8; col++) {
          var stack = [];
          for (var row = 7; row >= 0; row--) {
            var idx = col + row * 8;
            if (!hit[idx]) stack.push({ fromRow: row, v: board[idx] });
          }
          for (row = 7; row >= 0; row--) {
            idx = col + row * 8;
            if (stack.length) {
              var g = stack.shift();
              next[idx] = g.v;
              if (g.fromRow !== row) moves.push({ fromRow: g.fromRow, toRow: row, to: idx });
            } else {
              next[idx] = random();
              moves.push({ fromRow: -1 - (7 - row), toRow: row, to: idx });
            }
          }
        }
        board = next;
        animateFall(moves, function () {
          c.timer(function () { settle(combo + 1, done); }, 70);
        });
      }, 200);
    }
    function tick() {
      if (!alive) return;
      var now = Date.now();
      if (!gamePaused) {
        var dt = (now - lastTickAt) / 1000;
        left -= dt;
        elapsed += dt;
      }
      lastTickAt = now;
      hud('time', fmt(left));
      if (left <= 0) {
        alive = false; left = 0; hud('time', '0:00');
        gameOver('타임 오버!', '최종 점수 ' + formatScore(score), function () { startGame('candy'); }, score);
        return;
      }
      c.timer(tick, 100);
    }
    function click(e) {
      var node = e.target.closest('.hkg-gem');
      if (!node || busy || !alive) return;
      var i = Number(node.getAttribute('data-i'));
      if (selected < 0) { selected = i; draw(); return; }
      var a = selected;
      var adjacent = Math.abs(a - i) === 8 || (Math.floor(a / 8) === Math.floor(i / 8) && Math.abs(a - i) === 1);
      if (!adjacent) { selected = i; draw(); return; }
      // Preview swap validity on data then animate
      var temp = board[a]; board[a] = board[i]; board[i] = temp;
      var ok = Object.keys(matches()).length > 0;
      temp = board[a]; board[a] = board[i]; board[i] = temp;
      animateSwap(a, i, !ok, function (success) {
        if (!success) {
          left = Math.max(0, left - 0.6);
          hud('time', fmt(left));
          toast('미스! -0.6초 · 매치가 되는 조합만');
          return;
        }
        settle(1, function () {});
      });
    }
    c.on(grid, 'click', click);
    seed(); tick();
    actions(function () { startGame('candy'); }, function () { return score; }, '10초로 시작 · 캔디를 깨면 살짝 시간 추가 · 틀린 교환은 -0.6초 · 인접한 캔디를 바꿔 맞추세요.');
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
      var a = values.filter(Boolean), out = [], gained = 0, mergedAt = [];
      for (var i = 0; i < a.length; i++) {
        if (a[i] === a[i + 1]) { out.push(a[i] * 2); gained += a[i] * 2; mergedAt.push(out.length - 1); i++; } else out.push(a[i]);
      }
      while (out.length < 4) out.push(0);
      score += gained; return { out: out, gained: gained, mergedAt: mergedAt };
    }
    function move(dir) {
      if (over) return;
      var old = board.join(','), next = Array(16).fill(0), mergedFlags = Array(16).fill(false), r, col, vals, pack, out, i, j, totalGain = 0;
      for (i = 0; i < 4; i++) {
        vals = [];
        for (j = 0; j < 4; j++) {
          r = dir === 'left' || dir === 'right' ? i : j;
          col = dir === 'left' || dir === 'right' ? j : i;
          vals.push(board[r * 4 + col]);
        }
        if (dir === 'right' || dir === 'down') vals.reverse();
        pack = line(vals);
        out = pack.out;
        totalGain += pack.gained;
        if (dir === 'right' || dir === 'down') {
          out.reverse();
          pack.mergedAt = pack.mergedAt.map(function (idx) { return 3 - idx; });
        }
        for (j = 0; j < 4; j++) {
          r = dir === 'left' || dir === 'right' ? i : j;
          col = dir === 'left' || dir === 'right' ? j : i;
          next[r * 4 + col] = out[j];
          if (pack.mergedAt.indexOf(j) >= 0) mergedFlags[r * 4 + col] = true;
        }
      }
      board = next;
      if (old === board.join(',')) return;
      moves++; add(); draw();
      var tiles = grid.querySelectorAll('.hkg-tile');
      mergedFlags.forEach(function (on, idx) {
        if (on && tiles[idx]) tiles[idx].classList.add('is-merge');
      });
      if (totalGain > 0) floatScore(grid.offsetWidth / 2, 24, '+' + totalGain, refs.stage);
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

  function canvasBase(width, height, extraClass) {
    var canvas = el('canvas', 'hkg-canvas' + (extraClass ? ' ' + extraClass : ''));
    canvas.width = width;
    canvas.height = height;
    refs.stage.appendChild(canvas);
    var ctx =
      canvas.getContext('2d', { alpha: false, desynchronized: true }) ||
      canvas.getContext('2d');
    return { canvas: canvas, ctx: ctx };
  }

  games.snake = function () {
    var COLS = 24, ROWS = 24, CELL = 26, MAP = COLS * CELL;
    var c = controller(), cv = canvasBase(MAP, MAP), ctx = cv.ctx, snake, dir, next, food, score, last = 0, step = 128, dead = false, touch, fx = makeFx(), anim = 0, hazards = [], hazAcc = 0, playSec = 0;
    setHud([['점수', '0', 'score'], ['속도', '1.0x', 'speed']]);
    var gridCanvas = document.createElement('canvas');
    gridCanvas.width = MAP;
    gridCanvas.height = MAP;
    (function paintGrid() {
      var g = gridCanvas.getContext('2d');
      g.fillStyle = '#07171c';
      g.fillRect(0, 0, MAP, MAP);
      g.strokeStyle = '#1d4e52';
      g.lineWidth = 1;
      for (var i = 0; i <= COLS; i++) {
        g.beginPath(); g.moveTo(i * CELL, 0); g.lineTo(i * CELL, MAP); g.stroke();
        g.beginPath(); g.moveTo(0, i * CELL); g.lineTo(MAP, i * CELL); g.stroke();
      }
      g.strokeStyle = '#ffd54a';
      g.lineWidth = 6;
      g.strokeRect(3, 3, MAP - 6, MAP - 6);
    })();
    function spawn() { do { food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }; } while (snake.some(function (p) { return p.x === food.x && p.y === food.y; }) || hazards.some(function (h) { return h.body.some(function (p) { return p.x === food.x && p.y === food.y; }); })); }
    function hazardCap() {
      // 점수·경과 시간에 따라 동시 악당 수 증가 (최대 6)
      return Math.min(6, 1 + Math.floor(score / 80) + Math.floor(playSec / 35));
    }
    function hazardInterval() {
      // 점수·시간이 오를수록 더 자주 등장
      return Math.max(3.2, 9 - score / 90 - playSec / 40);
    }
    function spawnHazard() {
      if (hazards.length >= hazardCap()) return;
      var y = 2 + Math.floor(Math.random() * (ROWS - 4));
      // 이미 비슷한 줄에 있으면 다른 줄 시도
      var tries = 0;
      while (tries < 8 && hazards.some(function (h) { return h.body[0] && Math.abs(h.body[0].y - y) < 2; })) {
        y = 2 + Math.floor(Math.random() * (ROWS - 4));
        tries++;
      }
      var left = Math.random() > 0.5;
      var body = [];
      for (var i = 0; i < 3; i++) body.push({ x: left ? -1 - i : COLS + i, y: y });
      hazards.push({ body: body, dir: left ? 1 : -1, acc: 0 });
    }
    function input(x, y) { if (dir.x + x || dir.y + y) next = { x: x, y: y }; }
    function key(e) {
      var m = { ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0], ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1] };
      if (m[e.key]) { e.preventDefault(); input(m[e.key][0], m[e.key][1]); }
    }
    function draw(alpha) {
      ctx.drawImage(gridCanvas, 0, 0);
      var pulse = Math.max(6, CELL * 0.35) + Math.sin(anim * 6) * 2;
      ctx.fillStyle = '#e2bd64';
      ctx.beginPath(); ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, pulse, 0, Math.PI * 2); ctx.fill();
      hazards.forEach(function (h) {
        h.body.forEach(function (p, i) {
          if (p.x < 0 || p.x >= COLS) return;
          ctx.fillStyle = i ? '#ff8a00' : '#ffe14d';
          ctx.strokeStyle = '#fff8e1';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2, 6); ctx.fill(); ctx.stroke();
        });
      });
      snake.forEach(function (p, i) {
        var t = alpha || 0;
        var ox = i + 1 < snake.length ? snake[i + 1].x : p.x - dir.x;
        var oy = i + 1 < snake.length ? snake[i + 1].y : p.y - dir.y;
        var x = (ox + (p.x - ox) * t) * CELL + 2;
        var y = (oy + (p.y - oy) * t) * CELL + 2;
        if (!i) {
          drawHeroShape(ctx, x - 2, y - 2, CELL, CELL, { radius: 10, font: 10, top: '#c8f0d4', mid: '#9ad2a9', bot: '#3f8a6a' });
        } else {
          ctx.fillStyle = '#43a982';
          ctx.beginPath(); ctx.roundRect(x, y, CELL - 4, CELL - 4, 8); ctx.fill();
        }
      });
      fx.draw(ctx);
    }
    function loop(t) {
      if (dead) return;
      var dt = frameDt(t, loop._last); loop._last = t;
      anim += dt; fx.update(dt); playSec += dt;
      if (score >= 100 || playSec >= 45) {
        hazAcc += dt;
        if (hazAcc >= hazardInterval()) {
          hazAcc = 0;
          spawnHazard();
        }
      }
      hazards.forEach(function (h) {
        h.acc += dt;
        // 후반으로 갈수록 악당도 조금 빨라짐
        var hazStep = Math.max(0.32, 0.55 - score / 1200 - playSec / 500);
        if (h.acc >= hazStep) {
          h.acc = 0;
          var head = { x: h.body[0].x + h.dir, y: h.body[0].y };
          // 벽에 튕기지 않고 빠져나가 사라짐
          h.body.unshift(head); h.body.pop();
        }
      });
      hazards = hazards.filter(function (h) {
        return h.body.some(function (p) { return p.x >= -2 && p.x < COLS + 2; }) &&
          h.body.some(function (p) { return p.x >= -1 && p.x <= COLS; });
      });
      var alpha = Math.min(1, (t - last) / step);
      if (t - last >= step) {
        last = t; dir = next; var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        var hitHaz = hazards.some(function (h) { return h.body.some(function (p) { return p.x === head.x && p.y === head.y; }); });
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || hitHaz || snake.some(function (p) { return p.x === head.x && p.y === head.y; })) {
          dead = true; fx.burst(snake[0].x * CELL + CELL / 2, snake[0].y * CELL + CELL / 2, '#ef5350', 18, 220); shakeStage();
          gameOver(hitHaz ? '느린 뱀에 부딪쳤어요' : '벽에 닿았어요', '야식 ' + (score / 10) + '개 · ' + formatScore(score) + '점', function () { startGame('snake'); }, score); return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score += 10; step = Math.max(72, step - 1.8); hud('score', score); hud('speed', (128 / step).toFixed(1) + 'x');
          fx.burst(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, '#efd28a', 16, 200); spawn();
        } else snake.pop();
        alpha = 0;
      }
      draw(alpha); c.raf(loop);
    }
    c.on(document, 'keydown', key);
    c.on(cv.canvas, 'touchstart', function (e) { touch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    c.on(cv.canvas, 'touchend', function (e) { var dx = e.changedTouches[0].clientX - touch[0], dy = e.changedTouches[0].clientY - touch[1]; if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? 1 : -1, 0); else input(0, dy > 0 ? 1 : -1); }, { passive: true });
    snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }]; dir = next = { x: 1, y: 0 }; score = 0; spawn(); draw(1); c.raf(loop);
    actions(function () { startGame('snake'); }, function () { return score; }, '100점·시간이 지나면 악당 지렁이가 점점 더 자주, 더 많이 지나가며 벽으로 사라집니다.');
    return { id: 'snake', destroy: c.destroy };
  };

  games.memory = function () {
    var c = controller();
    var MEMORY_ICONS = [
      '🛏️', '🔑', '🛎️', '⭐', '☕', '🧖', '🍷', '🧳',
      '🧹', '📜', '🫧', '🧸', '🏨', '🍽️', '🥂', '🧴',
      '🪞', '🧺', '🧯', '🪴', '📺', '☎️', '🚪', '🪟',
      '🛋️', '🕰️', '🧁', '🕯️', '🚿', '🛁', '🎩', '💎'
    ];
    var SIZES = [
      { pairs: 12, cols: 4, rows: 6, label: '12쌍 · 4×6' },
      { pairs: 18, cols: 6, rows: 6, label: '18쌍 · 6×6' },
      { pairs: 24, cols: 6, rows: 8, label: '24쌍 · 6×8' },
      { pairs: 28, cols: 7, rows: 8, label: '28쌍 · 7×8' },
      { pairs: 32, cols: 8, rows: 8, label: '32쌍 · 8×8' }
    ];
    var chosen = 18, cards, first = -1, locked = false, moves = 0, matched = 0, started = 0, seconds = 0, timer = 0, totalCards = 0, grid, playing = false, waveRaf = 0;
    setHud([['이동', '0', 'moves'], ['시간', '0초', 'time'], ['점수', '—', 'score']]);
    function sizeOf(pairs) {
      for (var i = 0; i < SIZES.length; i++) if (SIZES[i].pairs === pairs) return SIZES[i];
      return SIZES[1];
    }
    function calc() {
      var base = Math.round(1400 * (chosen / 12));
      return Math.max(100, base - moves * 10 - seconds * 2);
    }
    function draw() {
      if (!grid) return;
      grid.innerHTML = cards.map(function (x, i) {
        var show = x.open || x.done;
        return '<button type="button" class="hkg-memory-card ' + (x.open ? 'open ' : '') + (x.done ? 'done' : '') + '" data-i="' + i + '" draggable="false"' + (!playing ? ' disabled' : '') + '>' + (show ? '<span class="hkg-memory-face">' + x.icon + '</span>' : '') + '</button>';
      }).join('');
    }
    function paintWave(openFlags) {
      if (!grid) return;
      var nodes = grid.querySelectorAll('[data-i]');
      for (var i = 0; i < nodes.length; i++) {
        var on = !!openFlags[i];
        nodes[i].classList.toggle('open', on);
        nodes[i].textContent = on ? (cards[i] && cards[i].icon) || '' : '';
      }
    }
    function runIntroWave(done) {
      var step = 22, hold = 90, t0 = performance.now();
      if (grid) grid.classList.add('wave');
      function tick(now) {
        var elapsed = now - t0;
        var flags = [];
        for (var i = 0; i < cards.length; i++) {
          var openAt = i * step;
          flags[i] = elapsed >= openAt && elapsed < openAt + hold;
        }
        paintWave(flags);
        if (elapsed < (cards.length - 1) * step + hold + 40) {
          waveRaf = requestAnimationFrame(tick);
        } else {
          waveRaf = 0;
          if (grid) grid.classList.remove('wave');
          paintWave([]);
          if (done) done();
        }
      }
      waveRaf = requestAnimationFrame(tick);
    }
    function click(e) {
      if (!playing) return;
      var node = e.target.closest('[data-i]'); if (!node || locked) return;
      var i = Number(node.dataset.i); if (cards[i].open || cards[i].done) return;
      cards[i].open = true; draw();
      if (first < 0) { first = i; return; }
      moves++; hud('moves', moves);
      if (cards[first].icon === cards[i].icon) {
        cards[first].done = cards[i].done = true; matched += 2; first = -1; draw();
        floatScore(grid.offsetWidth / 2, 40, 'MATCH!', refs.stage);
        if (matched === totalCards) {
          clearInterval(timer); var score = calc(); hud('score', formatScore(score));
          gameOver('모든 짝을 찾았어요!', moves + '번 이동 · ' + seconds + '초 · ' + score + '점', function () { startGame('memory'); }, score);
        }
      } else {
        locked = true; c.timer(function () { cards[first].open = cards[i].open = false; first = -1; locked = false; draw(); }, 480);
      }
      hud('score', formatScore(calc()));
    }
    function begin(pairs) {
      chosen = pairs || 18;
      var sz = sizeOf(chosen);
      totalCards = chosen * 2;
      first = -1; locked = true; moves = 0; matched = 0; seconds = 0; playing = false;
      if (waveRaf) { try { cancelAnimationFrame(waveRaf); } catch (_) {} waveRaf = 0; }
      refs.stage.innerHTML = '<div class="hkg-memory-frame"><div class="hkg-memory"></div></div>';
      grid = refs.stage.querySelector('.hkg-memory');
      grid.style.gridTemplateColumns = 'repeat(' + sz.cols + ',minmax(0,1fr))';
      grid.style.gridTemplateRows = 'repeat(' + sz.rows + ',minmax(0,1fr))';
      var icons = MEMORY_ICONS.slice(0, chosen);
      cards = icons.concat(icons).sort(function () { return Math.random() - .5; }).map(function (icon) { return { icon: icon, open: false, done: false }; });
      setHud([['이동', '0', 'moves'], ['시간', '0초', 'time'], ['점수', formatScore(calc()), 'score']]);
      draw();
      c.on(grid, 'click', click);
      c.on(grid, 'dragstart', function (e) { e.preventDefault(); });
      c.on(grid, 'selectstart', function (e) { e.preventDefault(); });
      if (timer) clearInterval(timer);
      actions(function () { startGame('memory'); }, calc, chosen + '쌍(' + totalCards + '장) · ' + sz.cols + '×' + sz.rows + ' · 시작 시 파도 미리보기');
      runIntroWave(function () {
        playing = true;
        locked = false;
        started = Date.now();
        draw();
        timer = setInterval(function () {
          if (gamePaused || !playing) return;
          seconds = Math.floor((Date.now() - started) / 1000);
          hud('time', seconds + '초');
          hud('score', formatScore(calc()));
        }, 500);
      });
    }
    function showSetup() {
      playing = false;
      refs.stage.innerHTML =
        '<div class="hkg-memory-setup">' +
        '<h3>카드 수 선택</h3>' +
        '<p class="hkg-note" style="margin:0">기본 18쌍(6×6). 원하는 보드를 고른 뒤 시작하세요.</p>' +
        '<div class="hkg-memory-sizes">' +
        SIZES.map(function (sz) {
          return '<button type="button" class="hkg-btn' + (sz.pairs === chosen ? ' primary' : '') + '" data-pairs="' + sz.pairs + '">' + sz.label + '</button>';
        }).join('') +
        '</div>' +
        '<button type="button" class="hkg-btn primary" data-act="start">게임 시작</button>' +
        '</div>';
      Array.prototype.forEach.call(refs.stage.querySelectorAll('[data-pairs]'), function (btn) {
        btn.onclick = function () {
          chosen = Number(btn.getAttribute('data-pairs')) || 18;
          showSetup();
        };
      });
      refs.stage.querySelector('[data-act="start"]').onclick = function () { begin(chosen); };
      actions(function () { startGame('memory'); }, function () { return 0; }, '카드 수를 선택한 뒤 게임을 시작하세요.');
    }
    showSetup();
    var originalDestroy = c.destroy;
    c.destroy = function () {
      if (timer) clearInterval(timer);
      if (waveRaf) { try { cancelAnimationFrame(waveRaf); } catch (_) {} waveRaf = 0; }
      originalDestroy();
    };
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
      var rows = [4, 5, 5, 6, 6][n - 1];
      var cols = [9, 10, 10, 10, 11][n - 1];
      var padW = [128, 118, 110, 102, 96][n - 1];
      var spd = [395, 420, 455, 495, 540][n - 1];
      var drop = [0.34, 0.36, 0.38, 0.4, 0.42][n - 1];
      var shape = ['rect', 'round', 'diamond', 'pill', 'hex'][n - 1];
      return { rows: rows, cols: cols, padW: padW, spd: spd, drop: drop, shape: shape };
    }
    function brickAlive(stage, r, col, rows, cols) {
      var cx = (cols - 1) / 2, cy = (rows - 1) / 2;
      var dx = col - cx, dy = r - cy;
      if (stage === 1) return true;
      if (stage === 2) return Math.abs(dx) + Math.abs(dy) <= Math.max(cx, cy) + 0.2;
      if (stage === 3) return r >= Math.floor(Math.abs(dx) * (rows - 1) / Math.max(1, cx));
      if (stage === 4) {
        var onEdge = r === 0 || r === rows - 1 || col === 0 || col === cols - 1;
        var cross = r === Math.round(cy) || col === Math.round(cx);
        return onEdge || cross;
      }
      return ((r + col) % 3 !== 1) || r === 0 || r === rows - 1;
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
          if (!brickAlive(stage, r, col, cfg.rows, cfg.cols)) continue;
          bricks.push({
            x: 12 + col * (bw + gapX),
            y: 42 + r * (bh + gapY),
            w: bw,
            h: bh,
            color: colors[(r + stage) % colors.length],
            hp: stage >= 5 && r < 1 ? 2 : 1,
            shape: cfg.shape
          });
        }
      }
      paddleTimer = 0; ballTimer = 0; ballTimerType = ''; baseSpeed = 1 + (stage - 1) * 0.025;
      resetBall();
      hud('stage', stage + '/5');
      hud('bricks', bricks.length);
      hud('lives', lives);
      hud('score', score);
    }
    function spawnItem(x, y) {
      if (Math.random() > stageCfg(stage).drop) return;
      var roll = Math.random();
      // 1UP(목숨)은 드물게
      var kind = roll < 0.07 ? 'life' : ['wide', 'narrow', 'slow', 'fast'][Math.floor(Math.random() * 4)];
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
        var sh = b.shape || 'rect';
        if (sh === 'round') {
          ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2 - 1, 0, Math.PI * 2);
        } else if (sh === 'diamond') {
          ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w, b.y + b.h / 2);
          ctx.lineTo(b.x + b.w / 2, b.y + b.h); ctx.lineTo(b.x, b.y + b.h / 2); ctx.closePath();
        } else if (sh === 'pill') {
          if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2); else ctx.rect(b.x, b.y, b.w, b.h);
        } else if (sh === 'hex') {
          var hx = b.x + b.w / 2, hy = b.y + b.h / 2, rx = b.w * 0.48, ry = b.h * 0.48;
          for (var k = 0; k < 6; k++) {
            var ang = (Math.PI / 3) * k - Math.PI / 6;
            var px = hx + Math.cos(ang) * rx, py = hy + Math.sin(ang) * ry;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, 5);
        else ctx.rect(b.x, b.y, b.w, b.h);
        ctx.fill();
        ctx.fillStyle = '#ffffff30'; ctx.fillRect(b.x + 4, b.y + 3, Math.max(4, b.w - 8), 3);
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
      ctx.fillStyle = '#fff4d0';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
      fx.draw(ctx);
    }
    function loop(t) {
      if (!running) return; var dt = frameDt(t, last); last = t;
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
        ball.vx = hit * (420 + stage * 24) * baseSpeed;
        ball.vy = -Math.abs(Math.max(cfg.spd * 0.9, Math.abs(ball.vy))) * 1.045;
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
          baseSpeed = Math.min(1.75, baseSpeed + 0.012);
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
    var canDouble = false, spaceLatch = false;
    setHud([['높이', '0', 'score'], ['최고', formatScore(best('jump', name())), 'best']]);
    function setup() {
      player = { x: 238, y: 580, w: 46, h: 40, vx: 0, vy: -650 };
      platforms = [{ x: 200, y: 640, w: 120, steps: 0 }];
      for (var y = 550; y > -100; y -= 70 + Math.random() * 24) platforms.push({ x: 20 + Math.random() * 390, y: y, w: 82 + Math.random() * 36, steps: 0 });
      canDouble = true;
      spaceLatch = false;
      score = 0;
    }
    function gapScale() { return Math.max(0.78, 1 - score / 22000); }
    function riseSpeed() {
      // Noticeably rising floor — still climbable with double-jump
      return 14 + Math.min(22, score / 4500);
    }
    function addPlatforms() {
      var top = Math.min.apply(null, platforms.map(function (p) { return p.y; }));
      var g = gapScale();
      while (top > -120) {
        top -= (64 + Math.random() * 34) / g;
        platforms.push({ x: 15 + Math.random() * 400, y: top, w: (78 + Math.random() * 42) * g, steps: 0 });
      }
    }
    function doDoubleJump() {
      if (!running || !canDouble) return;
      canDouble = false;
      player.vy = Math.min(player.vy, 0) - 620;
      fx.spark(player.x + player.w / 2, player.y + player.h * 0.6, '#9ae6b4');
      fx.spark(player.x + player.w / 2, player.y + player.h, '#efd28a');
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, 700); g.addColorStop(0, '#123e42'); g.addColorStop(1, '#07161c'); ctx.fillStyle = g; ctx.fillRect(0, 0, 520, 700);
      ctx.fillStyle = '#ffffff12'; for (var i = 0; i < 35; i++) { ctx.beginPath(); ctx.arc((i * 83) % 520, (i * 137 + score * 0.02) % 700, i % 3 + 1, 0, 7); ctx.fill(); }
      // rising death floor hint
      var fg = ctx.createLinearGradient(0, 660, 0, 700);
      fg.addColorStop(0, '#0000'); fg.addColorStop(1, '#ff8a7a33');
      ctx.fillStyle = fg; ctx.fillRect(0, 655, 520, 45);
      ctx.fillStyle = '#ff8a7a55'; ctx.fillRect(0, 692, 520, 8);
      platforms.forEach(function (p) { ctx.fillStyle = '#d6bc75'; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, 11, 6); ctx.fill(); ctx.fillStyle = '#719b7a'; ctx.fillRect(p.x + 7, p.y + 10, p.w - 14, 4); });
      drawHeroShape(ctx, player.x, player.y, player.w, player.h, { radius: 12, font: 11 });
      // double-jump charge indicator
      if (canDouble && player.vy > -40) {
        ctx.fillStyle = '#9ae6b488';
        ctx.beginPath(); ctx.arc(player.x + player.w / 2, player.y - 8, 4, 0, 7); ctx.fill();
      }
      fx.draw(ctx);
    }
    function scrollWorld(shift) {
      if (shift <= 0) return;
      player.y += shift;
      platforms.forEach(function (p) { p.y += shift; });
      score += Math.round(shift);
      hud('score', formatScore(score));
      platforms = platforms.filter(function (p) { return p.y < 740; });
      addPlatforms();
    }
    function loop(t) {
      if (!running) return; var dt = frameDt(t, last); last = t; fx.update(dt);
      var steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (touchX != null) steer = touchX < player.x + player.w / 2 ? -1 : 1;
      player.vx += steer * 1300 * dt; player.vx *= Math.pow(.05, dt); player.vx = Math.max(-280, Math.min(280, player.vx));
      player.x += player.vx * dt; player.vy += 1480 * dt; var oldBottom = player.y + player.h; player.y += player.vy * dt;
      if (player.x < -player.w) player.x = 520; if (player.x > 520) player.x = -player.w;
      if (player.vy > 0) platforms.some(function (p) {
        if (oldBottom <= p.y && player.y + player.h >= p.y && player.x + player.w > p.x + 4 && player.x < p.x + p.w - 4) {
          player.y = p.y - player.h; player.vy = -690; canDouble = true;
          p.steps = (p.steps || 0) + 1;
          fx.spark(player.x + player.w / 2, player.y + player.h, '#d6bc75');
          if (p.steps >= 2) {
            fx.burst(p.x + p.w / 2, p.y, '#d6bc75', 10, 140);
            p._break = true;
          }
          return true;
        }
        return false;
      });
      platforms = platforms.filter(function (p) { return !p._break; });
      // follow player upward
      if (player.y < 270) scrollWorld(270 - player.y);
      // very slow auto camera rise (world sinks / floor rises)
      scrollWorld(riseSpeed() * dt);
      if (player.y + player.h >= 700) {
        running = false; shakeStage();
        gameOver('바닥에 닿았어요', '오른 높이 ' + formatScore(score), function () { startGame('jump'); }, score);
        return;
      }
      draw(); c.raf(loop);
    }
    function key(e) {
      var k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].indexOf(k) >= 0) {
        e.preventDefault(); keys[k.toLowerCase()] = e.type === 'keydown'; keys[k] = e.type === 'keydown';
      }
      if (k === ' ' || k === 'Spacebar' || k === 'Space') {
        e.preventDefault();
        if (e.type === 'keydown' && !e.repeat && !spaceLatch) {
          spaceLatch = true;
          doDoubleJump();
        }
        if (e.type === 'keyup') spaceLatch = false;
      }
    }
    c.on(document, 'keydown', key); c.on(document, 'keyup', key);
    c.on(cv.canvas, 'touchstart', function (e) {
      e.preventDefault();
      var r = cv.canvas.getBoundingClientRect();
      var tx = (e.touches[0].clientX - r.left) * 520 / r.width;
      var ty = (e.touches[0].clientY - r.top) * 700 / r.height;
      touchX = tx;
      // tap upper area for double jump
      if (ty < 320) doDoubleJump();
    }, { passive: false });
    c.on(cv.canvas, 'touchmove', function (e) { var r = cv.canvas.getBoundingClientRect(); touchX = (e.touches[0].clientX - r.left) * 520 / r.width; }, { passive: true });
    c.on(cv.canvas, 'touchend', function () { touchX = null; }, { passive: true });
    setup(); draw(); c.raf(loop);
    actions(function () { startGame('jump'); }, function () { return score; }, '좌우 이동 · SPACE(또는 화면 상단 탭)로 2단 점프 · 같은 발판 2회 밟으면 사라집니다.');
    return { id: 'jump', destroy: c.destroy };
  };

  games.tetris = function () {
    // Classic 10×20 playfield (portrait). Drop speed ramps hard with lines.
    var CW = 400, CH = 640, W = 10, H = 20, cell = 30, padX = 10, padY = 20;
    var c = controller(), cv = canvasBase(CW, CH, 'hkg-canvas-tetris'), ctx = cv.ctx;
    var shapes = [[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]]];
    var colors = ['#55c2c8', '#efd28a', '#d86bd7', '#55a9e8', '#f08b43', '#4bc6a6', '#ef5350'];
    var grid, piece, nextId, score = 0, lines = 0, drop = 0, softDrop = 0, step = 520, over = false, held = {}, fx = makeFx(), flashRows = [];
    setHud([['점수', '0', 'score'], ['라인', '0', 'lines'], ['레벨', '1', 'level']]);
    function empty() { return Array.from({ length: H }, function () { return Array(W).fill(0); }); }
    function level() { return 1 + Math.floor(lines / 4); }
    function dropMs(lv) {
      // Gentler ramp so mid/late game stays playable
      return Math.max(85, Math.round(560 * Math.pow(0.88, Math.max(0, lv - 1))));
    }
    function dasMs(lv) {
      return Math.max(55, 130 - (lv - 1) * 8);
    }
    function softMs(lv) {
      return Math.max(22, 55 - (lv - 1) * 3);
    }
    function syncSpeed() {
      var lv = level();
      step = dropMs(lv);
      hud('level', lv);
    }
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
          for (var x = 0; x < W; x++) fx.burst(padX + x * cell + cell / 2, padY + row * cell + cell / 2, '#fff4d0', 8, 180);
          fx.burst(padX + W * cell / 2, padY + row * cell + cell / 2, '#efd28a', 14, 220);
        });
        shakeStage();
        c.timer(function () {
          cleared.sort(function (a, b) { return b - a; }).forEach(function (row) {
            grid.splice(row, 1); grid.unshift(Array(W).fill(0));
          });
          flashRows = [];
          lines += cleared.length;
          score += [0, 140, 360, 640, 1100][cleared.length] * level();
          syncSpeed();
          hud('score', formatScore(score)); hud('lines', lines);
          spawn();
        }, 160);
      } else spawn();
    }
    function rotate() {
      var m = piece.m, rotated = m[0].map(function (_, i) { return m.map(function (row) { return row[i]; }).reverse(); });
      if (!collide(piece.x, piece.y, rotated)) piece.m = rotated;
      else if (!collide(piece.x - 1, piece.y, rotated)) { piece.x--; piece.m = rotated; }
      else if (!collide(piece.x + 1, piece.y, rotated)) { piece.x++; piece.m = rotated; }
      else if (!collide(piece.x - 2, piece.y, rotated)) { piece.x -= 2; piece.m = rotated; }
      else if (!collide(piece.x + 2, piece.y, rotated)) { piece.x += 2; piece.m = rotated; }
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
      ctx.beginPath(); ctx.roundRect(px + 1, py + 1, cell - 2, cell - 2, 6); ctx.fill();
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffffff40'; ctx.fillRect(px + 4, py + 3, cell - 10, 3);
      ctx.fillStyle = '#00000033'; ctx.fillRect(px + 4, py + cell - 7, cell - 10, 3);
    }
    function ghostY() {
      var y = piece.y; while (!collide(piece.x, y + 1, piece.m)) y++; return y;
    }
    function draw() {
      var bg = ctx.createLinearGradient(0, 0, 0, CH);
      bg.addColorStop(0, '#0d2a30'); bg.addColorStop(1, '#061218');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
      ctx.fillStyle = '#08181d'; ctx.beginPath(); ctx.roundRect(padX - 4, padY - 4, W * cell + 8, H * cell + 8, 10); ctx.fill();
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
      // NEXT preview
      var nx0 = padX + W * cell + 18, ny0 = padY + 8;
      ctx.fillStyle = '#0c2228'; ctx.beginPath(); ctx.roundRect(nx0 - 8, ny0 - 8, 86, 110, 10); ctx.fill();
      ctx.fillStyle = '#efd28a'; ctx.font = 'bold 12px Georgia,serif'; ctx.textAlign = 'left';
      ctx.fillText('NEXT', nx0, ny0 + 6);
      if (nextId != null && shapes[nextId]) {
        var nm = shapes[nextId];
        nm.forEach(function (row, r) {
          row.forEach(function (v, col) {
            if (!v) return;
            var px = nx0 + 8 + col * 18, py = ny0 + 22 + r * 18;
            ctx.fillStyle = colors[nextId];
            ctx.beginPath(); ctx.roundRect(px, py, 16, 16, 4); ctx.fill();
          });
        });
      }
      fx.draw(ctx);
    }
    function loop(t) {
      if (over) return;
      var dt = frameDt(t, loop._last); loop._last = t;
      fx.update(dt);
      if (flashRows.length) { draw(); c.raf(loop); return; }
      if (!drop) drop = t;
      if (t - drop >= step) { drop = t; soft(); }
      var lv = level();
      var das = dasMs(lv);
      if (held.left && t - (held._leftAt || 0) > das) { held._leftAt = t; if (!collide(piece.x - 1, piece.y, piece.m)) piece.x--; }
      if (held.right && t - (held._rightAt || 0) > das) { held._rightAt = t; if (!collide(piece.x + 1, piece.y, piece.m)) piece.x++; }
      if (held.down) {
        if (!softDrop || t - softDrop >= softMs(lv)) { softDrop = t; soft(); score += 1; hud('score', formatScore(score)); }
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
    grid = empty(); spawn(); syncSpeed(); draw(); c.raf(loop);
    actions(function () { startGame('tetris'); }, function () { return score; }, '클래식 10×20 · NEXT 미리보기 · 4라인마다 레벨↑ · 낙하 속도는 완만히 상승 · ←→이동 · ↑회전 · ↓소프트 · Space하드');
    return { id: 'tetris', destroy: c.destroy };
  };

  games.pong = function () {
    var c = controller(), cv = canvasBase(640, 420), ctx = cv.ctx, paddle, balls = [], score = 0, lives = 3, running = true, last = 0, fx = makeFx(), speed = 1.02, rally = 0, items = [], powerT = 0;
    setHud([['점수', '0', 'score'], ['목숨', '3', 'lives'], ['최고', formatScore(best('pong', name())), 'best']]);
    function makeBall(x, y, vx, vy, r) {
      return { x: x, y: y, vx: vx, vy: vy, r: r || 7.5 };
    }
    function reset() {
      paddle = { x: 255, y: 378, w: 102, h: 16 };
      var v = 285 * speed;
      var ang = (Math.random() * 0.7 + 0.35) * (Math.random() > .5 ? 1 : -1);
      balls = [makeBall(320, 200, Math.sin(ang) * v, -Math.abs(Math.cos(ang)) * v, 7.5)];
      items = []; powerT = 0;
    }
    function spawnItem() {
      if (Math.random() > 0.008) return;
      var kinds = ['multi', 'big', 'wide', 'slow', 'slim', 'fast'];
      items.push({ x: 40 + Math.random() * 560, y: -20, kind: kinds[Math.floor(Math.random() * kinds.length)], vy: 90 + Math.random() * 40 });
    }
    function applyPongItem(kind) {
      if (kind === 'multi') {
        var src = balls[0];
        if (src) {
          balls.push(makeBall(src.x, src.y, -src.vx * 0.9, src.vy * 0.95, src.r));
          balls.push(makeBall(src.x, src.y, src.vx * 1.05, src.vy * 0.9, src.r));
        }
        floatScore(paddle.x + paddle.w / 2, paddle.y - 18, 'TRIPLE!', refs.stage);
      } else if (kind === 'big') {
        balls.forEach(function (b) { b.r = Math.min(14, b.r + 3); });
        floatScore(paddle.x + paddle.w / 2, paddle.y - 18, 'BIG', refs.stage);
      } else if (kind === 'wide') {
        paddle.w = Math.min(160, paddle.w + 28); powerT = 8;
        floatScore(paddle.x + paddle.w / 2, paddle.y - 18, 'WIDE', refs.stage);
      } else if (kind === 'slow') {
        speed = Math.max(0.9, speed * 0.88); powerT = 7;
        floatScore(paddle.x + paddle.w / 2, paddle.y - 18, 'SLOW', refs.stage);
      } else if (kind === 'slim') {
        paddle.w = Math.max(54, paddle.w - 22); powerT = 6;
        floatScore(paddle.x + paddle.w / 2, paddle.y - 18, 'SLIM', refs.stage);
      } else if (kind === 'fast') {
        speed *= 1.12; powerT = 5;
        floatScore(paddle.x + paddle.w / 2, paddle.y - 18, 'FAST', refs.stage);
      }
    }
    function clampBall(b) {
      var mag = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      var minV = 260 * speed;
      if (mag < minV) {
        b.vx = (b.vx / mag) * minV;
        b.vy = (b.vy / mag) * minV;
        mag = minV;
      }
      if (Math.abs(b.vy) < minV * 0.22) b.vy = (b.vy < 0 ? -1 : 1) * minV * 0.4;
    }
    function draw() {
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, 640, 420);
      ctx.strokeStyle = '#ffffff18'; ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.moveTo(0, 210); ctx.lineTo(640, 210); ctx.stroke(); ctx.setLineDash([]);
      drawHeroShape(ctx, paddle.x, paddle.y, paddle.w, paddle.h, { radius: 7, font: 10 });
      balls.forEach(function (b) {
        ctx.fillStyle = '#fff4d0';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      });
      items.forEach(function (it) {
        ctx.fillStyle = (it.kind === 'slim' || it.kind === 'fast') ? '#fc8181' : '#9ae6b4';
        ctx.beginPath(); ctx.roundRect(it.x, it.y, 34, 16, 6); ctx.fill();
        ctx.fillStyle = '#122'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(it.kind.toUpperCase(), it.x + 17, it.y + 12);
      });
      fx.draw(ctx);
    }
    function loop(t) {
      if (!running) return; var dt = frameDt(t, last); last = t; fx.update(dt);
      if (powerT > 0) powerT -= dt;
      spawnItem();
      items.forEach(function (it) { it.y += it.vy * dt; });
      items = items.filter(function (it) {
        if (it.y > 430) return false;
        if (it.y + 16 >= paddle.y && it.x + 34 > paddle.x && it.x < paddle.x + paddle.w) {
          applyPongItem(it.kind); fx.burst(it.x + 17, it.y, '#efd28a', 10, 140); return false;
        }
        return true;
      });
      var lostOne = false;
      balls.forEach(function (ball) {
        var prevY = ball.y;
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < ball.r || ball.x > 640 - ball.r) {
          ball.vx *= -1;
          ball.x = Math.max(ball.r, Math.min(640 - ball.r, ball.x));
          fx.spark(ball.x, ball.y);
        }
        if (ball.y < ball.r) {
          ball.y = ball.r; ball.vy = Math.abs(ball.vy);
          score += 8; rally++; speed += 0.03 + rally * 0.0025;
          hud('score', score); clampBall(ball); fx.spark(ball.x, ball.y, '#9ad2a9');
        }
        if (
          ball.vy > 0 &&
          prevY + ball.r <= paddle.y + paddle.h &&
          ball.y + ball.r >= paddle.y &&
          ball.x >= paddle.x - 4 &&
          ball.x <= paddle.x + paddle.w + 4
        ) {
          ball.y = paddle.y - ball.r;
          var hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
          hit = Math.max(-1, Math.min(1, hit));
          var mag = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) || (260 * speed);
          mag *= 1.04;
          var ang = hit * 0.65 + (Math.random() * 2 - 1) * 1.1;
          ang = Math.max(-1.22, Math.min(1.22, ang));
          ball.vx = Math.sin(ang) * mag;
          ball.vy = -Math.abs(Math.cos(ang)) * mag;
          score += 12; rally++; speed += 0.028;
          hud('score', score); clampBall(ball); fx.burst(ball.x, ball.y, '#efd28a', 10, 160);
        }
        if (ball.y > 430) lostOne = true;
      });
      balls = balls.filter(function (b) { return b.y <= 430; });
      if (lostOne) {
        if (!balls.length) {
          lives--; hud('lives', lives); shakeStage(); rally = Math.max(0, rally - 3);
          if (!lives) { running = false; gameOver('랠리 종료', formatScore(score) + '점', function () { startGame('pong'); }, score); return; }
          speed = Math.max(1.0, speed * 0.92);
          reset();
        }
      }
      draw(); c.raf(loop);
    }
    function point(e) {
      var rect = cv.canvas.getBoundingClientRect(), x = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) * 640 / rect.width;
      paddle.x = Math.max(0, Math.min(640 - paddle.w, x - paddle.w / 2));
    }
    c.on(cv.canvas, 'mousemove', point); c.on(cv.canvas, 'touchmove', function (e) { e.preventDefault(); point(e); }, { passive: false });
    reset(); draw(); c.raf(loop);
    actions(function () { startGame('pong'); }, function () { return score; }, '떨어지는 아이템을 받으세요. 초록=이득 · 빨강=패널티. 목숨 3.');
    return { id: 'pong', destroy: c.destroy };
  };

  games.flappy = function () {
    var c = controller(), cv = canvasBase(420, 640), ctx = cv.ctx, bird, pipes, score = 0, running = true, started = false, last = 0, grav = 1380, fx = makeFx(), wing = 0;
    setHud([['점수', '0', 'score'], ['최고', formatScore(best('flappy', name())), 'best']]);
    function setup() { bird = { x: 90, y: 280, vy: 0, r: 18, w: 54, h: 30 }; pipes = []; score = 0; started = false; running = true; }
    function difficulty() {
      return {
        gap: Math.max(152, 186 - score * 1.05),
        speed: 145 + Math.min(55, score * 2.4),
        spacing: Math.max(200, 255 - score * 1.1)
      };
    }
    function addPipe() {
      var d = difficulty();
      var top = 70 + Math.random() * (500 - d.gap);
      pipes.push({ x: 440, top: top, gap: d.gap, passed: false });
    }
    function flap() { if (!running) return; if (!started) { started = true; addPipe(); } bird.vy = -400; fx.spark(bird.x, bird.y + 8, '#ffffff88'); }
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
      if (!running) return; var dt = frameDt(t, last); last = t; wing += dt * 12; fx.update(dt);
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
    // 딜리버리하는 벨맨 — 고군분투(횡스크롤 점프·와이어) inspired runner
    var W = 720, H = 420, FLOOR = 352;
    var c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var player, camX = 0, platforms = [], hooks = [], coins = [], bags = [], nextX = 0;
    var score = 0, tips = 0, running = true, started = false, last = 0, hold = false, deadMsg = '';
    var wireKeyHeld = false; // Shift hold-to-ride (release = let go)
    setHud([['점수', '0', 'score'], ['팁', '0', 'tips'], ['거리', '0m', 'dist'], ['최고', formatScore(best('mines', name())), 'best']]);

    function makePlayer() {
      return {
        x: 140, y: FLOOR - 44, w: 34, h: 44, vx: 0, vy: 0,
        onGround: true, canWire: true, wired: false, hook: null, anim: 0,
        ropeLen: null, omega: 0, wireAge: 0
      };
    }
    function difficultyAt(x) {
      // 0 early → 1 late: 바닥·와이어 줄어들고 속도는 별도 가속
      var p = Math.min(1, Math.max(0, (x - 420) / 8500));
      return {
        prog: p,
        floorChance: Math.max(0.05, 0.58 - p * 0.55),
        roofChance: Math.max(0.06, 0.2 - p * 0.12),
        hookOnFloor: Math.max(0.1, 0.58 - p * 0.5),
        hookOnRoof: Math.max(0.12, 0.9 - p * 0.7),
        hookOnGap: Math.max(0.3, 1 - p * 0.55),
        floorLenMul: Math.max(0.45, 1 - p * 0.55),
        gapMul: 1 + p * 0.85
      };
    }
    function runSpeed() {
      return 270 + Math.min(360, camX / 24);
    }
    function wireReach() {
      // 적당한 거리 안에서만 와이어 가능 (너무 멀면 안 잡힘)
      return 316;
    }
    function addSegment(fromX) {
      var x = fromX;
      while (x < fromX + 900) {
        var d = difficultyAt(x);
        var roll = Math.random();
        if (roll < d.floorChance) {
          var len = (120 + Math.random() * 180) * d.floorLenMul;
          len = Math.max(70, len);
          platforms.push({ x: x, y: FLOOR, w: len, h: 40 });
          if (Math.random() < d.hookOnFloor) {
            hooks.push({ x: x + len * (0.35 + Math.random() * 0.3), y: 38 + Math.random() * 36, used: false });
          }
          if (Math.random() < 0.65) {
            for (var i = 0; i < 2 + (Math.random() * 3) | 0; i++) {
              coins.push({ x: x + 40 + i * 46 + Math.random() * 10, y: FLOOR - 70 - Math.random() * 40, r: 9, taken: false });
            }
          }
          if (Math.random() < 0.32 + d.prog * 0.15) {
            bags.push({ x: x + 40 + Math.random() * Math.max(20, len - 70), y: FLOOR - 28, w: 28, h: 28 });
          }
          x += len;
        } else if (roll < d.floorChance + d.roofChance) {
          var ly = FLOOR - 90 - Math.random() * 70;
          var lw = (80 + Math.random() * 90) * Math.max(0.55, 1 - d.prog * 0.35);
          platforms.push({ x: x + 20, y: ly, w: lw, h: 18 });
          if (Math.random() < d.hookOnRoof) {
            hooks.push({ x: x + 40 + lw * 0.4, y: Math.max(28, ly - 95), used: false });
          }
          coins.push({ x: x + 40 + lw * 0.5, y: ly - 28, r: 9, taken: false });
          x += 120 + Math.random() * 70 + d.prog * 40;
        } else {
          // 낭떠러지 — 후반엔 더 넓고, 와이어도 점점 드묾
          var gap = (105 + Math.random() * 95 + Math.min(110, score / 30)) * d.gapMul;
          var mid = x + gap * 0.52;
          if (Math.random() < d.hookOnGap) {
            hooks.push({ x: mid, y: 28 + Math.random() * 30, used: false, gapWire: true });
          }
          if (Math.random() < 0.5) {
            coins.push({ x: mid, y: FLOOR - 140 - Math.random() * 40, r: 9, taken: false });
          }
          x += gap;
        }
      }
      nextX = x;
    }
    function reset() {
      player = makePlayer();
      camX = 0; platforms = []; hooks = []; coins = []; bags = [];
      nextX = 0; score = 0; tips = 0; started = false; running = true; deadMsg = '';
      platforms.push({ x: -40, y: FLOOR, w: 420, h: 40 });
      addSegment(380);
      hud('score', '0'); hud('tips', '0'); hud('dist', '0m');
    }
    function solidAt(px, py, pw, ph) {
      for (var i = 0; i < platforms.length; i++) {
        var p = platforms[i];
        if (px + pw > p.x && px < p.x + p.w && py + ph > p.y && py < p.y + p.h) return p;
      }
      return null;
    }
    function nearestHook() {
      var best = null, bd = 1e12;
      var px = player.x + player.w / 2, py = player.y + 10;
      var reach = wireReach();
      for (var i = 0; i < hooks.length; i++) {
        var h = hooks[i];
        if (h.used) continue;
        var d = Math.hypot(h.x - px, h.y - py);
        if (d > reach) continue;
        if (h.x < player.x - 60) d *= 1.25;
        if (d < bd) { bd = d; best = h; }
      }
      return best;
    }
    function attachWire(hook) {
      if (!hook || player.wired || hook.used) return false;
      player.wired = true;
      player.hook = hook;
      player.canWire = false;
      player.wireAge = 0;
      hook.used = true; // one ride per wire — no infinite cling / re-grab
      var cx = player.x + player.w / 2, cy = player.y + 10;
      var dist = Math.hypot(hook.x - cx, hook.y - cy);
      // Far hooks: keep long rope first, then reel upward
      player.ropeLen = Math.max(48, Math.min(420, dist));
      var theta0 = Math.atan2(cx - hook.x, cy - hook.y);
      player.omega = (cx < hook.x ? -1 : 1) * 2.8 - Math.min(2.8, Math.abs(player.vy) / 380);
      if (theta0 > 0.2) player.omega = Math.min(player.omega, -1.4);
      // If already reasonably close, snap a bit higher toward the hook
      if (dist < 200) {
        player.y = Math.min(player.y, hook.y + Math.min(player.ropeLen, 140) - 8);
      }
      fx.spark(hook.x, hook.y, '#6ec8ff');
      return true;
    }
    function tryJump() {
      if (!running) return;
      if (!started) started = true;
      if (!player.onGround || player.wired) return;
      player.vy = -580;
      player.onGround = false;
      player.canWire = true;
      fx.spark(player.x + player.w / 2, player.y + player.h, '#efd28a');
    }
    function tryWire() {
      if (!running) return;
      if (!started) started = true;
      if (player.wired) return;
      player.canWire = true;
      var hook = nearestHook();
      if (!hook) return;
      if (attachWire(hook)) hold = true;
    }
    function releaseWire() {
      if (!player.wired) return;
      var hook = player.hook;
      var L = player.ropeLen || 100;
      var om = player.omega || 0;
      if (hook) {
        var cx = player.x + player.w / 2, cy = player.y + 10;
        var theta = Math.atan2(cx - hook.x, cy - hook.y);
        // Extra upward kick so the swing carries higher
        player.vy = -L * om * Math.sin(theta) * 1.05 - 280;
        player.vy = Math.max(-920, Math.min(120, player.vy));
        player.vx = (player.vx || 0) + Math.cos(theta) * Math.abs(om) * 18;
      } else {
        player.vy = Math.min(player.vy, -260);
      }
      player.wired = false;
      player.hook = null;
      player.ropeLen = null;
      player.omega = 0;
      player.wireAge = 0;
      hold = false;
    }
    function die(reason) {
      if (!running) return;
      running = false;
      deadMsg = reason || '배달 실패';
      shakeStage();
      fx.burst(player.x + player.w / 2, player.y + player.h / 2, '#ff8a7a', 18, 220);
      var finalScore = Math.max(0, Math.round(score));
      gameOver(deadMsg, '거리 ' + Math.floor(camX / 18) + 'm · 팁 ' + tips + ' · ' + formatScore(finalScore) + '점', function () { startGame('mines'); }, finalScore);
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#183a42'); g.addColorStop(0.55, '#0d242c'); g.addColorStop(1, '#07151a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // parallax windows
      ctx.fillStyle = '#ffffff08';
      for (var i = 0; i < 8; i++) {
        var wx = ((i * 140 - camX * 0.35) % (W + 140) + W + 140) % (W + 140) - 40;
        ctx.fillRect(wx, 40 + (i % 3) * 28, 54, 36);
      }
      ctx.save();
      ctx.translate(-camX, 0);
      platforms.forEach(function (p) {
        ctx.fillStyle = p.h > 20 ? '#2a4a46' : '#3d5f58';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#d6bc7544';
        ctx.fillRect(p.x, p.y, p.w, 4);
      });
      hooks.forEach(function (h) {
        ctx.strokeStyle = h.used ? '#4a5a56' : (h.gapWire ? '#a8d4c8' : '#88a09a');
        ctx.lineWidth = h.gapWire ? 2.4 : 2;
        ctx.beginPath(); ctx.moveTo(h.x, 0); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.fillStyle = h.used ? '#5a7070' : '#6ec8ff';
        ctx.beginPath(); ctx.arc(h.x, h.y, h.gapWire ? 7 : 6, 0, Math.PI * 2); ctx.fill();
      });
      coins.forEach(function (c0) {
        if (c0.taken) return;
        ctx.fillStyle = '#efd28a';
        ctx.beginPath(); ctx.arc(c0.x, c0.y, c0.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff6';
        ctx.beginPath(); ctx.arc(c0.x - 2, c0.y - 2, 3, 0, Math.PI * 2); ctx.fill();
      });
      bags.forEach(function (b) {
        ctx.fillStyle = '#8b5a3c';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#cbb270';
        ctx.fillRect(b.x + 4, b.y + 6, b.w - 8, 4);
      });
      if (player.wired && player.hook) {
        var hx = player.hook.x, hy = player.hook.y;
        var cx = player.x + player.w / 2, cy = player.y + 8;
        var sag = Math.min(78, Math.hypot(hx - cx, hy - cy) * 0.32 + 18);
        var mx = (cx + hx) * 0.5;
        var my = Math.max(hy + 8, (cy + hy) * 0.5 + sag);
        ctx.strokeStyle = '#9ae6b4dd'; ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(mx, my, hx, hy);
        ctx.stroke();
        // soft second strand for depth
        ctx.strokeStyle = '#6ec8ff55'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(mx + 4, my + 6, hx, hy);
        ctx.stroke();
      }
      // luggage in hand
      drawHeroShape(ctx, player.x, player.y, player.w, player.h, { radius: 10, font: 11 });
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(player.x + player.w - 4, player.y + 16, 14, 16);
      ctx.restore();

      // ground fog / death line hint
      ctx.fillStyle = '#ff8a7a22';
      ctx.fillRect(0, H - 18, W, 18);
      if (!started) {
        ctx.fillStyle = '#f5f0df'; ctx.font = 'bold 18px Georgia,serif'; ctx.textAlign = 'center';
        ctx.fillText('Space · 점프   /   Shift · 와이어(가까운 훅)', W / 2, 56);
        ctx.font = '13px Georgia,serif'; ctx.fillStyle = '#b1c1bd';
        ctx.fillText('Shift 누르는 동안 스윙 · 후반엔 바닥이 거의 사라집니다', W / 2, 80);
      }
      fx.draw(ctx);
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t;
      fx.update(dt);
      player.anim += dt;
      if (started && !gamePaused) {
        var speed = runSpeed();
        camX += speed * dt;
        // prune
        platforms = platforms.filter(function (p) { return p.x + p.w > camX - 80; });
        hooks = hooks.filter(function (h) { return h.x > camX - 80; });
        coins = coins.filter(function (c0) { return !c0.taken && c0.x > camX - 80; });
        bags = bags.filter(function (b) { return b.x + b.w > camX - 80; });
        if (nextX < camX + W + 500) addSegment(nextX);

        player.x = camX + 130;
        if (player.wired && player.hook && (hold || wireKeyHeld)) {
          var hx = player.hook.x, hy = player.hook.y;
          var cx = player.x + player.w / 2;
          var cy = player.y + 10;
          player.wireAge = (player.wireAge || 0) + dt;
          if (player.ropeLen == null) {
            player.ropeLen = Math.max(48, Math.hypot(hx - cx, hy - cy));
            player.omega = -2.6;
          }
          var L = player.ropeLen;
          // θ = 0 when hanging straight down from hook
          var theta = Math.atan2(cx - hx, cy - hy);
          // pendulum + forward bias
          var gSwing = 18;
          player.omega += (-(gSwing / Math.max(45, L)) * Math.sin(theta) * 72 + 3.4) * dt;
          player.omega *= Math.pow(0.986, dt * 60);
          player.omega = Math.max(-11, Math.min(11, player.omega));
          theta += player.omega * dt;
          var maxAng = 1.55;
          if (theta > maxAng) { theta = maxAng; player.omega *= -0.55; }
          if (theta < -maxAng) { theta = -maxAng; player.omega *= -0.55; }
          // Stronger reel for long grabs — climb up toward the hook
          var reel = L > 180 ? 95 : 58;
          L = Math.max(34, L - reel * dt);
          player.ropeLen = L;
          var nx = hx + Math.sin(theta) * L;
          var ny = hy + Math.cos(theta) * L;
          // Allow riding closer under the hook (higher on screen)
          if (ny < hy + 8) {
            ny = hy + 8;
            L = Math.hypot(nx - hx, ny - hy);
            player.ropeLen = Math.max(34, L);
            player.omega *= 0.82;
          }
          player.y = ny - 10;
          player.vy = -L * player.omega * Math.sin(theta);
          // Hold-to-ride: max 1s then auto-release
          if (player.wireAge > 1) releaseWire();
        } else {
          if (player.wired && !hold && !wireKeyHeld) releaseWire();
          player.vy += 1650 * dt;
          player.y += player.vy * dt;
        }

        // platform land
        player.onGround = false;
        if (player.vy >= 0 && !player.wired) {
          var foot = player.y + player.h;
          for (var i = 0; i < platforms.length; i++) {
            var p = platforms[i];
            if (player.x + player.w > p.x + 4 && player.x < p.x + p.w - 4) {
              if (foot >= p.y && foot <= p.y + Math.max(16, player.vy * dt + 10) && player.y < p.y) {
                player.y = p.y - player.h;
                player.vy = 0;
                player.onGround = true;
                player.canWire = true;
              }
            }
          }
        }

        // coins
        coins.forEach(function (c0) {
          if (c0.taken) return;
          if (Math.hypot(c0.x - (player.x + player.w / 2), c0.y - (player.y + player.h / 2)) < 22) {
            c0.taken = true;
            tips += 1;
            score += 15;
            fx.spark(c0.x, c0.y, '#efd28a');
          }
        });
        // bags
        bags.forEach(function (b) {
          if (player.x + player.w > b.x + 4 && player.x < b.x + b.w - 4 && player.y + player.h > b.y + 4 && player.y < b.y + b.h) {
            die('캐리어에 걸려 넘어졌어요');
          }
        });

        score += dt * (8 + speed / 80);
        hud('score', formatScore(Math.floor(score)));
        hud('tips', tips);
        hud('dist', Math.floor(camX / 18) + 'm');

        if (player.y > H + 40) die('낭떠러지로 낙하!');
      }
      draw();
      c.raf(loop);
    }
    function down(e) {
      if (e && e.preventDefault) e.preventDefault();
      hold = true;
      if (player && player.onGround && !player.wired) tryJump();
      else tryWire();
    }
    function up() {
      hold = false;
      if (player && player.wired) releaseWire();
    }
    function isJumpKey(e) {
      return e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' ||
        e.code === 'ArrowUp' || e.code === 'KeyW';
    }
    function isWireKey(e) {
      return e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift';
    }
    function key(e) {
      if (isJumpKey(e)) {
        e.preventDefault();
        if (e.type === 'keydown' && !e.repeat) tryJump();
        return;
      }
      if (!isWireKey(e)) return;
      e.preventDefault();
      if (e.type === 'keydown') {
        wireKeyHeld = true;
        if (!e.repeat) tryWire();
      } else if (e.type === 'keyup') {
        wireKeyHeld = false;
        if (player && player.wired) releaseWire();
      }
    }
    c.on(document, 'keydown', key);
    c.on(document, 'keyup', key);
    c.on(cv.canvas, 'pointerdown', down);
    c.on(window, 'pointerup', up);
    reset(); draw(); c.raf(loop);
    actions(function () { startGame('mines'); }, function () { return Math.floor(score); }, 'Space 점프 · Shift 누른 동안 와이어(가까운 훅만, 최대 1초) · 후반엔 바닥·와이어가 줄고 빨라집니다');
    return { id: 'mines', destroy: c.destroy };
  };

  games.reaction = function () {
    var c = controller(), hits = 0, misses = 0, score = 0, left = 30, round = 0, alive = true, complaintHits = 0;
    var targets = []; // { el, complaint, spawnAt }
    var waveTimer = 0;
    var COMPLAIN_PENALTY = 70;
    refs.stage.innerHTML = '<div class="hkg-reaction"></div>';
    var arena = refs.stage.firstChild;
    setHud([['남은 종', '30', 'left'], ['적중', '0', 'hits'], ['점수', '0', 'score']]);
    function clearTargets() {
      if (waveTimer) { clearTimeout(waveTimer); waveTimer = 0; }
      targets.forEach(function (t) {
        if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
      });
      targets = [];
    }
    function windowMs() {
      return Math.max(1050, 1750 - round * 16);
    }
    function spawnCount() {
      if (round < 7) return 1;
      if (round < 14) return Math.random() < 0.5 ? 2 : 1;
      if (round < 22) return 1 + Math.floor(Math.random() * 3); // 1~3
      return 2 + Math.floor(Math.random() * 3); // 2~4
    }
    function farPos(used) {
      var tries = 0, leftPct, topPct, ok;
      do {
        leftPct = 12 + Math.random() * 76;
        topPct = 12 + Math.random() * 76;
        ok = true;
        for (var i = 0; i < used.length; i++) {
          if (Math.hypot(leftPct - used[i][0], topPct - used[i][1]) < 26) { ok = false; break; }
        }
        tries++;
      } while (!ok && tries < 18);
      return [leftPct, topPct];
    }
    function scheduleNext() {
      if (!alive) return;
      if (left <= 0) { finish(); return; }
      c.timer(spawnWave, 280 + Math.random() * 240);
    }
    function endWaveMissRemaining() {
      if (!alive) return;
      var remaining = targets.slice();
      clearTargets();
      remaining.forEach(function (t) {
        if (!t.complaint) {
          misses++;
          left = Math.max(0, left - 1);
        }
      });
      hud('left', left);
      if (left <= 0) finish();
      else scheduleNext();
    }
    function spawnWave() {
      if (!alive || left <= 0) return;
      clearTargets();
      round++;
      var count = spawnCount();
      var used = [];
      var now = Date.now();
      var bellsPlanned = 0;
      for (var i = 0; i < count; i++) {
        var remainingSlots = count - i;
        var bellsLeft = left - bellsPlanned;
        // 남은 종 수보다 실종을 더 만들지 않음. 여분은 컴플레인으로.
        var mustComplaint = bellsLeft <= 0;
        var isComplaint = mustComplaint || (bellsLeft < remainingSlots ? Math.random() < 0.55 : Math.random() < 0.34);
        if (!isComplaint) bellsPlanned++;
        var btn = el('button', 'hkg-bell' + (isComplaint ? ' is-complaint' : ''), isComplaint ? '😠' : '🔔');
        btn.__complaint = isComplaint;
        var pos = farPos(used);
        used.push(pos);
        btn.style.left = pos[0] + '%';
        btn.style.top = pos[1] + '%';
        arena.appendChild(btn);
        targets.push({ el: btn, complaint: isComplaint, spawnAt: now });
      }
      waveTimer = setTimeout(function () {
        waveTimer = 0;
        endWaveMissRemaining();
      }, windowMs());
    }
    function removeTarget(t) {
      var ix = targets.indexOf(t);
      if (ix >= 0) targets.splice(ix, 1);
      if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
      if (!targets.length) {
        if (waveTimer) { clearTimeout(waveTimer); waveTimer = 0; }
        if (left <= 0) finish();
        else scheduleNext();
      }
    }
    function finish() {
      alive = false;
      clearTargets();
      hud('score', formatScore(score));
      gameOver(hits >= 18 ? '빠른 손!' : '라운드 종료', '적중 ' + hits + ' · 미적중 ' + misses + ' · 컴플레인 ' + complaintHits + ' · ' + formatScore(score) + '점', function () { startGame('reaction'); }, score);
    }
    c.on(arena, 'click', function (e) {
      if (!alive) return;
      var btn = e.target && e.target.closest ? e.target.closest('.hkg-bell') : e.target;
      var hit = null;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].el === btn) { hit = targets[i]; break; }
      }
      if (hit) {
        if (hit.complaint) {
          complaintHits++;
          score -= COMPLAIN_PENALTY;
          hud('score', formatScore(score));
          floatScore(e.offsetX || arena.clientWidth / 2, e.offsetY || 40, 'COMPLAIN -' + COMPLAIN_PENALTY, arena);
          removeTarget(hit);
          return;
        }
        var ms = Date.now() - hit.spawnAt;
        // 빠르게 누를수록 고득점
        var gain = Math.max(8, Math.round(140 - ms / 7));
        hits++; left = Math.max(0, left - 1);
        score += gain;
        hud('hits', hits); hud('left', left); hud('score', formatScore(score));
        floatScore(e.offsetX || arena.clientWidth / 2, e.offsetY || 40, '+' + gain, arena);
        removeTarget(hit);
        return;
      }
      misses++;
      score -= 8;
      hud('score', formatScore(score));
    });
    c.timer(spawnWave, 600);
    actions(function () { startGame('reaction'); }, function () { return score; }, '종 30개 · 반응 빠를수록 고득점 · 후반엔 여러 개 동시 등장 · 노란 컴플레인은 큰 감점(음수 기록 가능)');
    return { id: 'reaction', destroy: function () { clearTargets(); c.destroy(); } };
  };

  games.dodge = function () {
    var c = controller(), cv = canvasBase(420, 640), ctx = cv.ctx, player, bags, stars, score = 0, starCount = 0, coinMode = 0, running = true, last = 0, keys = {}, touchX = null, fx = makeFx();
    setHud([['생존', '0', 'score'], ['별', '0/3', 'stars'], ['최고', formatScore(best('dodge', name())), 'best']]);
    function setup() { player = { x: 184, y: 520, w: 52, h: 58 }; bags = []; stars = []; score = 0; starCount = 0; coinMode = 0; running = true; }
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
      if (coinMode > 0) {
        ctx.fillStyle = '#efd28a33'; ctx.fillRect(0, 0, 420, 36);
        ctx.fillStyle = '#efd28a'; ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
        ctx.fillText('코인 타임 ' + coinMode.toFixed(1) + 's', 210, 24);
      }
      bags.forEach(function (b) {
        if (b.coin) {
          ctx.fillStyle = '#efd28a'; ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, Math.max(8, b.w / 2), 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#8a6a20'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('¢', b.x + b.w / 2, b.y + b.h / 2 + 4);
        } else {
          ctx.fillStyle = b.color; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill();
          ctx.fillStyle = '#00000033'; ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 4);
          ctx.fillStyle = '#ffffff22'; ctx.fillRect(b.x + 5, b.y + 6, b.w - 10, 2);
        }
      });
      stars.forEach(function (s0) {
        ctx.fillStyle = '#fff3a8'; ctx.font = '22px serif'; ctx.textAlign = 'center';
        ctx.fillText('⭐', s0.x, s0.y);
      });
      drawPlayer(); fx.draw(ctx);
    }
    function loop(t) {
      if (!running) return; var dt = frameDt(t, last); last = t; fx.update(dt);
      if (coinMode > 0) {
        coinMode -= dt;
        if (coinMode <= 0) {
          coinMode = 0;
          bags.forEach(function (b) { b.coin = false; });
        }
      }
      var steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (touchX != null) steer = touchX < player.x + player.w / 2 ? -1 : 1;
      player.x = Math.max(4, Math.min(420 - player.w - 4, player.x + steer * 360 * dt));
      var spawnRate = 0.035 + Math.min(0.04, score / 9000);
      var fall = 170 + Math.min(160, score / 28);
      if (Math.random() < spawnRate) {
        bags.push({
          x: Math.random() * 360, y: -50,
          w: 26 + Math.random() * 28, h: 20 + Math.random() * 16,
          vy: fall + Math.random() * 100,
          color: ['#c97b55', '#55a9e8', '#b96d79', '#d6bc75'][Math.floor(Math.random() * 4)],
          coin: coinMode > 0
        });
      }
      if (Math.random() < 0.008) stars.push({ x: 30 + Math.random() * 360, y: -20, vy: 120 + Math.random() * 40 });
      bags.forEach(function (b) { b.y += b.vy * dt; if (coinMode > 0) b.coin = true; });
      stars.forEach(function (s0) { s0.y += s0.vy * dt; });
      stars = stars.filter(function (s0) {
        if (s0.y > 700) return false;
        var hitStar = s0.x > player.x && s0.x < player.x + player.w && s0.y > player.y && s0.y < player.y + player.h;
        if (hitStar) {
          starCount++; hud('stars', starCount + '/3');
          fx.burst(s0.x, s0.y, '#efd28a', 14, 180);
          if (starCount >= 3) {
            starCount = 0; coinMode = 2; hud('stars', '0/3');
            bags.forEach(function (b) { b.coin = true; });
            floatScore(210, 80, 'COIN TIME!', refs.stage);
          }
          return false;
        }
        return true;
      });
      bags = bags.filter(function (b) {
        if (b.y >= 700) { fx.spark(b.x + b.w / 2, 630, b.color); return false; }
        var hit = b.x < player.x + player.w - 4 && b.x + b.w > player.x + 4 && b.y < player.y + player.h - 4 && b.y + b.h > player.y + 10;
        if (hit && b.coin) {
          score += 120; fx.burst(b.x + b.w / 2, b.y + b.h / 2, '#efd28a', 12, 160); return false;
        }
        return true;
      });
      score += Math.round(dt * 65); hud('score', formatScore(score));
      var hit = bags.some(function (b) {
        if (b.coin) return false;
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
    actions(function () { startGame('dodge'); }, function () { return score; }, '별 3개를 모으면 러기지 가 코인으로 바뀝니다. 코인을 먹으면 점수가 올라갑니다.');
    return { id: 'dodge', destroy: c.destroy };
  };

  games.suika = function () {
    var W = 420, H = 620, WALL = 22, LINE = 112;
    var TYPES = [
      { r: 16, color: '#f8c8c8' }, { r: 20, color: '#f4a7c3' }, { r: 24, color: '#f0dfa8' },
      { r: 30, color: '#c9e4a8' }, { r: 36, color: '#f4b183' }, { r: 44, color: '#e07a5f' },
      { r: 52, color: '#81b29a' }, { r: 62, color: '#3d5a80' }, { r: 74, color: '#ee6c4d' },
      { r: 88, color: '#98c1d9' }, { r: 102, color: '#2a9d8f' }
    ];
    var c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var fruits = [], score = 0, running = true, last = 0, aimX = W / 2, nextType = 0, cool = 0, overT = 0, holding = false;
    setHud([['점수', '0', 'score'], ['최고', formatScore(best('suika', name())), 'best']]);
    function rndNext() { return Math.min(4, (Math.random() * 3.4) | 0); }
    nextType = rndNext();
    function addFruit(x, y, type, vx, vy) {
      var t = TYPES[type];
      fruits.push({ x: x, y: y, vx: vx || 0, vy: vy || 0, type: type, r: t.r, dead: false, drop: false });
    }
    function pointer(e) {
      var r = cv.canvas.getBoundingClientRect();
      var x = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * W / r.width;
      aimX = Math.max(WALL + 18, Math.min(W - WALL - 18, x));
    }
    function drop() {
      if (!running || cool > 0 || holding) return;
      holding = true;
      var t = TYPES[nextType];
      addFruit(aimX, LINE - t.r - 6, nextType, 0, 20);
      fruits[fruits.length - 1].drop = true;
      nextType = rndNext();
      cool = 0.42;
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      if (cool > 0) cool -= dt;
      var i, j, f, g, k;
      for (k = 0; k < 3; k++) {
        for (i = 0; i < fruits.length; i++) {
          f = fruits[i];
          if (f.dead) continue;
          f.vy += 980 * dt / 3;
          f.x += f.vx * dt / 3;
          f.y += f.vy * dt / 3;
          f.vx *= 0.992;
          var left = WALL + f.r, right = W - WALL - f.r, bot = H - WALL - f.r;
          if (f.x < left) { f.x = left; f.vx = Math.abs(f.vx) * 0.28; }
          if (f.x > right) { f.x = right; f.vx = -Math.abs(f.vx) * 0.28; }
          if (f.y > bot) { f.y = bot; f.vy = 0; f.vx *= 0.9; f.drop = false; }
        }
        for (i = 0; i < fruits.length; i++) {
          f = fruits[i];
          if (f.dead) continue;
          for (j = i + 1; j < fruits.length; j++) {
            g = fruits[j];
            if (g.dead) continue;
            var dx = g.x - f.x, dy = g.y - f.y, dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
            var min = f.r + g.r;
            if (dist >= min) continue;
            if (f.type === g.type && f.type < TYPES.length - 1) {
              var nx = (f.x + g.x) / 2, ny = (f.y + g.y) / 2, nt = f.type + 1;
              f.dead = g.dead = true;
              addFruit(nx, ny, nt, (f.vx + g.vx) * 0.2, Math.min(0, (f.vy + g.vy) * 0.2));
              score += (nt + 1) * (nt + 1) * 8;
              hud('score', formatScore(score));
              fx.burst(nx, ny, TYPES[nt].color, 10, 180);
              floatScore(nx, ny - 10, '+' + ((nt + 1) * (nt + 1) * 8), refs.stage);
              continue;
            }
            var ox = dx / dist, oy = dy / dist, push = (min - dist) / 2;
            f.x -= ox * push; f.y -= oy * push;
            g.x += ox * push; g.y += oy * push;
            var rel = (g.vx - f.vx) * ox + (g.vy - f.vy) * oy;
            if (rel < 0) {
              f.vx += ox * rel; f.vy += oy * rel;
              g.vx -= ox * rel; g.vy -= oy * rel;
            }
            f.drop = g.drop = false;
          }
        }
      }
      fruits = fruits.filter(function (x) { return !x.dead; });
      if (!fruits.some(function (x) { return x.drop; })) holding = false;
      var danger = fruits.some(function (x) { return !x.drop && x.y - x.r < LINE && Math.abs(x.vy) < 28; });
      if (danger) overT += dt; else overT = 0;
      if (overT > 1.15) {
        running = false;
        gameOver('미니바 가득', formatScore(score) + '점', function () { startGame('suika'); }, score);
        return;
      }
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#122a2d'; ctx.fillRect(0, 0, WALL, H); ctx.fillRect(W - WALL, 0, WALL, H); ctx.fillRect(0, H - WALL, W, WALL);
      ctx.strokeStyle = '#ef535088'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(WALL, LINE); ctx.lineTo(W - WALL, LINE); ctx.stroke(); ctx.setLineDash([]);
      if (!holding && cool <= 0) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = TYPES[nextType].color;
        ctx.beginPath(); ctx.arc(aimX, LINE - 18, TYPES[nextType].r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      fruits.forEach(function (x) {
        ctx.fillStyle = TYPES[x.type].color;
        ctx.beginPath(); ctx.arc(x.x, x.y, x.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath(); ctx.arc(x.x - x.r * 0.28, x.y - x.r * 0.28, x.r * 0.28, 0, Math.PI * 2); ctx.fill();
      });
      fx.draw(ctx);
      c.raf(loop);
    }
    c.on(cv.canvas, 'pointermove', pointer);
    c.on(cv.canvas, 'pointerdown', function (e) { e.preventDefault(); pointer(e); drop(); });
    c.on(document, 'keydown', function (e) { if (e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); drop(); } });
    c.raf(loop);
    actions(function () { startGame('suika'); }, function () { return score; }, '클릭으로 과일을 떨어뜨려 같은 것끼리 붙이세요. 빨간 선 위로 쌓이면 종료.');
    return { id: 'suika', destroy: c.destroy };
  };

  games.stack = function () {
    var W = 420, H = 620, c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var layers = [], score = 0, combo = 0, running = true, last = 0, cam = 0;
    var cur = { x: 40, y: H - 90, w: 220, h: 22, dir: 1, spd: 210 };
    layers.push({ x: 100, y: H - 68, w: 220, h: 22 });
    setHud([['층', '0', 'score'], ['콤보', '0', 'combo'], ['최고', formatScore(best('stack', name())), 'best']]);
    function hue(i) { return 'hsl(' + ((42 + i * 17) % 360) + ' 62% 62%)'; }
    function drop() {
      if (!running) return;
      var base = layers[layers.length - 1];
      var left = Math.max(cur.x, base.x);
      var right = Math.min(cur.x + cur.w, base.x + base.w);
      var ov = right - left;
      if (ov < 8) {
        running = false;
        shakeStage();
        gameOver('타월이 무너졌어요', score + '층', function () { startGame('stack'); }, score);
        return;
      }
      var perfect = Math.abs(ov - base.w) < 6;
      if (perfect) { combo++; ov = base.w; left = base.x; score += 2; floatScore(W / 2, 80, 'PERFECT', refs.stage); }
      else { combo = 0; score += 1; }
      layers.push({ x: left, y: base.y - 22, w: ov, h: 22 });
      cur = { x: 16, y: base.y - 44, w: ov, h: 22, dir: layers.length % 2 ? 1 : -1, spd: 200 + Math.min(260, score * 9) };
      cam = Math.max(0, (H - 120) - (base.y - 44));
      hud('score', score); hud('combo', combo);
      fx.burst(left + ov / 2, base.y - 10, '#efd28a', 8, 140);
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      cur.x += cur.dir * cur.spd * dt;
      if (cur.x <= WALL_PAD()) { cur.x = WALL_PAD(); cur.dir = 1; }
      if (cur.x + cur.w >= W - WALL_PAD()) { cur.x = W - WALL_PAD() - cur.w; cur.dir = -1; }
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(0, cam);
      layers.forEach(function (L, i) {
        ctx.fillStyle = hue(i);
        ctx.beginPath(); ctx.roundRect(L.x, L.y, L.w, L.h, 5); ctx.fill();
      });
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath(); ctx.roundRect(cur.x, cur.y, cur.w, cur.h, 5); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      fx.draw(ctx);
      c.raf(loop);
    }
    function WALL_PAD() { return 18; }
    c.on(cv.canvas, 'pointerdown', function (e) { e.preventDefault(); drop(); });
    c.on(document, 'keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); drop(); } });
    c.raf(loop);
    actions(function () { startGame('stack'); }, function () { return score; }, '클릭 또는 Space로 타월을 쌓으세요. 정확히 맞추면 PERFECT.');
    return { id: 'stack', destroy: c.destroy };
  };

  games.crossy = function () {
    var COLS = 11, CELL = 38, W = COLS * CELL, VIEW = 16, H = VIEW * CELL;
    var c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var px = 5, py = 0, hop = 0, hx = 5, hy = 0, score = 0, bestRow = 0, running = true, last = 0, world = [];
    setHud([['건너기', '0', 'score'], ['최고', formatScore(best('crossy', name())), 'best']]);
    function laneType(row) {
      if (row < 3) return 'lobby';
      var m = row % 7;
      if (m === 0) return 'lobby';
      if (m === 3) return 'cart';
      return 'road';
    }
    function ensure(row) {
      while (world.length <= row + 18) {
        var r = world.length;
        var kind = laneType(r);
        var cars = [];
        if (kind !== 'lobby') {
          var n = 1 + ((r / 9) | 0) % 3;
          var dir = r % 2 ? 1 : -1;
          var spd = (70 + (r % 5) * 18 + Math.min(90, r * 1.6)) * dir;
          for (var i = 0; i < n; i++) cars.push({ x: Math.random() * W, w: kind === 'cart' ? 52 : 44, spd: spd });
        }
        world.push({ kind: kind, cars: cars });
      }
    }
    ensure(20);
    function tryHop(dx, dy) {
      if (!running || hop > 0) return;
      var nx = px + dx, ny = py + dy;
      if (nx < 0 || nx >= COLS || ny < 0) return;
      hop = 1; hx = nx; hy = ny;
    }
    function hitCars(cx, cy) {
      var lane = world[cy];
      if (!lane || lane.kind === 'lobby') return false;
      var x = cx * CELL + CELL / 2, pad = 12;
      return lane.cars.some(function (car) {
        return x > car.x - pad && x < car.x + car.w + pad;
      });
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      ensure(py + 20);
      world.forEach(function (lane) {
        lane.cars.forEach(function (car) {
          car.x += car.spd * dt;
          if (car.spd > 0 && car.x > W + 80) car.x = -car.w - 20;
          if (car.spd < 0 && car.x < -80) car.x = W + 20;
        });
      });
      if (hop > 0) {
        hop -= dt * 7.2;
        if (hop <= 0) {
          hop = 0; px = hx; py = hy;
          if (py > bestRow) { bestRow = py; score = bestRow; hud('score', score); }
          if (hitCars(px, py)) {
            running = false;
            gameOver('부딪혔어요', score + '칸 전진', function () { startGame('crossy'); }, score);
            return;
          }
        }
      } else if (hitCars(px, py)) {
        running = false;
        gameOver('부딪혔어요', score + '칸 전진', function () { startGame('crossy'); }, score);
        return;
      }
      var camY = Math.max(0, (py - 3) * CELL);
      var drawY = hop > 0 ? py + (hy - py) * (1 - hop) : py;
      var drawX = hop > 0 ? px + (hx - px) * (1 - hop) : px;
      function rowY(row) { return H - (row + 1) * CELL + camY; }
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, W, H);
      for (var row = 0; row < world.length; row++) {
        var y = rowY(row);
        if (y < -CELL || y > H) continue;
        var lane = world[row];
        ctx.fillStyle = lane.kind === 'lobby' ? '#12343a' : lane.kind === 'cart' ? '#1b3340' : '#1a2a30';
        ctx.fillRect(0, y, W, CELL);
        if (lane.kind !== 'lobby') {
          ctx.fillStyle = '#efd28a33';
          ctx.fillRect(0, y + CELL / 2 - 1, W, 2);
        }
        lane.cars.forEach(function (car) {
          ctx.fillStyle = lane.kind === 'cart' ? '#c9a06a' : '#d97b6a';
          ctx.beginPath(); ctx.roundRect(car.x, y + 7, car.w, CELL - 14, 6); ctx.fill();
        });
      }
      drawHeroShape(ctx, drawX * CELL + 6, rowY(drawY) + 5, CELL - 12, CELL - 10, { radius: 8, font: 10 });
      fx.draw(ctx);
      c.raf(loop);
    }
    function key(e) {
      var map = { ArrowUp: [0, 1], w: [0, 1], W: [0, 1], ArrowDown: [0, -1], s: [0, -1], S: [0, -1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
      var d = map[e.key]; if (!d) return; e.preventDefault(); tryHop(d[0], d[1]);
    }
    c.on(document, 'keydown', key);
    c.on(cv.canvas, 'pointerdown', function (e) {
      e.preventDefault();
      var r = cv.canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      var cam = Math.max(0, (py - 3) * CELL);
      var cx = (px + 0.5) * CELL, cy = H - (py + 0.5) * CELL + cam;
      var dx = x - cx, dy = y - cy;
      if (Math.abs(dy) > Math.abs(dx)) tryHop(0, dy < 0 ? 1 : -1);
      else tryHop(dx < 0 ? -1 : 1, 0);
    });
    c.raf(loop);
    actions(function () { startGame('crossy'); }, function () { return score; }, '방향키·WASD 또는 화면 탭으로 한 칸씩 건너세요. 위가 전진입니다.');
    return { id: 'crossy', destroy: c.destroy };
  };

  games.simon = function () {
    var W = 420, H = 420, c = controller(), cv = canvasBase(W, H), ctx = cv.ctx;
    var pads = [
      { x: 40, y: 40, color: '#d97b6a', lit: '#ffb4a8', key: '1' },
      { x: 230, y: 40, color: '#3d9b8f', lit: '#8ee0d3', key: '2' },
      { x: 40, y: 230, color: '#c9a06a', lit: '#efd28a', key: '3' },
      { x: 230, y: 230, color: '#4c7bd9', lit: '#9bb6ff', key: '4' }
    ];
    var seq = [], step = 0, mode = 'watch', flash = -1, flashT = 0, playI = 0, score = 0, running = true, last = 0, wait = 0.55;
    setHud([['라운드', '0', 'score'], ['최고', formatScore(best('simon', name())), 'best']]);
    function addStep() {
      seq.push((Math.random() * 4) | 0);
      step = 0; mode = 'watch'; playI = -1; wait = 0.42; hud('score', seq.length);
    }
    addStep();
    function press(i) {
      if (!running || mode !== 'input') return;
      flash = i; flashT = 0.18;
      if (i !== seq[step]) {
        running = false;
        gameOver('순서 틀림', seq.length - 1 + '라운드', function () { startGame('simon'); }, Math.max(0, seq.length - 1));
        return;
      }
      step++;
      score = seq.length;
      if (step >= seq.length) {
        score = seq.length;
        hud('score', score);
        mode = 'wait';
        c.timer(addStep, 520);
      }
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t;
      if (flashT > 0) flashT -= dt; else flash = -1;
      if (mode === 'watch') {
        wait -= dt;
        if (wait <= 0) {
          playI++;
          if (playI >= seq.length) { mode = 'input'; step = 0; }
          else { flash = seq[playI]; flashT = Math.max(0.18, 0.42 - seq.length * 0.012); wait = flashT + 0.12; }
        }
      }
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, W, H);
      pads.forEach(function (p, i) {
        ctx.fillStyle = flash === i ? p.lit : p.color;
        ctx.beginPath(); ctx.roundRect(p.x, p.y, 150, 150, 22); ctx.fill();
        ctx.fillStyle = '#122'; ctx.font = '700 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.key, p.x + 75, p.y + 75);
      });
      ctx.fillStyle = '#efd28a'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(mode === 'watch' ? '기억하세요' : '따라 누르세요', W / 2, H - 16);
      c.raf(loop);
    }
    c.on(cv.canvas, 'pointerdown', function (e) {
      e.preventDefault();
      var r = cv.canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      pads.forEach(function (p, i) {
        if (x >= p.x && x <= p.x + 150 && y >= p.y && y <= p.y + 150) press(i);
      });
    });
    c.on(document, 'keydown', function (e) {
      var n = ({ '1': 0, '2': 1, '3': 2, '4': 3 })[e.key];
      if (n == null) return; e.preventDefault(); press(n);
    });
    c.raf(loop);
    actions(function () { startGame('simon'); }, function () { return score; }, '종 순서를 외운 뒤 클릭 또는 1·2·3·4 키로 따라 누르세요.');
    return { id: 'simon', destroy: c.destroy };
  };

  games.cleanroute = function () {
    var MAP = [
      '###################',
      '#........#........#',
      '#o##.###.#.###.##o#',
      '#.................#',
      '###.#.#####.#.#####',
      '#...#...#...#.....#',
      '#.##.##.#.##.##.#.#',
      '#........G........#',
      '#.##.##.#.##.##.#.#',
      '#...#...#...#.....#',
      '###.#.#####.#.#####',
      '#.................#',
      '#o##.###.#.###.##o#',
      '#........#........#',
      '###################'
    ];
    var ROWS = MAP.length, COLS = MAP[0].length, CELL = 24, W = COLS * CELL, H = ROWS * CELL;
    var c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var tiles = MAP.map(function (row) { return row.split(''); });
    tiles.forEach(function (row) {
      for (var i = 0; i < row.length; i++) if (row[i] === 'G') row[i] = ' ';
    });
    var px = 1, py = 7, ax = 1, ay = 7, moving = false, tx = 1, ty = 7, wantX = 0, wantY = 0;
    var ghosts = [
      { x: 9, y: 7, ax: 9, ay: 7, tx: 9, ty: 7, moving: false, color: '#ef5350' },
      { x: 17, y: 7, ax: 17, ay: 7, tx: 17, ty: 7, moving: false, color: '#55a9e8' }
    ];
    var score = 0, dots = 0, power = 0, running = true, last = 0, lives = 3, touch0 = null;
    tiles.forEach(function (row) { row.forEach(function (ch) { if (ch === '.' || ch === 'o') dots++; }); });
    setHud([['점수', '0', 'score'], ['목숨', '3', 'lives'], ['최고', formatScore(best('cleanroute', name())), 'best']]);
    function wall(x, y) {
      if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return true;
      return tiles[y][x] === '#';
    }
    function setWant(dx, dy) { wantX = dx; wantY = dy; }
    function stepTile(ent, spd, dt) {
      if (!ent.moving) {
        var dx = ent.wantX, dy = ent.wantY;
        if ((dx || dy) && !wall(ent.x + dx, ent.y + dy)) {
          ent.tx = ent.x + dx; ent.ty = ent.y + dy; ent.moving = true;
        }
      }
      if (!ent.moving) return;
      var ddx = ent.tx - ent.ax, ddy = ent.ty - ent.ay, dist = Math.hypot(ddx, ddy);
      if (dist < 0.06) {
        ent.ax = ent.tx; ent.ay = ent.ty; ent.x = ent.tx; ent.y = ent.ty; ent.moving = false;
        return;
      }
      var step = Math.min(dist, spd * dt);
      ent.ax += (ddx / dist) * step;
      ent.ay += (ddy / dist) * step;
    }
    function eatAt(cx, cy) {
      if (!tiles[cy] || (tiles[cy][cx] !== '.' && tiles[cy][cx] !== 'o')) return;
      if (tiles[cy][cx] === 'o') { power = 6; score += 40; }
      else score += 10;
      tiles[cy][cx] = ' ';
      dots--;
      hud('score', formatScore(score));
      if (dots <= 0) {
        running = false;
        gameOver('복도 완료', formatScore(score) + '점', function () { startGame('cleanroute'); }, score);
      }
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      if (power > 0) power -= dt;
      var player = { x: px, y: py, ax: ax, ay: ay, tx: tx, ty: ty, moving: moving, wantX: wantX, wantY: wantY };
      stepTile(player, 7.2, dt);
      if (!player.moving && (wantX || wantY)) stepTile(player, 7.2, dt);
      px = player.x; py = player.y; ax = player.ax; ay = player.ay; tx = player.tx; ty = player.ty; moving = player.moving;
      eatAt(px, py);
      if (!running) return;
      ghosts.forEach(function (g) {
        if (!g.moving) {
          var opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) {
            return !wall(g.x + d[0], g.y + d[1]);
          });
          if (opts.length) {
            var chase = power > 0 ? -1 : 1;
            opts.sort(function (a, b) {
              var da = Math.abs(g.x + a[0] - px) + Math.abs(g.y + a[1] - py);
              var db = Math.abs(g.x + b[0] - px) + Math.abs(g.y + b[1] - py);
              return (da - db) * chase;
            });
            var pick = Math.random() < 0.72 ? opts[0] : opts[(Math.random() * opts.length) | 0];
            g.wantX = pick[0]; g.wantY = pick[1];
          }
        }
        stepTile(g, power > 0 ? 4.2 : 5.6, dt);
        if (Math.hypot(g.ax - ax, g.ay - ay) < 0.55) {
          if (power > 0) {
            score += 120; hud('score', formatScore(score));
            g.x = 9; g.y = 7; g.ax = 9; g.ay = 7; g.tx = 9; g.ty = 7; g.moving = false;
            fx.burst(ax * CELL, ay * CELL, '#efd28a', 10, 160);
          } else {
            lives--; hud('lives', lives);
            if (lives <= 0) {
              running = false;
              gameOver('컴플레인에 걸렸어요', formatScore(score) + '점', function () { startGame('cleanroute'); }, score);
              return;
            }
            px = 1; py = 7; ax = 1; ay = 7; tx = 1; ty = 7; moving = false;
            g.x = 9; g.y = 7; g.ax = 9; g.ay = 7; g.tx = 9; g.ty = 7; g.moving = false;
            shakeStage();
          }
        }
      });
      if (!running) return;
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, W, H);
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          var ch = tiles[y][x];
          if (ch === '#') {
            ctx.fillStyle = '#1f5650';
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          } else if (ch === '.') {
            ctx.fillStyle = '#f0dfa8';
            ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 2.4, 0, Math.PI * 2); ctx.fill();
          } else if (ch === 'o') {
            ctx.fillStyle = '#efd28a';
            ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      drawHeroShape(ctx, ax * CELL + 3, ay * CELL + 3, CELL - 6, CELL - 6, { radius: 8, font: 9 });
      ghosts.forEach(function (g) {
        ctx.fillStyle = power > 0 ? '#9bb6ff' : g.color;
        ctx.beginPath(); ctx.arc(g.ax * CELL + CELL / 2, g.ay * CELL + CELL / 2, 8, 0, Math.PI * 2); ctx.fill();
      });
      fx.draw(ctx);
      c.raf(loop);
    }
    function applyKey(e) {
      var map = { ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0], ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1] };
      var d = map[e.key]; if (!d) return; e.preventDefault(); setWant(d[0], d[1]);
    }
    c.on(document, 'keydown', applyKey, true);
    c.on(window, 'keydown', applyKey, true);
    function swipeFrom(dx, dy) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? 1 : -1, 0);
      else setWant(0, dy > 0 ? 1 : -1);
    }
    c.on(cv.canvas, 'pointerdown', function (e) {
      e.preventDefault();
      touch0 = [e.clientX, e.clientY];
      var r = cv.canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      var dx = x - (ax * CELL + CELL / 2), dy = y - (ay * CELL + CELL / 2);
      if (Math.hypot(dx, dy) > 10) {
        if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? 1 : -1, 0);
        else setWant(0, dy > 0 ? 1 : -1);
      }
    });
    c.on(window, 'pointerup', function (e) {
      if (!touch0) return;
      swipeFrom(e.clientX - touch0[0], e.clientY - touch0[1]);
      touch0 = null;
    });
    var pad = el('div', 'hkg-dpad',
      '<i></i><button type="button" data-dx="0" data-dy="-1">▲</button><i></i>' +
      '<button type="button" data-dx="-1" data-dy="0">◀</button>' +
      '<button type="button" data-dx="0" data-dy="1">▼</button>' +
      '<button type="button" data-dx="1" data-dy="0">▶</button>');
    refs.stage.appendChild(pad);
    Array.prototype.forEach.call(pad.querySelectorAll('button'), function (btn) {
      var press = function (e) {
        e.preventDefault();
        setWant(Number(btn.getAttribute('data-dx')), Number(btn.getAttribute('data-dy')));
      };
      c.on(btn, 'pointerdown', press);
    });
    c.raf(loop);
    actions(function () { startGame('cleanroute'); }, function () { return score; }, 'WASD·방향키·화면 스와이프·아래 패드로 먼지를 쓸세요. 큰 점은 잠시 컴플레인을 밀어냅니다.');
    return { id: 'cleanroute', destroy: c.destroy };
  };

  games.invaders = function () {
    var W = 480, H = 560, c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var player = { x: 210, y: 512, w: 54, h: 22 }, keys = {}, shots = [], aliens = [], score = 0, lives = 3, running = true, last = 0, dir = 1, acc = 0, cool = 0;
    setHud([['점수', '0', 'score'], ['목숨', '3', 'lives'], ['최고', formatScore(best('invaders', name())), 'best']]);
    function spawn() {
      aliens = [];
      for (var r = 0; r < 4; r++) for (var col = 0; col < 8; col++) {
        aliens.push({ x: 46 + col * 48, y: 46 + r * 40, w: 32, h: 22, alive: true });
      }
      dir = 1;
    }
    spawn();
    function fire() {
      if (cool > 0 || !running) return;
      cool = 0.28;
      shots.push({ x: player.x + player.w / 2, y: player.y, vy: -420, from: 'p' });
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      if (cool > 0) cool -= dt;
      var steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      player.x = Math.max(8, Math.min(W - player.w - 8, player.x + steer * 310 * dt));
      if (keys[' '] || keys.ArrowUp) fire();
      acc += dt;
      var step = Math.max(0.28, 0.72 - (32 - aliens.filter(function (a) { return a.alive; }).length) * 0.012);
      var edge = false;
      if (acc >= step) {
        acc = 0;
        aliens.forEach(function (a) { if (a.alive) { a.x += dir * 16; if (a.x < 12 || a.x + a.w > W - 12) edge = true; } });
        if (edge) {
          dir *= -1;
          aliens.forEach(function (a) { if (a.alive) { a.x += dir * 16; a.y += 18; } });
        }
      }
      if (Math.random() < 0.012) {
        var shooters = aliens.filter(function (a) { return a.alive; });
        if (shooters.length) {
          var s = shooters[(Math.random() * shooters.length) | 0];
          shots.push({ x: s.x + s.w / 2, y: s.y + s.h, vy: 220, from: 'a' });
        }
      }
      shots.forEach(function (b) { b.y += b.vy * dt; });
      shots = shots.filter(function (b) { return b.y > -20 && b.y < H + 20; });
      shots.forEach(function (b) {
        if (b.from === 'p') {
          aliens.forEach(function (a) {
            if (!a.alive) return;
            if (b.x > a.x && b.x < a.x + a.w && b.y > a.y && b.y < a.y + a.h) {
              a.alive = false; b.y = -99; score += 25; hud('score', formatScore(score)); fx.burst(a.x + 16, a.y + 10, '#ef5350', 8, 140);
            }
          });
        } else if (b.x > player.x && b.x < player.x + player.w && b.y > player.y && b.y < player.y + player.h) {
          b.y = H + 99; lives--; hud('lives', lives); shakeStage();
          if (lives <= 0) {
            running = false;
            gameOver('컴플레인 폭주', formatScore(score) + '점', function () { startGame('invaders'); }, score);
          }
        }
      });
      if (!running) return;
      if (!aliens.some(function (a) { return a.alive; })) {
        score += 150; hud('score', formatScore(score)); spawn();
      }
      if (aliens.some(function (a) { return a.alive && a.y + a.h >= player.y; })) {
        running = false;
        gameOver('로비 점령', formatScore(score) + '점', function () { startGame('invaders'); }, score);
        return;
      }
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, W, H);
      aliens.forEach(function (a) {
        if (!a.alive) return;
        ctx.fillStyle = '#d97b6a';
        ctx.beginPath(); ctx.roundRect(a.x, a.y, a.w, a.h, 5); ctx.fill();
        ctx.fillStyle = '#122'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', a.x + a.w / 2, a.y + 16);
      });
      drawHeroShape(ctx, player.x, player.y, player.w, player.h, { radius: 6, font: 10 });
      shots.forEach(function (b) {
        ctx.fillStyle = b.from === 'p' ? '#efd28a' : '#ef5350';
        ctx.fillRect(b.x - 2, b.y - 8, 4, 10);
      });
      fx.draw(ctx);
      c.raf(loop);
    }
    function key(e) {
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D', ' ', 'ArrowUp'].indexOf(e.key) < 0) return;
      e.preventDefault();
      keys[e.key] = e.type === 'keydown';
      if (e.key === 'a' || e.key === 'A') keys.a = e.type === 'keydown';
      if (e.key === 'd' || e.key === 'D') keys.d = e.type === 'keydown';
    }
    c.on(document, 'keydown', key); c.on(document, 'keyup', key);
    c.on(cv.canvas, 'pointermove', function (e) {
      var r = cv.canvas.getBoundingClientRect();
      player.x = Math.max(8, Math.min(W - player.w - 8, (e.clientX - r.left) * W / r.width - player.w / 2));
    });
    c.on(cv.canvas, 'pointerdown', function (e) { e.preventDefault(); fire(); });
    c.raf(loop);
    actions(function () { startGame('invaders'); }, function () { return score; }, '←→ 또는 마우스로 이동, Space·클릭으로 컴플레인을 격추하세요.');
    return { id: 'invaders', destroy: c.destroy };
  };

  games.putting = function () {
    var W = 420, H = 620, HOLES = 18, c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    function mulberry(seed) {
      var s = seed | 0;
      return function () {
        s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function hitsRect(x, y, r, rect) {
      var nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
      var ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
      return Math.hypot(x - nx, y - ny) < r;
    }
    function addRect(list, x, y, w, h, ball, hole, pad) {
      x = Math.max(12, Math.min(W - 12 - w, x));
      y = Math.max(12, Math.min(H - 12 - h, y));
      var rect = { x: x, y: y, w: Math.max(16, w), h: Math.max(16, h) };
      if (hitsRect(ball[0], ball[1], pad, rect) || hitsRect(hole[0], hole[1], pad, rect)) return false;
      list.push(rect);
      return true;
    }
    function makeHole(i, rand) {
      var t = i / (HOLES - 1);
      var par = t < 0.18 ? 2 : t < 0.45 ? 3 : t < 0.72 ? 4 : 5;
      var holeR = Math.max(8, Math.round(15 - t * 6.5));
      var ball = [40 + rand() * (W - 80), 508 + rand() * 72];
      var hole = [40 + rand() * (W - 80), 48 + rand() * (70 + t * 50)];
      if (Math.abs(hole[0] - ball[0]) < 70 + t * 40) hole[0] = hole[0] < W / 2 ? Math.min(W - 40, hole[0] + 110) : Math.max(40, hole[0] - 110);
      var walls = [], sands = [], waters = [];
      var kind = (i + Math.floor(rand() * 7)) % 6;
      var nWall = 1 + Math.floor(t * 6 + rand() * 1.8);
      var j;
      if (kind === 0) {
        for (j = 0; j < nWall; j++) addRect(walls, 24 + rand() * 220, 140 + j * (70 - t * 8) + rand() * 20, 90 + rand() * (80 + t * 40), 18 + t * 8, ball, hole, 26);
      } else if (kind === 1) {
        for (j = 0; j < nWall; j++) addRect(walls, 70 + (j % 2) * 160 + rand() * 30, 110 + j * 72, 20 + t * 8, 90 + rand() * 70, ball, hole, 26);
      } else if (kind === 2) {
        for (j = 0; j < nWall; j++) {
          addRect(walls, 40 + rand() * 240, 160 + j * 80, 140 + rand() * 80, 20, ball, hole, 26);
          addRect(walls, 40 + rand() * 280, 160 + j * 80, 20, 70 + rand() * 50, ball, hole, 26);
        }
      } else if (kind === 3) {
        addRect(walls, 20, 200 + rand() * 40, 250 + t * 40, 22, ball, hole, 28);
        addRect(walls, 150 - t * 20, 340 + rand() * 30, 250, 22, ball, hole, 28);
        if (t > 0.35) addRect(walls, 180 + rand() * 40, 120, 22, 140 + t * 40, ball, hole, 26);
      } else if (kind === 4) {
        for (j = 0; j < 2 + Math.floor(t * 4); j++) addRect(walls, 50 + rand() * 280, 110 + rand() * 360, 36 + rand() * 40, 36 + rand() * 40, ball, hole, 28);
      } else {
        addRect(walls, ball[0] < W / 2 ? 0 : 220, 380, 210, 24, ball, hole, 28);
        addRect(walls, hole[0] < W / 2 ? 210 : 0, 170, 210, 24, ball, hole, 28);
        if (t > 0.4) addRect(walls, 190, 240, 22, 120 + t * 40, ball, hole, 24);
      }
      var nSand = Math.floor(t * 2.6 + rand() * 1.2);
      for (j = 0; j < nSand; j++) addRect(sands, 40 + rand() * 280, 120 + rand() * 340, 50 + rand() * 40, 28 + rand() * 18, ball, hole, 30);
      if (t > 0.32) {
        var nWater = 1 + (t > 0.7 && rand() > 0.4 ? 1 : 0);
        for (j = 0; j < nWater; j++) addRect(waters, 30 + rand() * 260, 100 + rand() * 300, 70 + rand() * 50, 26 + rand() * 16, ball, hole, 32);
      }
      return { ball: ball, hole: hole, par: par, holeR: holeR, walls: walls, sands: sands, waters: waters };
    }
    var rand = mulberry((Date.now() ^ (Math.random() * 1e9)) | 0);
    var holes = [];
    for (var n = 0; n < HOLES; n++) holes.push(makeHole(n, rand));
    var hi = 0, strokes = 0, total = 0, running = true, last = 0, ball, hole, walls, sands, waters, charging = false, power = 0, aim = { x: 0, y: -1 }, tee, maxStrokes;
    setHud([['홀', '1/18', 'hole'], ['타수', '0', 'strokes'], ['점수', '0', 'score']]);
    function loadHole() {
      var h = holes[hi];
      tee = { x: h.ball[0], y: h.ball[1] };
      ball = { x: h.ball[0], y: h.ball[1], vx: 0, vy: 0, r: 9 };
      hole = { x: h.hole[0], y: h.hole[1], r: h.holeR };
      walls = h.walls; sands = h.sands || []; waters = h.waters || [];
      strokes = 0; charging = false; power = 0;
      maxStrokes = h.par + 5;
      hud('hole', (hi + 1) + '/18'); hud('strokes', 0);
    }
    loadHole();
    function moving() { return Math.hypot(ball.vx, ball.vy) > 8; }
    function inHaz(list) {
      for (var i = 0; i < list.length; i++) if (hitsRect(ball.x, ball.y, ball.r - 2, list[i])) return true;
      return false;
    }
    function aimAt(e) {
      var r = cv.canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      var dx = x - ball.x, dy = y - ball.y, mag = Math.hypot(dx, dy) || 1;
      aim.x = dx / mag; aim.y = dy / mag;
    }
    function bounceWalls() {
      walls.forEach(function (w) {
        var nx = Math.max(w.x, Math.min(ball.x, w.x + w.w));
        var ny = Math.max(w.y, Math.min(ball.y, w.y + w.h));
        var dx = ball.x - nx, dy = ball.y - ny, d = Math.hypot(dx, dy);
        if (d < ball.r && d > 0) {
          var ox = dx / d, oy = dy / d;
          ball.x = nx + ox * ball.r; ball.y = ny + oy * ball.r;
          var rel = ball.vx * ox + ball.vy * oy;
          if (rel < 0) { ball.vx -= 1.7 * rel * ox; ball.vy -= 1.7 * rel * oy; }
        }
      });
      if (ball.x < ball.r || ball.x > W - ball.r) { ball.vx *= -0.85; ball.x = Math.max(ball.r, Math.min(W - ball.r, ball.x)); }
      if (ball.y < ball.r || ball.y > H - ball.r) { ball.vy *= -0.85; ball.y = Math.max(ball.r, Math.min(H - ball.r, ball.y)); }
    }
    function nextHole() {
      var par = holes[hi].par;
      var gained = Math.max(10, (par - strokes + 4) * 25);
      total += gained; hud('score', formatScore(total));
      floatScore(ball.x, ball.y - 16, '+' + gained, refs.stage);
      hi++;
      if (hi >= holes.length) {
        running = false;
        gameOver('18홀 종료', formatScore(total) + '점', function () { startGame('putting'); }, total);
        return;
      }
      loadHole();
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      if (charging && !moving()) power = Math.min(1, power + dt * 0.9);
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      var damp = inHaz(sands) ? 0.94 : 0.985;
      ball.vx *= Math.pow(damp, dt * 60); ball.vy *= Math.pow(damp, dt * 60);
      if (Math.hypot(ball.vx, ball.vy) < 8) { ball.vx = 0; ball.vy = 0; }
      bounceWalls();
      if (inHaz(waters) && Math.hypot(ball.vx, ball.vy) > 4) {
        fx.burst(ball.x, ball.y, '#6ec8ff', 10, 140);
        ball.x = tee.x; ball.y = tee.y; ball.vx = 0; ball.vy = 0;
        strokes++; hud('strokes', strokes);
        if (strokes >= maxStrokes) nextHole();
        if (!running) return;
      }
      var dist = Math.hypot(ball.x - hole.x, ball.y - hole.y);
      if (dist < hole.r - 2 && Math.hypot(ball.vx, ball.vy) < 90) {
        fx.burst(hole.x, hole.y, '#efd28a', 12, 160);
        nextHole();
        if (!running) return;
      }
      ctx.fillStyle = '#0d3b32'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0a2f28';
      for (var g = 0; g < 12; g++) ctx.fillRect(0, g * 54, W, 2);
      sands.forEach(function (s) { ctx.fillStyle = '#c4a35a'; ctx.fillRect(s.x, s.y, s.w, s.h); });
      waters.forEach(function (w) { ctx.fillStyle = '#1a6a88'; ctx.fillRect(w.x, w.y, w.w, w.h); });
      walls.forEach(function (w) { ctx.fillStyle = '#1f5650'; ctx.fillRect(w.x, w.y, w.w, w.h); });
      ctx.fillStyle = '#123'; ctx.beginPath(); ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#efd28a'; ctx.beginPath(); ctx.arc(hole.x, hole.y, hole.r + 2, 0, Math.PI * 2); ctx.stroke();
      if (!moving()) {
        ctx.strokeStyle = '#fff6dc88'; ctx.beginPath();
        ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x + aim.x * (40 + power * 90), ball.y + aim.y * (40 + power * 90)); ctx.stroke();
      }
      ctx.fillStyle = '#f5f0df'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
      if (charging) {
        ctx.fillStyle = '#122a2d'; ctx.fillRect(24, H - 28, W - 48, 10);
        ctx.fillStyle = '#efd28a'; ctx.fillRect(24, H - 28, (W - 48) * power, 10);
      }
      ctx.fillStyle = '#efd28acc'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('Par ' + holes[hi].par + ' · ' + (hi + 1) + '/18', 16, 20);
      fx.draw(ctx);
      c.raf(loop);
    }
    c.on(cv.canvas, 'pointermove', function (e) { if (!moving()) aimAt(e); });
    c.on(cv.canvas, 'pointerdown', function (e) {
      e.preventDefault();
      if (moving()) return;
      aimAt(e); charging = true; power = 0.12;
    });
    c.on(window, 'pointerup', function () {
      if (!charging || !running) return;
      charging = false;
      var p = 90 + power * 520;
      ball.vx = aim.x * p; ball.vy = aim.y * p;
      strokes++; hud('strokes', strokes);
      power = 0;
      if (strokes >= maxStrokes) nextHole();
    });
    c.raf(loop);
    actions(function () { startGame('putting'); }, function () { return total; }, '조준 후 누르고 있으면 힘이 찹니다. 떼서 퍼팅하세요. 18홀 · 맵은 매 라운드 랜덤 · 뒤로 갈수록 어렵습니다. 모래=감속, 물=티 리셋.');
    return { id: 'putting', destroy: c.destroy };
  };

  games.crossland = function () {
    var N = 9, CELL = 46, PAD = 18, W = PAD * 2 + N * CELL, H = PAD * 2 + N * CELL + 36;
    var PLUS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    var c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var board = [], hover = null, turn = 'me', running = true, last = 0, score = 0;
    setHud([['나', '0', 'me'], ['CPU', '0', 'cpu'], ['점수', '0', 'score'], ['최고', formatScore(best('crossland', name())), 'best']]);
    function emptyBoard() {
      board = [];
      for (var r = 0; r < N; r++) {
        board[r] = [];
        for (var col = 0; col < N; col++) board[r][col] = 0;
      }
    }
    function inb(r, col) { return r >= 0 && r < N && col >= 0 && col < N; }
    function cloneBoard(src) {
      return src.map(function (row) { return row.slice(); });
    }
    function applyPlus(src, r, col, who) {
      PLUS.forEach(function (d) {
        var nr = r + d[0], nc = col + d[1];
        if (inb(nr, nc)) src[nr][nc] = who;
      });
    }
    function counts(src) {
      var me = 0, cpu = 0, empty = 0;
      for (var r = 0; r < N; r++) for (var col = 0; col < N; col++) {
        if (src[r][col] === 1) me++;
        else if (src[r][col] === 2) cpu++;
        else empty++;
      }
      return { me: me, cpu: cpu, empty: empty };
    }
    function empties() {
      var list = [];
      for (var r = 0; r < N; r++) for (var col = 0; col < N; col++) {
        if (board[r][col] === 0) list.push({ r: r, c: col });
      }
      return list;
    }
    function syncHud() {
      var n = counts(board);
      score = n.me * 10 + Math.max(0, n.me - n.cpu) * 4;
      hud('me', n.me);
      hud('cpu', n.cpu);
      hud('score', formatScore(score));
      return n;
    }
    function finish() {
      if (!running) return;
      running = false;
      var n = syncHud();
      var title = n.me > n.cpu ? '구역 확보!' : n.me === n.cpu ? '무승부' : 'CPU 승리';
      gameOver(title, '나 ' + n.me + ' · CPU ' + n.cpu, function () { startGame('crossland'); }, score);
    }
    function cpuMove() {
      if (!running) return;
      var opts = empties();
      if (!opts.length) { finish(); return; }
      var bestList = [];
      var bestVal = -1e9;
      opts.forEach(function (p) {
        var next = cloneBoard(board);
        applyPlus(next, p.r, p.c, 2);
        var n = counts(next);
        var val = n.cpu * 3 - n.me * 2 + ((Math.abs(p.r - 4) + Math.abs(p.c - 4)) < 3 ? 1 : 0) + Math.random() * 0.3;
        if (val > bestVal + 0.01) { bestVal = val; bestList = [p]; }
        else if (Math.abs(val - bestVal) < 0.01) bestList.push(p);
      });
      var pick = bestList[(Math.random() * bestList.length) | 0] || opts[0];
      applyPlus(board, pick.r, pick.c, 2);
      fx.burst(PAD + pick.c * CELL + CELL / 2, PAD + pick.r * CELL + CELL / 2, '#d97b6a', 10, 150);
      var n = syncHud();
      if (!n.empty) { finish(); return; }
      turn = 'me';
    }
    function playAt(r, col) {
      if (!running || turn !== 'me') return;
      if (!inb(r, col) || board[r][col] !== 0) return;
      applyPlus(board, r, col, 1);
      fx.burst(PAD + col * CELL + CELL / 2, PAD + r * CELL + CELL / 2, '#efd28a', 10, 150);
      var n = syncHud();
      if (!n.empty) { finish(); return; }
      turn = 'cpu';
      c.timer(cpuMove, 280);
    }
    function cellAt(e) {
      var rect = cv.canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * W / rect.width - PAD;
      var y = (e.clientY - rect.top) * H / rect.height - PAD;
      var col = Math.floor(x / CELL), r = Math.floor(y / CELL);
      if (!inb(r, col)) return null;
      return { r: r, c: col };
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#efd28a'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(turn === 'cpu' ? 'CPU 차례' : '빈 칸을 눌러 십자로 차지하세요', W / 2, H - 14);
      var r, col, x, y, v;
      for (r = 0; r < N; r++) {
        for (col = 0; col < N; col++) {
          x = PAD + col * CELL; y = PAD + r * CELL;
          v = board[r][col];
          ctx.fillStyle = v === 1 ? '#d4b36a' : v === 2 ? '#c47b7b' : '#0e2a30';
          ctx.beginPath(); ctx.roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8); ctx.fill();
        }
      }
      if (turn === 'me' && hover && board[hover.r][hover.c] === 0) {
        PLUS.forEach(function (d) {
          var nr = hover.r + d[0], nc = hover.c + d[1];
          if (!inb(nr, nc)) return;
          ctx.fillStyle = 'rgba(239,210,138,0.32)';
          ctx.beginPath();
          ctx.roundRect(PAD + nc * CELL + 2, PAD + nr * CELL + 2, CELL - 4, CELL - 4, 8);
          ctx.fill();
        });
      }
      for (r = 0; r < N; r++) {
        for (col = 0; col < N; col++) {
          if (!board[r][col]) continue;
          ctx.fillStyle = board[r][col] === 1 ? '#1a302c' : '#fff6dc';
          ctx.font = '700 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(board[r][col] === 1 ? '나' : 'CPU', PAD + col * CELL + CELL / 2, PAD + r * CELL + CELL / 2);
        }
      }
      fx.draw(ctx);
      c.raf(loop);
    }
    c.on(cv.canvas, 'pointermove', function (e) { hover = cellAt(e); });
    c.on(cv.canvas, 'pointerleave', function () { hover = null; });
    c.on(cv.canvas, 'pointerdown', function (e) {
      e.preventDefault();
      var p = cellAt(e);
      if (p) playAt(p.r, p.c);
    });
    emptyBoard();
    syncHud();
    c.raf(loop);
    actions(function () { startGame('crossland'); }, function () { return score; }, '빈 칸을 누르면 그 칸과 상하좌우가 내 땅이 됩니다. CPU보다 칸을 많이 차지하세요.');
    return { id: 'crossland', destroy: c.destroy };
  };

  games.hotelshare = function () {
    var COLS = 80, ROWS = 56, CELL = 6, W = COLS * CELL, H = ROWS * CELL, GOAL = 80;
    var c = controller(), cv = canvasBase(W, H), ctx = cv.ctx, fx = makeFx();
    var art = document.createElement('canvas');
    art.width = W; art.height = H;
    var grid = [], trail = [], px, py, wantX = 0, wantY = 0, drawing = false;
    var enemies = [], lives = 3, stage = 1, score = 0, claimed = 0, total = COLS * ROWS;
    var running = true, last = 0, stepAcc = 0, invuln = 0, winFlash = 0, touch0 = null;
    setHud([['지분', '0%', 'pct'], ['목표', GOAL + '%', 'goal'], ['목숨', '3', 'lives'], ['단계', '1', 'stage'], ['점수', '0', 'score']]);
    function gget(x, y) { return grid[y] && grid[y][x]; }
    function gset(x, y, v) { if (grid[y]) grid[y][x] = v; }
    function inb(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
    function paintHotel(st) {
      var g = art.getContext('2d'), kind = (st - 1) % 5, i, x, y;
      var sky = [['#14343c', '#0b1c24'], ['#1a2848', '#0a1220'], ['#16384a', '#071820'], ['#3a2418', '#120c08'], ['#123830', '#071614']][kind];
      var lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, sky[0]); lg.addColorStop(1, sky[1]);
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      if (kind === 0) {
        g.fillStyle = '#1c4a46';
        g.fillRect(0, H * 0.58, W, H * 0.42);
        g.strokeStyle = '#cbb27055'; g.lineWidth = 2;
        for (i = 0; i < 12; i++) {
          g.beginPath(); g.moveTo(W / 2, H * 0.58); g.lineTo(i * W / 11, H); g.stroke();
        }
        g.fillStyle = '#0e2a30'; g.fillRect(W * 0.28, H * 0.62, W * 0.44, H * 0.22);
        g.fillStyle = '#d4b36a'; g.fillRect(W * 0.28, H * 0.62, W * 0.44, 8);
        g.fillStyle = '#efd28a'; g.font = 'bold 22px Georgia,serif'; g.textAlign = 'center';
        g.fillText('GRAND LOBBY', W / 2, H * 0.28);
        g.strokeStyle = '#ead18f88'; g.lineWidth = 1.5;
        for (i = 0; i < 5; i++) {
          g.beginPath(); g.arc(W / 2, H * 0.16, 8 + i * 10, 0, Math.PI * 2); g.stroke();
        }
        g.fillStyle = '#c5a96a';
        g.fillRect(70, 40, 22, H * 0.55); g.fillRect(W - 92, 40, 22, H * 0.55);
        g.fillStyle = '#9ae6b4'; g.beginPath(); g.arc(W / 2, H * 0.55, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1a302c'; g.font = 'bold 11px sans-serif'; g.fillText('🛎️', W / 2, H * 0.57);
      } else if (kind === 1) {
        g.fillStyle = '#0c1828'; g.fillRect(40, 36, W - 80, H * 0.5);
        for (i = 0; i < 40; i++) {
          g.fillStyle = 'rgba(239,210,138,' + (0.15 + Math.random() * 0.5) + ')';
          g.fillRect(50 + Math.random() * (W - 110), 46 + Math.random() * (H * 0.42), 3, 8);
        }
        g.fillStyle = '#6b4a2a'; g.fillRect(28, 28, 18, H * 0.56); g.fillRect(W - 46, 28, 18, H * 0.56);
        g.fillStyle = '#d4b36a'; g.fillRect(W * 0.18, H * 0.68, W * 0.64, H * 0.18);
        g.fillStyle = '#f5f0df'; g.fillRect(W * 0.22, H * 0.66, W * 0.28, 10);
        g.fillStyle = '#efd28a'; g.font = 'bold 20px Georgia,serif'; g.textAlign = 'center';
        g.fillText('SUITE NIGHT', W / 2, 28);
      } else if (kind === 2) {
        g.fillStyle = '#1a6a88'; g.fillRect(0, H * 0.62, W, H * 0.2);
        g.fillStyle = '#0d3b32'; g.fillRect(0, H * 0.8, W, H * 0.2);
        g.fillStyle = '#122030';
        g.beginPath(); g.moveTo(0, H * 0.62);
        for (i = 0; i < 10; i++) g.lineTo(i * W / 9, H * 0.42 - (i % 3) * 18);
        g.lineTo(W, H * 0.62); g.fill();
        g.fillStyle = '#efd28a'; g.font = 'bold 22px Georgia,serif'; g.textAlign = 'center';
        g.fillText('ROOFTOP', W / 2, H * 0.22);
        g.fillStyle = '#fff6dc'; g.font = '13px Georgia,serif'; g.fillText('SIGNIEL POOL', W / 2, H * 0.3);
      } else if (kind === 3) {
        g.fillStyle = '#2a1c12'; g.fillRect(0, H * 0.55, W, H * 0.45);
        for (i = 0; i < 6; i++) {
          x = 30 + i * 74; y = H * 0.58;
          g.fillStyle = '#5a3a22'; g.fillRect(x, y, 58, 36);
          g.fillStyle = ['#d87947', '#dfbf55', '#9fcbb0', '#efd28a'][i % 4];
          g.beginPath(); g.arc(x + 29, y + 8, 10, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#efd28a'; g.font = 'bold 22px Georgia,serif'; g.textAlign = 'center';
        g.fillText('BUFFET', W / 2, 48);
        g.fillStyle = '#f0dfa8';
        for (i = 0; i < 8; i++) { g.globalAlpha = 0.35; g.beginPath(); g.arc(40 + i * 55, 90, 16, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1;
      } else {
        g.fillStyle = '#0a4038'; g.beginPath(); g.ellipse(W / 2, H * 0.62, 150, 58, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1a6a88aa'; g.beginPath(); g.ellipse(W / 2, H * 0.6, 128, 44, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#efd28a'; g.font = 'bold 22px Georgia,serif'; g.textAlign = 'center';
        g.fillText('SPA & SAUNA', W / 2, 44);
        for (i = 0; i < 12; i++) {
          g.fillStyle = 'rgba(245,240,223,0.12)';
          g.beginPath(); g.arc(80 + (i * 29) % (W - 80), 70 + (i * 17) % 80, 18, 0, Math.PI * 2); g.fill();
        }
      }
      g.fillStyle = 'rgba(197,169,106,0.18)';
      g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
    }
    function countClaimed() {
      var n = 0, y, x;
      for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) if (grid[y][x] === 1) n++;
      return n;
    }
    function spawnEnemies() {
      var n = Math.min(5, 1 + Math.floor((stage - 1) / 1));
      var spd = 72 + stage * 16;
      enemies = [];
      var i, x, y, tries;
      for (i = 0; i < n; i++) {
        tries = 0;
        do {
          x = 8 + Math.random() * (COLS - 16);
          y = 8 + Math.random() * (ROWS - 16);
          tries++;
        } while (tries < 40 && gget(x | 0, y | 0) !== 0);
        var a = Math.random() * Math.PI * 2;
        enemies.push({ x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd });
      }
    }
    function resetField(keepScore) {
      var y, x;
      grid = [];
      for (y = 0; y < ROWS; y++) {
        grid[y] = [];
        for (x = 0; x < COLS; x++) grid[y][x] = (y === 0 || x === 0 || y === ROWS - 1 || x === COLS - 1) ? 1 : 0;
      }
      trail = []; drawing = false;
      px = (COLS / 2) | 0; py = ROWS - 1;
      wantX = 0; wantY = 0;
      claimed = countClaimed();
      paintHotel(stage);
      spawnEnemies();
      if (!keepScore) { }
      hud('pct', Math.floor(claimed * 100 / total) + '%');
      hud('stage', String(stage));
      hud('lives', String(lives));
      hud('score', formatScore(score));
    }
    function pct() { return claimed * 100 / total; }
    function floodKeep(sx, sy, keep) {
      if (!inb(sx, sy) || gget(sx, sy) !== 0 || keep[sy * COLS + sx]) return;
      var q = [sx, sy], qi = 0;
      keep[sy * COLS + sx] = 1;
      while (qi < q.length) {
        var x = q[qi++], y = q[qi++];
        var nbs = [x + 1, y, x - 1, y, x, y + 1, x, y - 1], i;
        for (i = 0; i < 8; i += 2) {
          var nx = nbs[i], ny = nbs[i + 1];
          if (!inb(nx, ny) || gget(nx, ny) !== 0 || keep[ny * COLS + nx]) continue;
          keep[ny * COLS + nx] = 1;
          q.push(nx, ny);
        }
      }
    }
    function closeTrail() {
      var i, x, y, gained = 0;
      for (i = 0; i < trail.length; i++) gset(trail[i][0], trail[i][1], 1);
      trail = [];
      drawing = false;
      var keep = new Uint8Array(COLS * ROWS);
      enemies.forEach(function (e) {
        floodKeep(e.x | 0, e.y | 0, keep);
      });
      for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
        if (gget(x, y) === 0 && !keep[y * COLS + x]) {
          gset(x, y, 1);
          gained++;
        }
      }
      claimed = countClaimed();
      var add = gained * 12 + Math.floor(gained * stage * 0.4);
      score += add;
      hud('score', formatScore(score));
      hud('pct', Math.floor(pct()) + '%');
      enemies.forEach(function (e) {
        if (gget(e.x | 0, e.y | 0) === 0) return;
        var t = 0, nx, ny;
        do {
          nx = 6 + Math.random() * (COLS - 12);
          ny = 6 + Math.random() * (ROWS - 12);
          t++;
        } while (t < 50 && gget(nx | 0, ny | 0) !== 0);
        e.x = nx; e.y = ny;
      });
      if (gained) fx.burst(px * CELL, py * CELL, '#efd28a', 12, 180);
      if (pct() >= GOAL) {
        var bonus = Math.round((pct() - GOAL) * 40) + stage * 200;
        score += bonus;
        hud('score', formatScore(score));
        winFlash = 0.9;
        stage++;
        c.timer(function () {
          if (!running) return;
          resetField(true);
        }, 700);
      }
    }
    function die() {
      if (invuln > 0) return;
      lives--;
      hud('lives', String(lives));
      shakeStage();
      fx.burst(px * CELL, py * CELL, '#ef5350', 14, 200);
      var i;
      for (i = 0; i < trail.length; i++) gset(trail[i][0], trail[i][1], 0);
      trail = []; drawing = false;
      px = (COLS / 2) | 0; py = ROWS - 1;
      wantX = 0; wantY = 0; invuln = 1.1;
      if (lives <= 0) {
        running = false;
        gameOver('지분 확보 실패', '단계 ' + stage + ' · ' + formatScore(score) + '점', function () { startGame('hotelshare'); }, score);
      }
    }
    function step(dx, dy) {
      if (!dx && !dy) return;
      var nx = px + dx, ny = py + dy;
      if (!inb(nx, ny)) return;
      var next = gget(nx, ny);
      if (drawing) {
        if (next === 2) { die(); return; }
        if (next === 1) {
          px = nx; py = ny;
          closeTrail();
          return;
        }
        gset(nx, ny, 2);
        trail.push([nx, ny]);
        px = nx; py = ny;
      } else {
        if (next === 1) { px = nx; py = ny; }
        else if (next === 0) {
          drawing = true;
          gset(nx, ny, 2);
          trail.push([nx, ny]);
          px = nx; py = ny;
        }
      }
    }
    function loop(t) {
      if (!running) return;
      var dt = frameDt(t, last); last = t; fx.update(dt);
      if (invuln > 0) invuln -= dt;
      if (winFlash > 0) winFlash -= dt;
      var spd = Math.max(0.038, 0.062 - stage * 0.003);
      stepAcc += dt;
      while (stepAcc >= spd) {
        stepAcc -= spd;
        step(wantX, wantY);
        if (!running) return;
      }
      enemies.forEach(function (e) {
        var nx = e.x + e.vx * dt / CELL, ny = e.y + e.vy * dt / CELL;
        var cx = nx | 0, cy = ny | 0;
        if (!inb(cx, cy) || gget(cx, e.y | 0) === 1) { e.vx *= -1; nx = e.x; }
        if (!inb(cx, cy) || gget(e.x | 0, cy) === 1) { e.vy *= -1; ny = e.y; }
        e.x = Math.max(1.2, Math.min(COLS - 1.2, nx));
        e.y = Math.max(1.2, Math.min(ROWS - 1.2, ny));
        var gx = e.x | 0, gy = e.y | 0;
        if (gget(gx, gy) === 2) die();
        if (drawing && Math.hypot(e.x - px, e.y - py) < 0.85) die();
      });
      if (!running) return;
      ctx.drawImage(art, 0, 0);
      ctx.fillStyle = 'rgba(4,10,14,0.9)';
      ctx.beginPath();
      var y, x;
      for (y = 0; y < ROWS; y++) {
        for (x = 0; x < COLS; x++) {
          if (grid[y][x] === 0) ctx.rect(x * CELL, y * CELL, CELL, CELL);
        }
      }
      ctx.fill();
      ctx.fillStyle = '#efd28a';
      for (y = 0; y < ROWS; y++) {
        for (x = 0; x < COLS; x++) {
          if (grid[y][x] === 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
      ctx.strokeStyle = '#cbb27055'; ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
      enemies.forEach(function (e) {
        ctx.fillStyle = '#ef5350';
        ctx.beginPath(); ctx.arc(e.x * CELL, e.y * CELL, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('!', e.x * CELL, e.y * CELL + 3);
      });
      var blink = invuln > 0 && ((invuln * 10) | 0) % 2 === 0;
      if (!blink) drawHeroShape(ctx, px * CELL - 5, py * CELL - 5, 16, 16, { radius: 5, font: 8 });
      if (winFlash > 0) {
        ctx.fillStyle = 'rgba(239,210,138,' + (winFlash * 0.35) + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff6dc'; ctx.font = 'bold 22px Georgia,serif'; ctx.textAlign = 'center';
        ctx.fillText('지분 확보!', W / 2, H / 2);
      }
      fx.draw(ctx);
      c.raf(loop);
    }
    function setWant(dx, dy) { wantX = dx; wantY = dy; }
    function applyKey(e) {
      var map = { ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0], ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1] };
      var d = map[e.key]; if (!d) return; e.preventDefault(); setWant(d[0], d[1]);
    }
    c.on(document, 'keydown', applyKey, true);
    c.on(cv.canvas, 'pointerdown', function (e) {
      e.preventDefault();
      touch0 = [e.clientX, e.clientY];
      var r = cv.canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      var dx = x - (px * CELL + CELL / 2), dy = y - (py * CELL + CELL / 2);
      if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? 1 : -1, 0);
      else setWant(0, dy > 0 ? 1 : -1);
    });
    c.on(cv.canvas, 'pointermove', function (e) {
      if (e.buttons === 0 && !(e.pressure > 0)) return;
      var r = cv.canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      var dx = x - (px * CELL + CELL / 2), dy = y - (py * CELL + CELL / 2);
      if (Math.hypot(dx, dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? 1 : -1, 0);
      else setWant(0, dy > 0 ? 1 : -1);
    });
    c.on(window, 'pointerup', function (e) {
      if (!touch0) return;
      var dx = e.clientX - touch0[0], dy = e.clientY - touch0[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 18) {
        if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? 1 : -1, 0);
        else setWant(0, dy > 0 ? 1 : -1);
      }
      touch0 = null;
    });
    var pad = el('div', 'hkg-dpad',
      '<i></i><button type="button" data-dx="0" data-dy="-1">▲</button><i></i>' +
      '<button type="button" data-dx="-1" data-dy="0">◀</button>' +
      '<button type="button" data-dx="0" data-dy="1">▼</button>' +
      '<button type="button" data-dx="1" data-dy="0">▶</button>');
    refs.stage.appendChild(pad);
    Array.prototype.forEach.call(pad.querySelectorAll('button'), function (btn) {
      c.on(btn, 'pointerdown', function (e) {
        e.preventDefault();
        setWant(Number(btn.getAttribute('data-dx')), Number(btn.getAttribute('data-dy')));
      });
    });
    resetField(false);
    c.raf(loop);
    actions(function () { startGame('hotelshare'); }, function () { return score; }, '테두리에서 출발해 안쪽으로 선을 그은 뒤 다시 테두리에 붙이면 영역이 채워집니다. 빨간 컴플레인에 선이 닿으면 실패. 80% 지분이면 다음 호텔!');
    return { id: 'hotelshare', destroy: c.destroy };
  };

  window.HKGames = {
    init: function (options) { config = options || {}; inject(); return this; },
    open: open,
    close: close,
    hideBehindOrders: hideBehindOrders,
    resumeFromOrders: resumeFromOrders,
    isOpen: isOverlayOpen,
    isStashed: function () { return !!stashedBehindOrders; }
  };
})(window, document);
