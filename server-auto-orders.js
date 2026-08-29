"use strict";

const ROBOT_NAME = "도우미 로봇";
const MSG_RPA_CHECK = "정비 RPA 멈춤";
const MSG_RPA_RUN = "프론트 근무자분들 정비 RPA 실행해주세요";
const MSG_INS_AFTER_17 =
  "17시 이후 INS 오더로 오더해주세요";
const STALE_XML_MINUTES = 10;
/** 도우미 로봇 휴무: 19:00 ~ 06:40 (KST) — 이 구간은 오더를 내지 않음 */
const QUIET_START_MIN = 19 * 60;
const QUIET_END_MIN = 6 * 60 + 40;

function getKstParts(date) {
  const d = date || new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = {};
  fmt.formatToParts(d).forEach(function (p) {
    parts[p.type] = p.value;
  });
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  return {
    dateKey: parts.year + "-" + parts.month + "-" + parts.day,
    hour: hour,
    minute: minute,
    minutesOfDay: hour * 60 + minute,
  };
}

/** 19:00 이상 또는 06:40 미만이면 휴무 */
function isRobotQuietWindow(kst) {
  var m = kst.minutesOfDay;
  return m >= QUIET_START_MIN || m < QUIET_END_MIN;
}

function minutesSinceIso(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

function getRoomingUploadIso(payload) {
  if (!payload) return null;
  // updatedAt 은 다른 동기화로도 갱신되므로 업로드 판정에 쓰지 않음
  if (payload.roomingUploadedAt) return String(payload.roomingUploadedAt);
  return null;
}

function createRobotOrder(kind, memo, extras) {
  extras = extras || {};
  return {
    id: "ord-auto-" + Date.now() + "-" + Math.floor(Math.random() * 1e9),
    room: "",
    memo: memo,
    memoImage: "",
    foStatus: "",
    phase: "alert",
    urgent: false,
    fromMaint: !!extras.fromMaint,
    autoRobot: true,
    acceptAny: true,
    autoOrderKind: kind,
    category: "",
    sourceReqId: "",
    at: new Date().toISOString(),
    by: ROBOT_NAME,
  };
}

function startAutoOrderScheduler(ctx) {
  const sharedState = ctx.sharedState;
  const saveSharedStateToDisk = ctx.saveSharedStateToDisk;
  const getOrderPhase = ctx.getOrderPhase;
  const findNewOrderAlerts = ctx.findNewOrderAlerts;
  const sendOrderPushNotifications = ctx.sendOrderPushNotifications;

  function getOrderLog() {
    return sharedState.payload && Array.isArray(sharedState.payload.hkOrderLog)
      ? sharedState.payload.hkOrderLog
      : [];
  }

  function getAutoOrderState() {
    if (!sharedState.payload) sharedState.payload = {};
    if (!sharedState.payload.hkAutoOrderState) {
      sharedState.payload.hkAutoOrderState = {};
    }
    return sharedState.payload.hkAutoOrderState;
  }

  function hasOpenAutoOrder(kind) {
    return getOrderLog().some(function (entry) {
      if (!entry || entry.autoOrderKind !== kind) return false;
      return getOrderPhase(entry) === "alert";
    });
  }

  function appendAutoOrder(kind, memo) {
    if (!sharedState.payload) sharedState.payload = {};
    if (hasOpenAutoOrder(kind)) return false;

    const prevLog = getOrderLog().slice();
    const entry = createRobotOrder(kind, memo);
    let nextLog = [entry].concat(prevLog);
    // RPA 멈춤: 정비→프론트 오더 채널에도 동일 내용 복제
    if (kind === "rpa_check") {
      const maintDup = createRobotOrder("rpa_check_maint", memo, { fromMaint: true });
      nextLog = [maintDup].concat(nextLog);
    }
    sharedState.payload.hkOrderLog = nextLog;
    sharedState.version += 1;
    sharedState.updatedAt = new Date().toISOString();
    saveSharedStateToDisk();

    const newAlerts = findNewOrderAlerts(prevLog, nextLog);
    if (newAlerts.length) {
      Promise.resolve(sendOrderPushNotifications(newAlerts)).catch(function (err) {
        console.warn(
          "Auto order push failed:",
          err && err.message ? err.message : err
        );
      });
    }
    console.log("Auto order: " + kind + " — " + memo);
    return true;
  }

  function tick() {
    try {
      const kst = getKstParts(new Date());
      // 19:00~06:40 KST 휴무 — 예약·감시 오더 전부 중단
      if (isRobotQuietWindow(kst)) return;

      const st = getAutoOrderState();

      // 휴무 종료 시각(06:40) 이후 RPA 실행 안내 — 분 단위 누락 없이 하루 1회
      if (kst.minutesOfDay >= QUIET_END_MIN && st.rpaRunDate !== kst.dateKey) {
        if (appendAutoOrder("rpa_run", MSG_RPA_RUN)) {
          st.rpaRunDate = kst.dateKey;
        }
      }

      if (kst.minutesOfDay >= 17 * 60 + 1 && st.insAfter17Date !== kst.dateKey) {
        if (appendAutoOrder("ins_after_17", MSG_INS_AFTER_17)) {
          st.insAfter17Date = kst.dateKey;
        }
      }

      const payload = sharedState.payload || {};
      const hasRoomingData =
        (Array.isArray(payload.vacRows) && payload.vacRows.length > 0) ||
        !!payload.roomingUploadedAt;
      if (hasRoomingData) {
        const uploadIso = getRoomingUploadIso(payload);
        // 업로드 시각이 없으면 stale 판정하지 않음 (Infinity → 오발송 방지)
        if (uploadIso) {
          const staleMin = minutesSinceIso(uploadIso);
          const ackAt = st.rpaAckAt ? String(st.rpaAckAt) : "";
          // 사람이 확인한 뒤에만 막음. 업로드 시각과 같으면(구버전 자가ACK) 감시 재개.
          const ackedThisUpload = !!(ackAt && String(uploadIso) < ackAt);
          if (
            staleMin >= STALE_XML_MINUTES &&
            !ackedThisUpload &&
            !hasOpenAutoOrder("rpa_check") &&
            !hasOpenAutoOrder("rpa_check_maint")
          ) {
            appendAutoOrder("rpa_check", MSG_RPA_CHECK);
          }
        }
      }
    } catch (e) {
      console.warn("Auto order scheduler tick failed:", e && e.message ? e.message : e);
    }
  }

  setInterval(tick, 60 * 1000);
  setTimeout(tick, 8000);
  console.log("Auto order scheduler started (KST, quiet 19:00–06:40)");
}

module.exports = {
  startAutoOrderScheduler: startAutoOrderScheduler,
  ROBOT_NAME: ROBOT_NAME,
};
