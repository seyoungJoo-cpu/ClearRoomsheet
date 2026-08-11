/**
 * Track IT — 착불/긴급 배송 등록 · 목록 클릭 후 폼에서 수정
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
  var editingId = "";
  var bound = false;

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

  function persistRecords(records, stamp) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var next = {
      updatedAt: stamp || new Date().toISOString(),
      records: records || [],
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
    syncShipTypeUi();
    syncFormModeUi();
  }

  function shipTypeLabel(t) {
    return t === "urgent" ? "긴급" : "착불";
  }

  function renderTable() {
    var tbody = document.getElementById("trackItTableBody");
    var empty = document.getElementById("trackItTableEmpty");
    if (!tbody) return;
    var pack = loadPack();
    var records = (pack.records || []).slice();
    tbody.innerHTML = "";
    if (!records.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    var editable = canEdit();
    records.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", row.id);
      if (editable) {
        tr.classList.add("is-clickable");
        tr.title = "클릭하여 위 입력칸에서 수정";
      }
      if (editingId && row.id === editingId) tr.classList.add("is-editing");

      function td(text, className) {
        var cell = document.createElement("td");
        if (className) cell.className = className;
        cell.textContent = text || "—";
        return cell;
      }

      tr.appendChild(td(formatDateDisplay(row.createdAt), "complaint-td-date complaint-td-narrow"));
      tr.appendChild(td(shipTypeLabel(row.shipType), "complaint-td-narrow"));
      tr.appendChild(td(row.address, "complaint-td-memo"));
      tr.appendChild(td(row.zip, "complaint-td-narrow"));
      tr.appendChild(td(row.name, "complaint-td-narrow"));
      tr.appendChild(td(row.phone, "complaint-td-narrow"));
      tr.appendChild(td(row.item, "complaint-td-memo"));
      tr.appendChild(td(row.checkoutDate ? formatDateDisplay(row.checkoutDate) : "", "complaint-td-narrow"));
      tr.appendChild(td(row.roomNo, "complaint-td-narrow"));

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
    editingId = id;
    formShipType = row.shipType === "urgent" ? "urgent" : "cod";
    setField("trackItAddress", row.address);
    setField("trackItZip", row.zip);
    setField("trackItName", row.name);
    setField("trackItPhone", row.phone);
    setField("trackItItem", row.item);
    setField("trackItCheckoutDate", toDateInputValue(row.checkoutDate));
    setField("trackItRoomNo", row.roomNo);
    syncShipTypeUi();
    syncFormModeUi();
  }

  function deleteRecord(id) {
    if (!canEdit() || !id) return;
    if (!window.confirm("이 Track IT 항목을 삭제할까요?")) return;
    var pack = loadPack();
    var next = (pack.records || []).filter(function (r) {
      return r && r.id !== id;
    });
    if (editingId === id) resetForm();
    persistRecords(next);
    render();
    if (typeof opts.toast === "function") opts.toast("삭제되었습니다.");
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!canEdit()) {
      if (typeof opts.toast === "function") opts.toast("등록 권한이 없습니다.");
      return;
    }
    var address = getField("trackItAddress");
    var zip = getField("trackItZip");
    var name = getField("trackItName");
    var phone = getField("trackItPhone");
    var item = getField("trackItItem");
    var checkoutDate = getField("trackItCheckoutDate");
    var roomNo = getField("trackItRoomNo");
    if (!address && !name && !phone && !item && !roomNo) {
      if (typeof opts.toast === "function") opts.toast("내용을 입력해 주세요.");
      return;
    }
    var nowIso = new Date().toISOString();
    var pack = loadPack();
    var records = (pack.records || []).slice();
    if (editingId) {
      var found = false;
      records = records.map(function (r) {
        if (!r || r.id !== editingId) return r;
        found = true;
        return {
          id: r.id,
          createdAt: r.createdAt || nowIso,
          updatedAt: nowIso,
          shipType: formShipType === "urgent" ? "urgent" : "cod",
          address: address,
          zip: zip,
          name: name,
          phone: phone,
          item: item,
          checkoutDate: checkoutDate,
          roomNo: roomNo,
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
      shipType: formShipType === "urgent" ? "urgent" : "cod",
      address: address,
      zip: zip,
      name: name,
      phone: phone,
      item: item,
      checkoutDate: checkoutDate,
      roomNo: roomNo,
    });
    persistRecords(records, nowIso);
    resetForm();
    render();
    if (typeof opts.toast === "function") opts.toast("등록되었습니다.");
  }

  function resetAll() {
    if (!canEdit()) return;
    if (!window.confirm("Track IT 등록 목록을 모두 비울까요? (마감과 별개)")) return;
    persistRecords([], new Date().toISOString());
    resetForm();
    render();
    if (typeof opts.toast === "function") opts.toast("Track IT가 초기화되었습니다.");
  }

  function render() {
    var hint = document.getElementById("trackItEditLockHint");
    if (hint) hint.hidden = canEdit();
    var form = document.getElementById("trackItForm");
    if (form) {
      form.querySelectorAll("input, button, select, textarea").forEach(function (el) {
        if (el.id === "btnTrackItEditCancel") return;
        if (el.tagName === "A") return;
        if (el.type === "submit" || el.tagName === "BUTTON" || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
          el.disabled = !canEdit();
        }
      });
    }
    syncShipTypeUi();
    syncFormModeUi();
    renderTable();
  }

  function bindUi() {
    if (bound) return;
    bound = true;
    var form = document.getElementById("trackItForm");
    if (form) form.addEventListener("submit", onSubmit);

    var btnCod = document.getElementById("trackItShipCod");
    var btnUrgent = document.getElementById("trackItShipUrgent");
    if (btnCod) {
      btnCod.addEventListener("click", function () {
        formShipType = "cod";
        syncShipTypeUi();
      });
    }
    if (btnUrgent) {
      btnUrgent.addEventListener("click", function () {
        formShipType = "urgent";
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

    var resetBtn = document.getElementById("btnTrackItResetAll");
    if (resetBtn) {
      resetBtn.addEventListener("click", resetAll);
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
    bindUi();
    resetForm();
  }

  function onViewActivated() {
    render();
  }

  global.HKTrackIt = {
    init: init,
    render: render,
    onViewActivated: onViewActivated,
  };
})(typeof window !== "undefined" ? window : this);
