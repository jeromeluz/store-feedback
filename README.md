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
