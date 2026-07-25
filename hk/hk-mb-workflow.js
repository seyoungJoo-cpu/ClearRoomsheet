/**
 * MB & 인벤 변경 · MB CHECK 워크플로
 */
(function (global) {
  var ctx = null;
  var mbInvLogEntries = [];
  var mbCheckLogEntries = [];

  function getPhase(entry) {
    if (!entry) return "alert";
    var p = entry.phase != null ? String(entry.phase).trim() : "";
    if (
      p === "accepted" ||
      p === "issue" ||
      p === "cancelled" ||
      p === "posted" ||
      p === "gst"
    ) {
      return p;
    }
    return "alert";
  }

  function syncMbInvFromServer() {
    if (typeof HKSync !== "undefined" && HKSync.getMbInvLog) {
      mbInvLogEntries = HKSync.getMbInvLog();
      mbInvLogEntries.forEach(normalizeMbInvEntry);
    }
  }

  function isMbInvIssueOpen(entry) {
    if (!entry) return false;
    if (entry.issueOpen === true) return true;
    return getPhase(entry) === "issue";
  }

  function normalizeMbInvEntry(entry) {
    if (!entry) return;
    if (getPhase(entry) === "issue") {
      entry.phase = "accepted";
      entry.issueOpen = true;
    }
  }

  function setIssueSectionVisible(sectionEl, visible) {
    if (!sectionEl) return;
    sectionEl.hidden = !visible;
  }

  function syncMbCheckFromServer() {
    if (typeof HKSync !== "undefined" && HKSync.getMbCheckLog) {
      mbCheckLogEntries = HKSync.getMbCheckLog();
    }
  }

  function saveMbInvLog() {
    if (typeof HKSync !== "undefined" && HKSync.setMbInvLog) {
      HKSync.setMbInvLog(mbInvLogEntries);
    }
  }

  function saveMbCheckLog() {
    if (typeof HKSync !== "undefined" && HKSync.setMbCheckLog) {
      HKSync.setMbCheckLog(mbCheckLogEntries);
    }
  }

  function findMbInvEntry(id) {
    if (!id) return null;
    for (var i = 0; i < mbInvLogEntries.length; i++) {
      if (mbInvLogEntries[i].id === id) return mbInvLogEntries[i];
    }
    return null;
  }

  function findMbCheckEntry(id) {
    if (!id) return null;
    for (var i = 0; i < mbCheckLogEntries.length; i++) {
      if (mbCheckLogEntries[i].id === id) return mbCheckLogEntries[i];
    }
    return null;
  }

  function roomArrow(from, to) {
    var a = from ? ctx.formatRoomNoDisplay(String(from)) : "—";
    var b = to ? ctx.formatRoomNoDisplay(String(to)) : "—";
    return a + " → " + b;
  }

  function requireName(cb) {
    if (!ctx.getOperatorName()) {
      ctx.showOperatorGate({ mode: "initial", onSaved: cb });
      return false;
    }
    return true;
  }

  function appendMbInvMemoDisplay(li, entry) {
    var memoStr = entry.memo != null ? String(entry.memo).trim() : "";
    var memoImg = entry.memoImage != null ? String(entry.memoImage).trim() : "";
    if (!memoStr && !memoImg) return;
    if (memoStr) {
      var memEl = document.createElement("div");
      memEl.className = "mb-inv__memo-display";
      memEl.textContent = memoStr;
      li.appendChild(memEl);
    }
    if (memoImg && ctx.hkAppendImageEl) {
      ctx.hkAppendImageEl(li, memoImg);
    }
  }

  function appendAccepterLabel(li, entry, field) {
    var key = field || "acceptedBy";
    var name = entry && entry[key] != null ? String(entry[key]).trim() : "";
    if (!name) return;
    var el = document.createElement("div");
    el.className = "hk-accepter-label";
    el.textContent = "접수자 : " + name;
    li.appendChild(el);
  }

  function appendMbInvItemCommon(li, entry, timePrefix, timeValue) {
    var t = document.createElement("div");
    t.className = "request-feedback__item-time";
    ctx.setLineWithEmTime(t, timePrefix, ctx.formatReqAt(timeValue || entry.at));
    li.appendChild(t);

    var row = document.createElement("div");
    row.className = "request-feedback__item-row";
    var r = document.createElement("span");
    r.className = "request-feedback__item-room";
    r.textContent = roomArrow(entry.roomFrom, entry.roomTo);
    row.appendChild(r);
    li.appendChild(row);
    appendMbInvMemoDisplay(li, entry);

    var byName = entry.by != null ? String(entry.by).trim() : "";
    if (byName) {
      var byEl = document.createElement("div");
      byEl.className = "order-feedback__item-by";
      byEl.textContent = byName;
      li.appendChild(byEl);
    }
  }

  function appendMbInvChatUi(li, entry) {
    var chatWrap = document.createElement("div");
    chatWrap.className = "order-chat";
    var msgList = document.createElement("ul");
    msgList.className = "order-chat__messages";
    var chat = Array.isArray(entry.chat) ? entry.chat : [];
    chat.sort(function (a, b) {
      return new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime();
    });
    chat.forEach(function (msg) {
        var byName = msg.by != null ? String(msg.by).trim() || "—" : "—";
        var msgLi = document.createElement("li");
        msgLi.className = "order-chat__msg";
        if (typeof ctx.applyChatBubbleAlign === "function") {
          ctx.applyChatBubbleAlign(msgLi, byName);
        } else if (typeof ctx.isOwnChatAuthor === "function") {
          msgLi.classList.add(
            ctx.isOwnChatAuthor(byName) ? "hk-chat-msg--mine" : "hk-chat-msg--other"
          );
        }
        var byEl = document.createElement("div");
        byEl.className = "order-chat__msg-by";
        byEl.textContent = byName;
        msgLi.appendChild(byEl);
        if (typeof ctx.applyChatBubbleColors === "function") {
          ctx.applyChatBubbleColors(msgLi, byName, byEl, "order-chat__msg-text");
        }
        ctx.hkAppendMessageContent(msgLi, msg.text, msg.image, "order-chat__msg-text");
        if (msg.edited) {
          var textEl = msgLi.querySelector(".order-chat__msg-text");
          if (textEl) {
            var editedMark = document.createElement("span");
            editedMark.className = "front-chat__msg-edited";
            editedMark.textContent = "(수정됨)";
            textEl.appendChild(editedMark);
          }
        }
        msgList.appendChild(msgLi);
      });
    chatWrap.appendChild(msgList);

    var chatKey = "mbInvChat:" + (entry.id || "");
    var chatForm = document.createElement("form");
    chatForm.className = "order-chat__form hk-compose-row mb-inv-chat__form";
    chatForm.setAttribute("data-mb-inv-id", entry.id || "");
    var chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.placeholder = "메시지 입력";
    chatInput.autocomplete = "off";
    chatForm.appendChild(chatInput);
    chatForm.appendChild(ctx.hkCreatePhotoButton(chatKey));
    ctx.hkBindPhotoPaste(chatInput, chatKey, {
      autoSend: function (text, image) {
        appendMbInvChat(entry.id || "", text, image);
      },
    });
    var chatSend = document.createElement("button");
    chatSend.type = "submit";
    chatSend.className = "order-chat__send";
    chatSend.textContent = "전송";
    chatForm.appendChild(chatSend);
    chatWrap.appendChild(chatForm);
    chatWrap.appendChild(ctx.hkCreatePhotoPreview(chatKey));
    li.appendChild(chatWrap);
  }

  function renderMbInvWorkBlock(category, prefix) {
    var issueList = document.getElementById(prefix + "IssueList");
    var issueEmpty = document.getElementById(prefix + "IssueEmpty");
    var acceptedList = document.getElementById(prefix + "AcceptedList");
    var acceptedEmpty = document.getElementById(prefix + "AcceptedEmpty");
    var cancelledList = document.getElementById(prefix + "CancelledList");
    var cancelledEmpty = document.getElementById(prefix + "CancelledEmpty");
    if (!issueList || !acceptedList || !cancelledList) return;

    issueList.innerHTML = "";
    acceptedList.innerHTML = "";
    cancelledList.innerHTML = "";

    var issueEntries = mbInvLogEntries.filter(function (e) {
      return e.category === category && isMbInvIssueOpen(e);
    });
    var acceptedEntries = mbInvLogEntries.filter(function (e) {
      return e.category === category && getPhase(e) === "accepted" && !isMbInvIssueOpen(e);
    });
    var cancelledEntries = mbInvLogEntries.filter(function (e) {
      return e.category === category && getPhase(e) === "cancelled";
    });

    issueEntries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item";
      li.setAttribute("data-mb-inv-id", entry.id || "");
      appendMbInvItemCommon(li, entry, "문제 ", entry.issueAt || entry.at);
      if (ctx.getMaintenanceMode()) {
        var issueActs = document.createElement("div");
        issueActs.className = "order-work__actions";
        var acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "order-work__accept-btn mb-inv__resolve-btn";
        acceptBtn.setAttribute("data-mb-inv-id", entry.id || "");
        acceptBtn.textContent = "완료";
        issueActs.appendChild(acceptBtn);
        li.appendChild(issueActs);
      }
      appendMbInvChatUi(li, entry);
      issueList.appendChild(li);
    });

    acceptedEntries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item";
      li.setAttribute("data-mb-inv-id", entry.id || "");
      appendMbInvItemCommon(li, entry, "접수 ", entry.acceptedAt || entry.at);
      appendAccepterLabel(li, entry);
      appendMbInvAcceptedMaintActions(li, entry);
      acceptedList.appendChild(li);
    });

    cancelledEntries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item order-work-item--cancelled";
      li.setAttribute("data-mb-inv-id", entry.id || "");
      appendMbInvItemCommon(li, entry, "취소 ", entry.cancelledAt || entry.at);
      var xMark = document.createElement("div");
      xMark.className = "order-work-item__x";
      xMark.textContent = "✕";
      li.appendChild(xMark);
      cancelledList.appendChild(li);
    });

    if (issueEmpty) issueEmpty.hidden = issueEntries.length > 0;
    if (acceptedEmpty) acceptedEmpty.hidden = acceptedEntries.length > 0;
    if (cancelledEmpty) cancelledEmpty.hidden = cancelledEntries.length > 0;
    setIssueSectionVisible(
      document.getElementById(prefix + "IssueSection"),
      issueEntries.length > 0
    );
  }

  function updateMbInvMemo(id, memo, memoImage) {
    var entry = findMbInvEntry(id);
    if (!entry || getPhase(entry) !== "alert") return;
    entry.memo = memo != null ? String(memo).trim() : "";
    entry.memoImage = memoImage != null ? String(memoImage).trim() : "";
    saveMbInvLog();
    renderMbInvPanels();
  }

  function openMbInvMemoEditor(entryId) {
    if (!ctx.getFrontMode() && !ctx.getMaintenanceMode()) return;
    var entry = findMbInvEntry(entryId);
    if (!entry || getPhase(entry) !== "alert") return;
    var li = document.querySelector(
      '#mbInvFeedbackList .order-feedback__item[data-mb-inv-id="' + entryId + '"]'
    );
    if (!li) return;
    var oldWrap = li.querySelector(".mb-inv__memo-editor-wrap");
    if (oldWrap) {
      oldWrap.remove();
      li.querySelectorAll(".mb-inv__memo-btn, .mb-inv__cancel-btn, .mb-inv__accept-btn").forEach(
        function (b) {
          b.style.visibility = "";
        }
      );
      return;
    }
    document.querySelectorAll(".mb-inv__memo-editor-wrap").forEach(function (n) {
      n.remove();
    });
    var memoEditKey = "mbInvMemoEdit:" + entryId;
    if (ctx.hkClearPhoto) ctx.hkClearPhoto(memoEditKey);
    if (entry.memoImage && ctx.hkSetPhotoPreview) {
      ctx.hkSetPhotoPreview(memoEditKey, entry.memoImage);
    }
    li.querySelectorAll(".mb-inv__memo-btn, .mb-inv__cancel-btn, .mb-inv__accept-btn").forEach(
      function (b) {
        b.style.visibility = "hidden";
      }
    );
    var wrap = document.createElement("div");
    wrap.className =
      "request-feedback__memo-editor-wrap order-feedback__memo-editor-wrap mb-inv__memo-editor-wrap";
    var ed = document.createElement("div");
    ed.className = "request-feedback__memo-editor";
    var ta = document.createElement("textarea");
    ta.setAttribute("aria-label", "MB & 인벤 메모");
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
    if (ctx.hkCreatePhotoButton) act.appendChild(ctx.hkCreatePhotoButton(memoEditKey));
    ed.appendChild(ta);
    ed.appendChild(act);
    wrap.appendChild(ed);
    if (ctx.hkCreatePhotoPreview) wrap.appendChild(ctx.hkCreatePhotoPreview(memoEditKey));
    li.appendChild(wrap);
    if (ctx.hkBindPhotoPaste) ctx.hkBindPhotoPaste(ta, memoEditKey);

    function done() {
      if (ctx.hkClearPhoto) ctx.hkClearPhoto(memoEditKey);
      li.querySelectorAll(".mb-inv__memo-btn, .mb-inv__cancel-btn, .mb-inv__accept-btn").forEach(
        function (b) {
          b.style.visibility = "";
        }
      );
      wrap.remove();
      renderMbInvPanels();
    }

    ok.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var img = ctx.hkGetPhoto ? ctx.hkGetPhoto(memoEditKey) || "" : "";
      updateMbInvMemo(entryId, ta.value, img);
      if (ctx.hkClearPhoto) ctx.hkClearPhoto(memoEditKey);
      li.querySelectorAll(".mb-inv__memo-btn, .mb-inv__cancel-btn, .mb-inv__accept-btn").forEach(
        function (b) {
          b.style.visibility = "";
        }
      );
      wrap.remove();
    });
    cancel.addEventListener("click", function (ev) {
      ev.stopPropagation();
      done();
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

  function renderMbInvLogPanel() {
    var list = document.getElementById("mbInvFeedbackList");
    var empty = document.getElementById("mbInvFeedbackEmpty");
    if (!list) return;
    list.innerHTML = "";
    var entries = mbInvLogEntries.filter(function (e) {
      return getPhase(e) === "alert";
    });
    entries.forEach(function (entry) {
      var li = document.createElement("li");
      var isInv = entry.category === "inv";
      li.className =
        "order-feedback__item order-feedback__item--" + (isInv ? "inv" : "mb");
      li.setAttribute("data-mb-inv-id", entry.id || "");
      var tag = document.createElement("div");
      tag.className =
        "mb-workflow__tag mb-workflow__tag--" + (isInv ? "inv" : "mb");
      tag.textContent = isInv ? "인벤 변경" : "MB 변경";
      li.appendChild(tag);
      appendMbInvItemCommon(li, entry, "접수 ", entry.at);
      var memoStr = entry.memo != null ? String(entry.memo).trim() : "";
      if (ctx.getMaintenanceMode()) {
        var maintActs = document.createElement("div");
        maintActs.className = "order-feedback__maint-actions";
        var acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "order-feedback__accept-btn mb-inv__accept-btn";
        acceptBtn.setAttribute("data-mb-inv-id", entry.id || "");
        acceptBtn.textContent = "접수";
        maintActs.appendChild(acceptBtn);
        var memoBtnMaint = document.createElement("button");
        memoBtnMaint.type = "button";
        memoBtnMaint.className = "request-feedback__memo-btn mb-inv__memo-btn";
        memoBtnMaint.setAttribute("data-mb-inv-id", entry.id || "");
        memoBtnMaint.textContent = memoStr ? "메모 수정" : "메모 입력";
        memoBtnMaint.setAttribute(
          "aria-label",
          memoStr ? "메모 수정" : "메모 입력"
        );
        maintActs.appendChild(memoBtnMaint);
        li.appendChild(maintActs);
      }
      if (ctx.getFrontMode()) {
        var frontActs = document.createElement("div");
        frontActs.className = "order-feedback__front-actions";
        var memoBtn = document.createElement("button");
        memoBtn.type = "button";
        memoBtn.className = "request-feedback__memo-btn mb-inv__memo-btn";
        memoBtn.setAttribute("data-mb-inv-id", entry.id || "");
        memoBtn.textContent = memoStr ? "메모 수정" : "메모 입력";
        memoBtn.setAttribute("aria-label", memoStr ? "메모 수정" : "메모 입력");
        frontActs.appendChild(memoBtn);
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "request-feedback__cancel-btn mb-inv__cancel-btn";
        cancelBtn.setAttribute("data-mb-inv-id", entry.id || "");
        cancelBtn.textContent = "취소";
        frontActs.appendChild(cancelBtn);
        li.appendChild(frontActs);
      }
      list.appendChild(li);
    });
    if (empty) empty.hidden = entries.length > 0;
  }

  function renderMbInvPanels() {
    renderMbInvLogPanel();
    renderMbInvWorkBlock("mb", "mbChange");
    renderMbInvWorkBlock("inv", "invChange");
    if (typeof global.HKInvenNotify !== "undefined" && global.HKInvenNotify.render) {
      try {
        global.HKInvenNotify.render();
      } catch (e) {}
    }
  }

  function appendMbInvLog(category, roomFrom, roomTo, memo, memoImage) {
    var id =
      "mbinv-" +
      category +
      "-" +
      Date.now() +
      "-" +
      Math.floor(Math.random() * 1e9);
    mbInvLogEntries.unshift({
      id: id,
      category: category,
      roomFrom: roomFrom,
      roomTo: roomTo,
      memo: memo != null ? String(memo).trim() : "",
      memoImage: memoImage != null ? String(memoImage).trim() : "",
      phase: "alert",
      at: new Date().toISOString(),
      by: ctx.getOperatorName(),
      chat: [],
    });
    saveMbInvLog();
    renderMbInvPanels();
  }

  function acceptMbInvEntry(id) {
    var entry = findMbInvEntry(id);
    if (!entry || getPhase(entry) !== "alert") return;
    if (!requireName(function () {
      acceptMbInvEntry(id);
    })) return;
    entry.phase = "accepted";
    entry.acceptedAt = new Date().toISOString();
    entry.acceptedBy = ctx.getOperatorName();
    saveMbInvLog();
    renderMbInvPanels();
  }

  function raiseMbInvIssue(id) {
    var entry = findMbInvEntry(id);
    if (!entry || getPhase(entry) !== "accepted" || isMbInvIssueOpen(entry)) return;
    if (!ctx.getMaintenanceMode()) return;
    if (!requireName(function () {
      raiseMbInvIssue(id);
    })) return;
    entry.issueOpen = true;
    entry.issueAt = new Date().toISOString();
    entry.issueBy = ctx.getOperatorName();
    if (!Array.isArray(entry.chat)) entry.chat = [];
    saveMbInvLog();
    renderMbInvPanels();
  }

  function resolveMbInvIssue(id) {
    var entry = findMbInvEntry(id);
    if (!entry || !isMbInvIssueOpen(entry)) return;
    if (!ctx.getMaintenanceMode()) return;
    if (!requireName(function () {
      resolveMbInvIssue(id);
    })) return;
    entry.issueOpen = false;
    entry.issueBtnVisible = true;
    entry.reacceptedAt = new Date().toISOString();
    entry.reacceptedBy = ctx.getOperatorName();
    saveMbInvLog();
    renderMbInvPanels();
  }

  function isIssueBtnVisible(entry) {
    return entry && entry.issueBtnVisible !== false;
  }

  function appendMbInvAcceptedMaintActions(li, entry) {
    if (!ctx.getMaintenanceMode()) return;
    var acts = document.createElement("div");
    acts.className = "order-work__actions order-work__actions--toggle";
    if (isIssueBtnVisible(entry)) {
      var issueBtn = document.createElement("button");
      issueBtn.type = "button";
      issueBtn.className = "order-work__issue-btn mb-inv__issue-btn";
      issueBtn.setAttribute("data-mb-inv-id", entry.id || "");
      issueBtn.textContent = "문제 발생";
      acts.appendChild(issueBtn);
    }
    var wanBtn = document.createElement("button");
    wanBtn.type = "button";
    wanBtn.className =
      "order-work__wan-btn mb-inv__wan-btn" +
      (isIssueBtnVisible(entry) ? " is-on" : "");
    wanBtn.setAttribute("data-mb-inv-id", entry.id || "");
    wanBtn.textContent = "완";
    acts.appendChild(wanBtn);
    li.appendChild(acts);
  }

  function toggleMbInvIssueBtnVisible(id) {
    var entry = findMbInvEntry(id);
    if (!entry || getPhase(entry) !== "accepted" || isMbInvIssueOpen(entry)) return;
    if (!ctx.getMaintenanceMode()) return;
    entry.issueBtnVisible = !isIssueBtnVisible(entry);
    saveMbInvLog();
    renderMbInvPanels();
  }

  function appendMbInvChat(id, text, image) {
    var entry = findMbInvEntry(id);
    if (!entry || !isMbInvIssueOpen(entry)) return;
    var msgText = String(text || "").trim();
    var msgImage = image != null ? String(image).trim() : "";
    if (!msgText && !msgImage) return;
    if (!requireName(function () {
      appendMbInvChat(id, msgText, msgImage);
    })) return;
    if (!Array.isArray(entry.chat)) entry.chat = [];
    entry.chat.push({
      at: new Date().toISOString(),
      by: ctx.getOperatorName(),
      text: msgText,
      image: msgImage || "",
    });
    ctx.hkClearPhoto("mbInvChat:" + id);
    saveMbInvLog();
    renderMbInvPanels();
    requestAnimationFrame(function () {
      var card = document.querySelector(
        '.order-work-section--issue .order-work-item[data-mb-inv-id="' + id + '"]'
      );
      if (!card) return;
      var msgList = card.querySelector(".order-chat__messages");
      if (msgList) msgList.scrollTop = msgList.scrollHeight;
      var chatInput = card.querySelector(".order-chat__form input");
      if (chatInput) chatInput.focus();
    });
  }

  function cancelMbInvEntry(id, handlerName) {
    var entry = findMbInvEntry(id);
    if (!entry || getPhase(entry) === "cancelled") return;
    entry.phase = "cancelled";
    entry.cancelledAt = new Date().toISOString();
    entry.cancelledBy = handlerName != null ? String(handlerName).trim() : "";
    ctx.appendCancelNameLog(
      entry.roomFrom + "→" + entry.roomTo,
      entry.cancelledBy,
      id,
      {
        kind: entry.category === "inv" ? "inv" : "mb",
        memo:
          (entry.memo != null && String(entry.memo).trim()
            ? String(entry.memo).trim()
            : "") ||
          roomArrow(entry.roomFrom, entry.roomTo),
      }
    );
    saveMbInvLog();
    renderMbInvPanels();
    ctx.onCancelListRefresh();
  }

  function renderMbCheckLogPanel() {
    var list = document.getElementById("mbCheckFeedbackList");
    var empty = document.getElementById("mbCheckFeedbackEmpty");
    if (!list) return;
    list.innerHTML = "";
    var entries = mbCheckLogEntries.filter(function (e) {
      return getPhase(e) === "alert";
    });
    entries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-feedback__item";
      li.setAttribute("data-mb-check-id", entry.id || "");
      var t = document.createElement("div");
      t.className = "request-feedback__item-time";
      ctx.setLineWithEmTime(t, "", ctx.formatReqAt(entry.at));
      li.appendChild(t);
      var row = document.createElement("div");
      row.className = "request-feedback__item-row";
      var r = document.createElement("span");
      r.className = "request-feedback__item-room";
      r.textContent = ctx.formatRoomNoDisplay(String(entry.room || ""));
      row.appendChild(r);
      li.appendChild(row);
      appendMbCheckMemoDisplay(li, entry);
      appendMbCheckBy(li, entry);

      if (ctx.getMaintenanceMode()) {
        var wrap = document.createElement("div");
        wrap.className = "mb-check__memo-wrap";
        var ta = document.createElement("textarea");
        ta.className = "mb-check__memo-input";
        ta.placeholder = "메모 입력";
        ta.rows = 2;
        ta.setAttribute("data-mb-check-id", entry.id || "");
        wrap.appendChild(ta);
        var maintActs = document.createElement("div");
        maintActs.className = "order-feedback__maint-actions mb-check__alert-actions";
        var gstBtn = document.createElement("button");
        gstBtn.type = "button";
        gstBtn.className = "mb-check__gst-btn";
        gstBtn.setAttribute("data-mb-check-id", entry.id || "");
        gstBtn.textContent = "GST 있음";
        maintActs.appendChild(gstBtn);
        var acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "order-feedback__accept-btn mb-check__accept-btn";
        acceptBtn.setAttribute("data-mb-check-id", entry.id || "");
        acceptBtn.textContent = "접수";
        maintActs.appendChild(acceptBtn);
        wrap.appendChild(maintActs);
        li.appendChild(wrap);
      }
      if (ctx.getFrontMode()) {
        var frontActs = document.createElement("div");
        frontActs.className = "order-feedback__front-actions";
        appendMbCheckMemoBtn(frontActs, entry);
        var cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "request-feedback__cancel-btn mb-check__cancel-btn";
        cancelBtn.setAttribute("data-mb-check-id", entry.id || "");
        cancelBtn.textContent = "취소";
        frontActs.appendChild(cancelBtn);
        li.appendChild(frontActs);
      }
      list.appendChild(li);
    });
    if (empty) empty.hidden = entries.length > 0;
  }

  function appendMbCheckMemoDisplay(li, entry) {
    var memoStr = entry.memo != null ? String(entry.memo).trim() : "";
    if (!memoStr) return;
    var memEl = document.createElement("div");
    memEl.className = "mb-check__memo-display";
    memEl.textContent = memoStr;
    li.appendChild(memEl);
  }

  function appendMbCheckBy(li, entry) {
    var byName = entry.by != null ? String(entry.by).trim() : "";
    if (!byName) return;
    var byEl = document.createElement("div");
    byEl.className = "order-feedback__item-by";
    byEl.textContent = byName;
    li.appendChild(byEl);
  }

  function appendMbCheckMemoBtn(parent, entry) {
    if (!ctx.getFrontMode() && !ctx.getMaintenanceMode()) return;
    var memoStr = entry.memo != null ? String(entry.memo).trim() : "";
    var memoBtn = document.createElement("button");
    memoBtn.type = "button";
    memoBtn.className = "request-feedback__memo-btn mb-check__memo-btn";
    memoBtn.setAttribute("data-mb-check-id", entry.id || "");
    memoBtn.textContent = memoStr ? "메모 수정" : "메모 입력";
    memoBtn.setAttribute("aria-label", memoStr ? "메모 수정" : "메모 입력");
    parent.appendChild(memoBtn);
  }

  function updateMbCheckMemo(id, memo) {
    var entry = findMbCheckEntry(id);
    if (!entry) return;
    var phase = getPhase(entry);
    if (phase !== "alert" && phase !== "accepted" && phase !== "gst") return;
    if (!ctx.getFrontMode() && !ctx.getMaintenanceMode()) return;
    entry.memo = memo != null ? String(memo).trim() : "";
    saveMbCheckLog();
    renderMbCheckPanels();
  }

  function openMbCheckMemoEditor(entryId) {
    if (!ctx.getFrontMode() && !ctx.getMaintenanceMode()) return;
    var entry = findMbCheckEntry(entryId);
    if (!entry) return;
    var phase = getPhase(entry);
    if (phase !== "alert" && phase !== "accepted" && phase !== "gst") return;
    var li =
      document.querySelector(
        '#mbCheckFeedbackList .order-feedback__item[data-mb-check-id="' +
          entryId +
          '"]'
      ) ||
      document.querySelector(
        '.order-work-item[data-mb-check-id="' + entryId + '"]'
      );
    if (!li) return;
    var oldWrap = li.querySelector(".mb-check__memo-editor-wrap");
    if (oldWrap) {
      oldWrap.remove();
      li.querySelectorAll(
        ".mb-check__memo-btn, .mb-check__cancel-btn, .mb-check__post-btn, .mb-check__rerequest-btn, .mb-check__accept-btn, .mb-check__gst-btn"
      ).forEach(function (b) {
        b.style.visibility = "";
      });
      return;
    }
    document.querySelectorAll(".mb-check__memo-editor-wrap").forEach(function (n) {
      n.remove();
    });
    li.querySelectorAll(
      ".mb-check__memo-btn, .mb-check__cancel-btn, .mb-check__post-btn, .mb-check__rerequest-btn, .mb-check__accept-btn, .mb-check__gst-btn"
    ).forEach(function (b) {
      b.style.visibility = "hidden";
    });
    var wrap = document.createElement("div");
    wrap.className =
      "request-feedback__memo-editor-wrap order-feedback__memo-editor-wrap mb-check__memo-editor-wrap";
    var ed = document.createElement("div");
    ed.className = "request-feedback__memo-editor";
    var ta = document.createElement("textarea");
    ta.setAttribute("aria-label", "MB CHECK 메모");
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
    ed.appendChild(ta);
    ed.appendChild(act);
    wrap.appendChild(ed);
    li.appendChild(wrap);

    function done() {
      li.querySelectorAll(
        ".mb-check__memo-btn, .mb-check__cancel-btn, .mb-check__post-btn, .mb-check__rerequest-btn, .mb-check__accept-btn, .mb-check__gst-btn"
      ).forEach(function (b) {
        b.style.visibility = "";
      });
      wrap.remove();
      renderMbCheckPanels();
    }

    ok.addEventListener("click", function (ev) {
      ev.stopPropagation();
      updateMbCheckMemo(entryId, ta.value);
      wrap.remove();
    });
    cancel.addEventListener("click", function (ev) {
      ev.stopPropagation();
      done();
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

  function renderMbCheckWorkPanels() {
    var acceptedList = document.getElementById("mbCheckAcceptedList");
    var acceptedEmpty = document.getElementById("mbCheckAcceptedEmpty");
    var gstList = document.getElementById("mbCheckGstList");
    var gstEmpty = document.getElementById("mbCheckGstEmpty");
    var postedList = document.getElementById("mbCheckPostedList");
    var postedEmpty = document.getElementById("mbCheckPostedEmpty");
    if (!acceptedList || !postedList) return;
    acceptedList.innerHTML = "";
    if (gstList) gstList.innerHTML = "";
    postedList.innerHTML = "";

    var acceptedEntries = mbCheckLogEntries.filter(function (e) {
      return getPhase(e) === "accepted";
    });
    var gstEntries = mbCheckLogEntries.filter(function (e) {
      return getPhase(e) === "gst";
    });
    var postedEntries = mbCheckLogEntries.filter(function (e) {
      return getPhase(e) === "posted";
    });

    function appendMbCheckWorkBase(li, entry, timeValue) {
      var t = document.createElement("div");
      t.className = "request-feedback__item-time";
      ctx.setLineWithEmTime(t, "", ctx.formatReqAt(timeValue || entry.at));
      li.appendChild(t);
      var row = document.createElement("div");
      row.className = "request-feedback__item-row";
      var r = document.createElement("span");
      r.className = "request-feedback__item-room";
      r.textContent = ctx.formatRoomNoDisplay(String(entry.room || ""));
      row.appendChild(r);
      li.appendChild(row);
      appendMbCheckMemoDisplay(li, entry);
      appendMbCheckBy(li, entry);
    }

    acceptedEntries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item";
      li.setAttribute("data-mb-check-id", entry.id || "");
      appendMbCheckWorkBase(li, entry, entry.acceptedAt || entry.at);
      appendAccepterLabel(li, entry);
      var acts = document.createElement("div");
      acts.className = "order-work__actions";
      appendMbCheckMemoBtn(acts, entry);
      if (ctx.getFrontMode()) {
        var postBtn = document.createElement("button");
        postBtn.type = "button";
        postBtn.className = "order-work__accept-btn mb-check__post-btn";
        postBtn.setAttribute("data-mb-check-id", entry.id || "");
        postBtn.textContent = "포스팅 완료";
        acts.appendChild(postBtn);
      }
      if (acts.childNodes.length) li.appendChild(acts);
      acceptedList.appendChild(li);
    });

    gstEntries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item";
      li.setAttribute("data-mb-check-id", entry.id || "");
      appendMbCheckWorkBase(li, entry, entry.gstAt || entry.at);
      appendAccepterLabel(li, entry, "gstBy");
      var gstActs = document.createElement("div");
      gstActs.className = "order-work__actions";
      appendMbCheckMemoBtn(gstActs, entry);
      if (ctx.getFrontMode()) {
        var rereqBtn = document.createElement("button");
        rereqBtn.type = "button";
        rereqBtn.className = "mb-check__rerequest-btn";
        rereqBtn.setAttribute("data-mb-check-id", entry.id || "");
        rereqBtn.textContent = "재요청";
        gstActs.appendChild(rereqBtn);
      }
      if (gstActs.childNodes.length) li.appendChild(gstActs);
      if (gstList) gstList.appendChild(li);
    });

    postedEntries.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "order-work-item";
      li.setAttribute("data-mb-check-id", entry.id || "");
      appendMbCheckWorkBase(li, entry, entry.postedAt || entry.at);
      appendAccepterLabel(li, entry);
      postedList.appendChild(li);
    });

    if (acceptedEmpty) acceptedEmpty.hidden = acceptedEntries.length > 0;
    if (gstEmpty) gstEmpty.hidden = gstEntries.length > 0;
    if (postedEmpty) postedEmpty.hidden = postedEntries.length > 0;
  }

  function renderMbCheckPanels() {
    renderMbCheckLogPanel();
    renderMbCheckWorkPanels();
  }

  function appendMbCheckLog(room, memo) {
    var id = "mbchk-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
    mbCheckLogEntries.unshift({
      id: id,
      room: room,
      memo: memo != null ? String(memo).trim() : "",
      phase: "alert",
      at: new Date().toISOString(),
      by: ctx.getOperatorName(),
      chat: [],
    });
    saveMbCheckLog();
    renderMbCheckPanels();
  }

  function acceptMbCheckEntry(id, memoText) {
    var entry = findMbCheckEntry(id);
    if (!entry || getPhase(entry) !== "alert") return;
    if (!ctx.getMaintenanceMode()) return;
    if (!requireName(function () {
      acceptMbCheckEntry(id, memoText);
    })) return;
    var acceptMemo = memoText != null ? String(memoText).trim() : "";
    var regMemo = entry.memo != null ? String(entry.memo).trim() : "";
    entry.phase = "accepted";
    entry.memo = acceptMemo || regMemo;
    entry.acceptedAt = new Date().toISOString();
    entry.acceptedBy = ctx.getOperatorName();
    if (!Array.isArray(entry.chat)) entry.chat = [];
    saveMbCheckLog();
    renderMbCheckPanels();
  }

  function markMbCheckGst(id, memoText) {
    var entry = findMbCheckEntry(id);
    if (!entry || getPhase(entry) !== "alert") return;
    if (!ctx.getMaintenanceMode()) return;
    if (!requireName(function () {
      markMbCheckGst(id, memoText);
    })) return;
    var gstMemo = memoText != null ? String(memoText).trim() : "";
    var regMemo = entry.memo != null ? String(entry.memo).trim() : "";
    entry.phase = "gst";
    entry.memo = gstMemo || regMemo;
    entry.gstAt = new Date().toISOString();
    entry.gstBy = ctx.getOperatorName();
    if (!Array.isArray(entry.chat)) entry.chat = [];
    saveMbCheckLog();
    renderMbCheckPanels();
  }

  function rerequestMbCheckFromGst(id) {
    var entry = findMbCheckEntry(id);
    if (!entry || getPhase(entry) !== "gst") return;
    if (!ctx.getFrontMode()) return;
    if (!requireName(function () {
      rerequestMbCheckFromGst(id);
    })) return;
    entry.phase = "alert";
    entry.at = new Date().toISOString();
    entry.rerequestedAt = new Date().toISOString();
    entry.rerequestedBy = ctx.getOperatorName();
    saveMbCheckLog();
    renderMbCheckPanels();
  }

  function postMbCheckEntry(id) {
    var entry = findMbCheckEntry(id);
    if (!entry || getPhase(entry) !== "accepted") return;
    if (!ctx.getFrontMode()) return;
    if (!requireName(function () {
      postMbCheckEntry(id);
    })) return;
    entry.phase = "posted";
    entry.postedAt = new Date().toISOString();
    entry.postedBy = ctx.getOperatorName();
    saveMbCheckLog();
    renderMbCheckPanels();
  }

  function cancelMbCheckEntry(id, handlerName) {
    var entry = findMbCheckEntry(id);
    if (!entry || getPhase(entry) === "cancelled") return;
    entry.phase = "cancelled";
    entry.cancelledAt = new Date().toISOString();
    entry.cancelledBy = handlerName != null ? String(handlerName).trim() : "";
    ctx.appendCancelNameLog(entry.room, entry.cancelledBy, id, {
      kind: "mbcheck",
      memo: entry.memo || "",
    });
    saveMbCheckLog();
    renderMbCheckPanels();
    ctx.onCancelListRefresh();
  }

  function processMbInvFormSubmit(category) {
    var prefix = category === "inv" ? "inv" : "mb";
    var fromEl = document.getElementById(prefix + "RoomFrom");
    var toEl = document.getElementById(prefix + "RoomTo");
    var memoEl = document.getElementById(prefix + "Memo");
    var photoKey = prefix + "Memo";
    var from = fromEl ? String(fromEl.value || "").trim() : "";
    var to = toEl ? String(toEl.value || "").trim() : "";
    var memo = memoEl ? String(memoEl.value || "").trim() : "";
    var memoImage = ctx.hkGetPhoto ? ctx.hkGetPhoto(photoKey) || "" : "";
    if (!from || !to) {
      if (!from && fromEl) fromEl.focus();
      else if (toEl) toEl.focus();
      return;
    }
    if (!requireName(function () {
      processMbInvFormSubmit(category);
    })) return;
    appendMbInvLog(category, from, to, memo, memoImage);
    if (fromEl) fromEl.value = "";
    if (toEl) toEl.value = "";
    if (memoEl) memoEl.value = "";
    if (ctx.hkClearPhoto) ctx.hkClearPhoto(photoKey);
  }

  function processMbCheckFormSubmit() {
    var roomEl = document.getElementById("mbCheckRoomNo");
    var memoEl = document.getElementById("mbCheckMemo");
    var room = roomEl ? String(roomEl.value || "").trim() : "";
    var memo = memoEl ? String(memoEl.value || "").trim() : "";
    if (!room) {
      if (roomEl) roomEl.focus();
      return;
    }
    if (!requireName(function () {
      processMbCheckFormSubmit();
    })) return;
    appendMbCheckLog(room, memo);
    if (roomEl) roomEl.value = "";
    if (memoEl) memoEl.value = "";
  }

  function setupEventHandlers() {
    var mbForm = document.getElementById("mbChangeForm");
    if (mbForm) {
      mbForm.addEventListener("submit", function (e) {
        e.preventDefault();
        processMbInvFormSubmit("mb");
      });
    }
    var invForm = document.getElementById("invChangeForm");
    if (invForm) {
      invForm.addEventListener("submit", function (e) {
        e.preventDefault();
        processMbInvFormSubmit("inv");
      });
    }
    var checkForm = document.getElementById("mbCheckForm");
    if (checkForm) {
      checkForm.addEventListener("submit", function (e) {
        e.preventDefault();
        processMbCheckFormSubmit();
      });
    }

    var mbInvPanel = document.getElementById("mbInvPanel");
    if (mbInvPanel) {
      mbInvPanel.addEventListener("click", function (e) {
        var resolveBtn = e.target.closest(".mb-inv__resolve-btn");
        if (resolveBtn) {
          if (!ctx.getMaintenanceMode()) return;
          var rid = resolveBtn.getAttribute("data-mb-inv-id");
          if (rid) resolveMbInvIssue(rid);
          return;
        }
        var wanBtn = e.target.closest(".mb-inv__wan-btn");
        if (wanBtn) {
          if (!ctx.getMaintenanceMode()) return;
          var wid = wanBtn.getAttribute("data-mb-inv-id");
          if (wid) toggleMbInvIssueBtnVisible(wid);
          return;
        }
        var issueBtn = e.target.closest(".mb-inv__issue-btn");
        if (issueBtn) {
          if (!ctx.getMaintenanceMode()) return;
          var iid = issueBtn.getAttribute("data-mb-inv-id");
          if (iid) raiseMbInvIssue(iid);
        }
      });
      mbInvPanel.addEventListener("submit", function (e) {
        var chatForm = e.target.closest(".mb-inv-chat__form");
        if (!chatForm) return;
        e.preventDefault();
        var cid = chatForm.getAttribute("data-mb-inv-id");
        var inp = chatForm.querySelector("input");
        var text = inp ? inp.value : "";
        var img = cid ? ctx.hkGetPhoto("mbInvChat:" + cid) : null;
        if (cid) appendMbInvChat(cid, text, img);
        if (inp) inp.value = "";
      });
    }

    var mbCheckPanel = document.getElementById("mbCheckPanel");
    if (mbCheckPanel) {
      mbCheckPanel.addEventListener("click", function (e) {
        var memoBtn = e.target.closest(".mb-check__memo-btn");
        if (memoBtn) {
          if (!ctx.getFrontMode() && !ctx.getMaintenanceMode()) return;
          e.preventDefault();
          e.stopPropagation();
          var mid = memoBtn.getAttribute("data-mb-check-id");
          if (mid) openMbCheckMemoEditor(mid);
          return;
        }
        var postBtn = e.target.closest(".mb-check__post-btn");
        if (postBtn) {
          if (!ctx.getFrontMode()) return;
          var pid = postBtn.getAttribute("data-mb-check-id");
          if (pid) postMbCheckEntry(pid);
          return;
        }
        var rereqBtn = e.target.closest(".mb-check__rerequest-btn");
        if (rereqBtn) {
          if (!ctx.getFrontMode()) return;
          var reqId = rereqBtn.getAttribute("data-mb-check-id");
          if (reqId) rerequestMbCheckFromGst(reqId);
        }
      });
    }

    var mbInvFb = document.getElementById("mbInvFeedback");
    if (mbInvFb) {
      mbInvFb.addEventListener("click", function (e) {
        var acceptBtn = e.target.closest(".mb-inv__accept-btn");
        if (acceptBtn) {
          if (!ctx.getMaintenanceMode()) return;
          var aid = acceptBtn.getAttribute("data-mb-inv-id");
          if (aid) acceptMbInvEntry(aid);
          return;
        }
        var memoBtn = e.target.closest(".mb-inv__memo-btn");
        if (memoBtn) {
          if (!ctx.getFrontMode() && !ctx.getMaintenanceMode()) return;
          e.preventDefault();
          e.stopPropagation();
          var mid = memoBtn.getAttribute("data-mb-inv-id");
          if (mid) openMbInvMemoEditor(mid);
          return;
        }
        var cancelBtn = e.target.closest(".mb-inv__cancel-btn");
        if (cancelBtn) {
          if (!ctx.getFrontMode()) return;
          var cid = cancelBtn.getAttribute("data-mb-inv-id");
          if (cid) ctx.openCancelConfirmModal(cid);
        }
      });
    }

    var mbCheckFb = document.getElementById("mbCheckFeedback");
    if (mbCheckFb) {
      mbCheckFb.addEventListener("click", function (e) {
        var memoBtn = e.target.closest(".mb-check__memo-btn");
        if (memoBtn) {
          if (!ctx.getFrontMode() && !ctx.getMaintenanceMode()) return;
          e.preventDefault();
          e.stopPropagation();
          var mid = memoBtn.getAttribute("data-mb-check-id");
          if (mid) openMbCheckMemoEditor(mid);
          return;
        }
        var acceptBtn = e.target.closest(".mb-check__accept-btn");
        if (acceptBtn) {
          if (!ctx.getMaintenanceMode()) return;
          var aid = acceptBtn.getAttribute("data-mb-check-id");
          if (!aid) return;
          var itemEl =
            acceptBtn.closest(".order-feedback__item") ||
            acceptBtn.closest("li");
          var ta = itemEl ? itemEl.querySelector(".mb-check__memo-input") : null;
          var memo = ta ? ta.value : "";
          acceptMbCheckEntry(aid, memo);
          return;
        }
        var gstBtn = e.target.closest(".mb-check__gst-btn");
        if (gstBtn) {
          if (!ctx.getMaintenanceMode()) return;
          var gid = gstBtn.getAttribute("data-mb-check-id");
          if (!gid) return;
          var gstItemEl =
            gstBtn.closest(".order-feedback__item") ||
            gstBtn.closest("li");
          var gstTa = gstItemEl
            ? gstItemEl.querySelector(".mb-check__memo-input")
            : null;
          var gstMemo = gstTa ? gstTa.value : "";
          markMbCheckGst(gid, gstMemo);
          return;
        }
        var cancelBtn = e.target.closest(".mb-check__cancel-btn");
        if (cancelBtn) {
          if (!ctx.getFrontMode()) return;
          var cid = cancelBtn.getAttribute("data-mb-check-id");
          if (cid) ctx.openCancelConfirmModal(cid);
        }
      });
    }
  }

  global.HKMbWorkflow = {
    init: function (config) {
      ctx = config;
      syncMbInvFromServer();
      syncMbCheckFromServer();
      setupEventHandlers();
    },
    loadMbInv: syncMbInvFromServer,
    loadMbCheck: syncMbCheckFromServer,
    renderMbInvPanels: renderMbInvPanels,
    renderMbCheckPanels: renderMbCheckPanels,
    findMbInvEntry: findMbInvEntry,
    findMbCheckEntry: findMbCheckEntry,
    cancelMbInvEntry: cancelMbInvEntry,
    cancelMbCheckEntry: cancelMbCheckEntry,
    getEntries: function () {
      return mbInvLogEntries.slice();
    },
    isMbInvEntryId: function (id) {
      return id != null && String(id).indexOf("mbinv-") === 0;
    },
    isMbCheckEntryId: function (id) {
      return id != null && String(id).indexOf("mbchk-") === 0;
    },
  };
})(typeof window !== "undefined" ? window : this);
