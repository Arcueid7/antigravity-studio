/* ==========================================================================
   Antigravity Studio — Interactive Canvas Sketchpad Modal
   ========================================================================== */

export function createSketchpadController({
  sketchModal,
  sketchCanvas,
  sketchColors,
  sketchSizes,
  onAttached,
}) {
  const $ = (id) => document.getElementById(id);

  const sketchState = {
    ctx: null,
    drawing: false,
    color: '#141413',
    size: 4,
    history: [],
    initialized: false,
  };

  function resetSketchCanvas() {
    if (!sketchState.ctx) sketchState.ctx = sketchCanvas.getContext('2d');
    const ctx = sketchState.ctx;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sketchCanvas.width, sketchCanvas.height);
    sketchState.history = [ctx.getImageData(0, 0, sketchCanvas.width, sketchCanvas.height)];
  }

  function initSketchpadDrawingEvents() {
    const ctx = sketchState.ctx;
    const getPos = (e) => {
      const rect = sketchCanvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * sketchCanvas.width,
        y: ((e.clientY - rect.top) / rect.height) * sketchCanvas.height,
      };
    };

    sketchCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sketchCanvas.setPointerCapture(e.pointerId);
      sketchState.drawing = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = sketchState.color;
      ctx.lineWidth = sketchState.color === '#FFFFFF' ? sketchState.size * 3.5 : sketchState.size;
      ctx.lineTo(x + 0.1, y + 0.1);
      ctx.stroke();
    });

    sketchCanvas.addEventListener('pointermove', (e) => {
      if (!sketchState.drawing) return;
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    const endStroke = () => {
      if (!sketchState.drawing) return;
      sketchState.drawing = false;
      ctx.closePath();
      if (sketchState.history.length > 25) sketchState.history.shift();
      sketchState.history.push(ctx.getImageData(0, 0, sketchCanvas.width, sketchCanvas.height));
    };
    sketchCanvas.addEventListener('pointerup', endStroke);
    sketchCanvas.addEventListener('pointercancel', endStroke);
  }

  function openSketchpadModal() {
    sketchModal.classList.add('open');
    if (!sketchState.initialized) {
      sketchState.initialized = true;
      resetSketchCanvas();
      initSketchpadDrawingEvents();
    }
  }

  async function attachSketchToChat() {
    const dataUrl = sketchCanvas.toDataURL('image/png');
    const filename = `sketch_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.png`;
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: filename, data_base64: dataUrl, mime: 'image/png' }),
    });
    if (res.ok) {
      const { file: saved } = await res.json();
      sketchModal.classList.remove('open');
      if (onAttached) onAttached(saved);
    }
  }

  function bindEvents() {
    sketchColors.querySelectorAll('.color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        sketchColors.querySelectorAll('.color-swatch').forEach((el) => el.classList.remove('active'));
        sw.classList.add('active');
        sketchState.color = sw.dataset.color;
      });
    });
    sketchSizes.querySelectorAll('.seg-tab').forEach((tb) => {
      tb.addEventListener('click', () => {
        sketchSizes.querySelectorAll('.seg-tab').forEach((el) => el.classList.remove('active'));
        tb.classList.add('active');
        sketchState.size = Number(tb.dataset.size) || 4;
      });
    });
    $('btn-sketch-undo').addEventListener('click', () => {
      if (sketchState.history.length > 1) {
        sketchState.history.pop();
        const prev = sketchState.history[sketchState.history.length - 1];
        sketchState.ctx.putImageData(prev, 0, 0);
      }
    });
    $('btn-sketch-clear').addEventListener('click', resetSketchCanvas);
    $('btn-close-sketch').addEventListener('click', () => sketchModal.classList.remove('open'));
    $('btn-sketch-attach').addEventListener('click', attachSketchToChat);
    sketchModal.addEventListener('click', (e) => {
      if (e.target === sketchModal) sketchModal.classList.remove('open');
    });
  }

  return { openSketchpadModal, resetSketchCanvas, bindEvents };
}
