# 🚊 雙北捷運足跡冒險 (Taipei Metro Adventure)

這是一個專為捷運迷與探索者打造的輕量級 Web App！將枯燥的通勤轉化為遊戲化的集章任務。走到哪、拍到哪，建立屬於你自己的大台北捷運足跡手帳。

## ✨ 核心功能 (Features)

* **🗺️ 互動式捷運地圖**：整合 Leaflet.js，在地圖上精準標記捷運車站，已造訪與未造訪車站顏色分明。
* **📸 實地打卡與壓縮上傳**：抵達車站後，可直接透過手機上傳「紀念章」與「實地合照」。內建前端 Canvas 壓縮技術，節省流量並大幅提升上傳速度。
* **🔐 多使用者系統**：支援多帳號登入機制，親朋好友可以共用地圖，但擁有各自獨立的探索進度。
* **📖 數位集章冊**：精心設計的九宮格印章牆，支援點擊放大高畫質檢視，還原實體集章的感動。
* **⏱️ 足跡時間軸**：以垂直時間軸的卡片形式，記錄每一次的探索日期與合照回憶。
* **🧑‍🚀 個人主頁與成就徽章**：自動統計各捷運路線的探索進度 (例如：淡水信義線 2/28 站)，路線全通關即可解鎖專屬的「路線制霸」金框徽章！

## 🛠️ 技術架構 (Tech Stack)

* **前端 (Frontend)**: HTML5, CSS3, Vanilla JavaScript, Leaflet.js
* **後端與 API (Backend)**: Google Apps Script (GAS) 部署為 Web App API
* **資料庫 (Database)**: Google Sheets (輕量級讀寫)
* **雲端儲存 (Storage)**: Google Drive (存放使用者上傳的照片與印章)
* **部署 (Deployment)**: GitHub Pages (前端靜態網頁託管)

## 🚀 開發與部署流程說明

1.  **資料庫建立**：在 Google Sheets 建立 `Metro_Stations` (車站基底資料)、`Users` (帳密資料庫)、`User_Progress` (打卡紀錄)。
2.  **相簿權限**：在 Google Drive 建立資料夾並設為「知道連結的任何人皆可檢視」。
3.  **GAS 部署**：將 `appsscript.json` 開啟最高權限 (`oauthScopes`)，並將後端腳本發布為 Web App 取得 API 網址。
4.  **前端串接**：將 API 網址填入前端 JS，並推送到 GitHub 啟用 Pages 服務即可開始探索！
