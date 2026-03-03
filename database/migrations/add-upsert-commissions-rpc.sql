-- =====================================================
-- 報酬データの安全な置換用RPC関数
-- DELETE + INSERT をトランザクション内で実行し、
-- クラッシュ時のデータ消失を防ぐ
-- =====================================================

CREATE OR REPLACE FUNCTION upsert_monthly_commissions(
  p_month VARCHAR(7),
  p_commissions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count INT;
  v_inserted_count INT;
BEGIN
  -- 1. 既存の同月報酬データを削除
  DELETE FROM commissions WHERE month = p_month;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- 2. 新しい報酬データを挿入
  INSERT INTO commissions (
    agency_id, sale_id, month, base_amount, tier_bonus,
    campaign_bonus, final_amount, status, tier_level,
    withholding_tax, carry_forward_reason
  )
  SELECT
    (item->>'agency_id')::UUID,
    (item->>'sale_id')::UUID,
    item->>'month',
    (item->>'base_amount')::DECIMAL,
    (item->>'tier_bonus')::DECIMAL,
    (item->>'campaign_bonus')::DECIMAL,
    (item->>'final_amount')::DECIMAL,
    COALESCE(item->>'status', 'confirmed'),
    (item->>'tier_level')::INT,
    COALESCE((item->>'withholding_tax')::DECIMAL, 0),
    item->>'carry_forward_reason'
  FROM jsonb_array_elements(p_commissions) AS item;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- トランザクション全体が成功した場合のみコミットされる
  RETURN jsonb_build_object(
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count
  );
END;
$$;
