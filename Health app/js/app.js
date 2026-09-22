/* ============================================================
   app.js - BTC Transformation Tracker (PWA shell, views, router)
   One person registers per device. There is no profile switching:
   to start again you delete the registration and register afresh.
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
const ACTIVITY_DAYS = 21;   // the BTC activity tracker runs for the first 21 days
const GENDERS = [
  { k: 'female', label: 'Female' }, { k: 'male', label: 'Male' }, { k: 'other', label: 'Other' }
];

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
  participants: [],   // the one registered person (an array so old data still loads)
  summaries: {},      // id -> { logged, points, consistency, day, avatar }
  activeId: null,
  profile: null,      // the active participant (profile + weekly + final)
  records: [],        // active participant's records, newest first
  photos: { before: {}, after: {} },  // stage -> { pose: photo record } for the active participant
  events: []          // community events, shared by everyone on the device
};

const newParticipant = (name = '') => ({
  id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  name, gender: '', age: '', height: '', startWeight: '',
  clubNumber: '', clubOperator: '', coach: '', goal: '',
  startDate: todayISO(), season: '1', weekly: {}, final: {},
  registered: false, registeredAt: null, createdAt: Date.now()
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
const genderLabel = (k) => (GENDERS.find(g => g.k === k) || {}).label || '';

/* someone who already has a name predates the registration form, so they count as registered */
const isRegistered = (p) => !!(p && (p.registered || (p.name || '').trim()));

/* the two daily forms write into the same record; these say which one has been filled */
const hasHabits = (r) =>
  HABITS.some(h => r.habits[h.key]) || !!r.weight || !!r.inches || !!(r.notes || '').trim();
const hasActivity = (r) =>
  !!r.activity.name || r.activity.percent !== '' || r.activity.points !== '' || !!r.activity.fuelAdded ||
  !!r.recipes.healthy.tried || r.recipes.healthy.posted != null ||
  !!r.recipes.laddu.tried || r.recipes.laddu.posted != null ||
  !!r.fuelProgram.selected || r.fuelProgram.extras.some(x => x.name || x.added) || r.detox != null;

/* headline numbers for every participant, used by the cards */
async function buildSummaries() {
  const out = {};
  for (const p of State.participants) {
    const recs = (await DB.recordsFor(p.id)).map(r => normalise(r, r.date));
    const pics = await DB.photosFor(p.id);
    const points = recs.reduce((s, r) => s + scoreOf(r), 0);
    const shot = (stage, pose) => pics.find(x => x.stage === stage && x.pose === pose);
    const front = shot('after', 'front') || shot('before', 'front') || pics[0];
    out[p.id] = {
      logged: recs.length,
      habitLogged: recs.filter(hasHabits).length,
      activityLogged: recs.filter(hasActivity).length,
      points,
      photos: pics.length,
      registered: isRegistered(p),
      consistency: Math.round((points / Math.max(1, recs.length * 5)) * 100),
      day: Math.min(TOTAL_DAYS, Math.max(1, daysBetween(p.startDate, todayISO()) + 1)),
      lastDate: recs.length ? recs.map(r => r.date).sort().slice(-1)[0] : '',
      avatar: front ? { id: front.id + '|' + front.createdAt, blob: front.blob } : null
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
  State.photos = { before: {}, after: {} };
  (await DB.photosFor(active)).forEach(p => {
    if (State.photos[p.stage]) State.photos[p.stage][p.pose] = p;
  });
  State.summaries = await buildSummaries();
  State.events = await DB.listEvents();
  paintWhoChip();
}

const saveProfile = () => {
  if (!State.profile.id) State.profile.id = State.activeId;   // never write an id-less participant
  return DB.putParticipant(State.profile);
};

function paintWhoChip() {
  const p = State.profile || {};
  const s = State.summaries[State.activeId];
  const av = $('#whoAvatar');
  if (s && s.avatar) av.innerHTML = `<img src="${Photos.url(s.avatar.id, s.avatar.blob)}" alt="" />`;
  else av.textContent = initials(p.name);
  $('#whoName').textContent = p.name || 'Set up';
}

/* ---------------- app bar + fixed form actions ---------------- */
const PAGE_TITLES = {
  register: 'Register · 41 Day Challenge',
  habit: 'Daily habit tracker', entry: 'Daily habit tracker',
  activity: 'BTC activity tracker',
  weekly: 'Weekly & final results', export: 'Export', events: 'Events',
  profile: 'Profile & goal', backup: 'Backup & restore'
};
function pageTitleFor(name) {
  return PAGE_TITLES[name] || '';
}

/* home shows the brand and the participant chip; every other page shows ← + its name */
function paintAppBar(name, arg) {
  const title = pageTitleFor(name, arg);
  $('#backBtn').hidden = !title;
  $('#pageTitle').hidden = !title;
  $('#pageTitle').textContent = title;
  $('#brandBlock').hidden = !!title;
  $('#whoChip').hidden = !!title;
}

/* a form hides the tab bar and puts Save / Cancel in a fixed bar instead */
function setFormBar(opts) {
  const bar = $('#formbar');
  if (!opts) { bar.hidden = true; $('#tabbar').hidden = false; return; }
  $('#fbSave').innerHTML = opts.saveLabel || '💾 Save';
  $('#fbCancel').innerHTML = opts.cancelLabel || 'Cancel';
  $('#fbSave').onclick = opts.save;
  $('#fbCancel').onclick = opts.cancel || (() => go('home'));
  bar.hidden = false;
  $('#tabbar').hidden = true;
}

function goBack() {
  if (history.length > 1) history.back();
  else go('home');
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

const TAB_OF = { home: 'home', entry: 'home', habit: 'home', activity: 'home', register: 'home',
                 weekly: 'weekly', export: 'export',
                 events: 'more', profile: 'more', backup: 'more' };

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
    const routes = { home: viewHome, register: viewRegister, events: viewEvents,
                     habit: viewHabit, entry: viewHabit, activity: viewActivity, profile: viewProfile,
                     weekly: viewWeekly, export: viewExport, backup: viewBackup };
    const fn = routes[name] || viewHome;
    setFormBar(null);                       // views that are forms switch it back on
    paintAppBar(name, arg);
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
  const me = State.summaries[State.activeId] ||
    { logged: 0, habitLogged: 0, activityLogged: 0, points: 0, consistency: 0, day: 1, photos: 0 };

  /* ----- not registered yet: the only thing to do is register ----- */
  if (!isRegistered(p)) {
    root.innerHTML = `
      <div class="hero hero-join">
        <h2>41 Day Transformation Challenge</h2>
        <div class="sub">Family Care Community · Let's transform together</div>
      </div>
      <div class="card join-card">
        <div class="card-title">🏆 Register for the 41 Day Challenge</div>
        <p class="muted">Fill in your basic details — name, gender, age, height and starting weight —
          then click your three before photos (front, side and back). It takes about two minutes.</p>
        <ol class="steps">
          <li><b>Your details</b><small>Name, gender, age, height, weight, club and coach</small></li>
          <li><b>Your goal</b><small>Weight loss, weight gain, fat loss or overall transformation</small></li>
          <li><b>Three before photos</b><small>Front, side and back — preview and confirm before you submit</small></li>
        </ol>
        <button class="btn btn-primary btn-block btn-lg" data-go="register">📝 Register now</button>
      </div>
      <div class="ev-block">${Events.carousel(State.events)}</div>`;
    Events.wire(root, refreshEvents);
    return;
  }

  const pct = Math.min(100, Math.round((me.habitLogged / TOTAL_DAYS) * 100));
  const actPct = Math.min(100, Math.round((me.activityLogged / ACTIVITY_DAYS) * 100));
  const today = todayISO();
  const todayRec = recs.find(r => r.date === today);
  const habitDone = !!(todayRec && hasHabits(todayRec));
  const activityDone = !!(todayRec && hasActivity(todayRec));
  const actDay = Math.min(ACTIVITY_DAYS, Math.max(1, dayNumber(today)));

  const missBefore = Photos.POSES.filter(x => !State.photos.before[x.key]);
  const photoNudge = missBefore.length ? `
    <div class="card" style="border-left:5px solid var(--yellow)">
      <div class="card-title">📸 Before photos missing</div>
      <p class="muted">Registration needs all three poses — ${missBefore.map(x => esc(x.label)).join(', ')} —
        as the <b>before</b> proof. The <b>after</b> photos are taken when you export.</p>
      <button class="btn btn-primary btn-block" data-go="profile">Take the before photos</button>
    </div>` : '';

  /* ----- left over profiles from the version that allowed several people ----- */
  const extras = State.participants.filter(x => x.id !== State.activeId);
  const extraNotice = extras.length ? `
    <div class="card" style="border-left:5px solid var(--yellow)">
      <div class="card-title">ℹ️ ${extras.length} old profile${extras.length === 1 ? '' : 's'} stored</div>
      <p class="muted">This version tracks one person, so ${extras.length === 1 ? 'this profile is' : 'these profiles are'}
        no longer shown: ${extras.map(x => esc(x.name || 'Unnamed')).join(', ')}.
        Take a backup first if you still need ${extras.length === 1 ? 'it' : 'them'}.</p>
      <div class="row">
        <button class="btn btn-ghost btn-sm" data-go="backup" style="flex:1">💾 Backup first</button>
        <button class="btn btn-danger btn-sm" id="dropExtras" style="flex:1">🗑 Remove them</button>
      </div>
    </div>` : '';

  /* ----- records ----- */
  const list = recs.length ? recs.map(r => {
    const s = scoreOf(r);
    const dn = dayNumber(r.date);
    return `<div class="rec" data-date="${r.date}">
      <div class="rec-day"><b>${dn > 0 && dn <= 999 ? dn : '–'}</b><small>DAY</small></div>
      <div class="rec-main">
        <div class="d">${esc(prettyDate(r.date))}</div>
        <div class="s">${hasHabits(r) ? s + '/5 habits' : 'no habits logged'}${r.weight ? ' · ' + esc(r.weight) + ' kg' : ''}${r.activity.points !== '' ? ' · ' + esc(r.activity.points) + '/10 activity' : ''}</div>
        <div class="chips">
          <span class="chip${hasHabits(r) ? ' on' : ''}">✅ HABITS</span>
          <span class="chip${hasActivity(r) ? ' on' : ''}">🏃 ACTIVITY</span>
          ${r.detox === 'yes' ? '<span class="chip on">🌿 DETOX</span>' : ''}
        </div>
      </div>
      <div class="rec-right">
        <span class="score-pill">${s}/5</span>
      </div>
    </div>`;
  }).join('') : `<div class="empty"><span class="big">📝</span>Nothing logged yet.<br>Start with today's habit tracker.</div>`;

  root.innerHTML = `
    ${photoNudge}
    <div class="hero">
      <h2>${esc(p.name || 'My Transformation')}</h2>
      <div class="sub">${p.goal ? esc((GOALS.find(g => g.k === p.goal) || {}).label) : 'No goal selected'}
        ${p.coach ? ' · ' + (/^coach/i.test(p.coach) ? esc(p.coach) : 'Coach ' + esc(p.coach)) : ''}</div>
      <div class="hero-foot"><span>Day ${me.day} of ${TOTAL_DAYS}</span><span>${me.points}/205 pts</span></div>
    </div>

    <div class="ev-block">${Events.carousel(State.events)}</div>

    <div class="programs">
      <button type="button" class="program" data-go="habit/${today}">
        <div class="program-top">
          <span class="program-ic">🏆</span>
          <div class="program-txt">
            <b>41 Day Challenge</b>
            <small>Daily habit tracker — fuel, sleep, water, lunch, steps</small>
          </div>
          <span class="program-state${habitDone ? ' on' : ''}">${habitDone ? 'Logged ✓' : 'Log today'}</span>
        </div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="program-foot"><span>Day ${me.day} of ${TOTAL_DAYS}</span><span>${me.habitLogged} days logged</span></div>
      </button>

      <button type="button" class="program program-alt" data-go="activity/${today}">
        <div class="program-top">
          <span class="program-ic">🏃</span>
          <div class="program-txt">
            <b>BTC Activity Tracker</b>
            <small>Daily activity, recipe tracker &amp; fuel program — 21 days</small>
          </div>
          <span class="program-state${activityDone ? ' on' : ''}">${activityDone ? 'Logged ✓' : 'Log today'}</span>
        </div>
        <div class="bar"><i style="width:${actPct}%"></i></div>
        <div class="program-foot"><span>Day ${actDay} of ${ACTIVITY_DAYS}</span><span>${me.activityLogged} days logged</span></div>
      </button>
    </div>

    <div class="stats">
      <div class="stat"><b>${me.habitLogged}</b><small>Habit days</small></div>
      <div class="stat"><b>${me.activityLogged}</b><small>Activity days</small></div>
      <div class="stat"><b>${me.consistency}%</b><small>Consistency</small></div>
      <div class="stat"><b>${me.photos}/6</b><small>Proof photos</small></div>
    </div>
    <div class="row" style="margin:.2rem 0 .8rem">
      <button class="btn btn-ghost" data-go="weekly" style="flex:1">📊 Weekly</button>
      <button class="btn btn-ghost" data-go="export" style="flex:1">⤓ Export</button>
    </div>
    ${extraNotice}
    <h3 style="font-size:.9rem;color:var(--green-800);margin:.9rem 0 .4rem">Daily records (latest first)</h3>
    ${list}`;

  $$('.rec', root).forEach(el => el.addEventListener('click', () => go('habit/' + el.dataset.date)));
  Events.wire(root, refreshEvents);
  const drop = $('#dropExtras', root);
  if (drop) drop.onclick = async () => {
    if (!confirm(`Remove ${extras.length} old profile${extras.length === 1 ? '' : 's'} with all their records and photos? This cannot be undone.`)) return;
    for (const x of extras) await DB.deleteParticipant(x.id);
    await loadState();
    toast('Old profiles removed');
    go('home');
  };
}

/* reload the events and repaint whichever view is showing them */
async function refreshEvents() {
  State.events = await DB.listEvents();
  await render();
}

/* ============================================================
   EVENTS - every team call, Google Meet and meet-up, next one first
   ============================================================ */
async function viewEvents(root) {
  const list = State.events;
  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">📅 Events</div>
        <button class="btn btn-primary btn-sm" id="evAdd">＋ New event</button>
      </div>
      <p class="muted">Team calls, Google Meets and meet-ups for the community, next one first.
        Tap an event for the details and the join link.</p>
    </div>
    <div id="evList">${Events.listSection(list, refreshEvents)}</div>
    <div style="height:.5rem"></div>`;
  Events.wire(root, refreshEvents);
}

/* ============================================================
   Shared bits for the two daily forms
   ============================================================ */
const seg = (name, val, options) => `
  <span class="seg" data-seg="${name}">
    ${options.map(o => `<button type="button" data-val="${o.v}" class="${val === o.v ? 'on' : ''}">${o.t}</button>`).join('')}
  </span>`;

/* wires every yes/no segment in `root` back onto the record */
function wireSegments(root, rec) {
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
}

const dateCard = (date, dn, total, label) => `
  <div class="grid-2">
    <div class="field"><label>Date</label><input type="date" id="fDate" value="${date}" max="${todayISO()}" /></div>
    <div class="field"><label>Day number</label>
      <input type="text" value="${dn > 0 ? 'Day ' + dn + ' of ' + total + (label ? ' · ' + label : '') : 'Before start date'}" disabled /></div>
  </div>`;

/* ============================================================
   41 DAY CHALLENGE - the daily habit tracker, filled in every day
   ============================================================ */
async function viewHabit(root, arg) {
  const pid = State.activeId;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? arg : todayISO();
  const rec = normalise(await DB.getRecord(pid, date), date);
  const dn = dayNumber(date);

  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">🏆 41 Day Challenge</div>
        <span class="score-pill" id="scorePill">${scoreOf(rec)}/5</span>
      </div>
      <p class="muted">${esc(State.profile.name || '')} · tick every habit you completed today.</p>
      ${dateCard(date, dn, TOTAL_DAYS)}
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">✅ Daily habit tracker</div>
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
      <div class="card-title">📝 Notes</div>
      <div class="field"><textarea id="fNotes" placeholder="How did the day go?">${esc(rec.notes)}</textarea></div>
    </div>

    <div class="card linkcard">
      <div>
        <b>🏃 BTC Activity Tracker</b>
        <small class="muted">Activity, recipes and fuel program for this day</small>
      </div>
      <button class="btn btn-ghost btn-sm" data-go="activity/${date}">Open</button>
    </div>

    <div class="row" style="margin-bottom:1rem">
      <button class="btn btn-danger btn-block" id="delBtn">🗑 Delete this day's record</button>
    </div>`;

  $$('.habit', root).forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.habit;
    rec.habits[k] = !rec.habits[k];
    el.classList.toggle('on', rec.habits[k]);
    $('.tick', el).textContent = rec.habits[k] ? '✓' : '✗';
    $('#scorePill').textContent = scoreOf(rec) + '/5';
  }));

  function collect() {
    rec.weight = $('#fWeight').value;
    rec.inches = $('#fInches').value;
    rec.notes = $('#fNotes').value;
    rec.updatedAt = Date.now();
    return rec;
  }

  setFormBar({
    saveLabel: '💾 Save habits',
    save: async () => {
      await DB.putRecord(pid, collect());
      await loadState();
      toast('Habits saved for ' + prettyDate(date));
      go('home');
    },
    cancel: () => go('home')
  });
  $('#delBtn').onclick = async () => {
    if (!confirm('Delete the whole record for ' + prettyDate(date) + '? This also clears the activity tracker for that day.')) return;
    await DB.deleteRecord(pid, date);
    await loadState();
    toast('Record deleted');
    go('home');
  };
  $('#fDate').onchange = async (e) => {
    await DB.putRecord(pid, collect());
    await loadState();
    go('habit/' + e.target.value);
  };
}

/* ============================================================
   BTC ACTIVITY TRACKER (21 days) - activity, recipes, fuel program
   ============================================================ */
async function viewActivity(root, arg) {
  const pid = State.activeId;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? arg : todayISO();
  const rec = normalise(await DB.getRecord(pid, date), date);
  const dn = dayNumber(date);

  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">🏃 BTC Activity Tracker</div>
        <span class="muted">21 days</span>
      </div>
      <p class="muted">${esc(State.profile.name || '')} · daily activity, recipes and fuel program.</p>
      ${dateCard(date, dn, ACTIVITY_DAYS)}
      ${dn > ACTIVITY_DAYS ? '<p class="muted">This day is past the 21 day activity program — you can still record it.</p>' : ''}
    </div>

    <div class="card">
      <div class="card-title"><span class="section-num">1</span> Daily activity / दैनिक गतिविधि</div>
      <div class="field"><label>Activity (गतिविधि)</label><input type="text" id="fActName" value="${esc(rec.activity.name)}" placeholder="Walk, gym, yoga…" /></div>
      <div class="grid-3">
        <div class="field"><label>% score</label><input type="number" min="0" max="100" inputmode="numeric" id="fActPct" value="${esc(rec.activity.percent)}" placeholder="0-100" /></div>
        <div class="field"><label>Points (out of 10)</label><input type="number" min="0" max="10" inputmode="numeric" id="fActPts" value="${esc(rec.activity.points)}" placeholder="0-10" /></div>
        <div class="field"><label>Fuel added (which?)</label><input type="text" id="fActFuel" value="${esc(rec.activity.fuelAdded)}" placeholder="Name" /></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span class="section-num">2</span> Recipe tracker / रेसिपी ट्रैकर</div>
      <div class="field"><label>🥤 Healthy fuel recipe tried</label><input type="text" id="fRecHealthy" value="${esc(rec.recipes.healthy.tried)}" placeholder="Recipe name" /></div>
      <div class="inline"><span class="lbl">Posted in group? (ग्रुप में पोस्ट की)</span>${seg('healthyPosted', rec.recipes.healthy.posted, [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }])}</div>
      <div class="field" style="margin-top:.6rem"><label>🍡 Dyno fuel laddu recipe tried</label><input type="text" id="fRecLaddu" value="${esc(rec.recipes.laddu.tried)}" placeholder="Recipe name" /></div>
      <div class="inline"><span class="lbl">Posted in group? (ग्रुप में पोस्ट की)</span>${seg('ladduPosted', rec.recipes.laddu.posted, [{ v: 'yes', t: 'Yes' }, { v: 'no', t: 'No' }])}</div>
    </div>

    <div class="card">
      <div class="card-title"><span class="section-num">3</span> Fuel program / फ्यूल प्रोग्राम</div>
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

    <div class="card linkcard">
      <div>
        <b>🏆 41 Day Challenge</b>
        <small class="muted">Habit tracker for this day</small>
      </div>
      <button class="btn btn-ghost btn-sm" data-go="habit/${date}">Open</button>
    </div>
    <div style="height:.5rem"></div>`;

  wireSegments(root, rec);
  $$('input[name="program"]', root).forEach(r =>
    r.addEventListener('change', () => { rec.fuelProgram.selected = r.value; }));

  function collect() {
    rec.activity.name = $('#fActName').value.trim();
    rec.activity.percent = $('#fActPct').value;
    rec.activity.points = $('#fActPts').value;
    rec.activity.fuelAdded = $('#fActFuel').value.trim();
    rec.recipes.healthy.tried = $('#fRecHealthy').value.trim();
    rec.recipes.laddu.tried = $('#fRecLaddu').value.trim();
    $$('#extras .fuel-row').forEach(row => {
      rec.fuelProgram.extras[+row.dataset.i].name = $('.exName', row).value.trim();
    });
    rec.updatedAt = Date.now();
    return rec;
  }

  setFormBar({
    saveLabel: '💾 Save activity',
    save: async () => {
      await DB.putRecord(pid, collect());
      await loadState();
      toast('Activity saved for ' + prettyDate(date));
      go('home');
    },
    cancel: () => go('home')
  });
  $('#fDate').onchange = async (e) => {
    await DB.putRecord(pid, collect());
    await loadState();
    go('activity/' + e.target.value);
  };
}

/* ============================================================
   PROOF PHOTOS - three poses per stage: "before" at registration,
   "after" when the tracker is exported.
   ============================================================ */

/* capture or upload one pose for a participant + stage; true when saved */
async function grabPhoto(pid, stage, pose, how, done) {
  try {
    let blob = null;
    if (how === 'camera') {
      blob = await Photos.capture(pose, stage);
    } else {
      const f = await Photos.pickFile();
      if (f) blob = await Photos.compress(f);
    }
    if (!blob) return false;
    await DB.putPhoto(pid, stage, pose, blob, todayISO());
    if (pid === State.activeId) await loadState();
    toast(`${Photos.stageLabel(stage)} · ${Photos.poseLabel(pose)} photo saved`);
    if (done) await done();
    return true;
  } catch (err) {
    console.error(err);
    toast('Could not save photo: ' + err.message);
    return false;
  }
}

/* renders the three pose tiles of one stage into `host`; returns its repaint fn.
   onChange gets { pose: photo } so a view can show what is still missing. */
function photoTrio(host, pid, stage, onChange) {
  async function paint() {
    const map = (await DB.photosForStage(pid, stage)).reduce((o, p) => (o[p.pose] = p, o), {});
    host.innerHTML = Photos.POSES.map(p => {
      const rec = map[p.key];
      const src = rec ? Photos.url(rec.id + '|' + rec.createdAt, rec.blob) : '';
      return `<div class="photo-slot${rec ? ' done' : ''}" data-pose="${p.key}">
        ${rec ? `<img src="${src}" alt="${p.label}" />`
              : `<span class="ph-icon">${p.emoji}</span><span class="ph-label">${p.label}</span>`}
        <span class="tag">${p.label.toUpperCase()}${rec ? ' ✓' : ''}</span>
      </div>`;
    }).join('');
    $$('.photo-slot', host).forEach(slot => slot.onclick = async () => {
      const pose = slot.dataset.pose;
      const existing = await DB.getPhoto(pid, stage, pose);
      if (existing) openPhoto(pid, stage, pose, existing.blob, paint);
      else await grabPhoto(pid, stage, pose, 'camera', paint);
    });
    if (onChange) onChange(map);
  }
  return paint;
}

/* walk the poses that have no photo yet, one after the other */
async function captureMissing(pid, stage, how, paint) {
  const map = (await DB.photosForStage(pid, stage)).reduce((o, p) => (o[p.pose] = p, o), {});
  const todo = Photos.POSES.filter(p => !map[p.key]);
  if (!todo.length) {
    return toast(`All 3 ${Photos.stageLabel(stage).toLowerCase()} photos are done — tap a tile to retake one`);
  }
  for (const p of todo) {
    const ok = await grabPhoto(pid, stage, p.key, how, null);
    if (!ok) break;                       // cancelled or failed - stop the run
  }
  if (paint) await paint();
}

/* full-screen photo viewer with delete */
function openPhoto(pid, stage, pose, blob, after) {
  const m = $('#photoModal');
  $('#photoTitle').textContent = `${Photos.stageLabel(stage)} · ${Photos.poseLabel(pose)}`;
  $('#photoBig').src = URL.createObjectURL(blob);
  m.hidden = false;
  const close = () => {
    m.hidden = true;
    URL.revokeObjectURL($('#photoBig').src);
    $('#photoDelete').onclick = null;
  };
  m.querySelectorAll('[data-close-photo]').forEach(b => b.onclick = close);
  $('#photoDelete').onclick = async () => {
    if (!confirm('Delete this photo? You will have to take it again.')) return;
    await DB.deletePhoto(pid, stage, pose);
    if (pid === State.activeId) await loadState();
    close();
    toast('Photo deleted');
    if (after) await after();
  };
}

/* ============================================================
   REGISTER - join the 41 Day Challenge: details, goal,
   three before photos, preview, confirm, submit
   ============================================================ */
async function viewRegister(root) {
  /* one registration per device: an already registered person edits their profile
     or deletes the registration and starts again */
  if (isRegistered(State.profile)) {
    root.innerHTML = `
      <div class="card">
        <div class="card-title">✅ Already registered</div>
        <p class="muted"><b>${esc(State.profile.name)}</b> is registered for the 41 Day Challenge.
          This app tracks one person, so there is nothing more to register.
          Edit the details, or delete the registration and start again from scratch.</p>
        <div class="row">
          <button class="btn btn-primary" data-go="profile" style="flex:1">👤 Open profile</button>
          <button class="btn btn-ghost" data-go="home" style="flex:1">Back home</button>
        </div>
      </div>
      <div style="height:.5rem"></div>`;
    return;
  }
  const p = State.profile;

  root.innerHTML = `
    <div class="card">
      <div class="card-title">🏆 Register for the 41 Day Challenge</div>
      <p class="muted">All fields marked <b>*</b> are needed to register.</p>
      <div class="field"><label>Full name *</label><input id="pName" value="${esc(p.name)}" placeholder="Full name" /></div>
      <div class="field"><label>Gender *</label>
        <div class="seg seg-wide" id="pGender">
          ${GENDERS.map(g => `<button type="button" data-val="${g.k}" class="${p.gender === g.k ? 'on' : ''}">${g.label}</button>`).join('')}
        </div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Age (years) *</label><input type="number" min="5" max="120" inputmode="numeric" id="pAge" value="${esc(p.age)}" placeholder="e.g. 34" /></div>
        <div class="field"><label>Height (cm) *</label><input type="number" min="60" max="250" step="0.5" inputmode="decimal" id="pHeight" value="${esc(p.height)}" placeholder="e.g. 165" /></div>
        <div class="field"><label>Weight (kg) *</label><input type="number" min="20" max="350" step="0.1" inputmode="decimal" id="pWeight" value="${esc(p.startWeight)}" placeholder="e.g. 78.5" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Club number</label><input id="pClub" value="${esc(p.clubNumber)}" placeholder="e.g. 1024" /></div>
        <div class="field"><label>Club operator name</label><input id="pOp" value="${esc(p.clubOperator)}" placeholder="Operator" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Coach name</label><input id="pCoach" value="${esc(p.coach)}" placeholder="Coach" /></div>
        <div class="field"><label>Season</label><input id="pSeason" value="${esc(p.season || '1')}" /></div>
      </div>
      <div class="field"><label>Start date (Day 1) *</label><input type="date" id="pStart" value="${p.startDate}" /></div>
    </div>

    <div class="card">
      <div class="card-title">🎯 My goal (select one) *</div>
      <div class="goal-list">
        ${GOALS.map(g => `<label><input type="radio" name="goal" value="${g.k}" ${p.goal === g.k ? 'checked' : ''} /> ${g.label}</label>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">📸 Before photos *</div>
        <span class="muted" id="bpState"></span>
      </div>
      <p class="muted">Click all three poses now — <b>front</b>, <b>side</b> and <b>back</b>.
        Tap a tile for the camera, or use upload. Stand 2–3 m away with the full body in frame.</p>
      <div class="photo-grid" id="bpTrio"></div>
      <div class="photo-actions">
        <button class="btn btn-primary btn-sm" id="bpShoot">📷 Click the 3 photos</button>
        <button class="btn btn-ghost btn-sm" id="bpUpload">🖼 Upload photos</button>
      </div>
    </div>

    <div class="card" id="reviewCard">
      <div class="card-title">✅ Preview &amp; confirm</div>
      <div id="reviewBody"></div>
    </div>
    <div style="height:.5rem"></div>`;

  /* ----- gender segment ----- */
  /* gender is a required single choice, so tapping the selected one keeps it */
  $('#pGender').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    p.gender = b.dataset.val;
    $$('button', $('#pGender')).forEach(x => x.classList.toggle('on', x.dataset.val === p.gender));
  });

  /* ----- before photos + the preview that follows them ----- */
  let bpHave = {};
  const bpPaint = photoTrio($('#bpTrio'), p.id, 'before', (map) => {
    bpHave = map;
    const taken = Photos.POSES.filter(x => map[x.key]).length;
    $('#bpState').textContent = taken === 3 ? 'All 3 ✓' : `${taken}/3 clicked`;
    paintReview(map);
  });
  await bpPaint();
  $('#bpShoot').onclick  = () => captureMissing(p.id, 'before', 'camera', bpPaint);
  $('#bpUpload').onclick = () => captureMissing(p.id, 'before', 'file', bpPaint);

  function paintReview(map) {
    const taken = Photos.POSES.filter(x => map[x.key]);
    if (taken.length < 3) {
      $('#reviewBody').innerHTML = `<p class="muted">Click all three photos above to see the preview.
        ${taken.length ? `Still to do: ${Photos.POSES.filter(x => !map[x.key]).map(x => esc(x.label)).join(', ')}.` : ''}</p>`;
      return;
    }
    const wasConfirmed = $('#rgConfirm') && $('#rgConfirm').checked;
    $('#reviewBody').innerHTML = `
      <p class="muted">These three photos are stored as your <b>before</b> proof and are compared with the
        after photos you click when you export the tracker.</p>
      <div class="review-grid">
        ${Photos.POSES.map(x => {
          const rec = map[x.key];
          return `<figure class="review-shot">
            <img src="${Photos.url(rec.id + '|' + rec.createdAt, rec.blob)}" alt="${esc(x.label)}" />
            <figcaption>${esc(x.label)}</figcaption>
          </figure>`;
        }).join('')}
      </div>
      <p class="muted">Not happy with one? Tap its tile above to view, delete and click it again.</p>
      <label class="checkline"><input type="checkbox" id="rgConfirm" ${wasConfirmed ? 'checked' : ''} />
        I confirm my details are correct and these are my before photos.</label>`;
  }

  const submit = async () => {
    const data = {
      name: $('#pName').value.trim(),
      age: $('#pAge').value,
      height: $('#pHeight').value,
      startWeight: $('#pWeight').value,
      clubNumber: $('#pClub').value.trim(),
      clubOperator: $('#pOp').value.trim(),
      coach: $('#pCoach').value.trim(),
      season: $('#pSeason').value.trim() || '1',
      startDate: $('#pStart').value || todayISO(),
      goal: (document.querySelector('input[name="goal"]:checked') || {}).value || ''
    };
    const need = [];
    if (!data.name) need.push('name');
    if (!p.gender) need.push('gender');
    if (!data.age) need.push('age');
    if (!data.height) need.push('height');
    if (!data.startWeight) need.push('weight');
    if (!data.goal) need.push('goal');
    if (need.length) return toast('Still needed: ' + need.join(', '));

    const missing = Photos.POSES.filter(x => !bpHave[x.key]);
    if (missing.length) return toast('Click the before photos first: ' + missing.map(x => x.label).join(', '));
    if (!$('#rgConfirm') || !$('#rgConfirm').checked) {
      return toast('Tick the confirmation box to finish registering');
    }

    Object.assign(p, data, { registered: true, registeredAt: Date.now() });
    await DB.putParticipant(p);
    await DB.setMeta('activeParticipant', p.id);
    await loadState();
    toast(`${p.name} is registered for the 41 Day Challenge`);
    go('home');
  };

  setFormBar({
    saveLabel: '✅ Confirm &amp; submit',
    cancelLabel: 'Cancel',
    save: submit,
    cancel: async () => {
      /* photos clicked for a registration that was abandoned belong to nobody */
      if (!isRegistered(p)) for (const x of Photos.POSES) await DB.deletePhoto(p.id, 'before', x.key);
      go('home');
    }
  });
}

/* ============================================================
   PROFILE - edit the participant who is already registered
   ============================================================ */
async function viewProfile(root) {
  const p = State.profile;

  root.innerHTML = `
    <div class="card">
      <div class="card-title">👤 Profile</div>
      <div class="field"><label>Name (full name)</label><input id="pName" value="${esc(p.name)}" placeholder="Full name" /></div>
      <div class="field"><label>Gender</label>
        <div class="seg seg-wide" id="pGender">
          ${GENDERS.map(g => `<button type="button" data-val="${g.k}" class="${p.gender === g.k ? 'on' : ''}">${g.label}</button>`).join('')}
        </div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Age (years)</label><input type="number" min="5" max="120" inputmode="numeric" id="pAge" value="${esc(p.age)}" placeholder="e.g. 34" /></div>
        <div class="field"><label>Height (cm)</label><input type="number" min="60" max="250" step="0.5" inputmode="decimal" id="pHeight" value="${esc(p.height)}" placeholder="e.g. 165" /></div>
        <div class="field"><label>Start weight (kg)</label><input type="number" min="20" max="350" step="0.1" inputmode="decimal" id="pWeight" value="${esc(p.startWeight)}" placeholder="e.g. 78.5" /></div>
      </div>
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
      <div class="card-title">🎯 My goal (select one)</div>
      <div class="goal-list">
        ${GOALS.map(g => `<label><input type="radio" name="goal" value="${g.k}" ${p.goal === g.k ? 'checked' : ''} /> ${g.label}</label>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">📸 Before photos</div>
        <span class="muted" id="bpState"></span>
      </div>
      <p class="muted">The <b>before</b> proof clicked at registration — front, side and back.
        Tap a tile to view or replace one. The <b>after</b> photos are clicked when you export.</p>
      <div class="photo-grid" id="bpTrio"></div>
      <div class="photo-actions">
        <button class="btn btn-ghost btn-sm" id="bpShoot">📷 Click missing</button>
        <button class="btn btn-ghost btn-sm" id="bpUpload">🖼 Upload photos</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">⚠️ Start over</div>
      <p class="muted">Only one person can be registered on this device. To track someone else, or to
        restart the 41 days from scratch, delete this registration first — it removes the profile,
        every daily record and all six proof photos. Events are kept.
        Take a <b>backup</b> first if you want to keep a copy.</p>
      <button class="btn btn-danger btn-block" id="pReset">🗑 Delete registration and start over</button>
    </div>
    <div style="height:.5rem"></div>`;

  $('#pReset').onclick = async () => {
    if (!confirm(`Delete ${p.name || 'this registration'} with every record and photo, and start over? This cannot be undone.`)) return;
    if (!confirm('Really delete everything for this person? Take a backup first if you are unsure.')) return;
    await DB.deleteParticipant(p.id);
    await DB.setMeta('activeParticipant', null);
    await loadState();
    toast('Registration deleted — you can register again');
    go('home');
  };

  /* gender is a required single choice, so tapping the selected one keeps it */
  $('#pGender').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    p.gender = b.dataset.val;
    $$('button', $('#pGender')).forEach(x => x.classList.toggle('on', x.dataset.val === p.gender));
  });

  const bpPaint = photoTrio($('#bpTrio'), p.id, 'before', (map) => {
    const taken = Photos.POSES.filter(x => map[x.key]).length;
    $('#bpState').textContent = taken === 3 ? 'All 3 ✓' : `${taken}/3 clicked`;
  });
  await bpPaint();
  $('#bpShoot').onclick  = () => captureMissing(p.id, 'before', 'camera', bpPaint);
  $('#bpUpload').onclick = () => captureMissing(p.id, 'before', 'file', bpPaint);

  setFormBar({
    saveLabel: '💾 Save profile',
    save: async () => {
      Object.assign(p, {
        name: $('#pName').value.trim(),
        age: $('#pAge').value,
        height: $('#pHeight').value,
        startWeight: $('#pWeight').value,
        clubNumber: $('#pClub').value.trim(),
        clubOperator: $('#pOp').value.trim(),
        coach: $('#pCoach').value.trim(),
        season: $('#pSeason').value.trim() || '1',
        startDate: $('#pStart').value || todayISO(),
        goal: (document.querySelector('input[name="goal"]:checked') || {}).value || ''
      });
      if (!p.name) return toast('Please enter a name first');
      await DB.putParticipant(p);
      await loadState();
      toast('Profile saved');
      go('home');
    },
    cancel: () => go('home')
  });
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

    <div style="height:.5rem"></div>`;

  const saveWeekly = async () => {
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

  setFormBar({ save: saveWeekly, cancel: () => go('home') });
}

/* ============================================================
   EXPORT - participant, date range, sheets, before/after photos
   ============================================================ */
async function viewExport(root) {
  let pid = State.activeId;

  root.innerHTML = `
    <div class="card">
      <div class="card-title">⤓ Export the tracker</div>
      <p class="muted">Pick a date range, choose the sheets, click the three after photos,
        then print or save as PDF.</p>
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
      <div class="card-head">
        <div class="card-title">📸 Before photos</div>
        <span class="muted" id="xBeforeState"></span>
      </div>
      <p class="muted">Taken when this participant registered. Tap a tile to view, or fill in anything missing.</p>
      <div class="photo-grid" id="xBefore"></div>
      <div class="photo-actions">
        <button class="btn btn-ghost btn-sm" id="xBeforeShoot">📷 Take missing</button>
        <button class="btn btn-ghost btn-sm" id="xBeforeUp">🖼 Upload</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">🏁 After photos (required)</div>
        <span class="muted" id="xAfterState"></span>
      </div>
      <p class="muted">Click all three poses now — front, right-facing and back side — as the <b>after</b> proof
        for this export. Same spot, light and outfit as the before photos.</p>
      <div class="photo-grid" id="xAfter"></div>
      <div class="photo-actions">
        <button class="btn btn-primary btn-sm" id="xAfterShoot">📷 Take the 3 after photos</button>
        <button class="btn btn-ghost btn-sm" id="xAfterUp">🖼 Upload</button>
      </div>
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
    <div style="height:.5rem"></div>`;

  let recDates = [], beforePaint = null, afterPaint = null;
  const have = { before: {}, after: {} };

  const takenCount = (stage) => Photos.POSES.filter(p => have[stage][p.key]).length;
  const missingLabels = () => ['before', 'after'].reduce((out, stage) => out.concat(
    Photos.POSES.filter(p => !have[stage][p.key]).map(p => `${Photos.stageLabel(stage)} ${p.label}`)), []);

  function updateInfo() {
    const from = $('#xFrom').value, to = $('#xTo').value;
    const n = recDates.filter(d => d >= from && d <= to).length;
    const miss = missingLabels();
    $('#xBeforeState').textContent = takenCount('before') === 3 ? 'All 3 ✓' : `${takenCount('before')}/3`;
    $('#xAfterState').textContent = takenCount('after') === 3 ? 'All 3 ✓' : `${takenCount('after')}/3`;
    $('#xInfo').textContent = `${n} daily record${n === 1 ? '' : 's'} in the selected range · `
      + (miss.length ? `still needed: ${miss.join(', ')}` : 'before and after proof photos complete ✓');
  }

  /* the photo sheet is the before/after proof, so it needs all six shots */
  const proofReady = () => {
    if (!$('#optPhotos').checked) return true;
    const miss = missingLabels();
    if (miss.length) { toast('Click these photos first: ' + miss.join(', ')); return false; }
    return true;
  };

  async function loadFor(newPid) {
    pid = newPid;
    const recs = await DB.recordsFor(pid);
    recDates = recs.map(r => r.date).sort();
    $('#xFrom').value = recDates[0] || todayISO();
    $('#xTo').value = recDates[recDates.length - 1] || todayISO();

    beforePaint = photoTrio($('#xBefore'), pid, 'before', (map) => { have.before = map; updateInfo(); });
    afterPaint  = photoTrio($('#xAfter'),  pid, 'after',  (map) => { have.after = map; updateInfo(); });
    await beforePaint();
    await afterPaint();
  }

  $('#xBeforeShoot').onclick = () => captureMissing(pid, 'before', 'camera', beforePaint);
  $('#xBeforeUp').onclick    = () => captureMissing(pid, 'before', 'file', beforePaint);
  $('#xAfterShoot').onclick  = () => captureMissing(pid, 'after', 'camera', afterPaint);
  $('#xAfterUp').onclick     = () => captureMissing(pid, 'after', 'file', afterPaint);

  $('#xFrom').onchange = updateInfo;
  $('#xTo').onchange = updateInfo;

  const setRange = (f, t) => { $('#xFrom').value = f; $('#xTo').value = t; updateInfo(); };
  $$('#presets .preset', root).forEach(b => b.addEventListener('click', () => {
    $$('#presets .preset', root).forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    const who = State.profile;
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
    options: { habits: $('#optHabits').checked, activity: $('#optActivity').checked, photos: $('#optPhotos').checked }
  });

  $('#xPrint').onclick = async () => {
    if (!proofReady()) return;
    toast('Preparing the sheets…');
    const data = await gather();
    printHTML(Exporter.buildHTML(data));
  };
  $('#xHtml').onclick = async () => {
    if (!proofReady()) return;
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
    if (!proofReady()) return;
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
async function buildExportData({ pid, from, to, options }) {
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

  /* the before / after proof: one shot per pose per stage, as data URLs */
  const all = await DB.photosFor(pid);
  const stageShots = async (stage) => {
    const list = [];
    for (const po of Photos.POSES) {
      const p = all.find(x => x.stage === stage && x.pose === po.key);
      if (p) list.push({
        stage, pose: po.key, poseLabel: po.label, date: p.date,
        day: daysBetween(start, p.date) + 1,
        dataURL: await Photos.blobToDataURL(p.blob)
      });
    }
    return list;
  };
  const before = options.photos ? await stageShots('before') : [];
  const after = options.photos ? await stageShots('after') : [];

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

  return {
    profile: { ...profile, genderLabel: genderLabel(profile.gender) },
    habits: HABITS, days, before, after,
    poses: Photos.POSES.map(p => ({ key: p.key, label: p.label })),
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

/* A backup written before the before/after change holds one photo set per day.
   Keep, per participant and pose, the earliest shot as "before" and the latest
   as "after"; newer backups already carry the stage. */
function restorePhotos(list) {
  if (!list.length || list.some(p => p.stage)) {
    return list.map(p => ({ ...p, stage: p.stage || 'before' }));
  }
  const byKey = {}, out = [];
  list.forEach(ph => {
    const k = (ph.pid || '') + '|' + ph.pose;
    (byKey[k] = byKey[k] || []).push(ph);
  });
  Object.values(byKey).forEach(shots => {
    shots.sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = shots[0], last = shots[shots.length - 1];
    out.push({ ...first, stage: 'before' });
    if (last !== first) out.push({ ...last, stage: 'after' });
  });
  return out;
}

/* ============================================================
   BACKUP / RESTORE
   ============================================================ */
async function viewBackup(root) {
  root.innerHTML = `
    <div class="card">
      <div class="card-title">💾 Backup &amp; restore</div>
      <p class="muted">Everything lives on this device only. Export a backup file before changing phone or clearing browser data.
        The backup holds the registered person, their records and photos, plus the events.</p>
      <div class="row">
        <button class="btn btn-primary" id="bExport" style="flex:1">⤓ Download backup (.json)</button>
        <button class="btn btn-ghost" id="bImport" style="flex:1">⤒ Restore from file</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">⚠️ Danger zone</div>
      <button class="btn btn-danger btn-block" id="bClear">Delete the registration, records, photos and events</button>
    </div>
    <div style="height:.5rem"></div>`;

  $('#bExport').onclick = async () => {
    toast('Building backup…');
    const participants = await DB.listParticipants();
    const records = [], photos = [];
    for (const p of participants) {
      (await DB.recordsFor(p.id)).forEach(r => records.push(r));
      for (const ph of await DB.photosFor(p.id)) {
        photos.push({ pid: ph.pid, stage: ph.stage || 'before', pose: ph.pose, date: ph.date,
                      dataURL: await Photos.blobToDataURL(ph.blob) });
      }
    }
    const events = [];
    for (const ev of await DB.listEvents()) {
      events.push({ ...ev, image: ev.image ? await Photos.blobToDataURL(ev.image) : null });
    }
    const payload = {
      app: 'btc-transformation-tracker', version: 4, exportedAt: new Date().toISOString(),
      activeParticipant: State.activeId, participants, records, photos, events
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
        if (!confirm('Restore this backup? It replaces the registration and any records for the same dates.')) return;

        if (data.version >= 2) {
          for (const p of (data.participants || [])) await DB.putParticipant(p);
          for (const r of (data.records || [])) await DB.putRecord(r.pid, r);
          for (const ph of restorePhotos(data.photos || [])) {
            await DB.putPhoto(ph.pid, ph.stage, ph.pose, Photos.dataURLToBlob(ph.dataURL), ph.date);
          }
          for (const ev of (data.events || [])) {
            await DB.putEvent({ ...ev, image: ev.image ? Photos.dataURLToBlob(ev.image) : null });
          }
          if (data.activeParticipant) await DB.setMeta('activeParticipant', data.activeParticipant);
        } else {
          /* a v1 backup holds a single profile */
          const p = { ...newParticipant((data.profile || {}).name || 'Restored'), ...(data.profile || {}),
                      weekly: data.weekly || {}, final: data.final || {} };
          p.id = p.id && String(p.id).startsWith('p') ? p.id : newParticipant('').id;
          await DB.putParticipant(p);
          for (const r of (data.records || [])) await DB.putRecord(p.id, r);
          for (const ph of restorePhotos(data.photos || [])) {
            await DB.putPhoto(p.id, ph.stage, ph.pose, Photos.dataURLToBlob(ph.dataURL), ph.date);
          }
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
    if (!confirm('This permanently deletes the registration, every record, photo and event on this device. Continue?')) return;
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
function openSheet(id = 'moreSheet') { $('#' + id).hidden = false; }
function closeSheet() { $('#moreSheet').hidden = true; $('#logSheet').hidden = true; }

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) { e.preventDefault(); go(b.dataset.go); }
});
$('#tabMore').onclick = () => { $('#moreSheet').hidden ? openSheet() : closeSheet(); };

/* the + tab asks which of the two daily forms to open */
$('#tabAdd').onclick = () => {
  if (!isRegistered(State.profile)) return go('register');
  $('#logSheet').hidden ? openSheet('logSheet') : closeSheet();
};
$('#logHabit').onclick = () => { closeSheet(); go('habit/' + todayISO()); };
$('#logActivity').onclick = () => { closeSheet(); go('activity/' + todayISO()); };
$('#whoChip').onclick = () => go(isRegistered(State.profile) ? 'profile' : 'register');
$('#backBtn').onclick = goBack;
['moreSheet', 'logSheet'].forEach(id => $('#' + id).addEventListener('click', (e) => {
  if (e.target.id === id || e.target.closest('[data-close-sheet]')) closeSheet();
}));
window.addEventListener('hashchange', () => render());

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
    await DB.migrateLegacyPhotos();     // older per-day photos -> before / after
    await DB.purgeOrphanPhotos();       // shots from an abandoned registration
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
