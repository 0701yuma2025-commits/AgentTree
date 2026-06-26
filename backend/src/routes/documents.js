const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../config/supabase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getSubordinateAgencyIds } = require('../utils/agencyHelpers');
const { v4: uuidv4 } = require('uuid');
const { createModuleLogger } = require('../config/logger');
const logger = createModuleLogger('documents');

// Supabase Storageのバケット名
const STORAGE_BUCKET = 'documents';
// 署名URLの有効期限（秒）。短命にして恒久取得を防ぐ。
const SIGNED_URL_EXPIRES_IN = 300; // 5分

// ⚠️ 手動作業（コードでは行わない）:
//   Supabaseダッシュボードで 'documents' バケットを Private に設定すること。
//   private化しないと、過去に発行されたpublic URLや直URLで認証なしに取得できてしまう。
//   このコードはバケットがprivateである前提で署名URLを生成する（人間がダッシュボードで設定）。

/**
 * 保存値(file_url)からストレージ内のパス(キー)を抽出する後方互換ヘルパー。
 * - 既存レコード: file_url に完全なpublic URLが入っている
 * - 新規レコード: file_url にストレージパス(例 "<agencyId>/<uuid>_xxx.pdf") が入っている
 * どちらの形式でも正しいパスを返す。
 *
 * @param {string} storedValue file_url の保存値
 * @returns {string|null} ストレージパス。抽出できなければ null
 */
function extractStoragePath(storedValue) {
  if (!storedValue || typeof storedValue !== 'string') {
    return null;
  }

  // パスがそのまま保存されているケース（http(s)で始まらない）
  if (!/^https?:\/\//i.test(storedValue)) {
    // 念のため先頭スラッシュを除去
    return storedValue.replace(/^\/+/, '');
  }

  // 完全URLのケース。Supabaseのpublic URLは
  //   .../storage/v1/object/public/<bucket>/<path...>
  // という形式。バケット名以降をパスとして抽出する。
  const marker = `/${STORAGE_BUCKET}/`;
  const idx = storedValue.indexOf(marker);
  if (idx !== -1) {
    let path = storedValue.substring(idx + marker.length);
    // クエリ文字列やフラグメントを除去
    path = path.split('?')[0].split('#')[0];
    return decodeURIComponent(path);
  }

  // フォールバック: 従来の削除ロジックと同じく末尾2セグメントを使う
  // （アップロードパスが "<agencyId>/<filename>" の2階層であるため）
  try {
    const tail = storedValue.split('?')[0].split('#')[0].split('/').slice(-2).join('/');
    return decodeURIComponent(tail);
  } catch (e) {
    return null;
  }
}

/**
 * file_url の保存値から短命の署名URLを生成する。
 * 失敗した場合は null を返す（呼び出し側で握りつぶしてレコードは返す）。
 *
 * @param {string} storedValue file_url の保存値
 * @returns {Promise<string|null>} 署名URL
 */
async function buildSignedUrl(storedValue) {
  const path = extractStoragePath(storedValue);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_IN);

  if (error || !data?.signedUrl) {
    logger.error('Create signed URL error:', error?.message || 'no signedUrl returned');
    return null;
  }
  return data.signedUrl;
}

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
    if (req.user.role === 'admin') {
      hasAccess = true;
    }
    // 自分の代理店
    else if (req.user.agency?.id === agencyId) {
      hasAccess = true;
    }
    // 傘下の代理店かチェック（キャッシュ付き1クエリ、N+1なし）
    else if (req.user.agency?.id) {
      const subordinateIds = await getSubordinateAgencyIds(req.user.agency.id);
      hasAccess = subordinateIds.includes(agencyId);
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

    const documents = data || [];

    // 各レコードについて、保存されたパス(または旧形式の完全URL)から
    // 短命の署名URLを生成して file_url を差し替える。
    // 件数が多すぎる懸念: 1代理店あたりの書類数は通常少数（数件〜数十件）のため
    // ここでの署名URL一括生成は問題にならない見込み。
    // 大量件数が想定されるようになった場合は createSignedUrls(複数版) で
    // バケット内パスをまとめて署名する最適化を検討すること。
    await Promise.all(
      documents.map(async (doc) => {
        try {
          const signedUrl = await buildSignedUrl(doc.file_url);
          if (signedUrl) {
            doc.file_url = signedUrl;
          }
          // 署名URL生成に失敗した場合は元の値を残す（後方互換: 旧public URLは依然有効な場合がある）
        } catch (e) {
          logger.error('Sign document url error:', e.message);
        }
      })
    );

    res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    logger.error('Get documents error:', error.message);
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
      .from(STORAGE_BUCKET)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype
      });

    if (uploadError) throw uploadError;

    // public URLは保存しない（恒久取得を防ぐため）。
    // ストレージのパス(キー)を file_url に保存し、読み取り時に短命の署名URLを生成する。
    // ※ 専用カラムは存在しないため、既存スキーマの file_url にパスを保存する。
    const storagePath = uploadData?.path || fileName;

    // 署名URLを生成してアップロード直後のレスポンスにも返す（一覧と同じ短命URL）。
    const signedUrl = await buildSignedUrl(storagePath);

    // データベースに書類情報を保存
    const { data: documentData, error: dbError } = await supabase
      .from('agency_documents')
      .insert([{
        agency_id: agency_id,
        document_type: document_type,
        document_name: req.file.originalname,
        file_url: storagePath,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        status: 'pending',
        uploaded_by: req.user.id
      }])
      .select()
      .single();

    if (dbError) throw dbError;

    // レスポンスでは file_url を短命の署名URLに差し替えて返す
    // （DBにはパスが保存されているが、クライアントは即時に使えるURLを期待するため）。
    const responseData = { ...documentData };
    if (signedUrl) {
      responseData.file_url = signedUrl;
    }

    res.json({
      success: true,
      message: '書類がアップロードされました',
      data: responseData
    });
  } catch (error) {
    logger.error('Upload document error:', error.message);
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
    logger.error('Verify document error:', error.message);
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
    // 完全URL/パスのどちらでも正しくパス抽出できる後方互換ヘルパーを使用。
    const filePath = extractStoragePath(document.file_url);
    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);

      if (storageError) logger.error('Storage deletion error:', storageError.message);
    } else {
      logger.error('Storage deletion skipped: could not resolve path from', document.file_url);
    }

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
    logger.error('Delete document error:', error.message);
    res.status(500).json({
      success: false,
      message: '書類削除に失敗しました'
    });
  }
});

module.exports = router;