# SAVEGAME — MarketingScore

## Sprint #1 — 2026-03-24

**狀態**：✅ 階段完成
**下一步**：活動當天實戰

### 完成摘要

MarketingScore 活動評分系統已完成全功能開發並部署至 Netlify。三方介面（參與者手機、主持人控制台、大螢幕投影）皆可正常運作，支援分桌/分組評分、即時排行榜、倒數計時、金球動畫等功能。經過多輪 code review + audit 修復 40+ 個 finding，系統已達穩定可用狀態。

### 技術架構

- **Stack**：Next.js 16 + TypeScript + Tailwind v4 + Supabase + Netlify
- **同步機制**：1 秒 HTTP Polling（useLiveSync hook），取代 Supabase Realtime
- **狀態機**：統一純函式推導（useEventState），三方共用
- **遊戲引擎**：Strategy Pattern（scoring/quiz/cheer/custom）
- **Port**：3708（dev server）

### 部署資訊

| 項目 | 值 |
|------|-----|
| URL | https://marketingscore.netlify.app |
| 目前活動代碼 | 224DX2 |
| Admin Key | 123456 |
| Netlify Site ID | af173055-8f50-4fc3-a8a1-62ceb0989e1b |

### 關鍵連結

| 頁面 | 路徑 |
|------|------|
| 參與者投票 | /play/{code} |
| 大螢幕投影 | /display/{code} |
| 主持人控制台 | /admin/events → 選活動 → 主持控制台 |
| 建立新活動 | /admin/events/new |

### 已知待辦（非緊急）

- [ ] LINE Bot 整合（Phase 2）
- [ ] 音效（Howler.js 已裝但無音檔）
- [ ] 活動報告 PDF 匯出
- [ ] 巨型元件拆分（display/play page）
- [ ] admin key 抽取為 useAdminKey hook

### 踩坑筆記

| 問題 | 解法 |
|------|------|
| custom 回合類型沒有投票 UI | fallback 到 scoring engine |
| 分組排行榜顯示 0 分 | API 端統一過濾（有 group 只回 group），移除前端聚合 |
| 倒數計時重置分數 | lastInitRoundRef 防止同回合重新初始化 |
| Netlify 部署 JS chunk 404 | 先停 dev server 再建置，避免 .next 被鎖 |
| 全員完成誤判 | vote_count 要除以 votesPerPerson |
| admin key 子頁面要重輸 | 主頁面自動存 localStorage |

### 給下一個自己的話

系統已穩定部署，活動當天只需要：建立新活動 → 分享 QR Code → 開始回合。如果要重新建活動，先到 /admin/events 刪除舊的再建新的。custom 類型回合會自動走評分模式。

---

## 📜 歷史存檔

（首次存檔，無歷史紀錄）
