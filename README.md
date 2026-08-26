# 大同選課助手（TTU Course Selector）

大同大學（Tatung University）非官方**排課規劃工具**：查課、排課表、篩選、標籤、修課資格提醒，並可把課號匯出貼進大同「快速選課」。

> ⚠️ 非官方學生自製工具，僅供排課規劃參考。實際選課請以大同官方選課系統
> （[cousel.ttu.edu.tw](https://cousel.ttu.edu.tw)）為準。

---

## 🙏 Fork 來源與致謝（Attribution）

本專案 **fork / 改作自** 中山大學開源社群的選課輔助系統：

- 原前端專案：**NSYSU Course Selector V6** — <https://github.com/nsysu-opendev/NSYSUCourseSelectorV6>
- 原資料 API 專案：**NSYSUCourseAPI** — <https://github.com/nsysu-opendev/NSYSUCourseAPI>
- 原授權：**MIT License** © 2025 NSYSU Open Development Community（見 [LICENSE](LICENSE)）

在原專案基礎上，本專案主要改動：
- 前端改品牌為大同（深藍 `#002060` 主題、校名、i18n）
- **資料來源改為大同選課系統 `cousel.ttu.edu.tw`**，另寫 Python 爬蟲（`data-pipeline/`）
- 匯出改為大同「快速選課」格式（每 5 個一批各自複製）
- 新增修課資格提醒、課程詳細站內視窗、多系所歸屬、備註格式化等

感謝原作者們的開源貢獻 🙏

---

## 架構

```
一次性/定期手動爬取(帶你的登入 cookie)
   data-pipeline/scrape.py  ──►  靜態 JSON  ──►  app/(React 前端)
```

- 前端不連學校伺服器、不存帳密，只讀靜態 JSON（可部署於 Cloudflare Pages / GitHub Pages）。
- 選課人數為避免過期已不顯示，故資料為靜態，選課前手動更新一次即可。

## 目錄

| 路徑 | 說明 |
|---|---|
| `app/` | React 前端（React18 + TS + Redux Toolkit + AntD5 + Vite）|
| `app/public/data/` | 爬蟲產出的課程 JSON（前端讀取；已隨版控，方便直接部署）|
| `data-pipeline/` | Python 爬蟲。`scrape.py`、`.env.example`、`samples/` |
| `tools/` | 取得登入 cookie 教學、同步腳本 |

## 快速開始

```bash
cd app
npm install
npm run dev        # 開發預覽 http://localhost:5173
```

## 更新課程資料

1. 依 [tools/取得登入cookie.md](tools/取得登入cookie.md) 取得 cookie，填入 `data-pipeline/.env`
   （複製自 `.env.example`；`.env` 已被 `.gitignore` 擋掉，勿上傳）。
2. 執行：
   ```bash
   cd data-pipeline
   pip install -r requirements.txt
   python scrape.py                 # 完整：課程/時間/教室/多系歸屬
   python ../tools/sync_to_app.py   # 複製到 app/public/data
   ```
   其他模式：`--fixtime`（只補時段）、`--fixdepts`（只補多系歸屬）、`--details`（只重抓詳細頁）。

## 部署（Cloudflare Pages）

- Build 指令：`npm run build`（在 `app/`）；輸出目錄：`app/dist`
- 資料已在 `app/public/data/`，會一起打包，無需後端。
- 如需把資料放外部來源，設定環境變數 `VITE_API_BASE` 指向該 JSON 站台即可。

## 授權

MIT License（沿用原專案）— 見 [LICENSE](LICENSE)。
