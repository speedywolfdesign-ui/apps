/* Projects page interactions: favorites + search */
(function () {
  const adminBtn = document.getElementById('adminMenuBtn');
  const adminMenu = document.getElementById('adminMenu');
  const search = document.getElementById('projectSearch');
  const tableBody = document.getElementById('projectsTableBody');
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  const globalCreateBtn = document.getElementById('globalCreateBtn');
  const globalCreateMenu = document.getElementById('globalCreateMenu');
  const createProjectOption = document.getElementById('createProjectOption');
  const createProjectModal = document.getElementById('createProjectModal');
  const createProjectOverlay = document.getElementById('createProjectOverlay');
  const createProjectClose = document.getElementById('createProjectClose');
  const createProjectCloseFooter = document.getElementById('createProjectCloseFooter');
  const createProjectSubmit = document.getElementById('createProjectSubmit');
  const createProjectForm = document.getElementById('createProjectForm');
  const navigateToContracts = (projectName) => {
    const url = `contracts.html?project=${encodeURIComponent(projectName)}`;
    window.location.href = url;
  };
  const FAVORITES_KEY = 'cm:favorites:projects';
  const PROJECTS_KEY = 'cm:projects:list';

  function loadFavorites() {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }
  function saveFavorites(set) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(set)));
  }

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
      <td class="px-4 py-3">
        <span class="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5h18v14H3V5Zm2 2v10h14V7H5Z"/>
          </svg>
          ${p.id}
        </span>
      </td>
      <td class="px-4 py-3"><a href="#" class="project-name text-brand-700 hover:underline">${p.title}</a></td>
      <td class="px-4 py-3 text-gray-700">${p.lastCalculated}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[10px] font-semibold text-white">IM</span>
          <span class="text-gray-700">Iara Moran</span>
        </div>
      </td>
      <td class="px-4 py-3 text-gray-700">—</td>
      <td class="px-4 py-3 text-gray-700">—</td>
      <td class="px-4 py-3 text-gray-700">—</td>
      <td class="px-4 py-3 text-gray-700">—</td>
    `;
    tableBody.appendChild(tr);
  }
  function renderStoredProjects() {
    const stored = loadProjects();
    if (!tableBody) return;
    tableBody.innerHTML = '';
    stored.forEach(appendProjectRow);
  }

  function seedProjectsFromDomIfEmpty() {
    const current = loadProjects();
    if (current.length > 0 || !tableBody) return;
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    const seeded = [];
    rows.forEach((row) => {
      const idEl = row.querySelector('td:first-child');
      const nameEl = row.querySelector('.project-name');
      const lastCalcEl = row.querySelector('td:nth-child(3)');
      const id = idEl ? idEl.textContent.trim() : '';
      const title = nameEl ? nameEl.textContent.trim() : '';
      const lastCalculated = lastCalcEl ? lastCalcEl.textContent.trim() : '';
      if (id && title) {
        seeded.push({ id, title, lastCalculated });
      }
    });
    if (seeded.length) {
      saveProjects(seeded);
    }
  }

  function applyFavoriteStyles(btn, isFav) {
    const svg = btn.querySelector('svg');
    if (!svg) return;
    if (isFav) {
      svg.setAttribute('fill', '#eab308'); // yellow-500 fill
      svg.setAttribute('stroke', '#eab308');
      btn.classList.add('text-yellow-500');
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-label', 'Unmark favorite');
    } else {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      btn.classList.remove('text-yellow-500');
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Mark as favorite');
    }
  }

  // Admin dropdown
  if (adminBtn && adminMenu) {
    adminBtn.addEventListener('click', () => {
      adminMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (e.target === adminBtn || adminBtn.contains(e.target)) return;
      if (!adminMenu.contains(e.target)) adminMenu.classList.add('hidden');
    });
  }

  // Simple tab behavior like contracts page (demo-only favorites)
  function selectTab(name) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === name;
      btn.classList.toggle('bg-white', isActive);
      btn.classList.toggle('shadow-sm', isActive);
      btn.classList.toggle('text-gray-900', isActive);
      btn.classList.toggle('text-gray-600', !isActive);
    });
    if (!tableBody) return;
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

  // Generic dropdown wiring (prevents immediate close on click)
  function wireDropdown(btn, menu) {
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    menu.addEventListener('click', (e) => {
      // Keep menu open when clicking inside items
      e.stopPropagation();
    });
    document.addEventListener('click', (e) => {
      if (menu.classList.contains('hidden')) return;
      if (e.target === btn || btn.contains(e.target)) return;
      if (!menu.contains(e.target)) menu.classList.add('hidden');
    });
  }
  wireDropdown(globalCreateBtn, globalCreateMenu);

  // Create Project modal controls
  function openProjectModal() {
    if (!createProjectModal) return;
    createProjectModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
  function closeProjectModal() {
    if (!createProjectModal) return;
    createProjectModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
  if (createProjectOption && createProjectModal) {
    createProjectOption.addEventListener('click', (e) => {
      e.preventDefault();
      globalCreateMenu.classList.add('hidden');
      openProjectModal();
    });
  }
  [createProjectOverlay, createProjectClose, createProjectCloseFooter].forEach((el) => {
    if (el) el.addEventListener('click', closeProjectModal);
  });

  // Visual selection treatment for contract setting cards (no visible checkboxes)
  function wireContractSettingCards() {
    if (!createProjectForm) return;
    const cards = Array.from(createProjectForm.querySelectorAll('.contract-setting-card'));
    function updateCardState(card) {
      const input = card.querySelector('input[type="checkbox"]');
      const selected = !!(input && input.checked);
      // Border-only highlight + subtle ring
      card.classList.toggle('border-brand-500', selected);
      card.classList.toggle('ring-2', selected);
      card.classList.toggle('ring-brand-500', selected);
      // Toggle check indicator
      const check = card.querySelector('.selection-check');
      if (check) {
        check.classList.toggle('hidden', !selected);
      }
    }
    cards.forEach((card) => {
      const input = card.querySelector('input[type="checkbox"]');
      if (!input) return;
      // Ensure hidden
      input.classList.add('sr-only');
      // Initial UI
      updateCardState(card);
      // Click anywhere on card toggles checkbox (label behavior), then sync UI
      card.addEventListener('click', (e) => {
        // Let default label-toggle happen first
        setTimeout(() => updateCardState(card), 0);
      });
      // Also listen to direct input change for keyboard users
      input.addEventListener('change', () => updateCardState(card));
    });
  }
  wireContractSettingCards();

  // Enforce mutual exclusivity between ProcureWare and G2 in Create Project modal
  if (createProjectForm) {
    const pwInput = createProjectForm.querySelector('input[name="optProcureWare"]');
    const g2Input = createProjectForm.querySelector('input[name="optG2"]');
    if (pwInput) {
      pwInput.addEventListener('change', () => {
        if (pwInput.checked && g2Input) {
          g2Input.checked = false;
          try { g2Input.dispatchEvent(new Event('change')); } catch {}
        }
      });
    }
    if (g2Input) {
      g2Input.addEventListener('change', () => {
        if (g2Input.checked && pwInput) {
          pwInput.checked = false;
          try { pwInput.dispatchEvent(new Event('change')); } catch {}
        }
      });
    }
  }

  // Create project submit
  if (createProjectSubmit && createProjectForm) {
    createProjectSubmit.addEventListener('click', (e) => {
      e.preventDefault();
      const fd = new FormData(createProjectForm);
      const id = (fd.get('projectId') || '').toString().trim();
      const title = (fd.get('projectTitle') || '').toString().trim();
      const createNew = createProjectForm.querySelector('input[name="optCreateNew"]')?.checked ?? true;
      let importPW = createProjectForm.querySelector('input[name="optProcureWare"]')?.checked ?? false;
      let useG2 = createProjectForm.querySelector('input[name="optG2"]')?.checked ?? false;
      // Guard against both being selected: prefer G2 if both true
      if (importPW && useG2) {
        importPW = false;
      }
      if (!id || !title) {
        createProjectForm.querySelectorAll('[data-required="true"]').forEach((el) => {
          if (!el.value.trim()) {
            el.classList.add('border-red-500', 'ring-1', 'ring-red-500');
          } else {
            el.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
          }
        });
        return;
      }
      const list = loadProjects();
      const now = new Date();
      const lastCalculated = now.toLocaleString('en-US', {
        month: 'short', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }).replace(',', ' —');
      const createdOn = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      const contracts = [
        createNew ? 'Create new' : null,
        importPW ? 'Import from PW' : null,
        useG2 ? 'G2' : null
      ].filter(Boolean).join(', ');
      const proj = {
        id,
        title,
        lastCalculated,
        createdOn,
        contracts,
        contractsSettings: { createNew, importPW, g2: useG2 }
      };
      list.push(proj);
      saveProjects(list);
      appendProjectRow(proj);
      // If G2 contracts are enabled for this project, seed import on contracts page
      if (useG2 && title) {
        try {
          localStorage.setItem(`cm:seedG2For:${title}`, 'true');
        } catch {}
        // Show a quick loading overlay then navigate to the contracts page
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-white/70 backdrop-blur-sm';
        overlay.innerHTML = `
          <div class="flex flex-col items-center gap-3">
            <svg class="h-6 w-6 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <div class="text-sm text-gray-700">Loading G2 contracts…</div>
          </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => {
          navigateToContracts(title);
        }, 600);
      }
      closeProjectModal();
      createProjectForm.reset();
      // Re-apply selected visuals after reset (defaults)
      wireContractSettingCards();
    });
  }

  // Search filter
  if (search && tableBody) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      tableBody.querySelectorAll('tr').forEach((row) => {
        const nameEl = row.querySelector('.project-name');
        const text = nameEl ? nameEl.textContent.toLowerCase() : '';
        row.classList.toggle('hidden', q && !text.includes(q));
      });
    });
  }

  // Row/Name click -> navigate to contracts page
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const nameLink = e.target.closest('.project-name');
      const row = e.target.closest('tr');
      if (nameLink) {
        e.preventDefault();
        navigateToContracts(nameLink.textContent.trim());
        return;
      }
      if (row && !e.target.closest('button')) {
        const link = row.querySelector('.project-name');
        const name = link ? link.textContent.trim() : 'Selected project';
        navigateToContracts(name);
      }
    });
  }

  // Initial sync and render
  seedProjectsFromDomIfEmpty();
  renderStoredProjects();
})();
