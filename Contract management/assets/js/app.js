/* Minimal interactions for the demo screen */
(function () {
  const adminBtn = document.getElementById('adminMenuBtn');
  const adminMenu = document.getElementById('adminMenu');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const search = document.getElementById('search');
  const tableBody = document.getElementById('tableBody');
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  // Modal elements
  const modal = document.getElementById('contractModal');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const modalCloseFooter = document.getElementById('modalCloseFooter');
  const modalSave = document.getElementById('modalSave');
  const modalProjectName = document.getElementById('modalProjectName');
  const PROJECTS_KEY = 'cm:projects:list';
  const optCreate = document.getElementById('optCreate');
  const optPW = document.getElementById('optPW');
  const optG2 = document.getElementById('optG2');
  let prevModalSettings = null;

  // Visual selection treatment for modal contract setting cards
  function wireModalContractSettingCards() {
    if (!modal) return;
    const cards = Array.from(modal.querySelectorAll('.contract-setting-card'));
    function updateCardState(card) {
      const input = card.querySelector('input[type="checkbox"]');
      const selected = !!(input && input.checked);
      card.classList.toggle('border-brand-500', selected);
      card.classList.toggle('ring-2', selected);
      card.classList.toggle('ring-brand-500', selected);
      const check = card.querySelector('.selection-check');
      if (check) check.classList.toggle('hidden', !selected);
    }
    cards.forEach((card) => {
      const input = card.querySelector('input[type="checkbox"]');
      if (!input) return;
      input.classList.add('sr-only');
      updateCardState(card);
      card.addEventListener('click', () => {
        // allow label default toggle first
        setTimeout(() => updateCardState(card), 0);
      });
      input.addEventListener('change', () => updateCardState(card));
    });
  }

  // Projects rendering to keep in sync with Projects page
  function loadProjects() {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveProjects(list) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  }
  function appendProjectRow(p) {
    if (!tableBody) return;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-gray-50';
    tr.innerHTML = `
      <td class="px-4 py-3 text-gray-700">
        <span class="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5h18v14H3V5Zm2 2v10h14V7H5Z"/>
          </svg>
          ${p.id}
        </span>
      </td>
      <td class="px-4 py-3"><span class="text-gray-900">${p.title}</span></td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-white">IM</span>
          <span class="text-gray-700">Iara Moran</span>
        </div>
      </td>
      <td class="px-4 py-3 text-gray-700">${(p.createdOn || (p.lastCalculated ? p.lastCalculated.split(' —')[0] : 'Apr 12, 2024'))}</td>
      <td class="px-4 py-3 text-gray-700">${p.contracts || 'Create new, Import from PW'}</td>
      <td class="px-4 py-3">
        <button type="button" class="edit-project-btn inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M4 17.25V20h2.75l8.09-8.09-2.75-2.75L4 17.25Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.92 3.92 1.83-1.83Z"/></svg>
          Edit
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  }
  function renderStoredProjects() {
    if (!tableBody) return;
    const stored = loadProjects();
    if (!stored.length) return;
    const toTs = (p) => {
      if (p.createdOn) {
        const t = Date.parse(p.createdOn);
        if (!Number.isNaN(t)) return t;
      }
      if (p.lastCalculated) {
        const base = p.lastCalculated.split(' —')[0];
        const t = Date.parse(base);
        if (!Number.isNaN(t)) return t;
      }
      return 0;
    };
    const sorted = [...stored].sort((a, b) => toTs(b) - toTs(a));
    tableBody.innerHTML = '';
    sorted.forEach(appendProjectRow);
  }
  function seedProjectsFromDomIfEmpty() {
    const current = loadProjects();
    if (current.length > 0 || !tableBody) return;
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    const seeded = [];
    rows.forEach((row) => {
      const idEl = row.querySelector('td:first-child');
      const nameEl = row.querySelector('td:nth-child(2)');
      const createdOnEl = row.querySelector('td:nth-child(4)');
      const contractsEl = row.querySelector('td:nth-child(5)');
      const id = idEl ? idEl.textContent.trim() : '';
      const title = nameEl ? nameEl.textContent.trim() : '';
      const createdOn = createdOnEl ? createdOnEl.textContent.trim() : '';
      const contracts = contractsEl ? contractsEl.textContent.trim() : '';
      if (id && title) seeded.push({ id, title, createdOn, contracts });
    });
    if (seeded.length) saveProjects(seeded);
  }

  // Find a project's saved contract settings by title
  function loadProjectSettingsByTitle(title) {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const rec = list.find((p) => (p.title || '').toLowerCase() === (title || '').toLowerCase());
      if (!rec) return null;
      if (rec.contractsSettings) return rec.contractsSettings;
      // Infer from text summary if settings missing
      const text = (rec.contracts || '').toLowerCase();
      return {
        createNew: text.includes('create new') || text === '',
        importPW: text.includes('import from pw'),
        g2: text.includes('g2')
      };
    } catch {
      return null;
    }
  }

  function closeOnOutsideClick(targetEl, containerEl) {
    if (!containerEl) return;
    if (!containerEl.contains(targetEl)) {
      containerEl.classList.add('hidden');
    }
  }

  function openModal(projectName) {
    if (modalProjectName && projectName) {
      modalProjectName.textContent = projectName;
    }
    // Reflect project contract options
    const settings = loadProjectSettingsByTitle(projectName) || { createNew: true, importPW: true, g2: false };
    prevModalSettings = { ...settings };
    if (optCreate) optCreate.checked = !!settings.createNew;
    if (optPW) optPW.checked = !!settings.importPW;
    if (optG2) optG2.checked = !!settings.g2;
    // Enforce mutual exclusivity between ProcureWare and G2 on load
    if (optPW && optG2 && optPW.checked && optG2.checked) {
      // Prefer G2; uncheck ProcureWare
      optPW.checked = false;
    }
    // Sync selection visuals
    wireModalContractSettingCards();
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  if (adminBtn && adminMenu) {
    adminBtn.addEventListener('click', () => {
      adminMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (e.target === adminBtn || adminBtn.contains(e.target)) return;
      closeOnOutsideClick(e.target, adminMenu);
    });
  }

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });
  }

  // Sync projects with Projects page storage
  seedProjectsFromDomIfEmpty();
  renderStoredProjects();

  // Tabs (All / Favorites) – demo: Favorites filters down to first two rows
  function selectTab(name) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === name;
      btn.classList.toggle('bg-white', isActive);
      btn.classList.toggle('shadow-sm', isActive);
      btn.classList.toggle('text-gray-900', isActive);
      btn.classList.toggle('text-gray-600', !isActive);
    });
    // simplistic demo filter
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    rows.forEach((row, idx) => {
      if (name === 'favorites') {
        row.classList.toggle('hidden', idx > 1);
      } else {
        row.classList.remove('hidden');
      }
    });
  }
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
  });

  // Search filter on Name column and Edit button wiring
  if (search && tableBody) {
    // Click only on Edit buttons opens modal
    tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.edit-project-btn');
      if (!btn) return;
      const row = btn.closest('tr');
      if (!row) return;
      const nameCell = row.children && row.children[1];
      const name = nameCell ? nameCell.textContent.trim() : '';
      e.preventDefault();
      openModal(name);
    });

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const rows = Array.from(tableBody.querySelectorAll('tr'));
      rows.forEach((row) => {
        const nameCell = row.children[1];
        const text = nameCell ? nameCell.textContent.toLowerCase() : '';
        row.classList.toggle('hidden', q && !text.includes(q));
      });
    });
  }

  // Modal wiring
  if (modal) {
    // Remove G2 contracts for this project if G2 is turned off
    function removeG2ContractsForProject(projectTitle) {
      if (!projectTitle) return 0;
      try {
        const STORAGE_KEY_PREFIX = 'cm:contracts:';
        const storageKey = `${STORAGE_KEY_PREFIX}${projectTitle}`;
        const raw = localStorage.getItem(storageKey);
        const list = raw ? JSON.parse(raw) : [];
        const isG2Rec = (r) => {
          const src = (r?.source || '').toString().toLowerCase();
          const title = (r?.title || '').toString().toLowerCase();
          const desc = (r?.description || '').toString().toLowerCase();
          return src === 'g2' || title.includes('imported from g2') || desc.includes('g2');
        };
        const before = list.length;
        const filtered = list.filter((r) => !isG2Rec(r));
        localStorage.setItem(storageKey, JSON.stringify(filtered));
        return before - filtered.length;
      } catch {
        return 0;
      }
    }
    // Mutual exclusivity: when PW is enabled, disable G2
    if (optPW) {
      optPW.addEventListener('change', () => {
        if (optPW.checked && optG2) {
          optG2.checked = false;
          // trigger visual sync for G2 card
          try { optG2.dispatchEvent(new Event('change')); } catch {}
        }
      });
    }
    if (optG2) {
      optG2.addEventListener('change', () => {
        // If turning G2 on, ensure PW is off
        if (optG2.checked && optPW) {
          optPW.checked = false;
          try { optPW.dispatchEvent(new Event('change')); } catch {}
        }
        const projectTitle = modalProjectName ? modalProjectName.textContent.trim() : '';
        const wasEnabled = !!(prevModalSettings && prevModalSettings.g2);
        if (wasEnabled && !optG2.checked) {
          const ok = window.confirm('Disabling "Use G2 contracts" will remove all G2-imported contracts for this project. Do you want to continue?');
          if (!ok) {
            optG2.checked = true;
            return;
          }
          const removed = removeG2ContractsForProject(projectTitle);
          if (removed > 0) {
            window.alert(`Removed ${removed} G2 contract(s) for "${projectTitle}".`);
          }
        }
      });
    }
    [modalOverlay, modalClose, modalCloseFooter].forEach((el) => {
      if (el) el.addEventListener('click', closeModal);
    });
    if (modalSave) {
      modalSave.addEventListener('click', () => {
        // Persist contract settings for this project
        const projectTitle = modalProjectName ? modalProjectName.textContent.trim() : '';
        // Guard: ensure PW and G2 are not both true
        if (optPW && optG2 && optPW.checked && optG2.checked) {
          // Prefer G2 if both somehow selected
          optPW.checked = false;
        }
        const settings = {
          createNew: optCreate ? !!optCreate.checked : true,
          importPW: optPW ? !!optPW.checked : false,
          g2: optG2 ? !!optG2.checked : false
        };
        // If G2 newly enabled here, seed import for this project's contracts page
        try {
          if (settings.g2 && !(prevModalSettings && prevModalSettings.g2) && projectTitle) {
            localStorage.setItem(`cm:seedG2For:${projectTitle}`, 'true');
          }
        } catch {}
        try {
          const raw = localStorage.getItem(PROJECTS_KEY);
          const list = raw ? JSON.parse(raw) : [];
          const idx = list.findIndex((p) => (p.title || '').toLowerCase() === projectTitle.toLowerCase());
          const contractsText = [
            settings.createNew ? 'Create new' : null,
            settings.importPW ? 'Import from PW' : null,
            settings.g2 ? 'G2' : null
          ].filter(Boolean).join(', ');
          if (idx >= 0) {
            list[idx].contractsSettings = settings;
            list[idx].contracts = contractsText;
          } else if (projectTitle) {
            // Create minimal record if not present
            list.push({
              id: '—',
              title: projectTitle,
              createdOn: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
              contracts: contractsText,
              contractsSettings: settings
            });
          }
          localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
          // Re-render table to reflect new "Contracts" column text
          renderStoredProjects();
        } catch {
          // ignore storage errors in demo
        }
        closeModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
      }
    });
  }
})();


