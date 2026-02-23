/**
 * @deprecated このモジュールはTOTPベースの2FA用です。
 * 現在のシステムはメールベース2FA（auth.js内で実装）を使用しています。
 * 新規コードではこのモジュールを使用しないでください。
 *
 * 2段階認証（2FA/TOTP）ユーティリティ
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * TOTP秘密鍵を生成
 */
function generateSecret(email) {
  const secret = speakeasy.generateSecret({
    name: `${process.env.APP_NAME || '代理店管理システム'} (${email})`,
    issuer: process.env.APP_NAME || '代理店管理システム',
    length: 32
  });

  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url
  };
}

/**
 * QRコードを生成（DataURL形式）
 */
async function generateQRCode(otpauth_url) {
  try {
    const qrDataURL = await QRCode.toDataURL(otpauth_url);
    return qrDataURL;
  } catch (error) {
    console.error('QR Code generation error:', error);
    throw new Error('QRコード生成に失敗しました');
  }
}

/**
 * TOTPコードを検証
 * @param {string} secret - TOTP秘密鍵
 * @param {string} token - ユーザー入力の6桁コード
 * @param {number} window - 許容時間窓（デフォルト: 2 = ±1分）
 */
function verifyToken(secret, token, window = 2) {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: window
  });
}

/**
 * バックアップコードを生成（8個）
 * 各コードは8桁の英数字
 */
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * バックアップコードをハッシュ化
 */
function hashBackupCode(code) {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

/**
 * バックアップコードを検証
 * @param {string} inputCode - ユーザー入力コード
 * @param {string[]} hashedCodes - ハッシュ化されたコード配列
 */
function verifyBackupCode(inputCode, hashedCodes) {
  if (!hashedCodes || hashedCodes.length === 0) {
    return { valid: false, remainingCodes: hashedCodes };
  }

  const inputHash = hashBackupCode(inputCode.toUpperCase());
  const codeIndex = hashedCodes.indexOf(inputHash);

  if (codeIndex === -1) {
    return { valid: false, remainingCodes: hashedCodes };
  }

  // 使用済みコードを削除
  const remainingCodes = [...hashedCodes];
  remainingCodes.splice(codeIndex, 1);

  return {
    valid: true,
    remainingCodes: remainingCodes
  };
}

/**
 * 秘密鍵を暗号化（オプション - 本番環境推奨）
 */
function encryptSecret(secret) {
  if (!process.env.ENCRYPTION_KEY) {
    // 暗号化キーがない場合はそのまま返す（開発環境）
    return secret;
  }

  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * 秘密鍵を復号化（オプション）
 */
function decryptSecret(encryptedSecret) {
  if (!process.env.ENCRYPTION_KEY) {
    return encryptedSecret;
  }

  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const parts = encryptedSecret.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  generateSecret,
  generateQRCode,
  verifyToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  encryptSecret,
  decryptSecret
};
