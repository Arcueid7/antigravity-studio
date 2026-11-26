/* ==========================================================================
   Antigravity Studio — Compact Monochrome Tool Activity Group Renderer
   Collapses noisy tool call streams into a concise single-line human summary
   with monochrome line icons, consecutive bare-step folding, clickable file
   pills, and expandable red/green line diffs.
   ========================================================================== */

import { escapeHtml, folderBasename } from './markdown-utils.js';

const FILE_ARG_KEYS = [
  'path',
  'Path',
  'TargetFile',
  'AbsolutePath',
  'file_path',
  'filepath',
  'filename',
  'file',
  'DirectoryPath',
  'SearchPath',
];

const iconSvg = (inner, size = 14) =>
  `<svg class="ui-line-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const STEP_ICONS = {
  check: iconSvg('<polyline points="20 6 9 17 4 12"/>', 13.5),
  error: iconSvg('<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', 13.5),
  chevron: iconSvg('<polyline points="9 18 15 12 9 6"/>', 13),
  read: iconSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
  edit: iconSvg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  write: iconSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>'),
  command: iconSvg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><polyline points="7 9 10 12 7 15"/><line x1="12" y1="15" x2="17" y2="15"/>'),
  search: iconSvg('<circle cx="11" cy="11" r="7.5"/><line x1="20" y1="20" x2="16.4" y2="16.4"/>'),
  web: iconSvg('<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14.5 14.5 0 0 1 0 18a14.5 14.5 0 0 1 0-18"/>'),
  image: iconSvg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
  generic: iconSvg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.66 0-1.25.4-1.51 1z"/>'),
  fileMini: iconSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>', 12),
};

function parseArgsObject(rawArgs) {
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object' && !Array.isArray(rawArgs)) return rawArgs;
  if (typeof rawArgs === 'string') {
    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return { _raw: rawArgs };
    }
  }
  return {};
}

function classifyTool(toolName, argsObj) {
  const n = String(toolName || '').toLowerCase();
  if (
    n.includes('edit') ||
    n.includes('replace') ||
    n.includes('patch') ||
    n.includes('diff') ||
    ('Target' in argsObj && 'Replacement' in argsObj) ||
    ('old_str' in argsObj && 'new_str' in argsObj) ||
    ('old_string' in argsObj && 'new_string' in argsObj) ||
    ('TargetContent' in argsObj && 'ReplacementContent' in argsObj) ||
    Array.isArray(argsObj.ReplacementChunks)
  ) {
    return 'edit';
  }
  if (n.includes('write') || n.includes('create_file') || n.includes('save')) return 'write';
  if (n.includes('image') || n.includes('generate_img')) return 'image';
  if (n.includes('web') || n.includes('url') || n.includes('browser') || n.includes('http')) return 'web';
  if (n.includes('read') || n.includes('view_file') || n.includes('view_code') || n.includes('cat') || n.includes('outline')) return 'read';
  if (
    n.includes('command') ||
    n.includes('bash') ||
    n.includes('shell') ||
    n.includes('terminal') ||
    n.includes('exec') ||
    'CommandLine' in argsObj ||
    'command' in argsObj
  ) {
    return 'command';
  }
  if (n.includes('grep') || n.includes('find') || n.includes('search') || n.includes('list') || n.includes('glob')) return 'search';
  return 'generic';
}

function toDisplayRelPath(rawPath, activeCwd) {
  const p = String(rawPath || '').trim();
  if (!p) return '';
  const pNorm = p.replace(/\\/g, '/');
  const cwdNorm = String(activeCwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (cwdNorm && pNorm.toLowerCase().startsWith(cwdNorm.toLowerCase() + '/')) {
    return pNorm.slice(cwdNorm.length + 1);
  }
  return pNorm;
}

function extractFilePaths(argsObj) {
  const seen = new Set();
  const list = [];
  for (const k of FILE_ARG_KEYS) {
    const val = argsObj[k];
    if (typeof val === 'string' && val.trim()) {
      const clean = val.trim();
      const key = clean.replace(/\\/g, '/').toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push(clean);
      }
    }
  }
  return list;
}

function computeLineDiff(oldText, newText, maxLines = 160) {
  const a = String(oldText ?? '').replace(/\r\n/g, '\n').split('\n');
  const b = String(newText ?? '').replace(/\r\n/g, '\n').split('\n');

  if (a.length > 140 || b.length > 140) {
    const ops = [];
    let delCnt = 0;
    let addCnt = 0;
    for (const ln of a.slice(0, 60)) {
      ops.push({ type: 'del', text: ln });
      delCnt++;
    }
    if (a.length > 60) ops.push({ type: 'meta', text: `… 省略旧内容其余 ${a.length - 60} 行` });
    for (const ln of b.slice(0, 60)) {
      ops.push({ type: 'add', text: ln });
      addCnt++;
    }
    if (b.length > 60) ops.push({ type: 'meta', text: `… 省略新内容其余 ${b.length - 60} 行` });
    return { ops, added: addCnt, removed: delCnt };
  }

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
    }
  }

  const rawOps = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      rawOps.push({ type: 'ctx', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawOps.push({ type: 'del', text: a[i] });
      removed++;
      i++;
    } else {
      rawOps.push({ type: 'add', text: b[j] });
      added++;
      j++;
    }
  }
  while (i < m) {
    rawOps.push({ type: 'del', text: a[i++] });
    removed++;
  }
  while (j < n) {
    rawOps.push({ type: 'add', text: b[j++] });
    added++;
  }

  const keep = new Uint8Array(rawOps.length);
  for (let k = 0; k < rawOps.length; k++) {
    if (rawOps[k].type !== 'ctx') {
      for (let d = Math.max(0, k - 2); d <= Math.min(rawOps.length - 1, k + 2); d++) {
        keep[d] = 1;
      }
    }
  }

  const ops = [];
  let skipping = false;
  for (let k = 0; k < rawOps.length; k++) {
    if (keep[k]) {
      skipping = false;
      ops.push(rawOps[k]);
    } else if (!skipping) {
      skipping = true;
      ops.push({ type: 'meta', text: '···' });
    }
    if (ops.length >= maxLines) {
      ops.push({ type: 'meta', text: '… Diff 过长，已折叠剩余行' });
      break;
    }
  }
  return { ops, added, removed };
}

function parseUnifiedDiff(diffStr) {
  const lines = String(diffStr || '').replace(/\r\n/g, '\n').split('\n');
  const ops = [];
  let added = 0;
  let removed = 0;
  for (const ln of lines.slice(0, 180)) {
    if (ln.startsWith('@@') || ln.startsWith('diff ') || ln.startsWith('---') || ln.startsWith('+++')) {
      ops.push({ type: 'meta', text: ln });
    } else if (ln.startsWith('+')) {
      ops.push({ type: 'add', text: ln.slice(1) });
      added++;
    } else if (ln.startsWith('-')) {
      ops.push({ type: 'del', text: ln.slice(1) });
      removed++;
    } else {
      ops.push({ type: 'ctx', text: ln.startsWith(' ') ? ln.slice(1) : ln });
    }
  }
  return { ops, added, removed };
}

function extractDiffSpec(argsObj, outputText) {
  const pairs = [
    ['Target', 'Replacement'],
    ['TargetContent', 'ReplacementContent'],
    ['old_str', 'new_str'],
    ['old_string', 'new_string'],
    ['oldText', 'newText'],
  ];
  for (const [ok, nk] of pairs) {
    if (typeof argsObj[ok] === 'string' && typeof argsObj[nk] === 'string') {
      return computeLineDiff(argsObj[ok], argsObj[nk]);
    }
  }

  if (Array.isArray(argsObj.ReplacementChunks) && argsObj.ReplacementChunks.length) {
    const allOps = [];
    let added = 0;
    let removed = 0;
    argsObj.ReplacementChunks.slice(0, 6).forEach((ch, idx) => {
      if (idx > 0) allOps.push({ type: 'meta', text: `@@ 变更片段 #${idx + 1} @@` });
      const res = computeLineDiff(ch.TargetContent || '', ch.ReplacementContent || '', 60);
      allOps.push(...res.ops);
      added += res.added;
      removed += res.removed;
    });
    return { ops: allOps, added, removed };
  }

  const patchText = argsObj.patch || argsObj.diff || '';
  if (typeof patchText === 'string' && /(^|\n)@@/.test(patchText)) {
    return parseUnifiedDiff(patchText);
  }
  if (typeof outputText === 'string' && /(^|\n)(--- |\+\+\+ |@@ -)/.test(outputText)) {
    return parseUnifiedDiff(outputText);
  }
  return null;
}

function buildDiffHtml(diff) {
  if (!diff || !diff.ops.length) return '';
  const rows = diff.ops
    .map((op) => {
      if (op.type === 'meta') {
        return `<div class="tool-diff-ln is-meta">${escapeHtml(op.text)}</div>`;
      }
      const sign = op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' ';
      const cls = op.type === 'add' ? 'is-add' : op.type === 'del' ? 'is-del' : 'is-ctx';
      return `<div class="tool-diff-ln ${cls}"><span class="tool-diff-sign">${sign}</span><span class="tool-diff-code">${escapeHtml(op.text) || ' '}</span></div>`;
    })
    .join('');
  return `<div class="tool-diff-box">${rows}</div>`;
}

function buildFilePillHtml(rawPath, activeCwd) {
  const disp = toDisplayRelPath(rawPath, activeCwd);
  const shortName = disp.length > 42 ? `…/${folderBasename(disp)}` : disp;
  return `
    <span class="tool-file-pill" role="button" tabindex="0" data-tool-open-file="${escapeHtml(rawPath)}" title="在右侧阅读器打开：${escapeHtml(rawPath)}">
      ${STEP_ICONS.fileMini}
      <span>${escapeHtml(shortName)}</span>
    </span>
  `;
}

function shortCmdPreview(cmd, maxLen = 46) {
  const clean = String(cmd || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
}

function describeToolStep(tool, activeCwd) {
  const argsObj = parseArgsObject(tool.args);
  const kind = classifyTool(tool.name, argsObj);
  const filePaths = extractFilePaths(argsObj);
  const outputStr =
    tool.output === undefined || tool.output === null
      ? ''
      : typeof tool.output === 'string'
        ? tool.output
        : JSON.stringify(tool.output, null, 2);
  const diff = extractDiffSpec(argsObj, outputStr);
  const statusUpper = String(tool.status || '').toUpperCase();
  const isDone = ['DONE', 'COMPLETED', 'SUCCESS'].includes(statusUpper);
  const isErr = ['ERROR', 'FAILED'].includes(statusUpper);

  const cmd = String(argsObj.CommandLine || argsObj.command || argsObj.cmd || '').trim();
  const query = String(argsObj.Query || argsObj.query || argsObj.Pattern || argsObj.pattern || '').trim();
  const customSummary = String(tool.summary || argsObj.toolSummary || argsObj.Description || '').trim();
  const primaryFile = filePaths.length ? filePaths[0] : '';
  const primaryShort = primaryFile ? folderBasename(toDisplayRelPath(primaryFile, activeCwd)) : '';
  const hasArgsKeys = Object.keys(argsObj).length > 0;
  const hasDetail = Boolean(diff || filePaths.length || cmd || query || outputStr || hasArgsKeys);
  const isBare = !hasDetail && !customSummary;

  let label = '';
  let liveText = '';

  if (customSummary) {
    label = customSummary;
    liveText = `正在执行：${customSummary}…`;
  } else if (kind === 'edit') {
    label = primaryShort ? `修改 ${primaryShort}` : '修改文件内容';
    liveText = primaryShort ? `正在修改 ${primaryShort}…` : '正在修改文件…';
  } else if (kind === 'write') {
    label = primaryShort ? `写入 ${primaryShort}` : '写入文件';
    liveText = primaryShort ? `正在写入 ${primaryShort}…` : '正在写入文件…';
  } else if (kind === 'read') {
    label = primaryShort ? `查阅 ${primaryShort}` : '查阅工作区文件';
    liveText = primaryShort ? `正在读取 ${primaryShort}…` : '正在查阅工作区文件…';
  } else if (kind === 'command') {
    const shortCmd = shortCmdPreview(cmd, 44);
    label = shortCmd ? `运行 ${shortCmd}` : '运行终端命令';
    liveText = shortCmd ? `正在运行 ${shortCmd}…` : '正在运行终端命令…';
  } else if (kind === 'search') {
    label = query ? `搜索 “${query.slice(0, 34)}”` : '检索工作区内容';
    liveText = query ? `正在搜索 “${query.slice(0, 34)}”…` : '正在检索工作区…';
  } else if (kind === 'web') {
    label = query ? `联网检索 “${query.slice(0, 34)}”` : '联网获取信息';
    liveText = '正在联网获取信息…';
  } else if (kind === 'image') {
    label = '生成图像';
    liveText = '正在生成图像…';
  } else {
    const rawName = String(tool.name || '').toLowerCase();
    if (rawName === 'send_message' || rawName === 'invoke_subagent') {
      label = '协调子任务执行';
      liveText = '正在协调子任务…';
    } else {
      label = tool.name || '执行操作';
      liveText = `正在执行 ${tool.name || '操作'}…`;
    }
  }

  return {
    tool,
    argsObj,
    kind,
    filePaths,
    primaryFile,
    primaryShort,
    cmd,
    query,
    outputStr,
    diff,
    isDone,
    isErr,
    hasDetail,
    isBare,
    label,
    liveText,
  };
}

function buildActivityHeadline(entries) {
  if (!entries.length) return { text: '', allDone: true, hasError: false };

  const activeEntry = [...entries].reverse().find((e) => !e.isDone && !e.isErr);
  const allDone = !activeEntry;
  const hasError = entries.some((e) => e.isErr);

  if (activeEntry) {
    return { text: activeEntry.liveText, allDone: false, hasError };
  }

  // If only 1 step total, state it directly & concretely
  if (entries.length === 1) {
    const only = entries[0];
    const diffStat = only.diff ? ` (+${only.diff.added} -${only.diff.removed})` : '';
    return { text: `${only.label}${diffStat}`, allDone: true, hasError };
  }

  const editFiles = [];
  const editSeen = new Set();
  let editBareCnt = 0;
  let totalAdd = 0;
  let totalDel = 0;

  const readFiles = [];
  const readSeen = new Set();
  let readBareCnt = 0;

  const cmdLabels = [];
  let cmdCnt = 0;

  const searchQueries = [];
  let searchCnt = 0;

  const otherLabels = [];
  let otherCnt = 0;

  for (const e of entries) {
    if (e.kind === 'edit' || e.kind === 'write') {
      if (e.diff) {
        totalAdd += e.diff.added;
        totalDel += e.diff.removed;
      }
      if (e.primaryShort) {
        const k = e.primaryShort.toLowerCase();
        if (!editSeen.has(k)) {
          editSeen.add(k);
          editFiles.push(e.primaryShort);
        }
      } else {
        editBareCnt++;
      }
    } else if (e.kind === 'read') {
      if (e.primaryShort) {
        const k = e.primaryShort.toLowerCase();
        if (!readSeen.has(k)) {
          readSeen.add(k);
          readFiles.push(e.primaryShort);
        }
      } else {
        readBareCnt++;
      }
    } else if (e.kind === 'command') {
      cmdCnt++;
      if (e.tool.summary) cmdLabels.push(e.tool.summary);
      else if (e.cmd) cmdLabels.push(shortCmdPreview(e.cmd, 28));
    } else if (e.kind === 'search') {
      searchCnt++;
      if (e.query) searchQueries.push(e.query.slice(0, 20));
    } else {
      otherCnt++;
      if (e.label && !otherLabels.includes(e.label)) otherLabels.push(e.label);
    }
  }

  const clauses = [];

  const totalEditTargets = editFiles.length + editBareCnt;
  if (totalEditTargets > 0) {
    const statSuffix = totalAdd || totalDel ? ` (+${totalAdd} -${totalDel})` : '';
    if (editFiles.length === 1 && editBareCnt === 0) {
      clauses.push(`修改了 ${editFiles[0]}${statSuffix}`);
    } else if (editFiles.length >= 2) {
      clauses.push(`修改了 ${editFiles[0]} 等 ${totalEditTargets} 个文件${statSuffix}`);
    } else {
      clauses.push(`修改了 ${totalEditTargets} 处文件${statSuffix}`);
    }
  }

  const totalReads = readFiles.length + readBareCnt;
  if (totalReads > 0) {
    if (readFiles.length > 0 && readBareCnt === 0 && readFiles.length <= 2) {
      clauses.push(`查阅了 ${readFiles.join('、')}`);
    } else if (readFiles.length > 0) {
      clauses.push(`查阅了 ${readFiles[0]} 等 ${totalReads} 处文件`);
    } else {
      clauses.push(`查阅了 ${totalReads} 处文件`);
    }
  }

  if (searchCnt > 0) {
    if (searchCnt === 1 && searchQueries.length === 1) {
      clauses.push(`搜索了 “${searchQueries[0]}”`);
    } else {
      clauses.push(`检索了 ${searchCnt} 次内容`);
    }
  }

  if (cmdCnt > 0) {
    if (cmdCnt === 1 && cmdLabels.length === 1) {
      clauses.push(`运行了 ${cmdLabels[0]}`);
    } else {
      clauses.push(`运行了 ${cmdCnt} 条命令`);
    }
  }

  if (otherCnt > 0) {
    if (otherLabels.length === 1 && otherCnt === 1) {
      clauses.push(otherLabels[0]);
    } else if (otherLabels.length) {
      clauses.push(`${otherLabels[0]}${otherCnt > 1 ? ` 等 ${otherCnt} 项操作` : ''}`);
    }
  }

  return {
    text: clauses.join(' · ') || `已完成 ${entries.length} 步操作`,
    allDone: true,
    hasError,
  };
}

function foldConsecutiveBareSteps(entries) {
  const folded = [];
  for (const e of entries) {
    const prev = folded[folded.length - 1];
    if (
      prev &&
      prev.entry.isBare &&
      e.isBare &&
      prev.entry.kind === e.kind &&
      prev.entry.label === e.label &&
      prev.entry.isDone === e.isDone &&
      prev.entry.isErr === e.isErr
    ) {
      prev.count += 1;
    } else {
      folded.push({ entry: e, count: 1 });
    }
  }
  return folded;
}

function buildStepDetailHtml(entry, activeCwd) {
  const sections = [];
  if (entry.filePaths.length) {
    sections.push(
      `<div class="tool-rich-files-row">${entry.filePaths.map((p) => buildFilePillHtml(p, activeCwd)).join('')}</div>`
    );
  }
  if (entry.diff) {
    sections.push(buildDiffHtml(entry.diff));
  } else if (entry.kind === 'write') {
    const bodyTxt = entry.argsObj.Content || entry.argsObj.CodeContent || entry.argsObj.content || '';
    if (typeof bodyTxt === 'string' && bodyTxt) {
      const previewLines = bodyTxt.replace(/\r\n/g, '\n').split('\n').slice(0, 32);
      const writeOps = previewLines.map((ln) => ({ type: 'add', text: ln }));
      if (bodyTxt.split('\n').length > 32) {
        writeOps.push({ type: 'meta', text: `… 共 ${bodyTxt.split('\n').length} 行，点击上方文件查看全文` });
      }
      sections.push(buildDiffHtml({ ops: writeOps, added: previewLines.length, removed: 0 }));
    }
  } else if (entry.kind === 'command' && (entry.cmd || entry.outputStr)) {
    sections.push(
      `<div class="tool-cmd-block">` +
        (entry.cmd ? `<div class="tool-cmd-line"><span class="tool-cmd-prompt">$</span> ${escapeHtml(entry.cmd)}</div>` : '') +
        (entry.outputStr ? `<pre class="tool-cmd-out">${escapeHtml(entry.outputStr.slice(0, 2800))}</pre>` : '') +
      `</div>`
    );
  } else if (entry.outputStr && entry.outputStr.length <= 2400) {
    sections.push(`<pre class="tool-output-preview">${escapeHtml(entry.outputStr)}</pre>`);
  }

  const rawArgsPretty =
    typeof entry.tool.args === 'string' ? entry.tool.args : JSON.stringify(entry.tool.args || {}, null, 2);
  if ((rawArgsPretty && rawArgsPretty !== '{}') || entry.outputStr) {
    const rawDetail = `Args:\n${rawArgsPretty}${entry.outputStr ? `\n\nOutput:\n${entry.outputStr}` : ''}`;
    sections.push(
      `<details class="tool-raw-details">` +
        `<summary>查看原始参数与输出</summary>` +
        `<pre class="tool-raw-pre">${escapeHtml(rawDetail)}</pre>` +
      `</details>`
    );
  }
  return sections.join('');
}

function bindFilePills(rootEl, activeCwd, openLocalFileSmart, openFileInRightPane) {
  rootEl.querySelectorAll('[data-tool-open-file]').forEach((pill) => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const target = pill.dataset.toolOpenFile || '';
      if (!target) return;
      const rel = toDisplayRelPath(target, activeCwd);
      const isInsideCwd =
        rel !== target.replace(/\\/g, '/') || (!/^[a-zA-Z]:[\\/]/.test(target) && !target.startsWith('/'));
      if (isInsideCwd && openFileInRightPane) {
        openFileInRightPane(rel);
      } else if (openLocalFileSmart) {
        openLocalFileSmart(target, 'file');
      }
    });
  });
}

export function renderToolActivityGroup(container, toolsList, opts = {}) {
  if (!container) return;
  const { activeCwd = '', openLocalFileSmart, openFileInRightPane } = opts;
  const list = Array.isArray(toolsList) ? toolsList : [];
  if (!list.length) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  const entries = list.map((t) => describeToolStep(t, activeCwd));
  const headline = buildActivityHeadline(entries);

  // Preserve group open state & individual expanded step IDs across incremental stream updates
  const prevGroup = container.querySelector('.tool-activity-group');
  const prevOpen = prevGroup ? prevGroup.classList.contains('open') : false;
  const openStepIds = new Set();
  container.querySelectorAll('.tool-step-item.open[data-step-id]').forEach((el) => {
    openStepIds.add(el.dataset.stepId);
  });

  // Collect distinct edited/written files for crisp inline quick-jump pills on the summary strip
  const editedPills = [];
  const seenEdited = new Set();
  for (const e of entries) {
    if ((e.kind === 'edit' || e.kind === 'write') && e.primaryFile) {
      const k = e.primaryFile.toLowerCase();
      if (!seenEdited.has(k)) {
        seenEdited.add(k);
        editedPills.push(e);
      }
    }
  }

  const folded = foldConsecutiveBareSteps(entries);
  const stepsHtml = folded
    .map(({ entry, count }) => {
      const stepId = String(entry.tool.id || '');
      const isExpanded = openStepIds.has(stepId);
      const iconHtml = entry.isErr
        ? STEP_ICONS.error
        : !entry.isDone
          ? '<span class="tool-act-dot is-running"></span>'
          : STEP_ICONS[entry.kind] || STEP_ICONS.generic;

      const diffStatHtml = entry.diff
        ? `<span class="tool-diff-stat-pill"><span class="stat-add">+${entry.diff.added}</span><span class="stat-del">-${entry.diff.removed}</span></span>`
        : '';
      const countHtml = count > 1 ? `<span class="tool-step-count">×${count}</span>` : '';

      if (!entry.hasDetail) {
        return `
          <div class="tool-step-item is-static ${entry.isErr ? 'is-err' : ''}" data-step-id="${escapeHtml(stepId)}">
            <div class="tool-step-row">
              <span class="tool-step-icon">${iconHtml}</span>
              <span class="tool-step-label">${escapeHtml(entry.label)}</span>
              ${countHtml}
            </div>
          </div>
        `;
      }

      const detailHtml = buildStepDetailHtml(entry, activeCwd);
      return `
        <div class="tool-step-item is-expandable ${isExpanded ? 'open' : ''} ${entry.isErr ? 'is-err' : ''}" data-step-id="${escapeHtml(stepId)}">
          <button type="button" class="tool-step-row tool-step-toggle">
            <span class="tool-step-icon">${iconHtml}</span>
            <span class="tool-step-label">${escapeHtml(entry.label)}</span>
            ${diffStatHtml}
            <span class="tool-step-chevron">${STEP_ICONS.chevron}</span>
          </button>
          <div class="tool-step-detail">${detailHtml}</div>
        </div>
      `;
    })
    .join('');

  const statusIndicator = !headline.allDone
    ? '<span class="tool-act-dot is-running"></span>'
    : headline.hasError
      ? `<span class="tool-act-status is-err">${STEP_ICONS.error}</span>`
      : `<span class="tool-act-status is-done">${STEP_ICONS.check}</span>`;

  const inlineEditsHtml =
    editedPills.length > 0 && editedPills.length <= 3
      ? `<div class="tool-act-inline-files">${editedPills
          .map((e) => buildFilePillHtml(e.primaryFile, activeCwd))
          .join('')}</div>`
      : '';

  const stepCountLabel = entries.length > 1 ? `${entries.length} 步` : '';

  container.innerHTML = `
    <div class="tool-activity-group ${prevOpen ? 'open' : ''}">
      <div class="tool-activity-bar">
        <button type="button" class="tool-activity-header">
          <span class="tool-activity-main">
            ${statusIndicator}
            <span class="tool-activity-summary">${escapeHtml(headline.text)}</span>
          </span>
          <span class="tool-activity-right">
            ${stepCountLabel ? `<span class="tool-activity-count">${stepCountLabel}</span>` : ''}
            <span class="tool-activity-chevron">${STEP_ICONS.chevron}</span>
          </span>
        </button>
        ${inlineEditsHtml}
      </div>
      <div class="tool-activity-list">${stepsHtml}</div>
    </div>
  `;

  const groupEl = container.querySelector('.tool-activity-group');
  const headerBtn = container.querySelector('.tool-activity-header');
  if (headerBtn && groupEl) {
    headerBtn.addEventListener('click', () => {
      groupEl.classList.toggle('open');
    });
  }

  container.querySelectorAll('.tool-step-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.tool-step-item');
      if (item) item.classList.toggle('open');
    });
  });

  bindFilePills(container, activeCwd, openLocalFileSmart, openFileInRightPane);
}
