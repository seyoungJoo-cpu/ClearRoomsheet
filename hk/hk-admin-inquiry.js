/**
 * 관리자 문의 — 직원 건의·문의 및 관리자 답변 (서버 /api/sync 공유)
 */
(function (global) {
  var deps = {
    formatAt: function (iso) {
      return iso || "";
    },
    getOperatorName: function () {
      return "";
    },
    showOperatorGate: function () {},
    requireRoleAuth: function (_role, cb) {
      if (typeof cb === "function") cb();
    },
  };

  var modalOpen = false;
  /** 답변 작성 중 동기화로 리렌더될 때 초안 유지 */
  var replyDrafts = {};

  function getInquiries() {
    if (typeof global.HKSync === "undefined" || !global.HKSync.getAdminInquiries) {
      return [];
    }
    return global.HKSync.getAdminInquiries() || [];
  }

  function countOpenInquiries() {
    return getInquiries().filter(function (entry) {
      return entry && String(entry.status || "open") !== "answered";
    }).length;
  }

  function updateBadge() {
    var badge = document.getElementById("adminInquiryBadge");
    if (!badge) return;
    var openCount = countOpenInquiries();
    if (openCount > 0) {
      badge.textContent = openCount > 99 ? "99+" : String(openCount);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function captureDraftsFromDom() {
    var list = document.getElementById("adminInquiryList");
    if (!list) return;
    list.querySelectorAll(".admin-inquiry-card__reply-input").forEach(function (ta) {
      var card = ta.closest(".admin-inquiry-card");
      var id = card ? card.getAttribute("data-inq-id") : "";
      if (!id) return;
      var val = String(ta.value || "");
      if (val.trim()) replyDrafts[id] = val;
      else delete replyDrafts[id];
    });
    var compose = document.getElementById("adminInquiryNewText");
    if (compose) {
      var composeVal = String(compose.value || "");
      if (composeVal.trim()) replyDrafts.__compose__ = composeVal;
      else delete replyDrafts.__compose__;
    }
  }

  function closeModal() {
    captureDraftsFromDom();
    var modal = document.getElementById("adminInquiryModal");
    if (modal) modal.hidden = true;
    modalOpen = false;
    var compose = document.getElementById("adminInquiryNewText");
    if (compose && document.activeElement === compose) {
      try {
        compose.blur();
      } catch (e) {}
    }
    document.querySelectorAll(".admin-inquiry-card__reply-input").forEach(function (ta) {
      if (document.activeElement === ta) {
        try {
          ta.blur();
        } catch (e2) {}
      }
    });
  }

  function openModal() {
    var modal = document.getElementById("adminInquiryModal");
    if (!modal) return;
    modal.hidden = false;
    modalOpen = true;
    renderList();
    updateBadge();
    var inp = document.getElementById("adminInquiryNewText");
    if (inp) {
      requestAnimationFrame(function () {
        inp.focus();
      });
    }
  }

  function submitInquiry() {
    var ta = document.getElementById("adminInquiryNewText");
    var text = ta ? String(ta.value || "").trim() : "";
    if (!text) {
      if (ta) ta.focus();
      return;
    }
    var name = deps.getOperatorName();
    if (!name) {
      deps.showOperatorGate({
        mode: "initial",
        onSaved: function () {
          submitInquiry();
        },
      });
      return;
    }
    if (typeof global.HKSync === "undefined" || !global.HKSync.appendAdminInquiry) return;
    global.HKSync.appendAdminInquiry({
      id: "inq-" + Date.now() + "-" + Math.floor(Math.random() * 1e9),
      at: new Date().toISOString(),
      by: name,
      text: text,
      status: "open",
      reply: "",
      replyAt: "",
      replyBy: "",
    });
    if (ta) ta.value = "";
    delete replyDrafts.__compose__;
    if (typeof global.HKSync.flushPending === "function") {
      global.HKSync.flushPending();
    }
    renderList();
    updateBadge();
  }

  function submitReply(inquiryId, replyText) {
    var text = String(replyText || "").trim();
    if (!text || !inquiryId) return;
    deps.requireRoleAuth("inquiry", function () {
      if (typeof global.HKSync === "undefined" || !global.HKSync.updateAdminInquiry) return;
      global.HKSync.updateAdminInquiry(inquiryId, {
        status: "answered",
        reply: text,
        replyAt: new Date().toISOString(),
        replyBy: deps.getOperatorName() || "관리자",
      });
      delete replyDrafts[inquiryId];
      if (typeof global.HKSync.flushPending === "function") {
        global.HKSync.flushPending();
      }
      renderList();
      updateBadge();
    });
  }

  function deleteInquiry(inquiryId) {
    if (!inquiryId) return;
    deps.requireRoleAuth("inquiry", function () {
      if (typeof global.HKSync === "undefined" || !global.HKSync.deleteAdminInquiry) return;
      if (!global.HKSync.deleteAdminInquiry(inquiryId)) return;
      delete replyDrafts[inquiryId];
      if (typeof global.HKSync.flushPending === "function") {
        global.HKSync.flushPending();
      }
      renderList();
      updateBadge();
    });
  }

  function renderList() {
    var list = document.getElementById("adminInquiryList");
    var empty = document.getElementById("adminInquiryEmpty");
    if (!list) return;
    captureDraftsFromDom();
    var activeId = null;
    var activeSelStart = 0;
    var activeSelEnd = 0;
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains("admin-inquiry-card__reply-input")) {
      var activeCard = ae.closest(".admin-inquiry-card");
      activeId = activeCard ? activeCard.getAttribute("data-inq-id") : null;
      try {
        activeSelStart = ae.selectionStart || 0;
        activeSelEnd = ae.selectionEnd || 0;
      } catch (e) {}
    } else if (ae && ae.id === "adminInquiryNewText") {
      activeId = "__compose__";
      try {
        activeSelStart = ae.selectionStart || 0;
        activeSelEnd = ae.selectionEnd || 0;
      } catch (e) {}
    }

    list.innerHTML = "";
    var entries = getInquiries().slice();
    entries.sort(function (a, b) {
      var ta = new Date(a.at || 0).getTime();
      var tb = new Date(b.at || 0).getTime();
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      return tb - ta;
    });
    if (!entries.length) {
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;
    }
    entries.forEach(function (entry) {
      if (!entry) return;
      var li = document.createElement("li");
      li.className = "admin-inquiry-card";
      li.setAttribute("data-inq-id", entry.id || "");
      var answered = String(entry.status || "") === "answered" && String(entry.reply || "").trim();
      if (answered) li.classList.add("is-answered");
      else li.classList.add("is-open");

      var head = document.createElement("div");
      head.className = "admin-inquiry-card__head";
      var byEl = document.createElement("span");
      byEl.className = "admin-inquiry-card__by";
      byEl.textContent = entry.by != null ? String(entry.by).trim() || "—" : "—";
      var timeEl = document.createElement("span");
      timeEl.className = "admin-inquiry-card__time";
      timeEl.textContent = deps.formatAt(entry.at);
      var badge = document.createElement("span");
      badge.className =
        "admin-inquiry-card__status" + (answered ? " is-answered" : " is-open");
      badge.textContent = answered ? "답변완료" : "답변대기";
      head.appendChild(byEl);
      head.appendChild(timeEl);
      head.appendChild(badge);

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "admin-inquiry-card__delete";
      delBtn.textContent = "삭제";
      delBtn.title = "비밀번호 확인 후 삭제";
      delBtn.addEventListener("click", function () {
        if (!confirm("이 문의를 삭제할까요?")) return;
        deleteInquiry(entry.id);
      });
      head.appendChild(delBtn);
      li.appendChild(head);

      var body = document.createElement("div");
      body.className = "admin-inquiry-card__body";
      body.textContent = entry.text != null ? String(entry.text) : "";
      li.appendChild(body);

      if (answered) {
        var replyBox = document.createElement("div");
        replyBox.className = "admin-inquiry-card__reply";
        var replyMeta = document.createElement("div");
        replyMeta.className = "admin-inquiry-card__reply-meta";
        var replyBy = entry.replyBy != null ? String(entry.replyBy).trim() : "관리자";
        var replyAt = entry.replyAt ? deps.formatAt(entry.replyAt) : "";
        replyMeta.textContent =
          "관리자 답변" + (replyBy ? " · " + replyBy : "") + (replyAt ? " · " + replyAt : "");
        var replyText = document.createElement("div");
        replyText.className = "admin-inquiry-card__reply-text";
        replyText.textContent = String(entry.reply);
        replyBox.appendChild(replyMeta);
        replyBox.appendChild(replyText);
        li.appendChild(replyBox);
      } else {
        var replyForm = document.createElement("div");
        replyForm.className = "admin-inquiry-card__reply-form";
        var replyTa = document.createElement("textarea");
        replyTa.className = "admin-inquiry-card__reply-input";
        replyTa.rows = 2;
        replyTa.placeholder = "답변 입력";
        replyTa.setAttribute("aria-label", "관리자 답변");
        if (entry.id && replyDrafts[entry.id] != null) {
          replyTa.value = replyDrafts[entry.id];
        }
        replyTa.addEventListener("input", function () {
          if (!entry.id) return;
          var v = String(replyTa.value || "");
          if (v.trim()) replyDrafts[entry.id] = v;
          else delete replyDrafts[entry.id];
        });
        var replyBtn = document.createElement("button");
        replyBtn.type = "button";
        replyBtn.className = "admin-inquiry-card__reply-btn";
        replyBtn.textContent = "답변 등록";
        replyBtn.addEventListener("click", function () {
          submitReply(entry.id, replyTa.value);
        });
        replyForm.appendChild(replyTa);
        replyForm.appendChild(replyBtn);
        li.appendChild(replyForm);
      }

      list.appendChild(li);
    });

    var compose = document.getElementById("adminInquiryNewText");
    if (compose && replyDrafts.__compose__ != null && !String(compose.value || "").trim()) {
      compose.value = replyDrafts.__compose__;
    }

    if (activeId === "__compose__" && compose) {
      compose.focus();
      try {
        compose.setSelectionRange(activeSelStart, activeSelEnd);
      } catch (e) {}
    } else if (activeId) {
      var restoreTa = list.querySelector(
        '.admin-inquiry-card[data-inq-id="' +
          activeId.replace(/"/g, '\\"') +
          '"] .admin-inquiry-card__reply-input'
      );
      if (restoreTa) {
        restoreTa.focus();
        try {
          restoreTa.setSelectionRange(activeSelStart, activeSelEnd);
        } catch (e2) {}
      }
    }
  }

  function bindUi() {
    var btn = document.getElementById("btnAdminInquiry");
    if (btn) {
      btn.addEventListener("click", function () {
        openModal();
      });
    }
    var closeBtn = document.getElementById("adminInquiryClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", closeModal);
    }
    var backdrop = document.getElementById("adminInquiryBackdrop");
    if (backdrop) {
      backdrop.addEventListener("click", closeModal);
    }
    var submitBtn = document.getElementById("adminInquirySubmit");
    if (submitBtn) {
      submitBtn.addEventListener("click", submitInquiry);
    }
    var newTa = document.getElementById("adminInquiryNewText");
    if (newTa) {
      newTa.addEventListener("input", function () {
        var v = String(newTa.value || "");
        if (v.trim()) replyDrafts.__compose__ = v;
        else delete replyDrafts.__compose__;
      });
      newTa.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submitInquiry();
        }
      });
    }
    if (typeof global.HKSync !== "undefined" && global.HKSync.onChange) {
      global.HKSync.onChange(function (changed) {
        if (changed.indexOf("hkAdminInquiries") < 0) return;
        if (modalOpen) renderList();
        updateBadge();
      });
    }
    updateBadge();
  }

  global.HKAdminInquiry = {
    init: function (options) {
      options = options || {};
      if (options.formatAt) deps.formatAt = options.formatAt;
      if (options.getOperatorName) deps.getOperatorName = options.getOperatorName;
      if (options.showOperatorGate) deps.showOperatorGate = options.showOperatorGate;
      if (options.requireRoleAuth) deps.requireRoleAuth = options.requireRoleAuth;
      bindUi();
    },
    refresh: function () {
      if (modalOpen) renderList();
      updateBadge();
    },
    open: openModal,
  };
})(typeof window !== "undefined" ? window : this);
