/* ============================================================
   export.js - builds a standalone, printable HTML document that
   reproduces the two BTC sheets:
     Sheet 1 : 41 Days Transformation Tracker (habit grid, weekly
               progress check, final results)
     Sheet 2 : Activity Tracker (daily activity, recipe tracker,
               fuel program, detox)
     Sheet 3 : Before / After proof photos (front, right, back)
   Also produces CSV and JSON backups.
   ============================================================ */
const Exporter = (() => {

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const line = (v) => v ? `<span class="fill">${esc(v)}</span>` : '<span class="fill blank"></span>';
  const box  = (on) => `<span class="box${on ? ' on' : ''}">${on ? '✓' : ''}</span>`;
  const tick = (v) => v === true ? '<span class="yes">✓</span>'
                    : v === false ? '<span class="no">✗</span>' : '<span class="na"></span>';
  const yn = (v) => `${box(v === 'yes')} Yes &nbsp; ${box(v === 'no')} No`;

  /* ---------------- styles for the printed sheets ---------------- */
  const CSS = `
  @page{ size:A4 landscape; margin:8mm; }
  *{box-sizing:border-box}
  body{margin:0;background:#e9efea;font-family:"Segoe UI",Arial,"Noto Sans Devanagari",sans-serif;color:#15281c}
  .toolbar{position:sticky;top:0;background:#0f5c2e;color:#fff;padding:.6rem 1rem;display:flex;gap:.6rem;
    align-items:center;justify-content:space-between;flex-wrap:wrap;z-index:9}
  .toolbar button{background:#f7c948;border:0;border-radius:8px;padding:.5rem 1rem;font-weight:700;cursor:pointer;color:#4a3600}
  .toolbar .t{font-weight:700}
  .sheet{background:#fff;width:285mm;max-width:100%;margin:10px auto;padding:6mm;border:3px solid #0f5c2e;border-radius:6px}
  @media print{ body{background:#fff} .toolbar{display:none} .sheet{margin:0;border-width:2px;width:auto;page-break-after:always} .sheet:last-child{page-break-after:auto} }

  .hdr{display:flex;align-items:center;gap:8px;border-bottom:3px solid #0f5c2e;padding-bottom:5px;margin-bottom:6px}
  .hdr .logo{width:52px;height:52px;border-radius:50%;background:#0f5c2e;color:#fff;display:grid;place-items:center;
    font-weight:800;font-size:.6rem;text-align:center;line-height:1.05;flex:none;padding:4px}
  .hdr .org{font-size:.78rem;font-weight:800;color:#0f5c2e;line-height:1.05}
  .hdr .org small{display:block;font-weight:600;font-size:.58rem;color:#4b6b55;letter-spacing:.3px}
  .hdr .mid{flex:1;text-align:center}
  .hdr .mid h1{margin:0;font-size:1.5rem;color:#0f5c2e;letter-spacing:.5px}
  .hdr .mid .band{background:#0f5c2e;color:#fff;border-radius:4px;display:inline-block;padding:1px 10px;font-size:.8rem;font-weight:800;margin-top:2px}
  .hdr .mid .band em{color:#f7c948;font-style:normal}
  .hdr .mid .tag{font-size:.62rem;color:#a07400;font-style:italic;margin-top:2px}
  .goalbox{border:2px solid #0f5c2e;border-radius:6px;padding:4px 8px;min-width:190px}
  .goalbox h4{margin:0 0 2px;font-size:.72rem;color:#0f5c2e}
  .goalbox div{font-size:.62rem;margin:1px 0}

  .idrow{display:flex;gap:6px;border:1.5px solid #0f5c2e;border-radius:5px;padding:4px 6px;margin-bottom:6px;font-size:.66rem}
  .idrow > div{flex:1;display:flex;gap:4px;align-items:baseline;border-right:1px solid #cfe0d4;padding-right:6px}
  .idrow > div:last-child{border-right:0}
  .idrow b{color:#0f5c2e;white-space:nowrap}
  .fill{border-bottom:1px solid #6d8a78;flex:1;padding:0 3px;min-width:40px;display:inline-block}
  .fill.blank{min-height:.85em}

  .secbar{background:#0f5c2e;color:#fff;font-weight:800;font-size:.72rem;padding:3px 8px;border-radius:4px 12px 12px 4px;
    display:inline-block;margin:6px 0 4px}
  .legend{float:right;background:#fdf3cf;border-radius:4px;padding:2px 8px;font-size:.6rem;font-weight:700}

  table{border-collapse:collapse;width:100%}
  .grid td,.grid th{border:1px solid #9cbba8;text-align:center;font-size:.58rem;padding:1px 0;height:15px}
  .grid th{background:#eaf4ec;color:#0f5c2e;font-weight:800}
  .grid .rowh{text-align:left;background:#f4faf5;font-weight:800;color:#15281c;font-size:.6rem;padding:0 4px;width:96px}
  .grid .rowh small{display:block;font-weight:500;color:#5d6f63;font-size:.5rem}
  .grid .tot{background:#eaf4ec;font-weight:800;width:38px}
  .grid .scorerow td{background:#fbfce9;font-weight:700}
  .grid .yes{color:#15803d;font-weight:800}
  .grid .no{color:#d64545;font-weight:800}
  .maxscore{text-align:center;font-size:.66rem;font-weight:800;color:#0f5c2e;margin:4px 0}
  .maxscore em{color:#a07400;font-style:italic;font-weight:600}

  .cols{display:flex;gap:6px;align-items:stretch}
  .panel{border:2px solid #0f5c2e;border-radius:6px;padding:5px;flex:1}
  .panel h3{margin:0 0 4px;font-size:.7rem;color:#0f5c2e;text-align:center;background:#eaf4ec;border-radius:4px;padding:2px}
  .weeks{display:flex;gap:4px}
  .week{border:1.5px solid #9cbba8;border-radius:5px;padding:4px;flex:1;font-size:.58rem}
  .week h5{margin:0 0 3px;font-size:.58rem;color:#0f5c2e}
  .week div{margin:2px 0}
  .faces{display:flex;gap:3px;margin-top:3px;text-align:center}
  .faces span{flex:1;font-size:.5rem;font-weight:700;color:#5d6f63}
  .faces span b{display:block;font-size:.8rem}
  .faces span.on{color:#0f5c2e}
  .faces span.on b{filter:none}
  .box{display:inline-grid;place-items:center;width:11px;height:11px;border:1.2px solid #4b6b55;border-radius:2px;
    font-size:.6rem;line-height:1;vertical-align:middle;color:#15803d;font-weight:800}
  .box.on{background:#dff3e4;border-color:#15803d}

  .final div{font-size:.66rem;margin:5px 0;display:flex;gap:5px;align-items:baseline}
  .final b{color:#0f5c2e;white-space:nowrap}
  .commit{background:#fdf3cf;border-radius:4px;text-align:center;font-weight:800;font-size:.64rem;color:#0f5c2e;padding:2px;margin-top:4px}

  .foot{background:#0f5c2e;color:#fff;border-radius:5px;margin-top:6px;padding:4px;display:flex;justify-content:space-around;
    font-size:.56rem;font-weight:700;text-align:center;gap:4px}
  .foot span b{display:block;font-size:.9rem}

  .act td,.act th{border:1px solid #9cbba8;font-size:.6rem;padding:2px 4px}
  .act th{background:#eaf4ec;color:#0f5c2e;font-size:.56rem;text-align:center}
  .act td.c{text-align:center}
  .actcols{display:flex;gap:5px;align-items:flex-start}
  .actcols table{flex:1}
  .recipe{border:1.5px solid #9cbba8;border-radius:6px;padding:4px;margin-bottom:6px;background:#f6fbf7}
  .recipe h5{margin:0 0 3px;font-size:.64rem;color:#0f5c2e}
  .prog label{display:block;font-size:.6rem;margin:2px 0}
  .note{font-size:.56rem;color:#5d6f63;text-align:center;margin-top:4px;font-style:italic}

  .pairs{display:flex;gap:8px;justify-content:center;align-items:flex-start;flex-wrap:wrap;margin-bottom:6px}
  .pair{border:2px solid #0f5c2e;border-radius:6px;padding:5px;background:#f6fbf7}
  .pair > h4{margin:0 0 4px;text-align:center;font-size:.7rem;color:#0f5c2e;background:#eaf4ec;border-radius:4px;padding:2px}
  .ba{display:flex;gap:8px;justify-content:center;align-items:flex-start}
  .ba .side{text-align:center}
  .ba .side img{width:124px;aspect-ratio:3/4;object-fit:cover;border:2px solid #0f5c2e;border-radius:6px;background:#e3e8e4}
  .ba .side img.none{border-style:dashed}
  .ba .side h4{margin:3px 0 0;font-size:.68rem;color:#0f5c2e}
  .ba .side .sub{font-size:.54rem;color:#5d6f63}
  .ba .arrow{align-self:center;font-size:1.4rem;color:#f7c948}
  .proofnote{font-size:.58rem;color:#5d6f63;text-align:center;font-style:italic;margin:2px 0 6px}
  .stats{display:flex;gap:6px;margin:6px 0}
  .stats div{flex:1;border:1.5px solid #9cbba8;border-radius:5px;text-align:center;padding:3px;font-size:.56rem;color:#5d6f63}
  .stats div b{display:block;font-size:.95rem;color:#0f5c2e}
  `;

  /* ---------------- shared header ---------------- */
  function header(p, title, sub, tagline) {
    const g = (k) => box(p.goal === k);
    return `
    <div class="hdr">
      <div class="logo">FAMILY<br>CARE</div>
      <div class="org">FAMILY CARE<br>COMMUNITY<small>LET'S TRANSFORM TOGETHER</small></div>
      <div class="mid">
        <h1>BTC ${esc(title)}</h1>
        <div class="band">${esc(sub)}</div>
        <div class="tag">${esc(tagline)}</div>
      </div>
      <div class="goalbox">
        <h4>MY GOAL (Select One)</h4>
        <div>${g('weight-loss')} <b>Weight Loss</b> (Reduce Weight)</div>
        <div>${g('weight-gain')} <b>Weight Gain</b> (Increase Weight)</div>
        <div>${g('fat-loss')} <b>Fat Loss</b> (Reduce Body Fat &amp; Build Muscle)</div>
        <div>${g('overall')} <b>Overall Body Transformation</b></div>
      </div>
    </div>
    <div class="idrow">
      <div><b>NAME (Full Name):</b> ${line(p.name)}</div>
      <div><b>CLUB NUMBER &amp; CLUB OPERATOR NAME:</b> ${line([p.clubNumber, p.clubOperator].filter(Boolean).join(' - '))}</div>
      <div><b>COACH NAME:</b> ${line(p.coach)}</div>
    </div>
    <div class="idrow">
      <div><b>GENDER:</b> ${line(p.genderLabel)}</div>
      <div><b>AGE:</b> ${line(p.age ? p.age + ' yrs' : '')}</div>
      <div><b>HEIGHT:</b> ${line(p.height ? p.height + ' cm' : '')}</div>
      <div><b>START WEIGHT:</b> ${line(p.startWeight ? p.startWeight + ' kg' : '')}</div>
      <div><b>START DATE (DAY 1):</b> ${line(p.startDate)}</div>
    </div>`;
  }

  const FOOT = `
    <div class="foot">
      <span><b>🥤</b>DRINK YOUR FUEL<br>(TWO TIME)</span>
      <span><b>🏃</b>WORKOUT<br>DAILY</span>
      <span><b>💧</b>DRINK WATER<br>AS PER REQUIREMENT</span>
      <span><b>🍚</b>EAT CLEAN<br>STAY FIT</span>
      <span><b>👣</b>TAKE 5K-10K<br>STEPS DAILY</span>
      <span><b>🌙</b>SLEEP WELL<br>7 TO 8 HOURS</span>
    </div>`;

  /* ---------------- Sheet 1: habit tracker ---------------- */
  function sheetHabits(data) {
    const { profile, days, habits, weeks, final, totals } = data;

    const dayCells = days.map(d => `<th>${d.day}</th>`).join('');
    const rows = habits.map(h => {
      const cells = days.map(d => {
        const r = d.record;
        if (!r) return '<td></td>';
        return `<td>${tick(!!r.habits[h.key])}</td>`;
      }).join('');
      const total = days.filter(d => d.record && d.record.habits[h.key]).length;
      return `<tr>
        <td class="rowh">${h.emoji} ${esc(h.label)}<small>${esc(h.sub)}</small></td>
        ${cells}<td class="tot">${total}/${days.length}</td></tr>`;
    }).join('');

    const scoreCells = days.map(d => {
      if (!d.record) return '<td>/5</td>';
      const s = habits.filter(h => d.record.habits[h.key]).length;
      return `<td>${s}/5</td>`;
    }).join('');

    const weekCards = weeks.map(w => `
      <div class="week">
        <h5>WEEK ${w.n} (DAY ${w.from}–${w.to})</h5>
        <div>WEIGHT (kg): ${line(w.weight)}</div>
        <div>INCHES LOST (inch): ${line(w.inches)}</div>
        <div>HOW DID YOU FEEL?</div>
        <div class="faces">
          <span class="${w.feel === 'poor' ? 'on' : ''}"><b>${w.feel === 'poor' ? '🙁' : '😕'}</b>POOR ${box(w.feel === 'poor')}</span>
          <span class="${w.feel === 'okay' ? 'on' : ''}"><b>😐</b>OKAY ${box(w.feel === 'okay')}</span>
          <span class="${w.feel === 'great' ? 'on' : ''}"><b>🙂</b>GREAT ${box(w.feel === 'great')}</span>
        </div>
      </div>`).join('');

    return `<section class="sheet">
      ${header(profile, 'SEASON ' + (profile.season || '1'), '41 DAYS TRANSFORMATION TRACKER', 'Your Transformation Journey Starts Here!')}
      <div class="secbar">DAILY HABIT TRACKER – COMPLETE EVERY DAY</div>
      <span class="legend">Tick <span style="color:#15803d">✓</span> if done &nbsp; <span style="color:#d64545">✗</span> if not done</span>
      <table class="grid">
        <tr><th class="rowh">ROUTINE</th>${dayCells}<th class="tot">TOTAL</th></tr>
        ${rows}
        <tr class="scorerow"><td class="rowh">DAILY SCORE<small>(out of 5)</small></td>${scoreCells}
          <td class="tot">${totals.points}/${days.length * 5}</td></tr>
      </table>
      <div class="maxscore">★ MAX SCORE: ${days.length * 5} POINTS (5 PER DAY) &nbsp;|&nbsp;
        <em>The more consistent you are, the better your results!</em> ★</div>
      <div class="cols">
        <div class="panel" style="flex:3">
          <h3>WEEKLY PROGRESS CHECK</h3>
          <div class="weeks">${weekCards}</div>
        </div>
        <div class="panel final" style="flex:1.1">
          <h3>FINAL RESULTS (DAY 41)</h3>
          <div><b>⚖ FINAL WEIGHT (kg):</b> ${line(final.weight)}</div>
          <div><b>📏 TOTAL INCHES LOST (inch):</b> ${line(final.inches)}</div>
          <div><b>★ TOTAL POINTS / CONSISTENCY:</b> ${line(final.points || `${totals.points}/${days.length * 5} (${totals.consistency}%)`)}</div>
          <div class="commit">I STAYED COMMITTED FOR 41 DAYS! 💪 ${box(!!final.committed)}</div>
          <div><b>SIGNATURE:</b> ${line(final.signature)} <b>DATE:</b> ${line(final.date)}</div>
        </div>
      </div>
      ${FOOT}
    </section>`;
  }

  /* ---------------- Sheet 2: activity tracker ---------------- */
  function sheetActivity(data) {
    const { profile, days } = data;

    const actRow = (d) => {
      const a = (d.record && d.record.activity) || {};
      return `<tr>
        <td class="c">${d.day}</td>
        <td class="c">${esc(d.date.slice(5))}</td>
        <td>${esc(a.name)}</td>
        <td class="c">${a.percent !== '' && a.percent != null ? esc(a.percent) + '%' : ''}</td>
        <td class="c">${a.points !== '' && a.points != null ? esc(a.points) + '/10' : ''}</td>
        <td>${esc(a.fuelAdded)}</td>
      </tr>`;
    };
    /* long ranges are split into side-by-side columns so one sheet stays one page */
    const PER_COL = 21;
    const chunks = [];
    for (let i = 0; i < days.length; i += PER_COL) chunks.push(days.slice(i, i + PER_COL));
    const actTables = chunks.map(chunk => `
      <table class="act">
        <tr><th>DAY<br>दिन</th><th>DATE</th><th>ACTIVITY / गतिविधि</th><th>%</th><th>POINTS<br>(of 10)</th>
            <th>FUEL ADDED<br>(which one?)</th></tr>
        ${chunk.map(actRow).join('')}
      </table>`).join('');

    /* recipes + fuel program + detox are taken from the most recent record that has them */
    const latest = data.latestExtras;
    const recipeBlock = (title, emoji, r) => `
      <div class="recipe">
        <h5>${emoji} ${esc(title)}</h5>
        <table class="act">
          <tr><th style="width:62%">Recipe tried</th><th>Posted in group?</th></tr>
          <tr><td>${esc(r.tried)}</td><td class="c">${yn(r.posted)}</td></tr>
        </table>
      </div>`;

    const extras = (latest.fuelProgram.extras || []).map((x, i) => `
      <tr><td class="c">${i + 1}</td><td>${esc(x.name)}</td><td class="c">${yn(x.added)}</td></tr>`).join('');

    return `<section class="sheet">
      ${header(profile, 'ACTIVITY TRACKER', 'छोटे-छोटे कदम, बड़े बदलाव!', 'Small steps today, big change tomorrow')}
      <div class="cols">
        <div class="panel" style="flex:${1 + chunks.length * .8}">
          <h3>1 &nbsp; DAILY ACTIVITY TRACKER / दैनिक गतिविधि ट्रैकर</h3>
          <div class="actcols">${actTables}</div>
          <div class="note">लगातार प्रयास ही बदलाव लाते हैं! — Consistent effort brings change.</div>
        </div>
        <div class="panel" style="flex:1">
          <h3>2 &nbsp; RECIPE TRACKER / रेसिपी ट्रैकर</h3>
          ${recipeBlock('Healthy Fuel Recipe / हेल्दी फ्यूल रेसिपी', '🥤', latest.recipes.healthy)}
          ${recipeBlock('Dyno Fuel Laddu Recipe / डायनो फ्यूल लड्डू रेसिपी', '🍡', latest.recipes.laddu)}
          <div class="note">स्वस्थ रेसिपी… स्वस्थ परिवार!</div>
        </div>
        <div class="panel" style="flex:1">
          <h3>3 &nbsp; FUEL PROGRAM / फ्यूल प्रोग्राम</h3>
          <div class="prog">
            <label>${box(latest.fuelProgram.selected === 'basic')} <b>Basic Program</b> (एसएमएस प्रोग्राम)</label>
            <label>${box(latest.fuelProgram.selected === 'personalized')} <b>Personalized Program</b> (प्रोटीन/फाइबर आधारित)</label>
            <label>${box(latest.fuelProgram.selected === 'advanced')} <b>Advanced Program</b> (एनर्जी/डायनो फ्यूल/हाइड्रेट)</label>
          </div>
          <h3 style="margin-top:6px">➕ ADDITIONAL FUEL ADDED / अतिरिक्त फ्यूल</h3>
          <table class="act">
            <tr><th style="width:26px">#</th><th>FUEL NAME / फ्यूल का नाम</th><th style="width:96px">ADDED? (Yes/No)</th></tr>
            ${extras}
          </table>
        </div>
        <div class="panel" style="flex:.6">
          <h3>4 &nbsp; DETOX / डिटॉक्स</h3>
          <p style="font-size:.6rem">क्या आपने 2 दिन का डिटॉक्स डे पूरा किया?<br><br>
            <b>Completed the 2-day detox?</b></p>
          <p style="font-size:.7rem;text-align:center">${yn(latest.detox)}</p>
          <div class="note">डिटॉक्स रिफ्रेश रीबूट! 💚</div>
          <div class="stats" style="flex-direction:column">
            <div><b>${data.totals.logged}</b>DAYS LOGGED</div>
            <div><b>${data.totals.points}</b>HABIT POINTS</div>
            <div><b>${data.totals.activityPoints}</b>ACTIVITY POINTS</div>
          </div>
        </div>
      </div>
      ${FOOT}
    </section>`;
  }

  /* ---------------- Sheet 3: before / after proof ---------------- */
  function sheetPhotos(data) {
    const { profile, before, after, poses, range, totals } = data;
    if (!(before || []).length && !(after || []).length) return '';

    const find = (list, pose) => (list || []).find(p => p.pose === pose) || null;
    const side = (p, title) => `
      <div class="side">
        <img class="${p ? '' : 'none'}" src="${p ? p.dataURL : ''}" alt="${esc(title)}" />
        <h4>${esc(title)}</h4>
        <div class="sub">${p ? esc(p.date) : 'not taken'}</div>
      </div>`;

    const pairs = (poses || []).map(po => `
      <div class="pair">
        <h4>${esc(po.label.toUpperCase())}</h4>
        <div class="ba">
          ${side(find(before, po.key), 'BEFORE')}
          <div class="arrow">➜</div>
          ${side(find(after, po.key), 'AFTER')}
        </div>
      </div>`).join('');

    const dateOf = (list) => (list || []).length ? list[0].date : '';
    return `<section class="sheet">
      ${header(profile, 'BEFORE & AFTER PROOF', `${range.from} → ${range.to}`,
               'Consistency today, transformation tomorrow')}
      <div class="secbar">BEFORE &amp; AFTER — ALL THREE POSES</div>
      <div class="proofnote">Before photos taken at registration${dateOf(before) ? ' on ' + esc(dateOf(before)) : ''} ·
        After photos taken at export${dateOf(after) ? ' on ' + esc(dateOf(after)) : ''}</div>
      <div class="pairs">${pairs}</div>
      <div class="stats">
        <div><b>${totals.logged}</b>DAYS LOGGED</div>
        <div><b>${totals.points}</b>HABIT POINTS</div>
        <div><b>${totals.consistency}%</b>CONSISTENCY</div>
        <div><b>${(before || []).length + (after || []).length}/6</b>PROOF PHOTOS</div>
      </div>
      ${FOOT}
    </section>`;
  }

  /* ---------------- full document ---------------- */
  function buildHTML(data) {
    const parts = [];
    if (data.options.habits) parts.push(sheetHabits(data));
    if (data.options.activity) parts.push(sheetActivity(data));
    if (data.options.photos) parts.push(sheetPhotos(data));

    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>BTC Tracker — ${esc(data.profile.name || 'Export')} (${esc(data.range.from)} to ${esc(data.range.to)})</title>
<style>${CSS}</style></head><body>
<div class="toolbar">
  <span class="t">BTC Transformation Tracker · ${esc(data.profile.name || '')} · ${esc(data.range.from)} → ${esc(data.range.to)}</span>
  <button onclick="window.print()">🖨 Print / Save as PDF</button>
</div>
${parts.join('\n')}
</body></html>`;
  }

  /* ---------------- CSV ---------------- */
  function buildCSV(data) {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const head = ['Date', 'Day', 'Fuel', 'Sleep', 'Water', 'Lunch', 'Steps', 'Daily Score',
      'Weight (kg)', 'Inches', 'Activity', 'Activity %', 'Activity Points', 'Fuel Program Added',
      'Healthy Recipe Tried', 'Healthy Posted', 'Laddu Recipe Tried', 'Laddu Posted',
      'Fuel Program', 'Extra Fuels', 'Detox 2-day', 'Notes'];
    const rows = data.days.filter(d => d.record).map(d => {
      const r = d.record, h = r.habits, a = r.activity || {};
      const score = data.habits.filter(x => h[x.key]).length;
      const extras = (r.fuelProgram.extras || []).filter(x => x.name)
        .map(x => `${x.name}${x.added === 'yes' ? ' (added)' : ''}`).join('; ');
      return [r.date, d.day, h.fuel ? 'Y' : 'N', h.sleep ? 'Y' : 'N', h.water ? 'Y' : 'N',
        h.lunch ? 'Y' : 'N', h.steps ? 'Y' : 'N', `${score}/5`, r.weight, r.inches,
        a.name, a.percent, a.points, a.fuelAdded,
        r.recipes.healthy.tried, r.recipes.healthy.posted, r.recipes.laddu.tried, r.recipes.laddu.posted,
        r.fuelProgram.selected, extras, r.detox, r.notes].map(q).join(',');
    });
    return [head.map(q).join(','), ...rows].join('\r\n');
  }

  return { buildHTML, buildCSV };
})();
