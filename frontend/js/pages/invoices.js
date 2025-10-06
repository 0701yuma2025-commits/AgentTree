/**
 * 請求書管理ページの機能
 */

class InvoicesPage {
    constructor() {
        this.invoices = [];
        this.currentFilter = '';
        this.isLoading = false;
        this.agencies = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.generateMonthOptions();
        this.loadAgenciesForAdmin();
    }

    bindEvents() {
        // 月フィルター
        const monthFilter = document.getElementById('invoiceMonthFilter');
        if (monthFilter) {
            monthFilter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.loadInvoices();
            });
        }

        // 管理者専用：月次集計明細書機能
        const agencySelect = document.getElementById('summaryAgencySelect');
        const monthSelect = document.getElementById('summaryMonthSelect');
        const generateBtn = document.getElementById('generateMonthlySummaryBtn');

        if (agencySelect && monthSelect && generateBtn) {
            const checkButtonState = () => {
                const canGenerate = agencySelect.value && monthSelect.value;
                generateBtn.disabled = !canGenerate;
            };

            agencySelect.addEventListener('change', checkButtonState);
            monthSelect.addEventListener('change', checkButtonState);

            generateBtn.addEventListener('click', () => {
                this.generateMonthlySummary();
            });
        }

        // 管理者専用：振込データ出力機能
        const paymentMonth = document.getElementById('paymentExportMonth');
        const paymentFormat = document.getElementById('paymentExportFormat');
        const previewBtn = document.getElementById('previewPaymentBtn');
        const exportBtn = document.getElementById('exportPaymentBtn');
        const confirmBtn = document.getElementById('confirmPaymentBtn');

        if (paymentMonth && paymentFormat && previewBtn && exportBtn && confirmBtn) {
            const checkPaymentButtonState = () => {
                const canOperate = paymentMonth.value !== '';
                previewBtn.disabled = !canOperate;
                exportBtn.disabled = !canOperate;
            };

            paymentMonth.addEventListener('change', checkPaymentButtonState);

            previewBtn.addEventListener('click', () => {
                this.previewPaymentData();
            });

            exportBtn.addEventListener('click', () => {
                this.exportPaymentData();
            });

            confirmBtn.addEventListener('click', () => {
                this.confirmPayment();
            });
        }
    }

    generateMonthOptions() {
        const monthFilter = document.getElementById('invoiceMonthFilter');
        const summaryMonthSelect = document.getElementById('summaryMonthSelect');
        const paymentMonthSelect = document.getElementById('paymentExportMonth');

        // 現在の月から過去12ヶ月のオプションを生成
        const today = new Date();
        for (let i = 0; i < 12; i++) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = `${date.getFullYear()}年${date.getMonth() + 1}月`;

            // 請求書フィルター用
            if (monthFilter) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                monthFilter.appendChild(option);
            }

            // 管理者専用月次集計用
            if (summaryMonthSelect) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                summaryMonthSelect.appendChild(option);
            }

            // 振込データ出力用
            if (paymentMonthSelect) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                paymentMonthSelect.appendChild(option);
            }
        }
    }

    async loadAgenciesForAdmin() {
        // 管理者権限チェック（authAPIから取得）
        if (typeof window.authAPI === 'undefined' || !window.authAPI.isAdmin()) {
            return;
        }


        try {
            const agencies = await apiClient.get('/invoices/agencies');
            this.agencies = agencies || [];

            const agencySelect = document.getElementById('summaryAgencySelect');
            if (agencySelect) {
                // 既存のオプション（最初の「代理店を選択」以外）をクリア
                while (agencySelect.children.length > 1) {
                    agencySelect.removeChild(agencySelect.lastChild);
                }

                // 代理店オプションを追加
                this.agencies.forEach(agency => {
                    const option = document.createElement('option');
                    option.value = agency.id;
                    option.textContent = `${agency.company_name} (${agency.agency_code})`;
                    agencySelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('代理店一覧取得エラー:', error);
        }
    }

    async generateMonthlySummary() {
        const agencySelect = document.getElementById('summaryAgencySelect');
        const monthSelect = document.getElementById('summaryMonthSelect');
        const generateBtn = document.getElementById('generateMonthlySummaryBtn');

        if (!agencySelect.value || !monthSelect.value) {
            alert('代理店と対象月を選択してください');
            return;
        }

        const selectedAgency = this.agencies.find(a => a.id === agencySelect.value);
        if (!selectedAgency) {
            alert('選択された代理店が見つかりません');
            return;
        }

        try {
            generateBtn.disabled = true;
            generateBtn.textContent = '生成中...';

            const blob = await apiClient.postForBlob('/invoices/admin-monthly-summary', {
                agency_id: agencySelect.value,
                month: monthSelect.value
            });

            if (!blob) {
                return; // JWT認証エラーでリダイレクトされた場合
            }

            // PDFダウンロード
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `admin_monthly_summary_${monthSelect.value}_${selectedAgency.agency_code}.pdf`;
            document.body.appendChild(a);
            a.click();

            // クリーンアップ
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('月次集計明細書生成エラー:', error);
            alert('月次集計明細書の生成に失敗しました: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '📊 月次集計明細書生成';
        }
    }

    async loadInvoices() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoading();

        try {
            const params = this.currentFilter ? { month: this.currentFilter } : {};
            const data = await apiClient.get('/invoices', params);

            // JWT認証エラーの場合は自動でリダイレクトされるので、ここには到達しない
            if (data && data.success === false) {
                throw new Error(data.message || '請求書の取得に失敗しました');
            }

            this.invoices = data || [];
            this.renderInvoices();

        } catch (error) {
            console.error('請求書取得エラー:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
        }
    }

    showLoading() {
        document.getElementById('invoicesLoading').classList.remove('hidden');
        document.getElementById('invoicesError').classList.add('hidden');
        document.getElementById('invoicesEmpty').classList.add('hidden');
        document.getElementById('invoicesTable').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('invoicesLoading').classList.add('hidden');
        document.getElementById('invoicesTable').classList.add('hidden');
        document.getElementById('invoicesEmpty').classList.add('hidden');

        const errorDiv = document.getElementById('invoicesError');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }

    renderInvoices() {
        document.getElementById('invoicesLoading').classList.add('hidden');
        document.getElementById('invoicesError').classList.add('hidden');

        if (!this.invoices || this.invoices.length === 0) {
            document.getElementById('invoicesTable').classList.add('hidden');
            document.getElementById('invoicesEmpty').classList.remove('hidden');
            return;
        }

        document.getElementById('invoicesEmpty').classList.add('hidden');
        document.getElementById('invoicesTable').classList.remove('hidden');

        // ユーザー情報を取得して管理者かどうかを判定
        const userStr = localStorage.getItem('agency_system_user');
        const user = userStr ? JSON.parse(userStr) : null;
        const isAdmin = user && user.role === 'admin';

        // テーブルヘッダーのアクション列を制御
        const actionHeader = document.querySelector('#invoicesTable thead th:last-child');
        if (actionHeader && actionHeader.textContent.trim() === 'アクション') {
            if (isAdmin) {
                actionHeader.style.display = 'none';
            } else {
                actionHeader.style.display = '';
            }
        }

        const tbody = document.getElementById('invoicesTableBody');
        tbody.innerHTML = '';

        this.invoices.forEach(invoice => {
            const row = this.createInvoiceRow(invoice);
            tbody.appendChild(row);
        });
    }

    createInvoiceRow(invoice) {
        const row = document.createElement('tr');

        // ユーザー情報を取得して管理者かどうかを判定
        const userStr = localStorage.getItem('agency_system_user');
        const user = userStr ? JSON.parse(userStr) : null;
        const isAdmin = user && user.role === 'admin';

        // 管理者の場合はアクションボタンを非表示
        const actionColumn = isAdmin ? '' : `
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="invoicesPage.downloadPDF('${invoice.id}', 'invoice')">
                        📄 請求書
                    </button>
                </div>
            </td>
        `;

        row.innerHTML = `
            <td>
                <div class="invoice-number">
                    📄 ${invoice.invoiceNumber}
                </div>
            </td>
            <td>${invoice.month}</td>
            <td>¥${(invoice.baseCommission || 0).toLocaleString()}</td>
            <td>¥${(invoice.tierBonus || 0).toLocaleString()}</td>
            <td class="text-danger">-¥${(invoice.withholdingTax || 0).toLocaleString()}</td>
            <td class="font-weight-bold">¥${(invoice.amount || 0).toLocaleString()}</td>
            <td>
                <span class="badge ${this.getStatusBadgeClass(invoice.status)}">
                    ${this.getStatusIcon(invoice.status)} ${invoice.status}
                </span>
            </td>
            ${actionColumn}
        `;

        return row;
    }

    getStatusIcon(status) {
        switch (status) {
            case '支払済': return '✅';
            case '承認済': return '⏰';
            case '繰越': return '🔄';
            default: return '⏳';
        }
    }

    getStatusBadgeClass(status) {
        switch (status) {
            case '支払済': return 'badge-success';
            case '承認済': return 'badge-info';
            case '繰越': return 'badge-warning';
            default: return 'badge-secondary';
        }
    }

    async downloadPDF(invoiceId, type) {
        try {
            const invoice = this.invoices.find(inv => inv.id === invoiceId);
            if (!invoice) {
                alert('請求書情報が見つかりません');
                return;
            }

            let endpoint = '';
            let filename = '';

            switch (type) {
                case 'invoice':
                    endpoint = '/invoices/generate';
                    filename = `invoice_${invoice.month}_${invoiceId}.pdf`;
                    break;
                default:
                    throw new Error('無効なドキュメントタイプ');
            }

            // JWT認証エラーの場合は自動でリダイレクトされる
            const blob = await apiClient.postForBlob(endpoint, {
                commission_id: invoiceId,
                month: invoice.month
            });

            // JWT認証エラーでリダイレクトされた場合はblobがundefinedになる
            if (!blob) {
                return;
            }

            // Blobとしてダウンロード
            const url = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // クリーンアップ
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('PDFダウンロードエラー:', error);
            alert('PDFのダウンロードに失敗しました: ' + error.message);
        }
    }

    async previewPaymentData() {
        const monthSelect = document.getElementById('paymentExportMonth');
        const formatSelect = document.getElementById('paymentExportFormat');
        const previewArea = document.getElementById('paymentPreviewArea');
        const previewContent = document.getElementById('paymentPreviewContent');

        if (!monthSelect.value) {
            alert('対象月を選択してください');
            return;
        }

        try {
            const data = await apiClient.get('/payments/preview', {
                month: monthSelect.value
            });

            if (!data) {
                return; // JWT認証エラーでリダイレクトされた場合
            }

            if (!data.payments || data.payments.length === 0) {
                alert('指定月の承認済み支払いデータが見つかりません');
                previewArea.classList.add('hidden');
                return;
            }

            // プレビューテーブル生成
            let html = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>代理店コード</th>
                            <th>代理店名</th>
                            <th>銀行名</th>
                            <th>支店名</th>
                            <th>口座種別</th>
                            <th>口座番号</th>
                            <th>口座名義</th>
                            <th>支払金額</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.payments.forEach(payment => {
                html += `
                    <tr>
                        <td>${payment.agency_code || '-'}</td>
                        <td>${payment.company_name || '-'}</td>
                        <td>${payment.bank_name || '-'}</td>
                        <td>${payment.branch_name || '-'}</td>
                        <td>${payment.account_type || '-'}</td>
                        <td>${payment.account_number || '-'}</td>
                        <td>${payment.account_holder || '-'}</td>
                        <td>¥${(payment.amount || 0).toLocaleString()}</td>
                    </tr>
                `;
            });

            html += `
                    </tbody>
                </table>
                <div style="margin-top: 1rem; font-weight: bold;">
                    合計件数: ${data.payments.length}件　合計金額: ¥${(data.total_amount || 0).toLocaleString()}
                </div>
            `;

            previewContent.innerHTML = html;
            previewArea.classList.remove('hidden');

        } catch (error) {
            console.error('振込データプレビューエラー:', error);
            alert('振込データのプレビューに失敗しました: ' + error.message);
            previewArea.classList.add('hidden');
        }
    }

    async exportPaymentData() {
        const monthSelect = document.getElementById('paymentExportMonth');
        const formatSelect = document.getElementById('paymentExportFormat');
        const exportBtn = document.getElementById('exportPaymentBtn');

        if (!monthSelect.value) {
            alert('対象月を選択してください');
            return;
        }

        try {
            exportBtn.disabled = true;
            exportBtn.textContent = 'ダウンロード中...';

            const blob = await apiClient.postForBlob('/payments/export', {
                month: monthSelect.value,
                format: formatSelect.value
            });

            if (!blob) {
                return; // JWT認証エラーでリダイレクトされた場合
            }

            // ファイル拡張子の決定
            let extension = 'txt';
            if (formatSelect.value === 'csv') {
                extension = 'csv';
            } else if (formatSelect.value === 'zengin') {
                extension = 'txt';
            } else if (formatSelect.value === 'readable') {
                extension = 'txt';
            }

            // ファイルダウンロード
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `payment_data_${monthSelect.value}_${formatSelect.value}.${extension}`;
            document.body.appendChild(a);
            a.click();

            // クリーンアップ
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('振込データダウンロードエラー:', error);
            alert('振込データのダウンロードに失敗しました: ' + error.message);
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = '💾 ダウンロード';
        }
    }

    async confirmPayment() {
        const monthSelect = document.getElementById('paymentExportMonth');
        const confirmBtn = document.getElementById('confirmPaymentBtn');

        if (!monthSelect.value) {
            alert('対象月を選択してください');
            return;
        }

        // 確認ダイアログ（二重確認）
        if (!confirm(`${monthSelect.value}の振込を実行確定しますか？\n\nこの操作により、承認済みステータスが支払済みに変更されます。\nこの操作は取り消せません。`)) {
            return;
        }

        if (!confirm('本当によろしいですか？\n\n再度確認してください。')) {
            return;
        }

        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '確定処理中...';

            const result = await apiClient.post('/payments/confirm', {
                month: monthSelect.value
            });

            if (!result) {
                return; // JWT認証エラーでリダイレクトされた場合
            }

            alert(`振込実行を確定しました。\n\n更新件数: ${result.updated_count || 0}件`);

            // プレビューエリアを非表示にする
            document.getElementById('paymentPreviewArea').classList.add('hidden');

            // 月選択をリセット
            monthSelect.value = '';
            document.getElementById('previewPaymentBtn').disabled = true;
            document.getElementById('exportPaymentBtn').disabled = true;

        } catch (error) {
            console.error('振込確定エラー:', error);
            alert('振込確定処理に失敗しました: ' + error.message);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '✅ 振込実行を確定';
        }
    }
}

// グローバルインスタンス
let invoicesPage = null;

// ページが表示されたときに初期化
function initInvoicesPage() {
    if (!invoicesPage) {
        invoicesPage = new InvoicesPage();
    }
    invoicesPage.loadInvoices();
}

// 外部から呼び出せるように
window.initInvoicesPage = initInvoicesPage;