/* ==========================================================================
   Antigravity Studio — Chat Engine, Turn DOM Builders, Attachments &
   Multi-Session Concurrent SSE Streaming Controller
   ========================================================================== */

import {
  escapeHtml,
  fileExtBadge,
  folderBasename,
  formatBytes,
  normalizePathKey,
} from './markdown-utils.js';
import { updateContextMeterUi } from './context-meter.js';
import { renderMermaidDiagramsIn } from './rich-render.js';
import { renderToolActivityGroup } from './tool-card-renderer.js';

function highlightMatchText(text, query) {
  const safe = escapeHtml(text || '');
  const q = (query || '').trim();
  if (!q) return safe;
  const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return safe.replace(new RegExp(escapedQ, 'gi'), (m) => `<mark class="conv-search-hl">${m}</mark>`);
  } catch {
    return safe;
  }
}

export function createChatEngineController({ state, dom, actions }) {
  const {
    stageEl,
    scrollArea,
    convListEl,
    messagesEl,
    composerInput,
    composerAttachments,
    btnSend,
    iconSend,
    iconStop,
    headerTitle,
    headerRenameInput,
    cwdChipLabel,
    sessionMetaBar,
    contextMeterPill,
    convSearchInput,
    btnConvSearchClear,
    sidebarRunningCount,
    sidePane,
    btnTopbarExportMd,
  } = dom;

  let convSearchTimer = null;

  function syncExportButton() {
    if (!btnTopbarExportMd) return;
    const hasConv = Boolean(
      state.activeView === 'chat' &&
      state.activeConv &&
      state.activeConv.id &&
      !stageEl.classList.contains('is-empty')
    );
    btnTopbarExportMd.style.display = hasConv ? 'inline-flex' : 'none';
  }

  function buildAttachmentChipHtml(att, removable = false, idx = 0) {
    const thumb = att.is_image && att.preview_url
      ? `<img class="att-thumb" src="${escapeHtml(att.preview_url)}" alt="${escapeHtml(att.name)}" />`
      : `<span class="att-ext-badge">${escapeHtml(fileExtBadge(att.name))}</span>`;
    const subText = att.rel_path || formatBytes(att.size) || '工作区文件';
    const removeBtn = removable
      ? `<button type="button" class="att-remove" data-remove-att="${idx}" title="移除附件">✕</button>`
      : '';
    return `
      <div class="att-chip" title="${escapeHtml(att.path || att.name)}">
        ${thumb}
        <div class="att-meta">
          <span class="att-name">${escapeHtml(att.name)}</span>
          <span class="att-size">${escapeHtml(subText)}</span>
        </div>
        ${removeBtn}
      </div>
    `;
  }

  function renderPendingAttachments() {
    if (!state.pendingAttachments.length) {
      composerAttachments.style.display = 'none';
      composerAttachments.innerHTML = '';
    } else {
      composerAttachments.style.display = 'flex';
      composerAttachments.innerHTML = state.pendingAttachments
        .map((att, idx) => buildAttachmentChipHtml(att, true, idx))
        .join('');
    }
    updateSendButtonState();
  }

  async function uploadLocalFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name || `image-${Date.now()}.png`,
          data_base64: dataUrl,
          mime: file.type || '',
        }),
      });
      if (res.ok) {
        const { file: saved } = await res.json();
        state.pendingAttachments.push(saved);
        renderPendingAttachments();
      }
    }
  }

  async function forkConversationAt(convId, upToIndex) {
    if (!convId) return;
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(convId)}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ up_to_index: upToIndex }),
      });
      const d = await res.json();
      if (d.ok && d.conversation) {
        await refreshConversationList();
        await selectConversation(d.conversation.id);
        actions.showAppToast(`已分叉新对话「${d.conversation.title}」`);
      }
    } catch (err) {
      actions.showAppToast(`分叉失败：${err.message}`);
    }
  }

  async function editAndResendAt(convId, msgIndex, newPrompt, overrideAttachments = null) {
    const cleaned = (newPrompt || '').trim();
    if (!convId || (!cleaned && !(overrideAttachments && overrideAttachments.length))) return;
    if (state.activeStreams.has(convId)) {
      actions.showAppToast('该对话仍在生成中，请先停止后再操作');
      return;
    }
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(convId)}/truncate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_count: msgIndex }),
      });
      const d = await res.json();
      if (d.ok && d.conversation) {
        await selectConversation(convId);
        await sendMessage(cleaned, false, overrideAttachments);
      }
    } catch (err) {
      actions.showAppToast(`操作失败：${err.message}`);
    }
  }

  async function regenerateAssistantAt(convId, assistantIndex) {
    if (!convId || typeof assistantIndex !== 'number' || assistantIndex <= 0) return;
    if (state.activeStreams.has(convId)) {
      actions.showAppToast('该对话仍在生成中，请先停止后再重新生成');
      return;
    }
    try {
      let conv = state.activeConv && state.activeConv.id === convId ? state.activeConv : null;
      if (!conv || !Array.isArray(conv.messages) || conv.messages.length <= assistantIndex) {
        const r = await fetch(`/api/conversations/${encodeURIComponent(convId)}`);
        if (r.ok) {
          const data = await r.json();
          conv = data.conversation;
        }
      }
      const msgs = (conv && conv.messages) || [];
      let userIdx = -1;
      for (let i = Math.min(assistantIndex - 1, msgs.length - 1); i >= 0; i--) {
        if (msgs[i] && msgs[i].role === 'user') {
          userIdx = i;
          break;
        }
      }
      if (userIdx < 0) {
        actions.showAppToast('未找到对应的提问消息，无法重新生成');
        return;
      }
      const origUser = msgs[userIdx];
      await editAndResendAt(convId, userIdx, origUser.content || '', origUser.attachments || []);
    } catch (err) {
      actions.showAppToast(`重新生成失败：${err.message}`);
    }
  }

  function createUserMessageEl(content, attachments = [], meta = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-user';
    if (typeof meta.index === 'number' && meta.index >= 0) {
      wrap.dataset.msgIndex = String(meta.index);
    }
    wrap.dataset.timestamp = String(meta.timestamp || Math.floor(Date.now() / 1000));
    const attHtml = Array.isArray(attachments) && attachments.length
      ? `<div class="msg-user-attachments">${attachments.map((a) => buildAttachmentChipHtml(a, false)).join('')}</div>`
      : '';
    wrap.innerHTML = `
      <div class="msg-user-card">
        ${attHtml}
        <div class="msg-user-text">${escapeHtml(content)}</div>
      </div>
      <div class="msg-user-actions"></div>
    `;

    const actionsEl = wrap.querySelector('.msg-user-actions');
    const renderActions = () => {
      if (!actionsEl) return;
      const cid = meta.convId || (state.activeConv && state.activeConv.id) || '';
      const hasIdx = typeof meta.index === 'number' && meta.index >= 0;
      const cpId = meta.checkpointId || '';
      actionsEl.innerHTML = `
        ${hasIdx && cid ? '<button type="button" class="footer-mini-btn" data-user-act="edit" title="修改此条消息并重新生成后续回复">编辑重发</button>' : ''}
        ${hasIdx && cid ? '<button type="button" class="footer-mini-btn" data-user-act="fork" title="保留原对话并从此处分叉出一条新对话">分叉</button>' : ''}
        ${cpId ? '<button type="button" class="footer-mini-btn cp-btn" data-user-act="rollback" title="预览并将工作区代码回滚到本轮发消息前的快照">↺ 回滚到此步前</button>' : ''}
      `;
    };
    renderActions();

    actionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-user-act]');
      if (!btn) return;
      const act = btn.dataset.userAct;
      const cid = meta.convId || (state.activeConv && state.activeConv.id) || '';
      if (act === 'fork' && cid && typeof meta.index === 'number') {
        forkConversationAt(cid, meta.index);
      } else if (act === 'rollback' && meta.checkpointId) {
        actions.openRollbackModal(meta.checkpointId, content.slice(0, 40));
      } else if (act === 'edit' && cid && typeof meta.index === 'number') {
        const card = wrap.querySelector('.msg-user-card');
        if (!card || card.querySelector('.msg-user-edit-box')) return;
        const origHtml = card.innerHTML;
        card.innerHTML = `
          <div class="msg-user-edit-box">
            <textarea class="msg-user-edit-textarea">${escapeHtml(content)}</textarea>
            <div class="msg-user-edit-footer">
              <button type="button" class="rp-mini-text-btn" data-edit-cancel="1">取消</button>
              <button type="button" class="rp-chip-btn accent" data-edit-send="1">保存并重发</button>
            </div>
          </div>
        `;
        const ta = card.querySelector('textarea');
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        card.querySelector('[data-edit-cancel]').addEventListener('click', () => {
          card.innerHTML = origHtml;
        });
        card.querySelector('[data-edit-send]').addEventListener('click', () => {
          const nextTxt = (ta && ta.value || '').trim();
          if (!nextTxt) return;
          editAndResendAt(cid, meta.index, nextTxt);
        });
      }
    });

    wrap.updateMeta = (patch) => {
      Object.assign(meta, patch || {});
      if (typeof meta.index === 'number' && meta.index >= 0) {
        wrap.dataset.msgIndex = String(meta.index);
      }
      if (meta.timestamp) {
        wrap.dataset.timestamp = String(meta.timestamp);
      }
      renderActions();
    };
    return wrap;
  }

  function createAssistantTurnController(initialData = null, metaInfo = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-assistant';
    if (typeof metaInfo.index === 'number' && metaInfo.index >= 0) {
      wrap.dataset.msgIndex = String(metaInfo.index);
    }

    const skillsBarEl = document.createElement('div');
    skillsBarEl.className = 'turn-dispatched-skills';
    skillsBarEl.style.display = 'none';

    const thinkingBox = document.createElement('div');
    thinkingBox.className = 'thinking-accordion';
    thinkingBox.style.display = 'none';
    thinkingBox.innerHTML = `
      <button class="thinking-header" type="button">
        <span class="thinking-label-wrap">
          <span class="thinking-pulse"></span>
          <span class="thinking-status-text">正在思考…</span>
        </span>
        <svg class="thinking-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <div class="thinking-body"></div>
    `;
    thinkingBox.querySelector('.thinking-header').addEventListener('click', () => {
      thinkingBox.classList.toggle('open');
    });

    const toolsStack = document.createElement('div');
    toolsStack.className = 'tools-stack';
    toolsStack.style.display = 'none';

    const proseEl = document.createElement('div');
    proseEl.className = 'msg-assistant-prose';

    const errEl = document.createElement('div');
    errEl.className = 'turn-error-box';
    errEl.style.display = 'none';

    const footerEl = document.createElement('div');
    footerEl.className = 'msg-footer-bar';
    footerEl.style.display = 'none';

    wrap.appendChild(skillsBarEl);
    wrap.appendChild(thinkingBox);
    wrap.appendChild(toolsStack);
    wrap.appendChild(proseEl);
    wrap.appendChild(errEl);
    wrap.appendChild(footerEl);

    const toolList = [];
    const toolIndexById = new Map();
    let thinkingBuf = '';
    let textBuf = '';
    const turnMeta = {
      convId: metaInfo.convId || '',
      index: typeof metaInfo.index === 'number' ? metaInfo.index : -1,
      checkpointId: (initialData && initialData.checkpoint_id) || metaInfo.checkpointId || '',
    };

    const ctrl = {
      el: wrap,
      setMeta(patch) {
        Object.assign(turnMeta, patch || {});
      },
      showDispatchedSkills(list) {
        if (!Array.isArray(list) || !list.length) return;
        const reasonMap = { manual: '手动挂载', slash: '斜杠调度', auto: '自动调度' };
        skillsBarEl.style.display = 'flex';
        skillsBarEl.innerHTML = list
          .map((s) => {
            const r = reasonMap[s.reason] || '已调度';
            const terms = Array.isArray(s.matched_terms) && s.matched_terms.length ? ` · ${s.matched_terms.join('、')}` : '';
            const boltSvg = '<svg class="ui-line-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
            return `<button type="button" class="turn-skill-badge" data-open-skill-hub="1" title="${escapeHtml(r + terms)}">${boltSvg}<span>${escapeHtml(s.name)}</span><span style="opacity:0.68;">(${escapeHtml(r)})</span></button>`;
          })
          .join('');
        skillsBarEl.querySelectorAll('[data-open-skill-hub]').forEach((b) => {
          b.addEventListener('click', () => actions.switchMainView('skills'));
        });
      },
      appendThinking(delta, isLive = true) {
        thinkingBuf += delta;
        thinkingBox.style.display = 'block';
        if (isLive && thinkingBuf.length < 400) {
          thinkingBox.classList.add('open');
        }
        thinkingBox.querySelector('.thinking-body').textContent = thinkingBuf;
      },
      finishThinking(elapsedSec) {
        const pulse = thinkingBox.querySelector('.thinking-pulse');
        if (pulse) pulse.style.display = 'none';
        if (thinkingBuf) {
          thinkingBox.querySelector('.thinking-status-text').textContent =
            elapsedSec ? `思考过程 · ${elapsedSec}s` : '思考过程';
          thinkingBox.classList.remove('open');
        }
      },
      upsertTool(tool) {
        if (!tool) return;
        const tid = String(tool.id || `tool-${toolList.length}`);
        if (toolIndexById.has(tid)) {
          const idx = toolIndexById.get(tid);
          const prev = toolList[idx] || {};
          const merged = { ...prev, ...tool };
          if (prev.args && Object.keys(prev.args).length && (!tool.args || !Object.keys(tool.args).length)) {
            merged.args = prev.args;
          }
          if (prev.summary && !tool.summary) merged.summary = prev.summary;
          if (prev.output && !tool.output) merged.output = prev.output;
          toolList[idx] = merged;
        } else {
          toolIndexById.set(tid, toolList.length);
          toolList.push({ ...tool, id: tid });
        }
        renderToolActivityGroup(toolsStack, toolList, {
          activeCwd: state.activeCwd || '',
          openLocalFileSmart: actions.openLocalFileSmart,
          openFileInRightPane: actions.openFileInRightPane,
        });
      },
      appendText(delta) {
        textBuf += delta;
        proseEl.innerHTML = actions.renderMarkdown(textBuf, true);
      },
      showError(message, code) {
        errEl.style.display = 'block';
        errEl.textContent = message;
        if (code === 'AGY_NOT_FOUND' || code === 'ENGINE_NOT_FOUND') {
          const demoBtn = document.createElement('button');
          demoBtn.className = 'primary-btn';
          demoBtn.style.marginTop = '10px';
          demoBtn.style.display = 'inline-block';
          demoBtn.textContent = '✦ 立即体验内置 UI 演示流';
          demoBtn.addEventListener('click', () => {
            sendMessage('演示思考流、工具调用卡片与右侧 Artifact 预览', true);
          });
          errEl.appendChild(document.createElement('br'));
          errEl.appendChild(demoBtn);
        }
      },
      finalize(meta = {}) {
        if (meta.checkpoint_id) turnMeta.checkpointId = meta.checkpoint_id;
        if (typeof meta.index === 'number') turnMeta.index = meta.index;
        if (meta.convId) turnMeta.convId = meta.convId;

        ctrl.finishThinking(meta.elapsed_sec);
        proseEl.innerHTML = actions.renderMarkdown(textBuf, false);
        renderMermaidDiagramsIn(proseEl, state.codeStore);
        footerEl.style.display = 'flex';
        const badge = meta.demo ? '演示模式' : meta.elapsed_sec ? `${meta.elapsed_sec}s` : '';
        const cid = turnMeta.convId || (state.activeConv && state.activeConv.id) || '';
        const canFork = Boolean(cid && turnMeta.index >= 0);
        const canRegen = Boolean(cid && turnMeta.index > 0);
        const cpId = turnMeta.checkpointId || '';

        footerEl.innerHTML = `
          <div class="msg-footer-actions">
            <button type="button" class="footer-mini-btn" data-copy-turn="1">复制全文</button>
            ${canRegen ? '<button type="button" class="footer-mini-btn" data-regen-turn="1" title="使用原问题重新生成本条回复">↻ 重新生成</button>' : ''}
            ${canFork ? '<button type="button" class="footer-mini-btn" data-fork-turn="1" title="从这条回复分叉出一条新对话">从此处分叉</button>' : ''}
            ${cpId ? '<button type="button" class="footer-mini-btn cp-btn" data-cp-rollback="1" title="将工作区代码回滚到本轮修改之前">↺ 回滚代码</button>' : ''}
          </div>
          <span>${escapeHtml(badge)}</span>
        `;
        const copyBtn = footerEl.querySelector('[data-copy-turn]');
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            await navigator.clipboard.writeText(textBuf);
            copyBtn.textContent = '已复制 ✓';
            setTimeout(() => (copyBtn.textContent = '复制全文'), 1500);
          });
        }
        const regenBtn = footerEl.querySelector('[data-regen-turn]');
        if (regenBtn) {
          regenBtn.addEventListener('click', () => regenerateAssistantAt(cid, turnMeta.index));
        }
        const forkBtn = footerEl.querySelector('[data-fork-turn]');
        if (forkBtn) {
          forkBtn.addEventListener('click', () => forkConversationAt(cid, turnMeta.index));
        }
        const cpBtn = footerEl.querySelector('[data-cp-rollback]');
        if (cpBtn) {
          cpBtn.addEventListener('click', () => actions.openRollbackModal(cpId, '本轮 AI 修改前'));
        }
      },
    };

    if (initialData) {
      if (Array.isArray(initialData.dispatched_skills) && initialData.dispatched_skills.length) {
        ctrl.showDispatchedSkills(initialData.dispatched_skills);
      }
      if (initialData.thinking) ctrl.appendThinking(initialData.thinking, false);
      if (Array.isArray(initialData.tools)) initialData.tools.forEach((t) => ctrl.upsertTool(t));
      if (initialData.content) textBuf = initialData.content;
      if (Array.isArray(initialData.errors) && initialData.errors.length) {
        ctrl.showError(initialData.errors.join('\n'));
      }
      ctrl.finalize({
        elapsed_sec: initialData.elapsed_sec,
        demo: initialData.demo,
        checkpoint_id: initialData.checkpoint_id,
      });
    }

    return ctrl;
  }

  async function refreshConversationList() {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    state.conversations = data.conversations || [];
    if ((state.convSearchQuery || '').trim()) {
      await runConversationFullTextSearch(state.convSearchQuery);
      return;
    }
    renderConversationList();
  }

  async function runConversationFullTextSearch(rawQuery) {
    const q = (rawQuery || '').trim();
    if (!q) {
      state.searchResults = null;
      renderConversationList();
      return;
    }
    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      if ((state.convSearchQuery || '').trim() !== q) return;
      state.searchResults = data.conversations || [];
      renderConversationList();
    } catch {
      // fall back to client filter
      state.searchResults = null;
      renderConversationList();
    }
  }

  async function togglePinConversation(convId, nextPinned) {
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(convId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: Boolean(nextPinned) }),
      });
      if (res.ok) {
        if (state.activeConv && state.activeConv.id === convId) {
          state.activeConv.pinned = Boolean(nextPinned);
        }
        actions.showAppToast(nextPinned ? '已置顶对话 📌' : '已取消置顶', { duration: 1800 });
        await refreshConversationList();
      }
    } catch (err) {
      actions.showAppToast(`置顶操作失败：${err.message}`);
    }
  }

  async function exportActiveConversationMarkdown() {
    if (!state.activeConv || !state.activeConv.id) return;
    const cid = state.activeConv.id;
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(cid)}/export?format=json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok || !data.markdown) throw new Error(data.error || '导出失败');
      const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `${cid}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      actions.showAppToast(`已导出「${data.filename}」✓`, { duration: 2400 });
    } catch (err) {
      actions.showAppToast(`导出 Markdown 失败：${err.message}`);
    }
  }

  function refreshContextMeter() {
    const resolved = actions.getResolvedModelAndEffort();
    const liveStream = state.activeConv ? state.activeStreams.get(state.activeConv.id) : null;
    updateContextMeterUi(contextMeterPill, state.activeConv, resolved.model, composerInput.value, liveStream);
  }

  function syncSidebarRunningBadge() {
    if (!sidebarRunningCount) return;
    const count = state.activeStreams.size;
    if (count > 0) {
      sidebarRunningCount.textContent = `${count} 运行中`;
      sidebarRunningCount.style.display = 'inline-flex';
    } else {
      sidebarRunningCount.style.display = 'none';
    }
  }

  function renderConversationList() {
    convListEl.innerHTML = '';
    syncSidebarRunningBadge();

    const q = (state.convSearchQuery || '').trim();
    const qLower = q.toLowerCase();
    const filtered = q
      ? (Array.isArray(state.searchResults)
          ? state.searchResults
          : state.conversations.filter((c) => {
              const title = (c.title || '新聊天').toLowerCase();
              const folder = folderBasename(c.cwd || '').toLowerCase();
              return title.includes(qLower) || folder.includes(qLower);
            }))
      : state.conversations;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.style.padding = '6px 12px';
      empty.style.fontSize = '12px';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = q ? '标题与聊天正文中均无匹配' : '暂无最近对话';
      convListEl.appendChild(empty);
      return;
    }

    const pinSvg =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>';

    for (const c of filtered) {
      const isRunning = state.activeStreams.has(c.id) || Boolean(c.running);
      const isUnreadDone = !isRunning && state.unreadDoneConvs.has(c.id);
      const isPinned = Boolean(c.pinned);
      const hasSnippet = Boolean(q && c.match_in_body && c.match_snippet);
      const row = document.createElement('div');
      row.className =
        'conv-item' +
        (state.activeConv && state.activeConv.id === c.id ? ' active' : '') +
        (isPinned ? ' is-pinned' : '') +
        (hasSnippet ? ' has-snippet' : '');
      row.innerHTML = `
        <div class="conv-item-main">
          <div class="conv-item-top">
            ${isRunning ? '<span class="conv-status-dot running" title="后台运行中"></span>' : isUnreadDone ? '<span class="conv-status-dot done" title="新回复已完成"></span>' : isPinned ? '<span class="conv-pinned-badge" title="已置顶">📌</span>' : ''}
            <span class="conv-item-title">${highlightMatchText(c.title || '新聊天', q)}</span>
          </div>
          ${hasSnippet ? `<div class="conv-item-snippet">${highlightMatchText(c.match_snippet, q)}</div>` : ''}
        </div>
        <div class="conv-item-actions">
          <button type="button" class="conv-pin-btn ${isPinned ? 'active' : ''}" title="${isPinned ? '取消置顶' : '置顶对话'}">${pinSvg}</button>
          <button type="button" class="conv-delete-btn" title="删除对话">✕</button>
        </div>
      `;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.conv-delete-btn') || e.target.closest('.conv-pin-btn')) return;
        const hitIdx = q && c.match_in_body && typeof c.match_msg_index === 'number' ? c.match_msg_index : -1;
        selectConversation(c.id, hitIdx);
      });
      row.querySelector('.conv-pin-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await togglePinConversation(c.id, !isPinned);
      });
      row.querySelector('.conv-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (state.activeStreams.has(c.id)) {
          await stopStreamForConv(c.id);
        }
        state.unreadDoneConvs.delete(c.id);
        await fetch(`/api/conversations/${c.id}`, { method: 'DELETE' });
        if (state.activeConv && state.activeConv.id === c.id) {
          startNewChatView();
        }
        await refreshConversationList();
      });
      convListEl.appendChild(row);
    }
  }

  function startNewChatView(forceCwd = null) {
    actions.switchMainView('chat');
    actions.updateTimeGreeting(false);
    state.activeConv = null;
    state.pendingAttachments = [];
    actions.clearMountedSkills();
    renderPendingAttachments();
    stageEl.classList.add('is-empty');
    messagesEl.innerHTML = '';
    headerTitle.textContent = '新聊天';
    const hasExplicit = Boolean(forceCwd) && !actions.isDefaultWorkspacePath(forceCwd);
    const cwd = hasExplicit ? forceCwd : (state.defaultWorkspaceDir || state.settings.default_cwd || '');
    const prevCwd = state.activeCwd;
    state.activeCwd = cwd;
    state.workspaceExplicit = hasExplicit;
    cwdChipLabel.textContent = folderBasename(cwd);
    cwdChipLabel.title = cwd;
    actions.syncComposerContextBar();
    sessionMetaBar.style.display = 'none';
    sessionMetaBar.innerHTML = '';
    syncStreamingUiForActiveConv();
    syncExportButton();
    if (actions.refreshTurnNavigator) actions.refreshTurnNavigator();
    refreshContextMeter();
    actions.renderProjectList();
    actions.renderCwdPopover();
    renderConversationList();
    if (normalizePathKey(prevCwd) !== normalizePathKey(cwd)) {
      actions.syncRightPaneWorkspace();
    }
    composerInput.focus();
  }

  async function selectConversation(convId, focusMsgIndex = -1) {
    actions.switchMainView('chat');
    state.unreadDoneConvs.delete(convId);

    const res = await fetch(`/api/conversations/${convId}`);
    if (!res.ok) return;
    const { conversation } = await res.json();
    state.activeConv = conversation;
    state.pendingAttachments = [];
    renderPendingAttachments();

    headerTitle.textContent = conversation.title || '新聊天';
    const prevCwd = state.activeCwd;
    state.activeCwd = conversation.cwd || state.defaultWorkspaceDir || state.settings.default_cwd || '';
    state.workspaceExplicit = Boolean(conversation.cwd) && !actions.isDefaultWorkspacePath(conversation.cwd);
    cwdChipLabel.textContent = folderBasename(state.activeCwd);
    cwdChipLabel.title = state.activeCwd;
    actions.syncComposerContextBar();

    actions.setSelectedMode(conversation.mode || 'default');
    actions.syncPickersFromSlug(conversation.model || 'default', conversation.effort || 'default');
    updateSessionFooter(conversation);

    messagesEl.innerHTML = '';
    const msgs = conversation.messages || [];
    const liveStream = state.activeStreams.get(convId);

    if (!msgs.length && !liveStream) {
      stageEl.classList.add('is-empty');
    } else {
      stageEl.classList.remove('is-empty');
      msgs.forEach((m, idx) => {
        if (m.role === 'user') {
          messagesEl.appendChild(
            createUserMessageEl(m.content, m.attachments || [], {
              convId,
              index: idx,
              checkpointId: m.checkpoint_id || '',
              timestamp: m.timestamp || 0,
            })
          );
        } else {
          const turn = createAssistantTurnController(m, {
            convId,
            index: idx,
            checkpointId: m.checkpoint_id || '',
          });
          messagesEl.appendChild(turn.el);
        }
      });
      if (liveStream && liveStream.turn && liveStream.turn.el) {
        messagesEl.appendChild(liveStream.turn.el);
      }
      if (focusMsgIndex < 0) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }

    syncStreamingUiForActiveConv();
    syncExportButton();
    if (actions.refreshTurnNavigator) actions.refreshTurnNavigator();
    if (focusMsgIndex >= 0 && actions.jumpToMessageIndex) {
      setTimeout(() => actions.jumpToMessageIndex(focusMsgIndex), 40);
    }
    refreshContextMeter();
    actions.renderProjectList();
    actions.renderCwdPopover();
    renderConversationList();
    if (normalizePathKey(prevCwd) !== normalizePathKey(state.activeCwd)) {
      actions.syncRightPaneWorkspace();
    }
  }

  function updateSessionFooter(conv) {
    if (conv && conv.agy_conversation_id) {
      const eng = conv.engine || state.settings.cli_engine || 'agy';
      sessionMetaBar.style.display = 'block';
      sessionMetaBar.innerHTML = `${escapeHtml(eng)} 会话已绑定 (<code>${escapeHtml(conv.agy_conversation_id)}</code>) · <code>${escapeHtml(folderBasename(conv.cwd))}</code>`;
    } else {
      sessionMetaBar.style.display = 'none';
      sessionMetaBar.innerHTML = '';
    }
  }

  function isCurrentConvStreaming() {
    return Boolean(state.activeConv && state.activeStreams.has(state.activeConv.id));
  }

  function updateSendButtonState() {
    if (isCurrentConvStreaming()) {
      btnSend.disabled = false;
      return;
    }
    btnSend.disabled = !composerInput.value.trim() && !state.pendingAttachments.length;
  }

  function syncStreamingUiForActiveConv() {
    const streaming = isCurrentConvStreaming();
    state.isStreaming = streaming;
    btnSend.classList.toggle('is-streaming', streaming);
    iconSend.style.display = streaming ? 'none' : 'block';
    iconStop.style.display = streaming ? 'block' : 'none';
    updateSendButtonState();
    btnSend.title = streaming ? '停止当前对话生成' : '发送 (Enter)';
    syncSidebarRunningBadge();
  }

  async function stopStreamForConv(convId) {
    const entry = state.activeStreams.get(convId);
    if (entry && entry.controller) {
      entry.controller.abort();
    }
    if (convId) {
      await fetch('/api/chat/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId }),
      }).catch(() => {});
    }
  }

  async function stopActiveStream() {
    if (state.activeConv && state.activeConv.id) {
      await stopStreamForConv(state.activeConv.id);
    } else if (state.abortController) {
      state.abortController.abort();
    }
  }

  function maybeScrollToBottom() {
    const dist = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
    if (dist < 160) scrollArea.scrollTop = scrollArea.scrollHeight;
  }

  function handleStreamEvent(ev, streamEntry) {
    const turn = streamEntry.turn;
    const isViewing = Boolean(state.activeConv && state.activeConv.id === streamEntry.convId);

    switch (ev.type) {
      case 'session':
        if (ev.conversation) {
          streamEntry.title = ev.conversation.title || streamEntry.title;
          if (isViewing) {
            state.activeConv = { ...(state.activeConv || {}), ...ev.conversation };
            headerTitle.textContent = state.activeConv.title || '新聊天';
            updateSessionFooter(state.activeConv);
          }
        }
        if (typeof ev.user_msg_index === 'number' && streamEntry.userMsgEl && streamEntry.userMsgEl.updateMeta) {
          streamEntry.userMsgEl.updateMeta({
            convId: streamEntry.convId,
            index: ev.user_msg_index,
            checkpointId: (ev.checkpoint && ev.checkpoint.id) || '',
          });
        }
        if (ev.checkpoint && ev.checkpoint.id) {
          streamEntry.checkpointId = ev.checkpoint.id;
          turn.setMeta({ checkpointId: ev.checkpoint.id, convId: streamEntry.convId });
        }
        refreshConversationList();
        break;
      case 'checkpoint':
        if (ev.checkpoint && ev.checkpoint.id) {
          streamEntry.checkpointId = ev.checkpoint.id;
          if (streamEntry.userMsgEl && streamEntry.userMsgEl.updateMeta) {
            streamEntry.userMsgEl.updateMeta({ checkpointId: ev.checkpoint.id });
          }
          turn.setMeta({ checkpointId: ev.checkpoint.id, convId: streamEntry.convId });
        }
        break;
      case 'skills_dispatched':
        if (Array.isArray(ev.skills) && ev.skills.length) {
          turn.showDispatchedSkills(ev.skills);
        }
        break;
      case 'meta':
        if (ev.agy_conversation_id && isViewing && state.activeConv) {
          state.activeConv.agy_conversation_id = ev.agy_conversation_id;
          updateSessionFooter(state.activeConv);
        }
        break;
      case 'thinking_delta':
        streamEntry.accThinking += ev.delta || '';
        turn.appendThinking(ev.delta || '', true);
        if (isViewing) maybeScrollToBottom();
        break;
      case 'tool_update':
        if (ev.tool) turn.upsertTool(ev.tool);
        if (isViewing) maybeScrollToBottom();
        break;
      case 'text_delta':
        streamEntry.accText += ev.delta || '';
        turn.appendText(ev.delta || '');
        if (isViewing) {
          maybeScrollToBottom();
          if (streamEntry.accText.length % 120 < 20) refreshContextMeter();
        }
        break;
      case 'error':
        turn.showError(ev.message || '执行出错', ev.code);
        if (isViewing) maybeScrollToBottom();
        break;
      case 'done':
        if (isViewing && state.activeConv && ev.agy_conversation_id) {
          state.activeConv.agy_conversation_id = ev.agy_conversation_id;
          updateSessionFooter(state.activeConv);
        }
        turn.finalize({
          elapsed_sec: ev.elapsed_sec,
          convId: streamEntry.convId,
          index: ev.assistant_msg_index,
          checkpoint_id: ev.checkpoint_id || streamEntry.checkpointId,
        });
        if (isViewing && state.lastArtifact && state.activeConv && String(ev.agy_conversation_id || '').startsWith('demo-')) {
          actions.openArtifactPane(state.lastArtifact);
        }
        break;
    }
  }

  async function sendMessage(overridePrompt = null, demoMode = false, overrideAttachments = null) {
    if (isCurrentConvStreaming()) {
      await stopActiveStream();
      return;
    }

    const rawText = (overridePrompt !== null ? overridePrompt : composerInput.value).trim();
    const attachments = Array.isArray(overrideAttachments)
      ? [...overrideAttachments]
      : overridePrompt !== null
        ? []
        : [...state.pendingAttachments];
    if (!rawText && !attachments.length) return;

    const prompt = rawText || '请查看并分析我附加的文件内容。';

    if (overridePrompt === null) {
      composerInput.value = '';
      state.pendingAttachments = [];
      renderPendingAttachments();
      actions.autoResizeTextarea();
    }

    const resolved = actions.getResolvedModelAndEffort();
    const targetCwd = state.activeCwd || state.settings.default_cwd;
    const activeEngine = state.settings.cli_engine || 'agy';

    let targetConv = state.activeConv;
    if (!targetConv || !targetConv.id) {
      const cleanTitle = prompt.replace(/\s+/g, ' ').trim();
      const title = cleanTitle.slice(0, 36) + (cleanTitle.length > 36 ? '…' : '');
      const cr = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          cwd: targetCwd,
          model: resolved.model,
          mode: state.selectedMode,
          effort: resolved.effort,
          engine: activeEngine,
        }),
      });
      if (cr.ok) {
        const cd = await cr.json();
        targetConv = cd.conversation;
        state.activeConv = targetConv;
        headerTitle.textContent = targetConv.title || '新聊天';
      }
    }

    const convId = targetConv ? targetConv.id : `tmp-${Date.now()}`;
    const existingMsgCount = targetConv && Array.isArray(targetConv.messages) ? targetConv.messages.length : 0;

    stageEl.classList.remove('is-empty');
    syncExportButton();
    const userMsgEl = createUserMessageEl(prompt, attachments, {
      convId,
      index: existingMsgCount,
      timestamp: Date.now() / 1000,
    });
    messagesEl.appendChild(userMsgEl);
    if (actions.refreshTurnNavigator) actions.refreshTurnNavigator();
    const assistantTurn = createAssistantTurnController(null, { convId, index: existingMsgCount + 1 });
    messagesEl.appendChild(assistantTurn.el);
    assistantTurn.el.querySelector('.msg-assistant-prose').innerHTML =
      '<span class="streaming-spark">✦</span>';
    scrollArea.scrollTop = scrollArea.scrollHeight;

    const payload = {
      conversation_id: targetConv ? targetConv.id : null,
      prompt,
      attachments,
      capabilities: Array.from(state.activeCapabilities),
      skill_ids: actions.getMountedSkillIds(),
      auto_dispatch_skills: state.settings.auto_dispatch_skills !== false,
      demo: demoMode,
      cwd: targetCwd,
      mode: state.selectedMode,
      effort: resolved.effort,
      model: resolved.model,
      engine: activeEngine,
    };

    const controller = new AbortController();
    const streamEntry = {
      convId,
      title: (targetConv && targetConv.title) || '新聊天',
      controller,
      turn: assistantTurn,
      userMsgEl,
      userMsgIndex: existingMsgCount,
      checkpointId: null,
      accText: '',
      accThinking: '',
      done: false,
      startedAt: Date.now(),
    };
    state.activeStreams.set(convId, streamEntry);
    state.abortController = controller;
    syncStreamingUiForActiveConv();
    refreshConversationList();

    let receivedDone = false;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        assistantTurn.showError(`请求失败 (HTTP ${response.status})`);
        assistantTurn.finalize({});
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const rawPacket = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of rawPacket.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            let ev;
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            handleStreamEvent(ev, streamEntry);
            if (ev.type === 'done') receivedDone = true;
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        assistantTurn.showError(`连接中断: ${err.message}`);
      }
    } finally {
      if (!receivedDone) assistantTurn.finalize({ convId });
      streamEntry.done = true;
      state.activeStreams.delete(convId);
      if (state.abortController === controller) state.abortController = null;
      syncStreamingUiForActiveConv();

      const isViewingSame = Boolean(state.activeConv && state.activeConv.id === convId);
      if (receivedDone) {
        actions.fireCompletionNotifications(streamEntry.title);
        if (!isViewingSame) {
          state.unreadDoneConvs.add(convId);
          actions.showAppToast(`「${streamEntry.title}」后台回复已完成`, {
            actionLabel: '查看',
            onAction: () => selectConversation(convId),
          });
        } else {
          fetch(`/api/conversations/${convId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d && d.conversation && state.activeConv && state.activeConv.id === convId) {
                state.activeConv = d.conversation;
                refreshContextMeter();
                if (actions.refreshTurnNavigator) actions.refreshTurnNavigator();
              }
            })
            .catch(() => {});
        }
        actions.fetchUsageQuota(true);
        actions.loadGitChanges(true);
        state.rightPane.dirCache.clear();
        if (sidePane.classList.contains('open') && (state.sidePaneMode === 'launcher' || state.sidePaneMode === 'explorer')) {
          actions.loadWorkspaceTree('', true);
        }
        if (actions.refreshOpenFileTabs) {
          actions.refreshOpenFileTabs(true);
        }
      }
      await refreshConversationList();
      if (isViewingSame && state.queuedFollowup) {
        const nextPrompt = state.queuedFollowup;
        state.queuedFollowup = null;
        sendMessage(nextPrompt, false);
      }
    }
  }

  function bindEvents() {
    headerTitle.addEventListener('click', () => {
      if (!state.activeConv) return;
      headerTitle.style.display = 'none';
      headerRenameInput.style.display = 'inline-block';
      headerRenameInput.value = state.activeConv.title || '';
      headerRenameInput.focus();
      headerRenameInput.select();
    });

    const commitRename = async () => {
      headerRenameInput.style.display = 'none';
      headerTitle.style.display = 'block';
      if (!state.activeConv) return;
      const next = headerRenameInput.value.trim();
      if (next && next !== state.activeConv.title) {
        const res = await fetch(`/api/conversations/${state.activeConv.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: next }),
        });
        const data = await res.json();
        state.activeConv = data.conversation;
        headerTitle.textContent = state.activeConv.title;
        if (actions.refreshTurnNavigator) actions.refreshTurnNavigator();
        await refreshConversationList();
      }
    };
    headerRenameInput.addEventListener('blur', commitRename);
    headerRenameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        headerRenameInput.blur();
      } else if (e.key === 'Escape') {
        headerRenameInput.value = state.activeConv ? state.activeConv.title : '';
        headerRenameInput.blur();
      }
    });

    if (convSearchInput) {
      convSearchInput.addEventListener('input', () => {
        state.convSearchQuery = convSearchInput.value || '';
        if (btnConvSearchClear) {
          btnConvSearchClear.style.display = state.convSearchQuery ? 'inline-block' : 'none';
        }
        clearTimeout(convSearchTimer);
        if (!state.convSearchQuery.trim()) {
          state.searchResults = null;
          renderConversationList();
        } else {
          convSearchTimer = setTimeout(() => runConversationFullTextSearch(state.convSearchQuery), 160);
        }
      });
      convSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          convSearchInput.value = '';
          state.convSearchQuery = '';
          state.searchResults = null;
          if (btnConvSearchClear) btnConvSearchClear.style.display = 'none';
          renderConversationList();
        }
      });
    }
    if (btnConvSearchClear) {
      btnConvSearchClear.addEventListener('click', () => {
        if (convSearchInput) convSearchInput.value = '';
        state.convSearchQuery = '';
        state.searchResults = null;
        btnConvSearchClear.style.display = 'none';
        renderConversationList();
      });
    }
    if (btnTopbarExportMd) {
      btnTopbarExportMd.addEventListener('click', exportActiveConversationMarkdown);
    }

    messagesEl.addEventListener('click', async (e) => {
      const imgActionBtn = e.target.closest('[data-img-action]');
      if (imgActionBtn) {
        e.stopPropagation();
        const card = imgActionBtn.closest('.chat-img-card');
        if (!card) return;
        const act = imgActionBtn.dataset.imgAction;
        const src = card.dataset.imgSrc || '';
        const localPath = card.dataset.imgPath || '';
        const name = card.dataset.imgName || '';
        if (act === 'lightbox') {
          actions.openImageLightbox({ src, localPath, name });
        } else if (act === 'open' && localPath) {
          actions.openExternalPath(localPath, false);
        } else if (act === 'reveal' && localPath) {
          actions.openExternalPath(localPath, true);
        }
        return;
      }

      const inlineImg = e.target.closest('img.chat-inline-img');
      if (inlineImg) {
        const card = inlineImg.closest('.chat-img-card');
        actions.openImageLightbox({
          src: (card && card.dataset.imgSrc) || inlineImg.getAttribute('src') || '',
          localPath: (card && card.dataset.imgPath) || '',
          name: (card && card.dataset.imgName) || inlineImg.getAttribute('alt') || '图片预览',
        });
        return;
      }

      const attThumb = e.target.closest('img.att-thumb');
      if (attThumb) {
        const src = attThumb.getAttribute('src') || '';
        let localPath = '';
        try {
          const u = new URL(src, window.location.origin);
          if (u.pathname === '/api/local-image') localPath = u.searchParams.get('path') || '';
        } catch {
          // ignore
        }
        actions.openImageLightbox({ src, localPath, name: attThumb.getAttribute('alt') || '附件图片' });
        return;
      }

      const filePill = e.target.closest('.chat-file-pill');
      if (filePill) {
        actions.openLocalFileSmart(filePill.dataset.filePath || '', filePill.dataset.fileKind || 'file');
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const item = state.codeStore.get(btn.dataset.block);
      if (!item) return;

      if (btn.dataset.action === 'toggle-mermaid-src') {
        const mCard = btn.closest('.mermaid-card');
        if (mCard) {
          const showing = mCard.classList.toggle('show-source');
          btn.textContent = showing ? '图表' : '源码';
        }
        return;
      }
      if (btn.dataset.action === 'copy-code') {
        await navigator.clipboard.writeText(item.code);
        const orig = btn.textContent;
        btn.textContent = '已复制 ✓';
        setTimeout(() => (btn.textContent = orig), 1400);
      } else if (btn.dataset.action === 'artifact') {
        actions.openArtifactPane({
          lang: item.lang,
          code: item.code,
          title: `Artifact (${item.lang.toUpperCase()})`,
        });
      }
    });
  }

  return {
    renderPendingAttachments,
    uploadLocalFiles,
    refreshConversationList,
    refreshContextMeter,
    renderConversationList,
    startNewChatView,
    selectConversation,
    updateSessionFooter,
    updateSendButtonState,
    syncStreamingUiForActiveConv,
    syncExportButton,
    exportActiveConversationMarkdown,
    stopActiveStream,
    sendMessage,
    bindEvents,
  };
}
