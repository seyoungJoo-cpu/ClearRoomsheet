/**
 * HK admin — 루밍(index) 경유 없이 직접 URL 접속 시 메인으로 이동
 * front.html(정비 확인)은 북마크·모바일 복귀를 위해 항상 허용
 * (?entry=1 · ?from=push · localStorage · HK 내부 이동 허용)
 */
(function (global) {
  var ENTRY_KEY = "makeroom-hk-entry";

  function readEntryFlag() {
    try {
      if (global.localStorage.getItem(ENTRY_KEY) === "1") return true;
      if (global.sessionStorage.getItem(ENTRY_KEY) === "1") {
        global.localStorage.setItem(ENTRY_KEY, "1");
        return true;
      }
    } catch (e) {}
    return false;
  }

  function allowEntry() {
    try {
      global.localStorage.setItem(ENTRY_KEY, "1");
      global.sessionStorage.setItem(ENTRY_KEY, "1");
    } catch (e) {}
  }

  function isHkAppPath(path) {
    return /\/hk\/(front|admin)\.html$/i.test(path || "");
  }

  function isHkFrontPath(path) {
    return /\/hk\/front\.html$/i.test(path || "");
  }

  function isRoomingHomePath(path) {
    var p = path || "";
    return p === "/" || /\/index\.html$/i.test(p);
  }

  function hasEntryBypass() {
    var search = global.location.search || "";
    if (/\b(from=push|entry=1)\b/.test(search)) return true;
    if (readEntryFlag()) return true;
    var ref = global.document.referrer || "";
    if (isHkAppPath(global.location.pathname) && isHkAppPath(ref)) return true;
    if (isHkAppPath(global.location.pathname) && isRoomingHomePath(ref)) return true;
    return false;
  }

  function stripEntryQuery() {
    if (!/\bentry=1\b/.test(global.location.search || "")) return;
    try {
      global.history.replaceState(
        null,
        "",
        global.location.pathname + (global.location.hash || "")
      );
    } catch (e) {}
  }

  function guardEntry() {
    if (isHkFrontPath(global.location.pathname)) {
      allowEntry();
      stripEntryQuery();
      return;
    }

    if (/\b(from=push|entry=1)\b/.test(global.location.search || "")) {
      allowEntry();
      stripEntryQuery();
      return;
    }
    if (hasEntryBypass()) {
      allowEntry();
      return;
    }
    global.location.replace("/");
  }

  global.HKEntryGuard = {
    KEY: ENTRY_KEY,
    allow: allowEntry,
    guard: guardEntry,
  };

  guardEntry();
})(typeof window !== "undefined" ? window : this);
