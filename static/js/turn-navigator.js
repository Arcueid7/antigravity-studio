/* ==========================================================================
   Antigravity Studio — Floating Conversation Turn Navigator (Minimap + Card)
   Minimal vertical pill/dot rail with hover timeline card, scroll-spy,
   click-to-jump smooth scroll, target highlight flash & keyboard navigation.
   ========================================================================== */

import { escapeHtml } from './markdown-utils.js';

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatHHMM(secTs) {
  if (!secTs || Number.isNaN(Number(secTs))) return '--:--';
  const d = new Date(Number(secTs) * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateRangeMeta(turns, conv) {
  const count = turns.length;
  const firstTs = (turns[0] && turns[0].timestamp) || (conv && conv.created_at) || Date.now() / 1000;
  const lastTs = (turns[count - 1] && turns[count - 1].timestamp) || (conv && conv.updated_at) || firstTs;
  const d = new Date(Number(firstTs) * 1000);
  const datePart = `${d.getMonth() + 1}月${d.getDate()}日${WEEKDAYS_ZH[d.getDay()]}`;
  const startStr = formatHHMM(firstTs);
  const endStr = formatHHMM(lastTs);
  const timePart = startStr === endStr ? startStr : `${startStr} – ${endStr}`;
  const turnLabel = count === 1 ? '1 turn' : `${count} turns`;
  return `${datePart}, ${timePart} · ${turnLabel}`;
}

function summarizePromptLine(text) {
  const cleaned = String(text || '')
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || '（附件消息）';
}

export function createTurnNavigatorController({
  state,
  scrollArea,
  messagesEl,
  dockEl,
  railEl,
  cardEl,
  titleEl,
  metaEl,
  listEl,
}) {
  let turns = []; // { turnIdx, msgIndex, text, timestamp, el }
  let activeTurnIdx = 0;
  let rafScheduled = false;
  let pinnedOpen = false;
  let kbdFocusIdx = 0;
  let hideTimer = null;

  const isVisibleNow = () => Boolean(dockEl && dockEl.style.display !== 'none' && turns.length > 0);

  const openCardPinned = () => {
    if (!isVisibleNow() || !dockEl) return;
    pinnedOpen = true;
    kbdFocusIdx = activeTurnIdx;
    dockEl.classList.add('is-open', 'is-pinned-open');
    syncActiveUi(true);
  };

  const closeCard = () => {
    if (!dockEl) return;
    pinnedOpen = false;
    dockEl.classList.remove('is-open', 'is-pinned-open');
  };

  const toggleCard = () => {
    if (!isVisibleNow()) return false;
    if (pinnedOpen) closeCard();
    else openCardPinned();
    return true;
  };

  const flashTargetEl = (el) => {
    if (!el) return;
    const targetCard = el.querySelector('.msg-user-card') || el;
    targetCard.classList.remove('turn-locate-flash');
    // Force reflow so rapid re-clicks replay animation smoothly
    void targetCard.offsetWidth;
    targetCard.classList.add('turn-locate-flash');
    setTimeout(() => targetCard.classList.remove('turn-locate-flash'), 1350);
  };

  const scrollToElement = (targetEl) => {
    if (!scrollArea || !targetEl) return;
    if (typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const areaRect = scrollArea.getBoundingClientRect();
      const elRect = targetEl.getBoundingClientRect();
      const nextTop = Math.max(0, scrollArea.scrollTop + (elRect.top - areaRect.top) - 24);
      scrollArea.scrollTo({ top: nextTop, behavior: 'smooth' });
    }
    flashTargetEl(targetEl);
  };

  const jumpToTurn = (turnIdx) => {
    const t = turns[turnIdx];
    if (!t || !t.el) return;
    activeTurnIdx = turnIdx;
    kbdFocusIdx = turnIdx;
    syncActiveUi(false);
    scrollToElement(t.el);
    if (pinnedOpen) closeCard();
  };

  const jumpToMessageIndex = (msgIndex) => {
    if (typeof msgIndex !== 'number' || msgIndex < 0 || !messagesEl) return;
    const directEl = messagesEl.querySelector(`[data-msg-index="${msgIndex}"]`);
    if (directEl) {
      // Find matching or nearest preceding user turn for active indicator
      const matchedTurn = turns.findIndex((t) => t.msgIndex === msgIndex);
      if (matchedTurn >= 0) {
        activeTurnIdx = matchedTurn;
        syncActiveUi(false);
      }
      scrollToElement(directEl);
      return;
    }
    // Fallback to nearest preceding user turn
    let fallbackIdx = -1;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].msgIndex <= msgIndex) {
        fallbackIdx = i;
        break;
      }
    }
    if (fallbackIdx >= 0) jumpToTurn(fallbackIdx);
  };

  const buildPipIndices = () => {
    const n = turns.length;
    const maxPips = 16;
    if (n <= maxPips) return Array.from({ length: n }, (_, i) => i);
    const out = [];
    for (let i = 0; i < maxPips; i++) {
      out.push(Math.round((i * (n - 1)) / (maxPips - 1)));
    }
    return out;
  };

  const renderRailPips = () => {
    if (!railEl) return;
    const pipIndices = buildPipIndices();
    const lastIdx = turns.length - 1;

    // Find which pip is closest to activeTurnIdx
    let activePipPos = 0;
    let bestDist = Infinity;
    pipIndices.forEach((tIdx, pos) => {
      const d = Math.abs(tIdx - activeTurnIdx);
      if (d < bestDist) {
        bestDist = d;
        activePipPos = pos;
      }
    });

    railEl.innerHTML = pipIndices
      .map((tIdx, pos) => {
        const dist = Math.abs(pos - activePipPos);
        let cls = 'turn-nav-pip';
        if (pos === activePipPos) cls += ' is-active';
        else if (dist === 1) cls += ' is-near';
        else if (tIdx === lastIdx) cls += ' is-last';
        const t = turns[tIdx];
        const tip = t ? `${formatHHMM(t.timestamp)} ${t.text.slice(0, 36)}` : '';
        return `<button type="button" class="${cls}" data-pip-turn="${tIdx}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}"></button>`;
      })
      .join('');

    railEl.querySelectorAll('[data-pip-turn]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.pipTurn);
        if (!Number.isNaN(idx)) jumpToTurn(idx);
      });
    });
  };

  const renderCardRows = () => {
    if (!listEl) return;
    const conv = state.activeConv;
    if (titleEl) titleEl.textContent = (conv && conv.title) || '当前对话';
    if (metaEl) metaEl.textContent = formatDateRangeMeta(turns, conv);

    listEl.innerHTML = turns
      .map((t, idx) => {
        const isAct = idx === activeTurnIdx;
        return `
          <button type="button" class="turn-nav-row ${isAct ? 'active' : ''}" data-turn-idx="${idx}" title="${escapeHtml(t.text)}">
            <span class="turn-nav-time">${escapeHtml(formatHHMM(t.timestamp))}</span>
            <span class="turn-nav-text">${escapeHtml(t.text)}</span>
          </button>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-turn-idx]').forEach((row) => {
      row.addEventListener('click', () => {
        const idx = Number(row.dataset.turnIdx);
        if (!Number.isNaN(idx)) jumpToTurn(idx);
      });
    });
  };

  const syncActiveUi = (scrollCardToActive = false) => {
    renderRailPips();
    if (!listEl) return;
    listEl.querySelectorAll('.turn-nav-row').forEach((row, idx) => {
      row.classList.toggle('active', idx === activeTurnIdx);
      row.classList.toggle('kbd-focus', pinnedOpen && idx === kbdFocusIdx);
    });
    if (scrollCardToActive) {
      const target = listEl.querySelector('.turn-nav-row.kbd-focus, .turn-nav-row.active');
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  const detectActiveTurnFromScroll = () => {
    if (!scrollArea || !turns.length) return;
    const areaRect = scrollArea.getBoundingClientRect();
    const focalY = areaRect.top + Math.min(180, areaRect.height * 0.28);

    // If scrolled near the very bottom, highlight the latest turn
    const distToBottom = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
    if (distToBottom < 28) {
      if (activeTurnIdx !== turns.length - 1) {
        activeTurnIdx = turns.length - 1;
        syncActiveUi(false);
      }
      return;
    }

    // Binary search turns by viewport top so offscreen content-visibility turns stay untouched
    let lo = 0;
    let hi = turns.length - 1;
    let chosen = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const el = turns[mid].el;
      if (!el) {
        lo = mid + 1;
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.top <= focalY) {
        chosen = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (chosen !== activeTurnIdx) {
      activeTurnIdx = chosen;
      syncActiveUi(false);
    }
  };

  const refresh = () => {
    if (!dockEl || !messagesEl) return;
    const isChatView = state.activeView === 'chat';
    const userNodes = Array.from(messagesEl.querySelectorAll('.msg-user'));
    if (!isChatView || !userNodes.length) {
      turns = [];
      dockEl.style.display = 'none';
      closeCard();
      return;
    }

    const conv = state.activeConv;
    const msgs = (conv && Array.isArray(conv.messages) && conv.messages) || [];
    const baseStart = (conv && conv.created_at) || Date.now() / 1000;
    const baseEnd = (conv && conv.updated_at) || baseStart;
    const total = userNodes.length;

    turns = userNodes.map((el, turnIdx) => {
      const msgIdxAttr = Number(el.dataset.msgIndex);
      const msgData = !Number.isNaN(msgIdxAttr) && msgs[msgIdxAttr] ? msgs[msgIdxAttr] : null;
      const domTs = Number(el.dataset.timestamp || 0);
      const fallbackTs =
        total > 1 ? baseStart + ((baseEnd - baseStart) * turnIdx) / (total - 1) : baseStart;
      const ts = (msgData && msgData.timestamp) || domTs || fallbackTs;
      const txtEl = el.querySelector('.msg-user-text');
      const rawTxt = (msgData && msgData.content) || (txtEl && txtEl.textContent) || '';
      return {
        turnIdx,
        msgIndex: Number.isNaN(msgIdxAttr) ? turnIdx * 2 : msgIdxAttr,
        text: summarizePromptLine(rawTxt),
        timestamp: ts,
        el,
      };
    });

    activeTurnIdx = Math.min(activeTurnIdx, turns.length - 1);
    dockEl.style.display = 'flex';
    renderCardRows();
    detectActiveTurnFromScroll();
    renderRailPips();
  };

  // Hover open / graceful delayed close so moving pointer from rail to card never flickers
  if (dockEl) {
    dockEl.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      dockEl.classList.add('is-open');
      syncActiveUi(true);
    });
    dockEl.addEventListener('mouseleave', () => {
      if (pinnedOpen) return;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!pinnedOpen) dockEl.classList.remove('is-open');
      }, 140);
    });
  }

  if (scrollArea) {
    scrollArea.addEventListener(
      'scroll',
      () => {
        if (!turns.length || rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
          rafScheduled = false;
          detectActiveTurnFromScroll();
        });
      },
      { passive: true }
    );
  }

  document.addEventListener('click', (e) => {
    if (pinnedOpen && dockEl && !dockEl.contains(e.target)) {
      closeCard();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!pinnedOpen || !turns.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      kbdFocusIdx = (kbdFocusIdx + 1) % turns.length;
      syncActiveUi(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      kbdFocusIdx = (kbdFocusIdx - 1 + turns.length) % turns.length;
      syncActiveUi(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      jumpToTurn(kbdFocusIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCard();
    }
  });

  return {
    refresh,
    jumpToTurn,
    jumpToMessageIndex,
    openCardPinned,
    closeCard,
    toggleCard,
  };
}
