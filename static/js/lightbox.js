/* ==========================================================================
   Antigravity Studio — Full-Screen Image Lightbox & Smart Local File Opener
   ========================================================================== */

import { IMAGE_EXT_RE, folderBasename, normalizeLocalFilePath } from './markdown-utils.js';

export function createLightboxController({
  getActiveCwd,
  openExternalPath,
  openFileInRightPane,
}) {
  const $ = (id) => document.getElementById(id);

  const lightboxState = {
    open: false,
    src: '',
    localPath: '',
    name: '',
    zoom: 1,
  };

  function updateLightboxZoomUi() {
    const img = $('lightbox-img');
    const lbl = $('lightbox-zoom-label');
    if (img) img.style.transform = `scale(${lightboxState.zoom})`;
    if (lbl) lbl.textContent = `${Math.round(lightboxState.zoom * 100)}%`;
  }

  function openImageLightbox({ src, localPath = '', name = '' }) {
    const modal = $('image-lightbox-modal');
    const img = $('lightbox-img');
    const titleEl = $('lightbox-title');
    const dlBtn = $('btn-lb-download');
    const extBtn = $('btn-lb-open-ext');
    const revBtn = $('btn-lb-reveal');
    const copyBtn = $('btn-lb-copy-path');
    if (!modal || !img || !src) return;

    const cleanLocal = normalizeLocalFilePath(localPath);
    const displayName = name || folderBasename(cleanLocal || src) || '图片预览';
    lightboxState.open = true;
    lightboxState.src = src;
    lightboxState.localPath = cleanLocal;
    lightboxState.name = displayName;
    lightboxState.zoom = 1;

    img.src = src;
    img.alt = displayName;
    if (titleEl) {
      titleEl.textContent = displayName;
      titleEl.title = cleanLocal || src;
    }
    if (dlBtn) {
      const dlHref = cleanLocal
        ? `/api/local-image?path=${encodeURIComponent(cleanLocal)}&download=1`
        : src;
      dlBtn.href = dlHref;
      dlBtn.setAttribute('download', displayName);
    }
    const hasLocal = Boolean(cleanLocal);
    if (extBtn) extBtn.style.display = hasLocal ? 'inline-flex' : 'none';
    if (revBtn) revBtn.style.display = hasLocal ? 'inline-flex' : 'none';
    if (copyBtn) copyBtn.style.display = hasLocal ? 'inline-flex' : 'none';

    updateLightboxZoomUi();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeImageLightbox() {
    const modal = $('image-lightbox-modal');
    if (!modal) return;
    lightboxState.open = false;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openLocalFileSmart(filePath, kind = 'file') {
    const cleanPath = normalizeLocalFilePath(filePath);
    if (!cleanPath) return;
    if (kind === 'image' || IMAGE_EXT_RE.test(cleanPath)) {
      openImageLightbox({
        src: `/api/local-image?path=${encodeURIComponent(cleanPath)}`,
        localPath: cleanPath,
        name: folderBasename(cleanPath),
      });
      return;
    }
    const cwdNorm = (getActiveCwd() || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const pNorm = cleanPath.replace(/\\/g, '/');
    if (cwdNorm && pNorm.toLowerCase().startsWith(cwdNorm.toLowerCase() + '/')) {
      const rel = pNorm.slice(cwdNorm.length + 1);
      openFileInRightPane(rel);
    } else {
      openExternalPath(cleanPath, false);
    }
  }

  function bindEvents() {
    const lbModal = $('image-lightbox-modal');
    const lbStage = $('lightbox-stage');
    const lbImg = $('lightbox-img');
    if (!lbModal) return;

    $('btn-lb-close').addEventListener('click', closeImageLightbox);
    $('btn-lb-zoom-in').addEventListener('click', () => {
      lightboxState.zoom = Math.min(4, +(lightboxState.zoom + 0.25).toFixed(2));
      updateLightboxZoomUi();
    });
    $('btn-lb-zoom-out').addEventListener('click', () => {
      lightboxState.zoom = Math.max(0.25, +(lightboxState.zoom - 0.25).toFixed(2));
      updateLightboxZoomUi();
    });
    $('btn-lb-zoom-reset').addEventListener('click', () => {
      lightboxState.zoom = 1;
      updateLightboxZoomUi();
    });
    $('btn-lb-open-ext').addEventListener('click', () => {
      if (lightboxState.localPath) openExternalPath(lightboxState.localPath, false);
    });
    $('btn-lb-reveal').addEventListener('click', () => {
      if (lightboxState.localPath) openExternalPath(lightboxState.localPath, true);
    });
    $('btn-lb-copy-path').addEventListener('click', async (e) => {
      if (!lightboxState.localPath) return;
      await navigator.clipboard.writeText(lightboxState.localPath);
      const btn = e.currentTarget;
      btn.textContent = '已复制 ✓';
      setTimeout(() => (btn.textContent = '复制路径'), 1400);
    });
    if (lbStage) {
      lbStage.addEventListener('click', (e) => {
        if (e.target === lbStage) closeImageLightbox();
      });
      lbStage.addEventListener(
        'wheel',
        (e) => {
          if (!lightboxState.open) return;
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.15 : -0.15;
          lightboxState.zoom = Math.max(0.25, Math.min(4, +(lightboxState.zoom + delta).toFixed(2)));
          updateLightboxZoomUi();
        },
        { passive: false }
      );
    }
    if (lbImg) {
      lbImg.addEventListener('dblclick', () => {
        lightboxState.zoom = lightboxState.zoom === 1 ? 1.75 : 1;
        updateLightboxZoomUi();
      });
    }
  }

  return {
    lightboxState,
    openImageLightbox,
    closeImageLightbox,
    openLocalFileSmart,
    bindEvents,
  };
}
