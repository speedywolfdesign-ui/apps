/* ============================================================
   photos.js - progress photo capture (in-app camera + file/gallery),
   downscaling and blob -> URL / dataURL helpers
   ============================================================ */
const Photos = (() => {

  /* The three required poses, in the order they are shown everywhere */
  const POSES = [
    { key: 'front', label: 'Front Facing', emoji: '🧍', hint: 'Face the camera, arms slightly away from the body.' },
    { key: 'right', label: 'Right Facing', emoji: '🚶', hint: 'Turn to your right, full body side-on to the camera.' },
    { key: 'back',  label: 'Back Side',    emoji: '🔙', hint: 'Turn your back to the camera, stand straight.' }
  ];
  const poseLabel = (k) => (POSES.find(p => p.key === k) || { label: k }).label;

  /* ---------- image downscaling (keeps storage + exports light) ---------- */
  function compress(file, maxDim = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Could not process image')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unreadable image')); };
      img.src = url;
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(dataURL) {
    const [head, b64] = dataURL.split(',');
    const mime = (head.match(/:(.*?);/) || [, 'image/jpeg'])[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* object-URL cache so thumbnails are not re-created on every render */
  const urlCache = new Map();
  function url(id, blob) {
    if (urlCache.has(id)) return urlCache.get(id);
    const u = URL.createObjectURL(blob);
    urlCache.set(id, u);
    return u;
  }
  function dropUrl(id) {
    if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
  }

  /* ---------- pick from gallery / device camera roll ---------- */
  function pickFile({ useCamera = false } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (useCamera) input.setAttribute('capture', 'environment'); // opens the camera app on phones
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        input.remove();
        resolve(f || null);
      }, { once: true });
      input.click();
    });
  }

  /* ---------- in-app camera (getUserMedia) ---------- */
  const modal   = () => document.getElementById('cameraModal');
  const video   = () => document.getElementById('camVideo');
  let stream = null;
  let facing = 'environment';

  function stopStream() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    const v = video(); if (v) v.srcObject = null;
  }

  async function startStream() {
    stopStream();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } },
      audio: false
    });
    const v = video();
    v.srcObject = stream;
    // a front camera preview is mirrored, so mirror the preview to match what people expect
    v.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
    await v.play().catch(() => {});
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Opens the in-app camera and resolves with a JPEG Blob, or null if cancelled.
   * Falls back to the device camera app when getUserMedia is unavailable
   * (e.g. iOS Safari over plain http, or permission blocked).
   */
  async function capture(pose) {
    if (!supported()) {
      const f = await pickFile({ useCamera: true });
      return f ? compress(f) : null;
    }
    const m = modal();
    const p = POSES.find(x => x.key === pose) || POSES[0];
    document.getElementById('cameraTitle').textContent = `${p.emoji} ${p.label}`;
    document.getElementById('camHint').textContent = p.hint + ' Stand 2–3 m away, full body inside the frame.';
    m.hidden = false;

    try {
      await startStream();
    } catch (err) {
      m.hidden = true;
      stopStream();
      const f = await pickFile({ useCamera: true });  // permission denied / no camera
      return f ? compress(f) : null;
    }

    return new Promise((resolve) => {
      const close = (val) => {
        m.hidden = true;
        stopStream();
        shoot.removeEventListener('click', onShoot);
        flip.removeEventListener('click', onFlip);
        m.querySelectorAll('[data-close-camera]').forEach(b => b.removeEventListener('click', onCancel));
        resolve(val);
      };
      const onShoot = () => {
        const v = video();
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(async (b) => {
          const small = await compress(b);
          close(small);
        }, 'image/jpeg', 0.9);
      };
      const onFlip = async () => {
        facing = facing === 'environment' ? 'user' : 'environment';
        try { await startStream(); } catch (e) { /* keep the current stream */ }
      };
      const onCancel = () => close(null);

      const shoot = document.getElementById('camShoot');
      const flip  = document.getElementById('camSwitch');
      shoot.addEventListener('click', onShoot);
      flip.addEventListener('click', onFlip);
      m.querySelectorAll('[data-close-camera]').forEach(b => b.addEventListener('click', onCancel));
    });
  }

  return { POSES, poseLabel, compress, blobToDataURL, dataURLToBlob, url, dropUrl, pickFile, capture, supported };
})();
