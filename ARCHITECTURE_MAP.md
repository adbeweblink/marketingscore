# MarketingScore — 活動評分平台架構地圖

> 版本：v1.0 | 建立：2026-03-23 | 架構師：Irene
> 產品定位：活動即時評分/投票/猜謎 SaaS 平台

---

## 1. 技術選型

| 層級 | 技術 | 理由 |
|------|------|------|
| **前端框架** | Next.js 15 (App Router) | SSR 首屏快（手機掃碼即開）、API Routes 省後端、Vercel 部署零設定 |
| **即時通訊** | Supabase Realtime (WebSocket) | 基於 PostgreSQL LISTEN/NOTIFY，不需另架 WS server；80-100 人在 Free tier 內 |
| **資料庫** | Supabase PostgreSQL + RLS | Row Level Security 天然支援多租戶隔離；Realtime 訂閱直接綁 table |
| **LINE 整合** | LIFF v2 + LINE Messaging API | LIFF 取得 userId 做身份綁定，Rich Menu 引導操作 |
| **動畫庫** | Framer Motion + CSS Animations | Framer Motion 處理排行榜排名變動動畫；CSS 處理金碧輝煌粒子/光效 |
| **音效** | Howler.js | 大螢幕投影排名變動音效、倒數音效 |
| **圖表** | Recharts | 活動後報告圖表，輕量且 React 原生 |
| **部署** | Vercel (前端) + Supabase (後端/DB) | 零 DevOps，適合首發速度；未來產品化可遷移 |
| **PDF 導出** | @react-pdf/renderer | 活動報告 PDF 生成 |

### 為什麼不選的

| 被淘汰方案 | 原因 |
|------------|------|
| Socket.IO 自架 | 80 人場景 overkill，Supabase Realtime 夠用且免維運 |
| Firebase | 查詢彈性差，報告導出麻煩；Supabase SQL 更適合統計 |
| SSE | 單向推送，缺少主持人→伺服器的雙向控制能力 |
| Three.js / PixiJS | 大螢幕動畫不需要 3D/Canvas，CSS + Framer Motion 開發速度快 3 倍 |

---

## 2. 系統架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                        使用者端 (Clients)                        │
├──────────────┬──────────────────┬────────────────────────────────┤
│  📱 參與者手機   │  🖥️ 大螢幕投影     │  ⚙️ 管理後台                  │
│  /play/[code] │  /display/[code] │  /admin/events/[id]           │
│  LINE LIFF 開啟 │  全螢幕 + 動畫    │  主持人控制面板                │
│  評分/投票/猜謎  │  排行榜 + 即時更新  │  開始/結束/下一輪/手動調分      │
└──────┬───────┴────────┬─────────┴──────────────┬────────────────┘
       │                │                        │
       │  HTTPS         │  WSS (Realtime)        │  HTTPS
       ▼                ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js API Routes (Vercel)                   │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/vote          — 提交評分/投票                         │
│  POST /api/admin/round   — 控制回合（開始/結束/下一輪）            │
│  GET  /api/results       — 取得結果統計                          │
│  POST /api/line/webhook  — LINE Webhook 接收                    │
│  GET  /api/report/[id]   — 活動報告 PDF                         │
│  POST /api/events        — CRUD 活動（管理後台）                  │
│  POST /api/auth/liff     — LIFF Token 驗證 + 參與者註冊          │
├─────────────────────────────────────────────────────────────────┤
│  中間件層                                                        │
│  ├─ Auth Middleware     — JWT/LIFF Token 驗證                    │
│  ├─ Rate Limiter        — 每人每回合限 1 票 + API 頻率限制         │
│  ├─ Anti-Cheat Guard    — 不能評自己桌、重複投票檢查               │
│  └─ Tenant Resolver     — 從 event_code 解析租戶                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase                                      │
├────────────────────┬────────────────────────────────────────────┤
│  PostgreSQL        │  Realtime                                   │
│  ├─ events         │  ├─ channel: event:{code}                   │
│  ├─ tables         │  │  → 排行榜更新 (大螢幕訂閱)                │
│  ├─ groups         │  ├─ channel: round:{id}                     │
│  ├─ rounds         │  │  → 回合狀態變更 (全端訂閱)                │
│  ├─ round_types    │  └─ channel: control:{code}                 │
│  ├─ participants   │     → 主持人指令廣播 (全端訂閱)               │
│  ├─ votes          │                                             │
│  ├─ results_cache  │  Auth                                       │
│  └─ tenants        │  └─ Anonymous sign-in (LIFF userId 綁定)    │
│                    │                                             │
│  RLS Policies      │  Storage                                    │
│  └─ 所有表以        │  └─ 活動素材（Logo、背景圖）                  │
│     event_id 隔離  │                                             │
└────────────────────┴────────────────────────────────────────────┘
```

### 資料流：一次評分的完整路徑

```
參與者按下「提交評分」
  │
  ▼
📱 POST /api/vote { round_id, target_table_id, score }
  │
  ▼
API Route:
  1. 驗證 JWT (LIFF userId)
  2. Anti-Cheat: 不能評自己桌？本回合已投過？回合是否開放中？
  3. INSERT INTO votes (...)
  4. UPDATE results_cache SET total = total + score  ← 預算快取
  5. Supabase Realtime 自動觸發 broadcast
  │
  ▼
🖥️ 大螢幕收到 Realtime event
  1. 更新排行榜數據
  2. Framer Motion 動畫排名重排
  3. 新票數 +1 飄字特效
```

---

## 3. 資料庫 Schema

### ER 關係概覽

```
tenants 1──N events 1──N rounds N──1 round_types
                │           │
                ├──N tables │
                │     │     │
                │     N     N
                │     │     │
                ├──N groups votes
                │           │
                └──N participants
                            │
                       results_cache
```

### 完整 Schema

```sql
-- ===== 多租戶 =====
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,               -- 公司名稱
  slug        TEXT UNIQUE NOT NULL,        -- URL 辨識（如 "adobe-tw"）
  plan        TEXT DEFAULT 'free',         -- free / pro / enterprise
  settings    JSONB DEFAULT '{}',          -- 白標設定（Logo、主色）
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ===== 活動 =====
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  code        TEXT UNIQUE NOT NULL,        -- 6 碼參加代碼（如 "ADO326"）
  name        TEXT NOT NULL,               -- "FY26 經銷商大會"
  status      TEXT DEFAULT 'draft',        -- draft / active / finished
  config      JSONB DEFAULT '{}',          -- 活動設定（桌數、主題色、背景圖）
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ===== 桌次 =====
CREATE TABLE tables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  number      INT NOT NULL,                -- 桌號 1-8
  name        TEXT,                        -- 自訂桌名（如 "Photoshop 隊"）
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, number)
);

-- ===== 分組（多桌組隊）=====
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,               -- 組名
  color       TEXT,                        -- 顯示顏色
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 桌次 ↔ 分組 多對多
CREATE TABLE group_tables (
  group_id    UUID REFERENCES groups(id) ON DELETE CASCADE,
  table_id    UUID REFERENCES tables(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, table_id)
);

-- ===== 遊戲類型定義 =====
CREATE TABLE round_types (
  id          TEXT PRIMARY KEY,            -- 'scoring' / 'quiz' / 'cheer'
  name        TEXT NOT NULL,               -- "評分制" / "猜謎投票制" / "歡呼裁決制"
  description TEXT,
  config_schema JSONB                      -- 該類型需要的設定欄位定義
);

-- 預設三種類型
INSERT INTO round_types VALUES
  ('scoring', '評分制', '參與者為各桌評分，加總排名', '{"min_score":1,"max_score":10}'),
  ('quiz',    '猜謎投票制', '出題→選答案→公布正解→計分', '{"options_count":4,"time_limit_sec":30}'),
  ('cheer',   '歡呼裁決制', '主持人裁決，觀眾歡呼加成', '{"judge_weight":0.7,"cheer_weight":0.3}');

-- ===== 回合 =====
CREATE TABLE rounds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  type_id     TEXT REFERENCES round_types(id),
  seq         INT NOT NULL,                -- 回合順序 1, 2, 3...
  title       TEXT NOT NULL,               -- "第一輪：產品展示"
  status      TEXT DEFAULT 'pending',      -- pending / open / closed / revealed
  config      JSONB DEFAULT '{}',          -- 回合專屬設定（時間限制、選項等）
  opened_at   TIMESTAMPTZ,                 -- 開放投票時間
  closed_at   TIMESTAMPTZ,                 -- 關閉投票時間
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, seq)
);

-- ===== 參與者 =====
CREATE TABLE participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  table_id    UUID REFERENCES tables(id),
  line_user_id TEXT,                       -- LINE LIFF userId
  display_name TEXT,                       -- LINE 顯示名稱
  avatar_url  TEXT,                        -- LINE 大頭貼
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, line_user_id)           -- 同活動不重複加入
);

-- ===== 投票/評分 =====
CREATE TABLE votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID REFERENCES rounds(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id),
  target_table_id UUID REFERENCES tables(id),  -- 被評的桌（scoring 用）
  target_group_id UUID REFERENCES groups(id),  -- 被評的組（分組模式用）
  score       INT,                         -- 評分值（scoring: 1-10）
  answer      TEXT,                        -- 選擇的答案（quiz 用）
  cheer_value INT,                         -- 歡呼值（cheer 用）
  created_at  TIMESTAMPTZ DEFAULT now(),
  -- 防作弊：一人一回合一目標只能投一次
  UNIQUE(round_id, participant_id, target_table_id)
);

-- ===== 結果快取（預計算，大螢幕用）=====
CREATE TABLE results_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID REFERENCES rounds(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,               -- 'table' / 'group'
  target_id   UUID NOT NULL,               -- table_id 或 group_id
  total_score INT DEFAULT 0,               -- 總分
  vote_count  INT DEFAULT 0,               -- 投票數
  rank        INT,                         -- 排名（回合關閉後計算）
  metadata    JSONB DEFAULT '{}',          -- 額外統計（平均分、最高分等）
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(round_id, target_type, target_id)
);

-- ===== 活動報告（活動結束後生成）=====
CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,              -- 完整統計數據
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== RLS 政策 =====
-- 所有表啟用 RLS，以 event_id 做租戶隔離
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
-- ... 其餘表同理

-- 範例 RLS：參與者只能看到自己活動的資料
CREATE POLICY "participants_event_isolation" ON votes
  FOR ALL USING (
    round_id IN (
      SELECT id FROM rounds WHERE event_id = (
        SELECT event_id FROM participants WHERE id = auth.uid()
      )
    )
  );
```

### 索引策略

```sql
-- 高頻查詢索引
CREATE INDEX idx_votes_round ON votes(round_id);
CREATE INDEX idx_votes_participant ON votes(participant_id);
CREATE INDEX idx_results_round ON results_cache(round_id);
CREATE INDEX idx_participants_event ON participants(event_id);
CREATE INDEX idx_participants_line ON participants(line_user_id);
CREATE INDEX idx_rounds_event_status ON rounds(event_id, status);
CREATE INDEX idx_events_code ON events(code);
```

---

## 4. 即時通訊架構

### Channel 設計

```
Supabase Realtime Channels:
│
├─ event:{code}          ← 大螢幕訂閱
│  payload: { type: 'score_update', round_id, rankings: [...] }
│
├─ round:{event_code}    ← 所有端訂閱
│  payload: { type: 'status_change', round_id, status: 'open'|'closed'|'revealed' }
│
└─ control:{event_code}  ← 所有端訂閱
   payload: { type: 'command', action: 'next_round'|'show_results'|'countdown' }
```

### 更新流程

```
【評分提交後的即時更新】

API Route (vote 寫入)
  │
  ├─ INSERT votes → PostgreSQL trigger → Realtime broadcast
  │                                      (DB Changes 模式)
  │
  └─ UPDATE results_cache
       → Realtime broadcast 到 event:{code} channel
       → 大螢幕收到新排名
       → Framer Motion layoutAnimation 自動處理排名動畫

【主持人控制同步】

Admin 後台點「下一輪」
  │
  ├─ POST /api/admin/round { action: 'next' }
  │
  ├─ UPDATE rounds SET status = 'open'
  │
  └─ Broadcast 到 control:{code}
       ├─ 📱 手機：顯示新的投票介面
       ├─ 🖥️ 大螢幕：播放過場動畫 → 顯示新回合標題
       └─ ⚙️ 其他管理者：同步狀態
```

### 斷線重連策略

```
1. Supabase Realtime 內建自動重連（指數退避）
2. 重連後：GET /api/results?round_id=current 拉最新狀態
3. 大螢幕額外加 heartbeat（每 10s），斷線 30s 顯示重連提示
4. 手機端斷線時禁用提交按鈕，避免遺失投票
```

---

## 5. LINE Bot 架構

### LIFF 登入流程

```
1. 參與者收到活動 QR Code / 短連結
   https://marketingscore.app/play/ADO326
   │
   ▼
2. Next.js 頁面偵測環境
   ├─ LINE 內建瀏覽器 → 直接 LIFF init
   └─ 外部瀏覽器 → 導向 LINE Login
   │
   ▼
3. LIFF SDK 取得 accessToken + userId + displayName + pictureUrl
   │
   ▼
4. POST /api/auth/liff { liffToken, eventCode }
   ├─ 驗證 LIFF Token（call LINE API verify）
   ├─ 查找/建立 participant 記錄
   ├─ 簽發 app JWT（含 participant_id, event_id, table_id）
   └─ 回傳 JWT + 活動資訊
   │
   ▼
5. 選桌次 → 開始參與
```

### LINE Webhook 處理

```
POST /api/line/webhook
│
├─ 驗證 X-Line-Signature
│
├─ message event
│  ├─ "加入 ADO326" → 回傳 LIFF 連結
│  └─ 其他 → 回傳使用說明
│
├─ follow event
│  └─ 歡迎訊息 + 引導加入活動
│
└─ postback event
   └─ 處理 Rich Menu 點擊
```

### Rich Menu 設計

```
┌─────────────┬─────────────┐
│  📊 我的排名  │  🎮 加入活動  │
│             │             │
├─────────────┼─────────────┤
│  📜 活動紀錄  │  ❓ 使用說明  │
│             │             │
└─────────────┴─────────────┘
```

### LIFF App 配置

```
LIFF Size: Full（全螢幕，沉浸式體驗）
Endpoint URL: https://marketingscore.app/play
Scopes: profile, openid
```

---

## 6. 安全性考量

### 防作弊機制

| 層級 | 機制 | 實作方式 |
|------|------|----------|
| **身份** | 一人一帳 | LINE userId 唯一綁定，無法偽造 |
| **投票** | 一人一票 | DB UNIQUE 約束 (round_id + participant_id + target_table_id) |
| **自評** | 不能評自己桌 | API 中間件檢查 participant.table_id ≠ target_table_id |
| **時間** | 只在開放期投票 | 檢查 round.status === 'open' |
| **頻率** | Rate Limit | Vercel Edge Middleware: 每人每秒最多 5 次請求 |
| **篡改** | 分數範圍驗證 | Zod schema 驗證 score ∈ [min, max] |

### 資料隔離

```
RLS Policy 三層防護：
1. 租戶隔離：tenant_id 匹配（產品化後）
2. 活動隔離：event_id 匹配
3. 角色隔離：admin 可寫、participant 只能寫自己的票

API Route 額外檢查：
- JWT 中的 event_id 必須匹配請求的 event_id
- Admin 操作需額外 admin_token 驗證
```

### 其他安全措施

- **CORS**：限制來源域名
- **HTTPS**：Vercel 預設強制
- **環境變數**：所有 key/secret 走 `process.env`
- **SQL Injection**：Supabase SDK 參數化查詢
- **XSS**：React 預設 escape + CSP headers

---

## 7. 產品化考量

### 多租戶架構

```
共享資料庫 + RLS 隔離（成本最低，80-100 人場景足夠）

URL 結構：
├─ marketingscore.app/admin          — 平台管理
├─ marketingscore.app/play/ADO326    — 參與者入口
├─ marketingscore.app/display/ADO326 — 大螢幕投影
│
未來白標：
├─ events.adobe-tw.com/play/ADO326   — 自訂域名
└─ Custom Logo + 主色系 + 背景圖     — tenant.settings JSONB
```

### 白標能力

```json
// tenant.settings 範例
{
  "branding": {
    "logo_url": "https://...",
    "primary_color": "#FF0000",
    "background_theme": "golden",     // golden / dark / neon / custom
    "custom_css": "..."               // Enterprise only
  },
  "features": {
    "max_events": 5,                  // 依方案限制
    "max_participants_per_event": 100,
    "report_export": true,
    "custom_domain": false
  }
}
```

### 定價模式建議

| 方案 | 月費 | 限制 | 目標客戶 |
|------|------|------|----------|
| **Free** | $0 | 1 場/月、50 人、基本排行榜 | 試用 |
| **Pro** | NT$2,990/月 | 10 場/月、200 人、完整報告、自訂主題 | 活動公司、中小企業 |
| **Enterprise** | NT$9,990/月 | 無限場次、1000 人、白標、API、專屬支援 | 大型企業、連鎖活動 |
| **單場** | NT$990/場 | 一次性、200 人 | 偶爾辦活動的公司 |

> 💡 首發 Adobe 大會 = 最佳案例，拿到實戰數據後再調整定價。

---

## 8. 大螢幕投影設計

### 畫面規格

```
解析度：1920×1080（投影機標準）
框架：全螢幕 React 頁面，無瀏覽器 UI
字體：大字體（最小 24px），高對比
主題：金碧輝煌（#FFD700 金色 + #1A0A00 深底 + 粒子光效）
```

### 畫面狀態機

```
[待機] ──開始──→ [回合介紹] ──倒數──→ [投票中]
                                         │
                      ┌─────────── 時間到/手動關閉
                      ▼
                 [計算中動畫] ──→ [排行榜揭曉]
                                      │
                    ┌────── 下一輪 ────┘
                    ▼                 │
               [回合介紹]         [最終結果]
                                      │
                                 [頒獎畫面]
```

### 動畫效果清單

| 場景 | 動畫 | 技術 |
|------|------|------|
| 排名變動 | 卡片上下滑動重排 | Framer Motion `layoutAnimation` |
| 新投票進來 | 分數 +N 飄字 | CSS `@keyframes` float-up |
| 揭曉排名 | 從第 N 名逐一亮起 | Framer Motion `staggerChildren` |
| 第一名 | 金色光環 + 粒子爆炸 | CSS `radial-gradient` + `particles.js` 輕量版 |
| 倒數計時 | 大數字翻牌 | Framer Motion `AnimatePresence` |
| 回合轉場 | 全螢幕 wipe/fade | CSS `clip-path` animation |
| 待機狀態 | 浮動粒子 + Logo 呼吸 | CSS animation loop |

---

## 9. 目錄結構

```
marketingscore/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (admin)/                  # 管理後台 layout group
│   │   │   ├── admin/
│   │   │   │   ├── events/
│   │   │   │   │   ├── page.tsx      # 活動列表
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx  # 活動設定
│   │   │   │   │       ├── rounds/   # 回合管理
│   │   │   │   │       └── control/  # 主持人控制台
│   │   │   │   └── layout.tsx        # Admin layout
│   │   ├── play/
│   │   │   └── [code]/
│   │   │       ├── page.tsx          # 參與者主頁（選桌→投票）
│   │   │       └── components/       # 投票 UI 元件
│   │   ├── display/
│   │   │   └── [code]/
│   │   │       ├── page.tsx          # 大螢幕投影
│   │   │       └── components/       # 排行榜、動畫、粒子
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── liff/route.ts     # LIFF 驗證
│   │   │   ├── vote/route.ts         # 提交評分
│   │   │   ├── admin/
│   │   │   │   ├── round/route.ts    # 回合控制
│   │   │   │   └── events/route.ts   # 活動 CRUD
│   │   │   ├── results/route.ts      # 結果查詢
│   │   │   ├── report/
│   │   │   │   └── [id]/route.ts     # 報告導出
│   │   │   └── line/
│   │   │       └── webhook/route.ts  # LINE Webhook
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Landing page
│   ├── components/
│   │   ├── ui/                       # shadcn/ui 基礎元件
│   │   ├── display/                  # 大螢幕專用元件
│   │   │   ├── Leaderboard.tsx       # 排行榜（含動畫）
│   │   │   ├── Countdown.tsx         # 倒數計時器
│   │   │   ├── ParticleBackground.tsx # 金碧輝煌粒子背景
│   │   │   ├── ScorePopup.tsx        # 分數飄字
│   │   │   └── RevealAnimation.tsx   # 排名揭曉動畫
│   │   ├── play/                     # 手機端元件
│   │   │   ├── ScoreSlider.tsx       # 評分滑桿
│   │   │   ├── QuizOptions.tsx       # 猜謎選項
│   │   │   ├── CheerButton.tsx       # 歡呼按鈕
│   │   │   └── TableSelector.tsx     # 選桌介面
│   │   └── admin/                    # 後台元件
│   │       ├── RoundController.tsx   # 主持人控制面板
│   │       ├── EventSetup.tsx        # 活動設定表單
│   │       └── LiveMonitor.tsx       # 即時投票監控
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser client
│   │   │   ├── server.ts             # Server client
│   │   │   └── realtime.ts           # Realtime channel 工具
│   │   ├── line/
│   │   │   ├── liff.ts              # LIFF SDK wrapper
│   │   │   ├── webhook.ts           # Webhook 驗證 + 處理
│   │   │   └── messaging.ts         # 推播訊息
│   │   ├── game-engine/
│   │   │   ├── types.ts             # 通用遊戲介面
│   │   │   ├── scoring.ts           # 評分制邏輯
│   │   │   ├── quiz.ts              # 猜謎制邏輯
│   │   │   └── cheer.ts             # 歡呼制邏輯
│   │   ├── anti-cheat.ts            # 防作弊檢查
│   │   ├── rate-limit.ts            # 頻率限制
│   │   └── report-generator.ts      # 報告生成
│   ├── hooks/
│   │   ├── useRealtime.ts           # Realtime 訂閱 hook
│   │   ├── useRound.ts              # 回合狀態 hook
│   │   └── useLeaderboard.ts        # 排行榜 hook
│   └── types/
│       ├── database.ts              # Supabase 生成的型別
│       ├── game.ts                  # 遊戲引擎型別
│       └── line.ts                  # LINE 相關型別
├── supabase/
│   ├── migrations/                  # DB migration files
│   └── seed.sql                     # 測試資料
├── public/
│   ├── sounds/                      # 音效檔
│   └── themes/                      # 主題素材
├── .env.local                       # 本機環境變數
├── .env.example                     # 範例（不含真實資料）
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── ARCHITECTURE_MAP.md              # 本文件
```

---

## 10. 開發階段

### Phase 1: MVP — 核心評分 + 大螢幕（目標：Adobe 大會前完成）

```
Week 1:
  ├─ Supabase 專案建立 + Schema migration
  ├─ Next.js 專案骨架 + shadcn/ui
  ├─ Admin 後台：建立活動、設定桌次、建立回合
  └─ 基本 API Routes (CRUD)

Week 2:
  ├─ 參與者手機頁面（直接輸入暱稱，不用 LINE）
  ├─ 評分制遊戲引擎（scoring.ts）
  ├─ 投票 API + 防作弊中間件
  └─ Supabase Realtime 整合

Week 3:
  ├─ 大螢幕排行榜 + 所有動畫效果
  ├─ 主持人控制台（開始/結束/下一輪）
  ├─ 金碧輝煌主題
  └─ 音效整合

Week 4:
  ├─ 壓力測試（模擬 100 人同時投票）
  ├─ Bug fix + 邊界情況處理
  ├─ 彩排用部署（Vercel preview）
  └─ 現場 rehearsal
```

> ⚠️ Phase 1 用簡單暱稱登入（不依賴 LINE），確保大會當天能用。

### Phase 2: LINE 整合

```
  ├─ LINE Bot 建立 + LIFF App 設定
  ├─ LIFF 登入流程實作
  ├─ Webhook 處理
  ├─ Rich Menu 設計與上傳
  └─ LINE → 原暱稱系統的遷移/並存
```

### Phase 3: 產品化

```
  ├─ 多租戶系統（tenants 表 + RLS）
  ├─ 猜謎制 + 歡呼制遊戲引擎
  ├─ 活動報告 PDF 導出
  ├─ 白標設定介面
  ├─ Landing page + 定價頁
  ├─ Stripe/LINE Pay 金流串接
  └─ 自訂域名支援
```

---

## 11. 環境變數

```bash
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# LINE
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
NEXT_PUBLIC_LIFF_ID=

# App
NEXT_PUBLIC_APP_URL=https://marketingscore.app
ADMIN_SECRET_KEY=                    # 管理後台驗證
```

---

## 12. Port 分配

```
專案名稱：marketingscore
Hash 計算：3000 + (hash("marketingscore") % 1000) = 3708

開發用 Port：
  Frontend: 3708  (next dev -p 3708)
```

---

## 13. 關鍵決策記錄 (ADR)

| # | 決策 | 理由 | 替代方案 |
|---|------|------|----------|
| 1 | Supabase Realtime 而非自架 WS | 80-100 人在免費額度內；省去 server 維運 | Socket.IO + VPS |
| 2 | 預計算 results_cache 表 | 大螢幕需要毫秒級更新，不能每次 aggregate | 即時 SQL aggregate |
| 3 | Phase 1 不用 LINE 登入 | 降低 MVP 風險，暱稱登入確保大會能用 | 一開始就 LIFF |
| 4 | JSONB config 欄位 | 不同遊戲類型需要不同設定，schema 靈活 | 每種類型獨立表 |
| 5 | Vercel 部署 | 零 DevOps，Edge Function 全球加速 | AWS/GCP |
| 6 | 共享 DB 多租戶 | 初期成本最低，RLS 夠安全 | DB per tenant |

---

## 14. 風險與緩解

| 風險 | 影響 | 機率 | 緩解 |
|------|------|------|------|
| 大會當天網路不穩 | 致命 | 中 | 離線模式：手機端 queue 投票，恢復後批次送出 |
| Supabase Realtime 延遲 | 高 | 低 | Fallback: 大螢幕每 3 秒 polling results_cache |
| 100 人同時投票瞬間峰值 | 中 | 高 | results_cache 避免即時 aggregate；Vercel Edge 自動擴展 |
| LINE LIFF 審核延遲 | 中 | 中 | Phase 1 不依賴 LINE（ADR #3） |
| 投影機解析度不符 | 低 | 低 | 大螢幕頁面支援 16:9 / 4:3 自適應 |

---

> 📍 架構設計完成，涵蓋技術選型、Schema、即時通訊、LINE、安全、產品化、開發計畫。核心決策：Supabase 全家桶 + Phase 1 不綁 LINE 降低風險。
