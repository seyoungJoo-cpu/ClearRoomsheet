/**
 * 채팅 말풍선 — 사용자별 파스텔 색상
 * + UI 테마 (이름 클릭 피커에서 선택, 기본 파랑)
 */
(function (global) {
  var LS_KEY = "lotte-hk-chat-user-colors-v1";
  var THEME_LS_KEY = "lotte-hk-ui-theme-by-user-v1";
  var DEFAULT_THEME_ID = "blue";

  var PASTELS = [
    { id: "mint", bg: "#d1fae5", border: "#6ee7b7", text: "#064e3b", by: "#047857" },
    { id: "sky", bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e", by: "#0369a1" },
    { id: "lavender", bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95", by: "#6d28d9" },
    { id: "rose", bg: "#ffe4e6", border: "#fda4af", text: "#881337", by: "#be123c" },
    { id: "peach", bg: "#ffedd5", border: "#fdba74", text: "#7c2d12", by: "#c2410c" },
    { id: "lemon", bg: "#fef9c3", border: "#fde047", text: "#713f12", by: "#a16207" },
    { id: "sage", bg: "#ecfccb", border: "#bef264", text: "#365314", by: "#4d7c0f" },
    { id: "blush", bg: "#fce7f3", border: "#f9a8d4", text: "#831843", by: "#9d174d" },
    { id: "ice", bg: "#e0e7ff", border: "#a5b4fc", text: "#312e81", by: "#4338ca" },
    { id: "sand", bg: "#fef3c7", border: "#fcd34d", text: "#78350f", by: "#b45309" },
    { id: "aqua", bg: "#cffafe", border: "#67e8f9", text: "#164e63", by: "#0e7490" },
    { id: "seafoam", bg: "#ccfbf1", border: "#5eead4", text: "#134e4a", by: "#0f766e" },
    { id: "celadon", bg: "#dcfce7", border: "#86efac", text: "#14532d", by: "#15803d" },
    { id: "honey", bg: "#fef08a", border: "#facc15", text: "#713f12", by: "#ca8a04" },
    { id: "apricot", bg: "#fed7aa", border: "#fb923c", text: "#7c2d12", by: "#ea580c" },
    { id: "coral", bg: "#ffddd6", border: "#fb7185", text: "#9f1239", by: "#e11d48" },
    { id: "pink", bg: "#fbcfe8", border: "#f472b6", text: "#831843", by: "#db2777" },
    { id: "orchid", bg: "#f5d0fe", border: "#e879f9", text: "#701a75", by: "#a21caf" },
    { id: "plum", bg: "#ede9fe", border: "#a78bfa", text: "#4c1d95", by: "#7c3aed" },
    { id: "periwinkle", bg: "#e0e7ff", border: "#818cf8", text: "#312e81", by: "#4f46e5" },
    { id: "cornflower", bg: "#dbeafe", border: "#60a5fa", text: "#1e3a8a", by: "#2563eb" },
    { id: "steel", bg: "#e2e8f0", border: "#94a3b8", text: "#1e293b", by: "#475569" },
    { id: "mist", bg: "#f1f5f9", border: "#cbd5e1", text: "#334155", by: "#64748b" },
    { id: "cloud", bg: "#f8fafc", border: "#e2e8f0", text: "#1e293b", by: "#475569" },
    { id: "linen", bg: "#fafaf9", border: "#d6d3d1", text: "#44403c", by: "#78716c" },
    { id: "cream", bg: "#fffbeb", border: "#fde68a", text: "#78350f", by: "#b45309" },
    { id: "vanilla", bg: "#fff7ed", border: "#fed7aa", text: "#7c2d12", by: "#c2410c" },
    { id: "melon", bg: "#d9f99d", border: "#a3e635", text: "#365314", by: "#4d7c0f" },
    { id: "jade", bg: "#a7f3d0", border: "#34d399", text: "#064e3b", by: "#059669" },
    { id: "teal", bg: "#99f6e4", border: "#2dd4bf", text: "#134e4a", by: "#0d9488" },
  ];

  var THEMES = [
    { id: "blue", label: "파랑", swatch: "#1565c0" },
    { id: "teal", label: "청록", swatch: "#0f766e" },
    { id: "green", label: "초록", swatch: "#15803d" },
    { id: "cyan", label: "시안", swatch: "#0891b2" },
    { id: "indigo", label: "인디고", swatch: "#4338ca" },
    { id: "violet", label: "보라", swatch: "#7c3aed" },
    { id: "pink", label: "핑크", swatch: "#db2777" },
    { id: "rose", label: "로즈", swatch: "#e11d48" },
    { id: "orange", label: "주황", swatch: "#ea580c" },
    { id: "amber", label: "앰버", swatch: "#d97706" },
    { id: "slate", label: "슬레이트", swatch: "#475569" },
    { id: "sky", label: "스카이", swatch: "#0284c7" },
    { id: "lime", label: "라임", swatch: "#65a30d" },
    { id: "emerald", label: "에메랄드", swatch: "#059669" },
    { id: "fuchsia", label: "푸시아", swatch: "#c026d3" },
    { id: "purple", label: "퍼플", swatch: "#9333ea" },
    { id: "red", label: "레드", swatch: "#dc2626" },
    { id: "yellow", label: "옐로", swatch: "#ca8a04" },
    { id: "brown", label: "브라운", swatch: "#92400e" },
    { id: "navy", label: "네이비", swatch: "#1e3a8a" },
    { id: "zinc", label: "징크", swatch: "#52525b" },
  ];

  function loadMap() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveMap(map) {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function loadThemeMap() {
    try {
      var raw = global.localStorage.getItem(THEME_LS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveThemeMap(map) {
    try {
      global.localStorage.setItem(THEME_LS_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function normName(name) {
    return String(name || "")
      .trim()
      .toLowerCase();
  }

  function getPaletteById(id) {
    for (var i = 0; i < PASTELS.length; i++) {
      if (PASTELS[i].id === id) return PASTELS[i];
    }
    return PASTELS[0];
  }

  function getThemeById(id) {
    for (var i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return THEMES[0];
  }

  function isValidThemeId(id) {
    return !!getThemeById(id) && getThemeById(id).id === id;
  }

  function hashName(name) {
    var s = normName(name);
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  function assignRandomColorId(name) {
    var n = normName(name);
    if (!n) return PASTELS[0].id;
    return PASTELS[hashName(n) % PASTELS.length].id;
  }

  function getColorIdForUser(name) {
    var key = normName(name);
    if (!key) return PASTELS[0].id;
    var map = loadMap();
    if (map[key]) return map[key];
    var id = assignRandomColorId(name);
    map[key] = id;
    saveMap(map);
    return id;
  }

  function setColorIdForUser(name, colorId) {
    var key = normName(name);
    if (!key || !colorId) return;
    var map = loadMap();
    map[key] = colorId;
    saveMap(map);
  }

  function getThemeIdForUser(name) {
    var key = normName(name);
    if (!key) return DEFAULT_THEME_ID;
    var map = loadThemeMap();
    var id = map[key];
    return isValidThemeId(id) ? id : DEFAULT_THEME_ID;
  }

  function setThemeIdForUser(name, themeId) {
    var key = normName(name);
    if (!key || !isValidThemeId(themeId)) return;
    var map = loadThemeMap();
    map[key] = themeId;
    saveThemeMap(map);
  }

  function applyTheme(themeId) {
    var id = isValidThemeId(themeId) ? themeId : DEFAULT_THEME_ID;
    var root = global.document && global.document.documentElement;
    if (!root) return id;
    root.setAttribute("data-hk-theme", id);
    return id;
  }

  function applyThemeForUser(name) {
    return applyTheme(getThemeIdForUser(name));
  }

  function applyBubbleColors(li, byName, byEl, textClass) {
    if (!li) return;
    var palette = getPaletteById(getColorIdForUser(byName));
    li.style.background = palette.bg;
    li.style.borderColor = palette.border;
    if (byEl) byEl.style.color = palette.by;
    if (textClass) {
      var textEl = li.querySelector("." + textClass);
      if (textEl) textEl.style.color = palette.text;
    }
  }

  function closeColorPicker() {
    var el = global.document.getElementById("chatColorPicker");
    if (el) {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
  }

  function openColorPicker(anchorEl, userName, onChanged) {
    var picker = global.document.getElementById("chatColorPicker");
    var swatches = global.document.getElementById("chatColorPickerSwatches");
    var themeSwatches = global.document.getElementById("chatThemePickerSwatches");
    if (!picker || !swatches || !anchorEl) return;
    var name = String(userName || "").trim();
    if (!name) return;

    swatches.innerHTML = "";
    var currentId = getColorIdForUser(name);

    PASTELS.forEach(function (p) {
      var btn = global.document.createElement("button");
      btn.type = "button";
      btn.className = "chat-color-picker__swatch";
      btn.title = p.id;
      btn.style.background = p.bg;
      btn.style.borderColor = p.border;
      if (p.id === currentId) btn.classList.add("is-selected");
      btn.addEventListener("click", function () {
        setColorIdForUser(name, p.id);
        closeColorPicker();
        if (typeof onChanged === "function") onChanged({ type: "bubble", id: p.id });
      });
      swatches.appendChild(btn);
    });

    if (themeSwatches) {
      themeSwatches.innerHTML = "";
      var currentThemeId = getThemeIdForUser(name);
      THEMES.forEach(function (t) {
        var btn = global.document.createElement("button");
        btn.type = "button";
        btn.className = "chat-color-picker__swatch chat-color-picker__swatch--theme";
        btn.title = t.label;
        btn.setAttribute("aria-label", "테마 " + t.label);
        btn.style.background = t.swatch;
        btn.style.borderColor = t.swatch;
        if (t.id === currentThemeId) btn.classList.add("is-selected");
        btn.addEventListener("click", function () {
          setThemeIdForUser(name, t.id);
          applyTheme(t.id);
          closeColorPicker();
          if (typeof onChanged === "function") onChanged({ type: "theme", id: t.id });
        });
        themeSwatches.appendChild(btn);
      });
    }

    var rect = anchorEl.getBoundingClientRect();
    picker.style.top = rect.bottom + 6 + "px";
    picker.style.left = Math.max(8, rect.left) + "px";
    picker.hidden = false;
    picker.setAttribute("aria-hidden", "false");
  }

  function bindOperatorColorPicker(anchorEl, getUserName, onChanged) {
    if (!anchorEl || anchorEl.__chatColorBound) return;
    anchorEl.__chatColorBound = true;
    anchorEl.classList.add("brand-operator--color-picker");
    anchorEl.setAttribute("title", "채팅 색상 · 테마 선택");
    anchorEl.addEventListener("click", function () {
      var name = typeof getUserName === "function" ? getUserName() : "";
      if (!String(name || "").trim()) return;
      openColorPicker(anchorEl, name, onChanged);
    });
  }

  if (!global.document.__chatColorPickerDocBound) {
    global.document.__chatColorPickerDocBound = true;
    global.document.addEventListener("click", function (e) {
      var picker = global.document.getElementById("chatColorPicker");
      if (!picker || picker.hidden) return;
      if (e.target.closest("#chatColorPicker")) return;
      if (e.target.closest(".brand-operator--color-picker")) return;
      closeColorPicker();
    });
  }

  // 기본 테마 적용 (이름 없을 때도 파랑)
  if (global.document && global.document.documentElement) {
    applyTheme(DEFAULT_THEME_ID);
  }

  global.HKChatColors = {
    PASTELS: PASTELS,
    THEMES: THEMES,
    DEFAULT_THEME_ID: DEFAULT_THEME_ID,
    getColorIdForUser: getColorIdForUser,
    setColorIdForUser: setColorIdForUser,
    getPaletteById: getPaletteById,
    getThemeIdForUser: getThemeIdForUser,
    setThemeIdForUser: setThemeIdForUser,
    getThemeById: getThemeById,
    applyTheme: applyTheme,
    applyThemeForUser: applyThemeForUser,
    applyBubbleColors: applyBubbleColors,
    openColorPicker: openColorPicker,
    closeColorPicker: closeColorPicker,
    bindOperatorColorPicker: bindOperatorColorPicker,
  };
})(typeof window !== "undefined" ? window : this);
