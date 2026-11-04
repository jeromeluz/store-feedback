# 區組回饋平台 V13 部署說明

更新項目
- 門市端：進行中任務與可展開的已截止任務分開。已截止任務只讀不可修改。
- 管理者端：進行中、暫存、已截止三類任務。新任務預設為暫存；可在編輯頁改為發布。暫存可以儲存尚未完成的題目，發布前必須填妥必填欄位。
- 管理者在「回饋查看」看到每筆回饋的「上傳時間」，採 Firestore updatedAt，即最後一次成功儲存的時間，並非首次上傳時間。門市端不顯示。
- 任務列表新增「匯出 Excel」，將指定任務的所有門市回饋輸出 XLSX，每題一欄，含上傳時間與照片連結。Excel 匯出需能載入 SheetJS CDN。

## 部署
1. 將 index.html、app.js 更新到 GitHub Pages 專案根目錄，config.js 沿用原設定。
2. **重要：** Firebase Console → Firestore Database → 規則，使用此包中的 firestore.rules 完整取代並發布。新增的規則讓匿名門市看不到暫存任務；原有規則會暴露暫存任務。
3. 在 GitHub Actions 確認 Pages 已部署，重新整理頁面。
4. 建立暫存任務 → 檢查門市端不可見 → 改成發布 → 門市端可見；到期後應歸類已截止。
5. 以管理員回饋查看與匯出 Excel 驗證時間及資料。

## 注意
- 舊任務沒有 status 欄位，為了相容會視為已發布。
- 既有回饋 updatedAt 欄位若不存在會顯示尚未上傳。
- 截止分類依任務的 deadlineAt（Firebase timestamp）判斷，頁面開啟期間如剛好跨過截止時間，請重新整理以更新分類。
- 門市免密碼登入及匿名讀取回饋仍存在原系統的資料保護限制，不適合機密資料。
- 免費額度仍依 Firebase Spark、Cloudinary Free 及 GitHub Pages 各自限制。
- 此版通過 JavaScript 語法檢查，未在實際 Firebase 環境完成端到端測試。
