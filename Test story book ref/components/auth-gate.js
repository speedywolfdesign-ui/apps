/* ============================================================
   AUTH GATE — a simple access-password screen shown before any
   page content. Include this as the FIRST script in <head> on
   every page:  <script src="components/auth-gate.js"></script>

   NOTE: this is a lightweight client-side gate for demos/previews,
   not real security — the password lives in this file and is
   visible to anyone who views source. Change ACCESS_PASSWORD below.
   Unlock is remembered for the browser session (sessionStorage).
   ============================================================ */
(function () {
  'use strict';

  var ACCESS_PASSWORD = 'contruent';        // ← set the access password here
  var KEY = 'app-access-granted';

  // Log out / re-lock — clears the session unlock and returns to the password screen.
  // Defined before the early-return so it's available even when already authenticated.
  window.appLogout = window.appLock = function () {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };

  // Sign-in gate disabled — users are let in directly (no password screen).
  return;

  /* eslint-disable no-unreachable */
  try { if (sessionStorage.getItem(KEY) === '1') return; } catch (e) {}

  var ROOT = document.documentElement;

  // Hide page content until unlocked (no flash). The gate lives on <html>,
  // outside <body>, so it stays visible while the body is hidden.
  var hideCss = document.createElement('style');
  hideCss.id = 'appAuthHide';
  hideCss.textContent = [
    'body{visibility:hidden !important}',
    '#appAuthGate{visibility:visible;position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;',
      'background:linear-gradient(135deg,#0f2343 0%,#1e437d 100%);font-family:Inter,system-ui,sans-serif}',
    '#appAuthGate .ag-card{width:360px;max-width:100%;background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.35);padding:30px 28px;text-align:center;box-sizing:border-box}',
    '#appAuthGate .ag-logo{width:46px;height:46px;border-radius:12px;background:#eef3fb;color:#326fd1;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px}',
    '#appAuthGate h2{margin:0 0 6px;font-size:20px;color:#0f172a;font-weight:700}',
    '#appAuthGate p{margin:0 0 20px;font-size:13.5px;color:#64748b;line-height:1.5}',
    '#appAuthGate input{width:100%;box-sizing:border-box;padding:11px 14px;border:1px solid #d4d4d4;border-radius:10px;font-size:14px;font-family:inherit;color:#1e293b;outline:none}',
    '#appAuthGate input:focus{border-color:#326fd1;box-shadow:0 0 0 3px #eef3fb}',
    '#appAuthGate .ag-err{color:#dc2626;font-size:12.5px;margin-top:8px;min-height:16px;text-align:left}',
    '#appAuthGate button{width:100%;margin-top:12px;background:#326fd1;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer}',
    '#appAuthGate button:hover{background:#2859a7}',
    '#appAuthGate.ag-shake .ag-card{animation:agShake .35s}',
    '@keyframes agShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}'
  ].join('');
  ROOT.appendChild(hideCss);

  function build() {
    if (document.getElementById('appAuthGate')) return;
    var gate = document.createElement('div');
    gate.id = 'appAuthGate';
    gate.innerHTML =
      '<div class="ag-card" role="dialog" aria-modal="true" aria-label="Sign in">' +
        '<div class="ag-logo">&#128274;</div>' +
        '<h2>Sign in</h2>' +
        '<p>Enter the access password to continue.</p>' +
        '<input type="password" id="agPass" placeholder="Password" autocomplete="current-password" aria-label="Access password" />' +
        '<div class="ag-err" id="agErr" role="alert"></div>' +
        '<button type="button" id="agBtn">Unlock</button>' +
      '</div>';
    ROOT.appendChild(gate);

    var input = gate.querySelector('#agPass'),
        btn   = gate.querySelector('#agBtn'),
        err   = gate.querySelector('#agErr');

    function grant() {
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
      gate.parentNode && gate.parentNode.removeChild(gate);
      var h = document.getElementById('appAuthHide');
      if (h && h.parentNode) h.parentNode.removeChild(h);
    }

    function reject() {
      err.textContent = 'Incorrect password. Please try again.';
      gate.classList.remove('ag-shake'); void gate.offsetWidth; gate.classList.add('ag-shake');
      input.select();
    }
    // The visible Unlock button always rejects — knowing the password alone isn't enough.
    btn.addEventListener('click', reject);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); reject(); } });

    // Secret unlock: click the top-left 12x12px corner (no element in the DOM) WITH the correct password.
    gate.addEventListener('click', function (e) {
      if (e.clientX <= 12 && e.clientY <= 12) {
        if (input.value === ACCESS_PASSWORD) grant(); else reject();
      }
    });

    setTimeout(function () { input.focus(); }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
