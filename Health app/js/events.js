/* ============================================================
   events.js - community events: Teams / Google Meet calls, meetups.
   Anyone using the device can create one with a title, date, time,
   meeting link, details and an optional image. Events are listed by
   the next date first, shown as a carousel on Home and in full on
   the events page. The create / edit form and the event details open
   in a modal that sits above everything else.
   ============================================================ */
const Events = (() => {

  const TYPES = [
    { k: 'teams',    label: 'Teams call',   emoji: '💼', linkLabel: 'Teams meeting link' },
    { k: 'gmeet',    label: 'Google Meet',  emoji: '📹', linkLabel: 'Google Meet link' },
    { k: 'zoom',     label: 'Zoom call',    emoji: '🎥', linkLabel: 'Zoom meeting link' },
    { k: 'inperson', label: 'In person',    emoji: '📍', linkLabel: 'Map or address link (optional)' },
    { k: 'other',    label: 'Other',        emoji: '🗓', linkLabel: 'Link (optional)' }
  ];
  const typeOf = (k) => TYPES.find(t => t.k === k) || TYPES[TYPES.length - 1];

  const newEvent = () => ({
    id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: '', type: 'teams', date: todayISO(), time: '', endTime: '',
    link: '', place: '', details: '', image: null,
    createdAt: Date.now(), updatedAt: Date.now()
  });

  /* ---------- ordering: the next event first, past ones after ---------- */
  const sortKey = (ev) => `${ev.date}T${ev.time || '00:00'}`;
  const isPast = (ev) => ev.date < todayISO();

  function split(list) {
    const upcoming = list.filter(e => !isPast(e)).sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1);
    const past = list.filter(isPast).sort((a, b) => sortKey(a) < sortKey(b) ? 1 : -1);
    return { upcoming, past };
  }

  /* ---------- "Today", "In 3 days", "2 days ago" ---------- */
  function whenLabel(ev) {
    const d = daysBetween(todayISO(), ev.date);
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    if (d === -1) return 'Yesterday';
    return d > 0 ? `In ${d} days` : `${-d} days ago`;
  }
  const timeLabel = (ev) =>
    ev.time ? ev.time + (ev.endTime ? '–' + ev.endTime : '') : 'Time to be confirmed';

  /* object URLs for event images, keyed so a replaced image is not cached */
  const imgUrl = (ev) => ev.image ? Photos.url('ev|' + ev.id + '|' + ev.updatedAt, ev.image) : '';

  /* the coloured block shown when an event has no image */
  const thumb = (ev, cls) => ev.image
    ? `<img class="${cls}" src="${imgUrl(ev)}" alt="" />`
    : `<div class="${cls} ev-noimg" data-type="${ev.type}"><span>${typeOf(ev.type).emoji}</span></div>`;

  /* ---------- Home carousel ---------- */
  function carousel(list) {
    const { upcoming, past } = split(list);
    const shown = (upcoming.length ? upcoming : past).slice(0, 6);

    if (!list.length) {
      return `<div class="ev-empty">
        <div><b>📅 No events yet</b><small>Add a Teams call, Google Meet or a meet-up</small></div>
        <button class="btn btn-primary btn-sm" id="evAddEmpty">＋ New event</button>
      </div>`;
    }

    const cards = shown.map(ev => {
      const t = typeOf(ev.type);
      return `<button type="button" class="ev-card${isPast(ev) ? ' is-past' : ''}" data-event="${ev.id}">
        ${thumb(ev, 'ev-card-img')}
        <div class="ev-card-body">
          <span class="ev-when">${esc(whenLabel(ev))}</span>
          <b class="ev-title">${esc(ev.title || 'Untitled event')}</b>
          <small class="ev-meta">${t.emoji} ${esc(t.label)} · ${esc(timeLabel(ev))}</small>
        </div>
      </button>`;
    }).join('');

    return `
      <div class="ev-head">
        <h3>${upcoming.length ? 'Upcoming events' : 'Past events'}</h3>
        <button class="btn btn-ghost btn-sm" id="evAdd">＋ New</button>
      </div>
      <div class="ev-rail">
        ${cards}
        <button type="button" class="ev-card ev-more" id="evShowAll">
          <span class="ev-more-ic">→</span>
          <b>Show all</b>
          <small>${list.length} event${list.length === 1 ? '' : 's'}</small>
        </button>
      </div>`;
  }

  /* click handling shared by the carousel and the events page */
  function wire(root, after) {
    $$('[data-event]', root).forEach(el => el.addEventListener('click', async () => {
      const ev = await DB.getEvent(el.dataset.event);
      if (ev) openView(ev, after);
    }));
    const add = $('#evAdd', root) || $('#evAddEmpty', root);
    if (add) add.onclick = () => openForm(null, after);
    const all = $('#evShowAll', root);
    if (all) all.onclick = () => go('events');
  }

  /* ---------- the modal itself ---------- */
  const modal = () => $('#eventModal');

  function closeModal() {
    modal().hidden = true;
    $('#eventModalBody').innerHTML = '';
    $('#eventModalFoot').innerHTML = '';
  }

  function openModal(title) {
    $('#eventModalTitle').textContent = title;
    modal().hidden = false;
    modal().onclick = (e) => {
      if (e.target === modal() || e.target.closest('[data-close-event]')) closeModal();
    };
  }

  /* ---------- read-only details, with the join button ---------- */
  function openView(ev, after) {
    const t = typeOf(ev.type);
    openModal(t.emoji + ' ' + (ev.title || 'Event'));
    $('#eventModalBody').innerHTML = `
      ${ev.image ? `<img class="ev-hero" src="${imgUrl(ev)}" alt="" />` : ''}
      <div class="ev-view">
        <div class="ev-badges">
          <span class="ev-badge" data-type="${ev.type}">${t.emoji} ${esc(t.label)}</span>
          <span class="ev-badge ghost">${esc(whenLabel(ev))}</span>
        </div>
        <div class="ev-line"><b>When</b><span>${esc(prettyDate(ev.date))} · ${esc(timeLabel(ev))}</span></div>
        ${ev.place ? `<div class="ev-line"><b>Where</b><span>${esc(ev.place)}</span></div>` : ''}
        ${ev.link ? `<div class="ev-line"><b>Link</b><span class="ev-link">${esc(ev.link)}</span></div>` : ''}
        ${ev.details ? `<div class="ev-line"><b>Details</b><span>${esc(ev.details)}</span></div>` : ''}
      </div>`;
    $('#eventModalFoot').innerHTML = `
      <button class="btn btn-ghost btn-sm" id="evEdit">✏️ Edit</button>
      <button class="btn btn-danger btn-sm" id="evDelete">🗑 Delete</button>
      ${ev.link ? `<a class="btn btn-primary btn-sm" id="evJoin" href="${esc(ev.link)}" target="_blank" rel="noopener">🔗 Join</a>` : ''}
      <button class="btn btn-ghost btn-sm" data-close-event>Close</button>`;

    $('#evEdit').onclick = () => openForm(ev, after);
    $('#evDelete').onclick = async () => {
      if (!confirm(`Delete "${ev.title || 'this event'}"? This cannot be undone.`)) return;
      await DB.deleteEvent(ev.id);
      closeModal();
      toast('Event deleted');
      if (after) await after();
    };
  }

  /* ---------- create / edit ---------- */
  function openForm(existing, after) {
    const ev = existing ? { ...existing } : newEvent();
    const isNew = !existing;
    openModal(isNew ? '📅 New event' : '✏️ Edit event');

    const paint = () => {
      const t = typeOf(ev.type);
      $('#eventModalBody').innerHTML = `
        <div class="ev-form">
          <div class="field"><label>Title *</label>
            <input id="evTitle" value="${esc(ev.title)}" placeholder="e.g. Week 3 team call" /></div>

          <div class="field"><label>Event type *</label>
            <div class="ev-types" id="evType">
              ${TYPES.map(x => `<button type="button" data-val="${x.k}" class="${ev.type === x.k ? 'on' : ''}">
                <span>${x.emoji}</span>${esc(x.label)}</button>`).join('')}
            </div>
          </div>

          <div class="grid-3">
            <div class="field"><label>Date *</label><input type="date" id="evDate" value="${esc(ev.date)}" /></div>
            <div class="field"><label>Start time</label><input type="time" id="evTime" value="${esc(ev.time)}" /></div>
            <div class="field"><label>End time</label><input type="time" id="evEnd" value="${esc(ev.endTime)}" /></div>
          </div>

          <div class="field"><label>${esc(t.linkLabel)}</label>
            <input type="url" id="evLink" value="${esc(ev.link)}" placeholder="https://…" inputmode="url" /></div>

          ${ev.type === 'inperson' ? `
            <div class="field"><label>Venue / address</label>
              <input id="evPlace" value="${esc(ev.place)}" placeholder="Club name, area, city" /></div>` : ''}

          <div class="field"><label>Details</label>
            <textarea id="evDetails" placeholder="What is this event about? Who should join?">${esc(ev.details)}</textarea></div>

          <div class="field"><label>Image (optional)</label>
            <div class="ev-image" id="evImage">
              ${ev.image
                ? `<img src="${Photos.url('evdraft|' + ev.id + '|' + (ev._stamp || ev.updatedAt), ev.image)}" alt="" />
                   <button type="button" class="ev-image-x" id="evImageClear">✕</button>`
                : `<span class="ev-image-ph">🖼<small>Tap to add a poster or photo</small></span>`}
            </div>
          </div>
        </div>`;

      $('#evType').onclick = (e) => {
        const b = e.target.closest('button[data-val]');
        if (!b) return;
        collect();
        ev.type = b.dataset.val;
        paint();                       // the link label and venue field follow the type
      };
      $('#evImage').onclick = async (e) => {
        if (e.target.closest('#evImageClear')) { collect(); ev.image = null; return paint(); }
        const f = await Photos.pickFile();
        if (!f) return;
        try {
          collect();
          ev.image = await Photos.compress(f, 1200, 0.8);
          ev._stamp = Date.now();
          paint();
        } catch (err) { toast('Could not use that image: ' + err.message); }
      };
    };

    /* reads whichever fields are on screen right now back onto the draft;
       the venue field only exists for an in-person event, so it may be absent */
    function collect() {
      const put = (key, id, trim) => {
        const el = $('#' + id);
        if (el) ev[key] = trim ? el.value.trim() : el.value;
      };
      put('title', 'evTitle', true);
      put('date', 'evDate');
      put('time', 'evTime');
      put('endTime', 'evEnd');
      put('link', 'evLink', true);
      put('place', 'evPlace', true);
      put('details', 'evDetails');
      return ev;
    }

    paint();
    $('#eventModalFoot').innerHTML = `
      <button class="btn btn-ghost btn-sm" data-close-event>Cancel</button>
      <button class="btn btn-primary btn-sm" id="evSave">${isNew ? '＋ Create event' : '💾 Save'}</button>`;

    $('#evSave').onclick = async () => {
      collect();
      if (!ev.title) return toast('Give the event a title');
      if (!ev.date) return toast('Pick a date for the event');
      if (ev.link && !/^https?:\/\//i.test(ev.link)) {
        return toast('The link should start with http:// or https://');
      }
      if (['teams', 'gmeet', 'zoom'].includes(ev.type) && !ev.link) {
        return toast('Add the meeting link for a ' + typeOf(ev.type).label.toLowerCase());
      }
      delete ev._stamp;
      ev.updatedAt = Date.now();
      await DB.putEvent(ev);
      closeModal();
      toast(isNew ? 'Event created' : 'Event saved');
      if (after) await after();
    };
  }

  /* ---------- full list, used by the events page ---------- */
  function listSection(list, after) {
    const { upcoming, past } = split(list);
    const row = (ev) => {
      const t = typeOf(ev.type);
      return `<button type="button" class="ev-row${isPast(ev) ? ' is-past' : ''}" data-event="${ev.id}">
        ${thumb(ev, 'ev-row-img')}
        <div class="ev-row-main">
          <b>${esc(ev.title || 'Untitled event')}</b>
          <small>${esc(prettyDate(ev.date))} · ${esc(timeLabel(ev))}</small>
          <div class="ev-badges">
            <span class="ev-badge" data-type="${ev.type}">${t.emoji} ${esc(t.label)}</span>
            <span class="ev-badge ghost">${esc(whenLabel(ev))}</span>
          </div>
        </div>
      </button>`;
    };
    return `
      ${upcoming.length ? `<h3 class="ev-section">Upcoming</h3>${upcoming.map(row).join('')}`
        : `<div class="empty"><span class="big">📅</span>No upcoming events.<br>Tap <b>＋ New event</b> to add one.</div>`}
      ${past.length ? `<h3 class="ev-section">Past</h3>${past.map(row).join('')}` : ''}`;
  }

  return { TYPES, typeOf, carousel, wire, listSection, openForm, openView, whenLabel, isPast, split };
})();
