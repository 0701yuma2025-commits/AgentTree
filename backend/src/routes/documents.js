const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../config/supabase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Multerの設定（メモリストレージ使用）
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB制限
  },
  fileFilter: (req, file, cb) => {
    // 許可するファイルタイプ
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です'));
    }
  }
});

/**
 * GET /api/documents/:agencyId
 * 代理店の書類一覧取得
 */
router.get('/:agencyId', authenticateToken, async (req, res) => {
  try {
    const { agencyId } = req.params;

    // アクセス権限チェック
    let hasAccess = false;

    // 管理者は全て見れる
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      hasAccess = true;
    }
    // 自分の代理店
    else if (req.user.agency?.id === agencyId) {
      hasAccess = true;
    }
    // 傘下の代理店かチェック（子、孫、ひ孫...全て）
    else if (req.user.agency?.id) {
      // 対象代理店の親チェーンを取得して、自分が親に含まれるか確認
      const { data: targetAgency } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', agencyId)
        .single();

      if (targetAgency) {
        // 親を辿って自分が見つかるかチェック
        let currentParentId = targetAgency.parent_agency_id;
        while (currentParentId) {
          if (currentParentId === req.user.agency?.id) {
            hasAccess = true;
            break;
          }
          // さらに上の親を取得
          const { data: parentAgency } = await supabase
            .from('agencies')
            .select('parent_agency_id')
            .eq('id', currentParentId)
            .single();

          currentParentId = parentAgency?.parent_agency_id;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'アクセス権限がありません'
      });
    }

    const { data, error } = await supabase
      .from('agency_documents')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'ドキュメント一覧の取得に失敗しました'
    });
  }
});

/**
 * POST /api/documents/upload
 * 書類アップロード
 */
router.post('/upload', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'ファイルがアップロードされていません'
      });
    }

    const { agency_id, document_type } = req.body;

    // 自分の代理店の書類のみアップロード可能
    if (req.user.agency?.id !== agency_id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'アクセス権限がありません'
      });
    }

    // 日本語ファイル名を安全な形式に変換
    const sanitizedFilename = Buffer.from(req.file.originalname, 'utf8')
      .toString('base64')
      .replace(/[+/=]/g, '') // URLセーフな文字に変換
      .substring(0, 50); // 長さを制限

    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${agency_id}/${uuidv4()}_${sanitizedFilename}.${fileExtension}`;

    // Supabase Storageにファイルをアップロード
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype
      });

    if (uploadError) throw uploadError;

    // ファイルのURLを取得
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName);

    // データベースに書類情報を保存
    const { data: documentData, error: dbError } = await supabase
      .from('agency_documents')
      .insert([{
        agency_id: agency_id,
        document_type: document_type,
        document_name: req.file.originalname,
        file_url: urlData.publicUrl,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        status: 'pending',
        uploaded_by: req.user.id
      }])
      .select()
      .single();

    if (dbError) throw dbError;

    res.json({
      success: true,
      message: '書類がアップロードされました',
      data: documentData
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      message: 'ファイルアップロードに失敗しました'
    });
  }
});

/**
 * PUT /api/documents/:id/verify
 * 書類確認（管理者のみ）
 */
router.put('/:id/verify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '無効なステータスです'
      });
    }

    const updateData = {
      status: status,
      verified_by: req.user.id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (status === 'rejected' && rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    const { data, error } = await supabase
      .from('agency_documents')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: status === 'verified' ? '書類を承認しました' : '書類を却下しました',
      data
    });
  } catch (error) {
    console.error('Verify document error:', error);
    res.status(500).json({
      success: false,
      message: '書類確認に失敗しました'
    });
  }
});

/**
 * DELETE /api/documents/:id
 * 書類削除
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 書類情報を取得
    const { data: document, error: fetchError } = await supabase
      .from('agency_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!document) {
      return res.status(404).json({
        success: false,
        message: '書類が見つかりません'
      });
    }

    // 権限チェック
    if (req.user.agency?.id !== document.agency_id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'アクセス権限がありません'
      });
    }

    // Storageからファイルを削除
    const filePath = document.file_url.split('/').slice(-2).join('/');
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([filePath]);

    if (storageError) console.error('Storage deletion error:', storageError);

    // データベースから削除
    const { error: deleteError } = await supabase
      .from('agency_documents')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: '書類を削除しました'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: '書類削除に失敗しました'
    });
  }
});

module.exports = router;