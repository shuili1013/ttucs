// 背景 service worker：排程、伺服器校時、時間到注入頁面送出

const FAST_URL = 'https://cousel.ttu.edu.tw/main/FastSelect.php';
const PREP_LEAD_MS = 60000; // 提前 60 秒開分頁 + 注入，之後在頁面內精準等待

// ---------- 這個函式會被「注入到 cousel 分頁」中執行 ----------
// 必須自給自足（不能引用外部變數）。回傳結果並用 sendMessage 回報。
async function runFastSelect(codes, opts) {
  const { fireAtMs, serverOffsetMs, retryIntervalMs, maxRetries } = opts;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowSrv = () => Date.now() + (serverOffsetMs || 0);
  const report = (msg) => {
    try {
      chrome.runtime.sendMessage({ type: 'log', msg });
    } catch (e) {
      /* SW 可能休眠，忽略 */
    }
  };

  // 1) 精準等待到送出時刻（以伺服器時間為準）
  report(`等待送出時刻… 尚餘 ${Math.round((fireAtMs - nowSrv()) / 1000)} 秒`);
  while (nowSrv() < fireAtMs) {
    await sleep(Math.min(50, Math.max(0, fireAtMs - nowSrv())));
  }
  report('時間到，開始送出');

  // 2) 每 5 門一批
  const batches = [];
  for (let i = 0; i < codes.length; i += 5) batches.push(codes.slice(i, i + 5));

  const results = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let ok = false;
    let attempt = 0;
    let snippet = '';
    while (!ok && attempt < maxRetries) {
      attempt++;
      try {
        const resp = await fetch('https://cousel.ttu.edu.tw/main/FastSelect.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'EnterSbj=' + encodeURIComponent(batch.join('\n')),
        });
        const text = await resp.text();
        snippet = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 300);
        if (text.includes('並非您可以選課的期間')) {
          report(`第 ${b + 1} 批：尚未開放，第 ${attempt} 次重試…`);
          await sleep(retryIntervalMs);
          continue; // 只有「未開放」才重試，避免狂洗
        }
        ok = true; // 已開放並送出（成功或逐課結果），停止重試
        report(`第 ${b + 1} 批：已送出（嘗試 ${attempt} 次）`);
      } catch (e) {
        snippet = 'fetch error: ' + e;
        await sleep(retryIntervalMs);
      }
    }
    results.push({ batch, ok, attempt, snippet });
    await sleep(300); // 批間小間隔，禮貌一點
  }

  try {
    chrome.runtime.sendMessage({ type: 'result', results });
  } catch (e) {
    /* 忽略 */
  }
  return results;
}

// ---------- 伺服器校時 ----------
async function getServerOffsetMs() {
  try {
    const r = await fetch('https://cousel.ttu.edu.tw/', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const dateHdr = r.headers.get('Date');
    if (dateHdr) return new Date(dateHdr).getTime() - Date.now();
  } catch (e) {
    /* 取不到就用本地時間 */
  }
  return 0;
}

// ---------- 確保有一個 FastSelect 分頁 ----------
async function ensureFastTab() {
  const tabs = await chrome.tabs.query({ url: 'https://cousel.ttu.edu.tw/*' });
  let tab = tabs[0];
  if (!tab) {
    tab = await chrome.tabs.create({ url: FAST_URL, active: false });
  }
  // 等分頁載入完成
  await new Promise((resolve) => {
    const check = () =>
      chrome.tabs.get(tab.id, (t) => {
        if (chrome.runtime.lastError) return resolve();
        if (t.status === 'complete') resolve();
        else setTimeout(check, 200);
      });
    check();
  });
  return tab.id;
}

// ---------- 觸發送出（注入頁面）----------
async function fireSubmit(config) {
  const serverOffsetMs = await getServerOffsetMs();
  const tabId = await ensureFastTab();
  const opts = {
    fireAtMs: config.fireAtMs,
    serverOffsetMs,
    retryIntervalMs: config.retryIntervalMs,
    maxRetries: config.maxRetries,
  };
  await appendLog(`已開分頁、校時 offset=${serverOffsetMs}ms，注入送出程式`);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: runFastSelect,
      args: [config.codes, opts],
    });
  } catch (e) {
    await appendLog('注入失敗：' + e);
  }
}

// ---------- 狀態/log 儲存 ----------
async function appendLog(msg) {
  const { config } = await chrome.storage.local.get('config');
  if (!config) return;
  config.log = (config.log || []).concat(
    `${new Date().toLocaleTimeString('zh-TW')} ${msg}`,
  );
  await chrome.storage.local.set({ config });
  try {
    chrome.runtime.sendMessage({ type: 'state', config });
  } catch (e) {
    /* popup 沒開，忽略 */
  }
}

// ---------- 訊息處理 ----------
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  (async () => {
    if (m.type === 'getServerOffset') {
      sendResponse({ offsetMs: await getServerOffsetMs() });
    } else if (m.type === 'syncWebTheme') {
      const { uiPreferences: savedPreferences } =
        await chrome.storage.local.get('uiPreferences');
      const requestedRadius = Number(m.theme?.borderRadius);
      const uiPreferences = {
        isDarkMode: savedPreferences?.manualTheme
          ? Boolean(savedPreferences.isDarkMode)
          : Boolean(m.theme?.isDarkMode),
        borderRadius: Number.isFinite(requestedRadius)
          ? Math.min(16, Math.max(0, requestedRadius))
          : 4,
        manualTheme: Boolean(savedPreferences?.manualTheme),
      };
      await chrome.storage.local.set({ uiPreferences });
      void chrome.runtime
        .sendMessage({ type: 'theme', uiPreferences })
        .catch(() => {
          /* popup 沒開，忽略 */
        });
      sendResponse({ ok: true });
    } else if (m.type === 'importCoursesFromWeb') {
      const codes = [
        ...new Set(
          (Array.isArray(m.codes) ? m.codes : [])
            .filter((code) => typeof code === 'string')
            .map((code) => code.trim())
            .filter(Boolean),
        ),
      ].slice(0, 100);

      if (!codes.length) {
        sendResponse({ ok: false, error: '沒有可匯入的課號' });
        return;
      }

      const stored = await chrome.storage.local.get(['draft', 'config']);
      const previous = stored.draft || stored.config || {};
      await chrome.storage.local.set({
        draft: {
          codes,
          fireAtMs: previous.fireAtMs || null,
          retryIntervalMs: previous.retryIntervalMs || 1500,
          maxRetries: previous.maxRetries || 8,
        },
      });
      sendResponse({ ok: true, count: codes.length });
    } else if (m.type === 'schedule') {
      await chrome.storage.local.set({ config: m.config });
      await chrome.alarms.clearAll();
      const prepAt = Math.max(Date.now() + 100, m.config.fireAtMs - PREP_LEAD_MS);
      chrome.alarms.create('fire', { when: prepAt });
      await appendLog(
        `已排程：${new Date(m.config.fireAtMs).toLocaleString('zh-TW')}`,
      );
      sendResponse({ ok: true });
    } else if (m.type === 'cancel') {
      await chrome.alarms.clearAll();
      await chrome.storage.local.remove('config');
      sendResponse({ ok: true });
    } else if (m.type === 'log') {
      await appendLog(m.msg);
    } else if (m.type === 'result') {
      await appendLog('結果：' + JSON.stringify(m.results));
      const { config } = await chrome.storage.local.get('config');
      if (config) {
        config.status = 'done';
        await chrome.storage.local.set({ config });
      }
    } else if (m.type === 'testNow') {
      // 立即送出一次（fireAt = 現在）
      const serverOffsetMs = await getServerOffsetMs();
      const tabId = await ensureFastTab();
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: runFastSelect,
        args: [
          m.codes,
          {
            fireAtMs: Date.now(),
            serverOffsetMs,
            retryIntervalMs: m.retryIntervalMs,
            maxRetries: m.maxRetries,
          },
        ],
      });
      sendResponse(res?.[0]?.result ?? { error: 'no result' });
    }
  })();
  return true; // 非同步回應
});

// ---------- 排程觸發 ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'fire') return;
  const { config } = await chrome.storage.local.get('config');
  if (!config || !config.fireAtMs) return;
  await appendLog('鬧鐘觸發，準備送出');
  await fireSubmit(config);
});
