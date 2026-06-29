/**
 * 인벤 통보 — 이미지 보드 (붙여넣기 · 드래그 · 크기 조절, 프론트 모드만 편집)
 * 「통보」 버튼을 눌러야 서버에 저장·동기화됩니다.
 */
(function (global) {
  var skipNextRemoteRender = false;
  var lastRenderEditable = null;
  var uiReady = false;
  var interacting = false;
  var selectedId = null;
  var draftDirty = false;
  var publishFeedbackTimer = null;

  var els = {
    mount: null,
    toolbar: null,
    board: null,
    empty: null,
    fileInput: null,
    btnPhoto: null,
    btnDelete: null,
    btnPublish: null,
    toolbarHint: null,
    hint: null,
  };

  var state = { version: 4, images: [], table: { updatedAt: "", rows: [] } };

  var TABLE_KEYS = ["seq", "room", "confirmationNo", "itemCode1", "trace"];

  function emptyTableSide() {
    return { seq: "", room: "", confirmationNo: "", itemCode1: "", trace: "" };
  }

  function normalizeTableSide(raw) {
    var side = emptyTableSide();
    if (!raw || typeof raw !== "object") return side;
    TABLE_KEYS.forEach(function (key) {
      side[key] = raw[key] != null ? String(raw[key]) : "";
    });
    return side;
  }

  function normalizeTableRow(raw) {
    return {
      main: normalizeTableSide(raw && raw.main),
      annex: normalizeTableSide(raw && raw.annex),
    };
  }

  function normalizeTable(data) {
    var table = { updatedAt: "", rows: [] };
    if (!data || typeof data !== "object") return table;
    table.updatedAt = data.updatedAt != null ? String(data.updatedAt) : "";
    if (Array.isArray(data.rows)) {
      data.rows.forEach(function (row) {
        table.rows.push(normalizeTableRow(row));
      });
    }
    return table;
  }

  function newId() {
    return "inv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function normalizeImage(raw) {
    if (!raw || typeof raw !== "object") return null;
    var src = raw.src != null ? String(raw.src).trim() : "";
    if (!src) return null;
    return {
      id: raw.id ? String(raw.id) : newId(),
      src: src,
      x: typeof raw.x === "number" ? raw.x : parseFloat(raw.x) || 0,
      y: typeof raw.y === "number" ? raw.y : parseFloat(raw.y) || 0,
      w: Math.max(80, typeof raw.w === "number" ? raw.w : parseFloat(raw.w) || 400),
      h: Math.max(60, typeof raw.h === "number" ? raw.h : parseFloat(raw.h) || 300),
      zIndex: typeof raw.z === "number" ? raw.z : parseInt(raw.zIndex, 10) || 1,
    };
  }

  function normalizeInvenNotify(data) {
    var images = [];
    if (data && data.version >= 3 && Array.isArray(data.images)) {
      data.images.forEach(function (img) {
        var n = normalizeImage(img);
        if (n) images.push(n);
      });
    }
    var table = normalizeTable(data && data.table);
    return { version: 4, images: images, table: table };
  }

  function defaultInvenNotify() {
    return { version: 4, images: [], table: { updatedAt: "", rows: [] } };
  }

  function loadInvenNotify() {
    var storage = global.HKStorage ? global.HKStorage.load() : {};
    return normalizeInvenNotify(storage.invenNotify);
  }

  function saveInvenNotify(data) {
    if (!global.HKStorage) return;
    var storage = global.HKStorage.load();
    storage.invenNotify = normalizeInvenNotify(data);
    skipNextRemoteRender = true;
    global.HKStorage.save(storage);
  }

  function isFrontModeActive() {
    var btn = document.getElementById("btnFront");
    return !!(btn && btn.classList.contains("is-on"));
  }

  function markDraftDirty() {
    if (!isFrontModeActive()) return;
    draftDirty = true;
    updatePublishButton();
    updateToolbarHint();
  }

  function publishInvenNotify() {
    if (!isFrontModeActive()) {
      alert("프론트 모드에서만 통보할 수 있습니다.");
      return;
    }
    saveInvenNotify(state);
    draftDirty = false;
    updatePublishButton();
    updateToolbarHint();
    if (els.btnPublish) {
      var prev = els.btnPublish.textContent;
      els.btnPublish.textContent = "통보 완료";
      els.btnPublish.classList.add("is-done");
      if (publishFeedbackTimer) clearTimeout(publishFeedbackTimer);
      publishFeedbackTimer = setTimeout(function () {
        publishFeedbackTimer = null;
        if (els.btnPublish) {
          els.btnPublish.textContent = prev;
          els.btnPublish.classList.remove("is-done");
        }
        updatePublishButton();
      }, 1800);
    }
  }

  function compressImage(file, done) {
    if (!file) return;
    var mime = file.type ? String(file.type) : "";
    if (mime.indexOf("image/") !== 0 && !(file instanceof Blob)) {
      alert("이미지 파일만 붙여넣을 수 있습니다.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("8MB 이하 이미지만 사용할 수 있습니다.");
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var maxW = 1600;
        var w = img.width;
        var h = img.height;
        if (w > maxW) {
          h = Math.round(h * (maxW / w));
          w = maxW;
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        var quality = 0.85;
        var dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 900000 && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > 900000) {
          alert("이미지가 너무 큽니다. 더 작은 사진을 사용해 주세요.");
          return;
        }
        done(dataUrl, w, h);
      };
      img.onerror = function () {
        alert("이미지를 읽을 수 없습니다.");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function getBoardSize() {
    if (!els.board) return { w: 800, h: 600 };
    return {
      w: els.board.clientWidth || 800,
      h: els.board.clientHeight || 600,
    };
  }

  function nextZIndex() {
    var max = 0;
    state.images.forEach(function (img) {
      if (img.zIndex > max) max = img.zIndex;
    });
    return max + 1;
  }

  function addImageFromDataUrl(dataUrl, naturalW, naturalH, posX, posY) {
    var board = getBoardSize();
    var maxW = Math.min(board.w - 24, 1200);
    var w = Math.min(naturalW || maxW, maxW);
    var h = naturalH && naturalW ? Math.round(w * (naturalH / naturalW)) : Math.round(w * 0.75);
    var x = typeof posX === "number" ? posX : Math.max(12, (board.w - w) / 2);
    var y = typeof posY === "number" ? posY : 24 + state.images.length * 16;

    state.images.push({
      id: newId(),
      src: dataUrl,
      x: x,
      y: y,
      w: w,
      h: h,
      zIndex: nextZIndex(),
    });
    selectedId = state.images[state.images.length - 1].id;
    renderImages();
    updateEmpty();
    updateToolbar();
    markDraftDirty();
  }

  function addImageFromFile(file, posX, posY) {
    compressImage(file, function (dataUrl, w, h) {
      addImageFromDataUrl(dataUrl, w, h, posX, posY);
    });
  }

  function findImage(id) {
    for (var i = 0; i < state.images.length; i++) {
      if (state.images[i].id === id) return state.images[i];
    }
    return null;
  }

  function selectImage(id) {
    selectedId = id;
    if (!els.board) return;
    els.board.querySelectorAll(".inven-notify-img-item").forEach(function (el) {
      el.classList.toggle("is-selected", el.getAttribute("data-id") === id);
    });
    updateToolbar();
  }

  function deleteSelected() {
    if (!selectedId || !isFrontModeActive()) return;
    state.images = state.images.filter(function (img) {
      return img.id !== selectedId;
    });
    selectedId = null;
    renderImages();
    updateEmpty();
    updateToolbar();
    markDraftDirty();
  }

  function applyItemGeometry(el, img) {
    el.style.left = img.x + "px";
    el.style.top = img.y + "px";
    el.style.width = img.w + "px";
    el.style.height = img.h + "px";
    el.style.zIndex = String(img.zIndex || 1);
  }

  function setupDrag(itemEl, img, editable) {
    if (!editable) return;
    itemEl.addEventListener("mousedown", function (e) {
      if (!isFrontModeActive()) return;
      if (e.target.classList.contains("inven-notify-resize-handle")) return;
      e.preventDefault();
      selectImage(img.id);
      interacting = true;
      var startX = e.clientX;
      var startY = e.clientY;
      var origX = img.x;
      var origY = img.y;

      function onMove(ev) {
        img.x = Math.max(0, origX + (ev.clientX - startX));
        img.y = Math.max(0, origY + (ev.clientY - startY));
        applyItemGeometry(itemEl, img);
      }

      function onUp() {
        interacting = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        markDraftDirty();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function setupResize(handleEl, itemEl, img, editable) {
    if (!editable) return;
    handleEl.addEventListener("mousedown", function (e) {
      if (!isFrontModeActive()) return;
      e.preventDefault();
      e.stopPropagation();
      selectImage(img.id);
      interacting = true;
      var startX = e.clientX;
      var startY = e.clientY;
      var origW = img.w;
      var origH = img.h;

      function onMove(ev) {
        img.w = Math.max(80, origW + (ev.clientX - startX));
        img.h = Math.max(60, origH + (ev.clientY - startY));
        applyItemGeometry(itemEl, img);
      }

      function onUp() {
        interacting = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        markDraftDirty();
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function renderImages() {
    if (!els.board) return;
    els.board.querySelectorAll(".inven-notify-img-item").forEach(function (n) {
      n.remove();
    });
    var editable = isFrontModeActive();

    state.images.forEach(function (img) {
      var item = document.createElement("div");
      item.className =
        "inven-notify-img-item" + (img.id === selectedId ? " is-selected" : "");
      item.setAttribute("data-id", img.id);
      applyItemGeometry(item, img);

      var image = document.createElement("img");
      image.src = img.src;
      image.alt = "인벤 통보 이미지";
      image.draggable = false;
      item.appendChild(image);

      if (editable) {
        var handle = document.createElement("span");
        handle.className = "inven-notify-resize-handle";
        handle.title = "크기 조절";
        item.appendChild(handle);
        setupResize(handle, item, img, editable);
      }

      setupDrag(item, img, editable);

      item.addEventListener("click", function (e) {
        e.stopPropagation();
        if (editable) selectImage(img.id);
      });

      els.board.appendChild(item);
    });
  }

  function updateEmpty() {
    if (!els.empty) return;
    var hasImages = state.images.length > 0;
    var hasTable = state.table && state.table.rows && state.table.rows.length > 0;
    els.empty.hidden = hasImages || hasTable;
  }

  function updateToolbar() {
    if (!els.toolbar) return;
    var editable = isFrontModeActive();
    els.toolbar.hidden = !editable;
    if (els.btnDelete) {
      els.btnDelete.disabled = !editable || !selectedId;
    }
    updatePublishButton();
    updateToolbarHint();
  }

  function updatePublishButton() {
    if (!els.btnPublish) return;
    var editable = isFrontModeActive();
    var showingDone = els.btnPublish.classList.contains("is-done");
    if (!showingDone) {
      els.btnPublish.textContent = draftDirty ? "통보 (미동기화)" : "통보";
    }
    els.btnPublish.disabled = !editable;
    els.btnPublish.classList.toggle("inven-notify-btn-publish--dirty", draftDirty && !showingDone);
  }

  function updateToolbarHint() {
    if (!els.toolbarHint) return;
    if (!isFrontModeActive()) {
      els.toolbarHint.textContent = "";
      return;
    }
    els.toolbarHint.textContent = draftDirty
      ? "변경 내용은 통보 버튼을 눌러야 다른 화면에 반영됩니다"
      : "Ctrl+V 붙여넣기 · 드래그 이동 · 우하단 핸들로 크기 조절";
  }

  function updateHint() {
    if (!els.hint) return;
    els.hint.textContent = isFrontModeActive()
      ? "이미지를 배치한 뒤 「통보」 버튼을 누르면 다른 PC·정비관리 화면에 동기화됩니다."
      : "통보된 내용을 조회합니다. 수정은 프론트 모드를 켠 뒤 가능합니다.";
  }

  function handlePaste(e) {
    if (!isFrontModeActive()) return;
    var panel = document.getElementById("invenNotifyPanel");
    if (!panel || panel.hidden) return;
    if (!els.board) return;

    var file = null;
    if (e.clipboardData && e.clipboardData.items) {
      for (var i = 0; i < e.clipboardData.items.length; i++) {
        var it = e.clipboardData.items[i];
        if (it.type && it.type.indexOf("image") === 0) {
          file = it.getAsFile();
          break;
        }
      }
    }
    if (!file) return;
    e.preventDefault();
    addImageFromFile(file);
  }

  function handleKeydown(e) {
    if (!isFrontModeActive()) return;
    var panel = document.getElementById("invenNotifyPanel");
    if (!panel || panel.hidden) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      var active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      e.preventDefault();
      deleteSelected();
    }
  }

  function ensureUi() {
    var mount = document.getElementById("invenNotifyMount");
    if (!mount) return false;
    if (uiReady && els.mount === mount) return true;

    mount.innerHTML = "";

    var tableWrap = document.createElement("div");
    tableWrap.className = "inven-notify-table-wrap";
    tableWrap.id = "invenNotifyTableWrap";
    tableWrap.hidden = true;

    var table = document.createElement("table");
    table.className = "inven-notify-table";
    table.innerHTML =
      '<thead><tr>' +
      '<th class="inven-notify-table__section" colspan="5">본관동</th>' +
      '<th class="inven-notify-table__section" colspan="5">별관동</th>' +
      "</tr><tr>" +
      "<th>순번</th><th>룸번호</th><th>예약번호</th><th>대여물품</th><th>트레이스</th>" +
      "<th>순번</th><th>룸번호</th><th>예약번호</th><th>대여물품</th><th>트레이스</th>" +
      "</tr></thead><tbody id=\"invenNotifyTableBody\"></tbody>";
    tableWrap.appendChild(table);

    var toolbar = document.createElement("div");
    toolbar.className = "inven-notify-toolbar";
    toolbar.id = "invenNotifyToolbar";
    toolbar.hidden = true;

    var btnPhoto = document.createElement("button");
    btnPhoto.type = "button";
    btnPhoto.className = "hk-photo-btn";
    btnPhoto.id = "btnInvenNotifyPhoto";
    btnPhoto.textContent = "사진 추가";

    var btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "btn-order inven-notify-btn-delete";
    btnDelete.id = "btnInvenNotifyDelete";
    btnDelete.textContent = "선택 삭제";
    btnDelete.disabled = true;

    var btnPublish = document.createElement("button");
    btnPublish.type = "button";
    btnPublish.className = "btn-order inven-notify-btn-publish";
    btnPublish.id = "btnInvenNotifyPublish";
    btnPublish.textContent = "통보";

    var toolbarHint = document.createElement("span");
    toolbarHint.className = "inven-notify-toolbar__hint";
    toolbarHint.textContent = "Ctrl+V 붙여넣기";

    toolbar.appendChild(btnPhoto);
    toolbar.appendChild(btnDelete);
    toolbar.appendChild(toolbarHint);
    toolbar.appendChild(btnPublish);

    var board = document.createElement("div");
    board.className = "inven-notify-board";
    board.id = "invenNotifyBoard";
    board.setAttribute("tabindex", "0");
    board.setAttribute("role", "application");
    board.setAttribute("aria-label", "인벤 통보 이미지 보드");

    var empty = document.createElement("p");
    empty.className = "inven-notify-board__empty";
    empty.id = "invenNotifyEmpty";
    empty.textContent = "프론트 모드에서 Ctrl+V 또는 사진 추가로 이미지를 넣으세요.";
    board.appendChild(empty);

    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.id = "invenNotifyFileInput";
    fileInput.hidden = true;

    mount.appendChild(tableWrap);
    mount.appendChild(toolbar);
    mount.appendChild(board);
    mount.appendChild(fileInput);

    els.mount = mount;
    els.tableWrap = tableWrap;
    els.tableBody = document.getElementById("invenNotifyTableBody");
    els.toolbar = toolbar;
    els.board = board;
    els.empty = empty;
    els.fileInput = fileInput;
    els.btnPhoto = btnPhoto;
    els.btnDelete = btnDelete;
    els.btnPublish = btnPublish;
    els.toolbarHint = toolbarHint;
    els.hint = document.getElementById("invenNotifyHint");

    btnPhoto.addEventListener("click", function () {
      if (!isFrontModeActive()) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      addImageFromFile(fileInput.files[0]);
      fileInput.value = "";
    });

    btnDelete.addEventListener("click", function () {
      deleteSelected();
    });

    btnPublish.addEventListener("click", function () {
      publishInvenNotify();
    });

    board.addEventListener("click", function () {
      if (!isFrontModeActive()) return;
      board.focus();
      selectedId = null;
      board.querySelectorAll(".inven-notify-img-item").forEach(function (el) {
        el.classList.remove("is-selected");
      });
      updateToolbar();
    });

    if (!uiReady) {
      document.addEventListener("paste", handlePaste);
      document.addEventListener("keydown", handleKeydown);
    }

    uiReady = true;
    return true;
  }

  function isUserEditingInvenNotify() {
    return interacting || draftDirty;
  }

  function hasContent(data) {
    var n = normalizeInvenNotify(data);
    return n.images.length > 0 || n.table.rows.length > 0;
  }

  function escapeHtml(v) {
    return (v || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderTable() {
    if (!els.tableWrap || !els.tableBody) return;
    var rows = state.table && Array.isArray(state.table.rows) ? state.table.rows : [];
    var editable = isFrontModeActive();
    if (!rows.length) {
      els.tableWrap.hidden = true;
      els.tableBody.innerHTML = "";
      return;
    }
    els.tableWrap.hidden = false;
    var html = "";
    rows.forEach(function (row, rowIdx) {
      html += "<tr data-row-idx=\"" + rowIdx + "\">";
      ["main", "annex"].forEach(function (side) {
        var cells = row[side] || emptyTableSide();
        TABLE_KEYS.forEach(function (key) {
          var val = cells[key] != null ? String(cells[key]) : "";
          if (editable) {
            html +=
              '<td class="inven-notify-table__cell" contenteditable="true" spellcheck="false" data-side="' +
              side +
              '" data-key="' +
              key +
              '">' +
              escapeHtml(val) +
              "</td>";
          } else {
            html += '<td class="inven-notify-table__cell">' + escapeHtml(val) + "</td>";
          }
        });
      });
      html += "</tr>";
    });
    els.tableBody.innerHTML = html;
  }

  function bindTableCellEditors() {
    if (!els.tableBody || !isFrontModeActive()) return;
    els.tableBody.querySelectorAll(".inven-notify-table__cell[contenteditable]").forEach(function (td) {
      if (td.getAttribute("data-bound") === "1") return;
      td.setAttribute("data-bound", "1");
      td.addEventListener("input", function () {
        var tr = td.closest("tr");
        if (!tr) return;
        var rowIdx = parseInt(tr.getAttribute("data-row-idx"), 10);
        var side = td.getAttribute("data-side");
        var key = td.getAttribute("data-key");
        if (isNaN(rowIdx) || !side || !key || !state.table.rows[rowIdx]) return;
        if (!state.table.rows[rowIdx][side]) state.table.rows[rowIdx][side] = emptyTableSide();
        state.table.rows[rowIdx][side][key] = td.textContent || "";
        markDraftDirty();
      });
    });
  }

  function importInvenTable(rows, meta) {
    if (!Array.isArray(rows)) return;
    var normalized = [];
    rows.forEach(function (row) {
      normalized.push(normalizeTableRow(row));
    });
    state.table = {
      updatedAt: meta && meta.updatedAt ? String(meta.updatedAt) : new Date().toISOString(),
      rows: normalized,
    };
    if (isFrontModeActive()) {
      markDraftDirty();
    } else {
      saveInvenNotify(state);
    }
    renderTable();
    bindTableCellEditors();
    updateEmpty();
  }

  function exportFlatRows(invenNotify) {
    return normalizeInvenNotify(invenNotify).images.map(function (img, i) {
      return [
        String(i + 1),
        Math.round(img.x) + "," + Math.round(img.y),
        Math.round(img.w) + "×" + Math.round(img.h),
        img.src ? "있음" : "—",
      ];
    });
  }

  function renderInvenNotifyPanel(force) {
    var panel = document.getElementById("invenNotifyPanel");
    if (!panel || panel.hidden) return;
    if (!ensureUi()) return;

    var editable = isFrontModeActive();
    if (!force && skipNextRemoteRender) {
      skipNextRemoteRender = false;
      if (editable === lastRenderEditable && isUserEditingInvenNotify()) return;
    }
    if (!force && interacting) return;
    if (!force && editable && draftDirty) return;

    if (!editable) {
      draftDirty = false;
      state = loadInvenNotify();
    } else if (!draftDirty) {
      state = loadInvenNotify();
    }

    lastRenderEditable = editable;
    updateHint();
    updateToolbar();

    if (els.board) {
      els.board.classList.toggle("inven-notify-board--readonly", !editable);
      els.board.classList.toggle("inven-notify-board--draft", editable && draftDirty);
    }

    renderTable();
    bindTableCellEditors();
    renderImages();
    updateEmpty();
  }

  function initInvenNotify() {
    ensureUi();
    renderInvenNotifyPanel(true);
  }

  global.HKInvenNotify = {
    defaultInvenNotify: defaultInvenNotify,
    normalizeInvenNotify: normalizeInvenNotify,
    load: loadInvenNotify,
    save: saveInvenNotify,
    publish: publishInvenNotify,
    render: renderInvenNotifyPanel,
    init: initInvenNotify,
    isFrontModeActive: isFrontModeActive,
    hasContent: hasContent,
    exportFlatRows: exportFlatRows,
    importInvenTable: importInvenTable,
    isDraftDirty: function () {
      return draftDirty;
    },
  };
})(typeof window !== "undefined" ? window : this);
