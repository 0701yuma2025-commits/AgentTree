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
const { getSubordinateAgenciesWithDetails } = require('../utils/agencyHelpers');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

// サブルーターマウント
router.use('/', require('./agencies/status'));
router.use('/', require('./agencies/export-history'));

/**
 * GET /api/agencies
 * 代理店一覧取得
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    let data;

    // 代理店ユーザーの場合は自分と全傘下代理店を表示
    if (req.user.role === 'agency' && req.user.agency) {
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
      const subordinateAgencies = await getSubordinateAgenciesWithDetails(req.user.agency.id);

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
      // 管理者の場合はページネーション付きで取得
      const { page, limit, offset } = parsePagination(req.query);

      const { data: agencies, error, count } = await supabase
        .from('agencies')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      data = agencies || [];

      // 親代理店名を一括取得（N+1解消）
      const parentIds = [...new Set(data.filter(a => a.parent_agency_id).map(a => a.parent_agency_id))];
      if (parentIds.length > 0) {
        const { data: parents } = await supabase
          .from('agencies')
          .select('id, company_name')
          .in('id', parentIds);

        if (parents) {
          const parentMap = {};
          parents.forEach(p => { parentMap[p.id] = p.company_name; });
          data.forEach(a => {
            if (a.parent_agency_id && parentMap[a.parent_agency_id]) {
              a.parent_agency_name = parentMap[a.parent_agency_id];
            }
          });
        }
      }

      return res.json(paginatedResponse(data, count || 0, { page, limit }));
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get agencies error:', error);
    res.status(500).json({
      success: false,
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
          success: false,
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
            success: false,
            message: '生年月日の形式が正しくありません（YYYY-MM-DD形式で入力してください）'
          });
        }

        const ageValidation = validateAge(birth_date);
        if (!ageValidation.isValid) {
          return res.status(400).json({
            success: false,
            message: ageValidation.message
          });
        }
      }

      // 権限チェック：代理店ユーザーの場合は制限を適用
      if (req.user.role === 'agency') {
        if (!req.user.agency) {
          return res.status(403).json({
            success: false,
            message: '代理店情報が見つかりません'
          });
        }

        // 代理店ユーザーは自分の階層+1のみ作成可能
        const allowedTier = req.user.agency.tier_level + 1;
        if (tier_level !== allowedTier) {
          return res.status(403).json({
            success: false,
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
            success: false,
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
              success: false,
              message: `Tier${parentTier}の代理店は最大${maxChildren}社までしか子代理店を作成できません（現在: ${childCount}社）`
            });
          }
        }

        // Tier4は子代理店を作成できない
        if (parentTier === 4) {
          return res.status(400).json({
            success: false,
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
        success: false,
        message: 'データの作成に失敗しました'
      });
    }
  }
);

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
          success: false,
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
      success: false,
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
            success: false,
            message: '自分の代理店情報のみ編集可能です'
          });
        }
      }

      // 生年月日が更新される場合は年齢確認
      if (updates.birth_date) {
        if (!validateDateFormat(updates.birth_date)) {
          return res.status(400).json({
            success: false,
            message: '生年月日の形式が正しくありません（YYYY-MM-DD形式で入力してください）'
          });
        }

        const ageValidation = validateAge(updates.birth_date);
        if (!ageValidation.isValid) {
          return res.status(400).json({
            success: false,
            message: ageValidation.message
          });
        }
      }

      // 更新可能なフィールドのみ抽出
      const allowedFields = ['company_name', 'company_type', 'representative_name', 'representative_phone', 'birth_date', 'bank_account', 'tax_info', 'invoice_number', 'invoice_registered', 'contact_email', 'contact_phone', 'postal_code', 'address'];
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
        success: false,
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
          success: false,
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
          success: false,
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
          success: false,
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
          success: false,
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
        success: false,
        message: '削除処理に失敗しました'
      });
    }
  }
);

module.exports = router;