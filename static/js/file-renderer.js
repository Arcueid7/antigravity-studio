/* ==========================================================================
   Antigravity Studio — Multi-Format File Reader & Light Editor Renderer
   Supports PDF, Images, Video/Audio, DOCX, XLSX/CSV, PPTX, IPYNB, ZIP,
   Markdown, HTML/SVG, Syntax-Highlighted Code, and Live Edit Mode.
   ========================================================================== */

import { escapeHtml, formatBytes, highlightCode } from './markdown-utils.js';
import { renderMermaidDiagramsIn } from './rich-render.js';

export function extToHighlightLang(ext) {
  const map = {
    '.py': 'python', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
    '.ts': 'ts', '.tsx': 'ts', '.css': 'css', '.scss': 'css', '.html': 'html',
    '.htm': 'html', '.svg': 'xml', '.xml': 'xml', '.json': 'json',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.sh': 'bash',
    '.bash': 'bash', '.ps1': 'bash', '.cs': 'cs', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
    '.sql': 'sql', '.md': 'markdown', '.markdown': 'markdown',
  };
  return map[(ext || '').toLowerCase()] || 'text';
}

export function isEditableFileData(f) {
  return Boolean(f && f.kind === 'text' && !f.truncated);
}

export function renderFileBodyHtmlInto(container, tab, onStateChange, deps = {}) {
  const {
    renderMarkdown,
    openExternalPath,
    primaryReaderEl,
    btnSaveEl,
    renderRightTabBar,
    saveActiveFileEdit,
  } = deps;

  const f = tab && tab.fileData;
  if (!f) {
    container.innerHTML = '<div class="rp-empty-state"><div class="rp-empty-desc">正在读取文件…</div></div>';
    return { meta: '读取中…', toggleLabel: '', canCopy: false };
  }

  if (f.kind === 'pdf') {
    const hideTb = Boolean(tab.mdRendered);
    const hash = hideTb ? '#toolbar=0&navpanes=0&view=FitH' : '#toolbar=1&navpanes=0&view=FitH';
    container.innerHTML = `<div class="rp-pdf-wrap"><iframe class="rp-pdf-frame" src="${escapeHtml(f.preview_url)}${hash}" title="${escapeHtml(f.name)}"></iframe></div>`;
    return { meta: `PDF · ${formatBytes(f.size)}`, toggleLabel: hideTb ? '工具栏' : '精简', canCopy: false };
  }

  if (f.kind === 'image') {
    container.innerHTML = `
      <div class="rp-reader-img-box">
        <img src="${escapeHtml(f.preview_url)}" alt="${escapeHtml(f.name)}" />
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(f.rel_path)} · ${escapeHtml(formatBytes(f.size))}</div>
      </div>
    `;
    return { meta: `图片 · ${formatBytes(f.size)}`, toggleLabel: '', canCopy: false };
  }

  if (f.kind === 'video') {
    container.innerHTML = `
      <div class="rp-media-box">
        <video controls preload="metadata" src="${escapeHtml(f.preview_url)}"></video>
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(f.rel_path)} · ${escapeHtml(formatBytes(f.size))}</div>
      </div>
    `;
    return { meta: `视频 · ${formatBytes(f.size)}`, toggleLabel: '', canCopy: false };
  }

  if (f.kind === 'audio') {
    container.innerHTML = `
      <div class="rp-media-box">
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${escapeHtml(f.name)}</div>
        <audio controls preload="metadata" src="${escapeHtml(f.preview_url)}"></audio>
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(formatBytes(f.size))}</div>
      </div>
    `;
    return { meta: `音频 · ${formatBytes(f.size)}`, toggleLabel: '', canCopy: false };
  }

  if (f.kind === 'docx') {
    const showRaw = Boolean(tab.mdRendered);
    if (showRaw) {
      container.innerHTML = `<pre class="rp-nb-code" style="margin:12px;white-space:pre-wrap;">${escapeHtml(f.content || '')}</pre>`;
    } else {
      container.innerHTML = `<div class="rp-reader-md-box claude-prose">${renderMarkdown(f.content || '（文档无文本内容）', false)}</div>`;
    }
    return { meta: `Word · ${formatBytes(f.size)}`, toggleLabel: showRaw ? '排版' : '纯文本', canCopy: true };
  }

  if (f.kind === 'table') {
    const sheets = f.sheets || [];
    if (!sheets.length) {
      container.innerHTML = '<div class="rp-empty-state"><div class="rp-empty-desc">表格为空</div></div>';
      return { meta: `表格 · ${formatBytes(f.size)}`, toggleLabel: '', canCopy: Boolean(f.content) };
    }
    const activeIdx = Math.min(tab.activeSheet || 0, sheets.length - 1);
    const sheet = sheets[activeIdx];
    const rows = sheet.rows || [];
    let html = '';
    if (sheets.length > 1) {
      html += '<div class="rp-sheet-tabs">';
      sheets.forEach((sh, i) => {
        html += `<button type="button" class="rp-sheet-tab ${i === activeIdx ? 'active' : ''}" data-sheet-idx="${i}">${escapeHtml(sh.name)}</button>`;
      });
      html += '</div>';
    }
    html += '<div class="rp-data-table-wrap"><table class="rp-data-table">';
    if (rows.length) {
      html += '<thead><tr><th style="width:40px;color:var(--text-muted);">#</th>';
      rows[0].forEach((cell) => {
        html += `<th title="${escapeHtml(cell)}">${escapeHtml(cell)}</th>`;
      });
      html += '</tr></thead><tbody>';
      for (let r = 1; r < rows.length; r++) {
        html += `<tr><td style="color:var(--text-muted);">${r}</td>`;
        rows[r].forEach((cell) => {
          html += `<td title="${escapeHtml(cell)}">${escapeHtml(cell)}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody>';
    }
    html += '</table></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-sheet-idx]').forEach((b) => {
      b.addEventListener('click', () => {
        tab.activeSheet = Number(b.dataset.sheetIdx) || 0;
        if (onStateChange) onStateChange();
      });
    });
    return { meta: `${rows.length} 行 · ${formatBytes(f.size)}`, toggleLabel: '', canCopy: Boolean(f.content) };
  }

  if (f.kind === 'pptx') {
    const slides = f.slides || [];
    container.innerHTML = `<div class="rp-slides-wrap">${
      slides.length
        ? slides
            .map(
              (sl) => `
            <div class="rp-slide-card">
              <div class="rp-slide-head">Slide ${sl.index}</div>
              ${(sl.paragraphs || []).map((p) => `<p class="rp-slide-para">${escapeHtml(p)}</p>`).join('') || '<p class="rp-slide-para" style="color:var(--text-muted);">（空白幻灯片）</p>'}
            </div>`
            )
            .join('')
        : '<div class="rp-empty-state"><div class="rp-empty-desc">未提取到幻灯片文本</div></div>'
    }</div>`;
    return { meta: `PPT · ${slides.length} 页`, toggleLabel: '', canCopy: false };
  }

  if (f.kind === 'ipynb') {
    const cells = f.cells || [];
    container.innerHTML = `<div class="rp-ipynb-wrap">${cells
      .map((c) => {
        if (c.cell_type === 'markdown') {
          return `<div class="rp-nb-cell"><div class="rp-nb-head">Markdown [${c.index}]</div><div class="claude-prose">${renderMarkdown(c.source || '', false)}</div></div>`;
        }
        const hl = highlightCode(escapeHtml(c.source || ''), 'python');
        return `<div class="rp-nb-cell"><div class="rp-nb-head">Code [${c.index}]</div><pre class="rp-nb-code">${hl}</pre>${c.output ? `<pre class="rp-nb-out">${escapeHtml(c.output)}</pre>` : ''}</div>`;
      })
      .join('')}</div>`;
    return { meta: `Notebook · ${cells.length} 单元格`, toggleLabel: '', canCopy: false };
  }

  if (f.kind === 'archive') {
    const entries = f.entries || [];
    container.innerHTML = `<div class="rp-data-table-wrap"><table class="rp-data-table"><thead><tr><th>压缩包内文件 (${entries.length})</th><th>大小</th></tr></thead><tbody>${entries
      .map((e) => `<tr><td>${e.is_dir ? '📁 ' : ''}${escapeHtml(e.name)}</td><td>${e.is_dir ? '-' : escapeHtml(formatBytes(e.size))}</td></tr>`)
      .join('')}</tbody></table></div>`;
    return { meta: `ZIP · ${entries.length} 项`, toggleLabel: '', canCopy: false };
  }

  if (f.kind === 'binary') {
    container.innerHTML = `
      <div class="rp-empty-state">
        <div class="rp-empty-title">${escapeHtml(f.name)}</div>
        <div class="rp-empty-desc">此格式（${escapeHtml(f.ext || '二进制')}，${escapeHtml(formatBytes(f.size))}）暂不支持纯文本内联渲染，可直接调用系统默认应用打开或「@ 引用」给 agy 分析。</div>
        <button type="button" class="primary-btn" data-open-ext="1" style="margin-top:8px;padding:7px 14px;font-size:12.5px;">用系统默认应用打开</button>
      </div>
    `;
    const extBtn = container.querySelector('[data-open-ext]');
    if (extBtn && openExternalPath) extBtn.addEventListener('click', () => openExternalPath(f.abs_path || f.rel_path));
    return { meta: `二进制 · ${formatBytes(f.size)}`, toggleLabel: '', canCopy: false };
  }

  // Text / Markdown / HTML / SVG + Light Editor
  const isMd = f.ext === '.md' || f.ext === '.markdown';
  const isHtmlPreview = f.ext === '.html' || f.ext === '.htm' || f.ext === '.svg';
  const metaStr = `${f.lines} 行 · ${formatBytes(f.size)}${f.truncated ? '（已截断）' : ''}`;

  if (tab.editing && !f.truncated && container === primaryReaderEl) {
    const draft = tab.editDirty && typeof tab.draftContent === 'string' ? tab.draftContent : (f.content || '');
    container.innerHTML = `<div class="rp-code-editor-wrap"><textarea class="rp-code-editor" spellcheck="false"></textarea></div>`;
    const ta = container.querySelector('.rp-code-editor');
    if (ta) {
      ta.value = draft;
      ta.addEventListener('input', () => {
        tab.draftContent = ta.value;
        const dirty = ta.value !== (f.content || '');
        if (tab.editDirty !== dirty) {
          tab.editDirty = dirty;
          if (renderRightTabBar) renderRightTabBar();
        }
        if (btnSaveEl) {
          btnSaveEl.style.display = dirty ? 'inline-flex' : 'none';
          btnSaveEl.disabled = !dirty;
          btnSaveEl.textContent = '保存 ●';
        }
      });
      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          if (saveActiveFileEdit) saveActiveFileEdit(tab);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          const s = ta.selectionStart;
          const end = ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = s + 2;
          ta.dispatchEvent(new Event('input'));
        }
      });
      setTimeout(() => ta.focus(), 10);
    }
    return { meta: `${metaStr} · 编辑中`, toggleLabel: '', canCopy: true };
  }

  if (isMd && tab.mdRendered) {
    container.innerHTML = `<div class="rp-reader-md-box claude-prose">${renderMarkdown(f.content || '', false)}</div>`;
    renderMermaidDiagramsIn(container);
    return { meta: metaStr, toggleLabel: '源码', canCopy: true };
  }
  if (isHtmlPreview && tab.mdRendered) {
    const doc =
      f.ext === '.svg'
        ? `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#FAF9F5;">${f.content || ''}</body></html>`
        : f.content || '';
    container.innerHTML = `<iframe class="rp-html-preview-frame" sandbox="allow-scripts"></iframe>`;
    const ifr = container.querySelector('iframe');
    if (ifr) ifr.srcdoc = doc;
    return { meta: metaStr, toggleLabel: '源码', canCopy: true };
  }

  const lang = extToHighlightLang(f.ext);
  const lines = (f.content || '').split(/\r?\n/);
  const rowsHtml = lines
    .map((line, i) => {
      const hl = highlightCode(escapeHtml(line), lang);
      return `<tr><td class="rp-code-ln">${i + 1}</td><td class="rp-code-src">${hl || ' '}</td></tr>`;
    })
    .join('');
  container.innerHTML = `<table class="rp-code-table"><tbody>${rowsHtml}</tbody></table>`;
  return {
    meta: metaStr,
    toggleLabel: isMd ? '渲染' : isHtmlPreview ? '预览' : '',
    canCopy: true,
  };
}
