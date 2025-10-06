/**
 * 代理店管理API
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { supabase } = require('../config/supabase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generateAgencyCode } = require('../utils/generateCode');
const emailService = require('../services/emailService');
const { agencyCreationRateLimit } = require('../middleware/rateLimiter');
const { validateAge, validateDateFormat } = require('../utils/ageValidator');
const { Parser } = require('json2csv');

/**
 * GET /api/agencies
 * 代理店一覧取得
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    let data;

    // 代理店ユーザーの場合は自分と全傘下代理店を表示
    if (req.user.role === 'agency' && req.user.agency) {
      // 傘下の代理店IDを全て取得する再帰関数
      const getSubordinateAgencyIds = async (parentId, level = 0) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id, company_name, tier_level, status, agency_code, contact_email, created_at')
          .eq('parent_agency_id', parentId);

        if (!children || children.length === 0) {
          return [];
        }

        // 階層レベルを追加
        const childrenWithLevel = children.map(child => ({
          ...child,
          hierarchy_level: level + 1
        }));

        let allAgencies = [...childrenWithLevel];
        for (const child of children) {
          const grandChildren = await getSubordinateAgencyIds(child.id, level + 1);
          allAgencies = allAgencies.concat(grandChildren);
        }
        return allAgencies;
      };

      // 自分の情報を取得
      const { data: ownAgency } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', req.user.agency.id)
        .single();

      if (ownAgency) {
        ownAgency.hierarchy_level = 0; // 自分は階層レベル0
      }

      // 全傘下代理店を取得
      const subordinateAgencies = await getSubordinateAgencyIds(req.user.agency.id);

      // 自分と傘下代理店を結合
      data = ownAgency ? [ownAgency, ...subordinateAgencies] : subordinateAgencies;

      // 親代理店名を追加
      for (let agency of data) {
        if (agency.parent_agency_id) {
          const { data: parentAgency } = await supabase
            .from('agencies')
            .select('company_name')
            .eq('id', agency.parent_agency_id)
            .single();

          if (parentAgency) {
            agency.parent_agency_name = parentAgency.company_name;
          }
        }
      }
    } else {
      // 管理者の場合は全代理店を取得
      const { data: agencies, error } = await supabase
        .from('agencies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      data = agencies || [];

      // 親代理店名を追加
      for (let agency of data) {
        if (agency.parent_agency_id) {
          const { data: parentAgency } = await supabase
            .from('agencies')
            .select('company_name')
            .eq('id', agency.parent_agency_id)
            .single();

          if (parentAgency) {
            agency.parent_agency_name = parentAgency.company_name;
          }
        }
      }
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get agencies error:', error);
    res.status(500).json({
      error: true,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * POST /api/agencies
 * 代理店作成
 */
router.post('/',
  authenticateToken,
  agencyCreationRateLimit,  // レート制限を追加
  [
    body('company_name').notEmpty().withMessage('会社名は必須です'),
    body('company_type').isIn(['法人', '個人']).withMessage('会社種別が不正です'),
    body('representative_name').notEmpty().withMessage('代表者名は必須です'),
    body('contact_email').isEmail().withMessage('有効なメールアドレスを入力してください'),
    body('tier_level').isInt({ min: 1, max: 4 }).withMessage('階層レベルは1-4で指定してください')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: true,
          message: errors.array()[0].msg
        });
      }

      const {
        company_name,
        company_type,
        representative_name,
        contact_email,
        contact_phone,
        tier_level,
        parent_agency_id,
        address,
        birth_date,
        invoice_registered
      } = req.body;

      // 生年月日による年齢確認（代表者が18歳以上であることを確認）
      if (birth_date) {
        if (!validateDateFormat(birth_date)) {
          return res.status(400).json({
            error: true,
            message: '生年月日の形式が正しくありません（YYYY-MM-DD形式で入力してください）'
          });
        }

        const ageValidation = validateAge(birth_date);
        if (!ageValidation.isValid) {
          return res.status(400).json({
            error: true,
            message: ageValidation.message
          });
        }
      }

      // 権限チェック：代理店ユーザーの場合は制限を適用
      if (req.user.role === 'agency') {
        if (!req.user.agency) {
          return res.status(403).json({
            error: true,
            message: '代理店情報が見つかりません'
          });
        }

        // 代理店ユーザーは自分の階層+1のみ作成可能
        const allowedTier = req.user.agency.tier_level + 1;
        if (tier_level !== allowedTier) {
          return res.status(403).json({
            error: true,
            message: `Tier${allowedTier}の代理店のみ作成可能です`
          });
        }

        // parent_agency_idを自動設定（代理店ユーザーは必ず自分が親になる）
        req.body.parent_agency_id = req.user.agency.id;
      }

      // 親代理店の階層チェック
      if (parent_agency_id) {
        const { data: parentAgency } = await supabase
          .from('agencies')
          .select('tier_level')
          .eq('id', parent_agency_id)
          .single();

        if (parentAgency && tier_level !== parentAgency.tier_level + 1) {
          return res.status(400).json({
            error: true,
            message: '階層レベルが不正です'
          });
        }

        // Tier別の子代理店数制限チェック
        const tierLimits = {
          1: 100,  // Tier1が作れるTier2: 最大100社
          2: 50,   // Tier2が作れるTier3: 各50社まで
          3: 30,   // Tier3が作れるTier4: 各30社まで
          4: 0     // Tier4: 子代理店作成不可
        };

        const parentTier = parentAgency.tier_level;
        const maxChildren = tierLimits[parentTier];

        if (maxChildren) {
          // 親代理店が既に持っている子代理店数をカウント
          const { count: childCount, error: countError } = await supabase
            .from('agencies')
            .select('*', { count: 'exact', head: true })
            .eq('parent_agency_id', parent_agency_id)
            .eq('status', 'active');  // アクティブな代理店のみカウント

          if (countError) throw countError;

          if (childCount >= maxChildren) {
            return res.status(400).json({
              error: true,
              message: `Tier${parentTier}の代理店は最大${maxChildren}社までしか子代理店を作成できません（現在: ${childCount}社）`
            });
          }
        }

        // Tier4は子代理店を作成できない
        if (parentTier === 4) {
          return res.status(400).json({
            error: true,
            message: 'Tier4の代理店は子代理店を作成できません'
          });
        }
      }

      // 代理店コードを生成
      const agency_code = await generateAgencyCode();

      // 代理店作成用データを構築
      const insertData = {
        agency_code,
        company_name,
        company_type: company_type || '法人',
        representative_name,
        contact_email,
        email: contact_email,  // 1代理店1ユーザー方式
        contact_phone,
        address,
        tier_level,
        status: req.user.role === 'admin' ? 'active' : 'pending'  // 管理者が作成する場合は即座にアクティブ、それ以外は承認待ち
      };

      // オプショナルフィールドは値がある場合のみ含める
      if (req.body.parent_agency_id || parent_agency_id) {
        insertData.parent_agency_id = req.body.parent_agency_id || parent_agency_id;
      }

      if (req.body.birth_date) {
        insertData.birth_date = req.body.birth_date;
      }

      if (req.body.bank_account) {
        insertData.bank_account = req.body.bank_account;
      }

      if (req.body.tax_info) {
        insertData.tax_info = req.body.tax_info;
      }

      if (req.body.invoice_registered !== undefined) {
        insertData.invoice_registered = req.body.invoice_registered;
      }

      // 代理店作成
      const { data, error } = await supabase
        .from('agencies')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // メール送信（管理者が作成した場合は承認メール、それ以外は申請受付メール）
      if (req.user.role === 'admin') {
        // 管理者が直接作成した場合は、パスワード設定トークンを生成して承認メールを送信
        const crypto = require('crypto');
        const passwordResetToken = crypto.randomBytes(32).toString('hex');
        const passwordResetExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // トークンを保存
        await supabase
          .from('agencies')
          .update({
            password_reset_token: passwordResetToken,
            password_reset_expiry: passwordResetExpiry
          })
          .eq('id', data.id);

        // 承認メール送信
        await emailService.sendAgencyApprovedEmail({
          ...data,
          passwordResetToken
        });
      } else {
        // 代理店ユーザーが作成した場合は申請受付メール
        await emailService.sendWelcomeEmail({
          email: contact_email,
          company_name,
          agency_code
        });
      }

      res.status(201).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Create agency error:', error);
      res.status(500).json({
        error: true,
        message: 'データの作成に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/agencies/:id/approve
 * 代理店承認（管理者のみ）
 */
router.put('/:id/approve',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 現在のステータスを確認
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('status')
        .eq('id', id)
        .single();

      if (!currentAgency) {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }

      if (currentAgency.status !== 'pending') {
        return res.status(400).json({
          error: true,
          message: '承認待ちの代理店ではありません'
        });
      }

      // パスワード設定トークンを生成（24時間有効）
      const crypto = require('crypto');
      const passwordResetToken = crypto.randomBytes(32).toString('hex');
      const passwordResetExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'active',
          password_reset_token: passwordResetToken,
          password_reset_expiry: passwordResetExpiry
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // 承認通知メールを送信（トークンを含む）
      emailService.sendAgencyApprovedEmail({ ...data, passwordResetToken })
        .then(result => {
          console.log('承認メール送信:', result);
        })
        .catch(err => {
          console.error('承認メール送信エラー:', err);
        });

      res.json({
        success: true,
        data,
        message: '代理店を承認しました'
      });
    } catch (error) {
      console.error('Approve agency error:', error);
      res.status(500).json({
        error: true,
        message: '承認処理に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/agencies/:id/reject
 * 代理店拒否（管理者のみ）
 */
router.put('/:id/reject',
  authenticateToken,
  requireAdmin,
  [
    body('rejection_reason').notEmpty().withMessage('拒否理由は必須です')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: true,
          message: errors.array()[0].msg
        });
      }

      const { id } = req.params;
      const { rejection_reason } = req.body;

      // 現在のステータスを確認
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('status')
        .eq('id', id)
        .single();

      if (!currentAgency) {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }

      if (currentAgency.status !== 'pending') {
        return res.status(400).json({
          error: true,
          message: '承認待ちの代理店ではありません'
        });
      }

      // rejectedステータスは存在しないため、suspendedを使用
      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'suspended',
          metadata: {
            ...((await supabase.from('agencies').select('metadata').eq('id', id).single()).data?.metadata || {}),
            rejection_reason: rejection_reason,
            rejected_at: new Date().toISOString(),
            rejected_by: req.user.id
          }
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // 却下通知メールを送信
      emailService.sendAgencyRejectedEmail(data, rejection_reason)
        .then(result => {
          console.log('却下メール送信:', result);
        })
        .catch(err => {
          console.error('却下メール送信エラー:', err);
        });

      res.json({
        success: true,
        data,
        message: '代理店を拒否しました'
      });
    } catch (error) {
      console.error('Reject agency error:', error);
      res.status(500).json({
        error: true,
        message: '拒否処理に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/agencies/:id/reactivate
 * 代理店再有効化（管理者のみ）
 */
router.put('/:id/reactivate',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 現在のステータスを確認
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('status, metadata')
        .eq('id', id)
        .single();

      if (!currentAgency) {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }

      if (currentAgency.status !== 'suspended') {
        return res.status(400).json({
          error: true,
          message: '停止中の代理店ではありません'
        });
      }

      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'active',
          metadata: {
            ...(currentAgency?.metadata || {}),
            reactivated_at: new Date().toISOString(),
            reactivated_by: req.user.id
          }
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data,
        message: '代理店を再有効化しました'
      });
    } catch (error) {
      console.error('Reactivate agency error:', error);
      res.status(500).json({
        error: true,
        message: '再有効化に失敗しました'
      });
    }
  }
);

/**
 * PUT /api/agencies/:id/suspend
 * 代理店停止（管理者のみ）
 */
router.put('/:id/suspend',
  authenticateToken,
  requireAdmin,
  [
    body('suspension_reason').notEmpty().withMessage('停止理由は必須です')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: true,
          message: errors.array()[0].msg
        });
      }

      const { id } = req.params;
      const { suspension_reason } = req.body;

      console.log('Suspend agency attempt:', { id, suspension_reason });

      // 既存のmetadataを取得
      const { data: currentAgency } = await supabase
        .from('agencies')
        .select('metadata')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('agencies')
        .update({
          status: 'suspended',
          metadata: {
            ...(currentAgency?.metadata || {}),
            suspension_reason: suspension_reason,
            suspended_at: new Date().toISOString(),
            suspended_by: req.user.id
          }
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Suspend agency DB error detail:', error);
        throw error;
      }

      console.log('Suspend agency success:', data);

      // 停止通知メールを送信（非同期で実行）
      emailService.sendAgencySuspendedEmail(data, suspension_reason)
        .then(() => console.log('停止通知メール送信成功'))
        .catch((err) => console.error('停止通知メール送信エラー:', err));

      res.json({
        success: true,
        data,
        message: '代理店を停止しました'
      });
    } catch (error) {
      console.error('Suspend agency error:', error.message, error.details);
      res.status(500).json({
        error: true,
        message: '停止処理に失敗しました'
      });
    }
  }
);

/**
 * GET /api/agencies/export
 * 代理店データCSVエクスポート
 */
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { tier, status } = req.query;

    let query = supabase
      .from('agencies')
      .select(`
        *,
        parent_agencies:parent_agency_id (
          company_name,
          agency_code
        )
      `)
      .order('tier_level', { ascending: true })
      .order('created_at', { ascending: false });

    // フィルター
    if (tier) {
      query = query.eq('tier_level', parseInt(tier));
    }
    if (status) {
      query = query.eq('status', status);
    }

    // 代理店ユーザーの場合は自分と傘下のみ
    if (req.user.role === 'agency' && req.user.agency_id) {
      // 傘下の代理店IDを再帰的に取得
      const getSubordinateIds = async (parentId) => {
        const { data: children } = await supabase
          .from('agencies')
          .select('id')
          .eq('parent_agency_id', parentId);

        let ids = [parentId];
        if (children) {
          for (const child of children) {
            const childIds = await getSubordinateIds(child.id);
            ids = ids.concat(childIds);
          }
        }
        return ids;
      };

      const subordinateIds = await getSubordinateIds(req.user.agency_id);
      query = query.in('id', subordinateIds);
    }

    const { data: agencies, error } = await query;

    if (error) throw error;

    // CSV用にデータを整形
    const csvData = agencies.map(agency => ({
      代理店コード: agency.agency_code,
      会社名: agency.company_name,
      階層: `Tier ${agency.tier_level}`,
      親代理店コード: agency.parent_agencies?.agency_code || '',
      親代理店名: agency.parent_agencies?.company_name || '',
      代表者名: agency.representative_name,
      メールアドレス: agency.contact_email,
      電話番号: agency.contact_phone,
      郵便番号: agency.postal_code,
      住所: agency.address,
      銀行口座: agency.bank_name ? `${agency.bank_name} ${agency.branch_name} ${agency.account_type} ${agency.account_number}` : '',
      状態: agency.status === 'active' ? '有効' :
           agency.status === 'pending' ? '承認待ち' :
           agency.status === 'suspended' ? '停止中' :
           agency.status === 'rejected' ? '却下' : agency.status,
      登録日: agency.created_at
    }));

    // CSVに変換
    const json2csvParser = new Parser({
      fields: ['代理店コード', '会社名', '階層', '親代理店コード', '親代理店名',
               '代表者名', 'メールアドレス', '電話番号', '郵便番号', '住所',
               '銀行口座', '状態', '登録日'],
      withBOM: true
    });
    const csv = json2csvParser.parse(csvData);

    // ファイル名を生成
    const filename = `agencies_${new Date().toISOString().split('T')[0]}.csv`;

    // CSVをダウンロード
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Export agencies error:', error);
    res.status(500).json({
      error: true,
      message: '代理店データのエクスポートに失敗しました'
    });
  }
});

/**
 * GET /api/agencies/:id
 * 代理店詳細取得
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('agencies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }
      throw error;
    }

    // 親代理店の名前を取得
    if (data && data.parent_agency_id) {
      const { data: parentAgency } = await supabase
        .from('agencies')
        .select('company_name')
        .eq('id', data.parent_agency_id)
        .single();

      if (parentAgency) {
        data.parent_agency_name = parentAgency.company_name;
      }
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get agency error:', error);
    res.status(500).json({
      error: true,
      message: 'データの取得に失敗しました'
    });
  }
});

/**
 * PUT /api/agencies/:id
 * 代理店更新
 */
router.put('/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // 権限チェック：代理店ユーザーは自分の代理店のみ編集可能
      if (req.user.role === 'agency') {
        if (!req.user.agency || req.user.agency.id !== id) {
          return res.status(403).json({
            error: true,
            message: '自分の代理店情報のみ編集可能です'
          });
        }
      }

      // 生年月日が更新される場合は年齢確認
      if (updates.birth_date) {
        if (!validateDateFormat(updates.birth_date)) {
          return res.status(400).json({
            error: true,
            message: '生年月日の形式が正しくありません（YYYY-MM-DD形式で入力してください）'
          });
        }

        const ageValidation = validateAge(updates.birth_date);
        if (!ageValidation.isValid) {
          return res.status(400).json({
            error: true,
            message: ageValidation.message
          });
        }
      }

      // 更新可能なフィールドのみ抽出
      const allowedFields = ['company_name', 'company_type', 'representative_name', 'representative_phone', 'birth_date', 'bank_account', 'tax_info', 'invoice_number', 'invoice_registered', 'contact_email', 'contact_phone', 'address'];
      const filteredUpdates = {};

      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          // bank_accountとtax_infoはJSON型なので、適切に処理
          if ((field === 'bank_account' || field === 'tax_info') && updates[field]) {
            // 既にオブジェクトの場合はそのまま、文字列の場合はパース
            if (typeof updates[field] === 'string') {
              try {
                filteredUpdates[field] = JSON.parse(updates[field]);
              } catch (e) {
                console.error(`Failed to parse ${field}:`, e);
                filteredUpdates[field] = null;
              }
            } else {
              filteredUpdates[field] = updates[field];
            }
          } else {
            filteredUpdates[field] = updates[field];
          }
        }
      });

      const { data, error } = await supabase
        .from('agencies')
        .update(filteredUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Update agency error:', error);
      res.status(500).json({
        error: true,
        message: 'データの更新に失敗しました'
      });
    }
  }
);

/**
 * DELETE /api/agencies/:id
 * 代理店削除（管理者のみ）
 */
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      // 代理店の存在確認
      const { data: agency } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', id)
        .single();

      if (!agency) {
        return res.status(404).json({
          error: true,
          message: '代理店が見つかりません'
        });
      }

      // 子代理店の存在確認
      const { data: childAgencies } = await supabase
        .from('agencies')
        .select('id')
        .eq('parent_agency_id', id);

      if (childAgencies && childAgencies.length > 0) {
        return res.status(400).json({
          error: true,
          message: 'この代理店には配下の代理店が存在するため削除できません'
        });
      }

      // 関連する売上データの存在確認
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('agency_id', id)
        .limit(1);

      if (sales && sales.length > 0) {
        return res.status(400).json({
          error: true,
          message: 'この代理店には売上データが存在するため削除できません'
        });
      }

      // 関連する報酬データの存在確認
      const { data: commissions } = await supabase
        .from('commissions')
        .select('id')
        .eq('agency_id', id)
        .limit(1);

      if (commissions && commissions.length > 0) {
        return res.status(400).json({
          error: true,
          message: 'この代理店には報酬データが存在するため削除できません'
        });
      }

      // 代理店を削除
      const { error } = await supabase
        .from('agencies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      res.json({
        success: true,
        message: '代理店を削除しました'
      });
    } catch (error) {
      console.error('Delete agency error:', error);
      res.status(500).json({
        error: true,
        message: '削除処理に失敗しました'
      });
    }
  }
);

/**
 * GET /api/agencies/:id/history
 * 代理店の登録履歴取得
 */
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const agencyId = req.params.id;

    // 権限チェック
    let hasAccess = false;

    // 管理者は全て見れる
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      hasAccess = true;
    }
    // 自分の代理店
    else if (req.user.agency && req.user.agency.id === agencyId) {
      hasAccess = true;
    }
    // 傘下の代理店かチェック
    else if (req.user.agency && req.user.agency.id) {
      // 対象代理店の親チェーンを辿って、自分が親に含まれるか確認
      const { data: targetAgency } = await supabase
        .from('agencies')
        .select('parent_agency_id')
        .eq('id', agencyId)
        .single();

      if (targetAgency) {
        let currentParentId = targetAgency.parent_agency_id;
        while (currentParentId) {
          if (currentParentId === req.user.agency.id) {
            hasAccess = true;
            break;
          }
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
        message: 'この代理店の履歴を閲覧する権限がありません'
      });
    }

    // invitationsテーブルから関連する招待履歴を取得
    // inviter_agency_id: 招待者の代理店ID（この代理店が送信した招待）
    // created_agency_id: 受諾済み招待で作成された代理店ID（この代理店として登録された招待）
    const { data: invitations, error: invitationError } = await supabase
      .from('invitations')
      .select('*')
      .or(`inviter_agency_id.eq.${agencyId},created_agency_id.eq.${agencyId}`)
      .order('created_at', { ascending: false });

    if (invitationError) {
      console.error('Invitation history fetch error:', invitationError);
      return res.status(500).json({
        success: false,
        message: '招待履歴の取得に失敗しました'
      });
    }

    // 代理店の基本登録情報
    const { data: agencyData, error: agencyError } = await supabase
      .from('agencies')
      .select('*')
      .eq('id', agencyId)
      .single();

    if (agencyError) {
      return res.status(404).json({
        success: false,
        message: '代理店が見つかりません'
      });
    }

    // 履歴データを統合・整形
    const history = [];

    // 代理店登録情報を履歴に追加
    history.push({
      type: 'registration',
      date: agencyData.created_at,
      status: agencyData.status,
      description: `代理店登録 (${agencyData.company_name})`,
      details: {
        company_name: agencyData.company_name,
        tier_level: agencyData.tier_level,
        status: agencyData.status
      }
    });

    // 招待履歴を追加
    invitations.forEach(invitation => {
      // invitationsテーブルの実際のカラムに合わせて修正
      const status = invitation.accepted_at ? '受諾済み' : '送信済み';
      const isAccepted = !!invitation.accepted_at;

      history.push({
        type: 'invitation',
        date: invitation.created_at,
        status: status,
        description: `招待${isAccepted ? '受諾' : '送信'} - ${invitation.email}`,
        details: {
          email: invitation.email,
          tier_level: invitation.tier_level,
          token: invitation.token,
          expires_at: invitation.expires_at,
          accepted_at: invitation.accepted_at,
          created_agency_id: invitation.created_agency_id
        }
      });
    });

    // 時系列順にソート
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Agency history fetch error:', error);
    res.status(500).json({
      success: false,
      message: '履歴の取得に失敗しました'
    });
  }
});

module.exports = router;