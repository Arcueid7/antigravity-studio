/* ==========================================================================
   Antigravity Studio — Git Worktree Parallel Branch Panel
   ========================================================================== */

import { escapeHtml, shortenPath } from './markdown-utils.js';

export function createWorktreeController({
  listEl,
  branchInputEl,
  addBtnEl,
  statusEl,
  getActiveCwd,
  onEnterWorktree,
}) {
  const showMsg = (txt, kind = '') => {
    if (!statusEl) return;
    statusEl.textContent = txt || '';
    statusEl.style.display = txt ? 'block' : 'none';
    statusEl.className = `rp-git-action-msg ${kind}`.trim();
  };

  const renderList = (data) => {
    if (!listEl) return;
    if (!data || !data.is_git) {
      listEl.innerHTML = `
        <div class="rp-empty-state">
          <div class="rp-empty-icon">⎇</div>
          <div class="rp-empty-title">当前目录非 Git 仓库</div>
          <div class="rp-empty-desc">Git Worktree 支持为同一仓库同时检出多个分支到独立目录，配合多会话后台并发可同时推进多条特性开发。</div>
        </div>
      `;
      return;
    }

    const wts = data.worktrees || [];
    if (!wts.length) {
      listEl.innerHTML = '<div class="rp-empty-state"><div class="rp-empty-desc">暂无 Worktree 列表</div></div>';
      return;
    }

    listEl.innerHTML = '';
    for (const wt of wts) {
      const card = document.createElement('div');
      card.className = 'rp-wt-card' + (wt.is_current ? ' is-current' : '');
      card.innerHTML = `
        <div class="rp-wt-head">
          <div class="rp-wt-branch-row">
            <span class="rp-wt-branch-pill">⎇ ${escapeHtml(wt.branch)}</span>
            ${wt.is_main ? '<span class="rp-stage-pill">主工作区</span>' : ''}
            ${wt.is_current ? '<span class="rp-stage-pill active">当前</span>' : ''}
          </div>
          <span class="rp-wt-head-sha">${escapeHtml(wt.head)}</span>
        </div>
        <div class="rp-wt-path" title="${escapeHtml(wt.path)}">${escapeHtml(shortenPath(wt.path))}</div>
        <div class="rp-wt-actions">
          ${
            wt.is_current
              ? '<span class="form-hint" style="font-size:11.5px;">正在此目录中工作</span>'
              : '<button type="button" class="rp-mini-text-btn accent" data-wt-enter="1">进入此工作区</button>'
          }
          ${
            !wt.is_main && !wt.is_current
              ? '<button type="button" class="rp-mini-text-btn danger" data-wt-remove="1">移除</button>'
              : ''
          }
        </div>
      `;

      const enterBtn = card.querySelector('[data-wt-enter]');
      if (enterBtn) {
        enterBtn.addEventListener('click', () => {
          if (onEnterWorktree) onEnterWorktree(wt.path, wt.branch);
        });
      }

      const rmBtn = card.querySelector('[data-wt-remove]');
      if (rmBtn) {
        rmBtn.addEventListener('click', async () => {
          rmBtn.disabled = true;
          rmBtn.textContent = '移除中…';
          showMsg('');
          try {
            const res = await fetch('/api/workspace/git-worktrees', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cwd: getActiveCwd() || '',
                action: 'remove',
                path: wt.path,
                force: false,
              }),
            });
            const d = await res.json();
            if (!d.ok) {
              showMsg(d.error || '移除失败', 'error');
              rmBtn.disabled = false;
              rmBtn.textContent = '移除';
            } else {
              showMsg(`已移除 Worktree (${wt.branch}) ✓`, 'ok');
              renderList({ is_git: true, worktrees: d.worktrees || [] });
            }
          } catch (err) {
            showMsg(err.message, 'error');
            rmBtn.disabled = false;
            rmBtn.textContent = '移除';
          }
        });
      }

      listEl.appendChild(card);
    }
  };

  const loadWorktrees = async () => {
    if (!listEl) return;
    listEl.innerHTML = '<div class="rp-empty-state"><div class="rp-empty-desc">正在加载 Worktree…</div></div>';
    try {
      const res = await fetch(`/api/workspace/git-worktrees?cwd=${encodeURIComponent(getActiveCwd() || '')}`);
      const data = await res.json();
      renderList(data);
    } catch (err) {
      listEl.innerHTML = `<div class="rp-empty-state"><div class="rp-empty-desc">加载失败：${escapeHtml(err.message)}</div></div>`;
    }
  };

  const createWorktree = async () => {
    const branch = (branchInputEl && branchInputEl.value || '').trim();
    if (!branch) {
      showMsg('请先输入新分支或已有分支名', 'error');
      if (branchInputEl) branchInputEl.focus();
      return;
    }
    if (addBtnEl) {
      addBtnEl.disabled = true;
      addBtnEl.textContent = '创建中…';
    }
    showMsg(`正在为分支 ${branch} 创建独立 Worktree…`);
    try {
      const res = await fetch('/api/workspace/git-worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd: getActiveCwd() || '',
          action: 'add',
          branch,
          create_branch: true,
        }),
      });
      const d = await res.json();
      if (!d.ok) {
        showMsg(d.error || '创建失败', 'error');
      } else {
        if (branchInputEl) branchInputEl.value = '';
        showMsg(`已创建 Worktree：${d.worktree_path} ✓`, 'ok');
        renderList({ is_git: true, worktrees: d.worktrees || [] });
      }
    } catch (err) {
      showMsg(`创建出错：${err.message}`, 'error');
    } finally {
      if (addBtnEl) {
        addBtnEl.disabled = false;
        addBtnEl.textContent = '+ 新建';
      }
    }
  };

  if (addBtnEl) addBtnEl.addEventListener('click', createWorktree);
  if (branchInputEl) {
    branchInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createWorktree();
      }
    });
  }

  return { loadWorktrees };
}
