/**
 * HK 알림 확인(깜빡임 해제) — 근무자별 localStorage 유지
 * 관리자 ↔ 정비관리 ↔ 루밍 이동 후에도 동일 사용자는 재깜빡임 없음
 */
(function (global) {
  var LS_KEY = "lotte-hk-alert-ack-v2";
  var OP_KEY = "lotte-hk-operator-name-session-v1";

  function defaultOpStore() {
    return {
      requestKeys: {},
      requestModify: {},
      orderIds: {},
      orderIssueIds: {},
      mbInvKeys: {},
      mbInvIssueIds: {},
      mbCheckKeys: {},
      mbCheckAcceptedIds: {},
      mbCheckGstIds: {},
      frontChatIds: {},
      zoneRoomDismiss: {},
    };
  }

  function operatorKey() {
    try {
      var n = String(global.sessionStorage.getItem(OP_KEY) || "").trim().toLowerCase();
      return n || "_";
    } catch (e) {
      return "_";
    }
  }

  function loadAll() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(all) {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(all || {}));
    } catch (e) {}
  }

  function opStore() {
    var all = loadAll();
    var k = operatorKey();
    if (!all[k] || typeof all[k] !== "object") all[k] = defaultOpStore();
    var s = all[k];
    if (!s.requestKeys) s.requestKeys = {};
    if (!s.requestModify) s.requestModify = {};
    if (!s.orderIds) s.orderIds = {};
    if (!s.orderIssueIds) s.orderIssueIds = {};
    if (!s.mbInvKeys) s.mbInvKeys = {};
    if (!s.mbInvIssueIds) s.mbInvIssueIds = {};
    if (!s.mbCheckKeys) s.mbCheckKeys = {};
    if (!s.mbCheckAcceptedIds) s.mbCheckAcceptedIds = {};
    if (!s.mbCheckGstIds) s.mbCheckGstIds = {};
    if (!s.frontChatIds) s.frontChatIds = {};
    if (!s.zoneRoomDismiss) s.zoneRoomDismiss = {};
    return { all: all, key: k, store: s };
  }

  function writeOp(mutator) {
    var ctx = opStore();
    mutator(ctx.store);
    ctx.all[ctx.key] = ctx.store;
    saveAll(ctx.all);
  }

  function readOp() {
    return opStore().store;
  }

  function markMapKey(mapName, key) {
    if (!key) return;
    writeOp(function (s) {
      s[mapName][key] = true;
    });
  }

  function hasMapKey(mapName, key) {
    if (!key) return false;
    return !!readOp()[mapName][key];
  }

  function markMapVal(mapName, key, val) {
    if (!key || val == null) return;
    writeOp(function (s) {
      s[mapName][key] = val;
    });
  }

  function getMapVal(mapName, key) {
    if (!key) return undefined;
    var v = readOp()[mapName][key];
    return Object.prototype.hasOwnProperty.call(readOp()[mapName], key) ? v : undefined;
  }

  global.HKAlertAck = {
    getOperatorKey: operatorKey,
    markRequestKey: function (key) {
      markMapKey("requestKeys", key);
    },
    hasRequestKey: function (key) {
      return hasMapKey("requestKeys", key);
    },
    markRequestModify: function (entryId, sig) {
      markMapVal("requestModify", entryId, sig);
    },
    getRequestModifySig: function (entryId) {
      return getMapVal("requestModify", entryId);
    },
    hasRequestModify: function (entryId) {
      return getMapVal("requestModify", entryId) !== undefined;
    },
    markOrderId: function (id) {
      markMapKey("orderIds", id);
    },
    hasOrderId: function (id) {
      return hasMapKey("orderIds", id);
    },
    markOrderIssueId: function (id) {
      markMapKey("orderIssueIds", id);
    },
    hasOrderIssueId: function (id) {
      return hasMapKey("orderIssueIds", id);
    },
    markMbInvKey: function (key) {
      markMapKey("mbInvKeys", key);
    },
    hasMbInvKey: function (key) {
      return hasMapKey("mbInvKeys", key);
    },
    markMbInvIssueId: function (id) {
      markMapKey("mbInvIssueIds", id);
    },
    hasMbInvIssueId: function (id) {
      return hasMapKey("mbInvIssueIds", id);
    },
    markMbCheckKey: function (key) {
      markMapKey("mbCheckKeys", key);
    },
    hasMbCheckKey: function (key) {
      return hasMapKey("mbCheckKeys", key);
    },
    markMbCheckAcceptedId: function (id) {
      markMapKey("mbCheckAcceptedIds", id);
    },
    hasMbCheckAcceptedId: function (id) {
      return hasMapKey("mbCheckAcceptedIds", id);
    },
    markMbCheckGstId: function (id) {
      markMapKey("mbCheckGstIds", id);
    },
    hasMbCheckGstId: function (id) {
      return hasMapKey("mbCheckGstIds", id);
    },
    markFrontChatId: function (id) {
      markMapKey("frontChatIds", id);
    },
    hasFrontChatId: function (id) {
      return hasMapKey("frontChatIds", id);
    },
    markZoneRoomDismiss: function (roomKey, changeId) {
      markMapVal("zoneRoomDismiss", roomKey, changeId);
    },
    getZoneRoomDismissId: function (roomKey) {
      return getMapVal("zoneRoomDismiss", roomKey);
    },
    mergeInto: function (target) {
      var s = readOp();
      target = target || {};
      if (!target.knownRequestAlertKeys) target.knownRequestAlertKeys = {};
      if (!target.knownOrderAlertIds) target.knownOrderAlertIds = {};
      if (!target.knownOrderIssueIds) target.knownOrderIssueIds = {};
      if (!target.knownMbInvAlertKeys) target.knownMbInvAlertKeys = {};
      if (!target.knownMbInvIssueIds) target.knownMbInvIssueIds = {};
      if (!target.knownMbCheckAlertKeys) target.knownMbCheckAlertKeys = {};
      if (!target.knownMbCheckAcceptedIds) target.knownMbCheckAcceptedIds = {};
      if (!target.knownMbCheckGstIds) target.knownMbCheckGstIds = {};
      if (!target.knownFrontChatIds) target.knownFrontChatIds = {};
      Object.keys(s.requestKeys).forEach(function (k) {
        target.knownRequestAlertKeys[k] = true;
      });
      Object.keys(s.orderIds).forEach(function (k) {
        target.knownOrderAlertIds[k] = true;
      });
      Object.keys(s.orderIssueIds).forEach(function (k) {
        target.knownOrderIssueIds[k] = true;
      });
      Object.keys(s.mbInvKeys).forEach(function (k) {
        target.knownMbInvAlertKeys[k] = true;
      });
      Object.keys(s.mbInvIssueIds).forEach(function (k) {
        target.knownMbInvIssueIds[k] = true;
      });
      Object.keys(s.mbCheckKeys).forEach(function (k) {
        target.knownMbCheckAlertKeys[k] = true;
      });
      Object.keys(s.mbCheckAcceptedIds).forEach(function (k) {
        target.knownMbCheckAcceptedIds[k] = true;
      });
      Object.keys(s.mbCheckGstIds).forEach(function (k) {
        target.knownMbCheckGstIds[k] = true;
      });
      Object.keys(s.frontChatIds).forEach(function (k) {
        target.knownFrontChatIds[k] = true;
      });
      return target;
    },
  };
})(typeof window !== "undefined" ? window : this);
