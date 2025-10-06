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
    }

    generateMonthOptions() {
        const monthFilter = document.getElementById('invoiceMonthFilter');
        const summaryMonthSelect = document.getElementById('summaryMonthSelect');

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

        const tbody = document.getElementById('invoicesTableBody');
        tbody.innerHTML = '';

        this.invoices.forEach(invoice => {
            const row = this.createInvoiceRow(invoice);
            tbody.appendChild(row);
        });
    }

    createInvoiceRow(invoice) {
        const row = document.createElement('tr');

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
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="invoicesPage.downloadPDF('${invoice.id}', 'invoice')">
                        📄 請求書
                    </button>
                </div>
            </td>
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