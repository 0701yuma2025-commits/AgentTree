/**
 * メール通知サービス
 * Resendを使用した自動メール送信
 */

const { Resend } = require('resend');
const { createModuleLogger } = require('../config/logger');
const logger = createModuleLogger('emailService');

class EmailService {
  constructor() {
    // Resend APIクライアントを初期化
    this.resend = new Resend(process.env.RESEND_API_KEY);

    // 送信元メールアドレス
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@agency-system.com';
    this.fromName = process.env.EMAIL_FROM_NAME || '営業代理店管理システム';

    // 開発環境では実際にメールを送信しない
    if (process.env.NODE_ENV === 'development' && !process.env.ENABLE_EMAIL) {
      this.isDevelopment = true;
    }
  }

  /**
   * メール送信（基本メソッド）
   */
  async sendMail({ to, subject, html, text }) {
    if (this.isDevelopment) {
      const recipient = Array.isArray(to) ? to.map(this.maskEmail).join(', ') : this.maskEmail(to);
      logger.info('📧 [開発環境] メール送信をシミュレート:');
      logger.info('  To:', recipient);
      logger.info('  Subject:', subject);
      return { success: true, messageId: 'dev-' + Date.now() };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || this.stripHtml(html)
      });

      if (error) {
        logger.error('❌ Resend エラー:', error.message);
        return { success: false, error: error.message };
      }

      logger.info('✅ メール送信成功:', data.id);
      return { success: true, messageId: data.id };
    } catch (error) {
      logger.error('❌ メール送信エラー:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 新規代理店登録通知
   */
  async sendWelcomeEmail(agencyData) {
    const { email, company_name, agency_code } = agencyData;

    const subject = '代理店登録完了のお知らせ';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Hiragino Sans', sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3B82F6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { text-align: center; padding: 10px; color: #666; }
          .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #3B82F6;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>代理店登録完了</h1>
          </div>
          <div class="content">
            <h2>${company_name} 様</h2>
            <p>この度は代理店登録をいただき、誠にありがとうございます。</p>
            <p>あなたの代理店コード: <strong>${agency_code}</strong></p>

            <div style="background: #fff3cd; padding: 15px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <p><strong>📋 現在、管理者による審査中です</strong></p>
              <p>審査が完了次第、メールにてご連絡いたします。</p>
              <p>通常、1〜3営業日以内に審査結果をお知らせいたします。</p>
            </div>

            <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Agency Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: email, subject, html });
  }

  /**
   * 売上通知メール
   */
  async sendSalesNotification(saleData, agencyEmail) {
    const { sale_number, product_name, sale_amount, commission_amount } = saleData;

    const subject = `新規売上登録のお知らせ [売上番号: ${sale_number}]`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Hiragino Sans', sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .table th { background-color: #f0f0f0; }
          .footer { text-align: center; padding: 10px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>売上登録通知</h1>
          </div>
          <div class="content">
            <p>新しい売上が登録されました。</p>
            <table class="table">
              <tr>
                <th>売上番号</th>
                <td>${sale_number}</td>
              </tr>
              <tr>
                <th>商品名</th>
                <td>${product_name}</td>
              </tr>
              <tr>
                <th>売上金額</th>
                <td>¥${sale_amount.toLocaleString()}</td>
              </tr>
              <tr>
                <th>報酬予定額</th>
                <td>¥${commission_amount.toLocaleString()}</td>
              </tr>
            </table>
            <p>詳細は管理画面でご確認ください。</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Agency Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: agencyEmail, subject, html });
  }

  /**
   * 報酬確定通知メール
   */
  async sendCommissionConfirmation(commissionData, agencyEmail) {
    const { month, total_sales, total_commission, tier_bonus } = commissionData;

    const subject = `${month} 報酬確定のお知らせ`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Hiragino Sans', sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #8B5CF6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .highlight { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .table th { background-color: #f0f0f0; }
          .footer { text-align: center; padding: 10px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>報酬確定通知</h1>
          </div>
          <div class="content">
            <p>${month}の報酬が確定しました。</p>
            <table class="table">
              <tr>
                <th>総売上額</th>
                <td>¥${total_sales.toLocaleString()}</td>
              </tr>
              <tr>
                <th>基本報酬</th>
                <td>¥${total_commission.toLocaleString()}</td>
              </tr>
              <tr>
                <th>階層ボーナス</th>
                <td>¥${tier_bonus.toLocaleString()}</td>
              </tr>
              <tr>
                <th><strong>合計報酬額</strong></th>
                <td><strong>¥${(total_commission + tier_bonus).toLocaleString()}</strong></td>
              </tr>
            </table>
            <div class="highlight">
              <p><strong>振込予定日:</strong> ${this.getPaymentDate()}</p>
              <p>請求書は管理画面からダウンロードできます。</p>
            </div>
          </div>
          <div class="footer">
            <p>&copy; 2024 Agency Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: agencyEmail, subject, html });
  }

  /**
   * 招待メール送信
   */
  async sendInvitationEmail(invitationData) {
    const { email, parent_agency_name, invitation_code } = invitationData;

    const subject = '代理店登録のご招待';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Hiragino Sans', sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #F59E0B; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .invitation-code {
            background-color: #FEF3C7;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 2px;
          }
          .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #F59E0B;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer { text-align: center; padding: 10px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>代理店登録のご招待</h1>
          </div>
          <div class="content">
            <p>${parent_agency_name} から代理店登録の招待が届いています。</p>
            <p>以下の招待コードを使用して、代理店登録を行ってください。</p>
            <div class="invitation-code">
              ${invitation_code}
            </div>
            <p>登録はこちらから:</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?code=${invitation_code}" class="button">代理店登録を開始</a>
            <p><small>この招待は7日間有効です。</small></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Agency Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: email, subject, html });
  }

  /**
   * パスワードリセットメール
   */
  async sendPasswordResetEmail(email, resetToken) {
    const subject = 'パスワードリセットのお知らせ';
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Hiragino Sans', sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #EF4444; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #EF4444;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer { text-align: center; padding: 10px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>パスワードリセット</h1>
          </div>
          <div class="content">
            <p>パスワードリセットのリクエストを受け付けました。</p>
            <p>以下のボタンをクリックして、新しいパスワードを設定してください。</p>
            <a href="${resetUrl}" class="button">パスワードをリセット</a>
            <p><small>このリンクは1時間有効です。</small></p>
            <p><small>心当たりがない場合は、このメールを無視してください。</small></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Agency Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: email, subject, html });
  }

  /**
   * 代理店申請拒否メール
   */
  async sendAgencyRejectedEmail(agencyData, rejectionReason) {
    const { company_name, contact_email } = agencyData;

    const subject = '代理店申請に関するお知らせ';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 30px; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .reason-box { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #dc3545; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>代理店申請に関するお知らせ</h1>
          </div>
          <div class="content">
            <h2>${company_name} 様</h2>
            <p>この度は、弊社代理店プログラムにお申込みいただき、誠にありがとうございました。</p>
            <p>慎重に審査させていただきました結果、誠に恐れ入りますが、今回はご希望に添えない結果となりました。</p>

            <div class="reason-box">
              <h3>審査結果の理由：</h3>
              <p>${rejectionReason}</p>
            </div>

            <p>今後、条件が整いましたら、再度お申込みいただくことも可能です。</p>
            <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ${process.env.EMAIL_FROM_NAME || 'Agency Management System'}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: contact_email, subject, html });
  }

  /**
   * 代理店承認通知メール
   */
  async sendAgencyApprovedEmail(agencyData) {
    const { company_name, contact_email, agency_code, passwordResetToken } = agencyData;
    const passwordSetupUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/#/set-password?token=${passwordResetToken}`;

    const subject = '代理店申請承認のお知らせ - パスワード設定のお願い';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 30px; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .info-box { background: white; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .btn { display: inline-block; padding: 12px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          .warning { background: #fff3cd; padding: 15px; margin: 20px 0; border-left: 4px solid #ffc107; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>代理店登録完了のお知らせ</h1>
          </div>
          <div class="content">
            <h2>${company_name} 様</h2>
            <p>この度は弊社代理店プログラムにお申込みいただき、誠にありがとうございます。</p>
            <p>審査の結果、代理店として正式に承認されましたことをお知らせいたします。</p>

            <div class="info-box">
              <h3>代理店情報</h3>
              <p><strong>代理店コード：</strong>${agency_code}</p>
              <p><strong>ステータス：</strong>有効</p>
            </div>

            <p>ご利用を開始するには、まず以下のリンクからパスワードを設定してください：</p>
            <a href="${passwordSetupUrl}" class="btn">パスワードを設定する</a>

            <div class="warning">
              <p><strong>⚠️ 重要</strong></p>
              <p>このリンクは24時間有効です。期限を過ぎた場合は、管理者にお問い合わせください。</p>
            </div>

            <p style="margin-top: 30px;">パスワード設定後、ログインしてダッシュボードをご利用いただけます。</p>
            <p>今後ともよろしくお願いいたします。</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ${process.env.EMAIL_FROM_NAME || 'Agency Management System'}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: contact_email, subject, html });
  }

  /**
   * 代理店停止通知メール
   */
  async sendAgencySuspendedEmail(agencyData, suspensionReason) {
    const { company_name, contact_email } = agencyData;

    const subject = '代理店アカウント停止のお知らせ';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { background: #f8f9fa; padding: 30px; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .warning-box { background: #fff3cd; padding: 15px; margin: 20px 0; border-left: 4px solid #ffc107; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>代理店アカウント停止のお知らせ</h1>
          </div>
          <div class="content">
            <h2>${company_name} 様</h2>
            <p>お客様の代理店アカウントが一時的に停止されました。</p>

            <div class="warning-box">
              <h3>停止理由：</h3>
              <p>${suspensionReason}</p>
            </div>

            <p>アカウントの再有効化をご希望の場合は、管理者までお問い合わせください。</p>
            <p>停止中は、新規の売上登録や報酬の受け取りができませんのでご注意ください。</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ${process.env.EMAIL_FROM_NAME || 'Agency Management System'}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendMail({ to: contact_email, subject, html });
  }

  /**
   * メールアドレスをマスク（例: t***@example.com）
   */
  maskEmail(email) {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    const masked = local.length <= 1 ? '*' : local[0] + '***';
    return `${masked}@${domain}`;
  }

  /**
   * HTMLタグを除去
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * 支払い予定日を計算
   */
  getPaymentDate() {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 25);
    return nextMonth.toLocaleDateString('ja-JP');
  }
}

// シングルトンパターンでエクスポート
module.exports = new EmailService();