/* ==========================================================================
   Antigravity Studio — Right-Pane Highlight-to-Ask (`✦ 问 agy`) Popover
   ========================================================================== */

export function createSelectionAskController({ containers, getSelectionContext, onAskSelection }) {
  const bar = document.createElement('div');
  bar.id = 'rp-selection-ask-bar';
  bar.className = 'rp-selection-ask-bar';
  bar.style.display = 'none';
  const sparkSvg =
    '<svg class="ui-line-icon" width="11.5" height="11.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3z"/></svg>';
  bar.innerHTML = `
    <button type="button" class="rp-sel-ask-btn primary" data-sel-act="ask">${sparkSvg}<span>问 agy</span></button>
    <button type="button" class="rp-sel-ask-btn" data-sel-act="quote"><span>引用片段</span></button>
  `;
  document.body.appendChild(bar);

  let currentPayload = null;

  const hide = () => {
    bar.style.display = 'none';
    currentPayload = null;
  };

  const detectLineRange = (range) => {
    const findTr = (node) => {
      const el = node && node.nodeType === 1 ? node : node && node.parentElement;
      return el ? el.closest('tr') : null;
    };
    const startTr = findTr(range.startContainer);
    const endTr = findTr(range.endContainer);
    const getLn = (tr) => {
      if (!tr) return 0;
      const cell = tr.querySelector('.rp-code-ln');
      return cell ? Number(cell.textContent.trim()) || 0 : 0;
    };
    const s = getLn(startTr);
    const e = getLn(endTr);
    if (s && e) return { startLine: Math.min(s, e), endLine: Math.max(s, e) };
    if (s) return { startLine: s, endLine: s };
    if (e) return { startLine: e, endLine: e };
    return { startLine: 0, endLine: 0 };
  };

  const checkSelection = (sourceContainer) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hide();
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 2) {
      hide();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!sourceContainer.contains(range.commonAncestorContainer)) {
      return;
    }
    // Don't trigger inside textareas / inputs (edit mode)
    const ancEl = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (ancEl && ancEl.closest('textarea, input, .rp-code-editor')) {
      hide();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hide();
      return;
    }

    const ctx = getSelectionContext(sourceContainer, ancEl) || {};
    const { startLine, endLine } = detectLineRange(range);
    currentPayload = {
      text: text.slice(0, 6000),
      relPath: ctx.relPath || '',
      absPath: ctx.absPath || '',
      lang: ctx.lang || '',
      startLine,
      endLine,
    };

    bar.style.display = 'inline-flex';
    const barW = bar.offsetWidth || 168;
    const left = Math.max(12, Math.min(window.innerWidth - barW - 12, rect.left + rect.width / 2 - barW / 2));
    const top = Math.max(46, rect.top - 42);
    bar.style.left = `${Math.round(left)}px`;
    bar.style.top = `${Math.round(top)}px`;
  };

  bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sel-act]');
    if (!btn || !currentPayload) return;
    const mode = btn.dataset.selAct;
    const payload = { ...currentPayload };
    hide();
    try {
      window.getSelection().removeAllRanges();
    } catch {
      // ignore
    }
    if (onAskSelection) onAskSelection(payload, mode);
  });

  for (const c of containers) {
    if (!c) continue;
    c.addEventListener('mouseup', () => setTimeout(() => checkSelection(c), 12));
    c.addEventListener('keyup', () => setTimeout(() => checkSelection(c), 12));
    c.addEventListener('scroll', hide, { passive: true });
  }

  document.addEventListener('mousedown', (e) => {
    if (!bar.contains(e.target)) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  return { hide };
}
