-- Adobe FY26 經銷商大會 測試資料

-- 建立活動
INSERT INTO events (id, code, name, status, config) VALUES (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'ADO326',
  'Adobe FY26 經銷商大會春酒',
  'draft',
  '{"table_count": 8, "theme": "golden"}'
);

-- 建立 8 桌
INSERT INTO tables (event_id, number) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 1),
  ('a1b2c3d4-0000-0000-0000-000000000001', 2),
  ('a1b2c3d4-0000-0000-0000-000000000001', 3),
  ('a1b2c3d4-0000-0000-0000-000000000001', 4),
  ('a1b2c3d4-0000-0000-0000-000000000001', 5),
  ('a1b2c3d4-0000-0000-0000-000000000001', 6),
  ('a1b2c3d4-0000-0000-0000-000000000001', 7),
  ('a1b2c3d4-0000-0000-0000-000000000001', 8);

-- 建立分組（男女合唱 PK 用）
INSERT INTO groups (id, event_id, name, color) VALUES
  ('g0000000-0000-0000-0000-00000000000a', 'a1b2c3d4-0000-0000-0000-000000000001', 'A 組 (1&2)', '#FF6B6B'),
  ('g0000000-0000-0000-0000-00000000000b', 'a1b2c3d4-0000-0000-0000-000000000001', 'B 組 (3&5)', '#4ECDC4'),
  ('g0000000-0000-0000-0000-00000000000c', 'a1b2c3d4-0000-0000-0000-000000000001', 'C 組 (4&6)', '#FFE66D'),
  ('g0000000-0000-0000-0000-00000000000d', 'a1b2c3d4-0000-0000-0000-000000000001', 'D 組 (7&8)', '#A8E6CF');

-- 建立 6 回合
INSERT INTO rounds (event_id, type_id, seq, title, config) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'quiz', 1, '蒙面歌手（女生組）',
   '{"question": "猜猜這是哪一桌的歌手？", "points_correct": 10, "points_performer": 5, "allow_self_vote": false, "anonymous": true}'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'quiz', 2, '蒙面歌手（男生組）',
   '{"question": "猜猜這是哪一桌的歌手？", "points_correct": 10, "points_performer": 5, "allow_self_vote": false, "anonymous": true}'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'scoring', 3, '團體自選曲',
   '{"scale_min": 1, "scale_max": 10, "aggregation": "average", "scoring_unit": "table", "allow_self_vote": false, "anonymous": true}'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'scoring', 4, '男女合唱 PK',
   '{"scale_min": 1, "scale_max": 10, "aggregation": "average", "scoring_unit": "group", "allow_self_vote": false, "anonymous": false}'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'cheer', 5, '飆高音挑戰',
   '{"allow_self_vote": false, "anonymous": false}'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'custom', 6, '最終統計',
   '{}');
