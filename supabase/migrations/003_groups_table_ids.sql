-- Migration 003: 在 groups 表補上 table_ids 欄位
-- 用途：快速查詢某組包含哪些桌次 UUID，避免每次都 JOIN group_tables
-- 若欄位已存在（例如手動在 Supabase Dashboard 加過），此 migration 不會報錯

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS table_ids UUID[] DEFAULT '{}';

-- 從現有 group_tables 關聯表反向填入（冪等，可重複執行）
UPDATE groups g
SET table_ids = (
  SELECT ARRAY_AGG(gt.table_id ORDER BY gt.table_id)
  FROM group_tables gt
  WHERE gt.group_id = g.id
)
WHERE table_ids IS NULL OR table_ids = '{}';
