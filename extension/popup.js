// Popup：匯入課號、設定時間、排程/取消/測試，並顯示狀態與 log

const $ = (id) => document.getElementById(id);

function parseCodes(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

function toLocalInputValue(ts) {
  // 把時間戳轉成 datetime-local 需要的 'YYYY-MM-DDTHH:mm:ss'（本地時區）
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 19);
}

async function loadState() {
  const { config } = await chrome.storage.local.get('config');
  if (!config) return;
  if (config.codes?.length) $('codes').value = config.codes.join('\n');
  if (config.fireAtMs) $('fireAt').value = toLocalInputValue(config.fireAtMs);
  if (config.retryIntervalMs) $('retrySec').value = config.retryIntervalMs / 1000;
  if (config.maxRetries) $('maxRetries').value = config.maxRetries;
  renderStatus(config);
}

function renderStatus(config) {
  const s = $('status');
  if (!config || !config.fireAtMs) {
    s.textContent = '尚未排程';
    return;
  }
  const codes = config.codes || [];
  const batches = Math.ceil(codes.length / 5);
  const when = new Date(config.fireAtMs).toLocaleString('zh-TW');
  const left = Math.round((config.fireAtMs - Date.now()) / 1000);
  const state =
    config.status === 'done'
      ? '（已執行完畢）'
      : left > 0
        ? `（倒數 ${left} 秒）`
        : '（時間已到/進行中）';
  s.textContent = `已排程：${when} ${state}\n課號 ${codes.length} 門，分 ${batches} 批（每批 5 門）`;
  if (config.log?.length) {
    $('log').textContent = config.log.slice(-20).join('\n');
  }
}

$('save').onclick = async () => {
  const codes = parseCodes($('codes').value);
  const fireVal = $('fireAt').value;
  if (!codes.length) return alert('請先貼上課號');
  if (!fireVal) return alert('請設定送出時間');
  const fireAtMs = new Date(fireVal).getTime();
  if (fireAtMs < Date.now()) return alert('送出時間不能是過去');
  const config = {
    codes,
    fireAtMs,
    retryIntervalMs: Math.max(500, Number($('retrySec').value) * 1000),
    maxRetries: Math.min(30, Math.max(1, Number($('maxRetries').value))),
    status: 'scheduled',
    log: [],
  };
  await chrome.runtime.sendMessage({ type: 'schedule', config });
  renderStatus(config);
};

$('cancel').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'cancel' });
  $('status').textContent = '已取消排程';
  $('log').textContent = '';
};

$('testNow').onclick = async () => {
  const codes = parseCodes($('codes').value);
  if (!codes.length) return alert('請先貼上課號');
  if (!confirm('立即送出一次（測試）？會真的對選課系統送出。')) return;
  $('status').textContent = '測試送出中…';
  const res = await chrome.runtime.sendMessage({
    type: 'testNow',
    codes,
    retryIntervalMs: Math.max(500, Number($('retrySec').value) * 1000),
    maxRetries: Math.min(30, Math.max(1, Number($('maxRetries').value))),
  });
  $('status').textContent = '測試完成，見下方結果';
  $('log').textContent = JSON.stringify(res, null, 2);
};

// 即時更新（背景送 log 時刷新）
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'state') renderStatus(m.config);
});

loadState();
setInterval(loadState, 1000);
