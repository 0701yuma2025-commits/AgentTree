/**
 * メール送信ユーティリティ テスト
 */

// Resendモック
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

const { sendEmail } = require('../emailSender');

beforeEach(() => {
  mockSend.mockReset();
});

describe('sendEmail', () => {
  const originalEnableEmail = process.env.ENABLE_EMAIL;

  afterEach(() => {
    if (originalEnableEmail !== undefined) {
      process.env.ENABLE_EMAIL = originalEnableEmail;
    } else {
      delete process.env.ENABLE_EMAIL;
    }
  });

  describe('メール無効化時（ENABLE_EMAIL !== "true"）', () => {
    beforeEach(() => {
      delete process.env.ENABLE_EMAIL;
    });

    test('Resend APIを呼ばずにsuccessを返す', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'テスト',
        html: '<p>テスト</p>',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('無効化');
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('メール有効時（ENABLE_EMAIL === "true"）', () => {
    beforeEach(() => {
      process.env.ENABLE_EMAIL = 'true';
      process.env.EMAIL_FROM_NAME = 'テストシステム';
      process.env.RESEND_FROM_EMAIL = 'noreply@test.com';
    });

    test('送信成功 → success=true', async () => {
      mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });

      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'テスト件名',
        html: '<p>本文</p>',
      });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('msg-123');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['user@example.com'],
          subject: 'テスト件名',
          html: '<p>本文</p>',
        })
      );
    });

    test('テキスト未指定 → HTMLからタグを除去してtext生成', async () => {
      mockSend.mockResolvedValue({ data: { id: 'msg-456' }, error: null });

      await sendEmail({
        to: 'user@example.com',
        subject: 'テスト',
        html: '<p>テスト<b>太字</b></p>',
      });

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.text).toBe('テスト太字');
    });

    test('テキスト明示指定 → そのまま使用', async () => {
      mockSend.mockResolvedValue({ data: { id: 'msg-789' }, error: null });

      await sendEmail({
        to: 'user@example.com',
        subject: 'テスト',
        html: '<p>HTML</p>',
        text: 'プレーンテキスト',
      });

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.text).toBe('プレーンテキスト');
    });

    test('Resend APIエラー → エラーをスロー', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Rate limit exceeded' },
      });

      await expect(
        sendEmail({
          to: 'user@example.com',
          subject: 'テスト',
          html: '<p>本文</p>',
        })
      ).rejects.toThrow('メール送信に失敗しました');
    });

    test('ネットワークエラー → エラーをスロー', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      await expect(
        sendEmail({
          to: 'user@example.com',
          subject: 'テスト',
          html: '<p>本文</p>',
        })
      ).rejects.toThrow('Network error');
    });
  });
});
