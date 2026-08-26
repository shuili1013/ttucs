# 取得大同校務系統登入 Session Cookie（自己在瀏覽器操作，30 秒）

> 為什麼要這個：大同「登入後的選課系統」才有即時名額（剩餘/已選）。
> 爬蟲需要帶你自己的登入 session 才能抓到這些資料。**cookie 只留在你電腦，不要貼給任何人。**

## 方法 A：DevTools 一行指令（最簡單）
1. 用瀏覽器登入 https://cousel.ttu.edu.tw （選課系統，登入後進到課程清單頁 ListClassCourse.php），進到選課／課表頁面。
2. 按 F12 開 DevTools → Console 貼上：
   ```js
   copy(document.cookie); console.log(document.cookie);
   ```
3. cookie 字串已複製到剪貼簿，貼進 data-pipeline/.env 的 TTU_COOKIE=（見該檔）。

## 方法 B：Copy as cURL（最完整，強烈建議給我這份）
1. 登入後進到「會顯示課程清單／名額」的那個頁面。
2. F12 → Network 分頁 → 重新整理頁面。
3. 找到「載入課程清單」的那個 request（通常是回傳一大包 HTML 或 JSON 的那筆）。
4. 右鍵 → Copy → **Copy as cURL (bash)**。
5. 貼到聊天給我 → 我就能知道正確的網址、參數、需要哪些 header/cookie，把爬蟲寫成真的。
   （貼之前你可自行把 cookie 值改成 XXXX 遮掉，我只需要看「有哪些欄位」與「網址參數」。）

## 我另外需要的樣本（擇一即可，用來寫解析與匯出填表腳本）
- 課程清單頁：整頁 Ctrl+S 存成 .html，或 F12→Elements 複製那個 <table> 的外層 HTML。
- 志願點數選課的「填表頁」：同樣存一份，我要看每列有哪些 <input>/<select>（對應中山的自動填入腳本）。
