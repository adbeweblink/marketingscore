-- MarketingScore 初始 Schema
-- 活動即時評分平台

-- ===== 活動 =====
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'finished')),
  config      JSONB DEFAULT '{}',
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ===== 桌次 =====
CREATE TABLE tables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  number      INT NOT NULL,
  name        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, number)
);

-- ===== 分組 =====
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE group_tables (
  group_id    UUID REFERENCES groups(id) ON DELETE CASCADE,
  table_id    UUID REFERENCES tables(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, table_id)
);

-- ===== 遊戲類型 =====
CREATE TABLE round_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  config_schema JSONB
);

INSERT INTO round_types VALUES
  ('scoring', '評分制', '參與者為各桌評分，加總排名', '{"min_score":1,"max_score":10}'),
  ('quiz',    '猜謎投票制', '出題→選答案→公布正解→計分', '{"options_count":4,"time_limit_sec":30}'),
  ('cheer',   '歡呼裁決制', '主持人裁決，觀眾歡呼加成', '{"judge_weight":0.7,"cheer_weight":0.3}'),
  ('custom',  '自訂積分制', '自訂計分邏輯', '{}');

-- ===== 回合 =====
CREATE TABLE rounds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  type_id     TEXT REFERENCES round_types(id),
  seq         INT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed', 'revealed')),
  config      JSONB DEFAULT '{}',
  opened_at   TIMESTAMPTZ,
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, seq)
);

-- ===== 參與者 =====
CREATE TABLE participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  table_id    UUID REFERENCES tables(id),
  line_user_id TEXT,
  display_name TEXT NOT NULL,
  avatar_url  TEXT,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, line_user_id)
);

-- ===== 投票 =====
CREATE TABLE votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID REFERENCES rounds(id) ON DELETE CASCADE,
  participant_id  UUID REFERENCES participants(id),
  target_table_id UUID REFERENCES tables(id),
  target_group_id UUID REFERENCES groups(id),
  score           INT,
  answer          TEXT,
  is_valid        BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(round_id, participant_id, COALESCE(target_table_id, '00000000-0000-0000-0000-000000000000'))
);

-- ===== 結果快取 =====
CREATE TABLE results_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID REFERENCES rounds(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('table', 'group')),
  target_id   UUID NOT NULL,
  total_score INT DEFAULT 0,
  vote_count  INT DEFAULT 0,
  rank        INT,
  metadata    JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(round_id, target_type, target_id)
);

-- ===== 報告 =====
CREATE TABLE reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 索引 =====
CREATE INDEX idx_events_code ON events(code);
CREATE INDEX idx_votes_round ON votes(round_id);
CREATE INDEX idx_votes_participant ON votes(participant_id);
CREATE INDEX idx_results_round ON results_cache(round_id);
CREATE INDEX idx_participants_event ON participants(event_id);
CREATE INDEX idx_participants_line ON participants(line_user_id);
CREATE INDEX idx_rounds_event_status ON rounds(event_id, status);

-- ===== RLS =====
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE results_cache ENABLE ROW LEVEL SECURITY;

-- 暫時允許匿名讀取（MVP 階段）
CREATE POLICY "allow_read_events" ON events FOR SELECT USING (true);
CREATE POLICY "allow_read_tables" ON tables FOR SELECT USING (true);
CREATE POLICY "allow_read_groups" ON groups FOR SELECT USING (true);
CREATE POLICY "allow_read_rounds" ON rounds FOR SELECT USING (true);
CREATE POLICY "allow_read_participants" ON participants FOR SELECT USING (true);
CREATE POLICY "allow_read_results" ON results_cache FOR SELECT USING (true);
