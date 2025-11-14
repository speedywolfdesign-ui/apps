(() => {
  const mmPerInch = 25.4;
  // Inner white padding (border) inside each photo (in millimeters)
  const INNER_BORDER_MM = 1;

  /** Common paper sizes in millimeters */
  const PAPER_SIZES_MM = {
    "A4 (210 × 297 mm)": { w: 210, h: 297 },
    "A5 (148 × 210 mm)": { w: 148, h: 210 },
    "Letter (8.5 × 11 in)": { w: 215.9, h: 279.4 },
    "Legal (8.5 × 14 in)": { w: 215.9, h: 355.6 },
    "4 × 6 in (102 × 152 mm)": { w: 101.6, h: 152.4 },
    "5 × 7 in (127 × 178 mm)": { w: 127, h: 177.8 },
    "6 × 8 in (152 × 203 mm)": { w: 152.4, h: 203.2 },
    "8 × 10 in (203 × 254 mm)": { w: 203.2, h: 254 },
  };

  /** Internationally common passport/ID photo sizes in millimeters */
  const PASSPORT_SIZES_MM = [
    { label: "US 2 × 2 in (51 × 51 mm)", w: 51, h: 51 },
    { label: "EU/Schengen 35 × 45 mm", w: 35, h: 45 },
    { label: "UK 35 × 45 mm", w: 35, h: 45 },
    { label: "Canada 50 × 70 mm", w: 50, h: 70 },
    { label: "Australia 35 × 45 mm", w: 35, h: 45 },
    { label: "India 35 × 45 mm", w: 35, h: 45 },
    { label: "China 33 × 48 mm", w: 33, h: 48 },
    { label: "Japan 35 × 45 mm", w: 35, h: 45 },
    { label: "Singapore 35 × 45 mm", w: 35, h: 45 },
    { label: "Malaysia 35 × 50 mm", w: 35, h: 50 },
    { label: "Russia 35 × 45 mm", w: 35, h: 45 },
    { label: "Brazil 35 × 45 mm", w: 35, h: 45 },
    { label: "Mexico 35 × 45 mm", w: 35, h: 45 },
    { label: "Turkey 50 × 60 mm", w: 50, h: 60 },
    { label: "South Africa 35 × 45 mm", w: 35, h: 45 },
  ];

  const els = {
    fileInput: document.getElementById("fileInput"),
    passportSizeSelect: document.getElementById("passportSizeSelect"),
    paperSizeSelect: document.getElementById("paperSizeSelect"),
    dpiSelect: document.getElementById("dpiSelect"),
    spacingInput: document.getElementById("spacingInput"),
    marginInput: document.getElementById("marginInput"),
    innerBorderCheckbox: document.getElementById("innerBorderCheckbox"),
    renderBtn: document.getElementById("renderBtn"),
    bgRemoveBtn: document.getElementById("bgRemoveBtn"),
    cropBtn: document.getElementById("cropBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    canvas: document.getElementById("canvas"),
    fitInfo: document.getElementById("fitInfo"),
    // Crop modal elements
    cropModal: document.getElementById("cropModal"),
    cropCanvas: document.getElementById("cropCanvas"),
    cropCancelBtn: document.getElementById("cropCancelBtn"),
    cropApplyBtn: document.getElementById("cropApplyBtn"),
    zoomRange: document.getElementById("zoomRange"),
    fitBtn: document.getElementById("fitBtn"),
    cropSizeSelect: document.getElementById("cropSizeSelect"),
    cropWrap: document.querySelector(".crop-canvas-wrap"),
    modalBgRemoveBtn: document.getElementById("modalBgRemoveBtn"),
  };

  let loadedImage = null;
  const ctx = els.canvas.getContext("2d");
  let bodyPixModel = null;

  function mmToPx(mm, dpi) {
    return Math.round((mm * dpi) / mmPerInch);
  }

  // ----- Background removal (BodyPix) -----
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

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  async function removeBackground(bgColor = "#ffffff") {
    if (!loadedImage) return;
    try {
      els.bgRemoveBtn.disabled = true;
      const model = await ensureBodyPix();
      const seg = await model.segmentPerson(loadedImage, {
        internalResolution: "medium",
        segmentationThreshold: 0.7,
      });
      const sW = loadedImage.naturalWidth;
      const sH = loadedImage.naturalHeight;
      const out = document.createElement("canvas");
      out.width = sW;
      out.height = sH;
      const octx = out.getContext("2d");
      octx.drawImage(loadedImage, 0, 0);
      const imgData = octx.getImageData(0, 0, sW, sH);
      const data = imgData.data;
      const mask = seg.data;
      const { r, g, b } = hexToRgb(bgColor);
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 0) {
          const p = i * 4;
          data[p] = r;
          data[p + 1] = g;
          data[p + 2] = b;
          data[p + 3] = 255;
        }
      }
      octx.putImageData(imgData, 0, 0);
      const url = out.toDataURL("image/png");
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        render();
        els.bgRemoveBtn.disabled = false;
      };
      img.src = url;
    } catch (e) {
      console.error("Background removal failed:", e);
      els.bgRemoveBtn.disabled = false;
    }
  }

  function populatePaperSizes() {
    const frag = document.createDocumentFragment();
    Object.keys(PAPER_SIZES_MM).forEach((name) => {
      const { w, h } = PAPER_SIZES_MM[name];
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      opt.dataset.wmm = String(w);
      opt.dataset.hmm = String(h);
      frag.appendChild(opt);
    });
    els.paperSizeSelect.appendChild(frag);
    els.paperSizeSelect.value = "A4 (210 × 297 mm)";
  }

  function populatePassportSizes() {
    const frag = document.createDocumentFragment();
    PASSPORT_SIZES_MM.forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = s.label;
      opt.dataset.wmm = String(s.w);
      opt.dataset.hmm = String(s.h);
      frag.appendChild(opt);
    });
    els.passportSizeSelect.appendChild(frag);
    els.passportSizeSelect.value = "1"; // EU/Schengen 35x45 default
  }

  function getOrientation() {
    const input = document.querySelector('input[name="orientation"]:checked');
    return input ? input.value : "portrait";
  }

  function readNumberInput(el, fallback) {
    const n = Number(el.value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function clearCanvas(w, h) {
    els.canvas.width = Math.max(1, w);
    els.canvas.height = Math.max(1, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }

  function getSelectedPaperMm() {
    const opt = els.paperSizeSelect.selectedOptions[0];
    const wmm = Number(opt.dataset.wmm);
    const hmm = Number(opt.dataset.hmm);
    return { wmm, hmm };
  }

  function getSelectedPassportMm() {
    const opt = els.passportSizeSelect.selectedOptions[0];
    const wmm = Number(opt.dataset.wmm);
    const hmm = Number(opt.dataset.hmm);
    return { wmm, hmm };
  }

  function getPassportAspect() {
    const { wmm, hmm } = getSelectedPassportMm();
    const ar = wmm / hmm;
    return { ar, wmm, hmm };
  }

  function drawImageCover(image, dx, dy, dw, dh) {
    const sW = image.naturalWidth;
    const sH = image.naturalHeight;
    if (!sW || !sH) return;
    const scale = Math.max(dw / sW, dh / sH);
    const sw = Math.round(dw / scale);
    const sh = Math.round(dh / scale);
    const sx = Math.max(0, Math.floor((sW - sw) / 2));
    const sy = Math.max(0, Math.floor((sH - sh) / 2));
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function render() {
    if (!loadedImage) {
      els.fitInfo.textContent = "No image loaded.";
      els.downloadBtn.disabled = true;
      return;
    }

    const dpi = Number(els.dpiSelect.value) || 300;
    const spacingMm = readNumberInput(els.spacingInput, 5);
    const marginMm = readNumberInput(els.marginInput, 10);
    let { wmm: paperWmm, hmm: paperHmm } = getSelectedPaperMm();
    const { wmm: passWmm, hmm: passHmm } = getSelectedPassportMm();
    const orientation = getOrientation();

    if (orientation === "landscape") {
      const tmp = paperWmm;
      paperWmm = paperHmm;
      paperHmm = tmp;
    }

    const paperWpx = mmToPx(paperWmm, dpi);
    const paperHpx = mmToPx(paperHmm, dpi);
    const marginPx = mmToPx(marginMm, dpi);
    const spacingPx = mmToPx(spacingMm, dpi);
    const tileWpx = mmToPx(passWmm, dpi);
    const tileHpx = mmToPx(passHmm, dpi);
    const innerPadPx = (els.innerBorderCheckbox && els.innerBorderCheckbox.checked)
      ? mmToPx(INNER_BORDER_MM, dpi)
      : 0;

    clearCanvas(paperWpx, paperHpx);

    const usableW = Math.max(0, paperWpx - marginPx * 2);
    const usableH = Math.max(0, paperHpx - marginPx * 2);

    const cols = Math.max(0, Math.floor((usableW + spacingPx) / (tileWpx + spacingPx)));
    const rows = Math.max(0, Math.floor((usableH + spacingPx) / (tileHpx + spacingPx)));

    if (cols <= 0 || rows <= 0) {
      els.fitInfo.textContent = "Selected sizes do not fit on the chosen paper with current margins/spacing.";
      els.downloadBtn.disabled = true;
      return;
    }

    const gridW = cols * tileWpx + (cols - 1) * spacingPx;
    const gridH = rows * tileHpx + (rows - 1) * spacingPx;
    const startX = Math.round((paperWpx - gridW) / 2);
    const startY = Math.round((paperHpx - gridH) / 2);

    // Draw outer printable area (optional guide)
    ctx.save();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(marginPx, marginPx, paperWpx - marginPx * 2, paperHpx - marginPx * 2);
    ctx.restore();

    // Draw tiles
    ctx.save();
    const count = cols * rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (tileWpx + spacingPx);
        const y = startY + r * (tileHpx + spacingPx);

        // Image with inner padding (white border)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, tileWpx, tileHpx);
        const drawW = Math.max(0, tileWpx - innerPadPx * 2);
        const drawH = Math.max(0, tileHpx - innerPadPx * 2);
        drawImageCover(loadedImage, x + innerPadPx, y + innerPadPx, drawW, drawH);

        // Dotted cutting guide around each tile
        ctx.strokeStyle = "#6b7280";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x + 0.5, y + 0.5, tileWpx - 1, tileHpx - 1);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();

    // Fine footer text on the sheet (included in download)
    ctx.save();
    const footerText = "create by: 🐺speedywolfdesign";
    const fontPx = Math.max(10, Math.round(mmToPx(3, dpi))); // about 3mm tall or at least 10px
    ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`;
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const footerY = paperHpx - Math.round(Math.max(4, Math.floor(mmToPx(Math.max(2, marginMm / 2), dpi))));
    ctx.fillText(footerText, Math.round(paperWpx / 2), footerY);
    ctx.restore();

    els.fitInfo.textContent =
      `Fits ${cols * rows} photos (${rows} × ${cols}) • Paper ${paperWmm}×${paperHmm} mm @ ${dpi} DPI • Photo ${passWmm}×${passHmm} mm • Spacing ${spacingMm} mm • Margins ${marginMm} mm`;
    els.downloadBtn.disabled = false;
  }

  // ----- Cropper -----
  const crop = {
    isOpen: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,
    imgX: 0,
    imgY: 0,
    scale: 1,
    frame: { x: 0, y: 0, w: 0, h: 0 },
    minScale: 1,
    ar: 1,
  };
  let cameraStream = null;
  let pendingImageUrl = null;

  function show(el, visible) {
    if (!el) return;
    if (visible) el.classList.remove("hidden");
    else el.classList.add("hidden");
  }

  function setUseEnabled(enabled) {
    const btn = document.getElementById("useBtn");
    if (btn) btn.disabled = !enabled;
  }

  async function startCamera() {
    try {
      await stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraStream = stream;
      els.cameraPreview.srcObject = stream;
      await els.cameraPreview.play();
      return true;
    } catch (e) {
      console.error("Camera error:", e);
      return false;
    }
  }

  async function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    if (els.cameraPreview) {
      els.cameraPreview.srcObject = null;
    }
  }

  function enterSourceMode() {}

  function enterCropMode() {
    stopCamera && stopCamera();
    show(els.cropWrap, true);
    show(document.querySelector(".crop-controls"), true);
    // Initialize crop frame to current image and aspect
    initCropFrame();
    drawCropper();
  }

  function initCropFrame() {
    if (!loadedImage) return;
    const { ar } = getPassportAspect();
    crop.ar = ar;
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
    let fh = Math.round(fw / ar);
    if (fh > maxH) {
      fh = maxH;
      fw = Math.round(fh * ar);
    }
    crop.frame.w = fw;
    crop.frame.h = fh;
    crop.frame.x = Math.floor((cw - fw) / 2);
    crop.frame.y = Math.floor((ch - fh) / 2);
    const sW = loadedImage.naturalWidth;
    const sH = loadedImage.naturalHeight;
    const scaleToCover = Math.max(fw / sW, fh / sH);
    crop.scale = scaleToCover;
    crop.minScale = scaleToCover;
    const imgW = sW * crop.scale;
    const imgH = sH * crop.scale;
    crop.imgX = crop.frame.x + (crop.frame.w - imgW) / 2;
    crop.imgY = crop.frame.y + (crop.frame.h - imgH) / 2;
    els.zoomRange.value = String(Math.max(0.5, Math.min(5, crop.scale)));
  }

  function populateCropSizes() {
    if (!els.cropSizeSelect) return;
    // Fill once
    if (els.cropSizeSelect.options.length === PASSPORT_SIZES_MM.length) return;
    const frag = document.createDocumentFragment();
    PASSPORT_SIZES_MM.forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = s.label;
      frag.appendChild(opt);
    });
    els.cropSizeSelect.appendChild(frag);
  }

  function openCropper() {
    if (!loadedImage) return;
    // Sync crop size dropdown with main selection
    if (els.cropSizeSelect) {
      populateCropSizes();
      els.cropSizeSelect.value = els.passportSizeSelect.value;
    }
    els.cropModal.classList.add("open");
    els.cropModal.setAttribute("aria-hidden", "false");
    crop.isOpen = true;
    enterCropMode();
  }

  function closeCropper() {
    els.cropModal.classList.remove("open");
    els.cropModal.setAttribute("aria-hidden", "true");
    crop.isOpen = false;
  }

  function constrainImageToFrame() {
    const sW = loadedImage.naturalWidth;
    const sH = loadedImage.naturalHeight;
    const imgW = sW * crop.scale;
    const imgH = sH * crop.scale;
    // Ensure image covers the entire frame
    if (imgW < crop.frame.w) {
      crop.scale = crop.frame.w / sW;
    }
    if (imgH < crop.frame.h) {
      crop.scale = Math.max(crop.scale, crop.frame.h / sH);
    }
    // Recompute dimensions after potential scale adjustments
    const newImgW = sW * crop.scale;
    const newImgH = sH * crop.scale;
    // Clamp position so frame lies within image bounds
    const minX = crop.frame.x + crop.frame.w - newImgW;
    const maxX = crop.frame.x;
    const minY = crop.frame.y + crop.frame.h - newImgH;
    const maxY = crop.frame.y;
    crop.imgX = Math.min(maxX, Math.max(minX, crop.imgX));
    crop.imgY = Math.min(maxY, Math.max(minY, crop.imgY));
  }

  function drawCropper() {
    const c = els.cropCanvas;
    const cctx = c.getContext("2d");
    cctx.save();
    cctx.clearRect(0, 0, c.width, c.height);
    // Draw image
    const sW = loadedImage.naturalWidth;
    const sH = loadedImage.naturalHeight;
    const imgW = sW * crop.scale;
    const imgH = sH * crop.scale;
    cctx.imageSmoothingQuality = "high";
    cctx.drawImage(loadedImage, 0, 0, sW, sH, Math.round(crop.imgX), Math.round(crop.imgY), Math.round(imgW), Math.round(imgH));
    // Overlay outside the frame (draw as 4 rects so we don't erase the image)
    cctx.fillStyle = "rgba(0,0,0,0.55)";
    // Top
    cctx.fillRect(0, 0, c.width, crop.frame.y);
    // Left
    cctx.fillRect(0, crop.frame.y, crop.frame.x, crop.frame.h);
    // Right
    cctx.fillRect(crop.frame.x + crop.frame.w, crop.frame.y, c.width - (crop.frame.x + crop.frame.w), crop.frame.h);
    // Bottom
    cctx.fillRect(0, crop.frame.y + crop.frame.h, c.width, c.height - (crop.frame.y + crop.frame.h));
    // Frame border
    cctx.strokeStyle = "#ffffff";
    cctx.lineWidth = 2;
    cctx.strokeRect(crop.frame.x + 0.5, crop.frame.y + 0.5, crop.frame.w - 1, crop.frame.h - 1);
    // Grid guides inside frame (optional)
    cctx.strokeStyle = "rgba(255,255,255,0.6)";
    cctx.lineWidth = 1;
    // Rule of thirds
    const thirdW = crop.frame.w / 3;
    const thirdH = crop.frame.h / 3;
    for (let i = 1; i <= 2; i++) {
      cctx.beginPath();
      cctx.moveTo(crop.frame.x + i * thirdW, crop.frame.y);
      cctx.lineTo(crop.frame.x + i * thirdW, crop.frame.y + crop.frame.h);
      cctx.stroke();
      cctx.beginPath();
      cctx.moveTo(crop.frame.x, crop.frame.y + i * thirdH);
      cctx.lineTo(crop.frame.x + crop.frame.w, crop.frame.y + i * thirdH);
      cctx.stroke();
    }
    cctx.restore();
  }

  function setZoom(nextScale, anchorX, anchorY) {
    nextScale = Math.max(crop.minScale, Math.min(5, nextScale));
    // Anchor zoom at given canvas point
    const sW = loadedImage.naturalWidth;
    const sH = loadedImage.naturalHeight;
    const prevScale = crop.scale;
    if (nextScale === prevScale) return;
    const imgX = crop.imgX;
    const imgY = crop.imgY;
    const relX = (anchorX - imgX) / (sW * prevScale);
    const relY = (anchorY - imgY) / (sH * prevScale);
    crop.scale = nextScale;
    const newImgW = sW * crop.scale;
    const newImgH = sH * crop.scale;
    crop.imgX = anchorX - relX * newImgW;
    crop.imgY = anchorY - relY * newImgH;
    constrainImageToFrame();
    els.zoomRange.value = String(crop.scale);
    drawCropper();
  }

  function applyCrop() {
    // Map frame rect to source image pixels
    const sW = loadedImage.naturalWidth;
    const sH = loadedImage.naturalHeight;
    const imgW = sW * crop.scale;
    const imgH = sH * crop.scale;
    const sx = Math.max(0, Math.round(((crop.frame.x - crop.imgX) / imgW) * sW));
    const sy = Math.max(0, Math.round(((crop.frame.y - crop.imgY) / imgH) * sH));
    const sw = Math.max(1, Math.round((crop.frame.w / imgW) * sW));
    const sh = Math.max(1, Math.round((crop.frame.h / imgH) * sH));
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const octx = out.getContext("2d");
    octx.imageSmoothingQuality = "high";
    octx.drawImage(loadedImage, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = out.toDataURL("image/png");
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      closeCropper();
      render();
    };
    img.src = dataUrl;
  }

  function bindCropperEvents() {
    // Panning with pointer
    els.cropCanvas.addEventListener("pointerdown", (e) => {
      crop.isPanning = true;
      crop.lastX = e.clientX;
      crop.lastY = e.clientY;
      els.cropCanvas.setPointerCapture(e.pointerId);
    });
    els.cropCanvas.addEventListener("pointermove", (e) => {
      if (!crop.isPanning) return;
      const dx = e.clientX - crop.lastX;
      const dy = e.clientY - crop.lastY;
      crop.lastX = e.clientX;
      crop.lastY = e.clientY;
      crop.imgX += dx;
      crop.imgY += dy;
      constrainImageToFrame();
      drawCropper();
    });
    els.cropCanvas.addEventListener("pointerup", (e) => {
      crop.isPanning = false;
      els.cropCanvas.releasePointerCapture(e.pointerId);
    });
    els.cropCanvas.addEventListener("pointercancel", () => {
      crop.isPanning = false;
    });
    // Wheel zoom
    els.cropCanvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = els.cropCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.05 : 0.95;
      setZoom(crop.scale * factor, x, y);
    }, { passive: false });
    // Slider zoom
    els.zoomRange.addEventListener("input", () => {
      const rect = els.cropCanvas.getBoundingClientRect();
      setZoom(Number(els.zoomRange.value), rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    // Fit button
    els.fitBtn.addEventListener("click", () => openCropper());
    // Buttons
    els.cropCancelBtn.addEventListener("click", () => closeCropper());
    els.cropApplyBtn.addEventListener("click", () => applyCrop());
    // Modal size selector
    if (els.cropSizeSelect) {
      els.cropSizeSelect.addEventListener("change", () => {
        // Reflect into main selector
        els.passportSizeSelect.value = els.cropSizeSelect.value;
        render();
        // Reinitialize cropper to new aspect
        if (crop.isOpen) openCropper();
      });
    }
    // Modal background removal
    if (els.modalBgRemoveBtn) {
      els.modalBgRemoveBtn.addEventListener("click", () => removeBackground("#ffffff"));
    }
  }

  function handleFile(file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      els.cropBtn.disabled = false;
      // Auto-open cropper on upload
      openCropper();
      render();
    };
    img.onerror = () => {
      loadedImage = null;
      els.fitInfo.textContent = "Could not load image. Please try another file.";
      els.downloadBtn.disabled = true;
    };
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = String(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function downloadPng() {
    const dpi = Number(els.dpiSelect.value) || 300;
    const paperName = els.paperSizeSelect.value.split(" ")[0];
    const a = document.createElement("a");
    a.href = els.canvas.toDataURL("image/png");
    a.download = `passport_sheet_${paperName}_${dpi}dpi.png`;
    a.click();
  }

  function bindEvents() {
    els.fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      handleFile(file);
    });
    els.passportSizeSelect.addEventListener("change", () => {
      render();
      // If cropper is open, reinitialize to new aspect
      if (crop.isOpen) {
        if (els.cropSizeSelect) els.cropSizeSelect.value = els.passportSizeSelect.value;
        openCropper();
      }
    });
    els.paperSizeSelect.addEventListener("change", render);
    els.dpiSelect.addEventListener("change", render);
    els.spacingInput.addEventListener("change", render);
    els.marginInput.addEventListener("change", render);
    if (els.innerBorderCheckbox) {
      els.innerBorderCheckbox.addEventListener("change", render);
    }
    document.querySelectorAll('input[name="orientation"]').forEach((el) => {
      el.addEventListener("change", render);
    });
    els.renderBtn.addEventListener("click", render);
    els.downloadBtn.addEventListener("click", downloadPng);
    if (els.bgRemoveBtn) {
      els.bgRemoveBtn.addEventListener("click", () => removeBackground("#ffffff"));
    }
    els.cropBtn.addEventListener("click", () => {
      openCropper();
    });
    bindCropperEvents();
  }

  function init() {
    populatePaperSizes();
    populatePassportSizes();
    bindEvents();
    // Let user open modal to upload or use camera even without an image
    els.cropBtn.disabled = false;
    if (els.bgRemoveBtn) els.bgRemoveBtn.disabled = true;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
