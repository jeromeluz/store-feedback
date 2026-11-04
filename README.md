# 區組回饋平台 V16｜V14 舊資料歸戶移轉包

目標管理員：`jonny00520@gmail.com`。此版本沿用 V15 的多管理員網頁與 Firestore 規則，新增一次性移轉工具。

## 重要：先移轉再上線

1. 暫停門市填寫和管理員編輯，避免移轉期間產生新資料。
2. 在電腦安裝 Node.js（建議 20 以上）。從 Firebase Console > 專案設定 > 服務帳戶產生**私密金鑰 JSON**，存放在自己電腦，不要上傳 GitHub，也不要傳給別人。
3. 在此專案資料夾執行 `npm install`。
4. 設定 `GOOGLE_APPLICATION_CREDENTIALS` 環境變數，指向剛下載的 JSON：
   - Windows PowerShell：`$env:GOOGLE_APPLICATION_CREDENTIALS="C:\\安全資料夾\\service-account.json"`
   - macOS/Linux：`export GOOGLE_APPLICATION_CREDENTIALS="/安全資料夾/service-account.json"`
5. 先執行 `npm run migrate:check`，檢查資料與建立本機備份，不會寫入 Firestore。
6. 確認數量正確且沒有衝突後執行 `npm run migrate:apply`。會移轉根集合 `stores`、`tasks`、`responses`，建立 `storeDirectory`，並把舊任務缺少的 `status` 設為 `published`。
7. 出現「移轉完成且數量驗證通過」後，至 Firebase Console 發布這份 `firestore.rules`，再把 `index.html`、`app.js`、`config.js` 上傳 GitHub Pages。
8. 使用指定管理員登入，核對門市、任務、回饋及 Excel 匯出，然後再讓門市恢復使用。

## 保留資料

- 原本文件 ID 不變，照片網址、回饋答案、`updatedAt` 時間戳記照原值複製。
- 舊根集合不會刪除。
- 每次檢查或正式執行都會在 `migration-backup/` 產生本機 JSON 備份（此資料夾不要上傳 GitHub）。
- 若目標已有同 ID 文件或門市名稱對照，程式會停止，避免覆蓋。
- 若正式移轉中斷，可能已有部分文件建立，請不要直接重跑，先檢查已寫入的資料。

## 注意

目前沒有你的 Firebase 管理員憑證，因此無法代替你在正式資料庫執行移轉。這個 ZIP 是可在你電腦執行的工具與 V15 網頁程式，不代表線上資料已移轉。

## V17 更新
- 門市入口：`https://jeromeluz.github.io/store-feedback/`。不顯示管理者模式按鈕。
- 管理者專用入口：`https://jeromeluz.github.io/store-feedback/?admin=1`。保留原本 Email/密碼及快速登入。
- 門市登入提示改為「輸入您所屬的門市名稱」，範例「例如 嘉城」。
- 門市名稱儲存在目前瀏覽器的 localStorage。下次開啟一般網址或帶有 `?task=...&group=...` 的分享網址時，自動驗證門市並進入任務。若門市已停用或資料失效，則留在登入畫面提示。
- 任務卡片整張可點擊，支援鍵盤 Enter/空白鍵開啟，移除「查看任務」按鈕。
- 門市任務列表分為「進行中任務」「已完成任務」「已截止任務」。已完成但已截止的任務列在「已截止」分類，仍保留回饋紀錄。
- 無須修改 Firebase 安全規則；沿用 V16 `firestore.rules`。

**提醒：** 管理者網址是隱藏入口，不是額外的權限驗證。實際權限仍由 Firebase Auth 和 Firestore Rules 管理。門市自動登入僅記住門市名稱，仍會向 Firestore 驗證門市是否有效。


## V18 更新
- 「切換門市」移至頁面右上角「已連線」左側，僅在門市登入後顯示。
- 管理員網址 `?admin=1` 直接顯示 Email / 密碼登入頁。
- 門市任務清單只顯示任務日期為今天起往前 13 天（共 14 個日曆日）或未來的已發布任務。超出範圍的任務不在門市清單顯示，管理員仍可查看全部歷史任務。任務日期採用 `time` 欄位，而非截止日期。
- 管理員任務管理新增「任務日期篩選」，可選擇單一日期，點「顯示全部日期」恢復完整清單。
- 本版只需更新 `index.html`、`app.js`，沿用 V16/V17 Firestore 規則。
- 注意：14 天限制是前端清單顯示條件，不是 Firestore 資料讀取權限；不應當成資料保密措施。


## V19 更新項目

- 管理端每個任務改為右側「⋯」操作選單，包含編輯、複製、查看回饋、匯出 Excel、分享、刪除。
- 複製任務會開啟編輯器，帶入名稱、說明、門市、參考圖片及題目；每題使用新 ID，不帶入舊回饋。任務日期設今天，截止設明天 23:59，狀態為發布。確認後按儲存才建立新任務。
- 新增任務預設「發布」，截止時間預填明天 23:59；所有必填欄位完成前仍不會寫入資料庫。
- 電腦版管理端使用左側「任務管理／門市管理」側欄，右側顯示內容。手機版保留簡潔的頂部導覽。
- 登出移到頁首「管理者已登入」左側。
- 這次不需要更改 Firestore 規則。請上傳 index.html 和 app.js。


## V20 門市端改善
- 填完任務所有題目後自動標記「已完成」並寫入 Firestore，不需按完成回饋。
- 返回列表按鈕移至「門市名稱｜回饋任務」標題列最右側，只有開啟任務時顯示。
- 返回後即時依 Firestore 完成狀態分類；若儲存尚未完成，待寫入成功後更新。
