-- 預計算分數累加 RPC（投票時即時更新排行榜用）
CREATE OR REPLACE FUNCTION increment_result_cache(
  p_round_id UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_score INT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO results_cache (round_id, target_type, target_id, total_score, vote_count, updated_at)
  VALUES (p_round_id, p_target_type, p_target_id, p_score, 1, now())
  ON CONFLICT (round_id, target_type, target_id)
  DO UPDATE SET
    total_score = results_cache.total_score + p_score,
    vote_count = results_cache.vote_count + 1,
    updated_at = now();
END;
$$;
