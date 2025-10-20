/**
 * 監査ログミドルウェア
 */

const { supabase } = require('../config/supabase');

/**
 * 監査ログを記録
 */
async function createAuditLog({
  userId,
  userEmail,
  userRole,
  ipAddress,
  userAgent,
  action,
  resourceType,
  resourceId = null,
  description = '',
  changes = null,
  metadata = null,
  status = 'success',
  errorMessage = null
}) {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: userId,
        user_email: userEmail,
        user_role: userRole,
        ip_address: ipAddress,
        user_agent: userAgent,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        description,
        changes,
        metadata,
        status,
        error_message: errorMessage
      });

    if (error) {
      console.error('Failed to create audit log:', error);
    }
  } catch (error) {
    console.error('Audit log error:', error);
    // 監査ログ記録失敗はシステム全体を止めない
  }
}

/**
 * Express ミドルウェア: レスポンス後に監査ログを記録
 */
function auditLogMiddleware(action, resourceType) {
  return (req, res, next) => {
    // オリジナルのjsonメソッドを保存
    const originalJson = res.json;

    // jsonメソッドをオーバーライド
    res.json = function(data) {
      // レスポンス後に監査ログを記録
      setImmediate(async () => {
        try {
          const user = req.user;
          const ipAddress = req.ip || req.connection.remoteAddress;
          const userAgent = req.get('user-agent');

          // リソースIDを取得（パラメータまたはレスポンスから）
          const resourceId = req.params.id || req.body.id || data?.data?.id;

          // ステータスを判定
          const status = data?.success === false || data?.error ? 'failure' : 'success';
          const errorMessage = data?.message || data?.error;

          // 変更内容を記録（updateの場合）
          let changes = null;
          if (action === 'update' && req.body) {
            changes = {
              after: req.body
            };
          }

          await createAuditLog({
            userId: user?.id || user?.userId,
            userEmail: user?.email,
            userRole: user?.role,
            ipAddress,
            userAgent,
            action,
            resourceType,
            resourceId,
            description: `${action} ${resourceType}`,
            changes,
            metadata: {
              method: req.method,
              path: req.path,
              query: req.query
            },
            status,
            errorMessage: status === 'failure' ? errorMessage : null
          });
        } catch (error) {
          console.error('Audit log middleware error:', error);
        }
      });

      // オリジナルのjsonメソッドを呼び出し
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * ログイン成功時の監査ログ
 */
async function logLogin(user, req, success = true) {
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent');

  await createAuditLog({
    userId: success ? user.id : null,
    userEmail: user.email || req.body.email,
    userRole: user.role,
    ipAddress,
    userAgent,
    action: 'login',
    resourceType: 'authentication',
    description: success ? 'ログイン成功' : 'ログイン失敗',
    status: success ? 'success' : 'failure',
    errorMessage: success ? null : 'Invalid credentials'
  });
}

/**
 * ログアウト時の監査ログ
 */
async function logLogout(user, req) {
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent');

  await createAuditLog({
    userId: user.id || user.userId,
    userEmail: user.email,
    userRole: user.role,
    ipAddress,
    userAgent,
    action: 'logout',
    resourceType: 'authentication',
    description: 'ログアウト',
    status: 'success'
  });
}

/**
 * データエクスポート時の監査ログ
 */
async function logExport(user, req, resourceType, recordCount) {
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent');

  await createAuditLog({
    userId: user.id || user.userId,
    userEmail: user.email,
    userRole: user.role,
    ipAddress,
    userAgent,
    action: 'export',
    resourceType,
    description: `${resourceType} データエクスポート`,
    metadata: {
      recordCount,
      format: req.query.format || 'csv'
    },
    status: 'success'
  });
}

module.exports = {
  createAuditLog,
  auditLogMiddleware,
  logLogin,
  logLogout,
  logExport
};
