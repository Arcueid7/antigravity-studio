/* ==========================================================================
   Antigravity Studio — Real-Time SSE Streaming Workspace Terminal
   ========================================================================== */

import { escapeHtml, folderBasename } from './markdown-utils.js';

export async function runStreamingTerminal({
  cmd,
  cwd,
  sessionId,
  outputEl,
  onCwdChange,
  onSendToAi,
  onStart,
  onDone,
}) {
  const entry = document.createElement('div');
  entry.className = 'rp-term-entry';
  entry.innerHTML = `
    <div class="rp-term-cmd-head">
      <span class="rp-term-cmd-line">PS ${escapeHtml(folderBasename(cwd))}&gt; ${escapeHtml(cmd)}</span>
      <div class="rp-term-entry-actions"><span class="rp-term-exit-pill running"><span class="live-dot"></span>运行中…</span></div>
    </div>
    <pre class="rp-term-stdout"></pre>
  `;
  outputEl.appendChild(entry);
  outputEl.scrollTop = outputEl.scrollHeight;

  const preOut = entry.querySelector('.rp-term-stdout');
  let preErr = null;
  let stdoutBuf = '';
  let stderrBuf = '';
  let exitCode = 0;
  let elapsedMs = 0;
  let aborted = false;

  const stickBottom = () => {
    const dist = outputEl.scrollHeight - outputEl.scrollTop - outputEl.clientHeight;
    if (dist < 140) outputEl.scrollTop = outputEl.scrollHeight;
  };

  if (onStart) onStart();

  try {
    const res = await fetch('/api/workspace/terminal/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd, cwd, session_id: sessionId }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const packet = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of packet.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          let ev;
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (ev.type === 'stdout' && ev.chunk) {
            stdoutBuf += ev.chunk;
            preOut.textContent = stdoutBuf;
            stickBottom();
          } else if (ev.type === 'stderr' && ev.chunk) {
            stderrBuf += ev.chunk;
            if (!preErr) {
              preErr = document.createElement('pre');
              preErr.className = 'rp-term-stderr';
              entry.appendChild(preErr);
            }
            preErr.textContent = stderrBuf;
            stickBottom();
          } else if (ev.type === 'error' && ev.message) {
            stderrBuf += (stderrBuf ? '\n' : '') + ev.message;
            if (!preErr) {
              preErr = document.createElement('pre');
              preErr.className = 'rp-term-stderr';
              entry.appendChild(preErr);
            }
            preErr.textContent = stderrBuf;
          } else if (ev.type === 'done') {
            exitCode = ev.exit_code;
            elapsedMs = ev.elapsed_ms || 0;
            aborted = Boolean(ev.aborted);
            if (ev.new_cwd && onCwdChange) onCwdChange(ev.new_cwd);
          }
        }
      }
    }

    const cleanOut = stdoutBuf.trimEnd();
    const cleanErr = stderrBuf.trimEnd();
    preOut.textContent = cleanOut || (cleanErr ? '' : '(无输出)');
    if (preErr) preErr.textContent = cleanErr;

    const okCode = !aborted && exitCode === 0;
    const pillClass = okCode ? 'ok' : 'err';
    const pillText = aborted ? `已中止 · ${elapsedMs}ms` : `exit ${exitCode} · ${elapsedMs}ms`;
    const actionsEl = entry.querySelector('.rp-term-entry-actions');
    actionsEl.innerHTML = `
      <span class="rp-term-exit-pill ${pillClass}">${escapeHtml(pillText)}</span>
      <button type="button" class="rp-term-send-btn" title="把此命令和输出发到输入框让 agy 分析">发给 agy</button>
    `;
    actionsEl.querySelector('.rp-term-send-btn').addEventListener('click', () => {
      if (onSendToAi) onSendToAi({ cwd, cmd, exitCode, stdout: cleanOut, stderr: cleanErr });
    });
  } catch (err) {
    entry.querySelector('.rp-term-entry-actions').innerHTML = '<span class="rp-term-exit-pill err">流中断</span>';
    preOut.textContent = err.message;
  } finally {
    outputEl.scrollTop = outputEl.scrollHeight;
    if (onDone) onDone();
  }
}
