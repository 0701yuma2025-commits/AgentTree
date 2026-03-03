/**
 * 宛先選択モーダル共通ユーティリティ
 * commissions.js と invoices.js で共有
 */
async function showRecipientSelectionModal() {
  return new Promise(async (resolve, reject) => {
    try {
      // テンプレート一覧を取得
      const templates = await documentRecipientsAPI.getAll();

      const modalHTML = `
        <div class="recipient-modal">
          <h3>書類の宛先を選択</h3>

          <div class="recipient-selection">
            <!-- テンプレート選択 -->
            <div class="template-section">
              <label>保存済みテンプレートから選択:</label>
              <select id="recipientTemplateSelect" class="form-control">
                <option value="">-- 新規入力 --</option>
                ${templates.map(t => `
                  <option value="${t.id}" data-template='${escapeHtml(JSON.stringify(t))}'>
                    ${escapeHtml(t.template_name)} ${t.is_favorite ? '★' : ''}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- 宛先情報入力フォーム -->
            <div class="recipient-form">
              <div class="form-row">
                <div class="form-group">
                  <label>会社名 <span class="required">*</span></label>
                  <input type="text" id="recipient_company_name" class="form-control" required>
                </div>
                <div class="form-group">
                  <label>郵便番号</label>
                  <input type="text" id="recipient_postal_code" class="form-control" placeholder="100-0001">
                </div>
              </div>

              <div class="form-group">
                <label>住所</label>
                <input type="text" id="recipient_address" class="form-control">
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>部署</label>
                  <input type="text" id="recipient_department" class="form-control">
                </div>
                <div class="form-group">
                  <label>担当者</label>
                  <input type="text" id="recipient_contact_person" class="form-control">
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>電話番号</label>
                  <input type="tel" id="recipient_phone" class="form-control">
                </div>
                <div class="form-group">
                  <label>メールアドレス</label>
                  <input type="email" id="recipient_email" class="form-control">
                </div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" id="save_as_template">
                  このテンプレートを保存する
                </label>
              </div>

              <div id="template_name_group" class="form-group hidden">
                <label>テンプレート名</label>
                <input type="text" id="template_name" class="form-control" placeholder="例: 本社宛">
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button id="cancelRecipient" class="btn btn-secondary">キャンセル</button>
            <button id="confirmRecipient" class="btn btn-primary">この宛先で生成</button>
          </div>
        </div>
      `;

      // モーダルに表示
      document.getElementById('modalBody').innerHTML = modalHTML;
      document.getElementById('modal').classList.remove('hidden');

      // テンプレート選択時の処理
      document.getElementById('recipientTemplateSelect').addEventListener('change', (e) => {
        if (e.target.value) {
          try {
            const template = JSON.parse(e.target.selectedOptions[0].dataset.template);
            document.getElementById('recipient_company_name').value = template.company_name || '';
            document.getElementById('recipient_postal_code').value = template.postal_code || '';
            document.getElementById('recipient_address').value = template.address || '';
            document.getElementById('recipient_department').value = template.department || '';
            document.getElementById('recipient_contact_person').value = template.contact_person || '';
            document.getElementById('recipient_phone').value = template.phone || '';
            document.getElementById('recipient_email').value = template.email || '';
          } catch (parseError) {
            console.error('Template parse error:', parseError);
          }
        }
      });

      // テンプレート保存チェックボックス
      document.getElementById('save_as_template').addEventListener('change', (e) => {
        const nameGroup = document.getElementById('template_name_group');
        if (e.target.checked) {
          nameGroup.classList.remove('hidden');
        } else {
          nameGroup.classList.add('hidden');
        }
      });

      // キャンセルボタン
      document.getElementById('cancelRecipient').addEventListener('click', () => {
        document.getElementById('modal').classList.add('hidden');
        resolve(null);
      });

      // 確定ボタン
      document.getElementById('confirmRecipient').addEventListener('click', async () => {
        const companyName = document.getElementById('recipient_company_name').value;
        if (!companyName) {
          showToast('会社名は必須です', 'error');
          return;
        }

        const recipientData = {
          company_name: companyName,
          postal_code: document.getElementById('recipient_postal_code').value,
          address: document.getElementById('recipient_address').value,
          department: document.getElementById('recipient_department').value,
          contact_person: document.getElementById('recipient_contact_person').value,
          phone: document.getElementById('recipient_phone').value,
          email: document.getElementById('recipient_email').value
        };

        // テンプレート保存
        const templateSelect = document.getElementById('recipientTemplateSelect');
        if (document.getElementById('save_as_template').checked) {
          const templateName = document.getElementById('template_name').value;
          if (!templateName) {
            showToast('テンプレート名を入力してください', 'error');
            return;
          }

          try {
            const savedTemplate = await documentRecipientsAPI.create({
              template_name: templateName,
              recipient_type: 'custom',
              ...recipientData
            });
            recipientData.template_id = savedTemplate.id;
          } catch (error) {
            console.error('テンプレート保存エラー:', error);
            // エラーでも続行
          }
        } else if (templateSelect.value) {
          // 既存テンプレートを使用した場合
          recipientData.template_id = templateSelect.value;
        }

        document.getElementById('modal').classList.add('hidden');
        resolve(recipientData);
      });

    } catch (error) {
      console.error('モーダル表示エラー:', error);
      reject(error);
    }
  });
}
