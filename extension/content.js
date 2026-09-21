// 在大同選課助手網頁與擴充功能背景程序之間安全轉送課號與介面設定。
let lastThemeSignature = '';

function syncWebTheme() {
  const isDarkMode =
    localStorage.getItem('NSYSUCourseSelector.isDarkMode') === 'true';
  const storedRadius = Number.parseInt(
    localStorage.getItem('NSYSUCourseSelector.borderRadius') || '4',
    10,
  );
  const borderRadius = Number.isFinite(storedRadius)
    ? Math.min(16, Math.max(0, storedRadius))
    : 4;
  const signature = `${isDarkMode}:${borderRadius}`;
  if (signature === lastThemeSignature) return;

  lastThemeSignature = signature;
  void chrome.runtime
    .sendMessage({
      type: 'syncWebTheme',
      theme: { isDarkMode, borderRadius },
    })
    .catch(() => {
      /* 擴充功能重新載入期間可能暫時失去連線 */
    });
}

syncWebTheme();
setInterval(syncWebTheme, 1500);

window.addEventListener('message', async (event) => {
  const data = event.data;
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    data?.source !== 'ttu-course-selector' ||
    data?.type !== 'TTU_IMPORT_COURSES' ||
    typeof data.requestId !== 'string' ||
    !Array.isArray(data.codes)
  ) {
    return;
  }

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'importCoursesFromWeb',
      codes: data.codes,
    });
    window.postMessage(
      {
        source: 'ttu-course-extension',
        type: 'TTU_COURSES_IMPORTED',
        requestId: data.requestId,
        ok: Boolean(result?.ok),
        count: result?.count || 0,
        error: result?.error,
      },
      event.origin,
    );
  } catch (error) {
    window.postMessage(
      {
        source: 'ttu-course-extension',
        type: 'TTU_COURSES_IMPORTED',
        requestId: data.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      event.origin,
    );
  }
});
