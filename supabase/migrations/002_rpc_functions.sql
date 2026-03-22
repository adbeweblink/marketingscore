-- 預計算分數累加 RPC（投票時即時更新排行榜用）
-- #27 fix: SECURITY DEFINER + 限制呼叫權限
CREATE OR REPLACE FUNCTION increment_result_cache(
  p_round_id UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_score INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE EXECUTE ON FUNCTION increment_result_cache FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_result_cache TO service_role;

-- #3 fix: 一次完成排名計算（取代 N+1 UPDATE）
CREATE OR REPLACE FUNCTION finalize_round_ranks(p_round_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE results_cache rc
  SET rank = sub.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY total_score DESC) AS rn
    FROM results_cache
    WHERE round_id = p_round_id
  ) sub
  WHERE rc.id = sub.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION finalize_round_ranks FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_round_ranks TO service_role;
