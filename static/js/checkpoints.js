/* ==========================================================================
   Antigravity Studio — Workspace Checkpoints & One-Click Rollback Modal
   ========================================================================== */

import { escapeHtml } from './markdown-utils.js';

export function createCheckpointController({ modalEl, onRestored }) {
  if (!modalEl) return { openRollbackModal: () => {} };

  const titleEl = modalEl.querySelector('#cp-modal-title');
  const subEl = modalEl.querySelector('#cp-modal-sub');
  const bodyEl = modalEl.querySelector('#cp-modal-body');
  const statusEl = modalEl.querySelector('#cp-modal-status');
  const confirmBtn = modalEl.querySelector('#btn-cp-confirm-restore');
  const closeBtn = modalEl.querySelector('#btn-cp-cancel');

  let activeCpId = null;

  const close = () => {
    modalEl.classList.remove('open');
    activeCpId = null;
  };

  if (closeBtn) closeBtn.addEventListener('click', close);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl.classList.contains('open')) close();
  });

  const renderFileSection = (label, files, badgeClass, badgeTxt) => {
    if (!files || !files.length) return '';
    return `
      <div class="cp-diff-section">
        <div class="cp-diff-section-title">${escapeHtml(label)} (${files.length})</div>
        <div class="cp-diff-file-list">
          ${files
            .slice(0, 40)
            .map(
              (f) =>
                `<div class="cp-diff-file-row"><span class="rp-git-status-badge ${badgeClass}">${badgeTxt}</span><code>${escapeHtml(f)}</code></div>`
            )
            .join('')}
          ${files.length > 40 ? `<div class="form-hint">…其余 ${files.length - 40} 个文件</div>` : ''}
        </div>
      </div>
    `;
  };

  const openRollbackModal = async (cpId, hintLabel = '') => {
    if (!cpId) return;
    activeCpId = cpId;
    if (titleEl) titleEl.textContent = '回滚工作区到检查点';
    if (subEl) subEl.textContent = hintLabel ? `目标快照：${hintLabel}` : `快照编号：${cpId}`;
    if (statusEl) statusEl.textContent = '';
    if (bodyEl) bodyEl.innerHTML = '<div class="cp-loading">正在比对当前工作区文件变化…</div>';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '确认回滚';
    }
    modalEl.classList.add('open');

    try {
      const res = await fetch(`/api/checkpoints/${encodeURIComponent(cpId)}/preview`);
      const d = await res.json();
      if (!d.ok) {
        if (bodyEl) bodyEl.innerHTML = `<div class="cp-empty">${escapeHtml(d.error || '无法读取检查点信息')}</div>`;
        return;
      }

      if (subEl) {
        const dt = d.created_at ? new Date(d.created_at * 1000).toLocaleString('zh-CN') : '';
        subEl.textContent = `${d.label || cpId} · ${dt} · ${d.cwd}`;
      }

      if (d.total_changes === 0) {
        if (bodyEl) {
          bodyEl.innerHTML =
            '<div class="cp-empty">当前工作区与该检查点完全一致，无需回滚任何文件。</div>';
        }
        return;
      }

      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="cp-summary-banner">
            共检测到 <strong>${d.total_changes}</strong> 处文件差异。点击确认后将自动先保存一份「回滚前备份」，然后恢复工作区文件。
          </div>
          ${renderFileSection('将被恢复的修改文件', d.modified, 'st-M', '恢复')}
          ${renderFileSection('将被重新还原的已删文件', d.deleted, 'st-A', '还原')}
          ${renderFileSection('将被移除的新建文件', d.created, 'st-D', '移除')}
        `;
      }
      if (confirmBtn) confirmBtn.disabled = false;
    } catch (err) {
      if (bodyEl) bodyEl.innerHTML = `<div class="cp-empty">检查失败：${escapeHtml(err.message)}</div>`;
    }
  };

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!activeCpId) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = '回滚中…';
      if (statusEl) statusEl.textContent = '正在备份当前状态并恢复文件…';
      try {
        const res = await fetch(`/api/checkpoints/${encodeURIComponent(activeCpId)}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ create_backup: true }),
        });
        const d = await res.json();
        if (!d.ok) {
          if (statusEl) statusEl.textContent = (d.errors && d.errors.join('; ')) || d.error || '回滚失败';
          confirmBtn.disabled = false;
          confirmBtn.textContent = '确认回滚';
          return;
        }
        if (statusEl) {
          statusEl.textContent = `已回滚完成：恢复 ${d.restored} 个文件，移除 ${d.removed} 个新建文件 ✓`;
        }
        if (onRestored) onRestored(d);
        setTimeout(close, 900);
      } catch (err) {
        if (statusEl) statusEl.textContent = `回滚出错：${err.message}`;
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认回滚';
      }
    });
  }

  return { openRollbackModal, close };
}
