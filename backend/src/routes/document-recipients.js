/**
 * 書類宛先テンプレート管理APIエンドポイント
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');

/**
 * 宛先テンプレート一覧取得
 * GET /api/document-recipients
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type, favorite_only } = req.query;

    let query = supabase
      .from('document_recipients')
      .select('*')
      .order('is_favorite', { ascending: false })
      .order('use_count', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false });

    // ユーザー自身のテンプレートまたはシステム共通（user_id IS NULL）のみ
    if (req.user.role !== 'admin') {
      query = query.or(`user_id.eq.${req.user.id},user_id.is.null`);
    }

    // タイプフィルター
    if (type) {
      query = query.eq('recipient_type', type);
    }

    // お気に入りのみ
    if (favorite_only === 'true') {
      query = query.eq('is_favorite', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('宛先テンプレート取得エラー:', error);
      return res.status(500).json({ error: '宛先テンプレートの取得に失敗しました' });
    }

    res.json(data || []);

  } catch (error) {
    console.error('宛先テンプレート取得エラー:', error);
    res.status(500).json({ error: '宛先テンプレートの取得に失敗しました' });
  }
});

/**
 * 宛先テンプレート詳細取得
 * GET /api/document-recipients/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('document_recipients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('宛先テンプレート取得エラー:', error);
      return res.status(404).json({ error: '宛先テンプレートが見つかりません' });
    }

    // 権限チェック: 自分のテンプレートまたは共有テンプレート（user_id IS NULL）のみアクセス可
    if (data.user_id && data.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'アクセス権限がありません' });
    }

    res.json(data);

  } catch (error) {
    console.error('宛先テンプレート取得エラー:', error);
    res.status(500).json({ error: '宛先テンプレートの取得に失敗しました' });
  }
});

/**
 * 宛先テンプレート作成
 * POST /api/document-recipients
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      template_name,
      recipient_type,
      company_name,
      postal_code,
      address,
      contact_person,
      department,
      phone,
      email,
      notes,
      is_favorite
    } = req.body;

    // バリデーション
    if (!template_name || !recipient_type) {
      return res.status(400).json({ error: 'テンプレート名と宛先タイプは必須です' });
    }

    if (!['admin', 'agency', 'custom'].includes(recipient_type)) {
      return res.status(400).json({ error: '無効な宛先タイプです' });
    }

    // 新規テンプレートデータ
    const newRecipient = {
      user_id: req.user.id,
      template_name,
      recipient_type,
      company_name,
      postal_code,
      address,
      contact_person,
      department,
      phone,
      email,
      notes,
      is_favorite: is_favorite || false,
      use_count: 0
    };

    const { data, error } = await supabase
      .from('document_recipients')
      .insert([newRecipient])
      .select()
      .single();

    if (error) {
      console.error('宛先テンプレート作成エラー:', error);
      return res.status(500).json({ error: '宛先テンプレートの作成に失敗しました' });
    }

    res.status(201).json(data);

  } catch (error) {
    console.error('宛先テンプレート作成エラー:', error);
    res.status(500).json({ error: '宛先テンプレートの作成に失敗しました' });
  }
});

/**
 * 宛先テンプレート更新
 * PUT /api/document-recipients/:id
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      template_name,
      recipient_type,
      company_name,
      postal_code,
      address,
      contact_person,
      department,
      phone,
      email,
      notes,
      is_favorite
    } = req.body;

    // 既存データ取得
    const { data: existing, error: fetchError } = await supabase
      .from('document_recipients')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: '宛先テンプレートが見つかりません' });
    }

    // 権限チェック
    if (existing.user_id && existing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '編集権限がありません' });
    }

    // 更新データ
    const updates = {
      template_name,
      recipient_type,
      company_name,
      postal_code,
      address,
      contact_person,
      department,
      phone,
      email,
      notes,
      is_favorite
    };

    const { data, error } = await supabase
      .from('document_recipients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('宛先テンプレート更新エラー:', error);
      return res.status(500).json({ error: '宛先テンプレートの更新に失敗しました' });
    }

    res.json(data);

  } catch (error) {
    console.error('宛先テンプレート更新エラー:', error);
    res.status(500).json({ error: '宛先テンプレートの更新に失敗しました' });
  }
});

/**
 * 宛先テンプレート削除
 * DELETE /api/document-recipients/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 既存データ取得
    const { data: existing, error: fetchError } = await supabase
      .from('document_recipients')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: '宛先テンプレートが見つかりません' });
    }

    // 権限チェック
    if (existing.user_id && existing.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '削除権限がありません' });
    }

    const { error } = await supabase
      .from('document_recipients')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('宛先テンプレート削除エラー:', error);
      return res.status(500).json({ error: '宛先テンプレートの削除に失敗しました' });
    }

    res.json({ message: '宛先テンプレートを削除しました' });

  } catch (error) {
    console.error('宛先テンプレート削除エラー:', error);
    res.status(500).json({ error: '宛先テンプレートの削除に失敗しました' });
  }
});

/**
 * 使用回数の記録
 * POST /api/document-recipients/:id/use
 */
router.post('/:id/use', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // まず現在の値を取得
    const { data: current, error: fetchError } = await supabase
      .from('document_recipients')
      .select('use_count')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('使用回数取得エラー:', fetchError);
      return res.status(500).json({ error: '使用回数の更新に失敗しました' });
    }

    // 使用回数をインクリメント、最終使用日時を更新
    const { data, error } = await supabase
      .from('document_recipients')
      .update({
        use_count: (current.use_count || 0) + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('使用回数更新エラー:', error);
      return res.status(500).json({ error: '使用回数の更新に失敗しました' });
    }

    res.json(data);

  } catch (error) {
    console.error('使用回数更新エラー:', error);
    res.status(500).json({ error: '使用回数の更新に失敗しました' });
  }
});

module.exports = router;
