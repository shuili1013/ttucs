# 部署到 Cloudflare Pages

前端是純靜態 SPA（資料已在 `app/public/data/`），用 Cloudflare Pages 連 GitHub 自動部署即可，**不需後端**。

## 一、在 Cloudflare 建立 Pages 專案

1. 登入 <https://dash.cloudflare.com> → 左側 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 授權並選擇 repo：**`shuili1013/ttucs`**。
3. **Set up builds and deployments** 填入以下設定：

   | 欄位 | 值 |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `Vite`（或 `None`）|
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | **Root directory (Advanced)** | **`app`** ← 很重要，專案在子目錄 |

   > Node 版本已由 `app/.node-version`(20) 指定；若需手動設定，加環境變數 `NODE_VERSION = 20`。

4. 按 **Save and Deploy**。第一次 build 約 1–2 分鐘，完成後會給你一個網址：
   `https://ttucs.pages.dev`（或類似）。

## 二、之後更新

- **改程式碼**：`git push` → Cloudflare 自動重新部署。
- **更新課程資料**：
  ```bash
  cd data-pipeline && python scrape.py
  python ../tools/sync_to_app.py     # 寫進 app/public/data
  cd .. && git add -A && git commit -m "更新課程資料" && git push
  ```
  推上去後自動重新部署。

## 三、（可選）自訂網域

Pages 專案 → **Custom domains** → 加你的網域，依指示設定 CNAME 即可。

## 備註

- `app/public/_redirects` 設了 SPA fallback（`/* → /index.html 200`），避免直接開子路徑 404。
- `base` 預設 `/`（適用 `*.pages.dev` 與自訂網域根目錄）。若要部署在子路徑，build 時設環境變數 `VITE_BASE=/子路徑/`。
- 資料來源預設讀本專案內的 `public/data`。若想改讀外部 JSON 站台，設環境變數 `VITE_API_BASE` 指向該網址。
