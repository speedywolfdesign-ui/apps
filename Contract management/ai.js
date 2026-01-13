;(function(){
  'use strict';
  // Configuration persistence
  const cfg = {
    provider: localStorage.getItem('ai_provider') || 'mock',
    model: localStorage.getItem('ai_model') || 'gpt-4o-mini',
    apiKey: localStorage.getItem('ai_api_key') || ''
  };
  function saveCfg(){
    localStorage.setItem('ai_provider', cfg.provider);
    localStorage.setItem('ai_model', cfg.model);
    // Always persist (empty string clears)
    localStorage.setItem('ai_api_key', cfg.apiKey || '');
  }

  // Basic styles for AI UI
  function injectStyles(){
    if (document.getElementById('__ai_styles__')) return;
    const css = `
    .ai-fab{position:fixed;right:18px;bottom:18px;z-index:1200;width:48px;height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(180deg,#1c3f78 0%,#0a2548 100%);color:#d7e7ff;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .ai-fab:hover{filter:brightness(1.1)}
    /* Docked panel on right (light theme) */
    .ai-panel{
      position:fixed; right:0; top:0; height:100vh; width:min(420px, 94vw);
      z-index:1200; background:#ffffff; color:#0f172a;
      border-left:1px solid rgba(0,0,0,.08); box-shadow:0 0 30px rgba(0,0,0,.12);
      display:flex; flex-direction:column; overflow:hidden;
      transform: translateX(100%); transition: transform .18s ease;
    }
    .ai-panel.open{ transform: translateX(0) }
    body.ai-docked{ margin-right:min(420px, 94vw); transition: margin-right .18s ease }
    .ai-hidden{display:none!important}
    .ai-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(0,0,0,.08);color:#0f172a;font-weight:700;background:#ffffff}
    .ai-head .spacer{flex:1 1 auto}
    .ai-settings{
      display:none;gap:12px;padding:12px;border-bottom:1px solid rgba(0,0,0,.08);
      background:#ffffff;flex:1 1 auto;overflow:auto;flex-direction:column;align-items:stretch
    }
    .ai-field{ display:flex; flex-direction:column; gap:6px }
    .ai-field label{ font-size:12px; color:#374151; font-weight:600 }
    .ai-settings input,.ai-settings select{
      padding:8px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.12);background:#ffffff;color:#0f172a;
      width: 100%; font-size: 14px; height: 36px;
    }
    .ai-actions{ display:flex; justify-content:flex-end; margin-top:4px }
    .ai-btn{
      padding:8px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.12);background:#2563eb;color:#ffffff;font-weight:700; cursor:pointer;
    }
    .ai-body{flex:1 1 auto;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px;background:#ffffff}
    .ai-msg{display:flex;gap:8px}
    .ai-msg .bubble{max-width:85%;padding:8px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.08)}
    .ai-msg.user{justify-content:flex-end}
    .ai-msg.user .bubble{background:#e6f1ff;color:#0f172a;border-color: rgba(37,99,235,.25)}
    .ai-msg.ai .bubble{background:#f3f4f6;color:#0f172a}
    .ai-tools{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 10px}
    .ai-chip{font-size:12px;color:#1f2937;background:#f3f4f6;border:1px solid rgba(0,0,0,.08);padding:6px 8px;border-radius:999px;cursor:pointer}
    .ai-chip:hover{background:#e5e7eb}
    .ai-foot{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(0,0,0,.08);background:#ffffff}
    .ai-foot input{flex:1 1 auto;padding:8px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.12);background:#ffffff;color:#0f172a}
    .ai-foot button{padding:8px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.12);background:#2563eb;color:#ffffff;font-weight:700}
    .ai-mini{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;margin-left:6px;cursor:pointer;background:rgba(2,6,23,.06);border:1px solid rgba(0,0,0,.08);color:#334155}
    .ai-mini:hover{background:rgba(2,6,23,.12)}
    .ai-tip{position:fixed;z-index:1300;background:#ffffff;border:1px solid rgba(0,0,0,.12);color:#0f172a;border-radius:10px;padding:8px 10px;box-shadow:0 10px 30px rgba(0,0,0,.1);max-width:320px;font-size:12px}
    .ai-tip .row{display:flex;align-items:center;gap:8px}
    .ai-tip .apply{margin-left:auto;padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.12);background:#2563eb;color:#ffffff;font-weight:700;cursor:pointer}
    .ai-note{font-size:11px;color:#6b7280;padding:6px 12px}
    /* Toast */
    .ai-toast-host{ position:fixed; right:16px; bottom:16px; z-index:1400; display:flex; flex-direction:column; gap:8px }
    .ai-toast{
      background:#111827; color:#ffffff; padding:10px 12px; border-radius:8px;
      box-shadow:0 10px 20px rgba(0,0,0,.18); font-size:13px;
      opacity:0; transform: translateY(6px); transition: opacity 140ms ease, transform 140ms ease;
    }
    /* Top-nav button style */
    .ai-top-btn{
      display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;
      border:2px solid transparent; background:#ffffff; color:#0f172a; font-weight:700; cursor:pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,.06); position:relative; overflow:hidden;
      background-clip: padding-box;
    }
    /* Rainbow border (static) */
    .ai-top-btn::before{
      content:''; position:absolute; inset:0; padding:2px; border-radius:12px;
      background: conic-gradient(from 0deg,
        #ff6b6b, #fbc46d, #ffd93d, #6ee7b7, #60a5fa, #a78bfa, #f472b6, #ff6b6b);
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
              mask-composite: exclude;
      /* animation removed */
      pointer-events:none;
    }
    .ai-top-btn:hover{ background:#f9fafb }
    .ai-top-btn svg{ color:#0f172a }
    /* keyframes retained but unused */
    `;
    const style = document.createElement('style');
    style.id = '__ai_styles__';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // UI creation
  function createUI(){
    if (document.getElementById('__ai_panel__')) return;
    const panel = document.createElement('div');
    panel.id = '__ai_panel__';
    panel.className = 'ai-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label', 'AI Assistant');
    panel.innerHTML = `
      <div class="ai-head">
        <button id="__ai_back__" class="ai-chip ai-hidden" title="Back">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M14 7l-5 5 5 5V7z"/></svg>
            <span>Back</span>
          </span>
        </button>
        <div id="__ai_title__">AI Assistant</div>
        <div class="spacer"></div>
        <button id="__ai_open_settings__" class="ai-chip" title="Settings">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.65l-1.93-3.34a.5.5 0 00-.61-.22l-2.4.96a7.96 7.96 0 00-1.62-.94l-.36-2.54A.5.5 0 0013.94 1h-3.88a.5.5 0 00-.49.42l-.36 2.54c-.57.26-1.11.57-1.62.94l-2.4-.96a.5.5 0 00-.61.22L.65 7.96a.5.5 0 00.12.65l2.03 1.58c-.04.31-.06.62-.06.94 0 .31.02.63.06.94L.77 13.65a.5.5 0 00-.12.65l1.93 3.34a.5.5 0 00.61.22l2.4-.96c.5.36 1.05.68 1.62.94l.36 2.54a.5.5 0 00.49.42h3.88a.5.5 0 00.49-.42l.36-2.54c.57-.26 1.11-.57 1.62-.94l2.4.96a.5.5 0 00.61-.22l1.93-3.34a.5.5 0 00-.12-.65l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg>
            <span>Settings</span>
          </span>
        </button>
        <button id="__ai_close__" class="ai-chip" title="Close">Close</button>
      </div>
      <div id="__ai_settings__" class="ai-settings">
        <div class="ai-field">
          <label for="__ai_provider__">Provider</label>
      <select id="__ai_provider__">
        <option value="proxy">Server proxy (OpenAI)</option>
        <option value="google">Google AI&nbsp;Studio (server)</option>
        <option value="openai">OpenAI (direct)</option>
        <option value="openrouter">OpenRouter (direct)</option>
        <option value="mock">Mock (offline)</option>
      </select>
        </div>
        <div class="ai-field">
          <label for="__ai_model__">Model</label>
          <select id="__ai_model_preset__" class="w-full">
            <!-- populated by script based on provider -->
          </select>
          <input id="__ai_model__" type="text" placeholder="e.g. gpt-4o-mini" />
          <small id="__ai_model_hint__" style="color:#6b7280"></small>
        </div>
        <div class="ai-field">
          <label for="__ai_key__">API Key</label>
          <input id="__ai_key__" type="password" placeholder="Stored locally in your browser" />
        </div>
        <div class="ai-actions">
          <button id="__ai_save__" class="ai-btn">Save</button>
        </div>
      </div>
      <div id="__ai_tools__" class="ai-tools"></div>
      <div class="ai-note">Keys are stored in your browser only. For production, proxy API calls via your server.</div>
      <div id="__ai_body__" class="ai-body" aria-live="polite"></div>
      <div class="ai-foot">
        <input id="__ai_input__" type="text" placeholder="Ask for help… e.g. suggest clauses or summarize form"/>
        <button id="__ai_send__">Send</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Place launcher immediately to the left of the Create button
    (function mountTopButton(){
      function ensureBtn(){
        let btn = document.getElementById('__ai_top_btn__');
        if (!btn){
          btn = document.createElement('button');
          btn.id = '__ai_top_btn__';
          btn.className = 'ai-top-btn';
          btn.title = 'AI Assistant';
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.39 4.84L20 7.27l-4 3.89.94 5.48L12 14.77 7.06 16.64 8 11.05 4 7.27l5.61-.43L12 2z"/></svg><span>AI</span>';
        }
        return btn;
      }
      const header = document.querySelector('header');
      if (!header){
        // Fallback floating button if header not found
        if (!document.getElementById('__ai_fab__')) {
          const fab = document.createElement('button');
          fab.id = '__ai_fab__';
          fab.className = 'ai-fab';
          fab.title = 'AI Assistant';
          fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.39 4.84L20 7.27l-4 3.89.94 5.48L12 14.77 7.06 16.64 8 11.05 4 7.27l5.61-.43L12 2z"/></svg>';
          document.body.appendChild(fab);
        }
        return;
      }
      // Always mount into the right-most header actions cluster (visible container)
      const clusters = Array.from(header.querySelectorAll('.flex.items-center.gap-2'));
      if (clusters.length){
        const rightCluster = clusters[clusters.length - 1];
        const btn = ensureBtn();
        if (btn.parentElement !== rightCluster){
          rightCluster.insertBefore(btn, rightCluster.firstChild || null);
        }
        // If button was placed inside a hidden wrapper earlier, relocate it
        const style = window.getComputedStyle(btn);
        if (style.display === 'none'){
          try { btn.remove(); } catch(_){}
          rightCluster.insertBefore(btn, rightCluster.firstChild || null);
        }
        return;
      }
      // Final fallback: floating button
      if (!document.getElementById('__ai_fab__')) {
        const fab = document.createElement('button');
        fab.id = '__ai_fab__';
        fab.className = 'ai-fab';
        fab.title = 'AI Assistant';
        fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.39 4.84L20 7.27l-4 3.89.94 5.48L12 14.77 7.06 16.64 8 11.05 4 7.27l5.61-.43L12 2z"/></svg>';
        document.body.appendChild(fab);
      }
    })();
    // In case header/actions render later, observe and mount near "Create"
    const observer = new MutationObserver(() => {
      const header = document.querySelector('header');
      if (!header) return;
      const clusters = Array.from(header.querySelectorAll('.flex.items-center.gap-2'));
      if (!clusters.length) return;
      const rightCluster = clusters[clusters.length - 1];
      let btn = document.getElementById('__ai_top_btn__');
      if (!btn){
        btn = document.createElement('button');
        btn.id = '__ai_top_btn__';
        btn.className = 'ai-top-btn';
        btn.title = 'AI Assistant';
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.39 4.84L20 7.27l-4 3.89.94 5.48L12 14.77 7.06 16.64 8 11.05 4 7.27l5.61-.43L12 2z"/></svg><span>AI</span>';
      }
      if (btn.parentElement !== rightCluster){
        rightCluster.insertBefore(btn, rightCluster.firstChild || null);
      }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  // Messaging helpers
  function appendMsg(role, text){
    const body = document.getElementById('__ai_body__');
    if (!body) return;
    const row = document.createElement('div');
    row.className = 'ai-msg ' + (role === 'user' ? 'user' : 'ai');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }
  function getToastHost(){
    let host = document.getElementById('__ai_toast__');
    if (!host){
      host = document.createElement('div');
      host.id = '__ai_toast__';
      host.className = 'ai-toast-host';
      document.body.appendChild(host);
    }
    return host;
  }
  function showToast(message){
    const host = getToastHost();
    const el = document.createElement('div');
    el.className = 'ai-toast';
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => { try { el.remove(); } catch(_){} }, 180);
    }, 2200);
  }

  function getPageContext(){
    const title = document.title || '';
    const headings = Array.from(document.querySelectorAll('h1,h2,summary')).slice(0,10).map(n => n.textContent.trim()).filter(Boolean);
    const forms = Array.from(document.querySelectorAll('form')).map((f, idx) => {
      const fields = Array.from(f.querySelectorAll('input,select,textarea')).slice(0,30).map(el => {
        const name = el.getAttribute('name') || el.id || '';
        const type = el.tagName.toLowerCase();
        let label = '';
        // try previous label element
        const lbl = el.closest('div')?.querySelector('label');
        if (lbl) label = lbl.textContent.trim();
        return { name, type, label, value: (el.value||'').toString().slice(0,120) };
      });
      return { index: idx, fields };
    });
    return { title, headings, forms };
  }

  async function aiRequest(userText, systemHint){
    const ctx = getPageContext();
    const systemPrompt = systemHint || `You are an inline AI assistant for a Contract Management web app. Respond briefly and include an optional single actionable directive line at the end, of the form:
value=<text> | select=<option> | field=<name>:<value> | fill=<json>
Use existing options when suggesting selects. Keep explanation short.`;

    const needsClientKey = (cfg.provider === 'openai' || cfg.provider === 'openrouter');
    if (cfg.provider === 'mock' || (needsClientKey && !cfg.apiKey)){
      // Simple heuristics
      let directive = '';
      let text = 'Here are suggestions.';
      if (/contract id|contractid|id/i.test(userText)){
        const id = 'CID-' + Math.floor(100000 + Math.random()*900000);
        directive = `value=${id}`;
        text = `Suggesting an ID like ${id}.`;
      } else if (/title|name/i.test(userText)){
        const title = 'Professional Services Agreement';
        directive = `value=${title}`;
        text = `Suggesting a clear title: "${title}".`;
      } else if (/gap|radius|template|size/i.test(userText)){
        directive = '';
        text = 'For visual settings, try moderate values for a balanced look.';
      }
      return { text: text + (directive ? ' Apply it if you like.' : ''), directive };
    }
    try{
      if (cfg.provider === 'proxy' || cfg.provider === 'google'){
        // Use server-side proxy; do not send API key from browser
        const system = { role: 'system', content: systemPrompt };
        const user = { role: 'user', content: `Context: ${JSON.stringify(ctx)}\nUser: ${userText}` };
        const r = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: cfg.provider === 'google' ? 'google' : 'openai',
            model: cfg.provider === 'google' ? (cfg.model || 'gemini-1.5-pro') : (cfg.model || 'gpt-4o-mini'),
            messages: [system, user],
            temperature: 0.3
          })
        });
        const j = await r.json();
        if (!r.ok) {
          const baseErr =
            (j && j.error && (typeof j.error === 'string' ? j.error : (j.error.message || JSON.stringify(j.error)))) ||
            (j && j.message) || 'Unknown error';
          const extra = j && (j.details || j.detail || j.reason);
          const errText = extra ? `${baseErr}: ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : baseErr;
          return { text: `Proxy error: ${errText}`, directive: '' };
        }
        const msg = j.content || '';
        const directive = (msg.match(/^(value|select|field|fill)=.+$/m)||[])[0] || '';
        return { text: msg, directive };
      }
      if (cfg.provider === 'openai'){
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.apiKey
          },
          body: JSON.stringify({
            model: cfg.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Context: ${JSON.stringify(ctx)}\nUser: ${userText}` }
            ],
            temperature: 0.3
          })
        });
        const j = await r.json();
        if (!r.ok){
          const err =
            (j && j.error && (j.error.message || JSON.stringify(j.error))) ||
            (j && j.message) || JSON.stringify(j);
          return { text: `OpenAI error: ${err}`, directive: '' };
        }
        const msg = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
        const directive = (msg.match(/^(value|select|field|fill)=.+$/m)||[])[0] || '';
        return { text: msg, directive };
      } else if (cfg.provider === 'openrouter'){
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Authorization':'Bearer ' + cfg.apiKey
          },
          body: JSON.stringify({
            model: cfg.model || 'openrouter/auto',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Context: ${JSON.stringify(ctx)}\nUser: ${userText}` }
            ],
            temperature: 0.3
          })
        });
        const j = await r.json();
        if (!r.ok){
          const err =
            (j && j.error && (j.error.message || JSON.stringify(j.error))) ||
            (j && j.message) || JSON.stringify(j);
          return { text: `OpenRouter error: ${err}`, directive: '' };
        }
        const msg = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
        const directive = (msg.match(/^(value|select|field|fill)=.+$/m)||[])[0] || '';
        return { text: msg, directive };
      }
    } catch(e){
      return { text: 'AI request failed. Using local suggestion.', directive: '' };
    }
    return { text: 'No response from AI.', directive: '' };
  }

  function applyDirectiveToField(el, line){
    if (!el || !line) return false;
    const [k, rest] = line.split('=');
    if (!k || !rest) return false;
    const v = rest.trim();
    if (k === 'value'){
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (k === 'select'){
      if (el.tagName.toLowerCase() === 'select'){
        const opt = Array.from(el.options).find(o => o.text.trim().toLowerCase() === v.toLowerCase() || o.value.trim().toLowerCase() === v.toLowerCase());
        if (opt){ el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
    }
    return false;
  }

  // Inline helper tip
  let tipEl = null;
  function showTip(anchor, text, onApply){
    hideTip();
    tipEl = document.createElement('div');
    tipEl.className = 'ai-tip';
    const row = document.createElement('div');
    row.className = 'row';
    const span = document.createElement('div');
    span.textContent = text;
    const apply = document.createElement('button');
    apply.className = 'apply';
    apply.textContent = 'Apply';
    apply.addEventListener('click', () => { onApply && onApply(); hideTip(); });
    row.appendChild(span);
    row.appendChild(apply);
    tipEl.appendChild(row);
    document.body.appendChild(tipEl);
    const r = anchor.getBoundingClientRect();
    tipEl.style.left = Math.min(window.innerWidth - 340, Math.max(8, r.left)) + 'px';
    tipEl.style.top = (r.bottom + 6) + 'px';
    const onDoc = (e) => {
      if (!tipEl) return;
      if (!tipEl.contains(e.target) && e.target !== anchor){
        hideTip();
        document.removeEventListener('pointerdown', onDoc, true);
      }
    };
    document.addEventListener('pointerdown', onDoc, true);
  }
  function hideTip(){
    if (tipEl){ try{ tipEl.remove(); } catch{} tipEl = null; }
  }

  function addInlineButtons(){
    function isSearchField(el){
      if (!el || el.tagName !== 'INPUT') return false;
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      if (t === 'search') return true;
      if (ph.includes('search')) return true;
      if (/^(search|contractsearch|projectsearch|importpwsearch)$/.test(id)) return true;
      return false;
    }
    // Cleanup any existing icons next to search fields or inside forms (if created earlier)
    document.querySelectorAll('.ai-mini').forEach(btn => {
      const prev = btn.previousElementSibling;
      const insideForm = !!btn.closest('form');
      if (isSearchField(prev) || insideForm) {
        try { btn.remove(); } catch(_) {}
      }
    });
    const fields = Array.from(document.querySelectorAll('input,select,textarea')).filter(el => {
      const isExcludedType = el.type && /password|hidden|file/i.test(el.type);
      return !isExcludedType;
    });
    fields.forEach(el => {
      // Avoid duplicates
      if (el.__aiBound) return;
      // Skip search boxes
      if (isSearchField(el)) return;
      // Skip all inputs inside any form
      if (el.closest('form')) return;
      el.__aiBound = true;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-mini';
      btn.title = 'Ask AI';
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l2.39 4.84L20 7.27l-4 3.89.94 5.48L12 14.77 7.06 16.64 8 11.05 4 7.27l5.61-.43L12 2z"/></svg>';
      // Place after the field
      el.insertAdjacentElement('afterend', btn);
      btn.addEventListener('click', async () => {
        // Find label text
        let label = '';
        const lbl = el.closest('div')?.querySelector('label');
        if (lbl) label = lbl.textContent.trim();
        const q = `Suggest a value for field "${label || el.name || el.id || 'field'}" and include a single line directive 'value=<...>' or 'select=<option>'.`;
        appendMsg('user', q);
        const res = await aiRequest(q);
        appendMsg('ai', res.text);
        if (res.directive){
          showTip(btn, res.text, () => {
            applyDirectiveToField(el, res.directive.trim());
          });
        } else {
          showTip(btn, res.text, null);
        }
      });
    });
  }

  function quickChips(){
    const tools = document.getElementById('__ai_tools__');
    if (!tools) return;
    tools.innerHTML = '';
    const chips = [
      { t: 'Summarize this page', q: 'Summarize key actions and fields on this page.' },
      { t: 'Suggest form values', q: 'Suggest sensible default values for visible form fields and include a final fill=<json> directive of name:value.' },
      { t: 'Draft vendor email', q: 'Draft a concise email to vendor requesting documents for contract initiation.' },
      { t: 'Write contract title', q: 'Propose a professional contract title and include value=<text>.' }
    ];
    chips.forEach(c => {
      const b = document.createElement('button');
      b.className = 'ai-chip';
      b.textContent = c.t;
      b.addEventListener('click', async () => {
        appendMsg('user', c.q);
        const res = await aiRequest(c.q);
        appendMsg('ai', res.text);
        if (res.directive){
          // Try applying a fill directive
          const m = res.directive.match(/^fill=(.+)$/);
          if (m){
            try{
              const obj = JSON.parse(m[1]);
              Object.entries(obj).forEach(([name, val]) => {
                const el = document.querySelector(`[name="${name}"]`);
                if (el){
                  if (el.tagName.toLowerCase() === 'select'){
                    const opt = Array.from(el.options).find(o => o.text.trim().toLowerCase() === String(val).toLowerCase() || o.value.trim().toLowerCase() === String(val).toLowerCase());
                    if (opt) el.value = opt.value;
                  } else {
                    el.value = String(val);
                  }
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
              appendMsg('ai', 'Applied suggested values.');
            } catch{}
          }
        }
      });
      tools.appendChild(b);
    });
  }

  function wireUI(){
    const panel = document.getElementById('__ai_panel__');
    const closeBtn = document.getElementById('__ai_close__');
    const sendBtn = document.getElementById('__ai_send__');
    const input = document.getElementById('__ai_input__');
    const titleEl = document.getElementById('__ai_title__');
    const backBtn = document.getElementById('__ai_back__');
    const openSettingsBtn = document.getElementById('__ai_open_settings__');
    const settings = document.getElementById('__ai_settings__');
    const prov = document.getElementById('__ai_provider__');
    const model = document.getElementById('__ai_model__');
    const modelPreset = document.getElementById('__ai_model_preset__');
    const modelHint = document.getElementById('__ai_model_hint__');
    const key = document.getElementById('__ai_key__');
    const save = document.getElementById('__ai_save__');
    const topBtn = document.getElementById('__ai_top_btn__');
    const fab = document.getElementById('__ai_fab__');
    prov.value = cfg.provider;
    model.value = cfg.model;
    key.value = cfg.apiKey || '';
    function adjustPanelTop(){
      const header = document.querySelector('header');
      const h = header ? Math.max(header.offsetHeight || 0, header.getBoundingClientRect().height || 0) : 0;
      panel.style.top = h + 'px';
      panel.style.height = `calc(100vh - ${h}px)`;
    }
    function getSiblingsAfterHeader(){
      const header = document.querySelector('header');
      const out = [];
      if (!header) return out;
      let el = header.nextElementSibling;
      while (el){
        out.push(el);
        el = el.nextElementSibling;
      }
      return out;
    }
    function setDockPush(active){
      const rect = panel.getBoundingClientRect ? panel.getBoundingClientRect() : { width: 0 };
      const width = active ? Math.round(rect.width || 0) : 0;
      const siblings = getSiblingsAfterHeader();
      siblings.forEach(el => {
        try {
          const pos = window.getComputedStyle(el).position;
          if (pos === 'fixed') return; // don't push fixed elements (e.g., sidebar)
          el.style.paddingRight = active && width ? (width + 'px') : '';
        } catch {}
      });
    }
    function populateModelPresets(provider){
      if (!modelPreset) return;
      let options = [];
      let hint = '';
      if (provider === 'google'){
        options = [
          {v:'gemini-1.5-pro', t:'gemini-1.5-pro'},
          {v:'gemini-1.5-flash', t:'gemini-1.5-flash'},
          {v:'gemini-2.0-flash', t:'gemini-2.0-flash'},
        ];
        hint = 'Google models e.g. gemini-1.5-pro';
        if (!model.value || /^(gpt-|openrouter)/i.test(model.value)) model.value = 'gemini-1.5-pro';
      } else if (provider === 'openai' || provider === 'proxy'){
        options = [
          {v:'gpt-4o-mini', t:'gpt-4o-mini'},
          {v:'gpt-4o', t:'gpt-4o'},
          {v:'gpt-4.1-mini', t:'gpt-4.1-mini'}
        ];
        hint = 'OpenAI models e.g. gpt-4o-mini';
        if (!model.value || /^gemini/i.test(model.value)) model.value = 'gpt-4o-mini';
      } else if (provider === 'openrouter'){
        options = [
          {v:'openrouter/auto', t:'openrouter/auto'},
          {v:'meta-llama/llama-3.1-70b-instruct', t:'Llama-3.1-70B-Instruct'},
          {v:'mistralai/Mixtral-8x7B-Instruct-v0.1', t:'Mixtral-8x7B-Instruct'}
        ];
        hint = 'OpenRouter models (provider/model) e.g. openrouter/auto';
        if (!model.value) model.value = 'openrouter/auto';
      } else {
        options = [];
        hint = '';
      }
      modelPreset.innerHTML = options.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
      // Sync preset with current input if matches one option
      const match = options.find(o => o.v.toLowerCase() === (model.value||'').toLowerCase());
      modelPreset.value = match ? match.v : (options[0] ? options[0].v : '');
      if (!match && options[0] && (!model.value || model.value.trim()==='')) {
        model.value = options[0].v;
      }
      if (modelHint) modelHint.textContent = hint;
    }
    function openPanel(){
      panel.classList.add('open');
      setDockPush(true);
      adjustPanelTop();
      quickChips();
      input.focus();
    }
    function closePanel(){
      panel.classList.remove('open');
      setDockPush(false);
    }
    window.addEventListener('resize', () => {
      if (panel.classList.contains('open')) {
        adjustPanelTop();
        setDockPush(true);
      }
    });
    if (topBtn) topBtn.addEventListener('click', () => {
      if (panel.classList.contains('open')) closePanel(); else openPanel();
    });
    if (fab) fab.addEventListener('click', () => {
      if (panel.classList.contains('open')) closePanel(); else openPanel();
    });
    closeBtn.addEventListener('click', () => closePanel());
    if (modelPreset){
      modelPreset.addEventListener('change', () => {
        if (model) model.value = modelPreset.value || model.value;
      });
    }
    if (prov){
      prov.addEventListener('change', () => {
        populateModelPresets(prov.value);
      });
      // initial populate
      populateModelPresets(prov.value || 'proxy');
    }
    function showSettings(){
      // header
      titleEl.textContent = 'Settings';
      backBtn.classList.remove('ai-hidden');
      openSettingsBtn.classList.add('ai-hidden');
      // sections
      settings.style.display = 'flex';
      document.getElementById('__ai_tools__').style.display = 'none';
      const note = panel.querySelector('.ai-note'); if (note) note.style.display = 'none';
      document.getElementById('__ai_body__').style.display = 'none';
      panel.querySelector('.ai-foot').style.display = 'none';
    }
    function showChat(){
      // header
      titleEl.textContent = 'AI Assistant';
      backBtn.classList.add('ai-hidden');
      openSettingsBtn.classList.remove('ai-hidden');
      // sections
      settings.style.display = 'none';
      document.getElementById('__ai_tools__').style.display = '';
      const note = panel.querySelector('.ai-note'); if (note) note.style.display = '';
      document.getElementById('__ai_body__').style.display = '';
      panel.querySelector('.ai-foot').style.display = '';
    }
    openSettingsBtn.addEventListener('click', () => showSettings());
    backBtn.addEventListener('click', () => showChat());
    sendBtn.addEventListener('click', async () => {
      const q = (input.value || '').trim(); if (!q) return;
      input.value = '';
      appendMsg('user', q);
      const res = await aiRequest(q);
      appendMsg('ai', res.text);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ sendBtn.click(); } });
    save.addEventListener('click', () => {
      cfg.provider = prov.value || 'mock';
      let chosenModel = (model && model.value || '').trim();
      if (!chosenModel || chosenModel.length === 0){
        // fallback to preset
        chosenModel = (modelPreset && modelPreset.value) ? modelPreset.value : '';
      }
      // Normalize Google model format if user provided "models/..." prefix
      if ((cfg.provider === 'google') && /^models\//i.test(chosenModel)) {
        chosenModel = chosenModel.split('/').pop();
      }
      // Basic guard against mismatched provider/model families
      if (cfg.provider === 'google' && !/^gemini[-\w.]*/i.test(chosenModel)) {
        chosenModel = 'gemini-1.5-pro';
      }
      if ((cfg.provider === 'openai' || cfg.provider === 'proxy') && /^gemini/i.test(chosenModel)) {
        chosenModel = 'gpt-4o-mini';
      }
      cfg.model = chosenModel || (cfg.provider === 'google' ? 'gemini-1.5-pro' : 'gpt-4o-mini');
      cfg.apiKey = key.value || '';
      saveCfg();
      showToast('Settings saved');
      if (cfg.provider === 'proxy'){
        showToast('Using server proxy. Your key is stored locally.');
      } else if (cfg.provider === 'google'){
        showToast('Using Google AI Studio via server proxy');
      } else if (cfg.provider === 'openai' && !cfg.apiKey){
        showToast('No API key set for OpenAI provider.');
      }
      appendMsg('ai', 'Settings saved. For production, prefer server-proxied requests.');
      // Stay on settings; user can go back with Back button
    });
  }

  function init(){
    injectStyles();
    createUI();
    addInlineButtons();
    wireUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(); 

