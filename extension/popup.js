// Popup dashboard：主畫面只保留時間、狀態與開始操作，其餘功能收進面板。
const $ = (id) => document.getElementById(id);
const pad = (value) => String(value).padStart(2, "0");
const nowMs = () => Date.now() + serverOffsetMs;

let draft = { codes: [], fireAtMs: null, retryIntervalMs: 1500, maxRetries: 8 };
let activeConfig = null;
let serverOffsetMs = 0;
let pickerDate = null;
let calendarCursor = null;
let toastTimer = null;
let backdropTimer = null;

function parseCodes(text) {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => value && !value.startsWith("#")),
    ),
  ];
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days) return `${days}天 ${pad(hours)}:${pad(minutes)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function updateClock() {
  const now = new Date(nowMs());
  $("currentTime").textContent = [
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ]
    .map(pad)
    .join(":");
  $("currentDate").textContent = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
}

function updateSummaries() {
  $("courseSummary").textContent = draft.codes.length
    ? `${draft.codes.length} 門課・${Math.ceil(draft.codes.length / 5)} 批`
    : "尚未新增";
  $("timeSummary").textContent = draft.fireAtMs
    ? formatDateTime(draft.fireAtMs)
    : "尚未設定";
  $("retryValue").textContent = `${draft.retryIntervalMs / 1000} 秒`;
  $("retriesValue").textContent = `${draft.maxRetries} 次`;
}

function renderStatus(config = activeConfig) {
  const card = $("statusCard");
  const title = $("statusTitle");
  const detail = $("statusDetail");
  const countdown = $("countdown");
  const start = $("start");
  const cancel = $("cancel");
  const logs = config?.log || [];
  card.className = "status-card is-idle";
  countdown.textContent = "";
  start.classList.remove("is-cancel");
  start.querySelector("span").textContent = "開始搶課";
  cancel.disabled = true;

  if (config?.status === "done") {
    card.className = "status-card is-done";
    title.textContent = "本次搶課已完成";
    detail.textContent = `${config.codes?.length || 0} 門課・查看選單內的執行紀錄`;
    start.querySelector("span").textContent = "重新開始";
  } else if (config?.fireAtMs) {
    card.className = "status-card is-scheduled";
    title.textContent =
      config.fireAtMs > nowMs() ? "等待開始搶課" : "正在送出課程";
    detail.textContent = `${formatDateTime(config.fireAtMs)}・${config.codes?.length || 0} 門課`;
    countdown.textContent =
      config.fireAtMs > nowMs()
        ? formatDuration(config.fireAtMs - nowMs())
        : "執行中";
    start.classList.add("is-cancel");
    start.querySelector("span").textContent = "取消搶課";
    cancel.disabled = false;
  } else {
    title.textContent = "尚未設定搶課";
    detail.textContent = "新增課程並設定送出時間";
  }
  $("log").textContent = logs.length
    ? logs.slice(-30).join("\n")
    : "目前沒有執行紀錄";
  updateSummaries();
}

async function saveDraft() {
  await chrome.storage.local.set({ draft });
}

async function loadState() {
  const stored = await chrome.storage.local.get(["config", "draft"]);
  activeConfig = stored.config || null;
  const source = stored.draft || stored.config;
  if (source) {
    draft = {
      codes: source.codes || [],
      fireAtMs: source.fireAtMs || null,
      retryIntervalMs: source.retryIntervalMs || 1500,
      maxRetries: source.maxRetries || 8,
    };
  }
  $("codes").value = draft.codes.join("\n");
  updateCourseCount();
  renderStatus();
}

function openLayer(element) {
  clearTimeout(backdropTimer);
  closeLayers(false);
  $("backdrop").hidden = false;
  element.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => element.classList.add("is-open"));
}

function closeLayers(hideBackdrop = true) {
  document
    .querySelectorAll(".sheet.is-open, .menu-panel.is-open")
    .forEach((element) => {
      element.classList.remove("is-open");
      element.setAttribute("aria-hidden", "true");
    });
  if (hideBackdrop)
    backdropTimer = setTimeout(() => {
      $("backdrop").hidden = true;
    }, 180);
}

function updateCourseCount() {
  $("courseCount").textContent = `${parseCodes($("codes").value).length} 門課`;
}

function beginTimeEdit() {
  const initial =
    draft.fireAtMs && draft.fireAtMs > nowMs()
      ? new Date(draft.fireAtMs)
      : new Date(nowMs() + 5 * 60 * 1000);
  initial.setSeconds(draft.fireAtMs ? initial.getSeconds() : 0, 0);
  pickerDate = initial;
  calendarCursor = new Date(initial.getFullYear(), initial.getMonth(), 1);
  renderCalendar();
  renderPickerTime();
  openLayer($("timeSheet"));
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function renderCalendar() {
  $("calendarMonth").textContent =
    `${calendarCursor.getFullYear()} 年 ${calendarCursor.getMonth() + 1} 月`;
  const grid = $("calendarGrid");
  grid.replaceChildren();
  const start = new Date(
    calendarCursor.getFullYear(),
    calendarCursor.getMonth(),
    1 - calendarCursor.getDay(),
  );
  const today = new Date();
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + index,
    );
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.textContent = day.getDate();
    button.setAttribute("role", "gridcell");
    button.setAttribute(
      "aria-label",
      `${day.getFullYear()} 年 ${day.getMonth() + 1} 月 ${day.getDate()} 日`,
    );
    if (day.getMonth() !== calendarCursor.getMonth())
      button.classList.add("is-muted");
    if (sameDay(day, today)) button.classList.add("is-today");
    if (sameDay(day, pickerDate)) button.classList.add("is-selected");
    button.addEventListener("click", () => {
      pickerDate.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
      calendarCursor = new Date(day.getFullYear(), day.getMonth(), 1);
      renderCalendar();
    });
    grid.append(button);
  }
}

function renderPickerTime() {
  $("pickHour").textContent = pad(pickerDate.getHours());
  $("pickMinute").textContent = pad(pickerDate.getMinutes());
  $("pickSecond").textContent = pad(pickerDate.getSeconds());
}

async function cancelSchedule() {
  await chrome.runtime.sendMessage({ type: "cancel" });
  activeConfig = null;
  renderStatus();
  showToast("已取消目前排程");
}

async function schedule() {
  if (!draft.codes.length) {
    openLayer($("courseSheet"));
    showToast("請先新增至少一門課程");
    return;
  }
  if (!draft.fireAtMs) {
    beginTimeEdit();
    showToast("請先設定搶課時間");
    return;
  }
  if (draft.fireAtMs <= nowMs()) {
    beginTimeEdit();
    showToast("搶課時間必須晚於現在");
    return;
  }
  const config = { ...draft, status: "scheduled", log: [] };
  await chrome.runtime.sendMessage({ type: "schedule", config });
  activeConfig = config;
  renderStatus();
  showToast("排程完成，時間到會自動送出");
  setTimeout(loadState, 200);
}

$("openCourses").addEventListener("click", () => {
  $("codes").value = draft.codes.join("\n");
  updateCourseCount();
  openLayer($("courseSheet"));
  setTimeout(() => $("codes").focus(), 230);
});
$("openTime").addEventListener("click", beginTimeEdit);
$("openMenu").addEventListener("click", () => openLayer($("menuPanel")));
$("backdrop").addEventListener("click", () => closeLayers());
document
  .querySelectorAll(".close-sheet")
  .forEach((button) => button.addEventListener("click", () => closeLayers()));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLayers();
});

$("codes").addEventListener("input", updateCourseCount);
$("saveCourses").addEventListener("click", async () => {
  draft.codes = parseCodes($("codes").value);
  if (!draft.codes.length) {
    showToast("請輸入至少一個課號");
    return;
  }
  await saveDraft();
  updateSummaries();
  closeLayers();
  showToast(`已儲存 ${draft.codes.length} 門課`);
});

$("prevMonth").addEventListener("click", () => {
  calendarCursor = new Date(
    calendarCursor.getFullYear(),
    calendarCursor.getMonth() - 1,
    1,
  );
  renderCalendar();
});
$("nextMonth").addEventListener("click", () => {
  calendarCursor = new Date(
    calendarCursor.getFullYear(),
    calendarCursor.getMonth() + 1,
    1,
  );
  renderCalendar();
});
document.querySelectorAll(".time-adjust").forEach((button) => {
  button.addEventListener("click", () => {
    const amount = Number(button.dataset.delta);
    if (button.dataset.unit === "hour")
      pickerDate.setHours(pickerDate.getHours() + amount);
    if (button.dataset.unit === "minute")
      pickerDate.setMinutes(pickerDate.getMinutes() + amount);
    if (button.dataset.unit === "second")
      pickerDate.setSeconds(pickerDate.getSeconds() + amount);
    calendarCursor = new Date(
      pickerDate.getFullYear(),
      pickerDate.getMonth(),
      1,
    );
    renderCalendar();
    renderPickerTime();
  });
});
$("saveTime").addEventListener("click", async () => {
  if (pickerDate.getTime() <= nowMs()) {
    showToast("請選擇晚於現在的時間");
    return;
  }
  draft.fireAtMs = pickerDate.getTime();
  await saveDraft();
  updateSummaries();
  closeLayers();
  showToast("搶課時間已設定");
});

document.querySelectorAll(".step-control button").forEach((button) => {
  button.addEventListener("click", async () => {
    const delta = Number(button.dataset.delta);
    if (button.dataset.setting === "retry")
      draft.retryIntervalMs = Math.min(
        10000,
        Math.max(500, draft.retryIntervalMs + delta * 1000),
      );
    else draft.maxRetries = Math.min(30, Math.max(1, draft.maxRetries + delta));
    await saveDraft();
    if (activeConfig?.status === "scheduled") {
      activeConfig.retryIntervalMs = draft.retryIntervalMs;
      activeConfig.maxRetries = draft.maxRetries;
      await chrome.storage.local.set({ config: activeConfig });
    }
    updateSummaries();
  });
});

$("start").addEventListener("click", () => {
  if (activeConfig?.fireAtMs && activeConfig.status !== "done")
    cancelSchedule();
  else schedule();
});
$("cancel").addEventListener("click", cancelSchedule);

$("testNow").addEventListener("click", async () => {
  if (!draft.codes.length) {
    showToast("請先新增課程");
    return;
  }
  if (!confirm("這會立刻向選課系統送出目前課號，確定繼續？")) return;
  $("testNow").disabled = true;
  $("log").textContent = "測試送出中…";
  try {
    const result = await chrome.runtime.sendMessage({
      type: "testNow",
      codes: draft.codes,
      retryIntervalMs: draft.retryIntervalMs,
      maxRetries: draft.maxRetries,
    });
    $("log").textContent = JSON.stringify(result, null, 2);
    showToast("測試送出完成");
  } catch (error) {
    $("log").textContent = `測試失敗：${error.message}`;
  } finally {
    $("testNow").disabled = false;
  }
});

$("clearLog").addEventListener("click", async () => {
  if (activeConfig) {
    activeConfig.log = [];
    await chrome.storage.local.set({ config: activeConfig });
  }
  $("log").textContent = "目前沒有執行紀錄";
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "state") {
    activeConfig = message.config;
    renderStatus();
  }
});

async function init() {
  await loadState();
  updateClock();
  try {
    const result = await chrome.runtime.sendMessage({
      type: "getServerOffset",
    });
    if (Number.isFinite(result?.offsetMs)) {
      serverOffsetMs = result.offsetMs;
      $("timeSource").textContent = "校方時間";
      updateClock();
    }
  } catch (_) {
    $("timeSource").textContent = "本機時間";
  }
}

init();
setInterval(() => {
  updateClock();
  renderStatus();
}, 1000);
setInterval(loadState, 5000);
