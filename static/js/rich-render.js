/* ==========================================================================
   Antigravity Studio — Offline KaTeX Math & Mermaid Diagram Renderer
   ========================================================================== */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let mermaidInitTheme = null;
let mermaidUidSeq = 0;

export function renderLatexExpr(tex, displayMode = false) {
  const cleaned = String(tex || '').trim();
  if (!cleaned) return '';

  if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
    try {
      return window.katex.renderToString(cleaned, {
        displayMode: Boolean(displayMode),
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      // fall through to readable fallback
    }
  }

  return displayMode
    ? `<pre class="math-fallback-block"><code>${escHtml(cleaned)}</code></pre>`
    : `<code class="math-fallback-inline">${escHtml(cleaned)}</code>`;
}

function getCurrentMermaidTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' ? 'dark' : 'neutral';
}

function ensureMermaidInitialized(forceTheme = false) {
  if (typeof window === 'undefined' || !window.mermaid) return false;
  const targetTheme = getCurrentMermaidTheme();
  if (forceTheme || mermaidInitTheme !== targetTheme) {
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: targetTheme,
        fontFamily: 'var(--font-ui, system-ui, sans-serif)',
        suppressErrorRendering: true,
      });
      mermaidInitTheme = targetTheme;
    } catch {
      return false;
    }
  }
  return true;
}

function cleanupStrayMermaidErrors(uid) {
  const stray = document.getElementById(`d${uid}`) || document.getElementById(uid);
  if (stray && stray.parentElement === document.body) {
    stray.remove();
  }
}

async function renderSingleMermaidCard(card, codeStore) {
  if (!card) return;
  const blockId = card.dataset.block || '';
  const item = codeStore ? codeStore.get(blockId) : null;
  const srcEl = card.querySelector('.mermaid-source code');
  const rawCode = (item && item.code) || (srcEl && srcEl.textContent) || '';
  const canvasEl = card.querySelector('.mermaid-canvas');
  const errEl = card.querySelector('.mermaid-error');
  if (!canvasEl || !rawCode.trim()) return;

  if (!ensureMermaidInitialized(false)) {
    // Mermaid deferred script may still be loading; retry briefly
    const retries = Number(card.dataset.mermaidRetries || 0);
    if (retries < 12) {
      card.dataset.mermaidRetries = String(retries + 1);
      setTimeout(() => renderSingleMermaidCard(card, codeStore), 180);
    } else {
      card.dataset.mermaidRendered = 'fallback';
      card.classList.add('show-source');
      canvasEl.innerHTML = '<div class="mermaid-fallback-note">Mermaid 引擎未就绪，已切换为源码视图</div>';
    }
    return;
  }

  card.dataset.mermaidRendered = 'rendering';
  const uid = `agy_mmd_${++mermaidUidSeq}_${Date.now()}`;
  try {
    const res = await window.mermaid.render(uid, rawCode.trim());
    cleanupStrayMermaidErrors(uid);
    canvasEl.innerHTML = res.svg || '';
    if (typeof res.bindFunctions === 'function') {
      res.bindFunctions(canvasEl);
    }
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    card.dataset.mermaidRendered = '1';
    card.dataset.mermaidTheme = getCurrentMermaidTheme();
  } catch (err) {
    cleanupStrayMermaidErrors(uid);
    card.dataset.mermaidRendered = 'error';
    card.classList.add('show-source');
    canvasEl.innerHTML = '';
    if (errEl) {
      errEl.style.display = 'block';
      errEl.textContent = `Mermaid 语法渲染失败，已自动展示源码：${(err && err.message) || '语法错误'}`;
    }
  }
}

export function renderMermaidDiagramsIn(rootEl, codeStore = null) {
  if (!rootEl) return;
  const cards = rootEl.querySelectorAll('.mermaid-card[data-mermaid-rendered="0"]');
  cards.forEach((card) => {
    renderSingleMermaidCard(card, codeStore);
  });
}

export function rerenderAllMermaidForTheme(codeStore = null) {
  const cards = document.querySelectorAll('.mermaid-card[data-mermaid-rendered="1"]');
  if (!cards.length) return;
  ensureMermaidInitialized(true);
  cards.forEach((card) => {
    card.dataset.mermaidRendered = '0';
    renderSingleMermaidCard(card, codeStore);
  });
}
