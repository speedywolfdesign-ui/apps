(() => {
  const els = {
    file: document.getElementById("resizerFile"),
    sizeSelect: document.getElementById("resizerSizeSelect"),
    widthMm: document.getElementById("widthMmInput"),
    heightMm: document.getElementById("heightMmInput"),
    maintain: document.getElementById("maintainAspect"),
    dpiSelect: document.getElementById("resizerDpiSelect"),
    formatSelect: document.getElementById("formatSelect"),
    qualityRange: document.getElementById("qualityRange"),
    qualityValue: document.getElementById("qualityValue"),
    resizeBtn: document.getElementById("resizeBtn"),
    bgRemoveBtn: document.getElementById("bgRemoveResizerBtn"),
    openCropBtn: document.getElementById("openCropBtn"),
    downloadBtn: document.getElementById("downloadResizedBtn"),
    canvas: document.getElementById("resizerCanvas"),
    info: document.getElementById("resizerInfo"),
    sizeEstimate: document.getElementById("sizeEstimate"),
    // crop modal
    cropModal: document.getElementById("resizerCropModal"),
    cropCanvas: document.getElementById("resizerCropCanvas"),
    cropSizeSelect: document.getElementById("resizerCropSizeSelect"),
    zoomRange: document.getElementById("resizerZoomRange"),
    fitBtn: document.getElementById("resizerFitBtn"),
    cropCancelBtn: document.getElementById("resizerCropCancelBtn"),
    cropApplyBtn: document.getElementById("resizerCropApplyBtn"),
  };

  const mmPerInch = 25.4;
  const PASSPORT_SIZES_MM = [
    { label: "Custom (mm)", w: 0, h: 0, custom: true },
    { label: "US 2 × 2 in (51 × 51 mm)", w: 51, h: 51 },
    { label: "EU/Schengen 35 × 45 mm", w: 35, h: 45 },
    { label: "UK 35 × 45 mm", w: 35, h: 45 },
    { label: "India 35 × 45 mm", w: 35, h: 45 },
    { label: "Canada 50 × 70 mm", w: 50, h: 70 },
    { label: "Australia 35 × 45 mm", w: 35, h: 45 },
    { label: "China 33 × 48 mm", w: 33, h: 48 },
    { label: "Japan 35 × 45 mm", w: 35, h: 45 },
    { label: "Malaysia 35 × 50 mm", w: 35, h: 50 },
  ];

  let img = null;
  const ctx = els.canvas.getContext("2d");
  let originalW = 0;
  let originalH = 0;
  let targetWpx = 0;
  let targetHpx = 0;
  let originalBytes = 0;
  let croppedImage = null;
  let bodyPixModel = null;

  function clearCanvas() {
    els.canvas.width = 1;
    els.canvas.height = 1;
    ctx.clearRect(0, 0, 1, 1);
  }

  function drawImageContain(image, dx, dy, dw, dh, bg = "#ffffff") {
    const sW = image.naturalWidth;
    const sH = image.naturalHeight;
    if (!sW || !sH) return;
    // fill bg
    ctx.fillStyle = bg;
    ctx.fillRect(dx, dy, dw, dh);
    const scale = Math.min(dw / sW, dh / sH);
    const drawW = Math.round(sW * scale);
    const drawH = Math.round(sH * scale);
    const x = dx + Math.round((dw - drawW) / 2);
    const y = dy + Math.round((dh - drawH) / 2);
    ctx.drawImage(image, 0, 0, sW, sH, x, y, drawW, drawH);
  }

  function mmToPx(mm, dpi) {
    return Math.max(1, Math.round((mm * dpi) / mmPerInch));
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i === 0 ? 0 : n < 10 ? 2 : 1)} ${units[i]}`;
  }

  function estimateDataUrlBytes(dataUrl) {
    if (!dataUrl) return 0;
    const comma = dataUrl.indexOf(",");
    if (comma === -1) return 0;
    const b64 = dataUrl.slice(comma + 1);
    const len = b64.length;
    const padding = (b64.endsWith("==") ? 2 : (b64.endsWith("=") ? 1 : 0));
    return Math.floor((len * 3) / 4) - padding;
  }

  function populateSizes() {
    const frag = document.createDocumentFragment();
    PASSPORT_SIZES_MM.forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = s.label;
      opt.dataset.wmm = String(s.w);
      opt.dataset.hmm = String(s.h);
      opt.dataset.custom = s.custom ? "1" : "0";
      frag.appendChild(opt);
    });
    els.sizeSelect.appendChild(frag);
    els.sizeSelect.value = "0"; // Custom default
  }

  function updateInputsFromImage() {
    if (!img) return;
    originalW = img.naturalWidth;
    originalH = img.naturalHeight;
    // Initialize custom mm to original size at current DPI
    const dpi = Number(els.dpiSelect.value) || 300;
    const ar = originalW / originalH;
    const widthMmInit = (originalW / dpi) * mmPerInch;
    const heightMmInit = widthMmInit / ar;
    els.widthMm.value = String(Math.round(widthMmInit * 10) / 10);
    els.heightMm.value = String(Math.round(heightMmInit * 10) / 10);
    els.info.textContent = `Original: ${originalW} × ${originalH}px`;
    els.resizeBtn.disabled = false;
    els.downloadBtn.disabled = false;
    render();
  }

  function render() {
    if (!img) {
      clearCanvas();
      return;
    }
    const dpi = Number(els.dpiSelect.value) || 300;
    const selected = els.sizeSelect.selectedOptions[0];
    const isCustom = selected && selected.dataset.custom === "1";
    let wmm = 0, hmm = 0;
    if (isCustom) {
      const ar = originalW / originalH;
      wmm = Math.max(1, Number(els.widthMm.value) || 1);
      if (els.maintain.checked) {
        hmm = Math.max(1, Math.round((wmm / ar) * 10) / 10);
        els.heightMm.value = String(hmm);
      } else {
        hmm = Math.max(1, Number(els.heightMm.value) || 1);
      }
    } else {
      wmm = Number(selected.dataset.wmm);
      hmm = Number(selected.dataset.hmm);
      els.widthMm.value = String(wmm);
      els.heightMm.value = String(hmm);
    }
    targetWpx = mmToPx(wmm, dpi);
    targetHpx = mmToPx(hmm, dpi);
    els.canvas.width = targetWpx;
    els.canvas.height = targetHpx;
    ctx.imageSmoothingQuality = "high";
    const src = croppedImage || img;
    // Do not stretch: draw contained if not cropped to target aspect
    drawImageContain(src, 0, 0, targetWpx, targetHpx, "#ffffff");
    // Estimate compressed output size
    const format = els.formatSelect.value || "image/jpeg";
    let dataUrl;
    if (format === "image/jpeg") {
      const q = Math.max(0.1, Math.min(1, Number(els.qualityRange.value) / 100));
      dataUrl = els.canvas.toDataURL("image/jpeg", q);
    } else {
      dataUrl = els.canvas.toDataURL("image/png");
    }
    const outBytes = estimateDataUrlBytes(dataUrl);
    els.info.textContent =
      `Resized: ${targetWpx} × ${targetHpx}px @ ${dpi} DPI (${Math.round(targetWpx * mmPerInch / dpi)}×${Math.round(targetHpx * mmPerInch / dpi)} mm) • ` +
      `Original ${originalW} × ${originalH}px • File: ${formatBytes(originalBytes)} → ~${formatBytes(outBytes)}`;
    if (els.sizeEstimate) {
      els.sizeEstimate.textContent = `Original ${formatBytes(originalBytes)} → ~${formatBytes(outBytes)}`;
    }
  }

  function download() {
    const format = els.formatSelect.value || "image/jpeg";
    let dataUrl;
    if (format === "image/jpeg") {
      const q = Math.max(0.1, Math.min(1, Number(els.qualityRange.value) / 100));
      dataUrl = els.canvas.toDataURL("image/jpeg", q);
    } else {
      dataUrl = els.canvas.toDataURL("image/png");
    }
    const a = document.createElement("a");
    const dpi = Number(els.dpiSelect.value) || 300;
    const ext = format === "image/png" ? "png" : "jpg";
    a.href = dataUrl;
    a.download = `resized_${targetWpx}x${targetHpx}_${dpi}dpi.${ext}`;
    a.click();
  }

  function bind() {
    els.file.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      originalBytes = file.size || 0;
      const reader = new FileReader();
      const i = new Image();
      i.onload = () => {
        img = i;
        croppedImage = null;
        updateInputsFromImage();
        els.openCropBtn.disabled = false;
        els.bgRemoveBtn.disabled = false;
      };
      reader.onload = (ev) => {
        i.src = String(ev.target.result);
      };
      reader.readAsDataURL(file);
    });
    els.sizeSelect.addEventListener("change", () => {
      const selected = els.sizeSelect.selectedOptions[0];
      const isCustom = selected && selected.dataset.custom === "1";
      els.widthMm.disabled = !isCustom;
      els.heightMm.disabled = !isCustom || els.maintain.checked;
      render();
    });
    els.widthMm.addEventListener("input", () => render());
    els.heightMm.addEventListener("input", () => render());
    els.maintain.addEventListener("change", () => render());
    els.dpiSelect.addEventListener("change", () => render());
    els.formatSelect.addEventListener("change", () => {
      const disabled = els.formatSelect.value !== "image/jpeg";
      els.qualityRange.disabled = disabled;
      els.qualityValue.style.opacity = disabled ? 0.6 : 1;
      render();
    });
    els.qualityRange.addEventListener("input", () => {
      els.qualityValue.textContent = `${els.qualityRange.value}%`;
      render();
    });
    els.resizeBtn.addEventListener("click", () => render());
    els.downloadBtn.addEventListener("click", download);
    // crop controls
    els.openCropBtn.addEventListener("click", () => openCropper());
    bindCropper();
    // background removal
    els.bgRemoveBtn.addEventListener("click", async () => {
      if (!img && !croppedImage) return;
      try {
        els.bgRemoveBtn.disabled = true;
        const model = await ensureBodyPix();
        const src = croppedImage || img;
        const seg = await model.segmentPerson(src, { internalResolution: "medium", segmentationThreshold: 0.7 });
        const sW = src.naturalWidth;
        const sH = src.naturalHeight;
        const out = document.createElement("canvas");
        out.width = sW;
        out.height = sH;
        const octx = out.getContext("2d");
        octx.drawImage(src, 0, 0);
        const imgData = octx.getImageData(0, 0, sW, sH);
        const mask = seg.data;
        const d = imgData.data;
        // make background transparent
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] === 0) {
            d[i * 4 + 3] = 0;
          }
        }
        octx.putImageData(imgData, 0, 0);
        const url = out.toDataURL("image/png");
        const newImg = new Image();
        newImg.onload = () => {
          croppedImage = newImg;
          render();
          els.bgRemoveBtn.disabled = false;
        };
        newImg.src = url;
      } catch (err) {
        console.error("Background removal failed:", err);
        els.bgRemoveBtn.disabled = false;
      }
    });
  }

  // shared loader for body-pix
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }
  async function ensureBodyPix() {
    if (bodyPixModel) return bodyPixModel;
    if (!window.tf) {
      await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js");
    }
    if (!window.bodyPix) {
      await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.0/dist/body-pix.min.js");
    }
    bodyPixModel = await window.bodyPix.load({
      architecture: "MobileNetV1",
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2,
    });
    return bodyPixModel;
  }
  // ----- Cropper for resizer -----
  const cropState = {
    isOpen: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,
    imgX: 0,
    imgY: 0,
    scale: 1,
    minScale: 1,
    frame: { x: 0, y: 0, w: 0, h: 0 },
    ar: 1,
  };

  function getSelectedMm() {
    const selected = els.sizeSelect.selectedOptions[0];
    if (!selected) return { wmm: 35, hmm: 45 };
    const wmm = Number(selected.dataset.wmm) || Math.max(1, Number(els.widthMm.value) || 35);
    const hmm = Number(selected.dataset.hmm) || Math.max(1, Number(els.heightMm.value) || 45);
    return { wmm, hmm };
  }

  function populateCropSizes() {
    if (!els.cropSizeSelect || els.cropSizeSelect.options.length) return;
    const frag = document.createDocumentFragment();
    PASSPORT_SIZES_MM.forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = s.label;
      frag.appendChild(opt);
    });
    els.cropSizeSelect.appendChild(frag);
  }

  function initCropFrame() {
    if (!img) return;
    const { wmm, hmm } = getSelectedMm();
    cropState.ar = wmm / hmm;
    const wrap = els.cropCanvas.parentElement;
    const bounds = wrap.getBoundingClientRect();
    const cw = Math.max(320, Math.floor(bounds.width));
    const ch = Math.max(240, Math.floor(bounds.height));
    els.cropCanvas.width = cw;
    els.cropCanvas.height = ch;
    const pad = 24;
    const maxW = cw - pad * 2;
    const maxH = ch - pad * 2;
    let fw = maxW;
    let fh = Math.round(fw / cropState.ar);
    if (fh > maxH) {
      fh = maxH;
      fw = Math.round(fh * cropState.ar);
    }
    cropState.frame.w = fw;
    cropState.frame.h = fh;
    cropState.frame.x = Math.floor((cw - fw) / 2);
    cropState.frame.y = Math.floor((ch - fh) / 2);
    const sW = img.naturalWidth;
    const sH = img.naturalHeight;
    const cover = Math.max(fw / sW, fh / sH);
    cropState.scale = cover;
    cropState.minScale = cover;
    const imgW = sW * cropState.scale;
    const imgH = sH * cropState.scale;
    cropState.imgX = cropState.frame.x + (cropState.frame.w - imgW) / 2;
    cropState.imgY = cropState.frame.y + (cropState.frame.h - imgH) / 2;
    els.zoomRange.value = String(Math.max(0.5, Math.min(5, cropState.scale)));
  }

  function drawCropper() {
    const c = els.cropCanvas;
    const cctx = c.getContext("2d");
    cctx.save();
    cctx.clearRect(0, 0, c.width, c.height);
    // image
    const sW = img.naturalWidth;
    const sH = img.naturalHeight;
    const imgW = sW * cropState.scale;
    const imgH = sH * cropState.scale;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(img, 0, 0, sW, sH, Math.round(cropState.imgX), Math.round(cropState.imgY), Math.round(imgW), Math.round(imgH));
    // overlay
    cctx.fillStyle = "rgba(0,0,0,0.55)";
    cctx.fillRect(0, 0, c.width, cropState.frame.y);
    cctx.fillRect(0, cropState.frame.y, cropState.frame.x, cropState.frame.h);
    cctx.fillRect(cropState.frame.x + cropState.frame.w, cropState.frame.y, c.width - (cropState.frame.x + cropState.frame.w), cropState.frame.h);
    cctx.fillRect(0, cropState.frame.y + cropState.frame.h, c.width, c.height - (cropState.frame.y + cropState.frame.h));
    // frame
    cctx.strokeStyle = "#ffffff";
    cctx.lineWidth = 2;
    cctx.strokeRect(cropState.frame.x + 0.5, cropState.frame.y + 0.5, cropState.frame.w - 1, cropState.frame.h - 1);
    cctx.restore();
  }

  function constrainCrop() {
    const sW = img.naturalWidth;
    const sH = img.naturalHeight;
    const imgW = sW * cropState.scale;
    const imgH = sH * cropState.scale;
    if (imgW < cropState.frame.w) {
      cropState.scale = cropState.frame.w / sW;
    }
    if (imgH < cropState.frame.h) {
      cropState.scale = Math.max(cropState.scale, cropState.frame.h / sH);
    }
    const newImgW = sW * cropState.scale;
    const newImgH = sH * cropState.scale;
    const minX = cropState.frame.x + cropState.frame.w - newImgW;
    const maxX = cropState.frame.x;
    const minY = cropState.frame.y + cropState.frame.h - newImgH;
    const maxY = cropState.frame.y;
    cropState.imgX = Math.min(maxX, Math.max(minX, cropState.imgX));
    cropState.imgY = Math.min(maxY, Math.max(minY, cropState.imgY));
  }

  function setCropZoom(nextScale, anchorX, anchorY) {
    nextScale = Math.max(cropState.minScale, Math.min(5, nextScale));
    const sW = img.naturalWidth;
    const sH = img.naturalHeight;
    const prev = cropState.scale;
    if (nextScale === prev) return;
    const relX = (anchorX - cropState.imgX) / (sW * prev);
    const relY = (anchorY - cropState.imgY) / (sH * prev);
    cropState.scale = nextScale;
    const newW = sW * cropState.scale;
    const newH = sH * cropState.scale;
    cropState.imgX = anchorX - relX * newW;
    cropState.imgY = anchorY - relY * newH;
    constrainCrop();
    els.zoomRange.value = String(cropState.scale);
    drawCropper();
  }

  function applyCrop() {
    const sW = img.naturalWidth;
    const sH = img.naturalHeight;
    const imgW = sW * cropState.scale;
    const imgH = sH * cropState.scale;
    const sx = Math.max(0, Math.round(((cropState.frame.x - cropState.imgX) / imgW) * sW));
    const sy = Math.max(0, Math.round(((cropState.frame.y - cropState.imgY) / imgH) * sH));
    const sw = Math.max(1, Math.round((cropState.frame.w / imgW) * sW));
    const sh = Math.max(1, Math.round((cropState.frame.h / imgH) * sH));
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const octx = out.getContext("2d");
    octx.imageSmoothingQuality = "high";
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const url = out.toDataURL("image/png");
    const i = new Image();
    i.onload = () => {
      croppedImage = i;
      closeCropper();
      render();
    };
    i.src = url;
  }

  function openCropper() {
    if (!img) return;
    populateCropSizes();
    // sync selects
    els.cropSizeSelect.value = els.sizeSelect.value;
    els.cropModal.classList.add("open");
    els.cropModal.setAttribute("aria-hidden", "false");
    cropState.isOpen = true;
    initCropFrame();
    drawCropper();
  }

  function closeCropper() {
    els.cropModal.classList.remove("open");
    els.cropModal.setAttribute("aria-hidden", "true");
    cropState.isOpen = false;
  }

  function bindCropper() {
    // pointer
    els.cropCanvas.addEventListener("pointerdown", (e) => {
      cropState.isPanning = true;
      cropState.lastX = e.clientX;
      cropState.lastY = e.clientY;
      els.cropCanvas.setPointerCapture(e.pointerId);
    });
    els.cropCanvas.addEventListener("pointermove", (e) => {
      if (!cropState.isPanning) return;
      const dx = e.clientX - cropState.lastX;
      const dy = e.clientY - cropState.lastY;
      cropState.lastX = e.clientX;
      cropState.lastY = e.clientY;
      cropState.imgX += dx;
      cropState.imgY += dy;
      constrainCrop();
      drawCropper();
    });
    els.cropCanvas.addEventListener("pointerup", (e) => {
      cropState.isPanning = false;
      els.cropCanvas.releasePointerCapture(e.pointerId);
    });
    els.cropCanvas.addEventListener("pointercancel", () => { cropState.isPanning = false; });
    // wheel
    els.cropCanvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = els.cropCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.05 : 0.95;
      setCropZoom(cropState.scale * factor, x, y);
    }, { passive: false });
    // slider
    els.zoomRange.addEventListener("input", () => {
      const rect = els.cropCanvas.getBoundingClientRect();
      setCropZoom(Number(els.zoomRange.value), rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    els.fitBtn.addEventListener("click", () => openCropper());
    els.cropCancelBtn.addEventListener("click", () => closeCropper());
    els.cropApplyBtn.addEventListener("click", () => applyCrop());
    // modal select sync
    els.cropSizeSelect.addEventListener("change", () => {
      els.sizeSelect.value = els.cropSizeSelect.value;
      initCropFrame();
      drawCropper();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    populateSizes();
    // initialize UI
    const disabled = els.formatSelect.value !== "image/jpeg";
    els.qualityRange.disabled = disabled;
    els.widthMm.disabled = false;
    els.heightMm.disabled = els.maintain.checked;
    els.qualityValue.textContent = `${els.qualityRange.value}%`;
    bind();
  });
})();


