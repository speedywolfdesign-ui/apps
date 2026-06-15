/* ===== AI PANEL COMPONENT =====
 * Full-action AI assistant. Covers every workflow on the contracts page:
 *   create, view, delete, duplicate, filter, clear filter,
 *   summarize, list, navigate, create trend.
 */
(function () {

  /* ══════════════════════════════════════════
     PAGE CONTEXT
  ══════════════════════════════════════════ */
  var PAGE_CONTEXTS = {
    'contracts.html': {
      icon: 'pi-file',
      label: 'Contracts',
      greeting: 'Hi! I can manage your contracts directly — create, view, delete, duplicate, filter, or summarize. Just tell me what you need.',
      chips: ['Summarize contracts', 'Create NEC4 contract', 'View G2-CON-5606', 'Filter active', 'Create trend']
    },
    'project-home.html': {
      icon: 'pi-home',
      label: 'Project overview',
      greeting: "Hi! I can analyze your project performance, show forecast data, explain CPI/SPI, assess risks, or navigate anywhere. What would you like to know?",
      chips: ['Show forecast data', 'Explain cost overrun', 'What\'s at risk?', 'Summarize project']
    },
    'projects.html': {
      icon: 'pi-th-large',
      label: 'Projects',
      greeting: "Hi! I can help you find projects, compare performance, or answer portfolio questions.",
      chips: ['List active projects', 'Compare projects', 'Find at-risk projects', 'Summarize portfolio']
    },
    'home.html': {
      icon: 'pi-home',
      label: 'Home',
      greeting: "Hi! I can help you navigate Contruent, find projects, or answer any questions.",
      chips: ['What can I do here?', 'Find a project', 'Show recent activity', 'Explain the dashboard']
    },
    'scurve-forecast.html': {
      icon: 'pi-chart-line',
      label: 'S-curve forecast',
      greeting: "Hi! I can control the S-curve forecast directly — simulate time, switch accounts, run AI analysis, adjust driver weights, or answer what-if questions. Try a suggestion below.",
      chips: ['Simulate to Jan 2026', 'Run AI forecast', 'Switch to MEP Systems', 'What\'s the current EAC?', 'What if SPI improves to 0.95?']
    }
  };

  function getPageContext() {
    var page = window.location.pathname.split('/').pop() || 'home.html';
    return PAGE_CONTEXTS[page] || PAGE_CONTEXTS['home.html'];
  }

  /* ══════════════════════════════════════════
     DYNAMIC CSS
  ══════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('ai-panel-step-styles')) return;
    var s = document.createElement('style');
    s.id = 'ai-panel-step-styles';
    s.textContent = [
      '.ai-steps{margin-top:10px;display:flex;flex-direction:column;gap:5px}',
      '.ai-step{display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.5}',
      '.ai-step-ic{width:15px;flex-shrink:0;font-size:11px}',
      '.ai-step-pending .ai-step-ic,.ai-step-pending .ai-step-lbl{color:#94a3b8}',
      '.ai-step-running .ai-step-ic{color:#3b82f6}.ai-step-running .ai-step-lbl{color:#1e293b;font-weight:500}',
      '.ai-step-done    .ai-step-ic{color:#22c55e}.ai-step-done    .ai-step-lbl{color:#475569}',
      '.ai-step-error   .ai-step-ic{color:#ef4444}.ai-step-error   .ai-step-lbl{color:#7f1d1d}',
      '@keyframes ai-fill-pulse{',
      '0%{outline:2px solid rgba(59,130,246,.7);background:rgba(59,130,246,.10)}',
      '80%{outline:2px solid rgba(59,130,246,.2)}',
      '100%{outline:2px solid transparent;background:transparent}}',
      '.ai-field-highlight{animation:ai-fill-pulse 1.1s ease forwards;border-radius:4px}',
      '.ai-result-list{margin:8px 0 0;padding-left:16px;font-size:12px;line-height:1.8}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════
     PANEL HTML
  ══════════════════════════════════════════ */
  function injectPanel() {
    if (document.getElementById('aiPanel')) return;
    injectStyles();
    var ctx = getPageContext();
    var chipsHtml = ctx.chips.map(function(c) {
      return '<button class="ai-suggestion-chip" onclick="sendAiSuggestion(this)">' + c + '</button>';
    }).join('');

    var panel = document.createElement('div');
    panel.className = 'ai-panel';
    panel.id = 'aiPanel';
    panel.innerHTML = `
      <div class="ai-panel-header">
        <div class="ai-panel-title">
          <div class="ai-panel-title-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L9.5 5.5L14 7L9.5 8.5L8 13L6.5 8.5L2 7L6.5 5.5L8 1Z" fill="white"/>
              <path d="M13 1L13.75 3.25L16 4L13.75 4.75L13 7L12.25 4.75L10 4L12.25 3.25L13 1Z" fill="white" opacity="0.7"/>
            </svg>
          </div>
          AI assistant
        </div>
        <button class="ai-panel-close" onclick="closeAiPanel()" title="Close">
          <i class="pi pi-times"></i>
        </button>
      </div>

      <div class="ai-panel-context">
        <i class="pi ${ctx.icon}"></i>
        <strong>${ctx.label}</strong>&ensp;·&ensp;<strong data-proj="name">Cisco Systems</strong>
      </div>

      <div class="ai-suggestions">${chipsHtml}</div>

      <div class="ai-messages" id="aiMessages">
        <div class="ai-message ai-message-assistant">
          ${botAvatar()}
          <div class="ai-message-bubble">${ctx.greeting}</div>
        </div>
      </div>

      <div class="ai-panel-footer">
        <div class="ai-input-wrap">
          <textarea class="ai-input" id="aiInput"
            placeholder="Ask anything or give a command..."
            rows="1"
            onkeydown="handleAiKey(event)"
            oninput="autoResizeAiInput(this)"></textarea>
          <button class="ai-send-btn" onclick="sendAiMessage()" title="Send">
            <i class="pi pi-send"></i>
          </button>
        </div>
        <div class="ai-panel-footer-note">AI can make mistakes. Verify important information.</div>
      </div>
    `;
    document.body.appendChild(panel);
    if (typeof applyProjectContext === 'function') applyProjectContext();
  }

  /* ══════════════════════════════════════════
     MULTI-STEP ENGINE
  ══════════════════════════════════════════ */
  var _logSeq = 0;

  function appendActionLog(intro, steps) {
    var container = document.getElementById('aiMessages');
    if (!container) return null;
    var logId = 'ai-log-' + (++_logSeq);
    var stepsHtml = steps.map(function(s, i) {
      return '<div class="ai-step ai-step-pending" id="' + logId + '-' + i + '">'
        + '<span class="ai-step-ic"><i class="pi pi-clock"></i></span>'
        + '<span class="ai-step-lbl">' + esc(s.label) + '</span>'
        + '</div>';
    }).join('');
    var div = document.createElement('div');
    div.className = 'ai-message ai-message-assistant';
    div.innerHTML = botAvatar()
      + '<div class="ai-message-bubble">' + intro
      + (steps.length ? '<div class="ai-steps">' + stepsHtml + '</div>' : '')
      + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return logId;
  }

  function setStepState(logId, idx, state) {
    var el = document.getElementById(logId + '-' + idx);
    if (!el) return;
    el.className = 'ai-step ai-step-' + state;
    var ic = el.querySelector('.ai-step-ic');
    if (state === 'running') ic.innerHTML = '<i class="pi pi-spin pi-spinner"></i>';
    else if (state === 'done')  ic.innerHTML = '<i class="pi pi-check-circle"></i>';
    else if (state === 'error') ic.innerHTML = '<i class="pi pi-times-circle"></i>';
    var c = document.getElementById('aiMessages');
    if (c) c.scrollTop = c.scrollHeight;
  }

  function runSteps(logId, steps, idx) {
    idx = idx || 0;
    if (idx >= steps.length) return;
    setStepState(logId, idx, 'running');
    setTimeout(function() {
      var ok = true;
      try { ok = steps[idx].fn() !== false; } catch(e) { ok = false; }
      setStepState(logId, idx, ok === false ? 'error' : 'done');
      runSteps(logId, steps, idx + 1);
    }, steps[idx].delay !== undefined ? steps[idx].delay : 700);
  }

  /* Fill a field and flash it so the user sees the AI working */
  window.aiFillField = function(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].value === value || el.options[i].text === value) {
          el.selectedIndex = i; break;
        }
      }
    } else {
      el.value = value;
    }
    el.classList.remove('ai-field-highlight');
    void el.offsetWidth;
    el.classList.add('ai-field-highlight');
    setTimeout(function() { el.classList.remove('ai-field-highlight'); }, 1200);
  };
  var aiFillField = window.aiFillField;

  /* ══════════════════════════════════════════
     ENTITY EXTRACTORS
  ══════════════════════════════════════════ */

  function extractContractType(text) {
    var m = text.match(/\b(NEC4|FIDIC)\b/i);
    return m ? m[1].toUpperCase() : '';
  }

  function extractContractId(text) {
    var m = text.match(/\b([A-Z][A-Z0-9]*-CON-\d+|CON-\d+)\b/i);
    return m ? m[1].toUpperCase() : '';
  }

  function extractDescription(text) {
    var m = text.match(/["']([^"']{4,})["']/);
    if (m) return m[1];
    m = text.match(/(?:for|called|titled|named|description[:\s]+)\s+(.+?)(?:\s*,|\s+and\s|\s+submit|\s+draft|$)/i);
    if (m) return m[1].trim();
    return '';
  }

  function extractFilterQuery(text) {
    if (/\bactive\b/i.test(text))    return 'active';
    if (/\bdraft\b/i.test(text))     return 'draft';
    if (/\bsubmit/i.test(text))      return 'submitted';
    if (/\bnec4\b/i.test(text))      return 'NEC4';
    if (/\bfidic\b/i.test(text))     return 'FIDIC';
    if (/\bg2\b/i.test(text))        return 'G2';
    if (/\bmanual\b/i.test(text))    return 'Manual';
    return '';
  }

  /* ══════════════════════════════════════════
     LIVE DATA HELPERS  (read window.CONTRACTS)
  ══════════════════════════════════════════ */

  function getContracts() {
    return window.CONTRACTS || [];
  }

  function findContractIdx(id) {
    var list = getContracts();
    var u = id.toUpperCase();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id.toUpperCase() === u) return i;
    }
    return -1;
  }

  function liveContractSummary() {
    var list = getContracts();
    if (!list.length) return 'No contracts found in this project yet.';
    var active = 0, draft = 0, submitted = 0, types = {};
    list.forEach(function(c) {
      if (c.status === 'ACTIVE')     active++;
      if (c.status === 'DRAFT')      draft++;
      if (c.status === 'SUBMITTED')  submitted++;
      types[c.type] = (types[c.type] || 0) + 1;
    });
    var typeStr = Object.keys(types).map(function(t) {
      return '<strong>' + t + '</strong> (' + types[t] + ')';
    }).join(', ');
    var parts = [];
    if (active)    parts.push(active    + ' Active');
    if (submitted) parts.push(submitted + ' Submitted');
    if (draft)     parts.push(draft     + ' Draft');
    return '<strong>' + list.length + ' contract' + (list.length > 1 ? 's' : '') + '</strong> in this project. '
      + 'Type' + (Object.keys(types).length > 1 ? 's' : '') + ': ' + typeStr + '. '
      + 'Status: ' + parts.join(', ') + '.';
  }

  function liveContractList() {
    var list = getContracts();
    if (!list.length) return 'No contracts in this project yet.';
    var rows = list.map(function(c) {
      return '<li><strong>' + c.id + '</strong> — ' + c.type + ' — '
        + c.description + ' <em>(' + c.status + ')</em></li>';
    }).join('');
    return list.length + ' contract' + (list.length > 1 ? 's' : '') + ':'
      + '<ul class="ai-result-list">' + rows + '</ul>';
  }

  /* ══════════════════════════════════════════
     STEP BUILDERS
  ══════════════════════════════════════════ */

  function buildViewContractSteps(id, idx) {
    return [
      { label: 'Locating contract ' + id, delay: 400, fn: function() {} },
      { label: 'Opening contract detail', delay: 650, fn: function() {
        if (typeof openContractDetail === 'function') openContractDetail(idx);
      }}
    ];
  }

  function buildDeleteContractSteps(id) {
    return [
      { label: 'Locating contract ' + id, delay: 400, fn: function() {} },
      { label: 'Removing contract from list', delay: 700, fn: function() {
        if (typeof deleteContract === 'function') {
          var ok = deleteContract(id);
          if (!ok) throw new Error('not found');
        }
      }},
      { label: 'Table refreshed', delay: 350, fn: function() {} }
    ];
  }

  function buildDuplicateContractSteps(id) {
    return [
      { label: 'Locating contract ' + id, delay: 400, fn: function() {} },
      { label: 'Creating duplicate (saved as Draft)', delay: 800, fn: function() {
        if (typeof duplicateContract === 'function') {
          var ok = duplicateContract(id);
          if (!ok) throw new Error('not found');
        }
      }},
      { label: 'Table refreshed', delay: 350, fn: function() {} }
    ];
  }

  function buildCreateContractSteps(text) {
    var type     = extractContractType(text);
    var desc     = extractDescription(text);
    var doSubmit = /\bsubmit\b/i.test(text);
    var doDraft  = /\bdraft\b/i.test(text);
    var steps    = [];

    steps.push({ label: 'Opening create contract form', delay: 500, fn: function() {
      if (typeof openCreateContractModal === 'function') openCreateContractModal();
    }});

    if (type) {
      steps.push({ label: 'Setting contract type to ' + type, delay: 800, fn: function() {
        aiFillField('ccContractTypeSelect', type);
      }});
    }

    if (desc) {
      steps.push({ label: 'Filling description: "' + desc + '"', delay: 700, fn: function() {
        aiFillField('ccDescriptionInput', desc);
      }});
    }

    if (doSubmit) {
      steps.push({ label: 'Submitting contract', delay: 1000, fn: function() {
        if (typeof submitContract === 'function') submitContract();
      }});
    } else if (doDraft) {
      steps.push({ label: 'Saving as draft', delay: 1000, fn: function() {
        if (typeof saveContractAsDraft === 'function') saveContractAsDraft();
      }});
    }

    return steps;
  }

  function buildFilterSteps(query) {
    return [
      { label: 'Typing "' + query + '" into search bar', delay: 500, fn: function() {
        var el = document.getElementById('contractsSearch');
        if (el) {
          el.value = query;
          el.classList.remove('ai-field-highlight');
          void el.offsetWidth;
          el.classList.add('ai-field-highlight');
          setTimeout(function() { el.classList.remove('ai-field-highlight'); }, 1200);
        }
        if (typeof filterContracts === 'function') filterContracts(query);
      }},
      { label: 'Table filtered — showing results', delay: 350, fn: function() {} }
    ];
  }

  function buildClearFilterSteps() {
    return [
      { label: 'Clearing search filter', delay: 400, fn: function() {
        var el = document.getElementById('contractsSearch');
        if (el) {
          el.value = '';
          el.classList.remove('ai-field-highlight');
          void el.offsetWidth;
          el.classList.add('ai-field-highlight');
          setTimeout(function() { el.classList.remove('ai-field-highlight'); }, 1000);
        }
        if (typeof filterContracts === 'function') filterContracts('');
      }},
      { label: 'All contracts restored', delay: 350, fn: function() {} }
    ];
  }

  function buildNavigateSteps(href, label) {
    return [{ label: 'Navigating to ' + label, delay: 700, fn: function() {
      window.location.href = href;
    }}];
  }

  /* ══════════════════════════════════════════
     S-CURVE PAGE HELPERS
  ══════════════════════════════════════════ */

  function isScurvePage() {
    return window.location.pathname.split('/').pop() === 'scurve-forecast.html';
  }

  function extractMonthIdx(text) {
    var mc = window.MONTH_CALENDAR;
    if (!mc) return -1;
    var m = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})/i);
    if (m) {
      var mo3 = m[1].toLowerCase().substring(0, 3);
      var yr  = m[2];
      for (var i = 0; i < mc.length; i++) {
        if (mc[i].toLowerCase().startsWith(mo3) && mc[i].includes(yr)) return i;
      }
    }
    var n = text.match(/\bmonth\s+(\d+)\b/i);
    if (n) { var idx = parseInt(n[1]) - 1; if (idx >= 0 && idx < mc.length) return idx; }
    var pct = text.match(/\b(\d+)\s*%\s*(?:through|complete|done)/i);
    if (pct) { var p = parseInt(pct[1]); return Math.min(23, Math.round(p / 100 * 23)); }
    return -1;
  }

  function extractCAId(text) {
    if (/ca.?1043|structural|steel/i.test(text))    return 'ca-1043';
    if (/ca.?1044|mep|mechanical|electrical/i.test(text)) return 'ca-1044';
    if (/ca.?1045|site.?prep|preparation/i.test(text)) return 'ca-1045';
    if (/ca.?1042|civil|foundation/i.test(text))    return 'ca-1042';
    return null;
  }

  var CA_LABELS = {
    'ca-1042': 'CA-1042 · Civil Foundations P2',
    'ca-1043': 'CA-1043 · Structural Steel P1',
    'ca-1044': 'CA-1044 · MEP Systems',
    'ca-1045': 'CA-1045 · Site Preparation'
  };

  function scurveSetSlider(idx) {
    var slider = document.getElementById('scTimeSlider');
    if (slider) {
      slider.value = idx;
      var pct = ((idx - +slider.min) / (+slider.max - +slider.min)) * 100;
      slider.style.setProperty('--fill-pct', pct + '%');
    }
    if (typeof window.updateChartTime === 'function') window.updateChartTime(idx);
  }

  function scurveLiveStatus() {
    var eac     = document.getElementById('m-eac')?.textContent     || '—';
    var pct     = document.getElementById('m-pct')?.textContent     || '—';
    var cpispi  = document.getElementById('m-cpispi')?.textContent  || '—';
    var comp    = document.getElementById('m-completion')?.textContent || '—';
    var month   = document.getElementById('scTsMonth')?.textContent  || '—';
    var isAi    = window.AI_FORECAST_ACTIVE;
    var caBtn   = document.getElementById('acctSelectorBtn');
    var ca      = caBtn ? caBtn.textContent.trim().replace(/\s+/g,' ') : '—';
    return '<strong>Current forecast status</strong>'
      + '<div style="margin-top:8px;font-size:13px;line-height:1.9">'
      + '<div>📋 <strong>Account:</strong> ' + ca + '</div>'
      + '<div>📅 <strong>Simulated to:</strong> ' + month + (window.AI_FORECAST_ACTIVE ? ' <em>(AI forecast active)</em>' : '') + '</div>'
      + '<div>💰 <strong>EAC:</strong> ' + eac + '</div>'
      + '<div>✅ <strong>% Complete:</strong> ' + pct + '</div>'
      + '<div>📊 <strong>CPI / SPI:</strong> ' + cpispi + '</div>'
      + '<div>🏁 <strong>Forecast completion:</strong> ' + comp + '</div>'
      + (isAi ? '<div style="margin-top:6px;padding:5px 8px;background:#eff6ff;border-radius:6px;font-size:12px;color:#1d4ed8">⚡ AI forecast is active — curves reflect matched account analysis</div>' : '')
      + '</div>';
  }

  function buildScurveSimulateSteps(idx) {
    var mc = window.MONTH_CALENDAR || [];
    var label = mc[idx] || 'Month ' + (idx + 1);
    return [
      { label: 'Reading timeline position', delay: 400, fn: function() {} },
      { label: 'Moving simulate slider to ' + label, delay: 600, fn: function() {
        scurveSetSlider(idx);
      }},
      { label: 'Chart and KPIs updated', delay: 300, fn: function() {} }
    ];
  }

  function buildScurveSwitchCASteps(id) {
    var name = CA_LABELS[id] || id;
    return [
      { label: 'Loading account data for ' + name, delay: 500, fn: function() {} },
      { label: 'Updating S-curve and KPIs', delay: 700, fn: function() {
        if (typeof window.selectAccount === 'function') window.selectAccount(id);
      }},
      { label: 'Chart refreshed', delay: 300, fn: function() {} }
    ];
  }

  function buildScurveRunForecastSteps() {
    return [
      { label: 'Reading active driver weights', delay: 400, fn: function() {} },
      { label: 'Matching historical accounts via Gower distance', delay: 900, fn: function() {} },
      { label: 'Computing P10 / P50 / P90 forecast curves', delay: 700, fn: function() {} },
      { label: 'Applying AI forecast to chart', delay: 400, fn: function() {
        if (typeof window.runAiForecast === 'function') window.runAiForecast();
      }}
    ];
  }

  function buildScurveResetSteps() {
    return [
      { label: 'Resetting simulate slider to today', delay: 400, fn: function() {
        if (typeof window.resetToRealToday === 'function') window.resetToRealToday();
      }},
      { label: 'Restoring original S-curve', delay: 500, fn: function() {} }
    ];
  }

  function buildScurveResetSettingsSteps() {
    return [
      { label: 'Resetting all driver weights to defaults', delay: 500, fn: function() {
        if (typeof window.resetSettingsWeights === 'function') window.resetSettingsWeights();
      }},
      { label: 'S-curve restored to baseline forecast', delay: 400, fn: function() {} }
    ];
  }

  function buildScurveWeightSteps(key, label, value) {
    return [
      { label: 'Opening driver settings', delay: 400, fn: function() {} },
      { label: 'Setting ' + label + ' weight to ' + value.toFixed(1), delay: 600, fn: function() {
        if (typeof window.updateSettingsWeight === 'function') window.updateSettingsWeight(key, value);
        // Also visually update the slider if settings panel is open
        var slider = document.getElementById('wslider-' + key);
        if (slider) { slider.value = value; slider.style.setProperty('--fill-pct', (value / 5 * 100).toFixed(0) + '%'); }
        var valEl = document.getElementById('wval-' + key);
        if (valEl) valEl.textContent = value.toFixed(1);
      }},
      { label: 'Weight updated — run AI forecast to apply', delay: 300, fn: function() {} }
    ];
  }

  function buildScurveWhatIfSPI(spi) {
    var bac  = window.CHART_BAC  || 40;
    var cpi  = parseFloat((document.getElementById('m-cpispi')?.textContent || '0.92 / 0.88').split('/')[0]) || 0.92;
    var eac  = (bac / cpi).toFixed(1);
    var sc   = window.SCHEDULED_END_IDX || 20;
    var mc   = window.MONTH_CALENDAR || [];
    var slip = Math.round(24 * Math.max(-6, (1 / spi) - 1));
    var compIdx = Math.min(23, Math.max(0, sc + slip));
    var compLabel = mc[compIdx] || '—';
    var schedLabel = mc[sc] || '—';
    var slipText = compIdx === sc ? 'On schedule' : (compIdx > sc ? '+' + (compIdx - sc) + ' months late' : Math.abs(compIdx - sc) + ' months early');
    return '<strong>What-if: SPI = ' + spi.toFixed(2) + '</strong>'
      + '<div style="margin-top:8px;font-size:13px;line-height:1.9">'
      + '<div>📅 <strong>Forecast completion:</strong> ' + compLabel + ' <em>(' + slipText + ' vs ' + schedLabel + ' plan)</em></div>'
      + '<div>💰 <strong>EAC (cost unchanged):</strong> $' + eac + 'M</div>'
      + '<div style="margin-top:6px;padding:6px 10px;background:#fefce8;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e">'
      + '⚠ This is a schedule-only simulation. To see the effect on the chart, open driver settings, adjust SPI weight, and run AI forecast.'
      + '</div></div>';
  }

  function buildScurveWhatIfCPI(cpi) {
    var bac = window.CHART_BAC || 40;
    var eac = (bac / cpi).toFixed(1);
    var varPct = ((eac / bac - 1) * 100).toFixed(1);
    var sign = varPct >= 0 ? '+' : '';
    return '<strong>What-if: CPI = ' + cpi.toFixed(2) + '</strong>'
      + '<div style="margin-top:8px;font-size:13px;line-height:1.9">'
      + '<div>💰 <strong>Implied EAC:</strong> $' + eac + 'M (' + sign + varPct + '% vs $' + bac.toFixed(1) + 'M budget)</div>'
      + '<div>📈 <strong>Cost efficiency:</strong> $' + (1 / cpi).toFixed(2) + ' spent per $1.00 of earned value</div>'
      + '<div style="margin-top:6px;padding:6px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;color:#1e40af">'
      + '💡 Adjust the SPI/CPI weight in driver settings and run AI forecast to reflect this scenario on the chart.'
      + '</div></div>';
  }

  function buildScurveExplainDrivers() {
    var aw = window.ACTIVE_WEIGHTS || {};
    var total = Object.values(aw).reduce(function(a, b) { return a + b; }, 0) || 1;
    var sorted = Object.entries(aw)
      .filter(function(e) { return e[1] > 0; })
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 6);
    var rows = sorted.map(function(e) {
      var pct = ((e[1] / total) * 100).toFixed(0);
      var bar = Math.round(e[1] / 5 * 100);
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span style="width:140px;font-size:12px;color:#374151">' + e[0].replace(/_/g, ' ') + '</span>'
        + '<div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px"><div style="height:6px;background:#3b82f6;border-radius:3px;width:' + bar + '%"></div></div>'
        + '<span style="width:36px;text-align:right;font-size:12px;color:#6b7280">' + pct + '%</span>'
        + '</div>';
    }).join('');
    return '<strong>Active driver weights</strong>'
      + '<div style="margin-top:10px">' + rows + '</div>'
      + '<div style="margin-top:8px;font-size:12px;color:#6b7280">Open <em>Driver settings</em> to adjust. Run AI forecast to apply.</div>';
  }

  /* ══════════════════════════════════════════
     INTENT RESOLVER  (order matters)
  ══════════════════════════════════════════ */

  /* ════════════════════════════════════════
     PROJECT-HOME INTENT BUILDERS
  ════════════════════════════════════════ */

  function buildForecastReply(pd) {
    var eacStr  = '$' + pd.eac + 'M';
    var budgStr = '$' + pd.approvedBudget + 'M';
    var overStr = '+$' + pd.costOverrun + 'M (+' + Math.round(pd.costOverrun / pd.approvedBudget * 100) + '%)';
    return '<strong>Forecast analysis — Cisco Systems</strong>'
      + '<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;font-size:13px">'
      + '<div>📊 <strong>EAC (Estimate at Completion):</strong> ' + eacStr + '</div>'
      + '<div style="padding-left:20px;color:#64748b">Budget ' + budgStr + ' → Overrun <strong style="color:#e31b0c">' + overStr + '</strong></div>'
      + '<div style="margin-top:2px">📅 <strong>Forecast completion:</strong> ' + pd.forecastCompletion + '</div>'
      + '<div style="padding-left:20px;color:#64748b">Planned ' + pd.plannedCompletion + ' → Variance <strong>' + Math.abs(pd.scheduleVarianceDays) + ' days ' + (pd.scheduleVarianceDays < 0 ? 'late' : 'early') + '</strong></div>'
      + '<div style="margin-top:2px">⚡ <strong>Key drivers:</strong></div>'
      + '<div style="padding-left:20px;color:#64748b">'
      + '• CPI <strong style="color:#e31b0c">' + pd.cpi + '</strong> — spending $' + (1 / pd.cpi).toFixed(2) + ' per $1 budgeted<br>'
      + '• SPI <strong style="color:#16a34a">' + pd.spi + '</strong> — earning value 23% faster than planned<br>'
      + '• Schedule buffer partially offsets cost risk'
      + '</div></div>';
  }

  function resolveIntent(text) {
    var t = text;

    /* ── S-Curve page handlers ── */
    if (isScurvePage()) {

      // Simulate / time travel
      if (/simulat|time.*travel|move.*to|go.*to|advance.*to|jump.*to/i.test(t)) {
        var sIdx = extractMonthIdx(t);
        if (sIdx >= 0) {
          var sMc = window.MONTH_CALENDAR || [];
          return { type: 'multistep', reply: 'Simulating to <strong>' + (sMc[sIdx] || 'Month ' + (sIdx + 1)) + '</strong>.', steps: buildScurveSimulateSteps(sIdx) };
        }
      }

      // Run AI Forecast
      if (/run.*forecast|run.*ai|run.*analys|apply.*forecast|ai.*forecast|forecast.*now/i.test(t)) {
        return { type: 'multistep', reply: 'Running AI forecast analysis…', steps: buildScurveRunForecastSteps() };
      }

      // Switch control account
      var scaId = extractCAId(t);
      if (scaId && /switch|change|select|go.*to\b/i.test(t)) {
        return { type: 'multistep', reply: 'Switching to <strong>' + (CA_LABELS[scaId] || scaId) + '</strong>.', steps: buildScurveSwitchCASteps(scaId) };
      }

      // What-if SPI
      if (/what.*if|simulate.*spi/i.test(t) && /\bspi\b/i.test(t)) {
        var spiNum = t.match(/\b(0\.\d+|1\.\d+|2\.\d+)\b/);
        if (spiNum) {
          var spiVal = parseFloat(spiNum[1]);
          if (spiVal > 0 && spiVal < 3) return { type: 'simple', reply: buildScurveWhatIfSPI(spiVal) };
        }
      }

      // What-if CPI
      if (/what.*if|simulate.*cpi/i.test(t) && /\bcpi\b/i.test(t)) {
        var cpiNum = t.match(/\b(0\.\d+|1\.\d+|2\.\d+)\b/);
        if (cpiNum) {
          var cpiVal = parseFloat(cpiNum[1]);
          if (cpiVal > 0 && cpiVal < 3) return { type: 'simple', reply: buildScurveWhatIfCPI(cpiVal) };
        }
      }

      // Status / EAC query
      if (/\beac\b|current.*status|show.*status|forecast.*status|how.*are.*we|what.*is.*the/i.test(t)) {
        return { type: 'simple', reply: scurveLiveStatus() };
      }

      // Driver weights / explain
      if (/driver|weight|factor/i.test(t)) {
        return { type: 'simple', reply: buildScurveExplainDrivers() };
      }

      // Reset settings
      if (/reset.*setting|restore.*default|default.*setting/i.test(t)) {
        return { type: 'multistep', reply: 'Resetting driver settings to defaults.', steps: buildScurveResetSettingsSteps() };
      }

      // Reset to today
      if (/reset|today|back.*today/i.test(t)) {
        return { type: 'multistep', reply: 'Resetting simulate slider to <strong>today</strong>.', steps: buildScurveResetSteps() };
      }

      // S-curve page fallback
      return {
        type: 'simple',
        reply: 'On this page I can: <strong>simulate time</strong> ("Simulate to Jan 2026"), <strong>run AI forecast</strong>, <strong>switch accounts</strong> ("Switch to MEP Systems"), answer <strong>what-if questions</strong> ("What if SPI is 0.95?"), or show <strong>driver weights</strong>. What would you like to do?'
      };
    }

    /* ── Project-home: forecast / EAC ── */
    var pd = window.PROJECT_DATA;
    if (pd && /forecast|eac|estimate.*complet|complet.*date|projection/i.test(t)) {
      return {
        type: 'multistep',
        reply: 'Running forecast analysis…',
        steps: [
          { label: 'Reading performance metrics (CPI, SPI)', delay: 500, fn: function() {} },
          { label: 'Computing estimate at completion (EAC)', delay: 700, fn: function() {} },
          { label: 'Evaluating schedule variance', delay: 600, fn: function() {} },
          { label: 'Building forecast summary', delay: 400, fn: function() {
            setTimeout(function() { appendMessage('assistant', buildForecastReply(pd)); }, 350);
          }}
        ]
      };
    }

    /* ── Project-home: cost / CPI ── */
    if (pd && /cpi|cost.*overrun|cost.*perform|over.*budget|explain.*cost/i.test(t)) {
      var spend = (1 / pd.cpi).toFixed(2);
      return {
        type: 'simple',
        reply: '<strong>Cost performance (CPI: <span style="color:#e31b0c">' + pd.cpi + '</span>)</strong>'
          + '<div style="margin-top:8px;font-size:13px;line-height:1.7">'
          + 'A CPI of <strong>' + pd.cpi + '</strong> means the project spends <strong>$' + spend + '</strong> for every $1.00 budgeted.<br><br>'
          + 'This produces an Estimate at Completion of <strong>$' + pd.eac + 'M</strong> — '
          + '<strong style="color:#e31b0c">$' + pd.costOverrun + 'M above</strong> the approved budget of $' + pd.approvedBudget + 'M.<br><br>'
          + '💡 Immediate review of high-spend cost categories is recommended.'
          + '</div>'
      };
    }

    /* ── Project-home: schedule / SPI ── */
    if (pd && /spi|schedule.*perform|s.?curve|on.*track|behind.*schedule/i.test(t)) {
      return {
        type: 'simple',
        reply: '<strong>Schedule performance (SPI: <span style="color:#16a34a">' + pd.spi + '</span>)</strong>'
          + '<div style="margin-top:8px;font-size:13px;line-height:1.7">'
          + 'SPI above 1.0 means the project is <strong>ahead of schedule</strong> — earning value 23% faster than planned.<br><br>'
          + 'Forecast completion: <strong>' + pd.forecastCompletion + '</strong> vs planned <strong>' + pd.plannedCompletion + '</strong>.<br>'
          + 'Variance: <strong>' + Math.abs(pd.scheduleVarianceDays) + ' days ' + (pd.scheduleVarianceDays < 0 ? 'late' : 'early') + '</strong>.<br><br>'
          + 'The schedule buffer partially offsets the cost overrun risk.'
          + '</div>'
      };
    }

    /* ── Project-home: risk ── */
    if (pd && /\brisk|at.risk|what.*wrong|danger|concern/i.test(t)) {
      return {
        type: 'simple',
        reply: '<strong>Risk assessment — Cisco Systems</strong>'
          + '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;font-size:13px">'
          + '<div>🔴 <strong>Cost — HIGH RISK</strong><br>'
          + '<span style="color:#64748b;padding-left:20px;display:block">CPI ' + pd.cpi + ' → $' + pd.costOverrun + 'M projected overrun. Immediate action needed.</span></div>'
          + '<div>🟢 <strong>Schedule — LOW RISK</strong><br>'
          + '<span style="color:#64748b;padding-left:20px;display:block">SPI ' + pd.spi + ' → 23% ahead of plan. Forecast ' + pd.forecastCompletion + '.</span></div>'
          + '<div>🟡 <strong>Completion — MINOR RISK</strong><br>'
          + '<span style="color:#64748b;padding-left:20px;display:block">Forecast ' + Math.abs(pd.scheduleVarianceDays) + ' days past planned date.</span></div>'
          + '</div>'
      };
    }

    /* ── Project-home: summarize ── */
    if (pd && /summarize|summary|overview|status|project.*perform/i.test(t)) {
      return {
        type: 'simple',
        reply: '<strong>Project summary — Cisco Systems</strong>'
          + '<div style="margin-top:8px;font-size:13px;line-height:1.8">'
          + 'Budget: <strong>$' + pd.approvedBudget + 'M</strong> approved<br>'
          + 'EAC: <strong>$' + pd.eac + 'M</strong> forecast (+$' + pd.costOverrun + 'M overrun)<br>'
          + 'CPI: <strong style="color:#e31b0c">' + pd.cpi + '</strong> — cost critical<br>'
          + 'SPI: <strong style="color:#16a34a">' + pd.spi + '</strong> — schedule ahead<br>'
          + 'Completion: <strong>' + pd.forecastCompletion + '</strong> (planned ' + pd.plannedCompletion + ')'
          + '</div>'
      };
    }

    /* ── Project-home: navigate to contracts ── */
    if (pd && /\bcontract/i.test(t)) {
      return { type: 'multistep', reply: 'Taking you to <strong>Contracts</strong>.', steps: buildNavigateSteps('contracts.html', 'Contracts') };
    }

    /* ── View/open contract by ID ── */
    if (/\b(view|show|open|display|detail)\b/i.test(t)) {
      var id = extractContractId(t);
      if (id) {
        var idx = findContractIdx(id);
        if (idx >= 0) {
          return { type: 'multistep', reply: 'Opening contract <strong>' + id + '</strong>.', steps: buildViewContractSteps(id, idx) };
        }
        return { type: 'simple', reply: 'Contract <strong>' + id + '</strong> was not found in this project.' };
      }
    }

    /* ── Delete contract by ID ── */
    if (/\b(delete|remove)\b/i.test(t) && /contract/i.test(t)) {
      var id = extractContractId(t);
      if (id) {
        return { type: 'multistep', reply: 'Deleting contract <strong>' + id + '</strong>.', steps: buildDeleteContractSteps(id) };
      }
      return { type: 'simple', reply: 'Please include the contract ID, e.g. <em>"Delete G2-CON-5606"</em>.' };
    }

    /* ── Duplicate contract by ID ── */
    if (/\b(duplicate|copy)\b/i.test(t) && /contract/i.test(t)) {
      var id = extractContractId(t);
      if (id) {
        return { type: 'multistep', reply: 'Duplicating contract <strong>' + id + '</strong>.', steps: buildDuplicateContractSteps(id) };
      }
      return { type: 'simple', reply: 'Please include the contract ID, e.g. <em>"Duplicate G2-CON-5606"</em>.' };
    }

    /* ── Create / new contract ── */
    if (/\bcontract\b/i.test(t) && /create|new|add|make|open/i.test(t)) {
      var type     = extractContractType(t);
      var doSubmit = /\bsubmit\b/i.test(t);
      var doDraft  = /\bdraft\b/i.test(t);
      var reply = 'On it! Creating'
        + (type ? ' a <strong>' + type + '</strong>' : ' a new')
        + ' contract'
        + (doSubmit ? ' and submitting it' : doDraft ? ' and saving as draft' : '')
        + '.';
      return { type: 'multistep', reply: reply, steps: buildCreateContractSteps(t) };
    }

    /* ── Create trend → open contract form ── */
    if (/\btrend\b/i.test(t)) {
      return {
        type: 'multistep',
        reply: 'Opening the <strong>Create contract</strong> form for your new trend.',
        steps: [{ label: 'Opening create contract form', delay: 500, fn: function() {
          if (typeof openCreateContractModal === 'function') openCreateContractModal();
        }}]
      };
    }

    /* ── Clear filter / show all ── */
    if (/clear|reset|show all|all contracts/i.test(t)) {
      return { type: 'multistep', reply: 'Clearing filter and showing all contracts.', steps: buildClearFilterSteps() };
    }

    /* ── Filter / search ── */
    if (/filter|show|find|search|list/i.test(t)) {
      var q = extractFilterQuery(t);
      if (q) {
        return { type: 'multistep', reply: 'Filtering contracts by <strong>"' + q + '"</strong>.', steps: buildFilterSteps(q) };
      }
    }

    /* ── Summarize (live) ── */
    if (/summarize|summary|overview/i.test(t)) {
      return { type: 'simple', reply: liveContractSummary() };
    }

    /* ── List all (live) ── */
    if (/list|show all|all contracts|how many|count|total/i.test(t)) {
      return { type: 'simple', reply: liveContractList() };
    }

    /* ── Navigate ── */
    if (/project home|project overview|go.*home/i.test(t)) {
      return { type: 'multistep', reply: 'Taking you to <strong>Project home</strong>.', steps: buildNavigateSteps('project-home.html', 'Project home') };
    }
    if (/\bprojects\b/i.test(t) && /go|open|navigate|take/i.test(t)) {
      return { type: 'multistep', reply: 'Taking you to <strong>Projects</strong>.', steps: buildNavigateSteps('projects.html', 'Projects') };
    }

    /* ── Fallback ── */
    return { type: 'simple', reply: pickSimpleResponse(t) };
  }

  /* ══════════════════════════════════════════
     SIMPLE FALLBACK RESPONSES
  ══════════════════════════════════════════ */

  var SIMPLE = [
    { test: /anomal|risk|flag|issue|problem/i,
      reply: 'No anomalies detected. All contracts are properly classified. Consider adding completion dates and pay items for deeper risk analysis.' },
    { test: /expir|renew|end date|complet/i,
      reply: 'No completion dates are recorded yet. Add them via the <em>Payment work</em> accordion inside each contract\'s detail view.' },
    { test: /nec4|fidic|type/i,
      reply: 'Both existing contracts are <strong>NEC4</strong> type. FIDIC is also available when creating new contracts.' },
    { test: /status|active|submit/i,
      reply: 'Both contracts are <strong>Active</strong>. Manually created contracts can be saved as <em>Draft</em> or <em>Submitted</em>.' },
    { test: /g2|import|procure/i,
      reply: 'The 2 existing contracts were imported from <strong>G2</strong>. You can also import from ProcureWare via <em>Add → Import from ProcureWare</em>.' },
    { test: /pay item|payitem|quantity|price/i,
      reply: 'Pay items are scope line items — description, quantity, hours, unit price, price type, and control account ID. Expand <em>Pay items</em> inside any contract to manage them.' },
    { test: /s.?curve|spend|budget|cost/i,
      reply: 'The S-curve shows cumulative planned vs actual spend over time. A gap indicates schedule slippage — check the Performance section for context.' },
    { test: /at.risk|behind|overrun|delay/i,
      reply: 'Look for red or amber status indicators on the Projects page to spot at-risk contracts or projects.' },
    { test: /dashboard|navigate|what can/i,
      reply: 'I can create, view, delete, or duplicate contracts; filter the table; summarize data; or navigate anywhere in the project. Just tell me what you need.' }
  ];

  function pickSimpleResponse(text) {
    for (var i = 0; i < SIMPLE.length; i++) {
      if (SIMPLE[i].test.test(text)) return SIMPLE[i].reply;
    }
    return "I can help with that. Try: <em>\"Create a NEC4 contract\"</em>, <em>\"View G2-CON-5606\"</em>, <em>\"Delete G2-CON-5605\"</em>, <em>\"Filter active\"</em>, or <em>\"Summarize contracts\"</em>.";
  }

  /* ══════════════════════════════════════════
     MESSAGE HELPERS
  ══════════════════════════════════════════ */

  function botAvatar() {
    return '<div class="ai-message-avatar ai-avatar-bot">'
      + '<svg width="12" height="12" viewBox="0 0 16 16" fill="none">'
      + '<path d="M8 1L9.5 5.5L14 7L9.5 8.5L8 13L6.5 8.5L2 7L6.5 5.5L8 1Z" fill="white"/></svg></div>';
  }

  function appendMessage(role, html) {
    var container = document.getElementById('aiMessages');
    if (!container) return;
    var isUser = role === 'user';
    var div = document.createElement('div');
    div.className = 'ai-message ' + (isUser ? 'ai-message-user' : 'ai-message-assistant');
    var avatar = isUser ? '<div class="ai-message-avatar ai-avatar-user">JP</div>' : botAvatar();
    div.innerHTML = avatar + '<div class="ai-message-bubble">' + (isUser ? esc(html) : html) + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    var container = document.getElementById('aiMessages');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'ai-message ai-message-assistant ai-typing';
    div.id = 'aiTypingIndicator';
    div.innerHTML = botAvatar()
      + '<div class="ai-message-bubble"><div class="ai-typing-dots"><span></span><span></span><span></span></div></div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    var el = document.getElementById('aiTypingIndicator');
    if (el) el.remove();
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Shared dispatch ── */
  function dispatch(text) {
    showTyping();
    var intent = resolveIntent(text);
    setTimeout(function() {
      removeTyping();
      if (intent.type === 'multistep') {
        var logId = appendActionLog(intent.reply, intent.steps);
        runSteps(logId, intent.steps, 0);
      } else {
        appendMessage('assistant', intent.reply);
      }
    }, 500 + Math.random() * 300);
  }

  /* ══════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════ */

  window.sendAiMessage = function () {
    var input = document.getElementById('aiInput');
    var text  = (input.value || '').trim();
    if (!text) return;
    appendMessage('user', text);
    input.value = '';
    autoResizeAiInput(input);
    dispatch(text);
  };

  window.sendAiSuggestion = function (btn) {
    var text = btn.textContent.trim();
    appendMessage('user', text);
    dispatch(text);
  };

  window.handleAiKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  };

  window.autoResizeAiInput = function (el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  window.openAiPanel = function () {
    var panel = document.getElementById('aiPanel');
    if (!panel) return;
    panel.classList.add('ai-panel-open');
    document.body.classList.add('ai-panel-open');
    document.querySelectorAll('.tnav-ai-btn').forEach(function(b) { b.classList.add('active'); });
    var input = document.getElementById('aiInput');
    if (input) setTimeout(function() { input.focus(); }, 320);
  };

  window.closeAiPanel = function () {
    var panel = document.getElementById('aiPanel');
    if (!panel) return;
    panel.classList.remove('ai-panel-open');
    document.body.classList.remove('ai-panel-open');
    document.querySelectorAll('.tnav-ai-btn').forEach(function(b) { b.classList.remove('active'); });
  };

  window.toggleAiPanel = function () {
    var panel = document.getElementById('aiPanel');
    if (panel && panel.classList.contains('ai-panel-open')) closeAiPanel();
    else openAiPanel();
  };

  /* ── Init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPanel);
  } else {
    injectPanel();
  }

})();
