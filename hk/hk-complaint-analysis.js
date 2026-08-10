/**
 * 고객불편사항 유형분석 — 등록·인라인 수정 · 유형별 월 집계
 * 마감해도 유지 (hkStorage.complaintTypeAnalysis)
 */
(function (global) {
  var TYPE_OPTIONS = [
    { id: "1", label: "1.고객응대, 업무처리" },
    { id: "2", label: "2.담배냄새" },
    { id: "3", label: "3.객실냄새" },
    { id: "4", label: "4.객실용품 및 대여용품" },
    { id: "5", label: "5.정비관련" },
    { id: "6", label: "6.해충(벌레)" },
    { id: "7", label: "7.시설관련" },
    { id: "8", label: "8.부대시설" },
    { id: "9", label: "9.소음" },
    { id: "10", label: "10.기타" },
  ];

  var typeLabelById = {};
  TYPE_OPTIONS.forEach(function (t) {
    typeLabelById[t.id] = t.label;
  });

  var opts = {
    isFrontMode: function () {
      return false;
    },
    toast: function () {},
    onLeaveWhenLocked: function () {},
  };

  var activePage = 1;
  var formTypeId = "";
  var formRoomChange = false;
  var statsYear = "all";
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

  function monthKeyFromIso(iso) {
    var v = toDateInputValue(iso);
    return v ? v.slice(0, 7) : "";
  }

  function dateIsoFromInput(dateStr, fallbackIso) {
    var s = String(dateStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return fallbackIso || new Date().toISOString();
    }
    var base = fallbackIso ? new Date(fallbackIso) : new Date();
    if (isNaN(base.getTime())) base = new Date();
    var hh = pad2(base.getHours());
    var mm = pad2(base.getMinutes());
    var ss = pad2(base.getSeconds());
    var local = new Date(s + "T" + hh + ":" + mm + ":" + ss);
    if (isNaN(local.getTime())) return new Date().toISOString();
    return local.toISOString();
  }

  function loadPack() {
    if (!global.HKStorage || !global.HKStorage.load) {
      return { updatedAt: "", records: [] };
    }
    var data = global.HKStorage.load();
    if (typeof global.HKStorage.normalizeComplaintTypeAnalysis === "function") {
      return global.HKStorage.normalizeComplaintTypeAnalysis(data.complaintTypeAnalysis);
    }
    return data.complaintTypeAnalysis && typeof data.complaintTypeAnalysis === "object"
      ? data.complaintTypeAnalysis
      : { updatedAt: "", records: [] };
  }

  function persistRecords(records, stamp) {
    if (!global.HKStorage || !global.HKStorage.save) return;
    var data = global.HKStorage.load();
    var next = {
      updatedAt: stamp || new Date().toISOString(),
      records: records || [],
    };
    if (typeof global.HKStorage.normalizeComplaintTypeAnalysis === "function") {
      next = global.HKStorage.normalizeComplaintTypeAnalysis(next);
    }
    data.complaintTypeAnalysis = next;
    global.HKStorage.save(data);
    if (global.HKSync && typeof global.HKSync.pushStorageNow === "function") {
      global.HKSync.pushStorageNow();
    }
  }

  function makeId() {
    return (
      "cmp-" +
      Date.now().toString(36) +
      "-" +
      Math.floor(Math.random() * 1e6).toString(36)
    );
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function syncFormTypeUi() {
    var wrap = document.getElementById("complaintTypeChips");
    if (!wrap) return;
    wrap.querySelectorAll("[data-type-id]").forEach(function (btn) {
      var on = btn.getAttribute("data-type-id") === formTypeId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function syncFormRoomChangeUi() {
    var btnO = document.getElementById("complaintRoomChangeO");
    var btnX = document.getElementById("complaintRoomChangeX");
    if (btnO) {
      btnO.classList.toggle("is-selected", formRoomChange);
      btnO.setAttribute("aria-pressed", formRoomChange ? "true" : "false");
    }
    if (btnX) {
      btnX.classList.toggle("is-selected", !formRoomChange);
      btnX.setAttribute("aria-pressed", !formRoomChange ? "true" : "false");
    }
  }

  function syncPageTabs() {
    document.querySelectorAll("[data-complaint-page]").forEach(function (btn) {
      var page = Number(btn.getAttribute("data-complaint-page"));
      var on = page === activePage;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var p1 = document.getElementById("complaintPage1");
    var p2 = document.getElementById("complaintPage2");
    if (p1) p1.hidden = activePage !== 1;
    if (p2) p2.hidden = activePage !== 2;
  }

  function resetForm() {
    formTypeId = "";
    formRoomChange = false;
    var res = document.getElementById("complaintReservationNo");
    var name = document.getElementById("complaintGuestName");
    var room = document.getElementById("complaintRoomNo");
    var memo = document.getElementById("complaintMemo");
    if (res) res.value = "";
    if (name) name.value = "";
    if (room) room.value = "";
    if (memo) memo.value = "";
    syncFormTypeUi();
    syncFormRoomChangeUi();
  }

  function canEdit() {
    return !!opts.isFrontMode();
  }

  function renderTypeChips() {
    var wrap = document.getElementById("complaintTypeChips");
    if (!wrap || wrap.__hkChipsBuilt) return;
    wrap.__hkChipsBuilt = true;
    wrap.innerHTML = "";
    TYPE_OPTIONS.forEach(function (t) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "complaint-type-chip";
      btn.setAttribute("data-type-id", t.id);
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = t.label;
      wrap.appendChild(btn);
    });
  }

  function renderTable() {
    var tbody = document.getElementById("complaintTableBody");
    var empty = document.getElementById("complaintTableEmpty");
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

      var tdDate = document.createElement("td");
      tdDate.className = "complaint-td-date complaint-td-narrow";
      if (editable) {
        var dateInp = document.createElement("input");
        dateInp.type = "date";
        dateInp.className = "complaint-cell-input";
        dateInp.value = toDateInputValue(row.createdAt);
        dateInp.setAttribute("data-field", "createdAt");
        tdDate.appendChild(dateInp);
      } else {
        tdDate.textContent = formatDateDisplay(row.createdAt);
      }
      tr.appendChild(tdDate);

      ["reservationNo", "guestName", "roomNo", "memo"].forEach(function (field) {
        var td = document.createElement("td");
        if (field === "memo") td.className = "complaint-td-memo";
        else td.className = "complaint-td-narrow";
        if (editable) {
          var inp = document.createElement("input");
          inp.type = "text";
          inp.className = "complaint-cell-input";
          inp.value = row[field] || "";
          inp.setAttribute("data-field", field);
          if (field === "memo") inp.setAttribute("maxlength", "200");
          td.appendChild(inp);
        } else {
          td.textContent = row[field] || "—";
        }
        tr.appendChild(td);
      });

      var tdType = document.createElement("td");
      tdType.className = "complaint-td-type complaint-td-narrow";
      if (editable) {
        var sel = document.createElement("select");
        sel.className = "complaint-cell-select";
        sel.setAttribute("data-field", "typeId");
        var optEmpty = document.createElement("option");
        optEmpty.value = "";
        optEmpty.textContent = "선택";
        sel.appendChild(optEmpty);
        TYPE_OPTIONS.forEach(function (t) {
          var o = document.createElement("option");
          o.value = t.id;
          o.textContent = t.label;
          if (String(row.typeId) === t.id) o.selected = true;
          sel.appendChild(o);
        });
        tdType.appendChild(sel);
      } else {
        tdType.textContent = typeLabelById[row.typeId] || "—";
      }
      tr.appendChild(tdType);

      var tdChange = document.createElement("td");
      tdChange.className = "complaint-td-roomchange";
      if (editable) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "complaint-ox-btn" + (row.roomChange ? " is-o" : " is-x");
        btn.setAttribute("data-field", "roomChange");
        btn.textContent = row.roomChange ? "O" : "X";
        tdChange.appendChild(btn);
      } else {
        tdChange.textContent = row.roomChange ? "O" : "X";
      }
      tr.appendChild(tdChange);

      var tdAct = document.createElement("td");
      tdAct.className = "complaint-td-actions";
      if (editable) {
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

  function buildStatsGrid(records, yearFilter) {
    var years = {};
    var monthsAll = {};
    (records || []).forEach(function (r) {
      var mk = monthKeyFromIso(r.createdAt);
      if (!mk) return;
      monthsAll[mk] = true;
      years[mk.slice(0, 4)] = true;
    });
    var yearList = Object.keys(years).sort();
    var months = Object.keys(monthsAll)
      .filter(function (m) {
        return yearFilter === "all" || m.indexOf(yearFilter + "-") === 0;
      })
      .sort();
    var counts = {};
    TYPE_OPTIONS.forEach(function (t) {
      counts[t.id] = {};
      months.forEach(function (m) {
        counts[t.id][m] = 0;
      });
    });
    (records || []).forEach(function (r) {
      var mk = monthKeyFromIso(r.createdAt);
      if (!mk || months.indexOf(mk) < 0) return;
      var tid = r.typeId && counts[r.typeId] ? r.typeId : null;
      if (!tid) return;
      counts[tid][mk] += 1;
    });
    return { yearList: yearList, months: months, counts: counts };
  }

  function renderStats() {
    var yearSel = document.getElementById("complaintStatsYear");
    var tableWrap = document.getElementById("complaintStatsTableWrap");
    var empty = document.getElementById("complaintStatsEmpty");
    if (!tableWrap) return;
    var pack = loadPack();
    var records = pack.records || [];
    var grid = buildStatsGrid(records, statsYear);
    if (yearSel) {
      var prev = statsYear;
      yearSel.innerHTML = "";
      var optAll = document.createElement("option");
      optAll.value = "all";
      optAll.textContent = "전체 연도";
      yearSel.appendChild(optAll);
      grid.yearList.forEach(function (y) {
        var o = document.createElement("option");
        o.value = y;
        o.textContent = y + "년";
        yearSel.appendChild(o);
      });
      if (prev !== "all" && grid.yearList.indexOf(prev) < 0) statsYear = "all";
      yearSel.value = statsYear;
      if (statsYear !== prev) {
        grid = buildStatsGrid(records, statsYear);
      }
    }

    if (!records.length || !grid.months.length) {
      tableWrap.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var months = grid.months;
    var counts = grid.counts;
    var html = [
      '<table class="complaint-stats-table" aria-label="유형별 월별 현황">',
      "<thead><tr><th>유형</th>",
    ];
    months.forEach(function (m) {
      html.push("<th>" + esc(m) + "</th>");
    });
    html.push("<th>합계</th></tr></thead><tbody>");
    TYPE_OPTIONS.forEach(function (t) {
      var rowTotal = 0;
      html.push("<tr><th scope=\"row\">" + esc(t.label) + "</th>");
      months.forEach(function (m) {
        var n = counts[t.id][m] || 0;
        rowTotal += n;
        html.push("<td>" + (n || "") + "</td>");
      });
      html.push("<td class=\"is-total\">" + rowTotal + "</td></tr>");
    });
    html.push('<tr class="complaint-stats-foot"><th scope="row">합계</th>');
    var grand = 0;
    months.forEach(function (m) {
      var col = 0;
      TYPE_OPTIONS.forEach(function (t) {
        col += counts[t.id][m] || 0;
      });
      grand += col;
      html.push("<td class=\"is-total\">" + col + "</td>");
    });
    html.push("<td class=\"is-total\">" + grand + "</td></tr>");
    html.push("</tbody></table>");
    tableWrap.innerHTML = html.join("");
  }

  function downloadStatsExcel() {
    var pack = loadPack();
    var records = pack.records || [];
    var grid = buildStatsGrid(records, statsYear);
    if (!records.length || !grid.months.length) {
      opts.toast("다운로드할 집계 데이터가 없습니다.");
      return;
    }
    if (typeof global.XLSX === "undefined" || !global.XLSX.utils || !global.XLSX.writeFile) {
      alert("엑셀 라이브러리를 불러오지 못했습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
      return;
    }
    var aoa = [];
    var header = ["유형"].concat(grid.months).concat(["합계"]);
    aoa.push(header);
    TYPE_OPTIONS.forEach(function (t) {
      var row = [t.label];
      var rowTotal = 0;
      grid.months.forEach(function (m) {
        var n = (grid.counts[t.id] && grid.counts[t.id][m]) || 0;
        rowTotal += n;
        row.push(n || 0);
      });
      row.push(rowTotal);
      aoa.push(row);
    });
    var foot = ["합계"];
    var grand = 0;
    grid.months.forEach(function (m) {
      var col = 0;
      TYPE_OPTIONS.forEach(function (t) {
        col += (grid.counts[t.id] && grid.counts[t.id][m]) || 0;
      });
      grand += col;
      foot.push(col);
    });
    foot.push(grand);
    aoa.push(foot);

    var wb = global.XLSX.utils.book_new();
    var ws = global.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 28 }].concat(
      grid.months.map(function () {
        return { wch: 10 };
      }),
      [{ wch: 8 }]
    );
    global.XLSX.utils.book_append_sheet(wb, ws, "유형별현황");
    var now = new Date();
    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }
    var stamp =
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      "_" +
      pad(now.getHours()) +
      pad(now.getMinutes());
    var yearPart = statsYear === "all" ? "전체" : String(statsYear);
    global.XLSX.writeFile(wb, "고객불편사항_유형별현황_" + yearPart + "_" + stamp + ".xlsx");
    opts.toast("엑셀 다운로드 · " + yearPart);
  }

  function updateEntryControls() {
    var form = document.getElementById("complaintForm");
    var hint = document.getElementById("complaintFrontOnlyHint");
    var editable = canEdit();
    if (form) {
      form.querySelectorAll("input, button, select").forEach(function (el) {
        if (el.hasAttribute("data-complaint-page")) return;
        el.disabled = !editable;
      });
    }
    if (hint) hint.hidden = editable;
  }

  function render() {
    renderTypeChips();
    syncPageTabs();
    syncFormTypeUi();
    syncFormRoomChangeUi();
    updateEntryControls();
    if (activePage === 1) renderTable();
    else renderStats();
  }

  function addRecord() {
    if (!canEdit()) {
      opts.toast("프론트 모드에서만 등록할 수 있습니다.");
      return;
    }
    var resEl = document.getElementById("complaintReservationNo");
    var nameEl = document.getElementById("complaintGuestName");
    var roomEl = document.getElementById("complaintRoomNo");
    var memoEl = document.getElementById("complaintMemo");
    var reservationNo = resEl ? String(resEl.value || "").trim() : "";
    var guestName = nameEl ? String(nameEl.value || "").trim() : "";
    var roomNo = roomEl ? String(roomEl.value || "").trim() : "";
    var memo = memoEl ? String(memoEl.value || "").trim() : "";
    if (!reservationNo && !guestName && !roomNo) {
      opts.toast("예약번호·이름·객실번호 중 하나 이상 입력하세요.");
      return;
    }
    if (!formTypeId) {
      opts.toast("유형을 선택하세요.");
      return;
    }
    var stamp = new Date().toISOString();
    var pack = loadPack();
    var records = (pack.records || []).slice();
    records.push({
      id: makeId(),
      createdAt: stamp,
      updatedAt: stamp,
      reservationNo: reservationNo,
      guestName: guestName,
      roomNo: roomNo,
      memo: memo,
      typeId: formTypeId,
      roomChange: !!formRoomChange,
    });
    persistRecords(records, stamp);
    resetForm();
    renderTable();
    opts.toast("불편사항이 등록되었습니다.");
    requestAnimationFrame(function () {
      var body = document.getElementById("complaintTableBody");
      if (body && body.lastElementChild) {
        body.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  function updateRecordField(id, field, value) {
    if (!canEdit()) return;
    var pack = loadPack();
    var records = (pack.records || []).slice();
    var idx = -1;
    for (var i = 0; i < records.length; i++) {
      if (records[i] && records[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    var row = Object.assign({}, records[idx]);
    var stamp = new Date().toISOString();
    if (field === "createdAt") {
      row.createdAt = dateIsoFromInput(value, row.createdAt);
    } else if (field === "roomChange") {
      row.roomChange = !!value;
    } else if (field === "typeId") {
      row.typeId = String(value || "");
    } else if (field === "reservationNo" || field === "guestName" || field === "roomNo" || field === "memo") {
      row[field] = String(value || "").trim();
    } else {
      return;
    }
    row.updatedAt = stamp;
    records[idx] = row;
    persistRecords(records, stamp);
  }

  function deleteRecord(id) {
    if (!canEdit()) return;
    if (!confirm("이 행을 삭제할까요?")) return;
    var pack = loadPack();
    var stamp = new Date().toISOString();
    var records = (pack.records || []).filter(function (r) {
      return r && r.id !== id;
    });
    persistRecords(records, stamp);
    renderTable();
    opts.toast("삭제되었습니다.");
  }

  function clearAllRecords() {
    if (!canEdit()) {
      opts.toast("프론트 모드에서만 초기화할 수 있습니다.");
      return;
    }
    var pack = loadPack();
    var n = (pack.records || []).length;
    if (!n) {
      opts.toast("초기화할 데이터가 없습니다.");
      return;
    }
    if (!confirm("고객불편사항 유형분석 " + n + "건을 모두 삭제할까요?\n(마감과 별개이며, 이 버튼을 눌러야만 비워집니다.)")) {
      return;
    }
    var stamp = new Date().toISOString();
    persistRecords([], stamp);
    render();
    opts.toast("불편사항 유형분석이 초기화되었습니다.");
  }

  function bindUi() {
    if (bound) return;
    bound = true;

    var form = document.getElementById("complaintForm");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        addRecord();
      });
    }

    var resetBtn = document.getElementById("btnComplaintResetAll");
    if (resetBtn && !resetBtn.__hkComplaintResetBound) {
      resetBtn.__hkComplaintResetBound = true;
      resetBtn.addEventListener("click", function () {
        clearAllRecords();
      });
    }

    var chips = document.getElementById("complaintTypeChips");
    if (chips) {
      chips.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-type-id]");
        if (!btn || !chips.contains(btn)) return;
        formTypeId = btn.getAttribute("data-type-id") || "";
        syncFormTypeUi();
      });
    }

    var btnO = document.getElementById("complaintRoomChangeO");
    var btnX = document.getElementById("complaintRoomChangeX");
    if (btnO) {
      btnO.addEventListener("click", function () {
        formRoomChange = true;
        syncFormRoomChangeUi();
      });
    }
    if (btnX) {
      btnX.addEventListener("click", function () {
        formRoomChange = false;
        syncFormRoomChangeUi();
      });
    }

    document.querySelectorAll("[data-complaint-page]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        activePage = Number(btn.getAttribute("data-complaint-page")) || 1;
        render();
      });
    });

    var yearSel = document.getElementById("complaintStatsYear");
    if (yearSel) {
      yearSel.addEventListener("change", function () {
        statsYear = yearSel.value || "all";
        renderStats();
      });
    }

    var excelBtn = document.getElementById("btnComplaintStatsExcel");
    if (excelBtn && !excelBtn.__hkComplaintExcelBound) {
      excelBtn.__hkComplaintExcelBound = true;
      excelBtn.addEventListener("click", function () {
        downloadStatsExcel();
      });
    }

    var tbody = document.getElementById("complaintTableBody");
    if (tbody) {
      tbody.addEventListener("change", function (e) {
        var el = e.target;
        var tr = el.closest("tr[data-id]");
        if (!tr || !tbody.contains(tr)) return;
        var id = tr.getAttribute("data-id");
        var field = el.getAttribute("data-field");
        if (!id || !field) return;
        updateRecordField(id, field, el.value);
        if (field === "createdAt") {
          // date change may affect page2 — rebuild sort order
          renderTable();
        }
      });
      tbody.addEventListener("click", function (e) {
        var del = e.target.closest('[data-action="delete"]');
        if (del) {
          var trDel = del.closest("tr[data-id]");
          if (trDel) deleteRecord(trDel.getAttribute("data-id"));
          return;
        }
        var ox = e.target.closest('[data-field="roomChange"]');
        if (ox) {
          var trOx = ox.closest("tr[data-id]");
          if (!trOx) return;
          var next = ox.textContent.trim() !== "O";
          updateRecordField(trOx.getAttribute("data-id"), "roomChange", next);
          ox.textContent = next ? "O" : "X";
          ox.classList.toggle("is-o", next);
          ox.classList.toggle("is-x", !next);
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

  function onFrontModeChanged() {
    if (!canEdit()) {
      var panel = document.getElementById("complaintPanel");
      if (panel && !panel.hidden && typeof opts.onLeaveWhenLocked === "function") {
        opts.onLeaveWhenLocked();
        return;
      }
    }
    render();
  }

  global.HKComplaintAnalysis = {
    init: init,
    render: render,
    onViewActivated: onViewActivated,
    onFrontModeChanged: onFrontModeChanged,
    TYPE_OPTIONS: TYPE_OPTIONS,
  };
})(typeof window !== "undefined" ? window : this);
