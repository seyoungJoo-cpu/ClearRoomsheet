/**
 * 마감 읽기 모드 아카이브 런타임
 * admin.html 이 스냅샷 JSON 과 함께 인라인으로 삽입합니다.
 * window.__HK_ARCHIVE__ 필요
 */
(function () {
  var A = window.__HK_ARCHIVE__ || {};
  var data = A.data || {};
  var mainEl = document.getElementById("archiveMain");
  var feedbackEl = document.getElementById("archiveFeedback");
  var currentView = "order";

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function hm(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function fullAt(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
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

  function roomNo(n) {
    return String(n == null ? "" : n).trim();
  }

  function imgTag(src) {
    var s = src != null ? String(src).trim() : "";
    if (!s || s.indexOf("data:image") !== 0) return "";
    return (
      '<img class="card-img" src="' +
      s.replace(/"/g, "&quot;") +
      '" alt="첨부" />'
    );
  }

  function phaseOf(entry) {
    if (!entry) return "alert";
    if (entry.issueOpen === true) return "issue";
    var p = entry.phase != null ? String(entry.phase).trim() : "";
    if (
      p === "accepted" ||
      p === "issue" ||
      p === "cancelled" ||
      p === "deployed" ||
      p === "unavailable" ||
      p === "gst" ||
      p === "posted"
    ) {
      return p;
    }
    return "alert";
  }

  function isFacilityOrder(entry) {
    return !!(entry && String(entry.category || "").trim() === "facility");
  }

  function zoneLabel(id) {
    if (typeof window.HK_ARCHIVE_ZONE_LABELS === "object" && window.HK_ARCHIVE_ZONE_LABELS[id]) {
      return window.HK_ARCHIVE_ZONE_LABELS[id];
    }
    var map = { VIP: "VIP", RC: "R/C", CASINO: "CASINO", MOBILE_CI: "MCI", AJ: "AJ", MINIBAR: "MB" };
    if (map[id]) return map[id];
    var cz = data.customZones || [];
    for (var i = 0; i < cz.length; i++) {
      if (cz[i] && cz[i].id === id) return cz[i].label || id;
    }
    return id;
  }

  function zoneOrder() {
    var base = ["VIP", "RC", "CASINO", "MOBILE_CI", "AJ", "MINIBAR"];
    var out = base.slice();
    (data.customZones || []).forEach(function (z) {
      if (z && z.id && out.indexOf(z.id) < 0) out.push(z.id);
    });
    return out;
  }

  function sortBy(list, field) {
    return (list || []).slice().sort(function (a, b) {
      var ta = new Date((a && a[field]) || (a && a.at) || 0).getTime();
      var tb = new Date((b && b[field]) || (b && b.at) || 0).getTime();
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      return ta - tb;
    });
  }

  function orderCard(entry, kind) {
    var cls = "card card--" + kind;
    if (entry.urgent) cls += " is-urgent";
    if (entry.fromMaint) cls += " is-from-maint";
    if (isFacilityOrder(entry)) cls += " is-facility";
    var html = ['<article class="' + cls + '">'];
    if (entry.at) html.push('<div class="card-time">오더 <b>' + esc(hm(entry.at)) + "</b></div>");
    if (entry.acceptedAt) {
      html.push('<div class="card-time">접수 <b>' + esc(hm(entry.acceptedAt)) + "</b></div>");
    }
    html.push('<div class="card-row"><span class="card-room">' + esc(roomNo(entry.room)));
    if (entry.urgent) html.push('<span class="badge-urgent">긴급</span>');
    html.push("</span>");
    if (entry.foStatus) html.push('<span class="card-fo">' + esc(entry.foStatus) + "</span>");
    html.push("</div>");
    if (entry.memo) {
      html.push('<div class="card-memo">' + esc(entry.memo).replace(/\n/g, "<br>") + "</div>");
    }
    html.push(imgTag(entry.memoImage));
    if (entry.by) html.push('<div class="card-by">' + esc(entry.by) + "</div>");
    if (kind === "accepted" && entry.acceptedBy) {
      html.push('<div class="card-meta">접수자 : ' + esc(entry.acceptedBy) + "</div>");
    }
    if (kind === "cancelled") {
      html.push('<div class="card-x">✕</div>');
      if (entry.cancelledBy) {
        html.push('<div class="card-meta">취소 : ' + esc(entry.cancelledBy) + "</div>");
      }
    }
    if (kind === "unavailable") {
      html.push('<div class="card-x">✕</div>');
      html.push('<div class="card-denied">입실 불가</div>');
    }
    if (Array.isArray(entry.chat) && entry.chat.length) {
      html.push('<div class="card-chat-label">채팅</div>');
      entry.chat.forEach(function (m) {
        html.push(
          '<div class="chat-line"><b>' +
            esc(m.by || "—") +
            "</b> " +
            esc(m.deleted ? "삭제하였습니다." : m.text || "") +
            (m.at ? ' <span class="muted">' + esc(hm(m.at)) + "</span>" : "") +
            "</div>"
        );
        if (m.image && !m.deleted) html.push(imgTag(m.image));
      });
    }
    html.push("</article>");
    return html.join("");
  }

  function bucket(title, entries, kind) {
    var html = [
      '<section class="bucket bucket--' + kind + '"><h3>' +
        esc(title) +
        ' <span class="count">' +
        String((entries || []).length) +
        "</span></h3>",
    ];
    if (!entries || !entries.length) html.push('<p class="empty">(내역 없음)</p>');
    else {
      html.push('<div class="bucket-list">');
      entries.forEach(function (e) {
        html.push(orderCard(e, kind));
      });
      html.push("</div>");
    }
    html.push("</section>");
    return html.join("");
  }

  function partitionOrders(filterFn) {
    var list = (A.orderLog || []).filter(filterFn);
    return {
      alert: sortBy(
        list.filter(function (e) {
          return phaseOf(e) === "alert";
        }),
        "at"
      ),
      issue: sortBy(
        list.filter(function (e) {
          return phaseOf(e) === "issue" || e.issueOpen === true;
        }),
        "issueAt"
      ),
      accepted: sortBy(
        list.filter(function (e) {
          return phaseOf(e) === "accepted" && e.issueOpen !== true;
        }),
        "acceptedAt"
      ),
      unavailable: sortBy(
        list.filter(function (e) {
          return phaseOf(e) === "unavailable";
        }),
        "unavailableAt"
      ),
      cancelled: sortBy(
        list.filter(function (e) {
          return phaseOf(e) === "cancelled";
        }),
        "cancelledAt"
      ),
      deployed: sortBy(
        list.filter(function (e) {
          return phaseOf(e) === "deployed";
        }),
        "deployedAt"
      ),
    };
  }

  function renderSplitOrder(title, alertTitle, parts, opts) {
    opts = opts || {};
    var main = [
      '<div class="panel"><h2>' + esc(title) + "</h2>",
      bucket("문제 발생", parts.issue, "issue"),
      bucket("접수완료", parts.accepted, "accepted"),
    ];
    if (opts.unavailable) main.push(bucket("입실불가", parts.unavailable, "unavailable"));
    main.push(bucket("취소", parts.cancelled, "cancelled"));
    main.push(bucket(opts.deployedTitle || "투입완료", parts.deployed, "deployed"));
    main.push("</div>");
    var side = [
      '<div class="panel panel--alert"><h2>' + esc(alertTitle) + "</h2>",
      bucket("대기(알림)", parts.alert, "alert"),
      "</div>",
    ];
    return { main: main.join(""), side: side.join("") };
  }

  function reqCard(entry, kind) {
    var html = [
      '<article class="card card--' + kind + (entry.urgent ? " is-urgent" : "") + '">',
    ];
    if (entry.at) html.push('<div class="card-time">요청 <b>' + esc(hm(entry.at)) + "</b></div>");
    if (entry.sched) {
      html.push('<div class="card-time">예정 <b>' + esc(entry.sched) + "</b></div>");
    }
    html.push(
      '<div class="card-row"><span class="card-room">' +
        esc(roomNo(entry.room)) +
        (entry.urgent ? '<span class="badge-urgent">긴급</span>' : "") +
        "</span>"
    );
    if (entry.status) html.push('<span class="card-fo">' + esc(entry.status) + "</span>");
    html.push("</div>");
    if (entry.memo) {
      html.push('<div class="card-memo">FD · ' + esc(entry.memo).replace(/\n/g, "<br>") + "</div>");
    }
    html.push(imgTag(entry.memoImage));
    if (entry.memo2) {
      html.push(
        '<div class="card-memo">정비 · ' + esc(entry.memo2).replace(/\n/g, "<br>") + "</div>"
      );
    }
    html.push(imgTag(entry.memo2Image));
    if (entry.by) html.push('<div class="card-by">' + esc(entry.by) + "</div>");
    html.push("</article>");
    return html.join("");
  }

  function renderRequest() {
    var pending = [];
    var scheduled = [];
    (A.requestLog || []).forEach(function (e) {
      if (!e) return;
      if (e.sched && String(e.sched).trim()) scheduled.push(e);
      else pending.push(e);
    });
    pending = sortBy(pending, "at");
    scheduled.sort(function (a, b) {
      return String(a.sched || "").localeCompare(String(b.sched || ""), undefined, {
        numeric: true,
      });
    });
    var main = ['<div class="panel"><h2>약속 시간</h2>'];
    if (!scheduled.length) main.push('<p class="empty">(내역 없음)</p>');
    else {
      main.push('<div class="bucket-list">');
      scheduled.forEach(function (e) {
        main.push(reqCard(e, "accepted"));
      });
      main.push("</div>");
    }
    main.push("</div>");
    var side = ['<div class="panel panel--alert"><h2>정비 관리 알림</h2>'];
    if (!pending.length) side.push('<p class="empty">(내역 없음)</p>');
    else {
      side.push('<div class="bucket-list">');
      pending.forEach(function (e) {
        side.push(reqCard(e, "alert"));
      });
      side.push("</div>");
    }
    side.push("</div>");
    return { main: main.join(""), side: side.join("") };
  }

  function mbCard(entry) {
    var html = ['<article class="card card--' + phaseOf(entry) + '">'];
    html.push(
      '<div class="card-row"><span class="card-room">' +
        esc(entry.category === "inv" ? "인벤" : "MB") +
        " " +
        esc(roomNo(entry.roomFrom)) +
        " → " +
        esc(roomNo(entry.roomTo)) +
        '</span><span class="card-fo">' +
        esc(phaseOf(entry)) +
        "</span></div>"
    );
    if (entry.at) html.push('<div class="card-time">' + esc(hm(entry.at)) + "</div>");
    if (entry.memo) html.push('<div class="card-memo">' + esc(entry.memo) + "</div>");
    html.push(imgTag(entry.memoImage));
    if (entry.by) html.push('<div class="card-by">' + esc(entry.by) + "</div>");
    html.push("</article>");
    return html.join("");
  }

  function mbCheckCard(entry) {
    var html = ['<article class="card card--' + phaseOf(entry) + '">'];
    html.push(
      '<div class="card-row"><span class="card-room">' +
        esc(roomNo(entry.room)) +
        '</span><span class="card-fo">' +
        esc(phaseOf(entry)) +
        "</span></div>"
    );
    if (entry.at) html.push('<div class="card-time">' + esc(hm(entry.at)) + "</div>");
    if (entry.memo) html.push('<div class="card-memo">' + esc(entry.memo) + "</div>");
    if (entry.by) html.push('<div class="card-by">' + esc(entry.by) + "</div>");
    html.push("</article>");
    return html.join("");
  }

  function renderMbInv() {
    var list = A.mbInvLog || [];
    var alert = list.filter(function (e) {
      return phaseOf(e) === "alert";
    });
    var issue = list.filter(function (e) {
      return phaseOf(e) === "issue" || e.issueOpen;
    });
    var accepted = list.filter(function (e) {
      return phaseOf(e) === "accepted";
    });
    var cancelled = list.filter(function (e) {
      return phaseOf(e) === "cancelled";
    });
    function listHtml(arr) {
      if (!arr.length) return '<p class="empty">(내역 없음)</p>';
      return (
        '<div class="bucket-list">' +
        arr
          .map(function (e) {
            return mbCard(e);
          })
          .join("") +
        "</div>"
      );
    }
    return {
      main:
        '<div class="panel"><h2>MB &amp; 인벤 변경</h2>' +
        '<section class="bucket"><h3>문제 발생 <span class="count">' +
        issue.length +
        "</span></h3>" +
        listHtml(issue) +
        "</section>" +
        '<section class="bucket"><h3>접수완료 <span class="count">' +
        accepted.length +
        "</span></h3>" +
        listHtml(accepted) +
        "</section>" +
        '<section class="bucket"><h3>취소 <span class="count">' +
        cancelled.length +
        "</span></h3>" +
        listHtml(cancelled) +
        "</section></div>",
      side:
        '<div class="panel panel--alert"><h2>MB &amp; 인벤 알림</h2>' +
        listHtml(alert) +
        "</div>",
    };
  }

  function renderMbCheck() {
    var list = A.mbCheckLog || [];
    function byPhase(p) {
      return list.filter(function (e) {
        return phaseOf(e) === p;
      });
    }
    function listHtml(arr) {
      if (!arr.length) return '<p class="empty">(내역 없음)</p>';
      return (
        '<div class="bucket-list">' +
        arr
          .map(function (e) {
            return mbCheckCard(e);
          })
          .join("") +
        "</div>"
      );
    }
    return {
      main:
        '<div class="panel"><h2>MB CHECK</h2>' +
        '<section class="bucket"><h3>접수</h3>' +
        listHtml(byPhase("accepted")) +
        "</section>" +
        '<section class="bucket"><h3>GST 있음</h3>' +
        listHtml(byPhase("gst")) +
        "</section>" +
        '<section class="bucket"><h3>포스팅 완료</h3>' +
        listHtml(byPhase("posted")) +
        "</section>" +
        '<section class="bucket"><h3>취소</h3>' +
        listHtml(byPhase("cancelled")) +
        "</section></div>",
      side:
        '<div class="panel panel--alert"><h2>MB CHECK 알림</h2>' +
        listHtml(byPhase("alert")) +
        "</div>",
    };
  }

  function renderChat(list, title) {
    var msgs = list || [];
    var html = ['<div class="panel panel--full"><h2>' + esc(title) + "</h2>"];
    if (!msgs.length) html.push('<p class="empty">(메시지 없음)</p>');
    else {
      html.push('<div class="chat-log">');
      msgs.forEach(function (m) {
        html.push(
          '<div class="chat-msg"><div class="chat-msg-meta"><b>' +
            esc(m.by || "—") +
            "</b> · " +
            esc(fullAt(m.at)) +
            '</div><div class="chat-msg-body">' +
            esc(m.deleted ? "삭제하였습니다." : m.text || "") +
            "</div>" +
            imgTag(m.deleted ? "" : m.image) +
            "</div>"
        );
      });
      html.push("</div>");
    }
    html.push("</div>");
    return { main: html.join(""), side: "" };
  }

  function renderZones() {
    var html = ['<div class="panel panel--full"><h2>특이객실</h2>'];
    zoneOrder().forEach(function (zid) {
      var rooms = (data.rooms && data.rooms[zid]) || [];
      var deleted =
        data.deletedRooms && Array.isArray(data.deletedRooms[zid])
          ? data.deletedRooms[zid]
          : [];
      html.push("<h3>" + esc(zoneLabel(zid)) + " (" + rooms.length + ")</h3>");
      if (!rooms.length && !deleted.length) {
        html.push('<p class="empty">(객실 없음)</p>');
        return;
      }
      html.push('<div class="room-grid">');
      rooms.forEach(function (r) {
        html.push(
          '<article class="room-card"><div class="card-room">' +
            esc(roomNo(r.number)) +
            (r.tray === "in" ? ' <span class="pill">입실</span>' : "") +
            "</div>" +
            (r.time ? '<div class="card-time">시간 · ' + esc(r.time) + "</div>" : "") +
            (r.memo1 ? '<div class="card-memo">FD · ' + esc(r.memo1) + "</div>" : "") +
            (r.memo2 ? '<div class="card-memo">정비 · ' + esc(r.memo2) + "</div>" : "") +
            imgTag(r.memo2Image) +
            "</article>"
        );
      });
      html.push("</div>");
      if (deleted.length) {
        html.push(
          '<p class="muted">삭제·수정 트레이: ' +
            deleted
              .map(function (n) {
                return esc(roomNo(n));
              })
              .join(", ") +
            "</p>"
        );
      }
    });
    html.push("</div>");
    return { main: html.join(""), side: "" };
  }

  function renderFacilityLog(kind) {
    var title =
      kind === "daily" ? "당일습득물" : "컴플레인 · 지난습득물 · 세탁";
    var rows = [];
    if (kind === "daily") {
      var daily = (data.facilityDailyFoundLog && data.facilityDailyFoundLog.entries) || [];
      rows = daily.slice();
    } else {
      var misc = data.facilityMiscLog && data.facilityMiscLog.entries;
      if (misc && typeof misc === "object") {
        Object.keys(misc).forEach(function (k) {
          (misc[k] || []).forEach(function (e) {
            rows.push(Object.assign({ __cat: k }, e));
          });
        });
      }
    }
    rows = sortBy(rows, "at");
    var html = ['<div class="panel panel--full"><h2>' + esc(title) + "</h2>"];
    if (!rows.length) html.push('<p class="empty">(내역 없음)</p>');
    else {
      html.push('<div class="bucket-list">');
      rows.forEach(function (e) {
        html.push(
          '<article class="card"><div class="card-time">' +
            esc(fullAt(e.at)) +
            '</div><div class="card-row"><span class="card-room">' +
            esc(roomNo(e.room)) +
            "</span>" +
            (e.__cat ? '<span class="card-fo">' + esc(e.__cat) + "</span>" : "") +
            "</div>" +
            (e.memo ? '<div class="card-memo">' + esc(e.memo) + "</div>" : "") +
            imgTag(e.memoImage) +
            (e.by ? '<div class="card-by">' + esc(e.by) + "</div>" : "") +
            "</article>"
        );
      });
      html.push("</div>");
    }
    html.push("</div>");
    return { main: html.join(""), side: "" };
  }

  function renderInvenNotify() {
    var html = ['<div class="panel panel--full"><h2>인벤 통보</h2>'];
    var inv = data.invenNotify;
    if (!inv) html.push('<p class="empty">(데이터 없음)</p>');
    else {
      html.push(
        '<pre class="json-block">' + esc(JSON.stringify(inv, null, 2)) + "</pre>"
      );
    }
    if (A.invenNotifyDraft) {
      html.push("<h3>임시저장</h3>");
      html.push(
        '<pre class="json-block">' +
          esc(JSON.stringify(A.invenNotifyDraft, null, 2)) +
          "</pre>"
      );
    }
    html.push("</div>");
    return { main: html.join(""), side: "" };
  }

  function renderNoticeLike() {
    var html = ['<div class="panel panel--full"><h2>공지 · 메모</h2>'];
    html.push("<h3>공지</h3>");
    html.push(
      '<div class="notice-box">' +
        esc(data.notice || "(없음)").replace(/\n/g, "<br>") +
        "</div>"
    );
    (data.noticeImages || []).forEach(function (img) {
      html.push(imgTag(img));
    });
    html.push("<h3>MB &amp; 인벤 공지</h3>");
    html.push(
      '<div class="notice-box">' +
        esc(data.mbInvNotice || "(없음)").replace(/\n/g, "<br>") +
        "</div>"
    );
    (data.mbInvNoticeImages || []).forEach(function (img) {
      html.push(imgTag(img));
    });
    var vip = (data.zoneMemos && data.zoneMemos.VIP) || {};
    html.push("<h3>VIP 메모장</h3>");
    html.push(
      '<div class="notice-box">' +
        esc(vip.text || "(없음)").replace(/\n/g, "<br>") +
        "</div>"
    );
    (vip.images || []).forEach(function (img) {
      html.push(imgTag(img));
    });
    html.push("</div>");
    return { main: html.join(""), side: "" };
  }

  function renderAdminInquiries() {
    var list = A.adminInquiries || [];
    var html = ['<div class="panel panel--full"><h2>관리자 문의</h2>'];
    if (!list.length) html.push('<p class="empty">(문의 없음)</p>');
    else {
      html.push('<div class="bucket-list">');
      list.forEach(function (e) {
        html.push(
          '<article class="card"><div class="card-time">' +
            esc(fullAt(e.at)) +
            " · " +
            esc(e.by || "—") +
            '</div><div class="card-memo">' +
            esc(e.text || "") +
            "</div>" +
            (e.reply
              ? '<div class="card-meta">답변 · ' +
                esc(e.replyBy || "") +
                " · " +
                esc(fullAt(e.replyAt)) +
                "<br>" +
                esc(e.reply) +
                "</div>"
              : '<div class="card-meta">답변대기</div>') +
            "</article>"
        );
      });
      html.push("</div>");
    }
    html.push("</div>");
    return { main: html.join(""), side: "" };
  }

  function renderAi() {
    return {
      main:
        '<div class="panel panel--full ai-panel"><h2>AI 모드 (읽기 데이터 조회)</h2>' +
        '<p class="muted">마감 당시 저장된 데이터로 질문합니다. 등록·수정은 할 수 없습니다.</p>' +
        '<div class="ai-chat" id="archiveAiChat"></div>' +
        '<form class="ai-form" id="archiveAiForm">' +
        '<input type="text" id="archiveAiInput" placeholder="예: 오더 대기 몇건? / 현황 / 도움말" autocomplete="off" />' +
        '<button type="submit">전송</button></form></div>',
      side: "",
    };
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll(".sidebar-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === view);
    });
    var out;
    if (view === "order") {
      out = renderSplitOrder(
        "오더 관리",
        "오더 알림",
        partitionOrders(function (e) {
          return !isFacilityOrder(e);
        })
      );
    } else if (view === "facility") {
      out = renderSplitOrder(
        "시설 관리",
        "시설 관리 알림",
        partitionOrders(isFacilityOrder),
        { unavailable: true, deployedTitle: "입실 가능" }
      );
    } else if (view === "request") out = renderRequest();
    else if (view === "mbInv") out = renderMbInv();
    else if (view === "mbCheck") out = renderMbCheck();
    else if (view === "chat") out = renderChat(A.teamChat, "채팅방");
    else if (view === "frontChat") out = renderChat(A.frontChat, "프론트 채팅방");
    else if (view === "zones") out = renderZones();
    else if (view === "facilityMisc") out = renderFacilityLog("misc");
    else if (view === "facilityDaily") out = renderFacilityLog("daily");
    else if (view === "invenNotify") out = renderInvenNotify();
    else if (view === "notice") out = renderNoticeLike();
    else if (view === "adminInquiry") out = renderAdminInquiries();
    else if (view === "ai") out = renderAi();
    else out = { main: '<div class="panel"><p class="empty">준비 중</p></div>', side: "" };

    if (mainEl) mainEl.innerHTML = out.main;
    if (feedbackEl) {
      feedbackEl.innerHTML = out.side || "";
      feedbackEl.hidden = !out.side;
    }
    if (view === "ai") setupAi();
  }

  function aiAppend(role, text, html) {
    var chat = document.getElementById("archiveAiChat");
    if (!chat) return;
    var div = document.createElement("div");
    div.className = "ai-msg ai-msg--" + role;
    if (html) {
      div.innerHTML = html;
    } else {
      div.style.whiteSpace = "pre-wrap";
      div.textContent = text;
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function archiveOrderCardsHtml(list, title) {
    if (!list || !list.length) {
      return "<p>" + esc(title || "해당 오더") + "가 없습니다.</p>";
    }
    return (
      "<p><b>" +
      esc(title || "오더") +
      " " +
      list.length +
      "건</b></p><div class=\"cards\">" +
      list
        .map(function (e) {
          return orderCard(e, phaseOf(e));
        })
        .join("") +
      "</div>"
    );
  }

  function aiSummary() {
    var orders = A.orderLog || [];
    var reqs = A.requestLog || [];
    var oAlert = orders.filter(function (e) {
      return !isFacilityOrder(e) && phaseOf(e) === "alert";
    }).length;
    var oIssue = orders.filter(function (e) {
      return !isFacilityOrder(e) && (phaseOf(e) === "issue" || e.issueOpen);
    }).length;
    var fAlert = orders.filter(function (e) {
      return isFacilityOrder(e) && phaseOf(e) === "alert";
    }).length;
    var rPending = reqs.filter(function (e) {
      return !(e.sched && String(e.sched).trim());
    }).length;
    var rSched = reqs.filter(function (e) {
      return e.sched && String(e.sched).trim();
    }).length;
    return (
      "마감 시점 현황\n" +
      "· 오더 대기 " +
      oAlert +
      " / 문제 " +
      oIssue +
      " / 전체 " +
      orders.length +
      "\n" +
      "· 시설 대기 " +
      fAlert +
      "\n" +
      "· 정비 대기 " +
      rPending +
      " / 처리·예정 " +
      rSched +
      "\n" +
      "· MB&인벤 " +
      (A.mbInvLog || []).length +
      " / MB CHECK " +
      (A.mbCheckLog || []).length +
      "\n" +
      "· 채팅 " +
      (A.teamChat || []).length +
      " / 프론트채팅 " +
      (A.frontChat || []).length +
      "\n" +
      "· 관리자 문의 " +
      (A.adminInquiries || []).length
    );
  }

  function aiHelp() {
    return (
      "질문 예시\n" +
      "· 현황 / 요약\n" +
      "· 오더 대기 / 오더 문제발생 / 오더 접수\n" +
      "· 시설 대기 / 정비 대기 / 처리 예정\n" +
      "· MB 인벤 / MB CHECK\n" +
      "· 공지 / VIP / 채팅 몇건\n" +
      "· 1205 오더 (객실번호)"
    );
  }

  function handleAi(q) {
    var raw = String(q || "").trim();
    if (!raw) return;
    aiAppend("user", raw);
    var s = raw.replace(/\s+/g, " ");
    if (/도움말|help|사용법/i.test(s)) {
      aiAppend("bot", aiHelp());
      return;
    }
    if (/현황|요약|브리핑/i.test(s)) {
      aiAppend("bot", aiSummary());
      return;
    }
    if (/공지/.test(s)) {
      aiAppend("bot", "공지\n" + (data.notice || "(없음)"));
      return;
    }
    if (/VIP|메모장/i.test(s)) {
      var vip = (data.zoneMemos && data.zoneMemos.VIP) || {};
      aiAppend("bot", "VIP 메모장\n" + (vip.text || "(없음)"));
      return;
    }
    var roomM = s.match(/(\d{3,4})/);
    if (roomM && /오더|시설/.test(s)) {
      var rn = roomM[1];
      var hits = (A.orderLog || []).filter(function (e) {
        if (!e) return false;
        var room = String(e.room || "");
        if (room.indexOf(rn) < 0) return false;
        if (/시설/.test(s) && !/오더/.test(s)) return isFacilityOrder(e);
        if (/오더/.test(s) && !/시설/.test(s)) return !isFacilityOrder(e);
        return true;
      });
      aiAppend(
        "bot",
        "",
        archiveOrderCardsHtml(hits, rn + "호 " + (/시설/.test(s) && !/오더/.test(s) ? "시설" : "오더"))
      );
      return;
    }
    if (/오더/.test(s)) {
      var list = (A.orderLog || []).filter(function (e) {
        return !isFacilityOrder(e);
      });
      var want = /대기|알림|미접수/.test(s)
        ? "alert"
        : /문제/.test(s)
          ? "issue"
          : /접수/.test(s)
            ? "accepted"
            : /취소/.test(s)
              ? "cancelled"
              : /투입|완료/.test(s)
                ? "deployed"
                : "";
      var filtered = want
        ? list.filter(function (e) {
            return phaseOf(e) === want || (want === "issue" && e.issueOpen);
          })
        : list;
      aiAppend(
        "bot",
        "",
        archiveOrderCardsHtml(filtered, "오더 " + (want || "전체"))
      );
      return;
    }
    if (/시설/.test(s)) {
      var fl = (A.orderLog || []).filter(isFacilityOrder);
      aiAppend("bot", "", archiveOrderCardsHtml(fl, "시설 오더"));
      return;
    }
    if (/정비|요청|예정/.test(s)) {
      var reqs = A.requestLog || [];
      if (/예정|처리/.test(s)) {
        var sch = reqs.filter(function (e) {
          return e.sched && String(e.sched).trim();
        });
        aiAppend(
          "bot",
          "처리·예정 " +
            sch.length +
            "건\n" +
            sch
              .slice(0, 15)
              .map(function (e) {
                return "· " + roomNo(e.room) + " " + (e.sched || "");
              })
              .join("\n")
        );
        return;
      }
      var pend = reqs.filter(function (e) {
        return !(e.sched && String(e.sched).trim());
      });
      aiAppend("bot", "정비 대기(알림) " + pend.length + "건");
      return;
    }
    if (/MB\s*CHECK|엠비\s*체크/i.test(s)) {
      aiAppend("bot", "MB CHECK " + (A.mbCheckLog || []).length + "건");
      return;
    }
    if (/MB|인벤/.test(s)) {
      aiAppend("bot", "MB & 인벤 변경 " + (A.mbInvLog || []).length + "건");
      return;
    }
    if (/채팅/.test(s)) {
      aiAppend(
        "bot",
        "채팅방 " +
          (A.teamChat || []).length +
          " / 프론트 채팅 " +
          (A.frontChat || []).length
      );
      return;
    }
    aiAppend("bot", "잘 이해하지 못했어요.\n\n" + aiHelp());
  }

  function setupAi() {
    var form = document.getElementById("archiveAiForm");
    var input = document.getElementById("archiveAiInput");
    var chat = document.getElementById("archiveAiChat");
    if (!form || !input || !chat) return;
    if (!chat.childElementCount) {
      aiAppend(
        "bot",
        "마감 읽기 모드 AI입니다.\n저장된 데이터만 조회합니다.\n\n" + aiHelp()
      );
    }
    form.onsubmit = function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      input.value = "";
      handleAi(q);
    };
  }

  document.querySelectorAll(".sidebar-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setView(btn.getAttribute("data-view") || "order");
    });
  });

  setView("order");
})();
