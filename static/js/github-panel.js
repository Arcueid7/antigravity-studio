/* ==========================================================================
   Antigravity Studio — Git Changes, Commit/Sync, Branches, GitHub PR/Issues,
   Clone Modal & Native RFC 8628 GitHub OAuth Device Flow Controller
   ========================================================================== */

import { escapeHtml } from './markdown-utils.js';

export function createGithubPanelController({
  state,
  dom,
  actions,
}) {
  const $ = (id) => document.getElementById(id);
  const {
    sidePane,
    rpChangesBadge,
    topbarChangesDot,
    rpGitBranch,
    rpGitSummary,
    btnRpDiffAll,
    rpChangesList,
    rpDiffWrap,
    rpDiffPath,
    rpDiffStats,
    rpDiffCode,
    btnRpDiffOpenFile,
    btnRpDiffReview,
    composerInput,
    settingsModal,
  } = dom;

  let ghRepoSearchTimer = null;

  function showGitActionMsg(el, text, kind = '') {
    if (!el) return;
    if (!text) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'rp-git-action-msg';
      return;
    }
    el.style.display = 'block';
    el.textContent = text;
    el.className = 'rp-git-action-msg' + (kind ? ` is-${kind}` : '');
  }

  function renderColoredDiffHtml(diffText) {
    const clean = (diffText || '').trim();
    if (!clean) {
      return '<div style="padding:14px;color:var(--text-muted);font-size:12.5px;">暂无文本差异内容。</div>';
    }
    return clean
      .split(/\r?\n/)
      .map((ln) => {
        let cls = 'diff-ln';
        if (ln.startsWith('@@')) cls += ' diff-hunk';
        else if (ln.startsWith('+++') || ln.startsWith('---') || ln.startsWith('diff --git') || ln.startsWith('index ')) cls += ' diff-meta';
        else if (ln.startsWith('+')) cls += ' diff-add';
        else if (ln.startsWith('-')) cls += ' diff-del';
        return `<div class="${cls}">${escapeHtml(ln) || ' '}</div>`;
      })
      .join('');
  }

  function switchReviewSubTab(tabName) {
    const valid = ['changes', 'pulls', 'issues', 'worktrees'].includes(tabName) ? tabName : 'changes';
    state.rightPane.ghTab = valid;
    document.querySelectorAll('[data-gh-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.ghTab === valid);
    });
    const vChanges = $('rp-gh-view-changes');
    const vPulls = $('rp-gh-view-pulls');
    const vIssues = $('rp-gh-view-issues');
    const vWorktrees = $('rp-gh-view-worktrees');
    if (vChanges) vChanges.style.display = valid === 'changes' ? 'flex' : 'none';
    if (vPulls) vPulls.style.display = valid === 'pulls' ? 'flex' : 'none';
    if (vIssues) vIssues.style.display = valid === 'issues' ? 'flex' : 'none';
    if (vWorktrees) vWorktrees.style.display = valid === 'worktrees' ? 'flex' : 'none';

    const st = state.rightPane.gitStatus;
    const autoRepo = (st && st.github_repo) || '';
    const prRepoInp = $('rp-gh-pr-repo-input');
    const issRepoInp = $('rp-gh-issue-repo-input');
    if (prRepoInp && !prRepoInp.value.trim() && autoRepo) prRepoInp.value = autoRepo;
    if (issRepoInp && !issRepoInp.value.trim() && autoRepo) issRepoInp.value = autoRepo;

    if (valid === 'pulls') loadGithubPulls();
    else if (valid === 'issues') loadGithubIssues();
    else if (valid === 'worktrees' && actions.loadWorktrees) actions.loadWorktrees();
  }

  async function loadGitChanges(silent = false) {
    try {
      const url = `/api/workspace/git-status?cwd=${encodeURIComponent(state.activeCwd || '')}`;
      const res = await fetch(url);
      const data = await res.json();
      state.rightPane.gitStatus = data;

      const count = data.is_git ? (data.files || []).length : 0;
      if (rpChangesBadge) {
        rpChangesBadge.textContent = String(count);
        rpChangesBadge.style.display = count > 0 ? 'inline-flex' : 'none';
      }
      if (topbarChangesDot) topbarChangesDot.style.display = count > 0 ? 'block' : 'none';
      const cntEl = $('rp-gh-changes-cnt');
      if (cntEl) cntEl.textContent = count > 0 ? `(${count})` : '';
      if (silent && (!sidePane.classList.contains('open') || state.sidePaneMode !== 'changes')) return;
      renderGitChangesList();
    } catch {
      if (!silent && rpChangesList) {
        rpChangesList.innerHTML = '<div class="rp-empty-state"><div class="rp-empty-desc">无法读取 Git 状态</div></div>';
      }
    }
  }

  function renderGitChangesList() {
    const st = state.rightPane.gitStatus;
    const branchSel = $('rp-git-branch-select');
    const btnPull = $('btn-rp-git-pull');
    const btnPush = $('btn-rp-git-push');
    const commitBox = $('rp-git-commit-box');
    const repoPill = $('btn-rp-gh-repo-pill');

    if (repoPill) {
      if (st && st.github_repo) {
        repoPill.textContent = st.github_repo;
        repoPill.title = `已关联 GitHub: ${st.github_repo}（点击管理 GitHub 连接）`;
      } else if (state.github.connected && state.github.user) {
        repoPill.textContent = `@${state.github.user.login}`;
        repoPill.title = '已连接 GitHub 账号（点击管理设置）';
      } else {
        repoPill.textContent = '连接 GitHub';
        repoPill.title = '点击配置 GitHub Token';
      }
    }

    if (!st || !st.is_git) {
      if (rpGitBranch) {
        rpGitBranch.style.display = 'inline-flex';
        rpGitBranch.textContent = '非 Git 仓库';
        rpGitBranch.classList.remove('is-git');
      }
      if (branchSel) branchSel.style.display = 'none';
      if (btnPull) btnPull.style.display = 'none';
      if (btnPush) btnPush.style.display = 'none';
      if (commitBox) commitBox.style.display = 'none';
      rpGitSummary.textContent = '';
      btnRpDiffAll.style.display = 'none';
      rpDiffWrap.style.display = 'none';
      rpChangesList.style.maxHeight = '100%';
      rpChangesList.innerHTML = `
        <div class="rp-empty-state">
          <div class="rp-empty-icon">⎇</div>
          <div class="rp-empty-title">当前工作区未初始化 Git</div>
          <div class="rp-empty-desc">可直接一键初始化本地 Git 仓库，或从 GitHub 克隆远程仓库开始协作；也可以切到上方「PR / Issue」输入任意 <code>owner/repo</code> 在线审查。</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px;">
            <button type="button" class="primary-btn" id="btn-inline-git-init" style="padding:6px 13px;font-size:12.5px;">初始化 Git 仓库</button>
            <button type="button" class="topbar-pill-btn" id="btn-inline-gh-clone" style="font-size:12.5px;">从 GitHub 克隆…</button>
          </div>
        </div>
      `;
      const initBtn = $('btn-inline-git-init');
      if (initBtn) {
        initBtn.addEventListener('click', async () => {
          initBtn.disabled = true;
          initBtn.textContent = '初始化中…';
          const res = await fetch('/api/workspace/git-init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: state.activeCwd || '', create_gitignore: true }),
          });
          const d = await res.json();
          if (d.ok) await loadGitChanges(false);
          else {
            initBtn.disabled = false;
            initBtn.textContent = d.error || '初始化失败';
          }
        });
      }
      const clBtn = $('btn-inline-gh-clone');
      if (clBtn) clBtn.addEventListener('click', () => openGithubCloneModal());
      return;
    }

    const files = st.files || [];
    if (rpGitBranch) rpGitBranch.style.display = 'none';
    if (branchSel) {
      branchSel.style.display = 'inline-block';
      branchSel.innerHTML = '';
      const brList = st.branches && st.branches.length ? st.branches : [st.branch || 'main'];
      for (const b of brList) {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = `⎇ ${b}`;
        if (b === st.branch) opt.selected = true;
        branchSel.appendChild(opt);
      }
      const newOpt = document.createElement('option');
      newOpt.value = '__CREATE__';
      newOpt.textContent = '+ 新建分支…';
      branchSel.appendChild(newOpt);
    }

    const hasRemote = Boolean(st.remote_url);
    if (btnPull) {
      btnPull.style.display = hasRemote ? 'inline-flex' : 'none';
      btnPull.textContent = st.behind > 0 ? `↓ Pull (${st.behind})` : '↓ Pull';
    }
    if (btnPush) {
      btnPush.style.display = hasRemote ? 'inline-flex' : 'none';
      btnPush.textContent = st.ahead > 0 ? `↑ Push (${st.ahead})` : '↑ Push';
    }

    rpGitSummary.textContent = files.length ? `${files.length} 改动` : (hasRemote ? '已同步' : '干净');
    btnRpDiffAll.style.display = files.length > 1 ? 'inline-flex' : 'none';
    if (commitBox) commitBox.style.display = files.length > 0 ? 'flex' : 'none';

    if (!files.length) {
      rpDiffWrap.style.display = 'none';
      rpChangesList.style.maxHeight = '100%';
      rpChangesList.innerHTML = `
        <div class="rp-empty-state">
          <div class="rp-empty-icon">✓</div>
          <div class="rp-empty-title">工作区干净，暂无未提交改动</div>
          <div class="rp-empty-desc">${
            st.github_repo
              ? `已关联 <code>${escapeHtml(st.github_repo)}</code>，可点击上方 Pull/Push 同步或切换至 PR / Issue 页签查看协作任务。`
              : '当 <code>agy</code> 或你修改项目文件后，这里会自动列出变更文件、AI 提交与行级 Diff。'
          }</div>
        </div>
      `;
      return;
    }

    rpChangesList.style.maxHeight = '32%';
    rpChangesList.innerHTML = '';
    for (const f of files) {
      const row = document.createElement('div');
      row.className = 'rp-change-row' + (state.rightPane.activeDiffPath === f.path ? ' active' : '');
      row.title = f.path;
      row.innerHTML = `
        <span class="rp-git-status-badge st-${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
        <span class="rp-tree-name">${escapeHtml(f.path)}</span>
        ${f.staged ? '<span class="rp-stage-pill">已暂存</span>' : ''}
        <button type="button" class="rp-change-stage-btn" data-stage-toggle="1" title="${f.staged ? '取消暂存' : '暂存此文件'}">${f.staged ? '−' : '+'}</button>
      `;
      row.addEventListener('click', async (e) => {
        if (e.target.closest('[data-stage-toggle]')) {
          e.stopPropagation();
          await fetch('/api/workspace/git-stage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: state.activeCwd || '', paths: [f.path], unstage: Boolean(f.staged) }),
          });
          await loadGitChanges(false);
          return;
        }
        loadGitDiff(f.path);
      });
      rpChangesList.appendChild(row);
    }

    const stillExists = files.some((f) => f.path === state.rightPane.activeDiffPath);
    if (!stillExists && state.rightPane.activeDiffPath !== '__ALL__') {
      loadGitDiff(files[0].path);
    }
  }

  async function loadGitDiff(relPath) {
    state.rightPane.activeDiffPath = relPath || '__ALL__';
    rpChangesList.querySelectorAll('.rp-change-row').forEach((btn) => {
      btn.classList.toggle('active', btn.title === relPath);
    });
    rpDiffWrap.style.display = 'flex';
    rpDiffPath.textContent = relPath || '全部工作区改动';
    rpDiffPath.title = relPath || '全部工作区改动';
    rpDiffStats.innerHTML = '';
    btnRpDiffOpenFile.style.display = relPath ? 'inline-flex' : 'none';
    rpDiffCode.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;">正在加载 Diff…</div>';
    try {
      const url = `/api/workspace/git-diff?cwd=${encodeURIComponent(state.activeCwd || '')}&path=${encodeURIComponent(relPath || '')}`;
      const res = await fetch(url);
      const data = await res.json();
      rpDiffStats.innerHTML = `<span class="rp-diff-stat-add">+${data.additions || 0}</span><span class="rp-diff-stat-del">-${data.deletions || 0}</span>`;
      rpDiffCode.innerHTML = renderColoredDiffHtml(data.diff || '');
    } catch (err) {
      rpDiffCode.innerHTML = `<div style="padding:16px;color:#ef4444;font-size:12.5px;">加载 Diff 失败：${escapeHtml(err.message)}</div>`;
    }
  }

  async function runGitCommit(andPush = false) {
    const inp = $('rp-git-commit-msg');
    const msgEl = $('rp-git-action-msg');
    const msg = (inp && inp.value || '').trim();
    if (!msg) {
      showGitActionMsg(msgEl, '请先输入 Commit 信息，或点击「✦ AI 写 Commit」自动生成', 'error');
      if (inp) inp.focus();
      return;
    }
    const btnC = $('btn-rp-git-commit');
    const btnP = $('btn-rp-git-commit-push');
    if (btnC) btnC.disabled = true;
    if (btnP) btnP.disabled = true;
    showGitActionMsg(msgEl, andPush ? '正在提交并推送…' : '正在提交…');
    try {
      const res = await fetch('/api/workspace/git-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: state.activeCwd || '', message: msg, stage_all: false, push: andPush }),
      });
      const data = await res.json();
      if (!data.ok) {
        showGitActionMsg(msgEl, data.error || '提交失败', 'error');
      } else if (data.push_error) {
        if (inp) inp.value = '';
        showGitActionMsg(msgEl, `已提交到本地，但推送失败：${data.push_error}`, 'error');
        await loadGitChanges(false);
      } else {
        if (inp) inp.value = '';
        showGitActionMsg(msgEl, data.pushed ? '已提交并成功推送到远程 ✓' : '已提交到本地仓库 ✓', 'ok');
        await loadGitChanges(false);
      }
    } catch (err) {
      showGitActionMsg(msgEl, `操作失败：${err.message}`, 'error');
    } finally {
      if (btnC) btnC.disabled = false;
      if (btnP) btnP.disabled = false;
    }
  }

  async function runGitSync(action) {
    const msgEl = $('rp-git-action-msg');
    const btn = action === 'pull' ? $('btn-rp-git-pull') : $('btn-rp-git-push');
    const orig = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = action === 'pull' ? '拉取中…' : '推送中…';
    }
    try {
      const res = await fetch('/api/workspace/git-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: state.activeCwd || '', action }),
      });
      const data = await res.json();
      if (!data.ok) {
        showGitActionMsg(msgEl, data.error || `git ${action} 失败`, 'error');
        if ($('rp-git-commit-box')) $('rp-git-commit-box').style.display = 'flex';
      } else {
        showGitActionMsg(msgEl, action === 'pull' ? '已拉取最新远程代码 ✓' : '已推送到远程仓库 ✓', 'ok');
        await loadGitChanges(false);
      }
    } catch (err) {
      showGitActionMsg(msgEl, `同步失败：${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (btn.textContent.includes('中…')) btn.textContent = orig;
      }
    }
  }

  async function generateAiCommitMsg() {
    const btn = $('btn-rp-git-ai-commit');
    const inp = $('rp-git-commit-msg');
    const msgEl = $('rp-git-action-msg');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '✦ 生成中…';
    }
    showGitActionMsg(msgEl, '正在让 agy 阅读当前改动并起草提交信息…');
    try {
      const res = await fetch('/api/workspace/git-ai-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: state.activeCwd || '' }),
      });
      const data = await res.json();
      if (data.ok && data.message) {
        if (inp) {
          inp.value = data.message;
          inp.focus();
        }
        showGitActionMsg(msgEl, data.source === 'agy' ? '已由 agy 生成提交信息，可直接提交或微调 ✓' : '已按变更摘要生成提交信息 ✓', 'ok');
      } else {
        showGitActionMsg(msgEl, data.error || '生成失败', 'error');
      }
    } catch (err) {
      showGitActionMsg(msgEl, `生成失败：${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '✦ AI 写 Commit';
      }
    }
  }

  async function loadGithubStatusUi() {
    try {
      const res = await fetch(`/api/github/status?cwd=${encodeURIComponent(state.activeCwd || '')}`);
      const d = await res.json();
      state.github.connected = Boolean(d.connected);
      state.github.user = d.user || null;
      state.github.defaultCloneDir = d.default_clone_dir || '';

      const nameEl = $('gh-account-name');
      const subEl = $('gh-account-sub');
      const avImg = $('gh-avatar-img');
      const avFb = $('gh-avatar-fallback');
      const btnWebLogin = $('btn-gh-web-login');
      const btnDisc = $('btn-gh-disconnect');
      const devBox = $('gh-device-flow-box');
      const cidInp = $('input-gh-client-id');
      const inName = $('input-git-name');
      const inEmail = $('input-git-email');

      if (cidInp && d.oauth_client_id !== undefined && !cidInp.value.trim()) cidInp.value = d.oauth_client_id || '';
      if (inName && d.git_user_name !== undefined) inName.value = d.git_user_name || '';
      if (inEmail && d.git_user_email !== undefined) inEmail.value = d.git_user_email || '';

      if (d.connected && d.user) {
        if (nameEl) nameEl.textContent = `${d.user.name || d.user.login} (@${d.user.login})`;
        if (subEl) subEl.textContent = `已连接 · ${d.user.public_repos || 0} 公开仓库 / ${d.user.total_private_repos || 0} 私有仓库`;
        if (avImg && d.user.avatar_url) {
          avImg.src = d.user.avatar_url;
          avImg.style.display = 'block';
          if (avFb) avFb.style.display = 'none';
        }
        if (btnWebLogin) btnWebLogin.style.display = 'none';
        if (btnDisc) btnDisc.style.display = 'inline-flex';
        if (devBox) devBox.style.display = 'none';
      } else {
        if (nameEl) nameEl.textContent = '尚未连接 GitHub 账号';
        if (subEl) subEl.textContent = '公开仓库无需登录也可浏览与克隆；浏览器授权登录后解锁私有仓库、推送与创建 PR。';
        if (avImg) avImg.style.display = 'none';
        if (avFb) avFb.style.display = 'inline';
        if (btnWebLogin) btnWebLogin.style.display = 'inline-flex';
        if (btnDisc) btnDisc.style.display = 'none';
      }
    } catch {
      // ignore offline
    }
  }

  async function loadGithubPulls() {
    const listEl = $('rp-gh-pr-list');
    const repoInp = $('rp-gh-pr-repo-input');
    const stSel = $('rp-gh-pr-state');
    if (!listEl) return;
    const repo = (repoInp && repoInp.value || '').trim();
    const prState = (stSel && stSel.value) || 'open';
    listEl.innerHTML = '<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">正在加载 Pull Requests…</div></div>';
    try {
      const url = `/api/github/pulls?cwd=${encodeURIComponent(state.activeCwd || '')}&repo=${encodeURIComponent(repo)}&state=${encodeURIComponent(prState)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.repo && repoInp && !repoInp.value.trim()) repoInp.value = data.repo;
      if (!data.ok) {
        listEl.innerHTML = `<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">${escapeHtml(data.error || '加载失败')}</div></div>`;
        return;
      }
      if (!data.repo) {
        listEl.innerHTML = '<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-title">未关联 GitHub 仓库</div><div class="rp-empty-desc">请在上方输入框直接填写任意 <code>owner/repo</code> 回车查看 PR，或克隆一个 GitHub 项目。</div></div>';
        return;
      }
      const pulls = data.pulls || [];
      state.github.pulls = pulls;
      if (!pulls.length) {
        listEl.innerHTML = `<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">${escapeHtml(data.repo)} 暂无 ${prState} 状态的 Pull Request</div></div>`;
        return;
      }
      listEl.innerHTML = '';
      for (const pr of pulls) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'rp-gh-item-row' + (state.github.activePr && state.github.activePr.number === pr.number ? ' active' : '');
        row.innerHTML = `
          <div class="rp-gh-item-top">
            <span class="rp-gh-num">#${pr.number}</span>
            <span>${escapeHtml(pr.title)}</span>
          </div>
          <div class="rp-gh-item-meta">
            <span>@${escapeHtml(pr.user)}</span>
            <span>${escapeHtml(pr.head)} → ${escapeHtml(pr.base)}</span>
            ${pr.draft ? '<span class="rp-gh-label-pill">Draft</span>' : ''}
          </div>
        `;
        row.addEventListener('click', () => openGithubPullDetail(pr.number, data.repo));
        listEl.appendChild(row);
      }
    } catch (err) {
      listEl.innerHTML = `<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">请求失败：${escapeHtml(err.message)}</div></div>`;
    }
  }

  async function openGithubPullDetail(num, repoOverride = '') {
    const det = $('rp-gh-pr-detail');
    const titleEl = $('rp-gh-pr-detail-title');
    const bodyEl = $('rp-gh-pr-detail-body');
    const extEl = $('btn-rp-gh-pr-ext');
    if (!det || !bodyEl) return;
    det.style.display = 'flex';
    if (titleEl) titleEl.textContent = `PR #${num} 加载中…`;
    bodyEl.innerHTML = '<div style="color:var(--text-muted);">正在拉取 PR 详情与 Diff…</div>';
    const repo = repoOverride || ($('rp-gh-pr-repo-input') && $('rp-gh-pr-repo-input').value.trim()) || '';
    try {
      const url = `/api/github/pull-detail?cwd=${encodeURIComponent(state.activeCwd || '')}&repo=${encodeURIComponent(repo)}&number=${num}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok || !data.pull) {
        bodyEl.innerHTML = `<div style="color:var(--danger);">${escapeHtml(data.error || '读取 PR 失败')}</div>`;
        return;
      }
      const pr = data.pull;
      state.github.activePr = { ...pr, repo: data.repo, diff: data.diff || '' };
      if (titleEl) {
        titleEl.textContent = `#${pr.number} ${pr.title}`;
        titleEl.title = `#${pr.number} ${pr.title}`;
      }
      if (extEl) extEl.href = pr.html_url || '#';
      bodyEl.innerHTML = `
        <div class="rp-gh-item-meta" style="margin-bottom:8px;">
          <span>@${escapeHtml(pr.user)}</span>
          <span>${escapeHtml(pr.head)} → ${escapeHtml(pr.base)}</span>
          <span class="rp-diff-stat-add">+${pr.additions}</span>
          <span class="rp-diff-stat-del">-${pr.deletions}</span>
          <span>${pr.changed_files} 文件</span>
        </div>
        ${pr.body ? `<div class="claude-prose" style="font-size:12.5px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle);">${actions.renderMarkdown(pr.body, false)}</div>` : ''}
        <div class="rp-diff-code" style="border:1px solid var(--border-subtle);border-radius:8px;">${renderColoredDiffHtml(data.diff || '')}</div>
      `;
    } catch (err) {
      bodyEl.innerHTML = `<div style="color:var(--danger);">${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadGithubIssues() {
    const listEl = $('rp-gh-issue-list');
    const repoInp = $('rp-gh-issue-repo-input');
    const stSel = $('rp-gh-issue-state');
    if (!listEl) return;
    const repo = (repoInp && repoInp.value || '').trim();
    const issState = (stSel && stSel.value) || 'open';
    listEl.innerHTML = '<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">正在加载 Issues…</div></div>';
    try {
      const url = `/api/github/issues?cwd=${encodeURIComponent(state.activeCwd || '')}&repo=${encodeURIComponent(repo)}&state=${encodeURIComponent(issState)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.repo && repoInp && !repoInp.value.trim()) repoInp.value = data.repo;
      if (!data.ok) {
        listEl.innerHTML = `<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">${escapeHtml(data.error || '加载失败')}</div></div>`;
        return;
      }
      if (!data.repo) {
        listEl.innerHTML = '<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-title">未关联 GitHub 仓库</div><div class="rp-empty-desc">请在上方输入任意 <code>owner/repo</code> 并点击加载查看 Issues。</div></div>';
        return;
      }
      const issues = data.issues || [];
      state.github.issues = issues;
      if (!issues.length) {
        listEl.innerHTML = `<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">${escapeHtml(data.repo)} 暂无 ${issState} 状态的 Issue</div></div>`;
        return;
      }
      listEl.innerHTML = '';
      for (const iss of issues) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'rp-gh-item-row' + (state.github.activeIssue && state.github.activeIssue.number === iss.number ? ' active' : '');
        const labelsHtml = (iss.labels || []).map((lb) => `<span class="rp-gh-label-pill">${escapeHtml(lb.name)}</span>`).join('');
        row.innerHTML = `
          <div class="rp-gh-item-top">
            <span class="rp-gh-num">#${iss.number}</span>
            <span>${escapeHtml(iss.title)}</span>
          </div>
          <div class="rp-gh-item-meta">
            <span>@${escapeHtml(iss.user)}</span>
            <span>💬 ${iss.comments || 0}</span>
            ${labelsHtml}
          </div>
        `;
        row.addEventListener('click', () => {
          state.github.activeIssue = { ...iss, repo: data.repo };
          const det = $('rp-gh-issue-detail');
          const tEl = $('rp-gh-issue-detail-title');
          const bEl = $('rp-gh-issue-detail-body');
          const extEl = $('btn-rp-gh-issue-ext');
          if (det) det.style.display = 'flex';
          if (tEl) tEl.textContent = `#${iss.number} ${iss.title}`;
          if (extEl) extEl.href = iss.html_url || '#';
          if (bEl) {
            bEl.innerHTML = iss.body
              ? `<div class="claude-prose" style="font-size:12.5px;">${actions.renderMarkdown(iss.body, false)}</div>`
              : '<div style="color:var(--text-muted);">（此 Issue 无正文描述）</div>';
          }
          listEl.querySelectorAll('.rp-gh-item-row').forEach((r) => r.classList.toggle('active', r === row));
        });
        listEl.appendChild(row);
      }
    } catch (err) {
      listEl.innerHTML = `<div class="rp-empty-state" style="padding:20px;"><div class="rp-empty-desc">请求失败：${escapeHtml(err.message)}</div></div>`;
    }
  }

  async function loadGithubReposList(query = '') {
    const listEl = $('gh-repo-list');
    const hintEl = $('gh-repo-list-hint');
    if (!listEl) return;
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12.5px;">正在加载 GitHub 仓库…</div>';
    try {
      const res = await fetch(`/api/github/repos?q=${encodeURIComponent(query || '')}`);
      const data = await res.json();
      if (!data.ok) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger);font-size:12.5px;">${escapeHtml(data.error || '加载失败')}</div>`;
        return;
      }
      const repos = data.repos || [];
      if (hintEl) {
        hintEl.textContent = data.source === 'user' ? `我的仓库 (${repos.length})` : data.source === 'search' ? `GitHub 搜索 (${repos.length})` : '输入关键词搜索公开仓库，或先连接账号查看私人仓库';
      }
      if (!repos.length) {
        listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12.5px;">输入关键词搜索 GitHub 仓库（如 <code>antigravity</code>），或在「GitHub 账号设置」连接 Token 后自动列出你的全部仓库。</div>';
        return;
      }
      listEl.innerHTML = '';
      for (const r of repos) {
        const row = document.createElement('div');
        row.className = 'gh-repo-row';
        row.innerHTML = `
          <div class="gh-repo-main">
            <div class="gh-repo-name">
              <span>${escapeHtml(r.full_name)}</span>
              ${r.private ? '<span class="gh-priv-badge">Private</span>' : ''}
              ${r.language ? `<span class="gh-priv-badge">${escapeHtml(r.language)}</span>` : ''}
              ${r.stars ? `<span style="font-size:11px;color:var(--text-muted);font-weight:400;">★ ${r.stars}</span>` : ''}
            </div>
            <div class="gh-repo-desc">${escapeHtml(r.description || '无描述')}</div>
          </div>
          <button type="button" class="rp-chip-btn accent" data-clone-slug="${escapeHtml(r.full_name)}">克隆</button>
        `;
        row.querySelector('[data-clone-slug]').addEventListener('click', () => {
          if ($('gh-clone-url')) $('gh-clone-url').value = r.full_name;
          doGithubClone(r.full_name);
        });
        listEl.appendChild(row);
      }
    } catch (err) {
      listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--danger);font-size:12.5px;">加载失败：${escapeHtml(err.message)}</div>`;
    }
  }

  async function openGithubCloneModal() {
    const modal = $('github-clone-modal');
    if (!modal) return;
    await loadGithubStatusUi();
    const dirInp = $('gh-clone-dir');
    if (dirInp && !dirInp.value.trim()) dirInp.value = state.github.defaultCloneDir || '';
    if ($('gh-clone-status')) $('gh-clone-status').textContent = '';
    modal.classList.add('open');
    loadGithubReposList(($('gh-repo-search') && $('gh-repo-search').value) || '');
    setTimeout(() => $('gh-clone-url') && $('gh-clone-url').focus(), 40);
  }

  async function doGithubClone(urlOverride = '') {
    const urlInp = $('gh-clone-url');
    const dirInp = $('gh-clone-dir');
    const stEl = $('gh-clone-status');
    const btn = $('btn-gh-do-clone');
    const targetUrl = (urlOverride || (urlInp && urlInp.value) || '').trim();
    if (!targetUrl) {
      if (stEl) stEl.textContent = '请输入 GitHub 仓库地址或 owner/repo';
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = '克隆中…';
    }
    if (stEl) stEl.textContent = `正在克隆 ${targetUrl}，请稍候…`;
    try {
      const res = await fetch('/api/github/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, parent_dir: (dirInp && dirInp.value.trim()) || '' }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (stEl) stEl.textContent = `克隆失败：${data.error || '未知错误'}`;
        return;
      }
      if (data.projects) {
        state.settings.projects = data.projects;
        actions.renderProjectList();
      }
      $('github-clone-modal').classList.remove('open');
      await actions.setActiveWorkspace(data.path, true);
      actions.startNewChatView(data.path);
      actions.openToolTab('changes');
    } catch (err) {
      if (stEl) stEl.textContent = `请求出错：${err.message}`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '克隆并打开';
      }
    }
  }

  function bindEvents() {
    if (btnRpDiffAll) btnRpDiffAll.addEventListener('click', () => loadGitDiff(''));
    if (btnRpDiffOpenFile) {
      btnRpDiffOpenFile.addEventListener('click', () => {
        if (state.rightPane.activeDiffPath && state.rightPane.activeDiffPath !== '__ALL__') {
          actions.openFileInRightPane(state.rightPane.activeDiffPath);
        }
      });
    }
    if (btnRpDiffReview) {
      btnRpDiffReview.addEventListener('click', () => {
        const p = state.rightPane.activeDiffPath;
        const st = state.rightPane.gitStatus;
        if (p && p !== '__ALL__' && st && st.repo_root) {
          const abs = `${st.repo_root.replace(/[\\/]+$/, '')}\\${p.replace(/\//g, '\\')}`;
          actions.citeWorkspaceFileToComposer(abs, p, 0, false, `请审查我对 \`${p}\` 的最新修改，检查潜在问题并给出优化建议。`);
        } else {
          composerInput.value = '请审查当前工作区的全部 Git 改动（git diff），检查潜在 bug 与优化点。';
          actions.autoResizeTextarea();
          if (state.activeView !== 'chat') actions.switchMainView('chat');
          composerInput.focus();
        }
      });
    }

    document.querySelectorAll('[data-gh-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchReviewSubTab(btn.dataset.ghTab));
    });
    if ($('btn-rp-gh-repo-pill')) {
      $('btn-rp-gh-repo-pill').addEventListener('click', () => {
        $('btn-open-settings').click();
        const ghNav = document.querySelector('.agy-settings-nav-item[data-stab="github"]');
        if (ghNav) ghNav.click();
      });
    }
    if ($('btn-rp-git-pull')) $('btn-rp-git-pull').addEventListener('click', () => runGitSync('pull'));
    if ($('btn-rp-git-push')) $('btn-rp-git-push').addEventListener('click', () => runGitSync('push'));
    if ($('btn-rp-git-ai-commit')) $('btn-rp-git-ai-commit').addEventListener('click', () => generateAiCommitMsg());
    if ($('btn-rp-git-commit')) $('btn-rp-git-commit').addEventListener('click', () => runGitCommit(false));
    if ($('btn-rp-git-commit-push')) $('btn-rp-git-commit-push').addEventListener('click', () => runGitCommit(true));

    // Branch switcher & inline create-branch
    const branchSelEl = $('rp-git-branch-select');
    if (branchSelEl) {
      branchSelEl.addEventListener('change', async () => {
        const val = branchSelEl.value;
        const st = state.rightPane.gitStatus;
        const curBranch = (st && st.branch) || '';
        const msgEl = $('rp-git-action-msg');
        if (val === '__CREATE__') {
          if (curBranch) branchSelEl.value = curBranch;
          const box = $('rp-git-commit-box');
          if (box) box.style.display = 'flex';
          const existing = $('rp-inline-branch-bar');
          if (existing) existing.remove();
          const bar = document.createElement('div');
          bar.id = 'rp-inline-branch-bar';
          bar.style.cssText = 'display:flex;gap:6px;align-items:center;';
          bar.innerHTML = `
            <input type="text" id="rp-new-branch-input" class="form-input rp-gh-sm-input" style="flex:1;" placeholder="输入新分支名（如 feat/github）" />
            <button type="button" class="rp-chip-btn accent" id="btn-confirm-new-branch">创建</button>
            <button type="button" class="rp-mini-text-btn" id="btn-cancel-new-branch">取消</button>
          `;
          box.prepend(bar);
          const brInp = $('rp-new-branch-input');
          if (brInp) brInp.focus();
          $('btn-cancel-new-branch').addEventListener('click', () => bar.remove());
          const submitBr = async () => {
            const name = (brInp && brInp.value || '').trim();
            if (!name) return;
            const res = await fetch('/api/workspace/git-branch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cwd: state.activeCwd || '', action: 'create', name }),
            });
            const d = await res.json();
            bar.remove();
            if (d.ok) {
              showGitActionMsg(msgEl, `已新建并切换至分支 ${name} ✓`, 'ok');
              await loadGitChanges(false);
            } else {
              showGitActionMsg(msgEl, d.error || '新建分支失败', 'error');
            }
          };
          $('btn-confirm-new-branch').addEventListener('click', submitBr);
          if (brInp) brInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitBr(); else if (e.key === 'Escape') bar.remove(); });
          return;
        }
        if (val && val !== curBranch) {
          const res = await fetch('/api/workspace/git-branch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: state.activeCwd || '', action: 'switch', name: val }),
          });
          const d = await res.json();
          if (d.ok) {
            showGitActionMsg(msgEl, `已切换至分支 ${val} ✓`, 'ok');
            await loadGitChanges(false);
          } else {
            showGitActionMsg(msgEl, d.error || '切换分支失败', 'error');
            if (curBranch) branchSelEl.value = curBranch;
          }
        }
      });
    }

    // PR Controls
    if ($('rp-gh-pr-state')) $('rp-gh-pr-state').addEventListener('change', () => loadGithubPulls());
    if ($('rp-gh-pr-repo-input')) {
      $('rp-gh-pr-repo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadGithubPulls(); });
    }
    if ($('btn-rp-gh-new-pr')) {
      $('btn-rp-gh-new-pr').addEventListener('click', () => {
        const box = $('rp-gh-pr-create-box');
        if (!box) return;
        const willOpen = box.style.display === 'none';
        box.style.display = willOpen ? 'flex' : 'none';
        if (willOpen) {
          const st = state.rightPane.gitStatus;
          if ($('rp-gh-pr-head') && st && st.branch && !$('rp-gh-pr-head').value.trim()) $('rp-gh-pr-head').value = st.branch;
          if ($('rp-gh-pr-title')) $('rp-gh-pr-title').focus();
        }
      });
    }
    if ($('btn-rp-gh-pr-cancel')) {
      $('btn-rp-gh-pr-cancel').addEventListener('click', () => { if ($('rp-gh-pr-create-box')) $('rp-gh-pr-create-box').style.display = 'none'; });
    }
    if ($('btn-rp-gh-pr-submit')) {
      $('btn-rp-gh-pr-submit').addEventListener('click', async () => {
        const msgEl = $('rp-gh-pr-create-msg');
        const btn = $('btn-rp-gh-pr-submit');
        btn.disabled = true;
        showGitActionMsg(msgEl, '正在创建 Pull Request…');
        try {
          const res = await fetch('/api/github/pulls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cwd: state.activeCwd || '',
              repo: ($('rp-gh-pr-repo-input') && $('rp-gh-pr-repo-input').value.trim()) || '',
              title: ($('rp-gh-pr-title') && $('rp-gh-pr-title').value.trim()) || '',
              base: ($('rp-gh-pr-base') && $('rp-gh-pr-base').value.trim()) || '',
              head: ($('rp-gh-pr-head') && $('rp-gh-pr-head').value.trim()) || '',
              body: ($('rp-gh-pr-body') && $('rp-gh-pr-body').value.trim()) || '',
            }),
          });
          const data = await res.json();
          if (!data.ok) {
            showGitActionMsg(msgEl, data.error || '创建失败', 'error');
          } else {
            showGitActionMsg(msgEl, `已创建 PR #${data.pull.number} ✓`, 'ok');
            if ($('rp-gh-pr-title')) $('rp-gh-pr-title').value = '';
            if ($('rp-gh-pr-body')) $('rp-gh-pr-body').value = '';
            setTimeout(() => { if ($('rp-gh-pr-create-box')) $('rp-gh-pr-create-box').style.display = 'none'; }, 900);
            loadGithubPulls();
          }
        } catch (err) {
          showGitActionMsg(msgEl, err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }
    if ($('btn-rp-gh-pr-close')) {
      $('btn-rp-gh-pr-close').addEventListener('click', () => { if ($('rp-gh-pr-detail')) $('rp-gh-pr-detail').style.display = 'none'; });
    }
    if ($('btn-rp-gh-pr-review')) {
      $('btn-rp-gh-pr-review').addEventListener('click', () => {
        const pr = state.github.activePr;
        if (!pr) return;
        const promptText = [
          `请对 GitHub 仓库 \`${pr.repo}\` 的 Pull Request #${pr.number} 进行深度 Code Review：`,
          `- 标题：${pr.title}`,
          `- 分支：\`${pr.head}\` → \`${pr.base}\`（+${pr.additions} / -${pr.deletions}，${pr.changed_files} 个文件）`,
          pr.body ? `- 说明：\n${pr.body.slice(0, 1200)}` : '',
          '',
          '请重点检查逻辑 bug、边界条件、安全隐患、性能问题与可维护性建议，并给出按优先级排序的修改意见。',
          '',
          '```diff',
          (pr.diff || '').slice(0, 14000),
          '```',
        ].filter(Boolean).join('\n');
        composerInput.value = promptText;
        actions.autoResizeTextarea();
        if (state.activeView !== 'chat') actions.switchMainView('chat');
        composerInput.focus();
      });
    }

    // Issue Controls
    if ($('rp-gh-issue-state')) $('rp-gh-issue-state').addEventListener('change', () => loadGithubIssues());
    if ($('btn-rp-gh-issue-load')) $('btn-rp-gh-issue-load').addEventListener('click', () => loadGithubIssues());
    if ($('rp-gh-issue-repo-input')) {
      $('rp-gh-issue-repo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadGithubIssues(); });
    }
    if ($('btn-rp-gh-issue-close')) {
      $('btn-rp-gh-issue-close').addEventListener('click', () => { if ($('rp-gh-issue-detail')) $('rp-gh-issue-detail').style.display = 'none'; });
    }
    if ($('btn-rp-gh-issue-fix')) {
      $('btn-rp-gh-issue-fix').addEventListener('click', () => {
        const iss = state.github.activeIssue;
        if (!iss) return;
        const promptText = [
          `请帮我分析 GitHub 仓库 \`${iss.repo}\` 的 Issue #${iss.number} 并给出修复方案：`,
          `- 标题：${iss.title}`,
          `- 链接：${iss.html_url}`,
          iss.body ? `\nIssue 内容：\n${iss.body.slice(0, 2500)}` : '',
          '\n请先定位问题根因，再给出具体的代码修改步骤或直接帮我修改本地代码。',
        ].filter(Boolean).join('\n');
        composerInput.value = promptText;
        actions.autoResizeTextarea();
        if (state.activeView !== 'chat') actions.switchMainView('chat');
        composerInput.focus();
      });
    }

    // Sidebar & Clone Modal Controls
    if ($('btn-clone-github')) $('btn-clone-github').addEventListener('click', () => openGithubCloneModal());
    if ($('btn-close-gh-clone')) $('btn-close-gh-clone').addEventListener('click', () => $('github-clone-modal').classList.remove('open'));
    if ($('github-clone-modal')) {
      $('github-clone-modal').addEventListener('click', (e) => { if (e.target === $('github-clone-modal')) $('github-clone-modal').classList.remove('open'); });
    }
    if ($('btn-gh-do-clone')) $('btn-gh-do-clone').addEventListener('click', () => doGithubClone());
    if ($('gh-clone-url')) $('gh-clone-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') doGithubClone(); });
    if ($('gh-repo-search')) {
      $('gh-repo-search').addEventListener('input', () => {
        clearTimeout(ghRepoSearchTimer);
        ghRepoSearchTimer = setTimeout(() => loadGithubReposList($('gh-repo-search').value), 260);
      });
    }
    if ($('btn-gh-clone-open-settings')) {
      $('btn-gh-clone-open-settings').addEventListener('click', () => {
        $('github-clone-modal').classList.remove('open');
        $('btn-open-settings').click();
        const ghNav = document.querySelector('.agy-settings-nav-item[data-stab="github"]');
        if (ghNav) ghNav.click();
      });
    }

    // Native RFC 8628 GitHub OAuth Device Flow + PAT Fallback
    let ghLoginPollTimer = null;
    const stopGhLoginPolling = () => {
      if (ghLoginPollTimer) {
        clearTimeout(ghLoginPollTimer);
        ghLoginPollTimer = null;
      }
    };
    const showGhDeviceBox = (code, url) => {
      const box = $('gh-device-flow-box');
      const codeEl = $('gh-device-code');
      const linkEl = $('link-gh-device-url');
      if (box) box.style.display = 'flex';
      if (codeEl && code) {
        codeEl.textContent = code;
        navigator.clipboard.writeText(code).catch(() => {});
      }
      if (linkEl && url) linkEl.href = url;
    };
    const scheduleOAuthPoll = (delaySec, btn, stEl) => {
      stopGhLoginPolling();
      ghLoginPollTimer = setTimeout(async () => {
        try {
          const pr = await fetch('/api/github/oauth/poll', { method: 'POST' });
          const pd = await pr.json();
          if (pd.status === 'success') {
            stopGhLoginPolling();
            if ($('gh-device-flow-box')) $('gh-device-flow-box').style.display = 'none';
            if (stEl) stEl.textContent = `浏览器授权成功，已连接 @${(pd.user && pd.user.login) || 'GitHub'} ✓`;
            if (btn) btn.disabled = false;
            await loadGithubStatusUi();
            renderGitChangesList();
          } else if (pd.status === 'pending' || pd.status === 'slow_down') {
            scheduleOAuthPoll(pd.interval || delaySec, btn, stEl);
          } else {
            stopGhLoginPolling();
            if ($('gh-device-flow-box')) $('gh-device-flow-box').style.display = 'none';
            if (pd.error && stEl) stEl.textContent = pd.error;
            if (btn) btn.disabled = false;
          }
        } catch {
          scheduleOAuthPoll(Math.max(5, delaySec), btn, stEl);
        }
      }, Math.max(5, Number(delaySec) || 5) * 1000);
    };

    if ($('btn-gh-web-login')) {
      $('btn-gh-web-login').addEventListener('click', async () => {
        const btn = $('btn-gh-web-login');
        const stEl = $('gh-auth-status');
        const cidInp = $('input-gh-client-id');
        const clientId = (cidInp && cidInp.value || '').trim();
        btn.disabled = true;
        if (stEl) stEl.textContent = '正在向 GitHub 申请 8 位一次性浏览器授权码…';
        try {
          const res = await fetch('/api/github/oauth/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId }),
          });
          const d = await res.json();
          if (!d.ok) {
            if (stEl) stEl.textContent = d.error || '启动浏览器授权失败';
            btn.disabled = false;
            return;
          }
          showGhDeviceBox(d.user_code, d.verification_uri);
          if (stEl) stEl.textContent = '';
          window.open(d.verification_uri || 'https://github.com/login/device', '_blank', 'noopener,noreferrer');
          scheduleOAuthPoll(d.interval || 5, btn, stEl);
        } catch (err) {
          if (stEl) stEl.textContent = `启动失败：${err.message}`;
          btn.disabled = false;
        }
      });
    }
    if ($('btn-gh-copy-code')) {
      $('btn-gh-copy-code').addEventListener('click', async (e) => {
        const code = ($('gh-device-code') && $('gh-device-code').textContent || '').trim();
        if (!code || code === '----') return;
        await navigator.clipboard.writeText(code);
        const b = e.currentTarget;
        b.textContent = '已复制 ✓';
        setTimeout(() => (b.textContent = '复制验证码'), 1400);
      });
    }
    if ($('btn-gh-login-cancel')) {
      $('btn-gh-login-cancel').addEventListener('click', async () => {
        stopGhLoginPolling();
        await fetch('/api/github/oauth/cancel', { method: 'POST' }).catch(() => {});
        if ($('gh-device-flow-box')) $('gh-device-flow-box').style.display = 'none';
        if ($('btn-gh-web-login')) $('btn-gh-web-login').disabled = false;
        if ($('gh-auth-status')) $('gh-auth-status').textContent = '已取消浏览器授权';
      });
    }
    if ($('btn-toggle-gh-pat')) {
      $('btn-toggle-gh-pat').addEventListener('click', () => {
        const body = $('gh-pat-body');
        if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
      });
    }
    if ($('btn-gh-connect')) {
      $('btn-gh-connect').addEventListener('click', async () => {
        const tokInp = $('input-gh-token');
        const stEl = $('gh-auth-status');
        const btn = $('btn-gh-connect');
        const tok = (tokInp && tokInp.value || '').trim();
        if (!tok) {
          if (stEl) stEl.textContent = '请先粘贴 GitHub Personal Access Token';
          return;
        }
        btn.disabled = true;
        btn.textContent = '验证中…';
        if (stEl) stEl.textContent = '正在向 GitHub 验证 Token…';
        try {
          const res = await fetch('/api/github/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok }),
          });
          const d = await res.json();
          if (!d.ok) {
            if (stEl) stEl.textContent = d.error || '验证失败';
          } else {
            if (tokInp) tokInp.value = '';
            if (stEl) stEl.textContent = `已连接 @${d.user.login} ✓`;
            await loadGithubStatusUi();
            renderGitChangesList();
          }
        } catch (err) {
          if (stEl) stEl.textContent = `连接失败：${err.message}`;
        } finally {
          btn.disabled = false;
          btn.textContent = '验证并连接';
        }
      });
    }
    if ($('btn-gh-disconnect')) {
      $('btn-gh-disconnect').addEventListener('click', async () => {
        await fetch('/api/github/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disconnect: true }),
        });
        if ($('gh-auth-status')) $('gh-auth-status').textContent = '已断开 GitHub 连接';
        await loadGithubStatusUi();
        renderGitChangesList();
      });
    }
    if ($('btn-save-git-identity')) {
      $('btn-save-git-identity').addEventListener('click', async () => {
        const stEl = $('git-identity-status');
        const res = await fetch('/api/github/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            git_user_name: ($('input-git-name') && $('input-git-name').value.trim()) || '',
            git_user_email: ($('input-git-email') && $('input-git-email').value.trim()) || '',
          }),
        });
        const d = await res.json();
        if (stEl) stEl.textContent = d.ok ? '提交身份已保存 ✓' : (d.error || '保存失败');
      });
    }
    if ($('btn-gh-open-clone-from-settings')) {
      $('btn-gh-open-clone-from-settings').addEventListener('click', () => {
        if (settingsModal) settingsModal.classList.remove('open');
        openGithubCloneModal();
      });
    }
  }

  return {
    switchReviewSubTab,
    loadGitChanges,
    renderGitChangesList,
    loadGitDiff,
    loadGithubStatusUi,
    loadGithubPulls,
    loadGithubIssues,
    openGithubCloneModal,
    bindEvents,
  };
}
