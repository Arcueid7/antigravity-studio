/* ==========================================================================
   Antigravity Studio — Path Helpers, Syntax Highlighter, LaTeX & Safe Markdown
   ========================================================================== */

import { renderLatexExpr } from './rich-render.js';

export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i;

export function folderBasename(p) {
  if (!p) return '~';
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = norm.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

export function shortenPath(p) {
  if (!p) return '~';
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = norm.split('/').filter(Boolean);
  if (parts.length <= 2) return norm || p;
  return '…/' + parts.slice(-2).join('/');
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtBadge(name) {
  const idx = (name || '').lastIndexOf('.');
  if (idx === -1) return 'FILE';
  return name.slice(idx + 1, idx + 5).toUpperCase() || 'FILE';
}

export function normalizePathKey(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function highlightCode(escapedCode, lang) {
  const l = (lang || '').toLowerCase();
  if (!l || l === 'text' || l === 'plaintext') return escapedCode;

  const placeholders = [];
  const stash = (cls, match) => {
    const idx = placeholders.length;
    placeholders.push(`<span class="${cls}">${match}</span>`);
    return `\u0000TOK${idx}\u0000`;
  };

  let work = escapedCode;
  if (['py', 'python', 'sh', 'bash', 'yaml', 'yml', 'toml'].includes(l)) {
    work = work.replace(/(#[^\n]*)/g, (m) => stash('tok-com', m));
  } else if (['css'].includes(l)) {
    work = work.replace(/(\/\*[\s\S]*?\*\/)/g, (m) => stash('tok-com', m));
  } else {
    work = work.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, (m) => stash('tok-com', m));
  }

  work = work.replace(
    /(&quot;(?:\\.|(?!&quot;)[^\n])*?&quot;|'(?:\\.|[^'\n])*?'|`(?:\\.|[^`])*?`)/g,
    (m) => stash('tok-str', m)
  );

  const kwRegex =
    /\b(def|class|async|await|return|import|from|if|elif|else|for|while|try|except|finally|with|as|pass|break|continue|lambda|yield|const|let|var|function|export|default|interface|type|struct|enum|impl|fn|pub|use|True|False|None|true|false|null|undefined|new|this)\b/g;
  work = work.replace(kwRegex, '<span class="tok-kw">$1</span>');
  work = work.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
  work = work.replace(/\u0000TOK(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)]);
  return work;
}

export function normalizeLocalFilePath(rawUrl) {
  if (!rawUrl) return '';
  let p = String(rawUrl).trim();
  if (/^file:\/\/\//i.test(p)) p = p.slice(8);
  else if (/^file:\/\//i.test(p)) p = p.slice(7);
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep raw
  }
  p = p.replace(/#L\d+(?:-L?\d+)?$/i, '');
  return p;
}

export function normPathCmp(p) {
  return normalizeLocalFilePath(p).replace(/\\/g, '/').toLowerCase();
}

export function formatInline(escapedLine, renderedImgSet = null) {
  const codeSlots = [];
  let s = escapedLine.replace(/`([^`]+)`/g, (_, code) => {
    const id = codeSlots.length;
    codeSlots.push(`<code>${code}</code>`);
    return `\u0000INL${id}\u0000`;
  });

  const htmlSlots = [];
  const stashHtml = (snippet) => {
    const id = htmlSlots.length;
    htmlSlots.push(snippet);
    return `\u0000HTM${id}\u0000`;
  };

  const unescapeMathEntities = (expr) =>
    String(expr)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');

  // Inline LaTeX Math: \( ... \) and $ ... $ (protects prices like $100 and inline `code`)
  s = s.replace(/\\\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*?)\\\)/g, (_, expr) =>
    stashHtml(`<span class="math-inline">${renderLatexExpr(unescapeMathEntities(expr), false)}</span>`)
  );
  s = s.replace(/(^|[^\\$])\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s|\\)\$(?![\d$])/g, (_, prefix, expr) => {
    const cleanExpr = unescapeMathEntities(expr).replace(/\\\$/g, '$');
    return `${prefix}${stashHtml(`<span class="math-inline">${renderLatexExpr(cleanExpr, false)}</span>`)}`;
  });

  // Inline Markdown Images ![alt](url-or-local-path) -> interactive zoomable card + hover actions
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, rawSrc) => {
    const isRemote = /^https?:\/\//i.test(rawSrc);
    const localPath = isRemote ? '' : normalizeLocalFilePath(rawSrc);
    const src = isRemote
      ? rawSrc
      : `/api/local-image?path=${encodeURIComponent(localPath || rawSrc)}`;
    if (renderedImgSet && localPath) renderedImgSet.add(normPathCmp(localPath));
    const cleanName = folderBasename(localPath || alt || 'image');
    const localBtns = localPath
      ? `<button type="button" class="chat-img-pill" data-img-action="open" title="用系统默认应用打开">系统打开</button><button type="button" class="chat-img-pill" data-img-action="reveal" title="在文件夹中显示">定位文件</button>`
      : '';
    return stashHtml(
      `<span class="chat-img-card" data-img-src="${escapeHtml(src)}" data-img-path="${escapeHtml(localPath)}" data-img-name="${escapeHtml(cleanName)}">` +
        `<img class="chat-inline-img" src="${escapeHtml(src)}" alt="${alt || escapeHtml(cleanName)}" loading="lazy" />` +
        `<span class="chat-img-hover-bar">` +
          `<button type="button" class="chat-img-pill" data-img-action="lightbox" title="放大查看">查看大图</button>` +
          localBtns +
        `</span>` +
      `</span>`
    );
  });

  // Local Markdown File Links [label](file:///...) or [label](C:/...)
  const buildFilePill = (label, rawUrl) => {
    const cleanPath = normalizeLocalFilePath(rawUrl);
    const isImg = IMAGE_EXT_RE.test(cleanPath);
    const display = (label && !/^[a-zA-Z]:[\\/]/.test(label) && !/^file:\/\//i.test(label))
      ? label
      : folderBasename(cleanPath);
    const iconSvg = isImg
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
    return stashHtml(
      `<button type="button" class="chat-file-pill" data-file-path="${escapeHtml(cleanPath)}" data-file-kind="${isImg ? 'image' : 'file'}" title="${escapeHtml(cleanPath)}">` +
        `<span class="chat-file-pill-icon">${iconSvg}</span>` +
        `<span class="chat-file-pill-name">${escapeHtml(display)}</span>` +
      `</button>`
    );
  };

  s = s.replace(/\[([^\]]+)\]\((file:\/\/\/?[^\s)]+|[a-zA-Z]:[\\/][^\s)]+)\)/gi, (_, label, rawUrl) =>
    buildFilePill(label, rawUrl)
  );

  // Bare file:/// URLs in prose
  s = s.replace(/\bfile:\/\/\/[^\s<>"')]+/gi, (rawUrl) => buildFilePill('', rawUrl));

  // External Web Links
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
    stashHtml(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
  );

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000HTM(\d+)\u0000/g, (_, id) => htmlSlots[Number(id)]);
  s = s.replace(/\u0000INL(\d+)\u0000/g, (_, id) => codeSlots[Number(id)]);
  return s;
}

export function renderMarkdownDocument(mdText, isStreaming, { nextBlockId, storeCodeBlock, onArtifact }) {
  if (!mdText) return isStreaming ? '<span class="streaming-spark">✦</span>' : '';

  const blockSlots = [];
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)(```|$)/g;

  const withoutCode = mdText.replace(fenceRegex, (_, rawLang, rawCode, closingFence) => {
    const lang = (rawLang || 'text').trim();
    const cleanCode = rawCode.replace(/\n$/, '');
    const isClosed = closingFence === '```';
    const blockId = nextBlockId();
    storeCodeBlock(blockId, { lang, code: cleanCode });

    if (lang.toLowerCase() === 'mermaid') {
      const highlighted = highlightCode(escapeHtml(cleanCode), 'text');
      const renderFlag = isClosed && !isStreaming ? '0' : 'pending';
      const sparkMiniSvg =
        '<svg class="ui-line-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3z"/></svg>';
      const mermaidCard = `
        <div class="mermaid-card" data-block="${blockId}" data-mermaid-rendered="${renderFlag}">
          <div class="code-block-topbar">
            <span class="code-lang-label">${sparkMiniSvg}<span>Mermaid 图表</span></span>
            <div class="code-actions">
              <button class="code-action-btn" data-action="toggle-mermaid-src" data-block="${blockId}">源码</button>
              <button class="code-action-btn" data-action="artifact" data-block="${blockId}">右侧查看</button>
              <button class="code-action-btn" data-action="copy-code" data-block="${blockId}">复制</button>
            </div>
          </div>
          <div class="mermaid-error" style="display:none;"></div>
          <div class="mermaid-canvas">${isClosed ? '<div class="mermaid-loading">正在渲染图表…</div>' : '<div class="mermaid-loading">图表生成中…</div>'}</div>
          <pre class="mermaid-source"><code>${highlighted}</code></pre>
        </div>
      `;
      const slotIdx = blockSlots.length;
      blockSlots.push(mermaidCard);
      return `\n\n@@CODEBLOCK_${slotIdx}@@\n\n`;
    }

    const isRenderableArtifact = ['html', 'svg'].includes(lang.toLowerCase());
    if (isRenderableArtifact && cleanCode.length > 40 && onArtifact) {
      onArtifact({ lang, code: cleanCode, title: `Artifact (${lang.toUpperCase()})` });
    }

    const highlighted = highlightCode(escapeHtml(cleanCode), lang);
    const sparkMiniSvg =
      '<svg class="ui-line-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3z"/></svg>';
    const previewLabel = isRenderableArtifact ? `${sparkMiniSvg}<span>预览 Artifact</span>` : '<span>右侧查看</span>';

    const cardHtml = `
      <div class="claude-code-block">
        <div class="code-block-topbar">
          <span class="code-lang-label">${escapeHtml(lang)}</span>
          <div class="code-actions">
            <button class="code-action-btn ${isRenderableArtifact ? 'preview-btn' : ''}" data-action="artifact" data-block="${blockId}">
              ${previewLabel}
            </button>
            <button class="code-action-btn" data-action="copy-code" data-block="${blockId}">复制</button>
          </div>
        </div>
        <pre><code>${highlighted}</code></pre>
      </div>
    `;
    const slotIdx = blockSlots.length;
    blockSlots.push(cardHtml);
    return `\n\n@@CODEBLOCK_${slotIdx}@@\n\n`;
  });

  // Extract Block-Level LaTeX Math: $$ ... $$ and \[ ... \] (safe because code fences are already stashed)
  const mathBlockSlots = [];
  const stashDisplayMath = (expr) => {
    const idx = mathBlockSlots.length;
    mathBlockSlots.push(`<div class="math-display-block">${renderLatexExpr(expr, true)}</div>`);
    return `\n\n@@MATHBLOCK_${idx}@@\n\n`;
  };
  let withoutMath = withoutCode.replace(/(^|[^\\])\$\$([\s\S]+?)(?<!\\)\$\$/g, (_, pre, expr) => {
    return `${pre}${stashDisplayMath(expr.trim())}`;
  });
  withoutMath = withoutMath.replace(/\\\[([\s\S]+?)\\\]/g, (_, expr) => stashDisplayMath(expr.trim()));

  const lines = withoutMath.split('\n');
  const renderedImgSet = new Set();
  for (const ln of lines) {
    let m;
    const imgRe = /!\[[^\]]*\]\(([^)\s]+)\)/g;
    while ((m = imgRe.exec(ln)) !== null) {
      if (!/^https?:\/\//i.test(m[1])) {
        renderedImgSet.add(normPathCmp(m[1]));
      }
    }
  }

  const isRedundantImagePathLine = (lineStr) => {
    if (!renderedImgSet.size) return false;
    const stripped = lineStr.replace(/\*\*/g, '').replace(/`/g, '').trim();
    const prefixRe = /^(?:[-*+]\s*)?(?:文件位置|图片位置|保存路径|保存位置|文件路径|图片路径|已保存至|输出路径|Saved(?:\s+to)?|File(?:\s+path)?|Image(?:\s+path)?|Path)\s*[:：]\s*(.+)$/i;
    const pm = stripped.match(prefixRe);
    if (!pm) return false;
    const rest = pm[1].trim();
    const linkM = rest.match(/^\[[^\]]+\]\(([^)\s]+)\)\s*[。.]?$/);
    const target = linkM ? linkM[1] : rest.replace(/[。.]$/, '');
    if (renderedImgSet.has(normPathCmp(target))) return true;
    const base = folderBasename(normalizeLocalFilePath(target)).toLowerCase();
    if (base && IMAGE_EXT_RE.test(base)) {
      for (const p of renderedImgSet) {
        if (p.endsWith('/' + base) || p === base) return true;
      }
    }
    return false;
  };

  const htmlParts = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let paragraphBuf = [];

  const flushParagraph = () => {
    if (paragraphBuf.length) {
      htmlParts.push(`<p>${paragraphBuf.join('<br />')}</p>`);
      paragraphBuf = [];
    }
  };
  const closeLists = () => {
    if (inUl) { htmlParts.push('</ul>'); inUl = false; }
    if (inOl) { htmlParts.push('</ol>'); inOl = false; }
  };
  const closeTable = () => {
    if (inTable) { htmlParts.push('</tbody></table>'); inTable = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed && isRedundantImagePathLine(trimmed)) continue;

    const cbMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (cbMatch) {
      flushParagraph(); closeLists(); closeTable();
      htmlParts.push(blockSlots[Number(cbMatch[1])]);
      continue;
    }

    const mbMatch = trimmed.match(/^@@MATHBLOCK_(\d+)@@$/);
    if (mbMatch) {
      flushParagraph(); closeLists(); closeTable();
      htmlParts.push(mathBlockSlots[Number(mbMatch[1])]);
      continue;
    }

    if (!trimmed) {
      flushParagraph(); closeLists(); closeTable();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(); closeLists(); closeTable();
      htmlParts.push('<hr />');
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      flushParagraph(); closeLists(); closeTable();
      const level = hMatch[1].length;
      htmlParts.push(`<h${level}>${formatInline(escapeHtml(hMatch[2]))}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph(); closeLists(); closeTable();
      htmlParts.push(`<blockquote>${formatInline(escapeHtml(trimmed.replace(/^>\s?/, '')))}</blockquote>`);
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushParagraph(); closeLists();
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!inTable) {
        inTable = true;
        htmlParts.push(
          '<table><thead><tr>' +
            cells.map((c) => `<th>${formatInline(escapeHtml(c))}</th>`).join('') +
            '</tr></thead><tbody>'
        );
      } else {
        htmlParts.push(
          '<tr>' + cells.map((c) => `<td>${formatInline(escapeHtml(c))}</td>`).join('') + '</tr>'
        );
      }
      continue;
    } else if (inTable) {
      closeTable();
    }

    const ulMatch = raw.match(/^\s*[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (inOl) { htmlParts.push('</ol>'); inOl = false; }
      if (!inUl) { htmlParts.push('<ul>'); inUl = true; }
      htmlParts.push(`<li>${formatInline(escapeHtml(ulMatch[1]))}</li>`);
      continue;
    }

    const olMatch = raw.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (inUl) { htmlParts.push('</ul>'); inUl = false; }
      if (!inOl) { htmlParts.push('<ol>'); inOl = true; }
      htmlParts.push(`<li>${formatInline(escapeHtml(olMatch[1]))}</li>`);
      continue;
    }

    closeLists();
    paragraphBuf.push(formatInline(escapeHtml(trimmed)));
  }

  flushParagraph(); closeLists(); closeTable();
  let finalHtml = htmlParts.join('\n');
  if (isStreaming) finalHtml += '<span class="streaming-spark">✦</span>';
  return finalHtml;
}
