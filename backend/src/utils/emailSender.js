/**
 * メール送信ユーティリティ（Resend API使用）
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * メール送信
 * @param {Object} options
 * @param {string} options.to - 送信先メールアドレス
 * @param {string} options.subject - 件名
 * @param {string} options.html - HTML本文
 * @param {string} [options.text] - テキスト本文（オプション）
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    // メール送信が無効な場合はスキップ
    if (process.env.ENABLE_EMAIL !== 'true') {
      console.log('[Email] メール送信は無効化されています');
      console.log(`[Email] To: ${to}`);
      console.log(`[Email] Subject: ${subject}`);
      console.log(`[Email] HTML:`, html);
      return { success: true, message: 'メール送信は無効化されています（開発環境）' };
    }

    // Resend APIでメール送信
    const { data, error } = await resend.emails.send({
      from: `${process.env.EMAIL_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`,
      to: [to],
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, '') // HTMLタグを削除してテキスト版を生成
    });

    if (error) {
      console.error('[Email] 送信エラー:', error);
      throw new Error(`メール送信に失敗しました: ${error.message}`);
    }

    console.log(`[Email] 送信成功: ${to} - ${subject}`);
    return { success: true, data };

  } catch (error) {
    console.error('[Email] メール送信エラー:', error);
    throw error;
  }
}

module.exports = {
  sendEmail
};
