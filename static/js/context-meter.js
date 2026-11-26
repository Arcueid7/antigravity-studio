/* ==========================================================================
   Antigravity Studio — Conversation Context & Token Usage Meter
   ========================================================================== */

export function estimateTextTokens(text) {
  if (!text) return 0;
  const s = String(text);
  let cjk = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) cjk++;
  }
  const nonCjk = s.length - cjk;
  return Math.ceil(cjk * 1.45 + nonCjk / 3.6);
}

export function getContextWindowForModel(modelSlug) {
  const m = String(modelSlug || 'default').toLowerCase();
  if (m.includes('claude') || m.includes('sonnet') || m.includes('opus') || m.includes('haiku')) {
    return 200_000;
  }
  if (m.includes('gpt-4') || m.includes('o1') || m.includes('o3') || m.includes('codex')) {
    return 200_000;
  }
  // Gemini / default agy models support 1M context window
  return 1_000_000;
}

export function formatTokenCount(n) {
  if (!n || n < 1000) return `${Math.max(0, Math.round(n || 0))}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function estimateConversationTokens(conv, draftText = '', liveStream = null) {
  let tokens = 0;
  const msgs = (conv && Array.isArray(conv.messages)) ? conv.messages : [];
  for (const m of msgs) {
    tokens += 12; // role/framing overhead
    tokens += estimateTextTokens(m.content || '');
    if (m.thinking) tokens += Math.round(estimateTextTokens(m.thinking) * 0.6);
    if (Array.isArray(m.tools)) {
      for (const t of m.tools) {
        tokens += estimateTextTokens(typeof t.args === 'string' ? t.args : JSON.stringify(t.args || ''));
        if (t.output) {
          const outStr = typeof t.output === 'string' ? t.output : JSON.stringify(t.output);
          tokens += estimateTextTokens(outStr.slice(0, 6000));
        }
      }
    }
  }
  if (liveStream) {
    tokens += estimateTextTokens(liveStream.accText || '');
    tokens += Math.round(estimateTextTokens(liveStream.accThinking || '') * 0.6);
  }
  if (draftText) {
    tokens += estimateTextTokens(draftText);
  }
  return { tokens, messageCount: msgs.length };
}

export function updateContextMeterUi(el, conv, modelSlug, draftText = '', liveStream = null) {
  if (!el) return;
  const { tokens, messageCount } = estimateConversationTokens(conv, draftText, liveStream);
  if (tokens < 20 && messageCount === 0) {
    el.style.display = 'none';
    return;
  }
  const limit = getContextWindowForModel(modelSlug);
  const pct = Math.min(100, (tokens / limit) * 100);
  const pctLabel = pct < 1 ? '<1%' : `${Math.round(pct)}%`;
  const levelClass = pct >= 85 ? 'ctx-danger' : pct >= 65 ? 'ctx-warn' : '';

  el.style.display = 'inline-flex';
  el.className = `ctx-meter-pill ${levelClass}`.trim();
  el.title = `当前会话估算上下文：约 ${tokens.toLocaleString()} / ${limit.toLocaleString()} tokens（${messageCount} 条消息，窗口 ${formatTokenCount(limit)}）`;
  el.innerHTML = `
    <span class="ctx-meter-bar"><span class="ctx-meter-fill" style="width:${Math.max(3, pct).toFixed(1)}%;"></span></span>
    <span class="ctx-meter-text">${formatTokenCount(tokens)} · ${pctLabel}</span>
  `;
}
