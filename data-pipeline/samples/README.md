# 把大同登入後的頁面樣本丟這裡

我讀了之後就能把 scrape.py 的 parse_courses() 和前端匯出填表腳本寫成對的。
（這些檔只含課程資料，不含你的密碼；cookie 不要放進來。）

需要的檔案：
1. ListClassCourse.html  ← 課程清單頁的 HTML
   取得方式（擇一）：
   - DevTools → Network → 點 ListClassCourse.php → Response 分頁 → 全選複製 → 存成此檔
   - 或 Elements 分頁找到那個 <table> → 右鍵 Copy → Copy outerHTML → 存成此檔
   - 或直接在該頁 Ctrl+S 存整頁

2. (可選) SelectForm.html ← 若「志願點數填表/送出」是另一頁，也存一份
   我要看每列的 <input>/<select> 名稱，對應中山那段自動填入腳本。
