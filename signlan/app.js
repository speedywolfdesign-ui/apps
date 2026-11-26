/* ------------------------------------------------------------------
   app.js — SignBridge
   1. Sign → Text → Speech  (MediaPipe hand landmarks + rule-based ASL classifier)
   2. Speech → Sign          (Web Speech API + fingerspelling animation)
------------------------------------------------------------------- */
(function () {
  const $ = (id) => document.getElementById(id);
  const { handSVG, hasSign, LETTERS, DETECTABLE, NAMES } = window.Signs;

  const MP_VERSION = '0.10.14';
  const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
  const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  /* ================= helpers ================= */
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  const labelOf = (k) => (k === 'SPACE' ? '5 / ␣' : k === 'ILY' ? 'ILY' : k);

  /* ================= tabs ================= */
  document.querySelectorAll('.tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === btn.dataset.tab));
    })
  );

  /* ================= speech synthesis ================= */
  const synth = window.speechSynthesis;
  let voices = [];
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => v.lang.startsWith('en'));
    if (!voices.length) voices = synth.getVoices();
    const sel = $('voiceSelect');
    const prev = sel.value;
    sel.innerHTML = voices.map((v, i) => `<option value="${i}">${v.name} (${v.lang})</option>`).join('');
    if (prev) sel.value = prev;
    else {
      const def = voices.findIndex((v) => v.default);
      if (def >= 0) sel.value = def;
    }
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }
  function speak(text) {
    text = (text || '').trim();
    if (!text) return;
    if (!synth) return toast('Speech output is not supported in this browser.');
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.toLowerCase());
    const v = voices[+$('voiceSelect').value];
    if (v) u.voice = v;
    u.rate = +$('rate').value;
    synth.speak(u);
  }

  /* ================= message output ================= */
  let message = '';
  function render() {
    $('outText').textContent = message;
    const tail = message.length > 32 ? '…' + message.slice(-32) : message;
    $('liveCaption').textContent = tail;
    $('liveCaption').hidden = !message;
  }
  function lastWord() {
    const words = message.trim().split(/\s+/);
    return words[words.length - 1] || '';
  }
  function addSpace() {
    if (!message || message.endsWith(' ')) return;
    const w = lastWord();
    message += ' ';
    render();
    if ($('autoSpeak').checked) speak(w);
  }
  $('speakBtn').onclick = () => speak(message);
  $('spaceBtn').onclick = addSpace;
  $('backBtn').onclick = () => { message = message.slice(0, -1); render(); };
  $('clearBtn').onclick = () => { message = ''; render(); };

  /* ================= legend & alphabet ================= */
  $('legend').innerHTML = DETECTABLE.map(
    (k) => `<div class="mini" data-k="${k}">${handSVG(k)}${labelOf(k)}</div>`
  ).join('');

  $('alphaGrid').innerHTML = [...LETTERS, 'ILY', 'SPACE']
    .map((k) => {
      const name = NAMES[k] || (k === 'J' || k === 'Z' ? 'moving sign' : '');
      return `<div class="alpha" data-k="${k}" title="Click to hear it">
        ${DETECTABLE.includes(k) ? '<span class="dot" title="Camera can detect"></span>' : ''}
        ${handSVG(k)}<strong>${k === 'SPACE' ? '5' : k}</strong><small>${name || '&nbsp;'}</small></div>`;
    })
    .join('');
  $('alphaGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.alpha');
    if (!card) return;
    const k = card.dataset.k;
    speak(k === 'ILY' ? 'I love you' : k === 'SPACE' ? 'five' : k);
  });

  /* =========================================================
     SIGN → TEXT  (camera + hand landmarks)
  ========================================================= */
  const video = $('video');
  const canvas = $('overlay');
  const ctx = canvas.getContext('2d');
  let landmarker = null;
  let stream = null;
  let running = false;
  let lastVideoTime = -1;

  let holdMs = 900;
  $('holdTime').oninput = (e) => {
    holdMs = +e.target.value;
    $('holdVal').textContent = (holdMs / 1000).toFixed(1) + 's';
  };

  function setStatus(text, live = false) {
    $('camStatus').textContent = text;
    $('camStatus').classList.toggle('live', live);
  }

  async function loadLandmarker() {
    if (landmarker) return landmarker;
    setStatus('Loading hand model…');
    const vision = await import(MP_URL);
    const files = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
    const make = (delegate) =>
      vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
    try {
      landmarker = await make('GPU');
    } catch {
      landmarker = await make('CPU');
    }
    return landmarker;
  }

  let facing = 'user'; // 'user' = front camera, 'environment' = back camera

  async function openStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: { ideal: facing } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    // mirror only the selfie camera, so it behaves like a mirror
    $('videoWrap').classList.toggle('mirror', facing === 'user');
    // match the frame to the camera's real shape (portrait on phones)
    if (video.videoWidth) $('videoWrap').style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    resetTracking();
    // offer the switch button only when there is more than one camera
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      $('switchCam').hidden = cams.length < 2;
    } catch { /* keep hidden */ }
  }

  async function switchCamera() {
    if (!stream) return;
    const prev = facing;
    facing = facing === 'user' ? 'environment' : 'user';
    $('switchCam').disabled = true;
    try {
      await openStream();
      toast(facing === 'user' ? 'Front camera' : 'Back camera');
    } catch (err) {
      console.error(err);
      facing = prev;
      toast('Could not switch camera.');
      await openStream().catch(() => stopCamera());
    } finally {
      $('switchCam').disabled = false;
    }
  }
  $('switchCam').onclick = switchCamera;

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return toast('Camera is not available. Open the app via http://localhost or https.');
    }
    $('startCam').disabled = true;
    // iOS only allows speech after a tap: prime it now so later words can be spoken
    if (synth) synth.speak(new SpeechSynthesisUtterance(''));
    try {
      await openStream();
      $('camPlaceholder').classList.add('hidden');
      await loadLandmarker();
      running = true;
      $('stopCam').disabled = false;
      setStatus('Detecting', true);
      requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      stopCamera();
      toast(err.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'Could not start: ' + err.message);
    } finally {
      $('startCam').disabled = false;
    }
  }

  function stopCamera() {
    running = false;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $('camPlaceholder').classList.remove('hidden');
    $('stopCam').disabled = true;
    $('switchCam').hidden = true;
    setStatus('Camera off');
    showDetected(null, 0);
  }
  $('startCam').onclick = startCamera;
  $('stopCam').onclick = stopCamera;

  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const res = landmarker.detectForVideo(video, performance.now());
      onResults(res);
    }
    requestAnimationFrame(loop);
  }

  /* ---------- drawing ---------- */
  const CONN = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
  ];
  function drawHand(pts) {
    ctx.lineWidth = Math.max(2, canvas.width / 260);
    ctx.strokeStyle = 'rgba(139,109,255,0.9)';
    ctx.lineCap = 'round';
    for (const [a, b] of CONN) {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.fillStyle = [4, 8, 12, 16, 20].includes(i) ? '#ff6f98' : '#ffffff';
      ctx.arc(pts[i].x, pts[i].y, Math.max(3, canvas.width / 160), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- classifier ---------- */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function classify(p) {
    const W = p[0];
    const hs = dist(W, p[9]); // hand size: wrist → middle knuckle
    if (hs < 1) return null;
    const ux = (p[9].x - W.x) / hs, uy = (p[9].y - W.y) / hs; // "up" axis of the hand
    const proj = (q) => ((q.x - W.x) * ux + (q.y - W.y) * uy) / hs;
    const near = (a, b, k) => dist(p[a], p[b]) < k * hs;

    const ext = (tip, pip) => dist(W, p[tip]) > dist(W, p[pip]) * 1.08;
    const i = ext(8, 6), m = ext(12, 10), r = ext(16, 14), k = ext(20, 18);
    const thumbOut = dist(p[4], p[5]) > 0.62 * hs && dist(p[4], p[17]) > dist(p[3], p[17]);

    // which way the index finger points on screen (for G/H sideways, P/Q downward)
    const dx = p[8].x - p[5].x, dy = p[8].y - p[5].y;
    const down = dy > Math.abs(dx) * 0.8;
    const sideways = !down && Math.abs(dx) > Math.abs(dy) * 1.3;

    if (i && m && r && k) return thumbOut ? 'SPACE' : 'B';
    if (!i && m && r && k && near(4, 8, 0.38)) return 'F';
    if (i && m && r && !k) return 'W';
    if (i && !m && !r && k && thumbOut) return 'ILY';
    if (!i && !m && !r && k) return thumbOut ? 'Y' : 'I';
    if (i && m && !r && !k) {
      if (down) return 'P';
      if (sideways) return 'H';
      const crossed = (p[8].x - p[12].x) * (p[5].x - p[9].x) < 0;
      if (crossed) return 'R';
      // K: thumb pushed up between index and middle fingers
      if (proj(p[4]) > proj(p[5]) + 0.1 && (near(4, 10, 0.4) || near(4, 6, 0.4))) return 'K';
      return dist(p[8], p[12]) < 0.3 * hs ? 'U' : 'V';
    }
    if (i && !m && !r && !k) {
      if (down) return 'Q';
      if (sideways) return 'G';
      return thumbOut ? 'L' : 'D';
    }

    // curved shapes: O and C (fingers not straight but not folded into palm)
    const openness = dist(W, p[12]) / hs;
    if (openness > 1.05 && !k) {
      if (near(4, 8, 0.33) && near(4, 12, 0.45)) return 'O';
      if (dist(p[4], p[8]) > 0.4 * hs && dist(p[4], p[8]) < 1.1 * hs) return 'C';
    }

    if (!i && !m && !r && !k) {
      // X: index raised at the middle joint but hooked at the tip
      if (proj(p[6]) > proj(p[10]) + 0.25 && proj(p[7]) > proj(p[10])) return 'X';

      // closed fist: E / A / S / T / N / M
      const tipsProj = (proj(p[8]) + proj(p[12]) + proj(p[16])) / 3;
      if (tipsProj > proj(p[4]) + 0.08 && near(4, 12, 0.55)) return 'E';
      // where the thumb tip sits across the knuckles: 0 = index side, 1 = pinky side
      const kx = p[17].x - p[5].x, ky = p[17].y - p[5].y;
      const lat = ((p[4].x - p[5].x) * kx + (p[4].y - p[5].y) * ky) / (kx * kx + ky * ky);
      if (lat < 0.1) return 'A';
      // thumb tucked under the fingers (further from the camera) → T / N / M
      const fingerZ = (p[6].z + p[10].z + p[14].z) / 3;
      if (p[4].z > fingerZ) return lat < 0.4 ? 'T' : lat < 0.7 ? 'N' : 'M';
      return 'S';
    }
    return null;
  }

  /* ---------- motion letters: J and Z ---------- */
  const track = []; // recent frames: shape + index tip + pinky tip
  const TRACK_MS = 1500;

  function pathLen(key) {
    let L = 0;
    for (let j = 1; j < track.length; j++) L += dist(track[j][key], track[j - 1][key]);
    return L / track[track.length - 1].hs;
  }
  function share(shapes) {
    return track.filter((f) => shapes.includes(f.shape)).length / track.length;
  }
  // count left/right direction changes of a fingertip (ignores small jitter)
  function reversals(key) {
    const hs = track[track.length - 1].hs;
    let dir = 0, extreme = track[0][key].x, n = 0;
    for (const f of track) {
      const x = f[key].x;
      if (dir >= 0 && x < extreme - 0.25 * hs) { if (dir > 0) n++; dir = -1; extreme = x; }
      else if (dir <= 0 && x > extreme + 0.25 * hs) { if (dir < 0) n++; dir = 1; extreme = x; }
      else if ((dir > 0 && x > extreme) || (dir < 0 && x < extreme)) extreme = x;
    }
    return n;
  }
  function detectMotion(now) {
    while (track.length && now - track[0].t > TRACK_MS) track.shift();
    if (track.length < 10) return null;
    // Z: pointing index finger draws a zig-zag
    if (share(['D', 'L', 'G', 'Q', 'X']) > 0.6 && pathLen('ix') > 2 && reversals('ix') >= 2) return 'Z';
    // J: little finger (I handshape) swoops down and curls
    if (share(['I', 'Y']) > 0.6 && pathLen('px') > 1.1) {
      const net = dist(track[0].px, track[track.length - 1].px) / track[track.length - 1].hs;
      if (net > 0.5) return 'J';
    }
    return null;
  }
  // is the hand moving? then don't count it as holding a still sign
  function isMoving() {
    const n = track.length;
    if (n < 4) return false;
    const a = track[n - 4], b = track[n - 1];
    const dt = (b.t - a.t) / 1000 || 1;
    return Math.max(dist(a.ix, b.ix), dist(a.px, b.px)) / b.hs / dt > 1.5;
  }

  /* ---------- stabilising & typing ---------- */
  const history = [];
  let candidate = null, candStart = 0, committed = null, motionLock = false;

  function resetTracking() {
    history.length = 0;
    track.length = 0;
    candidate = committed = null;
    motionLock = false;
  }

  function vote(sign) {
    history.push(sign);
    if (history.length > 8) history.shift();
    const counts = {};
    for (const s of history) counts[s] = (counts[s] || 0) + 1;
    let best = null, bestN = 0;
    for (const s in counts) if (counts[s] > bestN) { best = s; bestN = counts[s]; }
    return bestN >= 5 && best !== 'null' ? best : null;
  }

  function onResults(res) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (canvas.width !== vw || canvas.height !== vh) { canvas.width = vw; canvas.height = vh; }
    ctx.clearRect(0, 0, vw, vh);
    const now = performance.now();

    let raw = null;
    if (res.landmarks && res.landmarks.length) {
      const pts = res.landmarks[0].map((l) => ({ x: l.x * vw, y: l.y * vh, z: l.z * vw }));
      drawHand(pts);
      raw = classify(pts);
      track.push({ t: now, shape: raw, ix: pts[8], px: pts[20], hs: dist(pts[0], pts[9]) });
    } else {
      track.length = 0;
    }
    const sign = vote(raw);

    if (sign !== candidate) { candidate = sign; candStart = now; }
    if (!sign) { committed = null; motionLock = false; } // lowering the hand allows a repeat

    const motion = detectMotion(now);
    if (motion) {
      commit(motion);
      track.length = 0;
      motionLock = true; // don't also type the still handshape until the hand drops
      showDetected(motion, 1);
      return;
    }
    if (isMoving()) candStart = now;

    let progress = 0;
    if (sign && sign !== committed && !motionLock) {
      progress = Math.min(1, (now - candStart) / holdMs);
      if (progress >= 1) { commit(sign); committed = sign; }
    } else if (sign) progress = 1;
    showDetected(sign, progress);
  }

  function commit(sign) {
    if (sign === 'SPACE') addSpace();
    else if (sign === 'ILY') {
      if (message && !message.endsWith(' ')) message += ' ';
      message += 'I LOVE YOU ';
      render();
      if ($('autoSpeak').checked) speak('I love you');
    } else {
      message += sign;
      render();
    }
    const badge = $('detectBadge');
    badge.classList.remove('flash');
    void badge.offsetWidth;
    badge.classList.add('flash');
  }

  let shownSign;
  function showDetected(sign, progress) {
    $('ringFg').style.strokeDashoffset = 276.5 * (1 - progress);
    if (sign === shownSign) return;
    shownSign = sign;
    const el = $('detectLetter');
    el.textContent = sign ? labelOf(sign) : '–';
    el.classList.toggle('small', !!sign && sign.length > 1);
    document.querySelectorAll('#legend .mini').forEach((m) => m.classList.toggle('hit', m.dataset.k === sign));
  }

  /* =========================================================
     SPEECH → SIGN
  ========================================================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, finalText = '';

  function setMic(on, msg) {
    listening = on;
    $('micBtn').classList.toggle('listening', on);
    $('micStatus').textContent = msg;
  }

  function renderTranscript(interim = '') {
    const t = $('transcript');
    if (!finalText && !interim) {
      t.innerHTML = '<span class="muted">Your words will appear here.</span>';
      return;
    }
    t.textContent = finalText;
    if (interim) {
      const s = document.createElement('span');
      s.className = 'interim';
      s.textContent = ' ' + interim;
      t.appendChild(s);
    }
  }

  $('micBtn').onclick = () => {
    if (!SR) return toast('Speech recognition is not supported here. Try Chrome or Edge, or type instead.');
    if (listening) { rec.stop(); return; }
    rec = new SR();
    rec.lang = $('lang').value;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => setMic(true, 'Listening… tap again to stop.');
    rec.onerror = (e) => {
      setMic(false, 'Tap the mic and start talking.');
      if (e.error === 'not-allowed') toast('Microphone permission was denied.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Speech error: ' + e.error);
    };
    rec.onend = () => setMic(false, 'Tap the mic and start talking.');
    rec.onresult = (e) => {
      let interim = '';
      for (let j = e.resultIndex; j < e.results.length; j++) {
        const txt = e.results[j][0].transcript.trim();
        if (e.results[j].isFinal) {
          finalText = (finalText + ' ' + txt).trim();
          translate(txt);
        } else interim += txt + ' ';
      }
      renderTranscript(interim.trim());
    };
    finalText = '';
    rec.start();
  };

  $('textForm').onsubmit = (e) => {
    e.preventDefault();
    const txt = $('textIn').value.trim();
    if (!txt) return;
    finalText = txt;
    renderTranscript();
    translate(txt);
    $('textIn').value = '';
  };

  /* ---------- build the sign sequence ---------- */
  let seq = [], words = [], pos = 0, timer = null, playing = false;
  let speed = 900;
  $('speed').oninput = (e) => {
    speed = +e.target.value;
    $('speedVal').textContent = (speed / 1000).toFixed(1) + 's';
  };

  function translate(text) {
    const clean = text.toUpperCase().replace(/I LOVE YOU/g, ' \u0001 ').replace(/[^A-Z0-9\u0001\s]/g, ' ');
    words = clean.split(/\s+/).filter(Boolean);
    seq = [];
    words.forEach((w, wi) => {
      if (w === '\u0001') {
        words[wi] = 'I LOVE YOU';
        seq.push({ k: 'ILY', ch: '🤟', wi, ci: -1 });
      } else {
        [...w].forEach((ch, ci) => seq.push({ k: ch, ch, wi, ci }));
      }
    });
    buildStrip();
    pos = 0;
    $('playBtn').disabled = $('replayBtn').disabled = !seq.length;
    if (seq.length) play();
  }

  function buildStrip() {
    const strip = $('signStrip');
    strip.innerHTML = '';
    words.forEach((w, wi) => {
      const g = document.createElement('div');
      g.className = 'word-group';
      seq.forEach((s, si) => {
        if (s.wi !== wi) return;
        const d = document.createElement('div');
        d.className = 'mini';
        d.dataset.si = si;
        d.innerHTML = handSVG(s.k, { label: s.k === 'ILY' ? 'I love you' : s.ch }) + (s.k === 'ILY' ? 'ILY' : s.ch);
        d.title = hasSign(s.k) ? '' : 'Numbers are shown as text';
        g.appendChild(d);
      });
      strip.appendChild(g);
    });
  }

  $('signStrip').addEventListener('click', (e) => {
    const m = e.target.closest('.mini');
    if (!m) return;
    pause();
    show(+m.dataset.si);
  });

  function show(i) {
    pos = i;
    const s = seq[i];
    if (!s) return;
    $('stageSign').innerHTML = handSVG(s.k, { label: s.ch });
    $('stageLetter').textContent = s.k === 'ILY' ? '🤟' : s.ch;
    const w = words[s.wi];
    $('stageWord').innerHTML =
      s.ci < 0
        ? `<b>${w}</b>`
        : [...w].map((c, ci) => (ci === s.ci ? `<b>${c}</b>` : c)).join('');
    document.querySelectorAll('#signStrip .mini').forEach((m) => m.classList.toggle('current', +m.dataset.si === i));
    document.querySelector(`#signStrip .mini[data-si="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function step() {
    if (pos >= seq.length) { pause(); pos = 0; return; }
    show(pos);
    const cur = seq[pos], next = seq[pos + 1];
    pos++;
    // pause a little longer between words
    const gap = next && next.wi !== cur.wi ? speed * 0.6 : 0;
    timer = setTimeout(step, speed + gap);
  }
  function play() {
    clearTimeout(timer);
    playing = true;
    $('playBtn').textContent = '⏸ Pause';
    if (pos >= seq.length) pos = 0;
    step();
  }
  function pause() {
    clearTimeout(timer);
    playing = false;
    $('playBtn').textContent = '▶ Play';
  }
  $('playBtn').onclick = () => (playing ? pause() : play());
  $('replayBtn').onclick = () => { pos = 0; play(); };

  /* initial stage */
  $('stageSign').innerHTML = handSVG('ILY');
  render();
})();
