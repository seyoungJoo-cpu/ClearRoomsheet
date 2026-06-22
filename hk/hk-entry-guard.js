/**
 * HK front/admin — 루밍(index) 경유 없이 직접 URL 접속 시 메인으로 이동
 * (?entry=1 · ?from=push · sessionStorage 허용)
 */
(function (global) {
  var ENTRY_KEY = "makeroom-hk-entry";

  function allowEntry() {
    try {
      global.sessionStorage.setItem(ENTRY_KEY, "1");
    } catch (e) {}
  }

  function hasEntryBypass() {
    var search = global.location.search || "";
    if (/\b(from=push|entry=1)\b/.test(search)) return true;
    try {
      return global.sessionStorage.getItem(ENTRY_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function guardEntry() {
    if (/\b(from=push|entry=1)\b/.test(global.location.search || "")) {
      allowEntry();
      if (/\bentry=1\b/.test(global.location.search || "")) {
        try {
          global.history.replaceState(
            null,
            "",
            global.location.pathname + (global.location.hash || "")
          );
        } catch (e) {}
      }
      return;
    }
    if (hasEntryBypass()) return;
    global.location.replace("/");
  }

  global.HKEntryGuard = {
    KEY: ENTRY_KEY,
    allow: allowEntry,
    guard: guardEntry,
  };

  guardEntry();
})(typeof window !== "undefined" ? window : this);
