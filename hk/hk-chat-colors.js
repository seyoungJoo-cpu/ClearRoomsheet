/**
 * 채팅 말풍선 — 사용자별 파스텔 색상
 */
(function (global) {
  var LS_KEY = "lotte-hk-chat-user-colors-v1";

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
        if (typeof onChanged === "function") onChanged(p.id);
      });
      swatches.appendChild(btn);
    });

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
    anchorEl.setAttribute("title", "채팅 말풍선 색상 선택");
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

  global.HKChatColors = {
    PASTELS: PASTELS,
    getColorIdForUser: getColorIdForUser,
    setColorIdForUser: setColorIdForUser,
    getPaletteById: getPaletteById,
    applyBubbleColors: applyBubbleColors,
    openColorPicker: openColorPicker,
    closeColorPicker: closeColorPicker,
    bindOperatorColorPicker: bindOperatorColorPicker,
  };
})(typeof window !== "undefined" ? window : this);
