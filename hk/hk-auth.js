/**
 * 정비관리(HK) 모드별 비밀번호
 * - admin: 관리자 페이지
 * - maint: 정비관리 모드
 * - front: 프론트 모드
 */
(function (global) {
  var PASSWORDS = {
    admin: "1000",
    maint: "74371",
    front: "743210",
    inquiry: "11046239",
  };

  var SESSION_PREFIX = "lotte-hk-auth-";

  var LABELS = {
    admin: "관리자",
    maint: "정비 입력",
    front: "프론트",
    inquiry: "관리자 문의",
  };

  function isAuthed(role) {
    try {
      return global.sessionStorage.getItem(SESSION_PREFIX + role) === "1";
    } catch (e) {
      return false;
    }
  }

  function setAuthed(role) {
    try {
      global.sessionStorage.setItem(SESSION_PREFIX + role, "1");
    } catch (e) {}
  }

  function verify(role, input) {
    return String(input || "") === PASSWORDS[role];
  }

  function getLabel(role) {
    return LABELS[role] || role;
  }

  global.HKAuth = {
    PASSWORDS: PASSWORDS,
    isAuthed: isAuthed,
    setAuthed: setAuthed,
    verify: verify,
    getLabel: getLabel,
  };
})(typeof window !== "undefined" ? window : this);
