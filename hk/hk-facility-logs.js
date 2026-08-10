/**
 * 시설 관리 하위 업무 로그 — 컴플레인·지난습득물 / 당일습득물
 * 오더형(접수 → 완료). 관리자 전체 마감 후 10일간 유지.
 * (세탁 데이터는 저장소 호환을 위해 laundry 키로 유지, UI·신규 등록은 지난습득물로 통합)
 */
(function (global) {
  var RETENTION_MS = 10 * 24 * 60 * 60 * 1000;
  var OPERATOR_NAME_KEY = "lotte-hk-operator-name-session-v1";

  var MISC_UI_CATEGORIES = [
    { key: "complaint", label: "컴플레인" },
    { key: "pastFound", label: "지난습득물" },
  ];

  var MISC_CATEGORIES = MISC_UI_CATEGORIES.concat([{ key: "laundry", label: "지난습득물" }]);

  var miscSearchQuery = "";
  var dailySearchQuery = "";

  /** 메모 문장 → 컴플레인·지난습득물 자동 분류 (세탁 키워드는 지난습득물로 매핑, 오타 허용) */
  var MISC_CLASSIFY_KEYWORDS = {
    complaint: [
      "컴플레인",
      "컴플래인",
      "컴플레잉",
      "컴프레인",
      "켐플레인",
      "컴플린",
      "complaint",
      "complain",
      "클레임",
      "claim",
      "불만",
      "불편",
      "불쾌",
      "불친절",
      "무례",
      "항의",
      "항의함",
      "항의하",
      "화나",
      "화남",
      "화나심",
      "화나셨",
      "화나셔",
      "화나서",
      "화내",
      "화가",
      "분노",
      "짜증",
      "열받",
      "성나",
      "언짢",
      "언짢아",
      "언짢으",
      "언짢게",
      "언짢하",
      "기분나쁨",
      "기분나쁘",
      "시끄",
      "소음",
      "떠들",
      "악취",
      "냄새",
      "곰팡",
      "벌레",
      "해충",
      "더럽",
      "지저분",
      "불결",
      "청결불량",
      "위생",
      "서비스불만",
      "응대",
      "대응",
      "늦",
      "지연",
      "안됨",
      "안되",
      "미흡",
      "환불",
      "보상",
      "사과",
      "미안",
      "실망",
      "당황",
      "불안",
      "개선요청",
      "개선요구",
      "불만족",
      "만족하지",
      "화가나",
      "짜증나",
    ],
    pastFound: [
      "지난습득물",
      "지난습득",
      "과거습득",
      "예전습득",
      "분실",
      "분실물",
      "분실함",
      "분실신고",
      "분실되",
      "분실한",
      "잃어버",
      "잃어버림",
      "잃어버린",
      "잃어버리",
      "잃어 버",
      "유실",
      "유실물",
      "놔두고",
      "놔두고오",
      "놔두고감",
      "놔두고가",
      "놔둠",
      "놓고오",
      "놓고오심",
      "놓고오셨",
      "놓고가",
      "놓고감",
      "놓고가심",
      "두고오",
      "두고오심",
      "두고오셨",
      "두고감",
      "두고갔",
      "두고가",
      "leftbehind",
      "left behind",
      "forgotten",
      "lostitem",
      "lost item",
      "lost and found",
      "찾아달",
      "찾아주",
      "찾으시",
      "찾고계",
      "못찾",
      "가져가지",
      "못가져",
      "안가져",
      "남겨두",
      "남겨놓",
      "잊고",
      "잊어버",
      "까먹",
      "놓고왔",
      "두고왔",
    ],
    laundry: [
      "세탁",
      "세탁물",
      "세탁해",
      "세탁해주",
      "세탁부",
      "세탁맡",
      "세척",
      "laundry",
      "launder",
      "laundromat",
      "라운더리",
      "런드리",
      "런드러리",
      "란드리",
      "란더리",
      "픽업",
      "pickup",
      "pick up",
      "pick-up",
      "수거",
      "가져가주",
      "다림질",
      "개어",
      "개어주",
      "접어",
      "접어주",
      "다려",
      "다려주",
      "건조",
      "드라이",
      "드라이클리닝",
      "dryclean",
      "dry clean",
      "클리닝",
      "침구",
      "베개",
      "이불",
      "시트",
      "타월",
      "수건",
      "가운",
      "배스가운",
      "bathrobe",
      "양복",
      "정장",
      "의류",
      "셔츠",
      "블라우스",
      "바지",
      "치마",
      "드레스",
      "코트",
      "재킷",
      "jacket",
      "얼룩",
      "stain",
      "오염",
      "행거",
      "옷걸이",
      "garment",
      "wash",
      "washing",
      "housekeeping",
    ],
  };

  function normalizeMiscClassifyText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[\s\-_./,，、·]+/g, "")
      .replace(/[^\w\u3131-\u318e\uac00-\ud7a3]/g, "");
  }

  function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    var prev = [];
    var i;
    var j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function maxTypoDistance(len) {
    if (len <= 2) return 0;
    if (len <= 4) return 1;
    if (len <= 7) return 2;
    return 2;
  }

  function textContainsKeywordFuzzy(text, keyword) {
    var nkw = normalizeMiscClassifyText(keyword);
    if (!nkw) return false;
    if (text.indexOf(nkw) >= 0) return true;
    if (nkw.length < 3) return false;
    var maxDist = maxTypoDistance(nkw.length);
    var win;
    for (win = Math.max(2, nkw.length - 1); win <= nkw.length + 1; win++) {
      if (win > text.length) continue;
      var i;
      for (i = 0; i <= text.length - win; i++) {
        if (levenshteinDistance(text.substr(i, win), nkw) <= maxDist) return true;
      }
    }
    return false;
  }

  function scoreMiscCategory(text, categoryKey) {
    var keywords = MISC_CLASSIFY_KEYWORDS[categoryKey] || [];
    if (categoryKey === "pastFound") {
      keywords = keywords.concat(MISC_CLASSIFY_KEYWORDS.laundry || []);
    }
    var score = 0;
    var matched = [];
    keywords.forEach(function (kw) {
      if (textContainsKeywordFuzzy(text, kw)) {
        var nkw = normalizeMiscClassifyText(kw);
        var pts = nkw.length + (nkw.length >= 5 ? 3 : nkw.length >= 3 ? 1 : 0);
        score += pts;
        matched.push(kw);
      }
    });
    return { score: score, matched: matched };
  }

  function classifyMiscCategory(memo, fallbackKey) {
    var text = normalizeMiscClassifyText(memo);
    var fallback = normalizeUiMiscCategory(fallbackKey || activeMiscCategory || "complaint");
    if (!text) {
      return { key: fallback, label: miscCategoryLabel(fallback), score: 0, matched: [] };
    }
    var bestKey = fallback;
    var bestScore = 0;
    var bestMatched = [];
    MISC_UI_CATEGORIES.forEach(function (cat) {
      var result = scoreMiscCategory(text, cat.key);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestKey = cat.key;
        bestMatched = result.matched;
      }
    });
    if (bestScore <= 0) {
      return { key: fallback, label: miscCategoryLabel(fallback), score: 0, matched: [] };
    }
    return {
      key: bestKey,
      label: miscCategoryLabel(bestKey),
      score: bestScore,
      matched: bestMatched,
    };
  }

  function normalizeUiMiscCategory(key) {
    return key === "laundry" ? "pastFound" : key || "complaint";
  }

  function miscCategoryLabel(key) {
    var uiKey = normalizeUiMiscCategory(key);
    for (var i = 0; i < MISC_UI_CATEGORIES.length; i++) {
      if (MISC_UI_CATEGORIES[i].key === uiKey) return MISC_UI_CATEGORIES[i].label;
    }
    return uiKey;
  }

  function getMiscEntriesForCategory(log, categoryKey) {
    var key = normalizeUiMiscCategory(categoryKey);
    var list = (log.entries[key] || []).slice();
    if (key === "pastFound") {
      list = list.concat(log.entries.laundry || []);
    }
    return list;
  }

  function readMiscSearchQuery() {
    var el = document.getElementById("facilityMiscSearch");
    miscSearchQuery = el ? String(el.value || "").trim() : miscSearchQuery;
    return miscSearchQuery;
  }

  function readDailySearchQuery() {
    var el = document.getElementById("facilityDailyFoundSearch");
    dailySearchQuery = el ? String(el.value || "").trim() : dailySearchQuery;
    return dailySearchQuery;
  }

  function entryMatchesSearch(entry, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    var room = String((entry && entry.room) || "").toLowerCase();
    var memo = String((entry && entry.memo) || "").toLowerCase();
    return room.indexOf(q) >= 0 || memo.indexOf(q) >= 0;
  }

  function setActiveMiscCategory(key, opts) {
    opts = opts || {};
    if (!key) return;
    activeMiscCategory = normalizeUiMiscCategory(key);
    if (opts.skipRender) return;
    document.querySelectorAll("#facilityMiscTabs .facility-log-tab").forEach(function (btn) {
      var tabKey = btn.getAttribute("data-category");
      btn.classList.toggle("is-active", tabKey === key);
      btn.setAttribute("aria-selected", tabKey === key ? "true" : "false");
    });
    updateMiscClassifyHint(opts.hintMemo || "");
  }

  function updateMiscClassifyHint(memo) {
    var hint = document.getElementById("facilityMiscClassifyHint");
    if (!hint) return;
    var classified = classifyMiscCategory(memo, activeMiscCategory);
    if (!String(memo || "").trim()) {
      hint.textContent = "메모 내용에 따라 컴플레인·지난습득물로 자동 분류됩니다.";
      hint.hidden = false;
      return;
    }
    if (classified.score > 0) {
      hint.textContent =
        "자동 분류: " + classified.label + (classified.matched.length ? "" : "");
      hint.hidden = false;
    } else {
      hint.textContent = "선택한 탭(" + miscCategoryLabel(activeMiscCategory) + ")으로 등록됩니다.";
      hint.hidden = false;
    }
  }

  var miscClassifyInputTimer = null;

  function scheduleMiscClassifyFromInput(memo) {
    if (miscClassifyInputTimer) clearTimeout(miscClassifyInputTimer);
    miscClassifyInputTimer = setTimeout(function () {
      miscClassifyInputTimer = null;
      var classified = classifyMiscCategory(memo, activeMiscCategory);
      if (classified.score > 0) {
        var changed = classified.key !== activeMiscCategory;
        setActiveMiscCategory(classified.key, { hintMemo: memo, skipRender: true });
        if (changed) renderMiscPanel();
      } else {
        updateMiscClassifyHint(memo);
      }
    }, 120);
  }

  var activeMiscCategory = "complaint";
  var activeView = "";
  var uiHooks = {};
  var openFacilityLogChatKey = "";

  function facilityLogChatOpenKey(kind, entryId) {
    return String(kind || "") + ":" + String(entryId || "");
  }

  function isFacilityLogChatOpen(kind, entryId) {
    return openFacilityLogChatKey === facilityLogChatOpenKey(kind, entryId);
  }

  function defaultMiscLog() {
    return {
      retainUntil: "",
      entries: { complaint: [], pastFound: [], laundry: [] },
    };
  }

  function defaultDailyFoundLog() {
    return { retainUntil: "", entries: [] };
  }

  function getEntryPhase(entry) {
    if (!entry) return "alert";
    var p = entry.phase != null ? String(entry.phase).trim() : "";
    if (p === "completed") return "completed";
    if (p === "cancelled") return "cancelled";
    if (p === "accepted") return "accepted";
    if (p === "alert") return "alert";
    return "accepted";
  }

  function normalizeChatList(rawChat) {
    var chat = [];
    if (!Array.isArray(rawChat)) return chat;
    rawChat.forEach(function (m) {
      if (!m) return;
      var text = m.text != null ? String(m.text).trim() : "";
      var image = m.image != null ? String(m.image).trim() : "";
      if (!text && !image) return;
      chat.push({
        at: m.at != null ? String(m.at) : "",
        by: m.by != null ? String(m.by).trim() : "",
        text: text,
        image: image,
      });
    });
    return chat;
  }

  function normalizeOrderEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var id = raw.id != null ? String(raw.id).trim() : "";
    if (!id) return null;

    var memo = raw.memo != null ? String(raw.memo).trim() : "";
    var memoImage = raw.memoImage != null ? String(raw.memoImage).trim() : "";
    var at = raw.at != null ? String(raw.at) : "";
    var by = raw.by != null ? String(raw.by).trim() : "";
    var chat = normalizeChatList(raw.chat);

    if (!memo && !memoImage && chat.length) {
      var texts = [];
      chat.forEach(function (m) {
        if (m.text) texts.push(m.text);
        if (!memoImage && m.image) memoImage = m.image;
        if (!by && m.by) by = m.by;
        if (!at && m.at) at = m.at;
      });
      if (!memo) memo = texts.join("\n");
      chat = [];
    }

    if (!memo && !memoImage) return null;

    return {
      id: id,
      at: at || new Date().toISOString(),
      room: raw.room != null ? String(raw.room).trim() : "",
      memo: memo,
      memoImage: memoImage,
      by: by,
      chat: chat,
      phase: getEntryPhase(raw),
      acceptedAt: raw.acceptedAt != null ? String(raw.acceptedAt) : "",
      acceptedBy: raw.acceptedBy != null ? String(raw.acceptedBy).trim() : "",
      completedAt: raw.completedAt != null ? String(raw.completedAt) : "",
      completedBy: raw.completedBy != null ? String(raw.completedBy).trim() : "",
      cancelledAt: raw.cancelledAt != null ? String(raw.cancelledAt) : "",
      cancelledBy: raw.cancelledBy != null ? String(raw.cancelledBy).trim() : "",
    };
  }

  function entryLatestTimestamp(entry) {
    if (!entry) return 0;
    var max = 0;
    [entry.at, entry.acceptedAt, entry.completedAt].forEach(function (iso) {
      if (!iso) return;
      var t = new Date(iso).getTime();
      if (!isNaN(t) && t > max) max = t;
    });
    return max;
  }

  function filterEntriesByRetention(entries) {
    var cutoff = Date.now() - RETENTION_MS;
    return (entries || []).filter(function (entry) {
      return entryLatestTimestamp(entry) >= cutoff;
    });
  }

  function maybePurgeLog(log, factory) {
    if (!log) return factory();
    if (!log.retainUntil) return log;
    var t = new Date(log.retainUntil).getTime();
    if (isNaN(t) || Date.now() <= t) return log;

    var empty = factory();
    var result = { retainUntil: log.retainUntil };
    if (empty.entries && typeof empty.entries === "object" && !Array.isArray(empty.entries)) {
      result.entries = {};
      MISC_CATEGORIES.forEach(function (cat) {
        result.entries[cat.key] = filterEntriesByRetention(log.entries[cat.key]);
      });
    } else {
      result.entries = filterEntriesByRetention(log.entries);
    }
    return result;
  }

  function ensureRetainUntil(log) {
    var now = Date.now();
    if (!log.retainUntil) {
      log.retainUntil = new Date(now + RETENTION_MS).toISOString();
      return log;
    }
    var t = new Date(log.retainUntil).getTime();
    if (isNaN(t) || now > t) {
      log.retainUntil = new Date(now + RETENTION_MS).toISOString();
    }
    return log;
  }

  function normalizeMiscLog(raw) {
    var log = defaultMiscLog();
    if (!raw || typeof raw !== "object") return log;
    log.retainUntil = raw.retainUntil != null ? String(raw.retainUntil) : "";
    var src = raw.entries && typeof raw.entries === "object" ? raw.entries : {};
    MISC_CATEGORIES.forEach(function (cat) {
      var list = [];
      if (Array.isArray(src[cat.key])) {
        src[cat.key].forEach(function (item) {
          var n = normalizeOrderEntry(item);
          if (n) list.push(n);
        });
      }
      log.entries[cat.key] = list;
    });
    return maybePurgeLog(log, defaultMiscLog);
  }

  function normalizeDailyFoundLog(raw) {
    var log = defaultDailyFoundLog();
    if (!raw || typeof raw !== "object") return log;
    log.retainUntil = raw.retainUntil != null ? String(raw.retainUntil) : "";
    if (Array.isArray(raw.entries)) {
      raw.entries.forEach(function (item) {
        var n = normalizeOrderEntry(item);
        if (n) log.entries.push(n);
      });
    }
    return maybePurgeLog(log, defaultDailyFoundLog);
  }

  function loadStorage() {
    return global.HKStorage ? global.HKStorage.load() : {};
  }

  function saveStorage(patch) {
    if (!global.HKStorage) return;
    var data = loadStorage();
    Object.keys(patch).forEach(function (k) {
      data[k] = patch[k];
    });
    global.HKStorage.save(data);
  }

  function loadMiscLog() {
    return normalizeMiscLog(loadStorage().facilityMiscLog);
  }

  function loadDailyFoundLog() {
    return normalizeDailyFoundLog(loadStorage().facilityDailyFoundLog);
  }

  function saveMiscLog(log) {
    saveStorage({ facilityMiscLog: normalizeMiscLog(log) });
    if (uiHooks.onMiscLogChanged) uiHooks.onMiscLogChanged();
  }

  function saveDailyFoundLog(log) {
    saveStorage({ facilityDailyFoundLog: normalizeDailyFoundLog(log) });
    if (uiHooks.onDailyLogChanged) uiHooks.onDailyLogChanged();
  }

  function logContentSignature(log) {
    var copy = JSON.parse(JSON.stringify(log || {}));
    delete copy.retainUntil;
    return JSON.stringify(copy);
  }

  function getMiscSignature() {
    return logContentSignature(normalizeMiscLog(loadMiscLog()));
  }

  function getDailySignature() {
    return logContentSignature(normalizeDailyFoundLog(loadDailyFoundLog()));
  }

  function getOperatorName() {
    if (uiHooks.getOperatorName) return uiHooks.getOperatorName();
    try {
      return String(global.sessionStorage.getItem(OPERATOR_NAME_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function newEntryId() {
    return "fl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatAt(iso) {
    if (uiHooks.formatAt) return uiHooks.formatAt(iso);
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return (
      d.getFullYear() +
      "-" +
      pad2(d.getMonth() + 1) +
      "-" +
      pad2(d.getDate()) +
      " " +
      pad2(d.getHours()) +
      ":" +
      pad2(d.getMinutes())
    );
  }

  function formatRoom(room) {
    if (uiHooks.formatRoomNoDisplay) return uiHooks.formatRoomNoDisplay(String(room || ""));
    return String(room || "—");
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function exportFilenameBase(kind) {
    var d = new Date();
    return (
      kind +
      "_" +
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      "_" +
      pad2(d.getHours()) +
      pad2(d.getMinutes())
    );
  }

  function formatEntryPhaseLabel(entry) {
    var phase = getEntryPhase(entry);
    if (phase === "completed") return "완료";
    if (phase === "cancelled") return "취소";
    if (phase === "accepted") return "접수";
    return "알림";
  }

  function listMiscEntriesForExport(raw) {
    var log = normalizeMiscLog(raw);
    var out = [];
    MISC_CATEGORIES.forEach(function (cat) {
      (log.entries[cat.key] || []).forEach(function (entry) {
        out.push({ entry: entry, categoryLabel: miscCategoryLabel(cat.key) });
      });
    });
    out.sort(function (a, b) {
      return (
        new Date((a.entry && a.entry.at) || 0).getTime() -
        new Date((b.entry && b.entry.at) || 0).getTime()
      );
    });
    return out;
  }

  function listDailyEntriesForExport(raw) {
    return (normalizeDailyFoundLog(raw).entries || []).slice().sort(function (a, b) {
      return new Date((a && a.at) || 0).getTime() - new Date((b && b.at) || 0).getTime();
    });
  }

  function orderToExportRow(entry, categoryLabel) {
    return [
      formatAt(entry.at),
      entry.room || "",
      categoryLabel || "",
      entry.memo || (entry.memoImage ? "(사진)" : ""),
      entry.by || "",
      formatEntryPhaseLabel(entry),
      entry.acceptedAt ? formatAt(entry.acceptedAt) : "",
      entry.acceptedBy || "",
      entry.completedAt ? formatAt(entry.completedAt) : "",
      entry.completedBy || "",
    ];
  }

  function collectMiscExportRows(log) {
    var rows = [];
    MISC_CATEGORIES.forEach(function (cat) {
      (log.entries[cat.key] || []).forEach(function (entry) {
        rows.push(orderToExportRow(entry, miscCategoryLabel(cat.key)));
      });
    });
    rows.sort(function (a, b) {
      return new Date(a[0] || 0).getTime() - new Date(b[0] || 0).getTime();
    });
    return rows;
  }

  function orderToDailyExportRow(entry) {
    return [
      formatAt(entry.at),
      entry.room || "",
      entry.memo || (entry.memoImage ? "(사진)" : ""),
      entry.by || "",
      formatEntryPhaseLabel(entry),
      entry.acceptedAt ? formatAt(entry.acceptedAt) : "",
      entry.acceptedBy || "",
      entry.completedAt ? formatAt(entry.completedAt) : "",
      entry.completedBy || "",
    ];
  }

  function collectDailyExportRows(log) {
    return (log.entries || [])
      .map(function (entry) {
        return orderToDailyExportRow(entry);
      })
      .sort(function (a, b) {
        return new Date(a[0] || 0).getTime() - new Date(b[0] || 0).getTime();
      });
  }

  function exportCloseDayMiscRows(raw) {
    return collectMiscExportRows(normalizeMiscLog(raw));
  }

  function exportCloseDayDailyRows(raw) {
    return collectDailyExportRows(normalizeDailyFoundLog(raw));
  }

  function countMiscEntries(raw) {
    var log = normalizeMiscLog(raw);
    var n = 0;
    MISC_CATEGORIES.forEach(function (cat) {
      n += (log.entries[cat.key] || []).length;
    });
    return n;
  }

  function countDailyEntries(raw) {
    return (normalizeDailyFoundLog(raw).entries || []).length;
  }

  function buildExportTableHtml(rows, headers) {
    var head =
      "<tr>" +
      headers.map(function (h) {
        return "<th>" + escHtml(h) + "</th>";
      }).join("") +
      "</tr>";
    var body = rows
      .map(function (row) {
        return (
          "<tr>" +
          row
            .map(function (cell) {
              return "<td>" + escHtml(cell) + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    return '<table border="1" cellpadding="6" cellspacing="0">' + head + body + "</table>";
  }

  var EXPORT_HEADERS = ["접수시각", "객실", "구분", "내용", "접수자", "상태", "완료시각", "완료자"];
  var EXPORT_HEADERS_DAILY = ["접수시각", "객실", "내용", "접수자", "상태", "완료시각", "완료자"];

  function downloadMiscHtml(log) {
    var rows = collectMiscExportRows(log);
    var html =
      '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>컴플레인·지난습득물</title></head><body><h1>컴플레인·지난습득물</h1><p>보내기: ' +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      buildExportTableHtml(rows, EXPORT_HEADERS) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_컴플레인습득물") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadMiscExcel(log) {
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" +
      buildExportTableHtml(collectMiscExportRows(log), EXPORT_HEADERS) +
      "</body></html>";
    downloadBlob(
      exportFilenameBase("시설_컴플레인습득물") + ".xls",
      new Blob(["\ufeff", sheet], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  }

  function downloadDailyHtml(log) {
    var rows = collectDailyExportRows(log);
    var dailyHeaders = ["접수시각", "객실", "내용", "접수자", "상태", "완료시각", "완료자"];
    var html =
      '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>당일습득물</title></head><body><h1>당일습득물</h1><p>보내기: ' +
      escHtml(formatAt(new Date().toISOString())) +
      "</p>" +
      buildExportTableHtml(rows, dailyHeaders) +
      "</body></html>";
    downloadBlob(exportFilenameBase("시설_당일습득물") + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  }

  function downloadDailyExcel(log) {
    var dailyHeaders = ["접수시각", "객실", "내용", "접수자", "상태", "완료시각", "완료자"];
    var sheet =
      "<html><head><meta charset=\"UTF-8\"/></head><body>" +
      buildExportTableHtml(collectDailyExportRows(log), dailyHeaders) +
      "</body></html>";
    downloadBlob(
      exportFilenameBase("시설_당일습득물") + ".xls",
      new Blob(["\ufeff", sheet], { type: "application/vnd.ms-excel;charset=utf-8" })
    );
  }

  function prepareForAdminCloseDay(data) {
    var misc = normalizeMiscLog(data && data.facilityMiscLog);
    var daily = normalizeDailyFoundLog(data && data.facilityDailyFoundLog);
    var until = new Date(Date.now() + RETENTION_MS).toISOString();
    misc.retainUntil = until;
    daily.retainUntil = until;
    return {
      facilityMiscLog: misc,
      facilityDailyFoundLog: daily,
    };
  }

  function findEntryInList(list, entryId) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === entryId) return list[i];
    }
    return null;
  }

  function createMiscOrder(room, memo, image, categoryKey) {
    var classified = classifyMiscCategory(memo, categoryKey || activeMiscCategory);
    var targetCategory = classified.score > 0 ? classified.key : categoryKey || activeMiscCategory;
    targetCategory = normalizeUiMiscCategory(targetCategory);
    activeMiscCategory = targetCategory;
    var log = loadMiscLog();
    ensureRetainUntil(log);
    if (!log.entries[targetCategory]) log.entries[targetCategory] = [];
    var name = getOperatorName();
    var now = new Date().toISOString();
    log.entries[targetCategory].push({
      id: newEntryId(),
      at: now,
      room: String(room || "").trim(),
      memo: String(memo || "").trim(),
      memoImage: image || "",
      by: name,
      chat: [],
      phase: "alert",
      acceptedAt: "",
      acceptedBy: "",
      completedAt: "",
      completedBy: "",
    });
    saveMiscLog(log);
    renderMiscPanels();
    scrollFacilityLogAlertIntoView("facilityMiscFeedbackList", log.entries[targetCategory]);
  }

  function createDailyOrder(room, memo, image) {
    var log = loadDailyFoundLog();
    ensureRetainUntil(log);
    var name = getOperatorName();
    var now = new Date().toISOString();
    log.entries.push({
      id: newEntryId(),
      at: now,
      room: String(room || "").trim(),
      memo: String(memo || "").trim(),
      memoImage: image || "",
      by: name,
      chat: [],
      phase: "alert",
      acceptedAt: "",
      acceptedBy: "",
      completedAt: "",
      completedBy: "",
    });
    saveDailyFoundLog(log);
    renderDailyPanels();
    scrollFacilityLogAlertIntoView("facilityDailyFoundFeedbackList", log.entries);
  }

  function acceptMiscEntry(entryId) {
    var log = loadMiscLog();
    var entry = null;
    var list = null;
    MISC_CATEGORIES.forEach(function (cat) {
      if (entry) return;
      var items = log.entries[cat.key] || [];
      var found = findEntryInList(items, entryId);
      if (found) {
        entry = found;
        list = items;
        activeMiscCategory = normalizeUiMiscCategory(cat.key);
      }
    });
    if (!entry || getEntryPhase(entry) !== "alert") return;
    entry.phase = "accepted";
    entry.acceptedAt = new Date().toISOString();
    entry.acceptedBy = getOperatorName();
    saveMiscLog(log);
    renderMiscPanels();
    scrollFacilityLogAcceptedIntoView("facilityMiscAcceptedList", entryId);
  }

  function acceptDailyEntry(entryId) {
    var log = loadDailyFoundLog();
    var entry = findEntryInList(log.entries, entryId);
    if (!entry || getEntryPhase(entry) !== "alert") return;
    entry.phase = "accepted";
    entry.acceptedAt = new Date().toISOString();
    entry.acceptedBy = getOperatorName();
    saveDailyFoundLog(log);
    renderDailyPanels();
    scrollFacilityLogAcceptedIntoView("facilityDailyFoundAcceptedList", entryId);
  }

  function findFacilityLogHit(entryId) {
    var miscHit = findMiscEntry(entryId);
    if (miscHit) {
      return {
        kind: "misc",
        log: miscHit.log,
        entry: miscHit.entry,
        category: miscHit.category,
      };
    }
    var dailyHit = findDailyEntry(entryId);
    if (dailyHit) {
      return { kind: "daily", log: dailyHit.log, entry: dailyHit.entry };
    }
    return null;
  }

  function findFacilityLogEntry(entryId) {
    var hit = findFacilityLogHit(entryId);
    return hit ? hit.entry : null;
  }

  function cancelFacilityLogEntry(entryId, handlerName) {
    var hit = findFacilityLogHit(entryId);
    if (!hit || !hit.entry) return;
    if (getEntryPhase(hit.entry) === "cancelled") return;
    hit.entry.phase = "cancelled";
    hit.entry.cancelledAt = new Date().toISOString();
    hit.entry.cancelledBy = handlerName != null ? String(handlerName).trim() : "";
    if (uiHooks.appendCancelNameLog) {
      uiHooks.appendCancelNameLog(
        hit.entry.room || "",
        hit.entry.cancelledBy,
        entryId,
        {
          kind: hit.kind === "daily" ? "facilityDaily" : "facilityMisc",
          memo: hit.entry.memo || "",
        }
      );
    }
    if (hit.kind === "daily") {
      saveDailyFoundLog(hit.log);
      renderDailyPanels();
    } else {
      if (hit.category) activeMiscCategory = normalizeUiMiscCategory(hit.category);
      saveMiscLog(hit.log);
      renderMiscPanels();
    }
  }

  function updateFacilityLogMemo(entryId, memo, memoImage) {
    var hit = findFacilityLogHit(entryId);
    if (!hit || !hit.entry) return;
    if (getEntryPhase(hit.entry) !== "alert") return;
    hit.entry.memo = memo != null ? String(memo).trim() : "";
    hit.entry.memoImage = memoImage != null ? String(memoImage).trim() : "";
    if (!hit.entry.memo && !hit.entry.memoImage) return;
    if (hit.kind === "daily") {
      saveDailyFoundLog(hit.log);
      renderDailyPanels();
    } else {
      if (hit.category) activeMiscCategory = normalizeUiMiscCategory(hit.category);
      saveMiscLog(hit.log);
      renderMiscPanels();
    }
  }

  function openFacilityLogMemoEditor(entryId) {
    if (!(uiHooks.isFrontMode && uiHooks.isFrontMode())) return;
    var entry = findFacilityLogEntry(entryId);
    if (!entry || getEntryPhase(entry) !== "alert") return;
    var li = document.querySelector(
      '.facility-log__alert-item[data-entry-id="' + entryId + '"]'
    );
    if (!li) return;
    var oldWrap = li.querySelector(".facility-log__memo-editor-wrap");
    if (oldWrap) {
      oldWrap.remove();
      li.querySelectorAll(".facility-log__memo-btn, .facility-log__cancel-btn").forEach(
        function (b) {
          b.style.visibility = "";
        }
      );
      return;
    }
    document.querySelectorAll(".facility-log__memo-editor-wrap").forEach(function (n) {
      n.remove();
    });
    var memoEditKey = "facilityLogMemoEdit:" + entryId;
    if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto(memoEditKey);
    if (entry.memoImage && uiHooks.hkSetPhotoPreview) {
      uiHooks.hkSetPhotoPreview(memoEditKey, entry.memoImage);
    }
    li.querySelectorAll(".facility-log__memo-btn, .facility-log__cancel-btn").forEach(
      function (b) {
        b.style.visibility = "hidden";
      }
    );
    var wrap = document.createElement("div");
    wrap.className =
      "request-feedback__memo-editor-wrap order-feedback__memo-editor-wrap facility-log__memo-editor-wrap";
    var ed = document.createElement("div");
    ed.className = "request-feedback__memo-editor";
    var ta = document.createElement("textarea");
    ta.setAttribute("aria-label", "시설 업무 메모");
    ta.placeholder = "메모를 입력하세요.";
    ta.value = entry.memo != null ? String(entry.memo) : "";
    var act = document.createElement("div");
    act.className = "request-feedback__memo-editor-actions";
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "request-feedback__memo-save";
    ok.textContent = "적용";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "닫기";
    act.appendChild(ok);
    act.appendChild(cancel);
    if (uiHooks.hkCreatePhotoButton) act.appendChild(uiHooks.hkCreatePhotoButton(memoEditKey));
    ed.appendChild(ta);
    ed.appendChild(act);
    wrap.appendChild(ed);
    if (uiHooks.hkCreatePhotoPreview) wrap.appendChild(uiHooks.hkCreatePhotoPreview(memoEditKey));
    li.appendChild(wrap);
    if (uiHooks.hkBindPhotoPaste) uiHooks.hkBindPhotoPaste(ta, memoEditKey);

    function done(rerender) {
      if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto(memoEditKey);
      li.querySelectorAll(".facility-log__memo-btn, .facility-log__cancel-btn").forEach(
        function (b) {
          b.style.visibility = "";
        }
      );
      wrap.remove();
      if (rerender) {
        if (activeView === "facilityMisc") renderMiscPanels();
        if (activeView === "facilityDailyFound") renderDailyPanels();
      }
    }

    ok.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var img =
        uiHooks.hkGetPhoto && uiHooks.hkGetPhoto(memoEditKey)
          ? uiHooks.hkGetPhoto(memoEditKey)
          : "";
      updateFacilityLogMemo(entryId, ta.value, img);
      done(false);
    });
    cancel.addEventListener("click", function (ev) {
      ev.stopPropagation();
      done(true);
    });
    ta.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        cancel.click();
      }
    });
    wrap.addEventListener("click", function (ev) {
      ev.stopPropagation();
    });
    ta.focus();
  }

  function completeMiscEntry(entryId) {
    var log = loadMiscLog();
    var entry = null;
    MISC_CATEGORIES.forEach(function (cat) {
      if (entry) return;
      var found = findEntryInList(log.entries[cat.key] || [], entryId);
      if (found) {
        entry = found;
        activeMiscCategory = normalizeUiMiscCategory(cat.key);
      }
    });
    if (!entry || getEntryPhase(entry) === "completed") return;
    if (getEntryPhase(entry) !== "accepted") return;
    entry.phase = "completed";
    entry.completedAt = new Date().toISOString();
    entry.completedBy = getOperatorName();
    saveMiscLog(log);
    renderMiscPanels();
    scrollFacilityLogCompletedIntoView("facilityMiscCompletedList", entryId);
  }

  function completeDailyEntry(entryId) {
    var log = loadDailyFoundLog();
    var entry = findEntryInList(log.entries, entryId);
    if (!entry || getEntryPhase(entry) === "completed") return;
    if (getEntryPhase(entry) !== "accepted") return;
    entry.phase = "completed";
    entry.completedAt = new Date().toISOString();
    entry.completedBy = getOperatorName();
    saveDailyFoundLog(log);
    renderDailyPanels();
    scrollFacilityLogCompletedIntoView("facilityDailyFoundCompletedList", entryId);
  }

  function scrollFacilityLogItemIntoView(listId, entryId) {
    if (!entryId) return;
    requestAnimationFrame(function () {
      var card = document.querySelector(
        "#" + listId + ' .order-work-item[data-entry-id="' + entryId + '"]'
      );
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function scrollFacilityLogAlertIntoView(listId, entries) {
    var last = (entries || []).filter(function (e) {
      return getEntryPhase(e) === "alert";
    }).pop();
    if (!last || !last.id) return;
    requestAnimationFrame(function () {
      var card = document.querySelector(
        "#" + listId + ' .order-feedback__item[data-entry-id="' + last.id + '"]'
      );
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function scrollFacilityLogAcceptedIntoView(listId, entryId) {
    scrollFacilityLogItemIntoView(listId, entryId);
  }

  function scrollFacilityLogCompletedIntoView(listId, entryId) {
    scrollFacilityLogItemIntoView(listId, entryId);
  }

  function findMiscEntry(entryId) {
    var log = loadMiscLog();
    var result = null;
    MISC_CATEGORIES.forEach(function (cat) {
      if (result) return;
      var entry = findEntryInList(log.entries[cat.key] || [], entryId);
      if (entry) result = { log: log, entry: entry, category: cat.key };
    });
    return result;
  }

  function findDailyEntry(entryId) {
    var log = loadDailyFoundLog();
    var entry = findEntryInList(log.entries, entryId);
    if (!entry) return null;
    return { log: log, entry: entry };
  }

  function facilityLogChatKey(kind, entryId) {
    return "facilityLogChat:" + kind + ":" + (entryId || "");
  }

  function appendFacilityLogChatUi(li, entry, kind, opts) {
    opts = opts || {};
    var readOnly = !!opts.readOnly;
    if (!entry || !entry.id) return;
    var stick = true;
    try {
      var prevMsgList = document.querySelector(
        '.facility-log-panel .order-work-item[data-entry-id="' +
          String(entry.id).replace(/"/g, '\\"') +
          '"] .order-chat__messages'
      );
      if (typeof window.hkChatNearBottom === "function") {
        stick = window.hkChatNearBottom(prevMsgList);
      } else if (prevMsgList) {
        stick =
          prevMsgList.scrollHeight -
            prevMsgList.scrollTop -
            prevMsgList.clientHeight <=
          96;
      }
    } catch (eStickFac) {}
    var chatWrap = document.createElement("div");
    chatWrap.className = "order-chat facility-log-chat";

    var msgList = document.createElement("ul");
    msgList.className = "order-chat__messages";
    var chat = Array.isArray(entry.chat) ? entry.chat : [];
    chat.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    var dayKey = "";
    chat.forEach(function (msg) {
        if (uiHooks.maybeAppendChatDaySeparator) {
          dayKey = uiHooks.maybeAppendChatDaySeparator(msgList, dayKey, msg.at, "li");
        }
        var byName = msg.by != null ? String(msg.by).trim() || "—" : "—";
        var msgLi = document.createElement("li");
        msgLi.className = "order-chat__msg";
        if (uiHooks.applyChatBubbleAlign) uiHooks.applyChatBubbleAlign(msgLi, byName);
        var byEl = document.createElement("div");
        byEl.className = "order-chat__msg-by";
        byEl.textContent = byName;
        msgLi.appendChild(byEl);
        if (uiHooks.applyChatBubbleColors) {
          uiHooks.applyChatBubbleColors(msgLi, byName, byEl, "order-chat__msg-text");
        }
        if (uiHooks.hkAppendMessageContent) {
          uiHooks.hkAppendMessageContent(msgLi, msg.text, msg.image, "order-chat__msg-text");
        } else {
          var textEl = document.createElement("div");
          textEl.className = "order-chat__msg-text";
          textEl.textContent = msg.text || (msg.image ? "(사진)" : "");
          msgLi.appendChild(textEl);
        }
        if (msg.at) {
          var timeEl = document.createElement("div");
          timeEl.className = "order-chat__msg-time";
          timeEl.textContent = formatAt(msg.at);
          msgLi.appendChild(timeEl);
        }
        msgList.appendChild(msgLi);
      });
    chatWrap.appendChild(msgList);

    if (!readOnly) {
    var chatKey = facilityLogChatKey(kind, entry.id);
    var chatForm = document.createElement("form");
    chatForm.className = "order-chat__form facility-log-chat__form hk-compose-row";
    chatForm.setAttribute("data-entry-id", entry.id);
    chatForm.setAttribute("data-log-kind", kind);
    var chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.placeholder = "메시지 입력";
    chatInput.autocomplete = "off";
    chatInput.setAttribute("aria-label", "접수 건 대화 메시지");
    chatForm.appendChild(chatInput);
    if (uiHooks.hkCreatePhotoButton) {
      chatForm.appendChild(uiHooks.hkCreatePhotoButton(chatKey));
    }
    if (uiHooks.hkBindPhotoPaste) {
      uiHooks.hkBindPhotoPaste(chatInput, chatKey, {
        autoSend: function (text, image) {
          appendFacilityLogChat(kind, entry.id, text, image);
        },
      });
    }
    var chatSend = document.createElement("button");
    chatSend.type = "submit";
    chatSend.className = "order-chat__send";
    chatSend.textContent = "전송";
    chatForm.appendChild(chatSend);
    chatWrap.appendChild(chatForm);
    if (uiHooks.hkCreatePhotoPreview) {
      chatWrap.appendChild(uiHooks.hkCreatePhotoPreview(chatKey));
    }
    }

    li.appendChild(chatWrap);
    requestAnimationFrame(function () {
      if (stick) msgList.scrollTop = msgList.scrollHeight;
    });
  }

  function canFacilityLogChat(entry) {
    var phase = getEntryPhase(entry);
    return phase === "accepted" || phase === "completed";
  }

  function appendFacilityLogChat(kind, entryId, text, image) {
    if (!entryId) return;
    var msgText = String(text || "").trim();
    var msgImage = image != null ? String(image).trim() : "";
    if (!msgText && !msgImage) return;
    var run = function () {
      var chatMsg = {
        at: new Date().toISOString(),
        by: getOperatorName(),
        text: msgText,
        image: msgImage || "",
      };
      if (kind === "misc") {
        var miscHit = findMiscEntry(entryId);
        if (!miscHit || !canFacilityLogChat(miscHit.entry)) return;
        if (!Array.isArray(miscHit.entry.chat)) miscHit.entry.chat = [];
        miscHit.entry.chat.push(chatMsg);
        activeMiscCategory = normalizeUiMiscCategory(miscHit.category);
        saveMiscLog(miscHit.log);
        renderMiscPanels();
      } else {
        var dailyHit = findDailyEntry(entryId);
        if (!dailyHit || !canFacilityLogChat(dailyHit.entry)) return;
        if (!Array.isArray(dailyHit.entry.chat)) dailyHit.entry.chat = [];
        dailyHit.entry.chat.push(chatMsg);
        saveDailyFoundLog(dailyHit.log);
        renderDailyPanels();
      }
      if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto(facilityLogChatKey(kind, entryId));
      requestAnimationFrame(function () {
        var card = document.querySelector(
          '.facility-log-panel .order-work-item[data-entry-id="' +
            entryId +
            '"] .facility-log-chat__form input'
        );
        if (card) card.focus();
        var msgList = document.querySelector(
          '.facility-log-panel .order-work-item[data-entry-id="' +
            entryId +
            '"] .order-chat__messages'
        );
        if (msgList) {
          if (typeof window.hkChatScrollToBottom === "function") {
            window.hkChatScrollToBottom(msgList, true);
          } else {
            msgList.scrollTop = msgList.scrollHeight;
          }
        }
      });
    };
    if (!getOperatorName() && uiHooks.showOperatorGate) {
      uiHooks.showOperatorGate({ mode: "initial", onSaved: run });
      return;
    }
    run();
  }

  function appendTimeLine(parent, label, iso) {
    if (!iso) return;
    var timeEl = document.createElement("div");
    timeEl.className = "request-feedback__item-time";
    if (uiHooks.setLineWithEmTime) {
      uiHooks.setLineWithEmTime(timeEl, label + " ", formatAt(iso));
    } else {
      timeEl.textContent = label + " " + formatAt(iso);
    }
    parent.appendChild(timeEl);
  }

  function appendFacilityLogPhaseLine(parent, label, name, iso) {
    if (!name && !iso) return;
    var line = document.createElement("div");
    line.className = "facility-log-card__meta-line";
    if (label) line.appendChild(document.createTextNode(label + " "));
    if (name) {
      var nameSpan = document.createElement("span");
      nameSpan.className = "facility-log-card__meta-name";
      nameSpan.textContent = name;
      line.appendChild(nameSpan);
    }
    if (iso) {
      if (label || name) line.appendChild(document.createTextNode(" · "));
      if (uiHooks.setLineWithEmTime) {
        var timeWrap = document.createElement("span");
        uiHooks.setLineWithEmTime(timeWrap, "", formatAt(iso));
        line.appendChild(timeWrap);
      } else {
        line.appendChild(document.createTextNode(formatAt(iso)));
      }
    }
    parent.appendChild(line);
  }

  function appendFacilityLogCardHead(li, entry, opts) {
    opts = opts || {};
    var head = document.createElement("div");
    head.className = "facility-log-card__head";
    var roomEl = document.createElement("span");
    roomEl.className = "request-feedback__item-room";
    if (opts.roomMetaToggle) {
      roomEl.classList.add("facility-log-card__room-toggle");
      roomEl.setAttribute("role", "button");
      roomEl.setAttribute("tabindex", "0");
      roomEl.title = "클릭하면 등록·접수·완료 시간 보기";
    }
    roomEl.textContent = entry.room ? formatRoom(entry.room) : "—";
    head.appendChild(roomEl);

    if (entry.at) {
      var regDate = document.createElement("span");
      regDate.className = "facility-log-card__reg-date";
      regDate.textContent = formatAt(entry.at);
      regDate.title = "등록 " + formatAt(entry.at);
      head.appendChild(regDate);
    }

    var meta = document.createElement("div");
    meta.className = "facility-log-card__meta";
    var regBy = entry.by != null ? String(entry.by).trim() : "";
    appendFacilityLogPhaseLine(meta, "등록", regBy, entry.at);
    if (opts.showAcceptLines) {
      var acceptBy = entry.acceptedBy != null ? String(entry.acceptedBy).trim() : "";
      appendFacilityLogPhaseLine(meta, "접수", acceptBy, entry.acceptedAt);
    }
    head.appendChild(meta);
    li.appendChild(head);
  }

  function appendFacilityLogCardFoot(li, entry) {
    var doneBy = entry.completedBy != null ? String(entry.completedBy).trim() : "";
    var doneAt = entry.completedAt || "";
    if (!doneBy && !doneAt) return;
    var foot = document.createElement("div");
    foot.className = "facility-log-card__foot";
    var gap = document.createElement("span");
    gap.className = "facility-log-card__room-gap";
    gap.setAttribute("aria-hidden", "true");
    foot.appendChild(gap);
    var meta = document.createElement("div");
    meta.className = "facility-log-card__meta";
    appendFacilityLogPhaseLine(meta, "완료", doneBy, doneAt);
    foot.appendChild(meta);
    li.appendChild(foot);
  }

  function appendOrderMemoBody(li, entry) {
    var memoStr = entry.memo != null ? String(entry.memo).trim() : "";
    if (memoStr) {
      var memEl = document.createElement("div");
      memEl.className = "order-feedback__item-memo";
      memEl.textContent = memoStr;
      li.appendChild(memEl);
    }
    if (uiHooks.hkAppendImageEl) {
      uiHooks.hkAppendImageEl(li, entry.memoImage);
    }
  }

  function appendOrderBody(li, entry) {
    appendFacilityLogCardHead(li, entry, { showAcceptLines: false });
    appendOrderMemoBody(li, entry);
  }

  function appendAlertCard(li, entry, categoryLabel, cardOpts) {
    cardOpts = cardOpts || {};
    if (categoryLabel) {
      var tag = document.createElement("div");
      tag.className = "facility-log__alert-tag";
      tag.textContent = categoryLabel;
      li.appendChild(tag);
    }
    appendFacilityLogCardHead(li, entry, {
      showAcceptLines: false,
      roomMetaToggle: !!cardOpts.roomMetaToggle,
    });
    appendOrderMemoBody(li, entry);
    if (uiHooks.isFrontMode && uiHooks.isFrontMode()) {
      var frontActs = document.createElement("div");
      frontActs.className = "order-feedback__front-actions";
      var memoStr = entry.memo != null ? String(entry.memo).trim() : "";
      var memoBtn = document.createElement("button");
      memoBtn.type = "button";
      memoBtn.className = "request-feedback__memo-btn facility-log__memo-btn";
      memoBtn.setAttribute("data-entry-id", entry.id || "");
      memoBtn.textContent = memoStr ? "메모 수정" : "메모 입력";
      memoBtn.setAttribute("aria-label", memoStr ? "메모 수정" : "메모 입력");
      frontActs.appendChild(memoBtn);
      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "request-feedback__cancel-btn facility-log__cancel-btn";
      cancelBtn.setAttribute("data-entry-id", entry.id || "");
      cancelBtn.textContent = "취소";
      cancelBtn.setAttribute("aria-label", "이 등록을 취소");
      frontActs.appendChild(cancelBtn);
      li.appendChild(frontActs);
      return;
    }
    var acts = document.createElement("div");
    acts.className = "order-feedback__maint-actions";
    var acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "order-feedback__accept-btn facility-log__accept-btn";
    acceptBtn.setAttribute("data-entry-id", entry.id || "");
    acceptBtn.textContent = "접수";
    acts.appendChild(acceptBtn);
    li.appendChild(acts);
  }

  function appendOrderCard(li, entry, isCompleted, logKind) {
    appendFacilityLogCardHead(li, entry, {
      showAcceptLines: true,
      roomMetaToggle: true,
    });
    appendOrderMemoBody(li, entry);

    if (isCompleted) {
      li.classList.add("order-work-item--deployed");
      appendFacilityLogCardFoot(li, entry);
      if (logKind && isFacilityLogChatOpen(logKind, entry.id)) {
        li.classList.add("is-chat-open");
        appendFacilityLogChatUi(li, entry, logKind);
      } else {
        li.classList.add("is-chat-toggle");
        li.setAttribute("title", "클릭하면 대화 내용 보기");
      }
      return;
    }

    if (logKind) {
      appendFacilityLogChatUi(li, entry, logKind);
    }

    var acts = document.createElement("div");
    acts.className = "order-work__actions order-work__actions--toggle";
    var completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "order-work__wan-btn facility-log__complete-btn";
    completeBtn.setAttribute("data-entry-id", entry.id || "");
    completeBtn.textContent = "완료";
    completeBtn.setAttribute("aria-label", "완료 처리");
    acts.appendChild(completeBtn);
    li.appendChild(acts);
  }

  function renderAlertFeedbackList(listId, emptyId, entries, categoryLabel, listOpts) {
    listOpts = listOpts || {};
    var searchQuery = listOpts.searchQuery != null ? listOpts.searchQuery : "";
    var list = document.getElementById(listId);
    var empty = emptyId ? document.getElementById(emptyId) : null;
    if (!list) return;
    list.innerHTML = "";
    var alerts = (entries || [])
      .filter(function (e) {
        return getEntryPhase(e) === "alert" && entryMatchesSearch(e, searchQuery);
      })
      .sort(function (a, b) {
        return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
      });
    alerts.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-feedback__item facility-log__alert-item";
      if (listOpts.roomMetaToggle) li.classList.add("facility-log-card");
      li.setAttribute("data-entry-id", entry.id || "");
      appendAlertCard(li, entry, categoryLabel, { roomMetaToggle: !!listOpts.roomMetaToggle });
      list.appendChild(li);
    });
    if (empty) empty.hidden = alerts.length > 0;
  }

  function renderOrderWorkLists(acceptedListEl, acceptedEmptyEl, completedListEl, completedEmptyEl, entries, logKind, searchQuery) {
    if (!acceptedListEl || !completedListEl) return;
    acceptedListEl.innerHTML = "";
    completedListEl.innerHTML = "";
    var query = searchQuery != null ? searchQuery : "";

    var accepted = (entries || []).filter(function (e) {
      return getEntryPhase(e) === "accepted" && entryMatchesSearch(e, query);
    });
    var completed = (entries || []).filter(function (e) {
      return getEntryPhase(e) === "completed" && entryMatchesSearch(e, query);
    });

    accepted.sort(function (a, b) {
      return new Date(a.acceptedAt || a.at || 0).getTime() - new Date(b.acceptedAt || b.at || 0).getTime();
    });
    completed.sort(function (a, b) {
      return new Date(a.completedAt || a.at || 0).getTime() - new Date(b.completedAt || b.at || 0).getTime();
    });

    accepted.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item facility-log-card";
      li.setAttribute("data-entry-id", entry.id || "");
      appendOrderCard(li, entry, false, logKind);
      acceptedListEl.appendChild(li);
    });

    completed.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item order-work-item--deployed facility-log-card";
      li.setAttribute("data-entry-id", entry.id || "");
      appendOrderCard(li, entry, true, logKind);
      completedListEl.appendChild(li);
    });

    if (acceptedEmptyEl) acceptedEmptyEl.hidden = accepted.length > 0;
    if (completedEmptyEl) completedEmptyEl.hidden = completed.length > 0;
  }

  function countPhases(list) {
    var alertN = 0;
    var acceptedN = 0;
    var completedN = 0;
    (list || []).forEach(function (e) {
      var p = getEntryPhase(e);
      if (p === "alert") alertN++;
      else if (p === "accepted") acceptedN++;
      else if (p === "completed") completedN++;
    });
    return { alert: alertN, accepted: acceptedN, completed: completedN };
  }

  function miscStatusText(log) {
    var parts = MISC_UI_CATEGORIES.map(function (c) {
      var counts = countPhases(getMiscEntriesForCategory(log, c.key));
      return (
        c.label +
        " 알림" +
        counts.alert +
        "·접수" +
        counts.accepted +
        "·완료" +
        counts.completed
      );
    });
    var base = parts.join(" · ");
    if (log.retainUntil) {
      return base + " · 관리자 마감 후 " + formatAt(log.retainUntil) + "까지 보관";
    }
    return base;
  }

  function dailyStatusText(log) {
    var counts = countPhases(log.entries || []);
    var base =
      "알림 " + counts.alert + " · 접수 " + counts.accepted + " · 완료 " + counts.completed;
    if (log.retainUntil) {
      return base + " · 관리자 마감 후 " + formatAt(log.retainUntil) + "까지 보관";
    }
    return base;
  }

  function renderMiscAlertPanel() {
    var log = loadMiscLog();
    var searchQuery = readMiscSearchQuery();
    var alerts = [];
    MISC_CATEGORIES.forEach(function (cat) {
      (log.entries[cat.key] || []).forEach(function (entry) {
        if (getEntryPhase(entry) === "alert" && entryMatchesSearch(entry, searchQuery)) {
          alerts.push({ entry: entry, categoryLabel: miscCategoryLabel(cat.key) });
        }
      });
    });
    alerts.sort(function (a, b) {
      return new Date(a.entry.at || 0).getTime() - new Date(b.entry.at || 0).getTime();
    });
    var list = document.getElementById("facilityMiscFeedbackList");
    var empty = document.getElementById("facilityMiscFeedbackEmpty");
    if (!list) return;
    list.innerHTML = "";
    alerts.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "order-feedback__item facility-log__alert-item facility-log-card";
      li.setAttribute("data-entry-id", row.entry.id || "");
      appendAlertCard(li, row.entry, row.categoryLabel, { roomMetaToggle: true });
      list.appendChild(li);
    });
    if (empty) empty.hidden = alerts.length > 0;
  }

  function renderDailyAlertPanel() {
    var log = loadDailyFoundLog();
    renderAlertFeedbackList(
      "facilityDailyFoundFeedbackList",
      "facilityDailyFoundFeedbackEmpty",
      log.entries,
      "",
      { roomMetaToggle: true, searchQuery: readDailySearchQuery() }
    );
  }

  function renderMiscPanels() {
    renderMiscAlertPanel();
    renderMiscPanel();
  }

  function renderDailyPanels() {
    renderDailyAlertPanel();
    renderDailyPanel();
  }

  function renderMiscPanel() {
    var panel = document.getElementById("facilityMiscPanel");
    if (!panel || panel.hidden) return;
    var log = loadMiscLog();
    var statusEl = document.getElementById("facilityMiscStatus");
    if (statusEl) statusEl.textContent = miscStatusText(log);
    document.querySelectorAll("#facilityMiscTabs .facility-log-tab").forEach(function (btn) {
      var key = btn.getAttribute("data-category");
      btn.classList.toggle("is-active", key === activeMiscCategory);
      btn.setAttribute("aria-selected", key === activeMiscCategory ? "true" : "false");
    });
    updateMiscClassifyHint(
      (document.getElementById("facilityMiscMemo") || {}).value || ""
    );
    renderOrderWorkLists(
      document.getElementById("facilityMiscAcceptedList"),
      document.getElementById("facilityMiscAcceptedEmpty"),
      document.getElementById("facilityMiscCompletedList"),
      document.getElementById("facilityMiscCompletedEmpty"),
      getMiscEntriesForCategory(log, activeMiscCategory),
      "misc",
      readMiscSearchQuery()
    );
  }

  function renderDailyPanel() {
    var panel = document.getElementById("facilityDailyFoundPanel");
    if (!panel || panel.hidden) return;
    var log = loadDailyFoundLog();
    var statusEl = document.getElementById("facilityDailyFoundStatus");
    if (statusEl) statusEl.textContent = dailyStatusText(log);
    renderOrderWorkLists(
      document.getElementById("facilityDailyFoundAcceptedList"),
      document.getElementById("facilityDailyFoundAcceptedEmpty"),
      document.getElementById("facilityDailyFoundCompletedList"),
      document.getElementById("facilityDailyFoundCompletedEmpty"),
      log.entries,
      "daily",
      readDailySearchQuery()
    );
  }

  function bindPanelCompleteActions(panelId, onComplete) {
    var panel = document.getElementById(panelId);
    if (!panel || panel.dataset.completeBound) return;
    panel.dataset.completeBound = "1";
    panel.addEventListener("click", function (e) {
      var btn = e.target.closest(".facility-log__complete-btn");
      if (!btn) return;
      var entryId = btn.getAttribute("data-entry-id");
      if (!entryId) return;
      var run = function () {
        onComplete(entryId);
      };
      if (!getOperatorName() && uiHooks.showOperatorGate) {
        uiHooks.showOperatorGate({ mode: "initial", onSaved: run });
        return;
      }
      run();
    });
  }

  function bindAlertAcceptActions(feedbackId, onAccept) {
    var panel = document.getElementById(feedbackId);
    if (!panel || panel.dataset.acceptBound) return;
    panel.dataset.acceptBound = "1";
    panel.addEventListener("click", function (e) {
      var cancelBtn = e.target.closest(".facility-log__cancel-btn");
      if (cancelBtn) {
        if (!(uiHooks.isFrontMode && uiHooks.isFrontMode())) return;
        e.preventDefault();
        e.stopPropagation();
        var cancelId = cancelBtn.getAttribute("data-entry-id");
        if (cancelId && uiHooks.openCancelConfirmModal) {
          uiHooks.openCancelConfirmModal(cancelId);
        }
        return;
      }
      var memoBtn = e.target.closest(".facility-log__memo-btn");
      if (memoBtn) {
        if (!(uiHooks.isFrontMode && uiHooks.isFrontMode())) return;
        e.preventDefault();
        e.stopPropagation();
        var memoId = memoBtn.getAttribute("data-entry-id");
        if (memoId) openFacilityLogMemoEditor(memoId);
        return;
      }
      var btn = e.target.closest(".facility-log__accept-btn");
      if (!btn) return;
      if (uiHooks.isFrontMode && uiHooks.isFrontMode()) return;
      var entryId = btn.getAttribute("data-entry-id");
      if (!entryId) return;
      var run = function () {
        onAccept(entryId);
      };
      if (!getOperatorName() && uiHooks.showOperatorGate) {
        uiHooks.showOperatorGate({ mode: "initial", onSaved: run });
        return;
      }
      run();
    });
  }

  function bindPanelChatActions(panelId) {
    var panel = document.getElementById(panelId);
    if (!panel || panel.dataset.chatBound) return;
    panel.dataset.chatBound = "1";
    panel.addEventListener("submit", function (e) {
      var form = e.target.closest(".facility-log-chat__form");
      if (!form || !panel.contains(form)) return;
      e.preventDefault();
      var entryId = form.getAttribute("data-entry-id");
      var kind = form.getAttribute("data-log-kind");
      if (!entryId || !kind) return;
      var input = form.querySelector('input[type="text"]');
      var text = input ? String(input.value || "").trim() : "";
      var image =
        uiHooks.hkGetPhoto && entryId
          ? uiHooks.hkGetPhoto(facilityLogChatKey(kind, entryId))
          : "";
      if (!text && !image) {
        if (input) input.focus();
        return;
      }
      appendFacilityLogChat(kind, entryId, text, image);
      if (input) input.value = "";
    });
  }

  function bindPanelCompletedChatToggle(panelId, kind, rerender) {
    var panel = document.getElementById(panelId);
    if (!panel || panel.dataset.completedChatBound) return;
    panel.dataset.completedChatBound = "1";
    panel.addEventListener("click", function (e) {
      if (
        e.target.closest(
          "button, .order-chat, a, input, textarea, label, .facility-log-card__room-toggle, .facility-log-card__meta, .facility-log-card__foot"
        )
      ) {
        return;
      }
      var card = e.target.closest(".order-work-item--deployed.facility-log-card");
      if (!card) return;
      var entryId = card.getAttribute("data-entry-id");
      if (!entryId) return;
      var key = facilityLogChatOpenKey(kind, entryId);
      openFacilityLogChatKey = openFacilityLogChatKey === key ? "" : key;
      rerender();
    });
  }

  function bindFacilityLogRoomMetaToggle(rootId) {
    var root = document.getElementById(rootId);
    if (!root || root.dataset.roomMetaBound) return;
    root.dataset.roomMetaBound = "1";
    function toggleFromTarget(target) {
      var roomBtn = target.closest(".facility-log-card__room-toggle");
      if (!roomBtn || !root.contains(roomBtn)) return;
      var card = roomBtn.closest(".facility-log-card");
      if (!card) return;
      card.classList.toggle("is-meta-expanded");
    }
    root.addEventListener("click", function (e) {
      if (!e.target.closest(".facility-log-card__room-toggle")) return;
      e.preventDefault();
      e.stopPropagation();
      toggleFromTarget(e.target);
    });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (!e.target.closest(".facility-log-card__room-toggle")) return;
      e.preventDefault();
      e.stopPropagation();
      toggleFromTarget(e.target);
    });
  }

  function bindForms() {
    bindPanelCompleteActions("facilityMiscPanel", completeMiscEntry);
    bindPanelCompleteActions("facilityDailyFoundPanel", completeDailyEntry);
    bindPanelChatActions("facilityMiscPanel");
    bindPanelChatActions("facilityDailyFoundPanel");
    bindPanelCompletedChatToggle("facilityMiscPanel", "misc", renderMiscPanel);
    bindPanelCompletedChatToggle("facilityDailyFoundPanel", "daily", renderDailyPanel);
    bindAlertAcceptActions("facilityMiscFeedback", acceptMiscEntry);
    bindAlertAcceptActions("facilityDailyFoundFeedback", acceptDailyEntry);
    bindFacilityLogRoomMetaToggle("facilityMiscPanel");
    bindFacilityLogRoomMetaToggle("facilityMiscFeedback");
    bindFacilityLogRoomMetaToggle("facilityDailyFoundPanel");
    bindFacilityLogRoomMetaToggle("facilityDailyFoundFeedback");

    var miscForm = document.getElementById("facilityMiscForm");
    if (miscForm && !miscForm.dataset.bound) {
      miscForm.dataset.bound = "1";
      miscForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var roomEl = document.getElementById("facilityMiscRoom");
        var memoEl = document.getElementById("facilityMiscMemo");
        var room = roomEl ? String(roomEl.value || "").trim() : "";
        var memo = memoEl ? String(memoEl.value || "").trim() : "";
        var image = uiHooks.hkGetPhoto ? uiHooks.hkGetPhoto("facilityMiscOrderMemo") : "";
        if (!room) {
          if (roomEl) roomEl.focus();
          return;
        }
        if (!memo && !image) {
          if (memoEl) memoEl.focus();
          return;
        }
        var send = function () {
          var classified = classifyMiscCategory(memo, activeMiscCategory);
          createMiscOrder(
            room,
            memo,
            image,
            classified.score > 0 ? classified.key : activeMiscCategory
          );
          if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto("facilityMiscOrderMemo");
          if (roomEl) roomEl.value = "";
          if (memoEl) memoEl.value = "";
          if (memoEl) memoEl.focus();
          updateMiscClassifyHint("");
        };
        if (!getOperatorName() && uiHooks.showOperatorGate) {
          uiHooks.showOperatorGate({ mode: "initial", onSaved: send });
          return;
        }
        send();
      });
    }

    var dailyForm = document.getElementById("facilityDailyFoundForm");
    if (dailyForm && !dailyForm.dataset.bound) {
      dailyForm.dataset.bound = "1";
      dailyForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var roomEl = document.getElementById("facilityDailyFoundRoom");
        var memoEl = document.getElementById("facilityDailyFoundMemo");
        var room = roomEl ? String(roomEl.value || "").trim() : "";
        var memo = memoEl ? String(memoEl.value || "").trim() : "";
        var image = uiHooks.hkGetPhoto ? uiHooks.hkGetPhoto("facilityDailyFoundOrderMemo") : "";
        if (!room) {
          if (roomEl) roomEl.focus();
          return;
        }
        if (!memo && !image) {
          if (memoEl) memoEl.focus();
          return;
        }
        var send = function () {
          createDailyOrder(room, memo, image);
          if (uiHooks.hkClearPhoto) uiHooks.hkClearPhoto("facilityDailyFoundOrderMemo");
          if (roomEl) roomEl.value = "";
          if (memoEl) memoEl.value = "";
          if (memoEl) memoEl.focus();
        };
        if (!getOperatorName() && uiHooks.showOperatorGate) {
          uiHooks.showOperatorGate({ mode: "initial", onSaved: send });
          return;
        }
        send();
      });
    }

    var miscMemoEl = document.getElementById("facilityMiscMemo");
    if (miscMemoEl && !miscMemoEl.dataset.classifyBound) {
      miscMemoEl.dataset.classifyBound = "1";
      miscMemoEl.addEventListener("input", function () {
        scheduleMiscClassifyFromInput(miscMemoEl.value);
      });
    }

    var miscSearchEl = document.getElementById("facilityMiscSearch");
    if (miscSearchEl && !miscSearchEl.dataset.bound) {
      miscSearchEl.dataset.bound = "1";
      miscSearchEl.addEventListener("input", function () {
        miscSearchQuery = String(miscSearchEl.value || "").trim();
        renderMiscPanels();
      });
      miscSearchEl.addEventListener("search", function () {
        miscSearchQuery = String(miscSearchEl.value || "").trim();
        renderMiscPanels();
      });
    }

    var dailySearchEl = document.getElementById("facilityDailyFoundSearch");
    if (dailySearchEl && !dailySearchEl.dataset.bound) {
      dailySearchEl.dataset.bound = "1";
      dailySearchEl.addEventListener("input", function () {
        dailySearchQuery = String(dailySearchEl.value || "").trim();
        renderDailyPanels();
      });
      dailySearchEl.addEventListener("search", function () {
        dailySearchQuery = String(dailySearchEl.value || "").trim();
        renderDailyPanels();
      });
    }

    document.querySelectorAll("#facilityMiscTabs .facility-log-tab").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        setActiveMiscCategory(btn.getAttribute("data-category") || "complaint", {
          hintMemo: (document.getElementById("facilityMiscMemo") || {}).value || "",
        });
        renderMiscPanels();
      });
    });

    var miscHtml = document.getElementById("btnFacilityMiscExportHtml");
    if (miscHtml && !miscHtml.dataset.bound) {
      miscHtml.dataset.bound = "1";
      miscHtml.addEventListener("click", function () {
        downloadMiscHtml(loadMiscLog());
      });
    }
    var miscXls = document.getElementById("btnFacilityMiscExportExcel");
    if (miscXls && !miscXls.dataset.bound) {
      miscXls.dataset.bound = "1";
      miscXls.addEventListener("click", function () {
        downloadMiscExcel(loadMiscLog());
      });
    }

    var dailyHtml = document.getElementById("btnFacilityDailyFoundExportHtml");
    if (dailyHtml && !dailyHtml.dataset.bound) {
      dailyHtml.dataset.bound = "1";
      dailyHtml.addEventListener("click", function () {
        downloadDailyHtml(loadDailyFoundLog());
      });
    }
    var dailyXls = document.getElementById("btnFacilityDailyFoundExportExcel");
    if (dailyXls && !dailyXls.dataset.bound) {
      dailyXls.dataset.bound = "1";
      dailyXls.addEventListener("click", function () {
        downloadDailyExcel(loadDailyFoundLog());
      });
    }
  }

  function onViewActivated(view) {
    activeView = view || "";
    bindForms();
    if (view === "facilityMisc") renderMiscPanels();
    if (view === "facilityDailyFound") renderDailyPanels();
  }

  function refreshFromRemote() {
    if (activeView === "facilityMisc") renderMiscPanels();
    if (activeView === "facilityDailyFound") renderDailyPanels();
  }

  function init(hooks) {
    uiHooks = hooks || {};
    bindForms();
  }

  global.HKFacilityLogs = {
    init: init,
    onViewActivated: onViewActivated,
    refreshFromRemote: refreshFromRemote,
    prepareForAdminCloseDay: prepareForAdminCloseDay,
    getMiscSignature: getMiscSignature,
    getDailySignature: getDailySignature,
    exportCloseDayMiscRows: exportCloseDayMiscRows,
    exportCloseDayDailyRows: exportCloseDayDailyRows,
    listMiscEntriesForExport: listMiscEntriesForExport,
    listDailyEntriesForExport: listDailyEntriesForExport,
    formatEntryPhaseLabel: formatEntryPhaseLabel,
    countMiscEntries: countMiscEntries,
    countDailyEntries: countDailyEntries,
    classifyMiscCategory: classifyMiscCategory,
    MISC_CATEGORIES: MISC_UI_CATEGORIES,
    MISC_UI_CATEGORIES: MISC_UI_CATEGORIES,
    getMiscSearchQuery: function () {
      return miscSearchQuery;
    },
    getDailySearchQuery: function () {
      return dailySearchQuery;
    },
    findFacilityLogEntry: findFacilityLogEntry,
    cancelFacilityLogEntry: cancelFacilityLogEntry,
    isFacilityLogEntryId: function (id) {
      return !!(id && String(id).indexOf("fl-") === 0);
    },
  };

  Object.defineProperty(global.HKFacilityLogs, "miscSearchQuery", {
    get: function () {
      return miscSearchQuery;
    },
    enumerable: true,
  });
  Object.defineProperty(global.HKFacilityLogs, "dailySearchQuery", {
    get: function () {
      return dailySearchQuery;
    },
    enumerable: true,
  });
})(typeof window !== "undefined" ? window : this);
