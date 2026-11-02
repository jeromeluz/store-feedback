# 區組回饋平台 — GitHub Pages 部署

1. 上傳 `index.html`、`app.js`、`config.js` 至 GitHub repository 根目錄。
2. GitHub Settings → Pages → Deploy from a branch → main / root。
3. Firebase 啟用 Anonymous 與 Email/Password Authentication，並在 Firestore `admins/{管理者UID}` 建立 `enabled: true`。
4. Firestore Rules 使用本專案 `firestore.rules`，不可改為公開寫入。
5. Cloudinary 使用 Free 帳號，Unsigned preset 為 `pcscteam`，限制 JPEG/PNG/WebP、2MB；注意公開 unsigned preset 仍可能遭濫用。

## 本次變更
- 統一超商橙綠紅三色、移除版本號與 4302 畫面驗證。管理者仍需 Firebase 帳號密碼及管理者 UID 授權。
- 任務日期為 date picker，新增預設今日。任務名稱、日期、說明、截止時間、至少一題且題目名稱均為必填。未填完整時不會寫入新任務。
- 門市與管理者任務列表均可切換依任務日期降序或截止日期升序。
- 任務詳情網址 `?task=任務ID`，返回列表移除參數。分享連結保留。

## 已知限制
- 僅輸入門市名稱不構成身分驗證。Firestore 規則仍允許匿名登入者讀取所有門市回饋，**不適合機密資料**。
- GitHub Pages 是公開靜態網站；Cloudinary unsigned 上傳入口可被外部使用者利用。
- 免費方案受額度限制；照片存取與儲存請遵循服務條款。
- 既有任務若 `time` 為舊的自由文字格式，編輯時必須重新選擇日期才能儲存。
- 尚未連線到正式 Firebase 專案進行端對端測試。

## 本次操作改善
- 門市名稱輸入後按 Enter，等同點選「進入門市」。
- 管理者 Email 或密碼欄按 Enter，等同點選「登入」。
- 門市任務排序只顯示在任務列表，進入任務填答時隱藏，返回列表時恢復。
