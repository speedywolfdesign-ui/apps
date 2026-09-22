/* ============================================================
   db.js - IndexedDB storage for the BTC Transformation Tracker
   Stores
     participants : one per person being tracked (profile + weekly + final)
     recs         : daily records, key `${pid}|${date}`
     pics         : proof photos, key `${pid}|${stage}|${pose}` where stage is
                    "before" (taken at registration) or "after" (taken at export)
     events       : community events (calls, meets, meetups), shared by everyone
                    on the device and listed by upcoming date
     meta         : app level values (active participant id)
   v1 databases (single profile) are migrated into participant "p1";
   per-day photos from older versions are folded into before/after by
   migrateLegacyPhotos() on start up.
   ============================================================ */
const DB = (() => {
  const NAME = 'btc-tracker';
  const VERSION = 3;
  let _db = null;

  const recKey = (pid, date) => `${pid}|${date}`;
  const picKey = (pid, stage, pose) => `${pid}|${stage}|${pose}`;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        const tx = req.transaction;

        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('participants')) db.createObjectStore('participants', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('recs')) {
          const s = db.createObjectStore('recs', { keyPath: 'key' });
          s.createIndex('byPid', 'pid');
        }
        if (!db.objectStoreNames.contains('pics')) {
          const s = db.createObjectStore('pics', { keyPath: 'id' });
          s.createIndex('byPid', 'pid');
          s.createIndex('byPidDate', ['pid', 'date']);
        }
        if (!db.objectStoreNames.contains('events')) {
          const s = db.createObjectStore('events', { keyPath: 'id' });
          s.createIndex('byDate', 'date');
        }

        /* ---- migrate a v1 database (single profile, unscoped stores) ---- */
        if (e.oldVersion === 1 && db.objectStoreNames.contains('records')) {
          const pid = 'p1';
          const metaStore = tx.objectStore('meta');
          metaStore.get('profile').onsuccess = (ev) => {
            const profile = ev.target.result || {};
            metaStore.get('weekly').onsuccess = (ev2) => {
              const weekly = ev2.target.result || {};
              metaStore.get('final').onsuccess = (ev3) => {
                const final = ev3.target.result || {};
                tx.objectStore('participants').put({
                  id: pid, name: profile.name || 'Me',
                  clubNumber: profile.clubNumber || '', clubOperator: profile.clubOperator || '',
                  coach: profile.coach || '', goal: profile.goal || '',
                  startDate: profile.startDate || new Date().toISOString().slice(0, 10),
                  season: profile.season || '1', weekly, final, createdAt: Date.now()
                });
                metaStore.put(pid, 'activeParticipant');
                metaStore.delete('profile'); metaStore.delete('weekly'); metaStore.delete('final');

                tx.objectStore('records').getAll().onsuccess = (ev4) => {
                  const recsStore = tx.objectStore('recs');
                  (ev4.target.result || []).forEach(r =>
                    recsStore.put({ ...r, key: recKey(pid, r.date), pid }));

                  tx.objectStore('photos').getAll().onsuccess = (ev5) => {
                    const picsStore = tx.objectStore('pics');
                    (ev5.target.result || []).forEach(ph =>
                      picsStore.put({ id: `${pid}|${ph.date}|${ph.pose}`, pid, date: ph.date,
                        pose: ph.pose, blob: ph.blob, createdAt: ph.createdAt }));
                    db.deleteObjectStore('records');   // both copies done, drop the v1 stores
                    db.deleteObjectStore('photos');
                  };
                };
              };
            };
          };
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function store(name, mode) {
    return open().then(db => db.transaction(name, mode).objectStore(name));
  }
  function done(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ---------- meta ---------- */
  const getMeta = (key) => store('meta', 'readonly').then(s => done(s.get(key)));
  const setMeta = (key, val) => store('meta', 'readwrite').then(s => done(s.put(val, key)));

  /* ---------- participants ---------- */
  const listParticipants = () =>
    store('participants', 'readonly').then(s => done(s.getAll()))
      .then(list => list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  const getParticipant = (id) => store('participants', 'readonly').then(s => done(s.get(id)));
  const putParticipant = (p) => store('participants', 'readwrite').then(s => done(s.put(p)));

  function deleteParticipant(id) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(['participants', 'recs', 'pics'], 'readwrite');
      t.objectStore('participants').delete(id);
      const killBy = (name) => {
        const idx = t.objectStore(name).index('byPid');
        idx.openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
          const c = e.target.result;
          if (c) { t.objectStore(name).delete(c.primaryKey); c.continue(); }
        };
      };
      killBy('recs'); killBy('pics');
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }));
  }

  /* ---------- daily records ---------- */
  const getRecord = (pid, date) => store('recs', 'readonly').then(s => done(s.get(recKey(pid, date))));
  const putRecord = (pid, rec) =>
    store('recs', 'readwrite').then(s => done(s.put({ ...rec, key: recKey(pid, rec.date), pid })));
  const deleteRecord = (pid, date) => store('recs', 'readwrite').then(s => done(s.delete(recKey(pid, date))));
  const recordsFor = (pid) =>
    store('recs', 'readonly').then(s => done(s.index('byPid').getAll(IDBKeyRange.only(pid))))
      .then(list => list.sort((a, b) => (a.date < b.date ? 1 : -1)));   // newest first

  /* ---------- photos: 3 poses x 2 stages per participant ---------- */
  const putPhoto = (pid, stage, pose, blob, date) =>
    store('pics', 'readwrite').then(s => done(s.put({
      id: picKey(pid, stage, pose), pid, stage, pose, blob,
      date: date || new Date().toISOString().slice(0, 10), createdAt: Date.now()
    })));
  const getPhoto = (pid, stage, pose) => store('pics', 'readonly').then(s => done(s.get(picKey(pid, stage, pose))));
  const deletePhoto = (pid, stage, pose) => store('pics', 'readwrite').then(s => done(s.delete(picKey(pid, stage, pose))));
  const photosFor = (pid) =>
    store('pics', 'readonly').then(s => done(s.index('byPid').getAll(IDBKeyRange.only(pid))));
  const photosForStage = (pid, stage) => photosFor(pid).then(list => list.filter(p => p.stage === stage));
  const allPhotos = () => store('pics', 'readonly').then(s => done(s.getAll()));

  /* Older builds stored one photo set per day. Keep, per pose, the earliest shot
     as "before" and the latest as "after", then drop the day-keyed rows. */
  async function migrateLegacyPhotos() {
    const legacy = (await allPhotos()).filter(p => !p.stage);
    if (!legacy.length) return 0;
    const byPidPose = {};
    legacy.forEach(p => (byPidPose[p.pid + '|' + p.pose] = byPidPose[p.pid + '|' + p.pose] || []).push(p));
    const db = await open();
    await new Promise((resolve, reject) => {
      const t = db.transaction('pics', 'readwrite');
      const s = t.objectStore('pics');
      Object.values(byPidPose).forEach(shots => {
        shots.sort((a, b) => (a.date < b.date ? -1 : 1));
        const first = shots[0], last = shots[shots.length - 1];
        s.put({ ...first, id: picKey(first.pid, 'before', first.pose), stage: 'before' });
        if (last !== first) s.put({ ...last, id: picKey(last.pid, 'after', last.pose), stage: 'after' });
      });
      legacy.forEach(p => s.delete(p.id));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    return legacy.length;
  }

  /* photos captured while adding a participant who was never saved */
  async function purgeOrphanPhotos() {
    const ids = new Set((await listParticipants()).map(p => p.id));
    const orphans = (await allPhotos()).filter(p => !ids.has(p.pid));
    for (const o of orphans) await store('pics', 'readwrite').then(s => done(s.delete(o.id)));
    return orphans.length;
  }

  /* ---------- events ---------- */
  const listEvents = () => store('events', 'readonly').then(s => done(s.getAll()));
  const getEvent = (id) => store('events', 'readonly').then(s => done(s.get(id)));
  const putEvent = (ev) => store('events', 'readwrite').then(s => done(s.put(ev)));
  const deleteEvent = (id) => store('events', 'readwrite').then(s => done(s.delete(id)));

  /* ---------- wipe ---------- */
  function clearAll() {
    return open().then(db => new Promise((resolve, reject) => {
      const stores = ['meta', 'participants', 'recs', 'pics', 'events'];
      const t = db.transaction(stores, 'readwrite');
      stores.forEach(n => t.objectStore(n).clear());
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    }));
  }

  return {
    open, getMeta, setMeta,
    listParticipants, getParticipant, putParticipant, deleteParticipant,
    getRecord, putRecord, deleteRecord, recordsFor,
    putPhoto, getPhoto, deletePhoto, photosFor, photosForStage, allPhotos,
    migrateLegacyPhotos, purgeOrphanPhotos,
    listEvents, getEvent, putEvent, deleteEvent,
    clearAll
  };
})();
