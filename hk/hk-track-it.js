/**
 * Track IT — FOUND / LOST
 * FOUND: 주소·우편번호 등록 · 발송 확인
 * LOST: 예약번호 등록 · 확인 시 FOUND로 이동
 * 마감해도 유지 (hkStorage.trackIt)
 */
(function (global) {
  var opts = {
    canEdit: function () {
      return true;
    },
    toast: function () {},
  };

  var formShipType = "cod"; // cod=착불, urgent=긴급
  var currentPage = "found"; // found | lost
  var editingId = "";
  var bound = false;
  var formDirty = false;
  var sortState = { col: "", dir: "" }; // dir: "" | "asc" | "desc"

  function isLostPage() {
    return currentPage === "lost";
  }

  function formHasTypedContent() {
    return !!(
      getField("trackItAddress") ||
      getField("trackItZip") ||
      getField("trackItName") ||
      getField("trackItPhone") ||
      getField("trackItItem") ||
      getField("trackItCheckoutDate") ||
      getField("trackItRoomNo") ||
      formShipType === "urgent"
    );
  }

  function isDirty() {
    return !!editingId || !!formDirty || formHasTypedContent();
  }

  function markFormDirty() {
    formDirty = true;
  }

  function clearFormDirty() {
    formDirty = false;
  }

  function formatKoreanPhone(raw) {
    var digits = String(raw || "").replace(/\D/g, "").slice(0, 11);
    if (!digits) return "";
    if (digits.indexOf("02") === 0) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 5) return digits.slice(0, 2) + "-" + digits.slice(2);
      if (digits.length <= 9) {
        return digits.slice(0, 2) + "-" + digits.slice(2, 5) + "-" + digits.slice(5);
      }
      return digits.slice(0, 2) + "-" + digits.slice(2, 6) + "-" + digits.slice(6, 10);
    }
    if (/^01[016789]/.test(digits)) {
      if (digits.length <= 3) return digits;
      if (digits.length <= 7) return digits.slice(0, 3) + "-" + digits.slice(3);
      if (digits.length === 10) {
        return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
      }
      return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7, 11);
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return digits.slice(0, 3) + "-" + digits.slice(3);
    if (digits.length <= 10) {
      return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
    }
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7, 11);
  }

  function applyPhoneInputFormat(el) {
    if (!el) return;
    var prev = String(el.value || "");
    var start = typeof el.selectionStart === "number" ? el.selectionStart : prev.length;
    var digitsBefore = prev.slice(0, start).replace(/\D/g, "").length;
    var formatted = formatKoreanPhone(prev);
    if (formatted === prev) return;
    el.value = formatted;
    var pos = 0;
    var seen = 0;
    while (pos < formatted.length && seen < digitsBefore) {
      if (/\d/.test(formatted.charAt(pos))) seen += 1;
      pos += 1;
    }
    try {
      el.setSelectionRange(pos, pos);
    } catch (ePos) {}
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function toDateInputValue(iso) {
    if (!iso) {
      var now = new Date();
      return (
        now.getFullYear() +
        "-" +
        pad2(now.getMonth() + 1) +
        "-" +
        pad2(now.getDate())
      );
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      var m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : "";
    }
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatDateDisplay(iso) {
    var v = toDateInputValue(iso);
    return v ? v.replace(/-/g, ".") : "—";
  }

  function recordKind(row) {
    return row && String(row.kind || "").toLowerCase() === "lost" ? "lost" : "found";
  }

  function loadPack() {
    if (!global.HKStorage || !global.HKStorage.load) {
      return { updatedAt: "", records: [] };
    }
    var data = global.HKStorage.load();
    if (typeof global.HKStorage.normalizeTrackIt === "function") {
      return global.HKStorage.normalizeTrackIt(data.trackIt);
    }
    return data.trackIt && typeof data.trackIt === "object"
      ? data.trackIt
      : { updatedAt: "", records: [] };
  }

  function persistRecords(records, stamp, deletedIds) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var prev = loadPack();
    var next = {
      updatedAt: stamp || new Date().toISOString(),
      records: records || [],
      deletedIds:
        deletedIds && typeof deletedIds === "object"
          ? deletedIds
          : prev.deletedIds && typeof prev.deletedIds === "object"
            ? prev.deletedIds
            : {},
    };
    if (typeof global.HKStorage.normalizeTrackIt === "function") {
      next = global.HKStorage.normalizeTrackIt(next);
    }
    data.trackIt = next;
    global.HKStorage.save(data);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
  }

  function makeId() {
    return (
      "trk-" +
      Date.now().toString(36) +
      "-" +
      Math.floor(Math.random() * 1e6).toString(36)
    );
  }

  function canEdit() {
    return !!opts.canEdit();
  }

  function syncShipTypeUi() {
    var btnCod = document.getElementById("trackItShipCod");
    var btnUrgent = document.getElementById("trackItShipUrgent");
    var isUrgent = formShipType === "urgent";
    if (btnCod) {
      btnCod.classList.toggle("is-selected", !isUrgent);
      btnCod.setAttribute("aria-pressed", !isUrgent ? "true" : "false");
    }
    if (btnUrgent) {
      btnUrgent.classList.toggle("is-selected", isUrgent);
      btnUrgent.setAttribute("aria-pressed", isUrgent ? "true" : "false");
    }
  }

  function syncPageUi() {
    var panel = document.getElementById("trackItPanel");
    if (panel) {
      panel.classList.toggle("track-it-page--lost", isLostPage());
      panel.classList.toggle("track-it-page--found", !isLostPage());
    }
    document.querySelectorAll("[data-track-it-page]").forEach(function (btn) {
      var on = btn.getAttribute("data-track-it-page") === currentPage;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var addrLabel = document.getElementById("trackItAddressLabel");
    if (addrLabel) {
      addrLabel.textContent = isLostPage() ? "예약번호" : "주소(가능시 건물명)";
    }
    var addrInput = document.getElementById("trackItAddress");
    if (addrInput) {
      addrInput.placeholder = isLostPage() ? "예약번호 입력" : "";
    }
    var thAddress = document.getElementById("trackItThAddress");
    if (thAddress) {
      thAddress.textContent = isLostPage() ? "예약번호" : "주소";
      thAddress.setAttribute("data-sort-key", isLostPage() ? "reservationNo" : "address");
    }
    var thShip = document.getElementById("trackItThShip");
    if (thShip) {
      thShip.textContent = isLostPage() ? "상태" : "발송";
      thShip.setAttribute("data-sort-key", isLostPage() ? "noneStatus" : "shipStatus");
    }
    syncSortHeadUi();
  }

  function syncSortHeadUi() {
    var table = document.querySelector("#trackItPanel .complaint-table");
    if (!table) return;
    table.querySelectorAll("thead th[data-sort-key]").forEach(function (th) {
      var key = th.getAttribute("data-sort-key") || "";
      var active = !!(sortState.col && sortState.dir && sortState.col === key);
      th.classList.toggle("is-sorted", active);
      if (active) th.setAttribute("data-sort", sortState.dir);
      else th.removeAttribute("data-sort");
    });
  }

  function cycleSort(col) {
    if (!col) return;
    if (sortState.col !== col) {
      sortState = { col: col, dir: "asc" };
    } else if (sortState.dir === "asc") {
      sortState = { col: col, dir: "desc" };
    } else if (sortState.dir === "desc") {
      sortState = { col: "", dir: "" };
    } else {
      sortState = { col: col, dir: "asc" };
    }
    syncSortHeadUi();
    renderTable();
  }

  function sortValue(row, col) {
    if (!row) return "";
    if (col === "shipType") return row.shipType === "urgent" ? "긴급" : "착불";
    if (col === "reservationNo") return row.reservationNo || row.address || "";
    if (col === "address") return row.address || "";
    if (col === "shipStatus") {
      if (row.discarded) return "폐기";
      if (row.shippedOk) return "발송 OK";
      return "";
    }
    if (col === "noneStatus") {
      return row.noneMarked ? "없음" : "";
    }
    if (col === "createdAt" || col === "checkoutDate") {
      return String(row[col] || "");
    }
    return row[col] != null ? String(row[col]) : "";
  }

  function compareSortValues(col, a, b) {
    var av = sortValue(a, col);
    var bv = sortValue(b, col);
    if (col === "createdAt" || col === "checkoutDate") {
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    }
    if (col === "roomNo" || col === "zip" || col === "phone") {
      var an = String(av).replace(/\D/g, "");
      var bn = String(bv).replace(/\D/g, "");
      if (an && bn && an !== bn) {
        var ai = Number(an);
        var bi = Number(bn);
        if (isFinite(ai) && isFinite(bi) && ai !== bi) return ai < bi ? -1 : 1;
      }
    }
    return String(av).localeCompare(String(bv), "ko", { numeric: true, sensitivity: "base" });
  }

  function applySort(list) {
    var items = (list || []).slice();
    if (!sortState.col || !sortState.dir) {
      items.sort(function (a, b) {
        var ta = (a && a.createdAt) || "";
        var tb = (b && b.createdAt) || "";
        if (ta !== tb) return String(ta).localeCompare(String(tb));
        return String((a && a.id) || "").localeCompare(String((b && b.id) || ""));
      });
      return items;
    }
    var dir = sortState.dir === "desc" ? -1 : 1;
    var col = sortState.col;
    items.sort(function (a, b) {
      var cmp = compareSortValues(col, a, b);
      if (cmp === 0) {
        return String((a && a.createdAt) || "").localeCompare(String((b && b.createdAt) || ""));
      }
      return cmp * dir;
    });
    return items;
  }

  function syncFormModeUi() {
    var submitBtn = document.querySelector("#trackItForm button[type='submit']");
    if (submitBtn) {
      submitBtn.textContent = editingId ? "수정 저장" : "등록";
    }
    var hint = document.getElementById("trackItEditHint");
    if (hint) {
      hint.hidden = !editingId;
      hint.textContent = editingId
        ? "목록에서 선택한 항목을 수정 중입니다. 저장하거나 취소를 누르세요."
        : "";
    }
    var cancelBtn = document.getElementById("btnTrackItEditCancel");
    if (cancelBtn) cancelBtn.hidden = !editingId;
    var tbody = document.getElementById("trackItTableBody");
    if (tbody) {
      tbody.querySelectorAll("tr[data-id]").forEach(function (tr) {
        tr.classList.toggle("is-editing", !!editingId && tr.getAttribute("data-id") === editingId);
      });
    }
  }

  function setField(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val != null ? String(val) : "";
  }

  function getField(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function normalizeRoomKey(s) {
    return String(s == null ? "" : s)
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function roomMatchesFilter(roomNo, query) {
    var q = normalizeRoomKey(query);
    if (!q) return true;
    return normalizeRoomKey(roomNo).indexOf(q) >= 0;
  }

  function resetForm() {
    editingId = "";
    formShipType = "cod";
    setField("trackItAddress", "");
    setField("trackItZip", "");
    setField("trackItName", "");
    setField("trackItPhone", "");
    setField("trackItItem", "");
    setField("trackItCheckoutDate", "");
    setField("trackItRoomNo", "");
    clearFormDirty();
    syncShipTypeUi();
    syncFormModeUi();
  }

  function setPage(page, optsPage) {
    optsPage = optsPage || {};
    var next = page === "lost" ? "lost" : "found";
    if (next === currentPage && !optsPage.force) {
      syncPageUi();
      return;
    }
    if (!optsPage.keepForm) resetForm();
    currentPage = next;
    sortState = { col: "", dir: "" };
    syncPageUi();
    renderTable();
  }

  function shipTypeLabel(t) {
    return t === "urgent" ? "긴급" : "착불";
  }

  function pageRecords(pack) {
    var want = isLostPage() ? "lost" : "found";
    return (pack.records || []).filter(function (row) {
      return recordKind(row) === want;
    });
  }

  function isRowVoided(row) {
    if (!row) return false;
    if (recordKind(row) === "lost") return !!row.noneMarked;
    return !!row.discarded;
  }

  function renderTable() {
    var tbody = document.getElementById("trackItTableBody");
    var empty = document.getElementById("trackItTableEmpty");
    if (!tbody) return;
    var pack = loadPack();
    var records = pageRecords(pack);
    var roomQuery = getField("trackItRoomNo");
    var filtered = records.filter(function (row) {
      return roomMatchesFilter(row && row.roomNo, roomQuery);
    });
    filtered = applySort(filtered);
    tbody.innerHTML = "";
    syncSortHeadUi();
    var pageName = isLostPage() ? "LOST" : "FOUND";
    if (!filtered.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = roomQuery
          ? "해당 객실번호의 " + pageName + "가 없습니다."
          : records.length
            ? "표시할 " + pageName + "가 없습니다."
            : "등록된 " + pageName + "가 없습니다.";
      }
      return;
    }
    if (empty) {
      empty.hidden = true;
      empty.textContent = "등록된 " + pageName + "가 없습니다.";
    }
    var editable = canEdit();
    var lost = isLostPage();
    filtered.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", row.id);
      if (editable) {
        tr.classList.add("is-clickable");
        tr.title = "클릭하여 위 입력칸에서 수정";
      }
      if (editingId && row.id === editingId) tr.classList.add("is-editing");
      if (!lost && row.shippedOk && !row.discarded) tr.classList.add("is-shipped-ok");
      if (isRowVoided(row)) tr.classList.add("is-voided");

      function fillCellText(cell, text) {
        var span = document.createElement("span");
        span.className = "track-it-cell-text";
        var v = text || "—";
        span.textContent = v;
        if (v && v !== "—") span.title = v;
        cell.appendChild(span);
        return cell;
      }

      function td(text, className) {
        var cell = document.createElement("td");
        if (className) cell.className = className;
        return fillCellText(cell, text);
      }

      tr.appendChild(td(formatDateDisplay(row.createdAt), "complaint-td-date complaint-td-narrow"));
      tr.appendChild(td(shipTypeLabel(row.shipType), "complaint-td-narrow"));
      if (lost) {
        tr.appendChild(td(row.reservationNo || row.address, "complaint-td-memo"));
        tr.appendChild(td("", "complaint-td-narrow track-it-col-zip"));
      } else {
        tr.appendChild(td(row.address, "complaint-td-memo"));
        tr.appendChild(td(row.zip, "complaint-td-narrow track-it-col-zip"));
      }
      tr.appendChild(td(row.name, "complaint-td-narrow"));
      tr.appendChild(td(row.phone, "complaint-td-narrow"));
      tr.appendChild(td(row.item, "complaint-td-memo"));
      tr.appendChild(td(row.checkoutDate ? formatDateDisplay(row.checkoutDate) : "", "complaint-td-narrow"));
      tr.appendChild(td(row.roomNo, "complaint-td-narrow track-it-col-room"));

      var tdShip = document.createElement("td");
      tdShip.className = "complaint-td-narrow track-it-ship-status track-it-col-ship";
      if (!lost) {
        if (row.discarded) {
          fillCellText(tdShip, "폐기");
          tdShip.classList.add("is-discarded");
        } else if (row.shippedOk) {
          fillCellText(tdShip, "발송 OK");
          tdShip.classList.add("is-ok");
        } else {
          fillCellText(tdShip, "—");
        }
      } else if (row.noneMarked) {
        fillCellText(tdShip, "없음");
        tdShip.classList.add("is-discarded");
      } else {
        fillCellText(tdShip, "—");
      }
      tr.appendChild(tdShip);

      var tdAct = document.createElement("td");
      tdAct.className = "complaint-td-actions";
      if (editable) {
        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "complaint-row-edit";
        edit.setAttribute("data-action", "edit");
        edit.title = "수정";
        edit.textContent = "수정";
        tdAct.appendChild(edit);
        var del = document.createElement("button");
        del.type = "button";
        del.className = "complaint-row-del";
        del.setAttribute("data-action", "delete");
        del.title = "행 삭제";
        del.textContent = "삭제";
        tdAct.appendChild(del);
        var confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        if (lost) {
          confirmBtn.className = "track-it-row-confirm";
          confirmBtn.setAttribute("data-action", "confirm-to-found");
          confirmBtn.title = "FOUND로 이동";
          confirmBtn.textContent = "확인";
          tdAct.appendChild(confirmBtn);
          var noneBtn = document.createElement("button");
          noneBtn.type = "button";
          noneBtn.className = "track-it-row-void" + (row.noneMarked ? " is-on" : "");
          noneBtn.setAttribute("data-action", "toggle-none");
          noneBtn.title = row.noneMarked ? "없음 해제" : "없음 표시";
          noneBtn.textContent = "없음";
          tdAct.appendChild(noneBtn);
        } else {
          confirmBtn.className = "track-it-row-confirm" + (row.shippedOk && !row.discarded ? " is-done" : "");
          confirmBtn.setAttribute("data-action", "confirm-ship");
          confirmBtn.title = row.shippedOk ? "발송 완료" : "발송 확인";
          confirmBtn.textContent = row.shippedOk && !row.discarded ? "발송 OK" : "확인";
          confirmBtn.disabled = !!row.shippedOk && !row.discarded;
          tdAct.appendChild(confirmBtn);
          var discardBtn = document.createElement("button");
          discardBtn.type = "button";
          discardBtn.className = "track-it-row-void" + (row.discarded ? " is-on" : "");
          discardBtn.setAttribute("data-action", "toggle-discard");
          discardBtn.title = row.discarded ? "폐기 해제" : "폐기 표시";
          discardBtn.textContent = "폐기";
          tdAct.appendChild(discardBtn);
        }
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function loadRecordIntoForm(id) {
    if (!canEdit() || !id) return;
    var pack = loadPack();
    var row = null;
    (pack.records || []).forEach(function (r) {
      if (r && r.id === id) row = r;
    });
    if (!row) return;
    var kind = recordKind(row);
    if (kind !== currentPage) {
      setPage(kind, { keepForm: true, force: true });
    }
    editingId = id;
    formShipType = row.shipType === "urgent" ? "urgent" : "cod";
    if (kind === "lost") {
      setField("trackItAddress", row.reservationNo || row.address || "");
      setField("trackItZip", "");
    } else {
      setField("trackItAddress", row.address);
      setField("trackItZip", row.zip);
    }
    setField("trackItName", row.name);
    setField("trackItPhone", formatKoreanPhone(row.phone));
    setField("trackItItem", row.item);
    setField("trackItCheckoutDate", toDateInputValue(row.checkoutDate));
    setField("trackItRoomNo", row.roomNo);
    clearFormDirty();
    syncShipTypeUi();
    syncFormModeUi();
    renderTable();
  }

  function deleteRecord(id) {
    if (!canEdit() || !id) return;
    if (!window.confirm("이 Track IT 항목을 삭제할까요?")) return;
    var pack = loadPack();
    var nowIso = new Date().toISOString();
    var next = (pack.records || []).filter(function (r) {
      return r && r.id !== id;
    });
    var deletedIds = Object.assign({}, pack.deletedIds || {});
    deletedIds[id] = nowIso;
    if (editingId === id) resetForm();
    persistRecords(next, nowIso, deletedIds);
    render();
    if (typeof opts.toast === "function") opts.toast("삭제되었습니다.");
  }

  function confirmShipRecord(id) {
    if (!canEdit() || !id) return;
    var pack = loadPack();
    var nowIso = new Date().toISOString();
    var found = false;
    var next = (pack.records || []).map(function (r) {
      if (!r || r.id !== id) return r;
      found = true;
      if (recordKind(r) !== "found") return r;
      if (r.shippedOk) return r;
      return Object.assign({}, r, {
        kind: "found",
        shippedOk: true,
        shippedAt: nowIso,
        discarded: false,
        updatedAt: nowIso,
      });
    });
    if (!found) {
      if (typeof opts.toast === "function") opts.toast("항목을 찾지 못했습니다.");
      return;
    }
    persistRecords(next, nowIso);
    render();
    if (typeof opts.toast === "function") opts.toast("발송 OK");
  }

  function toggleNoneMarked(id) {
    if (!canEdit() || !id) return;
    var pack = loadPack();
    var nowIso = new Date().toISOString();
    var found = false;
    var next = (pack.records || []).map(function (r) {
      if (!r || r.id !== id) return r;
      found = true;
      if (recordKind(r) !== "lost") return r;
      return Object.assign({}, r, {
        noneMarked: !r.noneMarked,
        updatedAt: nowIso,
      });
    });
    if (!found) return;
    persistRecords(next, nowIso);
    render();
  }

  function toggleDiscarded(id) {
    if (!canEdit() || !id) return;
    var pack = loadPack();
    var nowIso = new Date().toISOString();
    var found = false;
    var next = (pack.records || []).map(function (r) {
      if (!r || r.id !== id) return r;
      found = true;
      if (recordKind(r) !== "found") return r;
      var on = !r.discarded;
      return Object.assign({}, r, {
        discarded: on,
        updatedAt: nowIso,
      });
    });
    if (!found) return;
    persistRecords(next, nowIso);
    render();
  }

  function confirmLostToFound(id) {
    if (!canEdit() || !id) return;
    var pack = loadPack();
    var nowIso = new Date().toISOString();
    var moved = null;
    var next = (pack.records || []).map(function (r) {
      if (!r || r.id !== id) return r;
      if (recordKind(r) !== "lost") return r;
      moved = r;
      return Object.assign({}, r, {
        kind: "found",
        address: "",
        zip: "",
        reservationNo: r.reservationNo || r.address || "",
        shippedOk: false,
        shippedAt: "",
        noneMarked: false,
        discarded: false,
        updatedAt: nowIso,
      });
    });
    if (!moved) {
      if (typeof opts.toast === "function") opts.toast("항목을 찾지 못했습니다.");
      return;
    }
    if (editingId === id) resetForm();
    persistRecords(next, nowIso);
    setPage("found", { force: true });
    loadRecordIntoForm(id);
    if (typeof opts.toast === "function") {
      opts.toast("FOUND로 이동 · 주소·우편번호를 입력해 주세요.");
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!canEdit()) {
      if (typeof opts.toast === "function") opts.toast("등록 권한이 없습니다.");
      return;
    }
    var addressOrRes = getField("trackItAddress");
    var zip = getField("trackItZip");
    var name = getField("trackItName");
    var phone = formatKoreanPhone(getField("trackItPhone"));
    setField("trackItPhone", phone);
    var item = getField("trackItItem");
    var checkoutDate = getField("trackItCheckoutDate");
    var roomNo = getField("trackItRoomNo");
    var lost = isLostPage();

    if (lost) {
      if (!addressOrRes && !name && !phone && !item && !roomNo) {
        if (typeof opts.toast === "function") opts.toast("내용을 입력해 주세요.");
        return;
      }
    } else {
      if (!addressOrRes || !zip) {
        if (typeof opts.toast === "function") opts.toast("주소와 우편번호를 입력해 주세요.");
        return;
      }
    }

    var nowIso = new Date().toISOString();
    var pack = loadPack();
    var records = (pack.records || []).slice();
    var kind = lost ? "lost" : "found";
    var address = lost ? "" : addressOrRes;
    var reservationNo = lost ? addressOrRes : "";

    if (editingId) {
      var found = false;
      records = records.map(function (r) {
        if (!r || r.id !== editingId) return r;
        found = true;
        return {
          id: r.id,
          createdAt: r.createdAt || nowIso,
          updatedAt: nowIso,
          kind: kind,
          shipType: formShipType === "urgent" ? "urgent" : "cod",
          address: address,
          zip: lost ? "" : zip,
          reservationNo: lost ? reservationNo : r.reservationNo || "",
          name: name,
          phone: phone,
          item: item,
          checkoutDate: checkoutDate,
          roomNo: roomNo,
          shippedOk: !!r.shippedOk,
          shippedAt: r.shippedAt || "",
          noneMarked: !!r.noneMarked,
          discarded: !!r.discarded,
        };
      });
      if (!found) {
        if (typeof opts.toast === "function") opts.toast("수정할 항목을 찾지 못했습니다.");
        return;
      }
      persistRecords(records, nowIso);
      resetForm();
      render();
      if (typeof opts.toast === "function") opts.toast("수정 저장되었습니다.");
      return;
    }

    records.push({
      id: makeId(),
      createdAt: nowIso,
      updatedAt: nowIso,
      kind: kind,
      shipType: formShipType === "urgent" ? "urgent" : "cod",
      address: address,
      zip: lost ? "" : zip,
      reservationNo: reservationNo,
      name: name,
      phone: phone,
      item: item,
      checkoutDate: checkoutDate,
      roomNo: roomNo,
      shippedOk: false,
      shippedAt: "",
      noneMarked: false,
      discarded: false,
    });
    persistRecords(records, nowIso);
    resetForm();
    render();
    if (typeof opts.toast === "function") opts.toast("등록되었습니다.");
  }

  function resetAll() {
    if (!canEdit()) return;
    if (!window.confirm("Track IT 등록 목록을 모두 비울까요? (마감과 별개)")) return;
    var pack = loadPack();
    var nowIso = new Date().toISOString();
    var deletedIds = Object.assign({}, pack.deletedIds || {});
    (pack.records || []).forEach(function (r) {
      if (r && r.id) deletedIds[r.id] = nowIso;
    });
    persistRecords([], nowIso, deletedIds);
    resetForm();
    render();
    if (typeof opts.toast === "function") opts.toast("Track IT가 초기화되었습니다.");
  }

  function stampNow() {
    var now = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return (
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      "_" +
      pad(now.getHours()) +
      pad(now.getMinutes())
    );
  }

  function sheetRows(records, lost) {
    var aoa;
    if (lost) {
      aoa = [["등록일", "배송", "예약번호", "성함", "휴대폰", "물건", "체크아웃", "객실"]];
      records.forEach(function (r) {
        if (!r) return;
        aoa.push([
          r.createdAt || r.updatedAt || "",
          r.shipType === "urgent" ? "긴급" : "착불",
          r.reservationNo || r.address || "",
          r.name || "",
          r.phone || "",
          r.item || "",
          r.checkoutDate || "",
          r.roomNo || "",
        ]);
      });
    } else {
      aoa = [
        ["등록일", "배송", "주소", "우편번호", "성함", "휴대폰", "물건", "체크아웃", "객실", "발송"],
      ];
      records.forEach(function (r) {
        if (!r) return;
        aoa.push([
          r.createdAt || r.updatedAt || "",
          r.shipType === "urgent" ? "긴급" : "착불",
          r.address || "",
          r.zip || "",
          r.name || "",
          r.phone || "",
          r.item || "",
          r.checkoutDate || "",
          r.roomNo || "",
          r.shippedOk ? "발송 OK" : "",
        ]);
      });
    }
    return aoa;
  }

  function downloadExcel() {
    if (typeof global.XLSX === "undefined" || !global.XLSX.utils || !global.XLSX.writeFile) {
      alert("엑셀 라이브러리를 불러오지 못했습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
      return;
    }
    var pack = loadPack();
    var all = pack.records || [];
    var foundRows = all.filter(function (r) {
      return recordKind(r) === "found";
    });
    var lostRows = all.filter(function (r) {
      return recordKind(r) === "lost";
    });
    var wb = global.XLSX.utils.book_new();
    var wsFound = global.XLSX.utils.aoa_to_sheet(sheetRows(foundRows, false));
    var wsLost = global.XLSX.utils.aoa_to_sheet(sheetRows(lostRows, true));
    global.XLSX.utils.book_append_sheet(wb, wsFound, "FOUND");
    global.XLSX.utils.book_append_sheet(wb, wsLost, "LOST");
    global.XLSX.writeFile(wb, "TrackIT_" + stampNow() + ".xlsx");
    if (typeof opts.toast === "function") opts.toast("Track IT 엑셀 저장됨");
  }

  function render(optsRender) {
    var preserveForm = !!(optsRender && optsRender.preserveForm) || isDirty();
    var hint = document.getElementById("trackItEditLockHint");
    if (hint) hint.hidden = canEdit();
    var form = document.getElementById("trackItForm");
    if (form) {
      form.querySelectorAll("input, button, select, textarea").forEach(function (el) {
        if (el.id === "btnTrackItEditCancel") return;
        if (el.tagName === "A") return;
        if (
          el.type === "submit" ||
          el.tagName === "BUTTON" ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT"
        ) {
          el.disabled = !canEdit();
        }
      });
    }
    document.querySelectorAll("[data-track-it-page]").forEach(function (btn) {
      btn.disabled = false;
    });
    syncPageUi();
    if (!preserveForm) {
      syncShipTypeUi();
      syncFormModeUi();
    } else {
      syncFormModeUi();
    }
    renderTable();
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    var form = document.getElementById("trackItForm");
    if (form) {
      form.addEventListener("submit", onSubmit);
      form.addEventListener("input", markFormDirty);
      form.addEventListener("change", markFormDirty);
    }

    document.querySelectorAll("[data-track-it-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var page = btn.getAttribute("data-track-it-page");
        if (page === currentPage) return;
        if (isDirty()) {
          if (!window.confirm("저장하지 않은 내용이 있습니다. 페이지를 바꿀까요?")) return;
        }
        setPage(page);
      });
    });

    var btnCod = document.getElementById("trackItShipCod");
    var btnUrgent = document.getElementById("trackItShipUrgent");
    if (btnCod) {
      btnCod.addEventListener("click", function () {
        formShipType = "cod";
        markFormDirty();
        syncShipTypeUi();
      });
    }
    if (btnUrgent) {
      btnUrgent.addEventListener("click", function () {
        formShipType = "urgent";
        markFormDirty();
        syncShipTypeUi();
      });
    }

    var cancelBtn = document.getElementById("btnTrackItEditCancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        resetForm();
        renderTable();
      });
    }

    var roomInput = document.getElementById("trackItRoomNo");
    if (roomInput) {
      roomInput.addEventListener("input", function () {
        markFormDirty();
        renderTable();
      });
    }

    var phoneInput = document.getElementById("trackItPhone");
    if (phoneInput) {
      phoneInput.setAttribute("inputmode", "tel");
      phoneInput.addEventListener("input", function () {
        applyPhoneInputFormat(phoneInput);
        markFormDirty();
      });
      phoneInput.addEventListener("blur", function () {
        applyPhoneInputFormat(phoneInput);
      });
    }

    var resetBtn = document.getElementById("btnTrackItResetAll");
    if (resetBtn) {
      resetBtn.addEventListener("click", resetAll);
    }

    var excelBtn = document.getElementById("btnTrackItExcel");
    if (excelBtn) {
      excelBtn.addEventListener("click", downloadExcel);
    }

    function syncWindowMaximizedClass() {
      try {
        var gap = 24;
        var maxed =
          !!document.fullscreenElement ||
          (window.outerWidth >= screen.availWidth - gap &&
            window.outerHeight >= screen.availHeight - gap);
        document.documentElement.classList.toggle("is-window-maximized", maxed);
      } catch (e) {}
    }
    syncWindowMaximizedClass();
    window.addEventListener("resize", syncWindowMaximizedClass);
    document.addEventListener("fullscreenchange", syncWindowMaximizedClass);

    var table = document.querySelector("#trackItPanel .complaint-table");
    if (table) {
      var thead = table.querySelector("thead");
      if (thead) {
        thead.addEventListener("click", function (e) {
          var th = e.target.closest("th[data-sort-key]");
          if (!th || !thead.contains(th)) return;
          e.preventDefault();
          cycleSort(th.getAttribute("data-sort-key") || "");
        });
      }
    }

    var tbody = document.getElementById("trackItTableBody");
    if (tbody) {
      tbody.addEventListener("click", function (e) {
        var del = e.target.closest('[data-action="delete"]');
        if (del) {
          e.preventDefault();
          e.stopPropagation();
          var trDel = del.closest("tr[data-id]");
          if (trDel) deleteRecord(trDel.getAttribute("data-id"));
          return;
        }
        var confirmShip = e.target.closest('[data-action="confirm-ship"]');
        if (confirmShip) {
          e.preventDefault();
          e.stopPropagation();
          if (confirmShip.disabled) return;
          var trConfirm = confirmShip.closest("tr[data-id]");
          if (trConfirm) confirmShipRecord(trConfirm.getAttribute("data-id"));
          return;
        }
        var confirmFound = e.target.closest('[data-action="confirm-to-found"]');
        if (confirmFound) {
          e.preventDefault();
          e.stopPropagation();
          var trMove = confirmFound.closest("tr[data-id]");
          if (trMove) confirmLostToFound(trMove.getAttribute("data-id"));
          return;
        }
        var noneBtn = e.target.closest('[data-action="toggle-none"]');
        if (noneBtn) {
          e.preventDefault();
          e.stopPropagation();
          var trNone = noneBtn.closest("tr[data-id]");
          if (trNone) toggleNoneMarked(trNone.getAttribute("data-id"));
          return;
        }
        var discardBtn = e.target.closest('[data-action="toggle-discard"]');
        if (discardBtn) {
          e.preventDefault();
          e.stopPropagation();
          var trDisc = discardBtn.closest("tr[data-id]");
          if (trDisc) toggleDiscarded(trDisc.getAttribute("data-id"));
          return;
        }
        var editBtn = e.target.closest('[data-action="edit"]');
        var tr = e.target.closest("tr[data-id]");
        if (!tr || !tbody.contains(tr)) return;
        if (!canEdit()) return;
        if (editBtn || !e.target.closest("button")) {
          loadRecordIntoForm(tr.getAttribute("data-id"));
        }
      });
    }
  }

  function init(userOpts) {
    opts = Object.assign({}, opts, userOpts || {});
    currentPage = "found";
    bindUi();
    resetForm();
    syncPageUi();
  }

  function onViewActivated() {
    render();
  }

  global.HKTrackIt = {
    init: init,
    render: render,
    onViewActivated: onViewActivated,
    downloadExcel: downloadExcel,
    isDirty: isDirty,
  };
})(typeof window !== "undefined" ? window : this);
