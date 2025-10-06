/**
 * PDF生成ユーティリティ
 * 請求書・領収書のPDFを生成
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// 日本語フォントパス（オプション）
// フォントが存在しない場合はデフォルトフォントを使用
const FONT_PATH = path.join(__dirname, '../../fonts/NotoSansJP-Regular.ttf');
const fontExists = fs.existsSync(FONT_PATH);

/**
 * 請求書PDF生成
 */
async function generateInvoicePDF(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // 日本語フォントが利用可能な場合のみ登録
      if (fontExists) {
        try {
          doc.registerFont('Japanese', FONT_PATH);
        } catch (e) {
          console.log('Font registration skipped:', e.message);
        }
      }

      // ヘッダー
      if (fontExists) doc.font('Japanese');
      doc.fontSize(20)
         .text('請求書', 50, 50, { align: 'center' });

      // 請求書番号・日付
      doc.fontSize(10)
         .text(`請求書番号: ${invoiceData.invoiceNumber}`, 50, 100)
         .text(`発行日: ${invoiceData.issueDate}`, 50, 115)
         .text(`支払期日: ${invoiceData.dueDate}`, 50, 130);

      // 請求先情報
      doc.fontSize(14)
         .text(`${invoiceData.agency.company_name} 様`, 50, 170);

      doc.fontSize(10)
         .text(invoiceData.agency.address || '', 50, 195);

      // 請求元情報（システム運営会社）
      doc.fontSize(10)
         .text('営業代理店管理システム', 350, 100)
         .text('〒100-0001', 350, 118)
         .text('東京都千代田区千代田1-1', 350, 133)
         .text('TEL: 03-1234-5678', 350, 148)
         .text('Email: info@agency-system.com', 350, 163);

      // インボイス番号
      if (invoiceData.invoiceNumber) {
        doc.fontSize(10)
           .text(`登録番号: T${invoiceData.invoiceRegistrationNumber || '1234567890123'}`, 350, 185);
      }

      // 請求金額
      doc.fontSize(16)
         .text(`請求金額: ¥${invoiceData.totalAmount.toLocaleString()}`, 50, 230, { align: 'center' });

      // 明細テーブル
      const tableTop = 280;
      const itemHeight = 25;

      // テーブルヘッダー
      doc.fontSize(10)
         .text('摘要', 50, tableTop)
         .text('数量', 250, tableTop)
         .text('単価', 320, tableTop)
         .text('金額', 420, tableTop);

      // 横線
      doc.moveTo(50, tableTop + 20)
         .lineTo(500, tableTop + 20)
         .stroke();

      // 明細行
      let yPosition = tableTop + itemHeight;
      invoiceData.items.forEach(item => {
        doc.fontSize(10)
           .text(item.description, 50, yPosition)
           .text(item.quantity.toString(), 250, yPosition)
           .text(`${item.unitPrice.toLocaleString()}`, 320, yPosition)
           .text(`${item.amount.toLocaleString()}`, 420, yPosition);
        yPosition += itemHeight;
      });

      // 合計部分
      yPosition += 20;
      doc.moveTo(50, yPosition)
         .lineTo(500, yPosition)
         .stroke();

      yPosition += 10;
      doc.fontSize(10)
         .text('小計:', 320, yPosition)
         .text(`¥${invoiceData.subtotal.toLocaleString()}`, 420, yPosition);

      if (invoiceData.tax > 0) {
        yPosition += 20;
        doc.text('消費税(10%):', 320, yPosition)
           .text(`¥${invoiceData.tax.toLocaleString()}`, 420, yPosition);
      }

      if (invoiceData.withholdingTax > 0) {
        yPosition += 20;
        doc.text('源泉徴収税:', 320, yPosition)
           .text(`-¥${invoiceData.withholdingTax.toLocaleString()}`, 420, yPosition);
      }

      yPosition += 25;
      doc.fontSize(12)
         .text('合計:', 320, yPosition)
         .text(`¥${invoiceData.totalAmount.toLocaleString()}`, 420, yPosition);

      // 振込先情報
      yPosition += 50;
      doc.fontSize(10)
         .text('【振込先】', 50, yPosition);
      yPosition += 15;
      doc.text(`銀行名: ${invoiceData.bankInfo?.bankName || 'みずほ銀行'}`, 50, yPosition);
      yPosition += 15;
      doc.text(`支店名: ${invoiceData.bankInfo?.branchName || '東京営業部'}`, 50, yPosition);
      yPosition += 15;
      doc.text(`口座種別: ${invoiceData.bankInfo?.accountType || '普通'}`, 50, yPosition);
      yPosition += 15;
      doc.text(`口座番号: ${invoiceData.bankInfo?.accountNumber || '1234567'}`, 50, yPosition);
      yPosition += 15;
      doc.text(`口座名義: ${invoiceData.bankInfo?.accountName || '営業代理店管理システム'}`, 50, yPosition);

      // 備考
      if (invoiceData.notes) {
        yPosition += 30;
        doc.fontSize(10)
           .text('【備考】', 50, yPosition);
        yPosition += 15;
        doc.text(invoiceData.notes, 50, yPosition, { width: 450 });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 領収書PDF生成
 */
async function generateReceiptPDF(receiptData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // 日本語フォントが利用可能な場合のみ登録
      if (fontExists) {
        try {
          doc.registerFont('Japanese', FONT_PATH);
        } catch (e) {
          console.log('Font registration skipped:', e.message);
        }
      }

      // ヘッダー
      if (fontExists) doc.font('Japanese');
      doc.fontSize(24)
         .text('領 収 書', 50, 50, { align: 'center' });

      // 領収書番号・日付
      doc.fontSize(10);
      doc.text(`領収書番号: ${receiptData.receiptNumber}`, 400, 100, { lineBreak: false });
      doc.text(`発行日: ${receiptData.issueDate}`, 400, 150, { lineBreak: false });

      // 宛名
      doc.fontSize(14)
         .text(`${receiptData.agency.company_name} 様`, 50, 150);

      // 領収金額
      doc.fontSize(20)
         .text(`領収金額: ¥${receiptData.amount.toLocaleString()}`, 50, 200, { align: 'center' });

      // 但し書き
      doc.fontSize(12)
         .text('但し、', 50, 260)
         .text(receiptData.description || '営業代理店報酬として', 100, 260);

      // 内訳
      if (receiptData.breakdown) {
        let yPosition = 320;
        doc.fontSize(10)
           .text('【内訳】', 50, yPosition);

        yPosition += 20;
        receiptData.breakdown.forEach(item => {
          doc.text(`${item.label}: ¥${item.amount.toLocaleString()}`, 70, yPosition);
          yPosition += 20;
        });
      }

      // 収入印紙欄（5万円以上の場合）
      if (receiptData.amount >= 50000) {
        doc.rect(400, 250, 100, 100)
           .stroke()
           .fontSize(10)
           .text('収入印紙', 425, 290);
      }

      // 発行元情報
      let footerY = 450;
      doc.fontSize(10)
         .text('営業代理店管理システム運営事務局', 50, footerY)
         .text('〒100-0001 東京都千代田区千代田1-1', 50, footerY + 15)
         .text('TEL: 03-1234-5678', 50, footerY + 30)
         .text('Email: info@agency-system.com', 50, footerY + 45);

      // 印鑑枠
      doc.rect(400, footerY, 80, 80)
         .stroke()
         .fontSize(8)
         .text('印', 435, footerY + 35);

      // インボイス番号
      if (receiptData.invoiceRegistrationNumber) {
        doc.fontSize(10)
           .text(`登録番号: T${receiptData.invoiceRegistrationNumber}`, 50, footerY + 70);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 支払明細書PDF生成（管理者用）
 */
async function generatePaymentStatementPDF(summaryData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // 日本語フォントが利用可能な場合のみ登録
      if (fontExists) {
        doc.registerFont('Japanese', FONT_PATH);
        doc.font('Japanese');
      }

      // ヘッダー
      doc.fontSize(20);
      if (fontExists) doc.font('Japanese');
      doc.text('月次集計明細書', { align: 'center' });
      doc.moveDown(2);

      // 代理店情報
      doc.fontSize(12);
      if (fontExists) doc.font('Japanese');
      doc.text(`代理店名: ${summaryData.agency.company_name}`);
      doc.text(`代理店コード: ${summaryData.agency.agency_code}`);
      doc.text(`対象月: ${summaryData.period}`);
      doc.text(`発行日: ${summaryData.issueDate}`);
      doc.moveDown(2);

      // 明細テーブル
      const startY = doc.y;
      const tableHeaders = ['売上日', '売上番号', '売上額', '基本報酬', 'ボーナス', '源泉税', '支払額'];
      const colWidths = [65, 85, 75, 75, 70, 65, 75];
      let currentX = 50;

      // ヘッダー行
      doc.fontSize(10);
      if (fontExists) doc.font('Japanese');
      tableHeaders.forEach((header, i) => {
        doc.text(header, currentX, startY, { width: colWidths[i], align: 'center' });
        currentX += colWidths[i];
      });

      // 線
      doc.moveTo(50, startY + 15).lineTo(550, startY + 15).stroke();

      let currentY = startY + 20;

      // 明細行
      summaryData.items.forEach((item, index) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }

        currentX = 50;
        const rowData = [
          item.date,
          item.saleNumber,
          `¥${item.saleAmount.toLocaleString()}`,
          `¥${item.baseCommission.toLocaleString()}`,
          `¥${(item.tierBonus + item.campaignBonus).toLocaleString()}`,
          `¥${item.withholdingTax.toLocaleString()}`,
          `¥${item.paymentAmount.toLocaleString()}`
        ];

        doc.fontSize(9);
        if (fontExists) doc.font('Japanese');
        rowData.forEach((data, i) => {
          doc.text(data, currentX, currentY, { width: colWidths[i], align: i > 1 ? 'right' : 'left' });
          currentX += colWidths[i];
        });

        currentY += 18;
      });

      // 合計行
      doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
      currentY += 10;

      currentX = 50;
      const totalRow = [
        '合計',
        '',
        `¥${summaryData.totals.saleAmount.toLocaleString()}`,
        `¥${summaryData.totals.baseCommission.toLocaleString()}`,
        `¥${(summaryData.totals.tierBonus + summaryData.totals.campaignBonus).toLocaleString()}`,
        `¥${summaryData.totals.withholdingTax.toLocaleString()}`,
        `¥${summaryData.totals.paymentAmount.toLocaleString()}`
      ];

      doc.fontSize(10);
      if (fontExists) doc.font('Japanese');
      totalRow.forEach((data, i) => {
        doc.text(data, currentX, currentY, { width: colWidths[i], align: i > 1 ? 'right' : 'left', fontWeight: 'bold' });
        currentX += colWidths[i];
      });

      // フッター
      doc.fontSize(10);
      if (fontExists) doc.font('Japanese');
      doc.text('営業代理店管理システム運営事務局', 50, 750, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * PDFファイルを保存
 */
async function savePDF(pdfBuffer, filePath) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, pdfBuffer, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(filePath);
      }
    });
  });
}

module.exports = {
  generateInvoicePDF,
  generateReceiptPDF,
  generatePaymentStatementPDF,
  savePDF
};