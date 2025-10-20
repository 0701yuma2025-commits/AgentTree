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

      // 請求先情報（カスタマイズ可能）
      doc.fontSize(14)
         .text(invoiceData.recipientCompanyName || '営業代理店管理システム 様', 50, 170);

      // 追加の宛先情報
      let yPos = 190;
      doc.fontSize(10);

      if (invoiceData.recipientDepartment) {
        doc.text(invoiceData.recipientDepartment, 50, yPos);
        yPos += 15;
      }

      if (invoiceData.recipientContactPerson) {
        doc.text(`${invoiceData.recipientContactPerson} 様`, 50, yPos);
        yPos += 15;
      }

      if (invoiceData.recipientAddress) {
        if (invoiceData.recipientPostalCode) {
          doc.text(`〒${invoiceData.recipientPostalCode}`, 50, yPos);
          yPos += 15;
        }
        doc.text(invoiceData.recipientAddress, 50, yPos);
        yPos += 15;
      }

      if (invoiceData.recipientPhone) {
        doc.text(`TEL: ${invoiceData.recipientPhone}`, 50, yPos);
        yPos += 15;
      }

      doc.fontSize(10)
         .text('', 50, yPos);

      // 請求元情報（代理店自社情報）
      doc.fontSize(10);
      let issuerY = 100;

      // 代理店名
      if (invoiceData.issuer?.company_name) {
        doc.text(invoiceData.issuer.company_name, 350, issuerY);
        issuerY += 18;
      }

      // 代表者名
      if (invoiceData.issuer?.representative_name) {
        doc.text(invoiceData.issuer.representative_name, 350, issuerY);
        issuerY += 18;
      }

      // 郵便番号と住所
      if (invoiceData.issuer?.postal_code) {
        doc.text(`〒${invoiceData.issuer.postal_code}`, 350, issuerY);
        issuerY += 18;
      }

      if (invoiceData.issuer?.address) {
        doc.text(invoiceData.issuer.address, 350, issuerY, { width: 150 });
        issuerY += 18;
      }

      // 電話番号
      if (invoiceData.issuer?.contact_phone) {
        doc.text(`TEL: ${invoiceData.issuer.contact_phone}`, 350, issuerY);
        issuerY += 18;
      }

      // メールアドレス
      if (invoiceData.issuer?.contact_email) {
        doc.text(`Email: ${invoiceData.issuer.contact_email}`, 350, issuerY);
        issuerY += 18;
      }

      // インボイス登録番号
      if (invoiceData.issuer?.invoice_number) {
        doc.text(`登録番号: ${invoiceData.issuer.invoice_number}`, 350, issuerY);
      }

      // 請求金額
      doc.fontSize(16)
         .text(`請求金額: ¥${invoiceData.totalAmount.toLocaleString()}`, 50, 280, { align: 'center' });

      // 明細テーブル
      const tableTop = 330;
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

      // 振込先情報（銀行口座情報がある場合のみ表示）
      if (invoiceData.bankInfo) {
        yPosition += 50;
        doc.fontSize(10)
           .text('【振込先】', 50, yPosition);
        yPosition += 15;
        doc.text(`銀行名: ${invoiceData.bankInfo.bankName}`, 50, yPosition);
        yPosition += 15;
        doc.text(`支店名: ${invoiceData.bankInfo.branchName}`, 50, yPosition);
        yPosition += 15;
        doc.text(`口座種別: ${invoiceData.bankInfo.accountType}`, 50, yPosition);
        yPosition += 15;
        doc.text(`口座番号: ${invoiceData.bankInfo.accountNumber}`, 50, yPosition);
        yPosition += 15;
        doc.text(`口座名義: ${invoiceData.bankInfo.accountName}`, 50, yPosition);
      }

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

      // 宛名（支払者情報）
      const recipientName = receiptData.recipient?.company_name || '営業代理店管理システム運営事務局';
      doc.fontSize(14)
         .text(`${recipientName} 様`, 50, 150);

      // 領収金額
      doc.fontSize(20)
         .text(`領収金額: ¥${receiptData.amount.toLocaleString()}`, 50, 250, { align: 'center' });

      // 但し書き
      doc.fontSize(12)
         .text('但し、', 50, 310)
         .text(receiptData.description || '営業代理店報酬として', 100, 310);

      // 内訳
      if (receiptData.breakdown) {
        let yPosition = 370;
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
        doc.rect(400, 300, 100, 100)
           .stroke()
           .fontSize(10)
           .text('収入印紙', 425, 340);
      }

      // 発行元情報（領収書発行者＝代理店）
      let footerY = 520;
      console.log('領収書PDF生成 - フッター開始Y座標:', footerY);
      doc.fontSize(10);

      // 代理店名
      if (receiptData.agency?.company_name) {
        doc.text(receiptData.agency.company_name, 50, footerY);
        footerY += 15;
      }

      // 代表者名
      if (receiptData.agency?.representative_name) {
        doc.text(receiptData.agency.representative_name, 50, footerY);
        footerY += 15;
      }

      // 郵便番号と住所
      if (receiptData.agency?.postal_code) {
        doc.text(`〒${receiptData.agency.postal_code}`, 50, footerY);
        footerY += 15;
      }

      if (receiptData.agency?.address) {
        doc.text(receiptData.agency.address, 50, footerY, { width: 300 });
        footerY += 15;
      }

      // 電話番号
      if (receiptData.agency?.contact_phone) {
        doc.text(`TEL: ${receiptData.agency.contact_phone}`, 50, footerY);
        footerY += 15;
      }

      // メールアドレス
      if (receiptData.agency?.contact_email) {
        doc.text(`Email: ${receiptData.agency.contact_email}`, 50, footerY);
        footerY += 15;
      }

      // 印鑑枠
      doc.rect(400, 520, 80, 80)
         .stroke()
         .fontSize(8)
         .text('印', 435, 555);

      // インボイス番号
      if (receiptData.agency?.invoice_number) {
        doc.fontSize(10)
           .text(`登録番号: ${receiptData.agency.invoice_number}`, 50, footerY);
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
      const colWidths = [65, 75, 65, 75, 70, 65, 85];
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