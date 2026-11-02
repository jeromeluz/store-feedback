# 區組回饋平台 更新說明

這次修正：
- 門市名稱輸入欄位使用原生 form，按 Enter 會提交
- 管理者 Email 或密碼欄位按 Enter 會提交登入
- 是非題使用並排「是」「否」按鈕，點選即儲存，重新進入會恢復選取狀態
- `index.html` 對 app.js 加入版本查詢參數，降低 GitHub Pages / 瀏覽器沿用舊 JS 的機率

## 更新 GitHub Pages

**務必一起替換根目錄的 `index.html` 和 `app.js`**，不可只上傳其中一個。保留原本 `config.js` 設定。上傳後到 GitHub Actions 確認 Pages 部署完成，再強制重新整理。

如果管理員登入仍失敗，請查看畫面上的錯誤文字，確認 Authentication 帳密及 `admins/{UID}` 文件的 `enabled: true`。

如果是非題仍顯示舊選單，請檢查 GitHub 根目錄的 `app.js` 是否包含 `yesno-group`，並確認瀏覽器載入的 app.js URL 含 `build=20261102-11`。

此版本尚未在你的 Firebase 線上環境進行實際測試。
