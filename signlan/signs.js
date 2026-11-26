/* ------------------------------------------------------------------
   signs.js — draws stylised ASL fingerspelling handshapes as SVG.
   Right hand, palm facing the viewer (thumb on the viewer's left).
------------------------------------------------------------------- */
(function () {
  const SKIN = '#f6c9a4';
  const SHADE = '#dc9f78';
  const LINE = '#6b3f26';
  const BASE_Y = 122;
  const FING = {
    I: { x: 67, len: 80, w: 19 },
    M: { x: 90, len: 90, w: 19 },
    R: { x: 113, len: 82, w: 18 },
    P: { x: 135, len: 62, w: 16 },
  };
  const rad = (a) => (a * Math.PI) / 180;
  const n = (v) => +v.toFixed(1);

  // ---- finger shapes: each returns a list of segments ----
  // layer "back" is drawn behind the palm, "front" on top of it.
  function up(k, ang = 0, dx = 0) {
    const f = FING[k];
    const bx = f.x + dx;
    const tx = bx + f.len * Math.sin(rad(ang));
    const ty = BASE_Y - f.len * Math.cos(rad(ang));
    return [{ d: `M${bx} ${BASE_Y} L${n(tx)} ${n(ty)}`, layer: 'back' }];
  }
  function curl(k) {
    const x = FING[k].x;
    return [{ d: `M${x} 114 L${x} 150`, shade: true, layer: 'front' }];
  }
  function bent(k) {
    const x = FING[k].x;
    return [
      { d: `M${x} ${BASE_Y} L${x} 98`, layer: 'back' },
      { d: `M${x} 100 L${x} 130`, shade: true, layer: 'front' },
    ];
  }
  function hook(k) {
    const x = FING[k].x;
    return [
      { d: `M${x} ${BASE_Y} L${x} 78`, layer: 'back' },
      { d: `M${x} 78 Q${x + 5} 86 ${x + 3} 100`, shade: true, layer: 'front' },
    ];
  }
  function cv(k, ctrl, end, layer = 'back') {
    const x = FING[k].x;
    return [{ d: `M${x} ${BASE_Y} Q${ctrl[0]} ${ctrl[1]} ${end[0]} ${end[1]}`, layer }];
  }
  function line(d, layer = 'back') {
    return [{ d, layer }];
  }
  const allCurl = () => ({ I: curl('I'), M: curl('M'), R: curl('R'), P: curl('P') });

  // ---- thumb paths ----
  const T = {
    side: 'M60 178 Q44 150 50 112',
    out: 'M60 178 Q36 160 16 130',
    across: 'M60 178 Q82 166 118 162',
    high: 'M60 178 Q72 150 112 140',
    tucked: 'M60 178 Q82 174 116 168',
    mid: 'M60 178 Q80 152 92 146',
    pinch: 'M60 178 Q40 142 58 102',
    longSide: 'M60 178 Q44 150 42 96',
    k: 'M60 178 Q68 140 80 104',
    m: 'M60 178 Q96 178 124 166',
    n: 'M60 178 Q88 178 102 166',
    t: 'M60 178 Q64 152 79 134',
    c: 'M60 178 Q26 168 30 126',
  };

  // ---- letter definitions ----
  const DEF = {
    A: () => ({ f: allCurl(), t: 'side' }),
    B: () => ({ f: { I: up('I', -2, 2), M: up('M'), R: up('R', 2), P: up('P', 5) }, t: 'across' }),
    C: () => ({
      f: {
        I: cv('I', [95, 42], [58, 64]),
        M: cv('M', [118, 36], [80, 56]),
        R: cv('R', [138, 46], [104, 62]),
        P: cv('P', [154, 72], [128, 82]),
      },
      t: 'c',
    }),
    D: () => ({ f: { ...allCurl(), I: up('I') }, t: 'mid' }),
    E: () => ({ f: { I: bent('I'), M: bent('M'), R: bent('R'), P: bent('P') }, t: 'tucked' }),
    F: () => ({ f: { I: cv('I', [82, 76], [60, 100], 'front'), M: up('M', -2), R: up('R', 6), P: up('P', 14) }, t: 'pinch' }),
    G: () => ({ f: { ...allCurl(), I: up('I') }, t: 'longSide', rot: -90 }),
    H: () => ({ f: { ...allCurl(), I: up('I', 0, 4), M: up('M', 0, -2) }, t: 'high', rot: -90 }),
    I: () => ({ f: { ...allCurl(), P: up('P', 4) }, t: 'high' }),
    J: () => ({ f: { ...allCurl(), P: up('P', 4) }, t: 'high', motion: 'J' }),
    K: () => ({ f: { ...allCurl(), I: up('I', -10), M: up('M', 16) }, t: 'k' }),
    L: () => ({ f: { ...allCurl(), I: up('I') }, t: 'out' }),
    M: () => ({ f: allCurl(), t: 'm', under: true }),
    N: () => ({ f: allCurl(), t: 'n', under: true }),
    O: () => ({
      f: {
        I: cv('I', [74, 66], [60, 98]),
        M: cv('M', [98, 58], [70, 94]),
        R: cv('R', [120, 64], [82, 98]),
        P: cv('P', [140, 82], [94, 104]),
      },
      t: 'pinch',
    }),
    P: () => ({ ...DEF.K(), rot: 160 }),
    Q: () => ({ ...DEF.G(), rot: 175 }),
    R: () => ({ f: { ...allCurl(), M: line('M90 122 L66 36'), I: line('M67 122 L94 46') }, t: 'high' }),
    S: () => ({ f: allCurl(), t: 'high' }),
    T: () => ({ f: allCurl(), t: 't' }),
    U: () => ({ f: { ...allCurl(), I: up('I', 0, 3), M: up('M', 0, -3) }, t: 'high' }),
    V: () => ({ f: { ...allCurl(), I: up('I', -12), M: up('M', 12) }, t: 'high' }),
    W: () => ({ f: { ...allCurl(), I: up('I', -14), M: up('M'), R: up('R', 14) }, t: 'high' }),
    X: () => ({ f: { ...allCurl(), I: hook('I') }, t: 'high' }),
    Y: () => ({ f: { ...allCurl(), P: up('P', 22) }, t: 'out' }),
    Z: () => ({ f: { ...allCurl(), I: up('I') }, t: 'high', motion: 'Z' }),
    ILY: () => ({ f: { ...allCurl(), I: up('I', -4), P: up('P', 18) }, t: 'out' }),
    SPACE: () => ({ f: { I: up('I', -16), M: up('M', -4), R: up('R', 8), P: up('P', 22) }, t: 'out' }),
  };

  let uid = 0;

  function seg(s, w) {
    const common = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
    return (
      `<path d="${s.d}" ${common} stroke="${LINE}" stroke-width="${w + 4}"/>` +
      `<path d="${s.d}" ${common} stroke="${s.shade ? SHADE : SKIN}" stroke-width="${w}"/>`
    );
  }

  function handSVG(key, opts = {}) {
    const def = DEF[key];
    if (!def) return textCard(key);
    const d = def();
    const id = 'mk' + ++uid;
    let back = '', front = '';
    // draw M before I so the index crosses over the middle finger (R)
    for (const k of ['P', 'R', 'M', 'I']) {
      for (const s of d.f[k]) {
        const html = seg(s, FING[k].w);
        if (s.layer === 'front') front += html; else back += html;
      }
    }
    const thumb = seg({ d: T[d.t] }, 21);
    const wrist = `<rect x="70" y="186" width="62" height="56" rx="12" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>`;
    const palm = `<rect x="52" y="108" width="98" height="100" rx="26" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>`;
    const crease = `<path d="M78 176 Q100 186 128 168" fill="none" stroke="${SHADE}" stroke-width="2" stroke-linecap="round"/>`;
    const hand = wrist + back + palm + crease + (d.under ? thumb : '') + front + (d.under ? '' : thumb);
    const r = d.rot || 0;
    const group = r
      ? `<g transform="translate(100 132) rotate(${r}) scale(.8) translate(-100 -132)">${hand}</g>`
      : hand;

    let motion = '';
    if (d.motion) {
      const path = d.motion === 'J' ? 'M160 56 Q176 150 118 158' : 'M18 20 L70 20 L18 62 L70 62';
      motion =
        `<defs><marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
        `<path d="M0 0 L10 5 L0 10 z" fill="var(--accent, #7c5cff)"/></marker></defs>` +
        `<path d="${path}" fill="none" stroke="var(--accent, #7c5cff)" stroke-width="4" stroke-dasharray="7 5" stroke-linecap="round" marker-end="url(#${id})"/>`;
    }
    const label = opts.label ?? key;
    return `<svg class="hand" viewBox="0 0 200 240" role="img" aria-label="Sign for ${label}">${group}${motion}</svg>`;
  }

  function textCard(ch) {
    return `<svg class="hand" viewBox="0 0 200 240" role="img" aria-label="${ch}"><text x="100" y="150" text-anchor="middle" font-size="96" font-weight="800" fill="currentColor" opacity=".55">${ch}</text></svg>`;
  }

  window.Signs = {
    handSVG,
    hasSign: (k) => !!DEF[k],
    LETTERS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
    // handshapes the camera classifier can recognise
    DETECTABLE: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ILY', 'SPACE'],
    NAMES: { ILY: 'I love you', SPACE: 'Space (open hand)' },
  };
})();
