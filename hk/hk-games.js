(function (window, document) {
  'use strict';

  var GAME_IDS = ['candy', 'merge2048', 'snake', 'memory', 'breakout', 'jump'];
  var META = {
    candy: { icon: '🍬', name: '캔디 스위트', desc: '달콤한 보석을 맞추는 30수 퍼즐' },
    merge2048: { icon: '🔢', name: '2048 라운지', desc: '같은 숫자를 합쳐 2048에 도전' },
    snake: { icon: '🐍', name: '미드나잇 스네이크', desc: '벽을 피해 야식을 모아보세요' },
    memory: { icon: '🛎️', name: '호텔 메모리', desc: '호텔 아이콘 8쌍을 빠르게 찾기' },
    breakout: { icon: '🧱', name: '루프탑 브레이크', desc: '3개의 공으로 벽돌을 모두 격파' },
    jump: { icon: '🪽', name: '스카이 점프', desc: '발판을 밟고 끝없이 높이 오르기' }
  };
  var config = {};
  var root, refs = {}, active = null, toastTimer = 0;

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
      '.hkg-brand{display:flex;align-items:center;gap:12px}.hkg-mark{display:grid;place-items:center;width:42px;height:42px;border:1px solid #c5a96a;border-radius:50%;color:#e8cf91;font-family:serif;font-size:22px}.hkg-eyebrow{color:#cdb575;font-size:11px;letter-spacing:.22em;text-transform:uppercase}.hkg-brand strong{display:block;font-family:Georgia,serif;font-size:20px;letter-spacing:.03em}',
      '.hkg-btn{appearance:none;border:1px solid #8f7b4f;background:#122a2d;color:#f4e8c9;border-radius:12px;padding:10px 15px;font-weight:700;cursor:pointer;transition:.18s}.hkg-btn:hover{transform:translateY(-1px);border-color:#d5bd80;background:#18383a}.hkg-btn.primary{color:#15211f;background:linear-gradient(135deg,#f0d796,#bea15e);border:0}.hkg-btn.icon{font-size:18px;padding:8px 12px}',
      '.hkg-hero{padding:28px 30px;border:1px solid rgba(220,194,126,.26);border-radius:24px;background:linear-gradient(115deg,rgba(13,52,49,.9),rgba(8,25,32,.92));box-shadow:0 24px 70px #0007}.hkg-hero h1{font-family:Georgia,serif;font-size:clamp(34px,6vw,68px);line-height:.95;margin:5px 0 12px;color:#fff6dc}.hkg-hero p{margin:0;color:#aebfba}.hkg-who{margin-top:15px;color:#e5cd91;font-size:13px}',
      '.hkg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}.hkg-card{position:relative;text-align:left;min-height:225px;padding:22px;border:1px solid #ffffff18;border-radius:20px;color:inherit;background:linear-gradient(145deg,#123034dd,#0b1c25ee);box-shadow:0 14px 35px #0004;cursor:pointer;overflow:hidden;transition:.22s}.hkg-card:hover{transform:translateY(-4px);border-color:#cbb27088}.hkg-card:after{content:"";position:absolute;width:90px;height:90px;right:-25px;top:-25px;border-radius:50%;background:#d5bb7020}.hkg-card-icon{font-size:35px}.hkg-card h2{font-family:Georgia,serif;margin:10px 0 5px;font-size:22px}.hkg-card-desc{font-size:13px;color:#9fb2ad;min-height:38px}.hkg-best{margin:14px 0 9px;color:#ebd28f;font-weight:800}.hkg-mini{font-size:12px;color:#b9c8c3;line-height:1.65}.hkg-mini b{display:inline-block;width:18px;color:#d9bd78}',
      '.hkg-game{display:none}.hkg-game.show{display:block}.hkg-game-head{display:flex;align-items:center;gap:12px;margin-bottom:15px}.hkg-game-head h1{font-family:Georgia,serif;margin:0;font-size:clamp(25px,4vw,40px);flex:1}.hkg-hud{display:flex;gap:10px;flex-wrap:wrap}.hkg-pill{padding:8px 12px;border:1px solid #ffffff1c;background:#0d2429;border-radius:12px;font-size:13px}.hkg-pill b{color:#efd58f;margin-left:5px}',
      '.hkg-layout{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:18px}.hkg-stage,.hkg-ranking{border:1px solid #ffffff17;border-radius:20px;background:#091a21cc;box-shadow:0 20px 55px #0005}.hkg-stage{min-height:560px;padding:20px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;touch-action:none}.hkg-stage-inner{width:100%;text-align:center}.hkg-ranking{padding:20px;align-self:start}.hkg-ranking h3{font-family:Georgia,serif;color:#ecd18b;margin:0 0 13px}.hkg-rank{display:grid;grid-template-columns:26px 1fr auto;gap:7px;padding:9px 0;border-bottom:1px solid #ffffff10;font-size:13px}.hkg-rank.me{color:#f2d88f}.hkg-empty{padding:25px 0;color:#708b87;text-align:center}.hkg-actions{display:flex;justify-content:center;gap:9px;margin-top:15px}.hkg-note{color:#88a09a;font-size:12px;margin-top:10px}',
      '.hkg-candy{width:min(100%,560px);display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin:auto}.hkg-gem{aspect-ratio:1;border:0;border-radius:14px;background:#0d292d;display:grid;place-items:center;cursor:pointer;padding:8%;transition:transform .16s,opacity .18s,box-shadow .16s}.hkg-gem:before{content:"";width:82%;height:82%;border-radius:42% 58% 50% 50%;background:var(--gem);box-shadow:inset 0 7px 8px #fff6,inset 0 -8px 10px #0004,0 4px 7px #0006;transform:rotate(45deg)}.hkg-gem.sel{transform:scale(.87);box-shadow:0 0 0 3px #efd484}.hkg-gem.pop{transform:scale(.15) rotate(20deg);opacity:.05}',
      '.hkg-2048{width:min(100%,480px);aspect-ratio:1;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#173033;padding:10px;border-radius:18px;margin:auto}.hkg-tile{display:grid;place-items:center;border-radius:11px;background:#284144;color:#f5ecd5;font-size:clamp(20px,5vw,40px);font-weight:900;transition:.12s}.hkg-tile[data-v="0"]{color:transparent}.hkg-tile[data-v="2"]{background:#eee4cf;color:#263c3a}.hkg-tile[data-v="4"]{background:#e7cf9a;color:#263c3a}.hkg-tile[data-v="8"]{background:#df9b55}.hkg-tile[data-v="16"]{background:#d87947}.hkg-tile[data-v="32"]{background:#c9553e}.hkg-tile[data-v="64"]{background:#a83332}.hkg-tile[data-v="128"],.hkg-tile[data-v="256"]{background:#b99b45}.hkg-tile[data-v="512"],.hkg-tile[data-v="1024"],.hkg-tile[data-v="2048"]{background:#dfbf55;color:#142623;box-shadow:0 0 24px #e6c75c88}',
      '.hkg-memory{width:min(100%,560px);display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:auto;perspective:800px}.hkg-memory-card{aspect-ratio:1;border:0;border-radius:14px;background:linear-gradient(145deg,#1b4945,#102d32);color:transparent;font-size:clamp(25px,6vw,46px);cursor:pointer;transform-style:preserve-3d;transition:.28s;box-shadow:inset 0 0 0 1px #d2b77036}.hkg-memory-card.open,.hkg-memory-card.done{transform:rotateY(180deg);background:#e8d39d;color:#18302e}.hkg-memory-card.done{background:#a9d0b9;opacity:.72}',
      '.hkg-canvas{display:block;width:min(100%,620px);height:auto;max-height:68vh;margin:auto;border-radius:16px;background:#07151a;box-shadow:inset 0 0 0 1px #ffffff12;touch-action:none}.hkg-message{position:absolute;inset:0;display:none;place-items:center;background:#061218cc;backdrop-filter:blur(3px);z-index:4}.hkg-message.show{display:grid}.hkg-message-box{padding:25px;text-align:center}.hkg-message h2{font-family:Georgia,serif;color:#efd28a;font-size:31px;margin:0 0 7px}.hkg-message p{color:#b1c1bd}.hkg-toast{position:fixed;left:50%;bottom:28px;z-index:10002;transform:translate(-50%,25px);opacity:0;background:#ead18f;color:#122421;padding:12px 18px;border-radius:999px;font-weight:800;box-shadow:0 10px 35px #0008;transition:.25s;pointer-events:none}.hkg-toast.show{transform:translate(-50%,0);opacity:1}',
      '@media(max-width:850px){.hkg-grid{grid-template-columns:repeat(2,1fr)}.hkg-layout{grid-template-columns:1fr}.hkg-ranking{order:2}.hkg-stage{min-height:460px}}@media(max-width:560px){.hkg-shell{width:min(100% - 18px,1180px);padding-top:12px}.hkg-grid{grid-template-columns:1fr}.hkg-card{min-height:195px}.hkg-hero{padding:22px}.hkg-stage{padding:10px;min-height:390px}.hkg-game-head{flex-wrap:wrap}.hkg-game-head h1{order:2;flex-basis:70%}.hkg-hud{order:3;width:100%}.hkg-candy{gap:3px}.hkg-gem{border-radius:9px}.hkg-2048{gap:6px;padding:7px}}'
    ].join('');
    document.head.appendChild(style);
    root = el('div', 'hk-games-overlay');
    root.innerHTML =
      '<div class="hkg-shell"><header class="hkg-top"><div class="hkg-brand"><span class="hkg-mark">L</span><div><span class="hkg-eyebrow">Housekeeping Lounge</span><strong>Lotte Break</strong></div></div><button class="hkg-btn icon hkg-close" aria-label="닫기">✕</button></header>' +
      '<main class="hkg-hub"><section class="hkg-hero"><span class="hkg-eyebrow">A moment for yourself</span><h1>Lotte Break</h1><p>잠깐의 휴식, 가볍게 즐기고 동료들과 기록을 나눠보세요.</p><div class="hkg-who"></div></section><section class="hkg-grid"></section></main>' +
      '<main class="hkg-game"><header class="hkg-game-head"><button class="hkg-btn hkg-back">← 라운지</button><h1></h1><div class="hkg-hud"></div></header><div class="hkg-layout"><section class="hkg-stage"><div class="hkg-stage-inner"></div><div class="hkg-message"><div class="hkg-message-box"></div></div></section><aside class="hkg-ranking"></aside></div></main></div><div class="hkg-toast" role="status"></div>';
    document.body.appendChild(root);
    refs.hub = root.querySelector('.hkg-hub');
    refs.grid = root.querySelector('.hkg-grid');
    refs.game = root.querySelector('.hkg-game');
    refs.title = refs.game.querySelector('h1');
    refs.hud = root.querySelector('.hkg-hud');
    refs.stage = root.querySelector('.hkg-stage-inner');
    refs.message = root.querySelector('.hkg-message');
    refs.ranking = root.querySelector('.hkg-ranking');
    refs.toast = root.querySelector('.hkg-toast');
    root.querySelector('.hkg-close').addEventListener('click', close);
    root.querySelector('.hkg-back').addEventListener('click', showHub);
    document.addEventListener('keydown', globalKey);
  }
  function globalKey(e) {
    if (!root || !root.classList.contains('open') || e.key !== 'Escape') return;
    e.preventDefault();
    if (active) showHub(); else close();
  }
  function open() {
    inject();
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    showHub();
  }
  function close() {
    if (!root) return;
    cleanup();
    root.classList.remove('open');
    document.body.style.overflow = '';
  }
  function cleanup() {
    if (active && active.destroy) active.destroy();
    active = null;
    refs.message.classList.remove('show');
    refs.stage.innerHTML = '';
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
    cleanup();
    refs.hub.style.display = 'none';
    refs.game.classList.add('show');
    refs.title.textContent = META[id].icon + ' ' + META[id].name;
    refs.stage.innerHTML = '';
    refs.hud.innerHTML = '';
    refs.message.classList.remove('show');
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
    var removers = [], frames = [], timers = [];
    return {
      on: function (node, type, fn, opts) { node.addEventListener(type, fn, opts); removers.push(function () { node.removeEventListener(type, fn, opts); }); },
      raf: function (fn) { var id = requestAnimationFrame(fn); frames.push(id); return id; },
      timer: function (fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; },
      destroy: function () { removers.forEach(function (x) { x(); }); frames.forEach(cancelAnimationFrame); timers.forEach(clearTimeout); removers = []; frames = []; timers = []; }
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

  var games = {};

  games.candy = function () {
    var c = controller(), board = [], selected = -1, moves = 30, score = 0, busy = false;
    var colors = ['#ef5350', '#ffca45', '#4bc6a6', '#55a9e8', '#d86bd7', '#f08b43'];
    refs.stage.innerHTML = '<div class="hkg-candy"></div>';
    var grid = refs.stage.firstChild;
    setHud([['점수', '0', 'score'], ['남은 수', '30', 'moves']]);
    function random() { return Math.floor(Math.random() * colors.length); }
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
      if (!keys.length) { busy = false; if (done) done(); return; }
      busy = true; score += keys.length * 10 * combo; hud('score', formatScore(score)); draw(hit);
      c.timer(function () {
        for (var col = 0; col < 8; col++) {
          var keep = [];
          for (var row = 7; row >= 0; row--) if (!hit[col + row * 8]) keep.push(board[col + row * 8]);
          for (row = 7; row >= 0; row--) board[col + row * 8] = keep[7 - row] == null ? random() : keep[7 - row];
        }
        draw(); c.timer(function () { settle(combo + 1, done); }, 180);
      }, 210);
    }
    function click(e) {
      var node = e.target.closest('.hkg-gem');
      if (!node || busy || moves <= 0) return;
      var i = Number(node.getAttribute('data-i'));
      if (selected < 0) { selected = i; draw(); return; }
      var a = selected; selected = -1;
      var adjacent = Math.abs(a - i) === 8 || (Math.floor(a / 8) === Math.floor(i / 8) && Math.abs(a - i) === 1);
      if (!adjacent) { selected = i; draw(); return; }
      var temp = board[a]; board[a] = board[i]; board[i] = temp;
      if (!Object.keys(matches()).length) { temp = board[a]; board[a] = board[i]; board[i] = temp; draw(); toast('매치가 만들어지는 두 캔디를 바꿔보세요'); return; }
      moves--; hud('moves', moves); draw(); settle(1, function () {
        if (!moves) gameOver('브레이크 종료', '최종 점수 ' + formatScore(score), function () { startGame('candy'); }, score);
      });
    }
    c.on(grid, 'click', click);
    seed();
    actions(function () { startGame('candy'); }, function () { return score; }, '인접한 캔디를 눌러 자리를 바꾸세요. 연쇄 매치는 배수가 올라갑니다.');
    return { id: 'candy', destroy: c.destroy };
  };

  games.merge2048 = function () {
    var c = controller(), board, score, over = false, touch;
    refs.stage.innerHTML = '<div class="hkg-2048"></div>';
    var grid = refs.stage.firstChild;
    setHud([['점수', '0', 'score'], ['최고', formatScore(best('merge2048', name())), 'best']]);
    function add() {
      var empty = []; board.forEach(function (v, i) { if (!v) empty.push(i); });
      if (empty.length) board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < .9 ? 2 : 4;
    }
    function draw() {
      grid.innerHTML = board.map(function (v) { return '<div class="hkg-tile" data-v="' + Math.min(v, 2048) + '">' + (v || '') + '</div>'; }).join('');
      hud('score', formatScore(score));
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
      add(); draw();
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
    var c = controller(), cv = canvasBase(600, 600), ctx = cv.ctx, snake, dir, next, food, score, last = 0, step = 125, dead = false, touch;
    setHud([['점수', '0', 'score'], ['속도', '1.0x', 'speed']]);
    function spawn() { do { food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) }; } while (snake.some(function (p) { return p.x === food.x && p.y === food.y; })); }
    function input(x, y) { if (dir.x + x || dir.y + y) next = { x: x, y: y }; }
    function key(e) {
      var m = { ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0], ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1] };
      if (m[e.key]) { e.preventDefault(); input(m[e.key][0], m[e.key][1]); }
    }
    function draw() {
      ctx.fillStyle = '#07171c'; ctx.fillRect(0, 0, 600, 600);
      ctx.strokeStyle = '#0e292c'; for (var i = 0; i <= 20; i++) { ctx.beginPath(); ctx.moveTo(i * 30, 0); ctx.lineTo(i * 30, 600); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * 30); ctx.lineTo(600, i * 30); ctx.stroke(); }
      ctx.fillStyle = '#e2bd64'; ctx.beginPath(); ctx.arc(food.x * 30 + 15, food.y * 30 + 15, 10, 0, Math.PI * 2); ctx.fill();
      snake.forEach(function (p, i) { ctx.fillStyle = i ? '#43a982' : '#9ad2a9'; ctx.beginPath(); ctx.roundRect(p.x * 30 + 2, p.y * 30 + 2, 26, 26, 8); ctx.fill(); });
    }
    function loop(t) {
      if (dead) return;
      if (t - last >= step) {
        last = t; dir = next; var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20 || snake.some(function (p) { return p.x === head.x && p.y === head.y; })) {
          dead = true; gameOver('벽에 닿았어요', '야식 ' + (score / 10) + '개 · ' + formatScore(score) + '점', function () { startGame('snake'); }, score); return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) { score += 10; step = Math.max(62, step - 3); hud('score', score); hud('speed', (125 / step).toFixed(1) + 'x'); spawn(); } else snake.pop();
        draw();
      }
      c.raf(loop);
    }
    c.on(document, 'keydown', key);
    c.on(cv.canvas, 'touchstart', function (e) { touch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    c.on(cv.canvas, 'touchend', function (e) { var dx = e.changedTouches[0].clientX - touch[0], dy = e.changedTouches[0].clientY - touch[1]; if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? 1 : -1, 0); else input(0, dy > 0 ? 1 : -1); }, { passive: true });
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; dir = next = { x: 1, y: 0 }; score = 0; spawn(); draw(); c.raf(loop);
    actions(function () { startGame('snake'); }, function () { return score; }, '방향키/WASD 또는 스와이프로 조작하세요. 벽은 통과할 수 없습니다.');
    return { id: 'snake', destroy: c.destroy };
  };

  games.memory = function () {
    var c = controller(), icons = ['🛏️', '🔑', '🛎️', '⭐', '☕', '🧖', '🍷', '🧳'], cards, first = -1, locked = false, moves = 0, matched = 0, started = Date.now(), seconds = 0, timer;
    refs.stage.innerHTML = '<div class="hkg-memory"></div>';
    var grid = refs.stage.firstChild;
    setHud([['이동', '0', 'moves'], ['시간', '0초', 'time'], ['점수', '1,000', 'score']]);
    function calc() { return Math.max(100, 1000 - moves * 10 - seconds * 2); }
    function draw() { grid.innerHTML = cards.map(function (x, i) { return '<button class="hkg-memory-card ' + (x.open ? 'open ' : '') + (x.done ? 'done' : '') + '" data-i="' + i + '">' + x.icon + '</button>'; }).join(''); }
    function click(e) {
      var node = e.target.closest('[data-i]'); if (!node || locked) return;
      var i = Number(node.dataset.i); if (cards[i].open || cards[i].done) return;
      cards[i].open = true; draw();
      if (first < 0) { first = i; return; }
      moves++; hud('moves', moves);
      if (cards[first].icon === cards[i].icon) {
        cards[first].done = cards[i].done = true; matched += 2; first = -1; draw();
        if (matched === 16) { clearInterval(timer); var score = calc(); hud('score', formatScore(score)); gameOver('모든 짝을 찾았어요!', moves + '번 이동 · ' + seconds + '초 · ' + score + '점', function () { startGame('memory'); }, score); }
      } else {
        locked = true; c.timer(function () { cards[first].open = cards[i].open = false; first = -1; locked = false; draw(); }, 650);
      }
      hud('score', formatScore(calc()));
    }
    cards = icons.concat(icons).sort(function () { return Math.random() - .5; }).map(function (icon) { return { icon: icon, open: false, done: false }; });
    draw(); c.on(grid, 'click', click);
    timer = setInterval(function () { seconds = Math.floor((Date.now() - started) / 1000); hud('time', seconds + '초'); hud('score', formatScore(calc())); }, 500);
    var originalDestroy = c.destroy; c.destroy = function () { clearInterval(timer); originalDestroy(); };
    actions(function () { startGame('memory'); }, calc, '카드 두 장을 차례로 눌러 같은 호텔 아이콘을 찾으세요.');
    return { id: 'memory', destroy: c.destroy };
  };

  games.breakout = function () {
    var c = controller(), cv = canvasBase(720, 520), ctx = cv.ctx, paddle, ball, bricks, score = 0, lives = 3, running = true, last = 0;
    setHud([['점수', '0', 'score'], ['공', '3', 'lives'], ['벽돌', '50', 'bricks']]);
    function resetBall() { ball = { x: 360, y: 420, vx: (Math.random() > .5 ? 1 : -1) * 230, vy: -260, r: 8 }; paddle.x = 310; }
    function setup() {
      paddle = { x: 310, y: 485, w: 100, h: 13 }; bricks = [];
      for (var r = 0; r < 5; r++) for (var col = 0; col < 10; col++) bricks.push({ x: 12 + col * 70, y: 50 + r * 32, w: 64, h: 22, color: ['#d1b566', '#4fa98b', '#d47756', '#5f99af', '#b96d79'][r] });
      resetBall();
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, 520); g.addColorStop(0, '#0b2529'); g.addColorStop(1, '#061318'); ctx.fillStyle = g; ctx.fillRect(0, 0, 720, 520);
      bricks.forEach(function (b) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 5); ctx.fill(); ctx.fillStyle = '#ffffff26'; ctx.fillRect(b.x + 4, b.y + 3, b.w - 8, 3); });
      ctx.fillStyle = '#e4c878'; ctx.beginPath(); ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 7); ctx.fill();
      ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = '#efd685'; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
    }
    function loop(t) {
      if (!running) return; var dt = Math.min(.025, (t - last) / 1000 || 0); last = t;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); } if (ball.x > 720 - ball.r) { ball.x = 720 - ball.r; ball.vx = -Math.abs(ball.vx); } if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
      if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y < paddle.y + paddle.h && ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
        ball.y = paddle.y - ball.r; var hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); ball.vx = hit * 330; ball.vy = -Math.abs(ball.vy) * 1.025;
      }
      for (var i = bricks.length - 1; i >= 0; i--) {
        var b = bricks[i]; if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w && ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
          bricks.splice(i, 1); ball.vy *= -1; score += 10; hud('score', score); hud('bricks', bricks.length); break;
        }
      }
      if (!bricks.length) { running = false; gameOver('클리어!', '모든 벽돌을 격파했습니다 · ' + score + '점', function () { startGame('breakout'); }, score); return; }
      if (ball.y > 540) { lives--; hud('lives', lives); if (!lives) { running = false; gameOver('공을 모두 사용했어요', '격파 점수 ' + score, function () { startGame('breakout'); }, score); return; } resetBall(); }
      draw(); c.raf(loop);
    }
    function point(e) { var rect = cv.canvas.getBoundingClientRect(), x = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) * 720 / rect.width; paddle.x = Math.max(0, Math.min(620, x - 50)); }
    c.on(cv.canvas, 'mousemove', point); c.on(cv.canvas, 'touchmove', function (e) { e.preventDefault(); point(e); }, { passive: false });
    setup(); draw(); c.raf(loop);
    actions(function () { startGame('breakout'); }, function () { return score; }, '마우스 또는 손가락으로 패들을 움직이세요.');
    return { id: 'breakout', destroy: c.destroy };
  };

  games.jump = function () {
    var c = controller(), cv = canvasBase(520, 700), ctx = cv.ctx, player, platforms, keys = {}, score = 0, running = true, last = 0, touchX = null;
    setHud([['높이', '0', 'score'], ['최고', formatScore(best('jump', name())), 'best']]);
    function setup() {
      player = { x: 245, y: 580, w: 30, h: 38, vx: 0, vy: -650 };
      platforms = [{ x: 200, y: 640, w: 120 }];
      for (var y = 550; y > -100; y -= 80 + Math.random() * 25) platforms.push({ x: 20 + Math.random() * 390, y: y, w: 82 + Math.random() * 35 });
    }
    function addPlatforms() {
      var top = Math.min.apply(null, platforms.map(function (p) { return p.y; }));
      while (top > -120) { top -= 75 + Math.random() * 35; platforms.push({ x: 15 + Math.random() * 400, y: top, w: 75 + Math.random() * 45 }); }
    }
    function draw() {
      var g = ctx.createLinearGradient(0, 0, 0, 700); g.addColorStop(0, '#123e42'); g.addColorStop(1, '#07161c'); ctx.fillStyle = g; ctx.fillRect(0, 0, 520, 700);
      ctx.fillStyle = '#ffffff12'; for (var i = 0; i < 35; i++) { ctx.beginPath(); ctx.arc((i * 83) % 520, (i * 137) % 700, i % 3 + 1, 0, 7); ctx.fill(); }
      platforms.forEach(function (p) { ctx.fillStyle = '#d6bc75'; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, 11, 6); ctx.fill(); ctx.fillStyle = '#719b7a'; ctx.fillRect(p.x + 7, p.y + 10, p.w - 14, 4); });
      ctx.fillStyle = '#f0e4bd'; ctx.beginPath(); ctx.roundRect(player.x, player.y, player.w, player.h, 10); ctx.fill(); ctx.fillStyle = '#163c39'; ctx.fillRect(player.x + 6, player.y + 10, 5, 5); ctx.fillRect(player.x + 19, player.y + 10, 5, 5);
    }
    function loop(t) {
      if (!running) return; var dt = Math.min(.025, (t - last) / 1000 || 0); last = t;
      var steer = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (touchX != null) steer = touchX < player.x + player.w / 2 ? -1 : 1;
      player.vx += steer * 1250 * dt; player.vx *= Math.pow(.04, dt); player.vx = Math.max(-260, Math.min(260, player.vx)); player.x += player.vx * dt; player.vy += 1450 * dt; var oldBottom = player.y + player.h; player.y += player.vy * dt;
      if (player.x < -player.w) player.x = 520; if (player.x > 520) player.x = -player.w;
      if (player.vy > 0) platforms.some(function (p) { if (oldBottom <= p.y && player.y + player.h >= p.y && player.x + player.w > p.x && player.x < p.x + p.w) { player.y = p.y - player.h; player.vy = -670; return true; } return false; });
      if (player.y < 270) {
        var shift = 270 - player.y; player.y = 270; platforms.forEach(function (p) { p.y += shift; }); score += Math.round(shift); hud('score', formatScore(score)); platforms = platforms.filter(function (p) { return p.y < 730; }); addPlatforms();
      }
      if (player.y > 730) { running = false; gameOver('아래로 떨어졌어요', '오른 높이 ' + formatScore(score), function () { startGame('jump'); }, score); return; }
      draw(); c.raf(loop);
    }
    function key(e) { if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].indexOf(e.key) >= 0) { e.preventDefault(); keys[e.key.toLowerCase()] = e.type === 'keydown'; keys[e.key] = e.type === 'keydown'; } }
    c.on(document, 'keydown', key); c.on(document, 'keyup', key);
    c.on(cv.canvas, 'touchstart', function (e) { e.preventDefault(); var r = cv.canvas.getBoundingClientRect(); touchX = (e.touches[0].clientX - r.left) * 520 / r.width; }, { passive: false });
    c.on(cv.canvas, 'touchmove', function (e) { var r = cv.canvas.getBoundingClientRect(); touchX = (e.touches[0].clientX - r.left) * 520 / r.width; }, { passive: true });
    c.on(cv.canvas, 'touchend', function () { touchX = null; }, { passive: true });
    setup(); draw(); c.raf(loop);
    actions(function () { startGame('jump'); }, function () { return score; }, '좌우 방향키/A·D 또는 화면 좌우를 눌러 이동하세요. 좌우 벽은 연결됩니다.');
    return { id: 'jump', destroy: c.destroy };
  };

  window.HKGames = {
    init: function (options) { config = options || {}; inject(); return this; },
    open: open
  };
})(window, document);
