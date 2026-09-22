/* ============================================================
   app.js - BTC Transformation Tracker (PWA shell, views, router)
   Several participants can be tracked on one device; the active
   one owns the home screen, the others show up as cards.
   ============================================================ */

/* ---------------- constants from the printed sheets ---------------- */
const HABITS = [
  { key: 'fuel',  emoji: '🥤', label: 'FUEL',  sub: 'Two Time' },
  { key: 'sleep', emoji: '🌙', label: 'SLEEP', sub: '7 to 8 hours' },
  { key: 'water', emoji: '💧', label: 'WATER', sub: 'As per requirement' },
  { key: 'lunch', emoji: '🍚', label: 'LUNCH', sub: 'Plate 1 and 2' },
  { key: 'steps', emoji: '👣', label: 'STEPS', sub: '5 to 10K' }
];
const WEEKS = [
  { n: 1, from: 1,  to: 7  }, { n: 2, from: 8,  to: 14 }, { n: 3, from: 15, to: 21 },
  { n: 4, from: 22, to: 28 }, { n: 5, from: 29, to: 35 }, { n: 6, from: 36, to: 41 }
];
const GOALS = [
  { k: 'weight-loss', label: 'Weight Loss (Reduce Weight)', short: 'Weight loss' },
  { k: 'weight-gain', label: 'Weight Gain (Increase Weight)', short: 'Weight gain' },
  { k: 'fat-loss',    label: 'Fat Loss (Reduce Body Fat & Build Muscle)', short: 'Fat loss' },
  { k: 'overall',     label: 'Overall Body Transformation', short: 'Overall transformation' }
];
const PROGRAMS = [
  { k: 'basic',        label: 'Basic Program', hi: 'बेसिक प्रोग्राम (एसएमएस प्रोग्राम)' },
  { k: 'personalized', label: 'Personalized Program', hi: 'पर्सनलाइज्ड प्रोग्राम (प्रोटीन/फाइबर आधारित)' },
  { k: 'advanced',     label: 'Advanced Program', hi: 'एडवांस्ड प्रोग्राम (एनर्जी/डायनो फ्यूल/हाइड्रेट)' }
];
const TOTAL_DAYS = 41;

/* ---------------- small helpers ---------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function todayISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayISO(d);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- state ---------------- */
const State = {
  participants: [],   // every person tracked on this device
  summaries: {},      // id -> { logged, points, consistency, day, avatar }
  activeId: null,
  profile: null,      // the active participant (profile + weekly + final)
  records: [],        // active participant's records, newest first
  photoIndex: {}      // date -> { pose: blob } for the active participant
};

const newParticipant = (name = '') => ({
  id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  name, clubNumber: '', clubOperator: '', coach: '', goal: '',
  startDate: todayISO(), season: '1', weekly: {}, final: {}, createdAt: Date.now()
});

const emptyRecord = (date) => ({
  date,
  habits: { fuel: false, sleep: false, water: false, lunch: false, steps: false },
  weight: '', inches: '',
  activity: { name: '', percent: '', points: '', fuelAdded: '' },
  recipes: { healthy: { tried: '', posted: null }, laddu: { tried: '', posted: null } },
  fuelProgram: { selected: '', extras: Array.from({ length: 5 }, () => ({ name: '', added: null })) },
  detox: null,
  notes: '',
  updatedAt: Date.now()
});

/* fills in anything missing when an older record shape is loaded */
function normalise(rec, date) {
  const base = emptyRecord(date);
  if (!rec) return base;
  return {
    ...base, ...rec,
    habits: { ...base.habits, ...(rec.habits || {}) },
    activity: { ...base.activity, ...(rec.activity || {}) },
    recipes: {
      healthy: { ...base.recipes.healthy, ...((rec.recipes || {}).healthy || {}) },
      laddu:   { ...base.recipes.laddu,   ...((rec.recipes || {}).laddu   || {}) }
    },
    fuelProgram: {
      selected: (rec.fuelProgram || {}).selected || '',
      extras: ((rec.fuelProgram || {}).extras && rec.fuelProgram.extras.length === 5)
        ? rec.fuelProgram.extras : base.fuelProgram.extras
    }
  };
}

const dayNumber = (date, p = State.profile) => daysBetween(p.startDate, date) + 1;
const scoreOf = (rec) => HABITS.filter(h => rec.habits[h.key]).length;
const goalShort = (k) => (GOALS.find(g => g.k === k) || {}).short || '';

/* headline numbers for every participant, used by the cards */
async function buildSummaries() {
  const out = {};
  for (const p of State.participants) {
    const recs = await DB.recordsFor(p.id);
    const pics = await DB.photosFor(p.id);
    const points = recs.reduce((s, r) => s + scoreOf(normalise(r, r.date)), 0);
    const front = pics.filter(x => x.pose === 'front').sort((a, b) => (a.date < b.date ? 1 : -1))[0] || pics[0];
    out[p.id] = {
      logged: recs.length,
      points,
      photos: pics.length,
      consistency: Math.round((points / Math.max(1, recs.length * 5)) * 100),
      day: Math.min(TOTAL_DAYS, Math.max(1, daysBetween(p.startDate, todayISO()) + 1)),
      lastDate: recs.length ? recs.map(r => r.date).sort().slice(-1)[0] : '',
      avatar: front ? { id: front.id, blob: front.blob } : null
    };
  }
  return out;
}

async function loadState() {
  State.participants = await DB.listParticipants();
  if (!State.participants.length) {                       // first run
    const p = newParticipant('');
    await DB.putParticipant(p);
    await DB.setMeta('activeParticipant', p.id);
    State.participants = [p];
  }
  let active = await DB.getMeta('activeParticipant');
  if (!State.participants.some(p => p.id === active)) {
    active = State.participants[0].id;
    await DB.setMeta('activeParticipant', active);
  }
  State.activeId = active;
  State.profile = State.participants.find(p => p.id === active);
  State.records = (await DB.recordsFor(active)).map(r => normalise(r, r.date));
  State.photoIndex = {};
  (await DB.photosFor(active)).forEach(p => {
    (State.photoIndex[p.date] = State.photoIndex[p.date] || {})[p.pose] = p.blob;
  });
  State.summaries = await buildSummaries();
  paintWhoChip();
}

const saveProfile = () => {
  if (!State.profile.id) State.profile.id = State.activeId;   // never write an id-less participant
  return DB.putParticipant(State.profile);
};

async function switchParticipant(id) {
  if (id === State.activeId) return;
  await DB.setMeta('activeParticipant', id);
  await loadState();
  toast('Switched to ' + (State.profile.name || 'this participant'));
  go('home');
}

function paintWhoChip() {
  const p = State.profile || {};
  const s = State.summaries[State.activeId];
  const av = $('#whoAvatar');
  if (s && s.avatar) av.innerHTML = `<img src="${Photos.url(s.avatar.id, s.avatar.blob)}" alt="" />`;
  else av.textContent = initials(p.name);
  $('#whoName').textContent = p.name || 'Set up';
}

/* ============================================================
   Router
   ============================================================ */
function go(route) {
  const h = '#/' + route;
  if (location.hash === h) render();      // same route: re-render instead of doing nothing
  else location.hash = h;
}
function currentRoute() {
  const raw = (location.hash || '#/home').replace(/^#\/?/, '');
  const [name, ...rest] = raw.split('/');
  return { name: name || 'home', arg: rest.join('/') };
}

const TAB_OF = { home: 'home', entry: 'home', weekly: 'weekly', export: 'export',
                 profile: 'more', participants: 'more', backup: 'more' };

/* renders run one at a time; if a newer one is queued the stale one is skipped */
let renderToken = 0;
let renderChain = Promise.resolve();
function render() {
  const token = ++renderToken;
  renderChain = renderChain.then(async () => {
    if (token !== renderToken) return;
    const { name, arg } = currentRoute();
    const view = $('#view');
    closeSheet();
    const routes = { home: viewHome, entry: viewEntry, profile: viewProfile,
                     participants: viewParticipants, weekly: viewWeekly, export: viewExport, backup: viewBackup };
    const fn = routes[name] || viewHome;
    view.innerHTML = '<div class="empty">Loading…</div>';
    await fn(view, arg);
    window.scrollTo(0, 0);
    const tab = TAB_OF[name] || 'home';
    $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  }).catch(err => {
    console.error(err);
    $('#view').innerHTML = `<div class="card"><div class="card-title">Something went wrong</div>
      <p class="muted">${esc(err.message)}</p></div>`;
  });
  return renderChain;
}

/* ============================================================
   HOME - active participant, other participants, daily records
   ============================================================ */
async function viewHome(root) {
  const p = State.profile;
  const recs = State.records;                 // already newest-first
  const me = State.summaries[State.activeId] || { logged: 0, points: 0, consistency: 0, day: 1, photos: 0 };
  const pct = Math.min(100, Math.round((me.logged / TOTAL_DAYS) * 100));

  const setup = !p.name ? `
    <div class="card" style="border-left:5px solid var(--yellow)">
      <div class="card-title">👋 Welcome — set up your tracker</div>
      <p class="muted">Add your name, club, coach, goal and the day you started so every export carries your details.</p>
      <button class="btn btn-primary btn-block" data-go="profile">Set up profile &amp; goal</button>
    </div>` : '';

  /* ----- other participant cards ----- */
  const others = State.participants.filter(x => x.id !== State.activeId);
  const card = (x) => {
    const s = State.summaries[x.id] || { logged: 0, points: 0, consistency: 0, day: 1 };
    const ava = s.avatar
      ? `<img src="${Photos.url(s.avatar.id, s.avatar.blob)}" alt="" />`
      : esc(initials(x.name));
    return `<div class="person" data-person="${x.id}">
      <div class="person-top">
        <div class="person-ava">${ava}</div>
        <div style="min-width:0">
          <div class="person-name">${esc(x.name || 'Unnamed')}</div>
          <div class="person-goal">${esc(goalShort(x.goal) || 'No goal set')}</div>
        </div>
      </div>
      <div class="person-meta"><span>Day ${s.day}/${TOTAL_DAYS}</span><span>${s.points} pts</span></div>
      <div class="bar"><i style="width:${Math.min(100, Math.round((s.logged / TOTAL_DAYS) * 100))}%"></i></div>
      <div class="person-meta" style="margin-top:.3rem">
        <span>${s.logged} logged</span><span class="person-badge">${s.consistency}%</span>
      </div>
    </div>`;
  };
  const people = `
    <div class="people-head">
      <h3>${others.length ? 'Other participants' : 'Participants'}</h3>
      <button class="btn btn-ghost btn-sm" data-go="participants">Manage</button>
    </div>
    <div class="people">
      ${others.map(card).join('')}
      <div class="person-add" id="addPerson"><span class="plus">＋</span>Add participant</div>
    </div>`;

  /* ----- records ----- */
  const list = recs.length ? recs.map(r => {
    const s = scoreOf(r);
    const dn = dayNumber(r.date);
    const poses = State.photoIndex[r.date] || {};
    const thumbs = Photos.POSES.filter(p2 => poses[p2.key]).map(p2 =>
      `<img src="${Photos.url(State.activeId + '|' + r.date + '|' + p2.key, poses[p2.key])}" alt="${p2.label}" />`).join('');
    return `<div class="rec" data-date="${r.date}">
      <div class="rec-day"><b>${dn > 0 && dn <= 999 ? dn : '–'}</b><small>DAY</small></div>
      <div class="rec-main">
        <div class="d">${esc(prettyDate(r.date))}</div>
        <div class="s">${s}/5 habits${r.weight ? ' · ' + esc(r.weight) + ' kg' : ''}${r.activity.points !== '' ? ' · ' + esc(r.activity.points) + '/10 activity' : ''}</div>
        <div class="chips">
          ${HABITS.map(h => `<span class="chip${r.habits[h.key] ? ' on' : ''}">${h.emoji} ${h.label}</span>`).join('')}
          ${r.detox === 'yes' ? '<span class="chip on">🌿 DETOX</span>' : ''}
        </div>
      </div>
      <div class="rec-right">
        <span class="score-pill">${s}/5</span>
        <div class="rec-thumbs">${thumbs}</div>
      </div>
    </div>`;
  }).join('') : `<div class="empty"><span class="big">📝</span>No daily records yet.<br>Tap <b>＋</b> below to record today.</div>`;

  root.innerHTML = `
    ${setup}
    <div class="hero">
      <h2>${esc(p.name || 'My Transformation')}</h2>
      <div class="sub">${p.goal ? esc((GOALS.find(g => g.k === p.goal) || {}).label) : 'No goal selected'}
        ${p.coach ? ' · ' + (/^coach/i.test(p.coach) ? esc(p.coach) : 'Coach ' + esc(p.coach)) : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="hero-foot"><span>Day ${me.day} of ${TOTAL_DAYS}</span><span>${me.logged} days logged · ${me.points}/205 pts</span></div>
    </div>
    <div class="stats">
      <div class="stat"><b>${me.logged}</b><small>Days logged</small></div>
      <div class="stat"><b>${me.points}</b><small>Points</small></div>
      <div class="stat"><b>${me.consistency}%</b><small>Consistency</small></div>
      <div class="stat"><b>${me.photos}</b><small>Photos</small></div>
    </div>
    <div class="row" style="margin:.2rem 0 .8rem">
      <button class="btn btn-primary" data-go="entry/${todayISO()}" style="flex:1">＋ Today's record</button>
      <button class="btn btn-ghost" data-go="weekly" style="flex:1">📊 Weekly</button>
      <button class="btn btn-ghost" data-go="export" style="flex:1">⤓ Export</button>
    </div>
    ${people}
    <h3 style="font-size:.9rem;color:var(--green-800);margin:.9rem 0 .4rem">Daily records (latest first)</h3>
    ${list}`;

  $$('.rec', root).forEach(el => el.addEventListener('click', () => go('entry/' + el.dataset.date)));
  $$('.person', root).forEach(el => el.addEventListener('click', () => switchParticipant(el.dataset.person)));
  $('#addPerson', root).addEventListener('click', () => go('profile/new'));
}

/* ============================================================
   PARTICIPANTS - switch, edit, add, remove
   ============================================================ */
async function viewParticipants(root) {
  const rows = State.participants.map(x => {
    const s = State.summaries[x.id] || { logged: 0, points: 0, day: 1 };
    const ava = s.avatar ? `<img src="${Photos.url(s.avatar.id, s.avatar.blob)}" alt="" />` : esc(initials(x.name));
    const active = x.id === State.activeId;
    return `<div class="prow" data-id="${x.id}">
      <div class="person-ava">${ava}</div>
      <div class="prow-main">
        <b>${esc(x.name || 'Unnamed')} ${active ? '<span class="person-badge">· ACTIVE</span>' : ''}</b>
        <small>${esc(goalShort(x.goal) || 'No goal')} · Day ${s.day}/${TOTAL_DAYS} · ${s.logged} logged · ${s.points} pts</small>
      </div>
      ${active
        ? '<button class="btn btn-ghost btn-sm" data-edit="1">Edit</button>'
        : '<button class="btn btn-primary btn-sm" data-switch="1">Open</button>'}
      <button class="btn btn-danger btn-sm" data-del="1" ${State.participants.length < 2 ? 'disabled' : ''}>🗑</button>
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="card">
      <div class="card-title">👥 Participants</div>
      <p class="muted">Everyone tracked on this device. Open a participant to make their records the active ones.</p>
      ${rows}
      <button class="btn btn-primary btn-block" style="margin-top:.8rem" data-go="profile/new">＋ Add participant</button>
    </div>
    <div class="row" style="margin-bottom:2rem"><button class="btn btn-ghost btn-block" data-go="home">Back</button></div>`;

  $$('.prow', root).forEach(row => {
    const id = row.dataset.id;
    const sw = $('[data-switch]', row); if (sw) sw.onclick = () => switchParticipant(id);
    const ed = $('[data-edit]', row); if (ed) ed.onclick = () => go('profile');
    const del = $('[data-del]', row);
    if (del) del.onclick = async () => {
      const who = (State.participants.find(x => x.id === id) || {}).name || 'this participant';
      if (!confirm(`Delete ${who} with all their records and photos? This cannot be undone.`)) return;
      await DB.deleteParticipant(id);
      if (id === State.activeId) await DB.setMeta('activeParticipant', null);
      await loadState();
      toast('Participant deleted');
      go('participants');
    };
  });
}

/* ============================================================
   ENTRY - one day's record (mirrors both printed sheets)
   ============================================================ */
async function viewEntry(root, arg) {
  const pid = State.activeId;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? arg : todayISO();
  const rec = normalise(await DB.getRecord(pid, date), date);
  const dn = dayNumber(date);

  const seg = (name, val, options) => `
    <span class="seg" data-seg="${name}">
      ${options.map(o => `<button type="button" data-val="${o.v}" class="${val === o.v ? 'on' : ''}">${o.t}</button>`).join('')}
    </span>`;

  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">📅 ${esc(State.profile.name || 'Daily record')}</div>
        <span class="score-pill" id="scorePill">${scoreOf(rec)}/5</span>
      </div>
      <div class="grid-2">
        <div class="field"><label>Date</label><input type="date" id="fDate" value="${date}" max="${todayISO()}" /></div>
        <div class="field"><label>Day number</label><input type="text" value="${dn > 0 ? 'Day ' + dn + ' of ' + TOTAL_DAYS : 'Before start date'}" disabled /></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><span class="section-num">1</span> Daily habit tracker</div>
        <span class="muted">Tick ✓ if done</span>
      </div>
      <div class="habits" id="habits">
        ${HABITS.map(h => `
          <div class="habit${rec.habits[h.key] ? ' on' : ''}" data-habit="${h.key}">
            <span class="emoji">${h.emoji}</span>
            <span class="txt"><b>${h.label}</b><small>${h.sub}</small></span>
            <span class="tick">${rec.habits[h.key] ? '✓' : '✗'}</span>
          </div>`).join('')}
      </div>
      <div class="grid-2" style="margin-top:.7rem">
        <div class="field"><label>Weight (kg)</label><input type="number" step="0.1" inputmode="decimal" id="fWeight" value="${esc(rec.weight)}" placeholder="e.g. 78.5" /></div>
        <div class="field"><label>Inches lost (inch)</label><input type="number" step="0.1" inputmode="decimal" id="fInches" value="${esc(rec.inches)}" placeholder="e.g. 1.5" /></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="section-num">2</span> Daily activity / दैनिक गतिविधि</div>
      <div class="field"><label>Activity (गतिविधि)</label><input type="text" id="fActName" value="${esc(rec.activity.name)}" placeholder="Walk, gym, yoga…" /></div>
      <div class="grid-3">
        <div class="field"><label>% score</label><input type="number" min="0" max="100" inputmode="numeric" id="fActPct" value="${esc(rec.activity.percent)}" placeholder="0-100" /></div>
        <div class="field"><label>Points (out of 10)</label><input type="number" min="0" max="10" inputmode="numeric" id="fActPts" value="${esc(rec.activity.points)}" placeholder="0-10" /></div>
        <div class="field"><label>Fuel added (which?)</label><input type="text" id="fActFuel" value="${esc(rec.activity.fuelAdded)}" placeholder="Name" /></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="section-num">3</span> Recipe tracker / रेसिपी ट्रैकर</div>
      <div class="field"><label>🥤 Healthy fuel recipe tried</label><input type="text" id="fRecHealthy" value="${esc(rec.recipes.healthy.tried)}" placeholder="Recipe name" /></div>
      <div class="inline"><span class="lbl">Posted in group? (ग्रुप में पोस्ट की)</span>${seg('healthyPosted', rec.recipes.healthy.posted, [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }])}</div>
      <div class="field" style="margin-top:.6rem"><label>🍡 Dyno fuel laddu recipe tried</label><input type="text" id="fRecLaddu" value="${esc(rec.recipes.laddu.tried)}" placeholder="Recipe name" /></div>
      <div class="inline"><span class="lbl">Posted in group? (ग्रुप में पोस्ट की)</span>${seg('ladduPosted', rec.recipes.laddu.posted, [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }])}</div>
    </div>

    <div class="card">
      <div class="card-title"><span class="section-num">4</span> Fuel program / फ्यूल प्रोग्राम</div>
      <div class="goal-list" id="programs">
        ${PROGRAMS.map(pr => `
          <label><input type="radio" name="program" value="${pr.k}" ${rec.fuelProgram.selected === pr.k ? 'checked' : ''} />
          <span><b>${pr.label}</b><br><small class="muted">${pr.hi}</small></span></label>`).join('')}
      </div>
      <h4 style="font-size:.8rem;color:var(--green-800);margin:.8rem 0 .4rem">➕ Additional fuel added (अतिरिक्त फ्यूल)</h4>
      <div id="extras">
        ${rec.fuelProgram.extras.map((x, i) => `
          <div class="fuel-row" data-i="${i}">
            <span class="n">${i + 1}</span>
            <input type="text" class="exName" value="${esc(x.name)}" placeholder="Fuel name / फ्यूल का नाम" />
            ${seg('extra' + i, x.added, [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }])}
          </div>`).join('')}
      </div>
      <div class="inline" style="margin-top:.6rem">
        <span class="lbl"><b>🌿 Completed the 2-day detox?</b><br><small class="muted">2 दिन का डिटॉक्स डे</small></span>
        ${seg('detox', rec.detox, [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }])}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title"><span class="section-num">5</span> Progress photos</div>
        <span class="muted">Tap a tile to use the camera</span>
      </div>
      <div class="photo-grid" id="photoGrid"></div>
      <p class="muted" style="margin-top:.5rem">Front, right-facing and back-side full body shots. Use the same spot, light and outfit every time for a clean before/after.</p>
      <div class="photo-actions">
        <button class="btn btn-ghost btn-sm" id="uploadFront">🖼 Upload front</button>
        <button class="btn btn-ghost btn-sm" id="uploadRight">🖼 Upload right</button>
        <button class="btn btn-ghost btn-sm" id="uploadBack">🖼 Upload back</button>
      </div>
    </div>

    <div class="card">
      <div class="field"><label>Notes</label><textarea id="fNotes" placeholder="How did the day go?">${esc(rec.notes)}</textarea></div>
    </div>

    <div class="row" style="margin-bottom:2rem">
      <button class="btn btn-primary" id="saveBtn" style="flex:2">💾 Save record</button>
      <button class="btn btn-ghost" data-go="home" style="flex:1">Cancel</button>
      <button class="btn btn-danger" id="delBtn" style="flex:1">Delete</button>
    </div>`;

  /* ----- habits ----- */
  $$('.habit', root).forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.habit;
    rec.habits[k] = !rec.habits[k];
    el.classList.toggle('on', rec.habits[k]);
    $('.tick', el).textContent = rec.habits[k] ? '✓' : '✗';
    $('#scorePill').textContent = scoreOf(rec) + '/5';
  }));

  /* ----- yes / no segments ----- */
  $$('[data-seg]', root).forEach(segEl => {
    segEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      const name = segEl.dataset.seg;
      const val = b.classList.contains('on') ? null : b.dataset.val;   // tap again to clear
      $$('button', segEl).forEach(x => x.classList.toggle('on', x.dataset.val === val));
      if (name === 'healthyPosted') rec.recipes.healthy.posted = val;
      else if (name === 'ladduPosted') rec.recipes.laddu.posted = val;
      else if (name === 'detox') rec.detox = val;
      else if (name.startsWith('extra')) rec.fuelProgram.extras[+name.slice(5)].added = val;
    });
  });

  $$('input[name="program"]', root).forEach(r =>
    r.addEventListener('change', () => { rec.fuelProgram.selected = r.value; }));

  /* ----- photos ----- */
  async function paintPhotos() {
    const map = (await DB.photosForDate(pid, date)).reduce((o, p) => (o[p.pose] = p.blob, o), {});
    $('#photoGrid').innerHTML = Photos.POSES.map(p => {
      const blob = map[p.key];
      const src = blob ? Photos.url(pid + '|' + date + '|' + p.key + '|' + blob.size, blob) : '';
      return `<div class="photo-slot" data-pose="${p.key}">
        ${blob ? `<img src="${src}" alt="${p.label}" />` : `<span class="ph-icon">${p.emoji}</span>`}
        <span class="ph-label">${blob ? '' : p.label}</span>
        <span class="tag">${p.label.toUpperCase()}</span>
      </div>`;
    }).join('');
    $$('.photo-slot', root).forEach(slot => slot.addEventListener('click', async () => {
      const pose = slot.dataset.pose;
      const existing = await DB.getPhoto(pid, date, pose);
      if (existing) return openPhoto(pid, date, pose, existing.blob, paintPhotos);
      await grabPhoto(pid, date, pose, 'camera', paintPhotos);
    }));
  }
  await paintPhotos();

  const upload = (pose) => grabPhoto(pid, date, pose, 'file', paintPhotos);
  $('#uploadFront').onclick = () => upload('front');
  $('#uploadRight').onclick = () => upload('right');
  $('#uploadBack').onclick  = () => upload('back');

  /* ----- collect + save ----- */
  function collect() {
    rec.weight = $('#fWeight').value;
    rec.inches = $('#fInches').value;
    rec.activity.name = $('#fActName').value.trim();
    rec.activity.percent = $('#fActPct').value;
    rec.activity.points = $('#fActPts').value;
    rec.activity.fuelAdded = $('#fActFuel').value.trim();
    rec.recipes.healthy.tried = $('#fRecHealthy').value.trim();
    rec.recipes.laddu.tried = $('#fRecLaddu').value.trim();
    $$('#extras .fuel-row').forEach(row => {
      rec.fuelProgram.extras[+row.dataset.i].name = $('.exName', row).value.trim();
    });
    rec.notes = $('#fNotes').value;
    rec.updatedAt = Date.now();
    return rec;
  }
  entrySave = async () => { await DB.putRecord(pid, collect()); await loadState(); };   // used by photo capture

  $('#saveBtn').onclick = async () => {
    await DB.putRecord(pid, collect());
    await loadState();
    toast('Record saved for ' + prettyDate(date));
    go('home');
  };
  $('#delBtn').onclick = async () => {
    if (!confirm('Delete the record for ' + prettyDate(date) + '? Photos for this day are also removed.')) return;
    await DB.deleteRecord(pid, date);
    for (const p of Photos.POSES) await DB.deletePhoto(pid, date, p.key);
    await loadState();
    toast('Record deleted');
    go('home');
  };
  $('#fDate').onchange = async (e) => {
    await DB.putRecord(pid, collect());
    await loadState();
    go('entry/' + e.target.value);
  };
}

let entrySave = null;   // set while the entry view is open

/* capture or upload a photo for a participant + day + pose */
async function grabPhoto(pid, date, pose, how, done) {
  try {
    let blob = null;
    if (how === 'camera') {
      blob = await Photos.capture(pose);
    } else {
      const f = await Photos.pickFile();
      if (f) blob = await Photos.compress(f);
    }
    if (!blob) return;
    await DB.putPhoto(pid, date, pose, blob);
    if (entrySave) await entrySave();              // make sure the day exists in the list
    else { await DB.putRecord(pid, normalise(await DB.getRecord(pid, date), date)); await loadState(); }
    toast(Photos.poseLabel(pose) + ' photo saved');
    if (done) await done();
  } catch (err) {
    console.error(err);
    toast('Could not save photo: ' + err.message);
  }
}

/* full-screen photo viewer with delete */
function openPhoto(pid, date, pose, blob, after) {
  const m = $('#photoModal');
  $('#photoTitle').textContent = `${Photos.poseLabel(pose)} · ${prettyDate(date)}`;
  $('#photoBig').src = URL.createObjectURL(blob);
  m.hidden = false;
  const close = () => {
    m.hidden = true;
    URL.revokeObjectURL($('#photoBig').src);
    $('#photoDelete').onclick = null;
  };
  m.querySelectorAll('[data-close-photo]').forEach(b => b.onclick = close);
  $('#photoDelete').onclick = async () => {
    if (!confirm('Delete this photo?')) return;
    await DB.deletePhoto(pid, date, pose);
    Photos.dropUrl(pid + '|' + date + '|' + pose);
    await loadState();
    close();
    toast('Photo deleted');
    if (after) await after();
  };
}

/* ============================================================
   PROFILE - edit the active participant, or add a new one
   ============================================================ */
async function viewProfile(root, arg) {
  const isNew = arg === 'new';
  const p = isNew ? newParticipant('') : State.profile;

  root.innerHTML = `
    <div class="card">
      <div class="card-title">${isNew ? '👥 Add participant' : '👤 Profile'}</div>
      <div class="field"><label>Name (full name)</label><input id="pName" value="${esc(p.name)}" placeholder="Full name" /></div>
      <div class="grid-2">
        <div class="field"><label>Club number</label><input id="pClub" value="${esc(p.clubNumber)}" placeholder="e.g. 1024" /></div>
        <div class="field"><label>Club operator name</label><input id="pOp" value="${esc(p.clubOperator)}" placeholder="Operator" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Coach name</label><input id="pCoach" value="${esc(p.coach)}" placeholder="Coach" /></div>
        <div class="field"><label>Season</label><input id="pSeason" value="${esc(p.season || '1')}" /></div>
      </div>
      <div class="field"><label>Start date (Day 1)</label><input type="date" id="pStart" value="${p.startDate}" /></div>
    </div>
    <div class="card">
      <div class="card-title">🎯 ${isNew ? 'Their goal' : 'My goal'} (select one)</div>
      <div class="goal-list">
        ${GOALS.map(g => `<label><input type="radio" name="goal" value="${g.k}" ${p.goal === g.k ? 'checked' : ''} /> ${g.label}</label>`).join('')}
      </div>
    </div>
    <div class="row" style="margin-bottom:2rem">
      <button class="btn btn-primary" id="pSave" style="flex:2">${isNew ? '＋ Add participant' : '💾 Save profile'}</button>
      <button class="btn btn-ghost" data-go="${isNew ? 'participants' : 'home'}" style="flex:1">Cancel</button>
    </div>`;

  $('#pSave').onclick = async () => {
    const data = {
      name: $('#pName').value.trim(),
      clubNumber: $('#pClub').value.trim(),
      clubOperator: $('#pOp').value.trim(),
      coach: $('#pCoach').value.trim(),
      season: $('#pSeason').value.trim() || '1',
      startDate: $('#pStart').value || todayISO(),
      goal: (document.querySelector('input[name="goal"]:checked') || {}).value || ''
    };
    if (isNew && !data.name) return toast('Please enter a name first');
    Object.assign(p, data);
    await DB.putParticipant(p);
    if (isNew) await DB.setMeta('activeParticipant', p.id);
    await loadState();
    toast(isNew ? `${p.name} added` : 'Profile saved');
    go('home');
  };
}

/* ============================================================
   WEEKLY PROGRESS + FINAL RESULTS (per participant)
   ============================================================ */
async function viewWeekly(root) {
  const weeklyData = State.profile.weekly || {};
  const finalData = State.profile.final || {};
  const recByDate = {};
  State.records.forEach(r => recByDate[r.date] = r);

  const weekStats = (w) => {
    let pts = 0, logged = 0;
    for (let d = w.from; d <= w.to; d++) {
      const date = addDays(State.profile.startDate, d - 1);
      const r = recByDate[date];
      if (r) { logged++; pts += scoreOf(r); }
    }
    return { pts, logged, max: (w.to - w.from + 1) * 5 };
  };
  const totalPts = State.records.reduce((s, r) => s + scoreOf(r), 0);

  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">📊 Weekly progress check</div>
        <span class="muted">${esc(State.profile.name || '')}</span>
      </div>
      <p class="muted">Points are calculated from your daily habit ticks. Add weight, inches and how the week felt.</p>
      <div class="week-grid">
        ${WEEKS.map(w => {
          const st = weekStats(w);
          const d = weeklyData[w.n] || {};
          return `<div class="week" data-week="${w.n}">
            <h4>Week ${w.n} (Day ${w.from}–${w.to})</h4>
            <div class="muted" style="margin-bottom:.4rem">${st.pts}/${st.max} points · ${st.logged} days logged</div>
            <div class="grid-2">
              <div class="field"><label>Weight (kg)</label><input type="number" step="0.1" class="wWeight" value="${esc(d.weight)}" /></div>
              <div class="field"><label>Inches lost</label><input type="number" step="0.1" class="wInches" value="${esc(d.inches)}" /></div>
            </div>
            <div class="feel">
              ${[['poor', '🙁', 'POOR'], ['okay', '😐', 'OKAY'], ['great', '🙂', 'GREAT']].map(([v, e, t]) =>
                `<label><input type="radio" name="feel${w.n}" value="${v}" ${d.feel === v ? 'checked' : ''} /><span>${e}</span>${t}</label>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">🏁 Final results (Day 41)</div>
      <div class="grid-2">
        <div class="field"><label>Final weight (kg)</label><input type="number" step="0.1" id="fnWeight" value="${esc(finalData.weight)}" /></div>
        <div class="field"><label>Total inches lost</label><input type="number" step="0.1" id="fnInches" value="${esc(finalData.inches)}" /></div>
      </div>
      <div class="field"><label>Total points / consistency</label>
        <input id="fnPoints" value="${esc(finalData.points || (totalPts + '/205'))}" /></div>
      <div class="grid-2">
        <div class="field"><label>Signature</label><input id="fnSign" value="${esc(finalData.signature)}" placeholder="Your name" /></div>
        <div class="field"><label>Date</label><input type="date" id="fnDate" value="${esc(finalData.date || '')}" /></div>
      </div>
      <label class="checkline"><input type="checkbox" id="fnCommit" ${finalData.committed ? 'checked' : ''} />
        I stayed committed for 41 days! 💪</label>
    </div>

    <div class="row" style="margin-bottom:2rem">
      <button class="btn btn-primary" id="wSave" style="flex:2">💾 Save</button>
      <button class="btn btn-ghost" data-go="home" style="flex:1">Back</button>
    </div>`;

  $('#wSave').onclick = async () => {
    const weekly = {};
    $$('.week', root).forEach(el => {
      const n = el.dataset.week;
      weekly[n] = {
        weight: $('.wWeight', el).value,
        inches: $('.wInches', el).value,
        feel: (el.querySelector(`input[name="feel${n}"]:checked`) || {}).value || ''
      };
    });
    State.profile.weekly = weekly;
    State.profile.final = {
      weight: $('#fnWeight').value, inches: $('#fnInches').value, points: $('#fnPoints').value,
      signature: $('#fnSign').value, date: $('#fnDate').value, committed: $('#fnCommit').checked
    };
    await saveProfile();
    await loadState();
    toast('Weekly progress saved');
    go('home');
  };
}

/* ============================================================
   EXPORT - participant, date range, sheets, before/after photos
   ============================================================ */
async function viewExport(root) {
  let pid = State.activeId;
  let before = null, after = null;

  root.innerHTML = `
    <div class="card">
      <div class="card-title">⤓ Export the tracker</div>
      <p class="muted">Pick the participant and a date range, choose the sheets, attach a before/after pair, then print or save as PDF.</p>
      <div class="field"><label>Participant</label>
        <select id="xWho">
          ${State.participants.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name || 'Unnamed')}</option>`).join('')}
        </select>
      </div>
      <div class="preset-row" id="presets">
        <button class="preset" data-preset="all">All records</button>
        <button class="preset" data-preset="7">Last 7 days</button>
        <button class="preset" data-preset="41">Full 41 days</button>
        ${WEEKS.map(w => `<button class="preset" data-preset="w${w.n}">Week ${w.n}</button>`).join('')}
      </div>
      <div class="grid-2">
        <div class="field"><label>From</label><input type="date" id="xFrom" /></div>
        <div class="field"><label>To</label><input type="date" id="xTo" /></div>
      </div>
      <label class="checkline"><input type="checkbox" id="optHabits" checked /> Sheet 1 — 41 Days habit tracker, weekly check &amp; final results</label>
      <label class="checkline"><input type="checkbox" id="optActivity" checked /> Sheet 2 — Activity tracker, recipes, fuel program &amp; detox</label>
      <label class="checkline"><input type="checkbox" id="optPhotos" checked /> Sheet 3 — Progress photos</label>
    </div>

    <div class="card">
      <div class="card-title">🖼 Before photo</div>
      <p class="muted">Tap to select (tap again to clear). Usually the first photo.</p>
      <div class="pick-grid" id="beforeGrid"></div>
    </div>
    <div class="card">
      <div class="card-title">🖼 After photo</div>
      <p class="muted">Usually the latest photo in the same pose.</p>
      <div class="pick-grid" id="afterGrid"></div>
    </div>

    <div class="card">
      <div class="card-title">Output</div>
      <div class="row">
        <button class="btn btn-primary" id="xPrint" style="flex:1">🖨 Print / Save as PDF</button>
        <button class="btn btn-ghost" id="xHtml" style="flex:1">⤓ Download HTML</button>
      </div>
      <div class="row" style="margin-top:.5rem">
        <button class="btn btn-ghost" id="xCsv" style="flex:1">⤓ Download CSV</button>
        <button class="btn btn-ghost" id="xShare" style="flex:1">📤 Share</button>
      </div>
      <p class="muted" id="xInfo" style="margin-top:.6rem"></p>
    </div>
    <div class="row" style="margin-bottom:2rem"><button class="btn btn-ghost btn-block" data-go="home">Back</button></div>`;

  let photos = [], recDates = [];

  async function loadFor(newPid) {
    pid = newPid;
    before = after = null;
    photos = await DB.photosFor(pid);
    const recs = await DB.recordsFor(pid);
    recDates = recs.map(r => r.date).sort();
    $('#xFrom').value = recDates[0] || todayISO();
    $('#xTo').value = recDates[recDates.length - 1] || todayISO();

    const tiles = (which) => photos.length ? photos.map(p => `
      <div class="pick" data-which="${which}" data-id="${p.id}">
        <img src="${Photos.url(p.id + '|' + p.blob.size, p.blob)}" alt="" />
        <div class="cap">${p.date.slice(5)} · ${Photos.poseLabel(p.pose).split(' ')[0]}</div>
      </div>`).join('') : '<p class="muted">No photos for this participant yet.</p>';
    $('#beforeGrid').innerHTML = tiles('before');
    $('#afterGrid').innerHTML = tiles('after');

    $$('.pick', root).forEach(el => el.addEventListener('click', () => {
      const which = el.dataset.which;
      const same = (which === 'before' ? before : after) === el.dataset.id;
      $$(`.pick[data-which="${which}"]`, root).forEach(x => x.classList.remove('on'));
      const val = same ? null : el.dataset.id;
      if (!same) el.classList.add('on');
      if (which === 'before') before = val; else after = val;
    }));
    updateInfo();
  }

  function updateInfo() {
    const from = $('#xFrom').value, to = $('#xTo').value;
    const n = recDates.filter(d => d >= from && d <= to).length;
    const ph = photos.filter(p => p.date >= from && p.date <= to).length;
    $('#xInfo').textContent = `${n} daily record${n === 1 ? '' : 's'} and ${ph} photo${ph === 1 ? '' : 's'} in the selected range.`;
  }

  $('#xWho').onchange = (e) => loadFor(e.target.value);
  $('#xFrom').onchange = updateInfo;
  $('#xTo').onchange = updateInfo;

  const setRange = (f, t) => { $('#xFrom').value = f; $('#xTo').value = t; updateInfo(); };
  $$('#presets .preset', root).forEach(b => b.addEventListener('click', () => {
    $$('#presets .preset', root).forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    const who = State.participants.find(p => p.id === pid) || State.profile;
    const pr = b.dataset.preset, start = who.startDate;
    if (pr === 'all') setRange(recDates[0] || todayISO(), recDates[recDates.length - 1] || todayISO());
    else if (pr === '7') setRange(addDays(todayISO(), -6), todayISO());
    else if (pr === '41') setRange(start, addDays(start, TOTAL_DAYS - 1));
    else {
      const w = WEEKS[+pr.slice(1) - 1];
      setRange(addDays(start, w.from - 1), addDays(start, w.to - 1));
    }
  }));

  await loadFor(pid);

  const gather = () => buildExportData({
    pid, from: $('#xFrom').value, to: $('#xTo').value,
    options: { habits: $('#optHabits').checked, activity: $('#optActivity').checked, photos: $('#optPhotos').checked },
    beforeId: before, afterId: after
  });

  $('#xPrint').onclick = async () => {
    toast('Preparing the sheets…');
    const data = await gather();
    printHTML(Exporter.buildHTML(data));
  };
  $('#xHtml').onclick = async () => {
    const data = await gather();
    download(fileName(data, 'html'), Exporter.buildHTML(data), 'text/html');
    toast('HTML export downloaded');
  };
  $('#xCsv').onclick = async () => {
    const data = await gather();
    download(fileName(data, 'csv'), Exporter.buildCSV(data), 'text/csv');
    toast('CSV downloaded');
  };
  $('#xShare').onclick = async () => {
    const data = await gather();
    const file = new File([Exporter.buildHTML(data)], fileName(data, 'html'), { type: 'text/html' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'BTC Transformation Tracker' }); }
      catch (e) { /* user cancelled */ }
    } else {
      download(file.name, file, 'text/html');
      toast('Sharing not supported here — file downloaded instead');
    }
  };
}

function fileName(data, ext) {
  const who = (data.profile.name || 'btc').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${who}-tracker-${data.range.from}_to_${data.range.to}.${ext}`;
}

/* assemble everything the export document needs */
async function buildExportData({ pid, from, to, options, beforeId, afterId }) {
  pid = pid || State.activeId;
  const profile = State.participants.find(p => p.id === pid) || State.profile;
  const start = profile.startDate;
  const recs = (await DB.recordsFor(pid)).map(r => normalise(r, r.date))
    .filter(r => r.date >= from && r.date <= to);
  const byDate = {}; recs.forEach(r => byDate[r.date] = r);

  /* one column per calendar day in range; very long ranges collapse to logged days only */
  const span = daysBetween(from, to) + 1;
  let dateList;
  if (span > 0 && span <= 45) {
    dateList = Array.from({ length: span }, (_, i) => addDays(from, i));
  } else {
    dateList = Object.keys(byDate).sort();
  }
  const days = dateList.map(d => ({ date: d, day: daysBetween(start, d) + 1, record: byDate[d] || null }));

  /* photos in range, as data URLs */
  const all = await DB.photosFor(pid);
  const inRange = all.filter(p => p.date >= from && p.date <= to)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const photos = options.photos ? await Promise.all(inRange.map(async p => ({
    date: p.date, pose: p.pose, poseLabel: Photos.poseLabel(p.pose),
    day: daysBetween(start, p.date) + 1,
    dataURL: await Photos.blobToDataURL(p.blob)
  }))) : [];

  const findPhoto = async (id) => {
    if (!id) return null;
    const p = all.find(x => x.id === id);
    if (!p) return null;
    return { date: p.date, pose: p.pose, poseLabel: Photos.poseLabel(p.pose), dataURL: await Photos.blobToDataURL(p.blob) };
  };
  const before = await findPhoto(beforeId);
  const after = await findPhoto(afterId);

  /* recipes / fuel program / detox: latest non-empty answer inside the range */
  const latestExtras = {
    recipes: { healthy: { tried: '', posted: null }, laddu: { tried: '', posted: null } },
    fuelProgram: { selected: '', extras: Array.from({ length: 5 }, () => ({ name: '', added: null })) },
    detox: null
  };
  [...recs].sort((a, b) => a.date < b.date ? -1 : 1).forEach(r => {
    if (r.recipes.healthy.tried || r.recipes.healthy.posted) latestExtras.recipes.healthy = r.recipes.healthy;
    if (r.recipes.laddu.tried || r.recipes.laddu.posted) latestExtras.recipes.laddu = r.recipes.laddu;
    if (r.fuelProgram.selected) latestExtras.fuelProgram.selected = r.fuelProgram.selected;
    r.fuelProgram.extras.forEach((x, i) => { if (x.name || x.added) latestExtras.fuelProgram.extras[i] = x; });
    if (r.detox) latestExtras.detox = r.detox;
  });

  const points = recs.reduce((s, r) => s + scoreOf(r), 0);
  const activityPoints = recs.reduce((s, r) => s + (parseFloat(r.activity.points) || 0), 0);
  const totals = {
    points, logged: recs.length, activityPoints,
    consistency: Math.round((points / Math.max(1, days.length * 5)) * 100)
  };

  /* photo poses per day, for the CSV */
  const posesByDate = {};
  all.forEach(p => (posesByDate[p.date] = posesByDate[p.date] || []).push(p.pose));
  days.forEach(d => d.photoPoses = posesByDate[d.date] || []);

  return {
    profile, habits: HABITS, days, photos, before, after,
    weeks: WEEKS.map(w => ({ ...w, ...((profile.weekly || {})[w.n] || {}) })),
    final: profile.final || {}, totals, latestExtras,
    range: { from, to }, options
  };
}

/* print through a hidden iframe - no popup blockers, works on mobile */
function printHTML(html) {
  const old = $('#printFrame'); if (old) old.remove();
  const f = document.createElement('iframe');
  f.id = 'printFrame';
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(f);
  const d = f.contentWindow.document;
  d.open(); d.write(html); d.close();

  const waitForImages = () => {
    const imgs = Array.from(d.images || []);
    return Promise.all(imgs.map(img => img.complete ? Promise.resolve()
      : new Promise(res => { img.onload = img.onerror = res; })));
  };
  setTimeout(async () => {
    await waitForImages();
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
    } catch (e) {
      const blob = new Blob([html], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
    }
    setTimeout(() => f.remove(), 120000);
  }, 350);
}

/* ============================================================
   BACKUP / RESTORE (all participants)
   ============================================================ */
async function viewBackup(root) {
  root.innerHTML = `
    <div class="card">
      <div class="card-title">💾 Backup &amp; restore</div>
      <p class="muted">Everything lives on this device only. Export a backup file before changing phone or clearing browser data.
        The backup holds every participant, their records and photos.</p>
      <div class="row">
        <button class="btn btn-primary" id="bExport" style="flex:1">⤓ Download backup (.json)</button>
        <button class="btn btn-ghost" id="bImport" style="flex:1">⤒ Restore from file</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">⚠️ Danger zone</div>
      <button class="btn btn-danger btn-block" id="bClear">Delete all participants, records and photos</button>
    </div>
    <div class="row" style="margin-bottom:2rem"><button class="btn btn-ghost btn-block" data-go="home">Back</button></div>`;

  $('#bExport').onclick = async () => {
    toast('Building backup…');
    const participants = await DB.listParticipants();
    const records = [], photos = [];
    for (const p of participants) {
      (await DB.recordsFor(p.id)).forEach(r => records.push(r));
      for (const ph of await DB.photosFor(p.id)) {
        photos.push({ pid: ph.pid, date: ph.date, pose: ph.pose, dataURL: await Photos.blobToDataURL(ph.blob) });
      }
    }
    const payload = {
      app: 'btc-transformation-tracker', version: 2, exportedAt: new Date().toISOString(),
      activeParticipant: State.activeId, participants, records, photos
    };
    download(`btc-tracker-backup-${todayISO()}.json`, JSON.stringify(payload), 'application/json');
    toast('Backup downloaded');
  };

  $('#bImport').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== 'btc-transformation-tracker') throw new Error('Not a tracker backup file');
        if (!confirm('Restore this backup? Existing data for the same participants and dates will be overwritten.')) return;

        if (data.version >= 2) {
          for (const p of (data.participants || [])) await DB.putParticipant(p);
          for (const r of (data.records || [])) await DB.putRecord(r.pid, r);
          for (const ph of (data.photos || [])) await DB.putPhoto(ph.pid, ph.date, ph.pose, Photos.dataURLToBlob(ph.dataURL));
          if (data.activeParticipant) await DB.setMeta('activeParticipant', data.activeParticipant);
        } else {
          /* a v1 backup holds a single profile */
          const p = { ...newParticipant((data.profile || {}).name || 'Restored'), ...(data.profile || {}),
                      weekly: data.weekly || {}, final: data.final || {} };
          p.id = p.id && String(p.id).startsWith('p') ? p.id : newParticipant('').id;
          await DB.putParticipant(p);
          for (const r of (data.records || [])) await DB.putRecord(p.id, r);
          for (const ph of (data.photos || [])) await DB.putPhoto(p.id, ph.date, ph.pose, Photos.dataURLToBlob(ph.dataURL));
          await DB.setMeta('activeParticipant', p.id);
        }
        await loadState();
        toast('Backup restored');
        go('home');
      } catch (err) { alert('Restore failed: ' + err.message); }
    };
    input.click();
  };

  $('#bClear').onclick = async () => {
    if (!confirm('This permanently deletes every participant, record and photo on this device. Continue?')) return;
    if (!confirm('Really delete everything? This cannot be undone.')) return;
    await DB.clearAll();
    await loadState();
    toast('All data deleted');
    go('home');
  };
}

/* ============================================================
   Navigation wiring
   ============================================================ */
function openSheet() { $('#moreSheet').hidden = false; }
function closeSheet() { $('#moreSheet').hidden = true; }

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) { e.preventDefault(); go(b.dataset.go); }
});
$('#tabMore').onclick = () => { $('#moreSheet').hidden ? openSheet() : closeSheet(); };
$('#tabAdd').onclick = () => go('entry/' + todayISO());
$('#whoChip').onclick = () => go('participants');
$('#moreSheet').addEventListener('click', (e) => {
  if (e.target.id === 'moreSheet' || e.target.closest('[data-close-sheet]')) closeSheet();
});
window.addEventListener('hashchange', () => { entrySave = null; render(); });

/* install prompt */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#menuInstall').hidden = false;
});
$('#menuInstall').onclick = async () => {
  closeSheet();
  if (!deferredPrompt) return toast('Use your browser menu → "Add to Home Screen"');
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#menuInstall').hidden = true;
};

(async function boot() {
  try {
    await loadState();
  } catch (err) {
    console.error(err);
    $('#view').innerHTML = `<div class="card"><div class="card-title">Storage unavailable</div>
      <p class="muted">This browser blocked local storage, so records cannot be saved.
      Private/incognito mode or blocked site data is the usual cause. Error: ${esc(err.message)}</p></div>`;
    return;
  }
  if (!location.hash) location.hash = '#/home';
  await render();
  $('#brandSub').textContent = State.profile.name ? `Season ${State.profile.season || 1} · 41 days` : '41 Days Transformation';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  }
})();
