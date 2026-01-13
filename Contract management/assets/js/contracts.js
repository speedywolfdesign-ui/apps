/* Contracts page: dropdown + breadcrumb project name */
(function () {
  const adminBtn = document.getElementById('adminMenuBtn');
  const adminMenu = document.getElementById('adminMenu');
  const createBtn = document.getElementById('createBtn');
  const createMenu = document.getElementById('createMenu');
  const crumbProject = document.getElementById('crumbProject');
  const createNewContractLink = document.getElementById('createNewContractLink');
  const importPWLink = document.getElementById('importPWLink');
  const useG2Link = document.getElementById('useG2Link');
  const modal = document.getElementById('newContractModal');
  const modalOverlay = document.getElementById('newContractOverlay');
  const modalClose = document.getElementById('newContractClose');
  const modalCloseFooter = document.getElementById('newContractCloseFooter');
  const sendBtn = document.getElementById('sendContractBtn');
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  const form = document.getElementById('newContractForm');
  const toastContainer = document.getElementById('toastContainer');
  const tableBody = document.getElementById('contractsTableBody');
  const STORAGE_KEY_PREFIX = 'cm:contracts:';
  const modalTitle = document.getElementById('newContractTitle');
  const contractView = document.getElementById('contractView');
  const modalActions = document.getElementById('modalActions');
  const editContractBtn = document.getElementById('editContractBtn');
  const statusBadge = document.getElementById('contractStatusBadge');
  const workflowBodyContent = document.getElementById('workflowBodyContent');
  let editingRecordId = null;
  let lastViewedRecord = null;
  // Workflow modal
  const workflowModal = document.getElementById('workflowModal');
  const workflowOverlay = document.getElementById('workflowOverlay');
  const workflowClose = document.getElementById('workflowClose');
  const workflowBack = document.getElementById('workflowBack');
  const workflowSendBtn = document.getElementById('workflowSendBtn');
  let pendingRecord = null;
  let pendingIsUpdate = false;

  // Pay items
  const payItemsContainer = document.getElementById('payItemsContainer');
  const addPayBtn = document.getElementById('addPayBtn');
  const PROJECTS_KEY = 'cm:projects:list';

  // Set breadcrumb project name from query param
  const params = new URLSearchParams(location.search);
  const project = params.get('project') || params.get('p');
  if (project && crumbProject) {
    crumbProject.textContent = project;
    crumbProject.title = project;
  }
  const storageKey = `${STORAGE_KEY_PREFIX}${project || 'default'}`;
  function loadProjectSettings(title) {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const rec = list.find((p) => (p.title || '').toLowerCase() === (title || '').toLowerCase());
      if (!rec) return null;
      if (rec.contractsSettings) return rec.contractsSettings;
      // Fallback: infer from 'contracts' text
      const text = (rec.contracts || '').toLowerCase();
      return {
        createNew: text.includes('create new'),
        importPW: text.includes('import from pw'),
        g2: text.includes('g2')
      };
    } catch {
      return null;
    }
  }
  function applyCreateMenuVisibility(settings) {
    const s = settings || { createNew: true, importPW: true, g2: false };
    let shown = 0;
    if (createNewContractLink) {
      createNewContractLink.style.display = s.createNew ? '' : 'none';
      if (s.createNew) shown++;
    }
    if (importPWLink) {
      importPWLink.style.display = s.importPW ? '' : 'none';
      if (s.importPW) shown++;
    }
    if (useG2Link) {
      useG2Link.style.display = s.g2 ? '' : 'none';
      if (s.g2) shown++;
    }
    // Fallback: if nothing visible (e.g., missing settings), show default actions
    if (shown === 0) {
      if (createNewContractLink) createNewContractLink.style.display = '';
      if (importPWLink) importPWLink.style.display = '';
    }
  }
  applyCreateMenuVisibility(loadProjectSettings(project));

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

  // Create dropdown
  if (createBtn && createMenu) {
    // Robust dropdown handling
    createBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Refresh visibility from latest project settings every open
      const currentProjectName = (crumbProject && crumbProject.textContent) ? crumbProject.textContent.trim() : project;
      applyCreateMenuVisibility(loadProjectSettings(currentProjectName));
      createMenu.classList.toggle('hidden');
    });
    createMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    document.addEventListener('click', (e) => {
      if (createMenu.classList.contains('hidden')) return;
      if (e.target === createBtn || createBtn.contains(e.target)) return;
      if (!createMenu.contains(e.target)) createMenu.classList.add('hidden');
    });
  }

  // Modal controls
  function openModal() {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
  function closeModal() {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    hideStatusTooltip();
  }
  function openWorkflowModal() {
    if (!workflowModal) return;
    workflowModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
  function closeWorkflowModal() {
    if (!workflowModal) return;
    workflowModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
  if (createNewContractLink) {
    createNewContractLink.addEventListener('click', (e) => {
      e.preventDefault();
      createMenu.classList.add('hidden');
      enterCreateMode();
      openModal();
    });
  }
  [modalOverlay, modalClose, modalCloseFooter].forEach((el) => {
    if (el) el.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });
  [workflowOverlay, workflowClose, workflowBack].forEach((el) => {
    if (el) el.addEventListener('click', closeWorkflowModal);
  });

  // Validation helpers
  function setInvalid(el, message) {
    el.classList.add('border-red-500', 'ring-1', 'ring-red-500', 'focus:ring-red-500', 'focus:border-red-500');
    el.setAttribute('aria-invalid', 'true');
    if (!el.nextElementSibling || !el.nextElementSibling.classList.contains('field-error')) {
      const err = document.createElement('p');
      err.className = 'field-error mt-1 text-xs text-red-600';
      err.textContent = message || 'Required';
      el.parentElement.appendChild(err);
    }
  }
  function clearInvalid(el) {
    el.classList.remove('border-red-500', 'ring-1', 'ring-red-500', 'focus:ring-red-500', 'focus:border-red-500');
    el.removeAttribute('aria-invalid');
    if (el.nextElementSibling && el.nextElementSibling.classList.contains('field-error')) {
      el.nextElementSibling.remove();
    }
  }
  function validateForm() {
    if (!form) return false;
    const required = Array.from(form.querySelectorAll('[data-required="true"]'));
    let firstInvalid = null;
    required.forEach((el) => {
      const val = (el.value || '').toString().trim();
      if (!val) {
        setInvalid(el);
        if (!firstInvalid) firstInvalid = el;
      } else {
        clearInvalid(el);
      }
      el.addEventListener('input', () => {
        if ((el.value || '').toString().trim()) clearInvalid(el);
      }, { once: true });
      el.addEventListener('change', () => {
        if ((el.value || '').toString().trim()) clearInvalid(el);
      }, { once: true });
    });
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  // Contracts storage and rendering
  function loadContracts() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveContracts(list) {
    localStorage.setItem(storageKey, JSON.stringify(list));
  }
  function statusPill(status) {
    const span = document.createElement('span');
    span.textContent = status;
    span.className =
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ' +
      (status === 'Active'
        ? 'bg-green-50 text-green-700 ring-green-600/20'
        : status === 'In review'
        ? 'bg-orange-50 text-orange-700 ring-orange-600/20'
        : status === 'In acceptance'
        ? 'bg-orange-100 text-orange-800 ring-orange-600/30'
        : status === 'Draft'
        ? 'bg-gray-50 text-gray-700 ring-gray-400/30'
        : status === 'Closed'
        ? 'bg-gray-100 text-gray-700 ring-gray-400/40'
        : 'bg-blue-50 text-blue-700 ring-blue-600/20');
    return span;
  }
  function renderContracts(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (!list.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'px-4 py-10 text-center text-sm text-gray-500';
      td.textContent = 'No contracts yet. Use the Create button to add one.';
      tr.appendChild(td);
      tableBody.appendChild(tr);
      return;
    }
    list.forEach((rec) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 cursor-pointer';
      tr.dataset.id = String(rec.id);
      const tdDesc = document.createElement('td');
      tdDesc.className = 'px-4 py-3 text-gray-700';
      tdDesc.textContent = rec.description || '—';
      const tdPid = document.createElement('td');
      tdPid.className = 'px-4 py-3 text-gray-700';
      tdPid.textContent = rec.projectId || '—';
      const tdTitle = document.createElement('td');
      tdTitle.className = 'px-4 py-3 text-gray-700';
      tdTitle.textContent = rec.title || '—';
      const tdBids = document.createElement('td');
      tdBids.className = 'px-4 py-3 text-gray-700';
      tdBids.textContent = (rec.bidsReceived ?? 0).toString();
      const tdStatus = document.createElement('td');
      tdStatus.className = 'px-4 py-3';
      tdStatus.appendChild(statusPill(rec.status || 'Submitted'));
      const tdSource = document.createElement('td');
      tdSource.className = 'px-4 py-3 text-gray-700';
      const inferredSource =
        rec.source ||
        ((rec.title || '').toLowerCase().startsWith('imported from pw') || (rec.description || '').toLowerCase().includes('procureware')
          ? 'ProcureWare'
          : (rec.description || '').toLowerCase().includes('g2')
          ? 'G2'
          : 'Control center');
      tdSource.textContent = inferredSource;
      tr.append(tdDesc, tdPid, tdTitle, tdBids, tdStatus, tdSource);
      tableBody.appendChild(tr);
    });
  }
  const contracts = loadContracts();
  // Pagination state
  let currentPage = 1;
  let pageSize = 10;
  const pageInfoEl = document.getElementById('paginationInfo');
  const pagePrevBtn = document.getElementById('pagePrev');
  const pageNextBtn = document.getElementById('pageNext');
  const pageSizeSelect = document.getElementById('pageSizeSelect');

  function renderContracts(list) {
    if (!tableBody) return;
    // Sort by createdAt (fallback id) descending so newest first
    const sorted = [...list].sort((a, b) => {
      const ta = a.createdAt || a.id || 0;
      const tb = b.createdAt || b.id || 0;
      return tb - ta;
    });
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(total, startIdx + pageSize);
    tableBody.innerHTML = '';
    if (total === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'px-4 py-10 text-center text-sm text-gray-500';
      td.textContent = 'No contracts yet. Use the Create button to add one.';
      tr.appendChild(td);
      tableBody.appendChild(tr);
    } else {
      sorted.slice(startIdx, endIdx).forEach((rec) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 cursor-pointer';
        tr.dataset.id = String(rec.id);
        const tdDesc = document.createElement('td');
        tdDesc.className = 'px-4 py-3 text-gray-700';
        tdDesc.textContent = rec.description || '—';
        const tdPid = document.createElement('td');
        tdPid.className = 'px-4 py-3 text-gray-700';
        tdPid.textContent = rec.projectId || '—';
        const tdTitle = document.createElement('td');
        tdTitle.className = 'px-4 py-3 text-gray-700';
        tdTitle.textContent = rec.title || '—';
        const tdBids = document.createElement('td');
        tdBids.className = 'px-4 py-3 text-gray-700';
        tdBids.textContent = (rec.bidsReceived ?? 0).toString();
        const tdStatus = document.createElement('td');
        tdStatus.className = 'px-4 py-3';
        tdStatus.appendChild(statusPill(rec.status || 'Submitted'));
        const tdSource = document.createElement('td');
        tdSource.className = 'px-4 py-3 text-gray-700';
        const inferredSource =
          rec.source ||
          ((rec.title || '').toLowerCase().startsWith('imported from pw') || (rec.description || '').toLowerCase().includes('procureware')
            ? 'ProcureWare'
            : (rec.description || '').toLowerCase().includes('g2')
            ? 'G2'
            : 'Control center');
        tdSource.textContent = inferredSource;
        tr.append(tdDesc, tdPid, tdTitle, tdBids, tdStatus, tdSource);
        tableBody.appendChild(tr);
      });
    }
    // Update pagination UI
    if (pageInfoEl) pageInfoEl.textContent = `${total === 0 ? 0 : startIdx + 1}–${endIdx} of ${total}`;
    if (pagePrevBtn) pagePrevBtn.disabled = currentPage <= 1;
    if (pageNextBtn) pageNextBtn.disabled = currentPage >= Math.max(1, Math.ceil(total / pageSize));
  }
  // If a seed import from G2 was requested (e.g., on project creation), show loader and import 10
  (function maybeSeedG2() {
    const seedKey = `cm:seedG2For:${project || 'default'}`;
    const shouldSeed = localStorage.getItem(seedKey) === 'true';
    if (shouldSeed) {
      renderImportSkeleton(10);
      setTimeout(() => {
        const now = Date.now();
        const imported = Array.from({ length: 10 }, (_, i) => ({
          id: now + i,
          createdAt: now + i,
          description: 'G2',
          projectId: 'G2-' + Math.floor(Math.random() * 1000),
          title: `Imported from G2 #${i + 1}`,
          bidsReceived: 0,
          status: Math.random() < 0.5 ? 'Active' : 'Closed',
          source: 'G2'
        }));
        imported.forEach((r) => contracts.push(r));
        saveContracts(contracts);
        renderContracts(contracts);
        localStorage.removeItem(seedKey);
        showToast('Imported 10 contract(s) from G2.', 'View', () => {
          window.location.hash = '#g2-seeded';
        });
      }, 1200);
    } else {
      renderContracts(contracts);
    }
  })();

  // Contract settings modal (toolbar settings button)
  const openCSBtn = document.getElementById('openContractSettingsBtn');
  const csModal = document.getElementById('contractSettingsModal');
  const csOverlay = document.getElementById('contractSettingsOverlay');
  const csClose = document.getElementById('contractSettingsClose');
  const csCancel = document.getElementById('contractSettingsCancel');
  const csSave = document.getElementById('contractSettingsSave');
  const csOptCreate = document.getElementById('csOptCreate');
  const csOptPW = document.getElementById('csOptPW');
  const csOptG2 = document.getElementById('csOptG2');
  const csProjectName = document.getElementById('csProjectName');
  let prevCSSettings = null;

  // Workflow reviewers/acceptors editable lists
  const reviewersChipsEl = document.getElementById('reviewersChips');
  const acceptanceChipsEl = document.getElementById('acceptanceChips');
  const editReviewersBtn = document.getElementById('editReviewersBtn');
  const editAcceptanceBtn = document.getElementById('editAcceptanceBtn');
  const editReviewersPanel = document.getElementById('editReviewersPanel');
  const editAcceptancePanel = document.getElementById('editAcceptancePanel');
  const reviewersOptionsEl = document.getElementById('reviewersOptions');
  const acceptanceOptionsEl = document.getElementById('acceptanceOptions');

  const ALL_USERS = [
    { id: 'lp', name: 'Louis Parol', initials: 'LP' },
    { id: 'lb', name: 'Louis B', initials: 'LB' },
    { id: 'jb', name: 'Jack Black', initials: 'JB' },
    { id: 'im', name: 'Iara Moran', initials: 'IM' },
    { id: 'js', name: 'Juan Silva', initials: 'JS' },
    { id: 'al', name: 'Alex Lee', initials: 'AL' }
  ];
  const usersById = Object.fromEntries(ALL_USERS.map((u) => [u.id, u]));
  let workflowReviewers = ['lp', 'lb'];
  let workflowAcceptance = ['jb'];

  function renderChips(container, ids) {
    if (!container) return;
    container.innerHTML = '';
    ids.forEach((id, idx) => {
      const u = usersById[id];
      if (!u) return;
      const chip = document.createElement('div');
      chip.className = 'inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2';
      const avatar = document.createElement('span');
      avatar.className = 'inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white';
      avatar.textContent = u.initials;
      const name = document.createElement('span');
      name.className = 'text-sm';
      name.textContent = u.name;
      chip.appendChild(avatar);
      chip.appendChild(name);
      container.appendChild(chip);
      if (container === reviewersChipsEl && idx < ids.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'text-gray-400';
        arrow.textContent = '→';
        container.appendChild(arrow);
      }
    });
  }
  function renderOptions(container, ids, onToggle) {
    if (!container) return;
    container.innerHTML = '';
    ALL_USERS.forEach((u) => {
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-sm';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'rounded border-gray-300';
      cb.checked = ids.includes(u.id);
      cb.addEventListener('change', () => onToggle(u.id, cb.checked));
      const span = document.createElement('span');
      span.textContent = `${u.initials} — ${u.name}`;
      row.appendChild(cb);
      row.appendChild(span);
      container.appendChild(row);
    });
  }
  // initial render + edit/save/cancel UX
  renderChips(reviewersChipsEl, workflowReviewers);
  renderChips(acceptanceChipsEl, workflowAcceptance);
  const saveReviewersBtn = document.getElementById('saveReviewersBtn');
  const cancelReviewersBtn = document.getElementById('cancelReviewersBtn');
  const saveAcceptanceBtn = document.getElementById('saveAcceptanceBtn');
  const cancelAcceptanceBtn = document.getElementById('cancelAcceptanceBtn');
  let prevReviewers = [];
  let prevAcceptance = [];

  function enterEditReviewers() {
    prevReviewers = Array.from(workflowReviewers);
    if (editReviewersPanel) {
      editReviewersPanel.classList.remove('hidden');
      renderOptions(reviewersOptionsEl, workflowReviewers, (id, checked) => {
        const set = new Set(workflowReviewers);
        if (checked) set.add(id);
        else set.delete(id);
        workflowReviewers = Array.from(set);
        renderChips(reviewersChipsEl, workflowReviewers);
      });
    }
    if (editReviewersBtn) editReviewersBtn.classList.add('hidden');
    if (saveReviewersBtn) saveReviewersBtn.classList.remove('hidden');
    if (cancelReviewersBtn) cancelReviewersBtn.classList.remove('hidden');
  }
  function exitEditReviewers(apply) {
    if (!apply) {
      workflowReviewers = Array.from(prevReviewers);
      renderChips(reviewersChipsEl, workflowReviewers);
    }
    if (editReviewersPanel) editReviewersPanel.classList.add('hidden');
    if (saveReviewersBtn) saveReviewersBtn.classList.add('hidden');
    if (cancelReviewersBtn) cancelReviewersBtn.classList.add('hidden');
    if (editReviewersBtn) editReviewersBtn.classList.remove('hidden');
  }
  if (editReviewersBtn) editReviewersBtn.addEventListener('click', () => enterEditReviewers());
  if (saveReviewersBtn) saveReviewersBtn.addEventListener('click', () => exitEditReviewers(true));
  if (cancelReviewersBtn) cancelReviewersBtn.addEventListener('click', () => exitEditReviewers(false));

  function enterEditAcceptance() {
    prevAcceptance = Array.from(workflowAcceptance);
    if (editAcceptancePanel) {
      editAcceptancePanel.classList.remove('hidden');
      renderOptions(acceptanceOptionsEl, workflowAcceptance, (id, checked) => {
        const set = new Set(workflowAcceptance);
        if (checked) set.add(id);
        else set.delete(id);
        workflowAcceptance = Array.from(set);
        renderChips(acceptanceChipsEl, workflowAcceptance);
      });
    }
    if (editAcceptanceBtn) editAcceptanceBtn.classList.add('hidden');
    if (saveAcceptanceBtn) saveAcceptanceBtn.classList.remove('hidden');
    if (cancelAcceptanceBtn) cancelAcceptanceBtn.classList.remove('hidden');
  }
  function exitEditAcceptance(apply) {
    if (!apply) {
      workflowAcceptance = Array.from(prevAcceptance);
      renderChips(acceptanceChipsEl, workflowAcceptance);
    }
    if (editAcceptancePanel) editAcceptancePanel.classList.add('hidden');
    if (saveAcceptanceBtn) saveAcceptanceBtn.classList.add('hidden');
    if (cancelAcceptanceBtn) cancelAcceptanceBtn.classList.add('hidden');
    if (editAcceptanceBtn) editAcceptanceBtn.classList.remove('hidden');
  }
  if (editAcceptanceBtn) editAcceptanceBtn.addEventListener('click', () => enterEditAcceptance());
  if (saveAcceptanceBtn) saveAcceptanceBtn.addEventListener('click', () => exitEditAcceptance(true));
  if (cancelAcceptanceBtn) cancelAcceptanceBtn.addEventListener('click', () => exitEditAcceptance(false));

  function openCS() {
    const currentProjectName = (crumbProject && crumbProject.textContent) ? crumbProject.textContent.trim() : project || 'This project';
    if (csProjectName) csProjectName.textContent = currentProjectName;
    // load settings for current project
    const settings = loadProjectSettings(currentProjectName) || { createNew: true, importPW: true, g2: false };
    prevCSSettings = { ...settings };
    if (csOptCreate) csOptCreate.checked = !!settings.createNew;
    if (csOptPW) csOptPW.checked = !!settings.importPW;
    if (csOptG2) csOptG2.checked = !!settings.g2;
    if (csModal) {
      csModal.classList.remove('hidden');
      document.body.classList.add('overflow-hidden');
    }
  }
  // If G2 is turned OFF in settings, confirm and remove G2 contracts
  if (csOptG2) {
    csOptG2.addEventListener('change', () => {
      const wasEnabled = !!(prevCSSettings && prevCSSettings.g2);
      if (wasEnabled && !csOptG2.checked) {
        const ok = window.confirm('Disabling G2 contracts will remove all G2-imported contracts from this project. Do you want to continue?');
        if (!ok) {
          // revert checkbox
          csOptG2.checked = true;
          return;
        }
        // Remove G2 contracts and re-render
        const before = contracts.length;
        const isG2Rec = (r) => {
          const src = (r.source || '').toString().toLowerCase();
          const title = (r.title || '').toString().toLowerCase();
          const desc = (r.description || '').toString().toLowerCase();
          return src === 'g2' || title.includes('imported from g2') || desc.includes('g2');
        };
        for (let i = contracts.length - 1; i >= 0; i--) {
          if (isG2Rec(contracts[i])) {
            contracts.splice(i, 1);
          }
        }
        const removed = before - contracts.length;
        saveContracts(contracts);
        renderContracts(contracts);
        showToast(`Removed ${removed} G2 contract(s).`, 'OK');
        // keep prev settings as-is; final persistence happens on Save
      }
    });
  }
  function closeCS() {
    if (csModal) {
      csModal.classList.add('hidden');
      document.body.classList.remove('overflow-hidden');
    }
  }
  function saveProjectSettings(title, settings) {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((p) => (p.title || '').toLowerCase() === (title || '').toLowerCase());
      const summary = [
        settings.createNew ? 'Create new' : null,
        settings.importPW ? 'Import from PW' : null,
        settings.g2 ? 'G2' : null
      ].filter(Boolean).join(', ');
      if (idx >= 0) {
        list[idx].contractsSettings = settings;
        list[idx].contracts = summary;
      }
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }
  if (openCSBtn) openCSBtn.addEventListener('click', openCS);
  [csOverlay, csClose, csCancel].forEach((el) => {
    if (el) el.addEventListener('click', closeCS);
  });
  if (csSave) {
    csSave.addEventListener('click', () => {
      const currentProjectName = (crumbProject && crumbProject.textContent) ? crumbProject.textContent.trim() : project || '';
      const settings = {
        createNew: csOptCreate ? !!csOptCreate.checked : true,
        importPW: csOptPW ? !!csOptPW.checked : false,
        g2: csOptG2 ? !!csOptG2.checked : false
      };
      saveProjectSettings(currentProjectName, settings);
      applyCreateMenuVisibility(settings);
      closeCS();
      showToast('Contract settings updated.', 'OK');
      // If G2 newly enabled, import 10 G2 records with loader
      if (settings.g2 && !(prevCSSettings && prevCSSettings.g2)) {
        renderImportSkeleton(10);
        setTimeout(() => {
          const now = Date.now();
          const imported = Array.from({ length: 10 }, (_, i) => ({
            id: now + i,
            createdAt: now + i,
            description: 'G2',
            projectId: 'G2-' + Math.floor(Math.random() * 1000),
            title: `Imported from G2 #${i + 1}`,
            bidsReceived: 0,
            status: Math.random() < 0.5 ? 'Active' : 'Closed',
            source: 'G2'
          }));
          imported.forEach((r) => contracts.push(r));
          saveContracts(contracts);
          renderContracts(contracts);
          showToast('Imported 10 contract(s) from G2.', 'View', () => {
            window.location.hash = '#g2-enabled';
          });
        }, 1200);
      }
    });
  }

  // Pagination controls
  if (pagePrevBtn) {
    pagePrevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage -= 1;
        renderContracts(contracts);
      }
    });
  }
  if (pageNextBtn) {
    pageNextBtn.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(contracts.length / pageSize));
      if (currentPage < totalPages) {
        currentPage += 1;
        renderContracts(contracts);
      }
    });
  }
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      pageSize = parseInt(pageSizeSelect.value, 10) || 10;
      currentPage = 1;
      renderContracts(contracts);
    });
  }
  populateProjectSelect();

  // Import from ProcureWare modal
  const importPWModal = document.getElementById('importPWModal');
  const importPWOverlay = document.getElementById('importPWOverlay');
  const importPWClose = document.getElementById('importPWClose');
  const importPWCancel = document.getElementById('importPWCancel');
  const importPWConfirm = document.getElementById('importPWConfirm');
  const importPWForm = document.getElementById('importPWForm');
  const importPWList = document.getElementById('importPWList');
  const importPWSearch = document.getElementById('importPWSearch');
  const importPWSelectAll = document.getElementById('importPWSelectAll');
  const ALL_PW_ITEMS = Array.from({ length: 50 }, (_, i) => {
    const num = (i + 1).toString().padStart(3, '0');
    const names = [
      'Electrical upgrade','Cooling system','Site works','Paving','Lighting',
      'HVAC ducts','Fire suppression','Security cameras','Plumbing rough-in',
      'Painting','Ceilings','Flooring','Glazing','Doors','Masonry','Roofing',
      'Elevators','IT backbone','Audio systems','Landscaping'
    ];
    return { id: `B${num}`, name: `${names[i % names.length]} Package ${i + 1}` };
  });
  let importSelection = new Set();
  let importFilter = '';

  function renderImportList() {
    if (!importPWList) return;
    importPWList.innerHTML = '';
    const filtered = ALL_PW_ITEMS.filter(
      (it) => it.id.toLowerCase().includes(importFilter) || it.name.toLowerCase().includes(importFilter)
    );
    filtered.forEach((it) => {
      const row = document.createElement('label');
      row.className = 'flex items-center gap-3 px-3 py-2 text-sm';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'rounded border-gray-300';
      input.value = it.id;
      input.checked = importSelection.has(it.id);
      input.addEventListener('change', (e) => {
        if (e.target.checked) importSelection.add(it.id);
        else importSelection.delete(it.id);
      });
      const text = document.createElement('span');
      text.textContent = `${it.id} — ${it.name}`;
      row.appendChild(input);
      row.appendChild(text);
      importPWList.appendChild(row);
    });
    // Update select all checkbox state
    if (importPWSelectAll) {
      const total = filtered.length;
      const selected = filtered.filter((it) => importSelection.has(it.id)).length;
      importPWSelectAll.checked = total > 0 && selected === total;
      importPWSelectAll.indeterminate = selected > 0 && selected < total;
    }
  }

  function openImportPW() {
    if (!importPWModal) return;
    importSelection = new Set();
    importFilter = '';
    if (importPWSearch) importPWSearch.value = '';
    renderImportList();
    importPWModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
  function closeImportPW() {
    if (!importPWModal) return;
    importPWModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
  if (importPWLink) {
    importPWLink.addEventListener('click', (e) => {
      e.preventDefault();
      closeMenu(createMenu);
      openImportPW();
    });
  }
  if (useG2Link) {
    useG2Link.addEventListener('click', (e) => {
      e.preventDefault();
      closeMenu(createMenu);
      // Simulate G2 import with loader and 10 records
      renderImportSkeleton(10);
      setTimeout(() => {
        const now = Date.now();
        const imported = Array.from({ length: 10 }, (_, i) => ({
          id: now + i,
          createdAt: now + i,
          description: 'G2',
          projectId: 'G2-' + Math.floor(Math.random() * 1000),
          title: `Imported from G2 #${i + 1}`,
          bidsReceived: 0,
          status: Math.random() < 0.5 ? 'Active' : 'Closed',
          source: 'G2'
        }));
        imported.forEach((r) => contracts.push(r));
        saveContracts(contracts);
        renderContracts(contracts);
        showToast('Imported 10 contract(s) from G2.', 'View', () => {
          window.location.hash = '#g2-import';
        });
      }, 1200);
    });
  }
  [importPWOverlay, importPWClose, importPWCancel].forEach((el) => {
    if (el) el.addEventListener('click', closeImportPW);
  });

  function closeMenu(menu) {
    if (menu && !menu.classList.contains('hidden')) menu.classList.add('hidden');
  }

  // Header Create dropdown (top navigation)
  (function () {
    const btn = document.getElementById('globalCreateBtn');
    const menu = document.getElementById('globalCreateMenu');
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    menu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', (e) => {
      if (menu.classList.contains('hidden')) return;
      if (e.target === btn || btn.contains(e.target)) return;
      if (!menu.contains(e.target)) menu.classList.add('hidden');
    });
    const trend = document.getElementById('createTrendOption');
    const change = document.getElementById('createChangeOption');
    [trend, change].forEach((el) => {
      if (el) el.addEventListener('click', (ev) => {
        ev.preventDefault();
        menu.classList.add('hidden');
        showToast('This action is not implemented in the demo.', 'OK');
      });
    });
  })();
  if (importPWSearch) {
    importPWSearch.addEventListener('input', () => {
      importFilter = importPWSearch.value.trim().toLowerCase();
      renderImportList();
    });
  }
  if (importPWSelectAll) {
    importPWSelectAll.addEventListener('change', () => {
      const filtered = ALL_PW_ITEMS.filter(
        (it) => it.id.toLowerCase().includes(importFilter) || it.name.toLowerCase().includes(importFilter)
      );
      if (importPWSelectAll.checked) {
        filtered.forEach((it) => importSelection.add(it.id));
      } else {
        filtered.forEach((it) => importSelection.delete(it.id));
      }
      renderImportList();
    });
  }

  function renderImportSkeleton(rows) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    for (let i = 0; i < rows; i++) {
      const tr = document.createElement('tr');
      tr.className = 'animate-pulse';
      for (let c = 0; c < 6; c++) {
        const td = document.createElement('td');
        td.className = 'px-4 py-3';
        const bar = document.createElement('div');
        bar.className = 'h-3 w-full rounded bg-gray-200';
        td.appendChild(bar);
        tr.appendChild(td);
      }
      tableBody.appendChild(tr);
    }
  }

  if (importPWConfirm) {
    importPWConfirm.addEventListener('click', (e) => {
      e.preventDefault();
      const chosen = Array.from(importSelection);
      closeImportPW();
      // Show loader skeleton
      renderImportSkeleton(Math.max(10, chosen.length || 10));
      // Simulate import delay
      setTimeout(() => {
        const imported = (chosen.length ? chosen : ALL_PW_ITEMS.slice(0, 10).map((x) => x.id)).map((id) => {
          const status = Math.random() < 0.5 ? 'Active' : 'Closed';
          return {
            id: Date.now() + Math.random(),
            createdAt: Date.now(),
            description: 'ProcureWare',
            projectId: id,
            title: `Imported from PW: ${id}`,
            bidsReceived: 0,
            status,
            source: 'ProcureWare'
          };
        });
        imported.forEach((r) => contracts.push(r));
        saveContracts(contracts);
        renderContracts(contracts);
        showToast(`Imported ${imported.length} contract(s) from ProcureWare.`, 'View', () => {
          window.location.hash = '#imported';
        });
      }, 1500);
    });
  }

  // Mode switching
  function enterCreateMode() {
    if (modalTitle) modalTitle.textContent = 'Create contract';
    if (form) form.classList.remove('hidden');
    if (contractView) contractView.classList.add('hidden');
    if (modalActions) modalActions.classList.remove('hidden');
    if (editContractBtn) editContractBtn.classList.add('hidden');
    if (statusBadge) {
      statusBadge.classList.add('hidden');
      statusBadge.innerHTML = '';
    }
    if (sendBtn) sendBtn.textContent = 'Send';
    if (saveDraftBtn) saveDraftBtn.textContent = 'Save as draft';
    editingRecordId = null;
    ensureOnePayRow();
  }
  function enterViewMode(rec) {
    if (modalTitle) modalTitle.textContent = 'Contract details';
    lastViewedRecord = rec;
    editingRecordId = rec && rec.id ? rec.id : null;
    if (editContractBtn) {
      const isG2 = ((rec && rec.source) || '').toString().toLowerCase() === 'g2';
      if (isG2) editContractBtn.classList.add('hidden');
      else editContractBtn.classList.remove('hidden');
    }
    if (sendBtn) sendBtn.textContent = 'Send';
    if (saveDraftBtn) saveDraftBtn.textContent = 'Save as draft';
    // Show status badge
    if (statusBadge) {
      statusBadge.classList.remove('hidden');
      statusBadge.innerHTML = '';
      const pill = statusPill(rec.status || 'Submitted');
      pill.classList.add('cursor-pointer');
      statusBadge.appendChild(pill);
    }
    if (form) form.classList.add('hidden');
    if (contractView) {
      contractView.classList.remove('hidden');
      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '—';
      };
      // Sample data from the image (used as defaults)
      const sample = {
        number: 'CA-001-234-2025',
        company: 'Amazon company',
        depGoal: '—',
        title: 'Data here',
        startDate: '11/12/2024',
        federallyFunded: 'No',
        usergroup: 'Data here',
        endDate: '11/12/2029',
        billingAddress: '600 Western way, west valley,\nWA 98021 US',
        externalAccess: 'Data here',
        renewalTerms: '--',
        shippingAddress: '600 Western way, west valley,\nWA 98021 US',
        contractType: 'Data here',
        currency: 'USD',
        relatedBid: 'B010',
        contractStatus: 'Data here',
        startingValue: '$ 106,800.00',
        disableAlerts: 'No',
        projectManager: 'Lily Carter',
        payItems: [
          'PVC pipes for drainage systems.',
          'Galvanized pipes for water supply.',
          'Reinforced concrete pipes for stormwater management.',
          'Aluminum pipes for lightweight structures.',
          'Flexible hoses for irrigation.',
          'Copper pipes for plumbing installations.',
          'Ductile iron pipes for sewer lines.'
        ]
      };
      setText('viewNumber', rec.projectId || sample.number);
      setText('viewCompany', sample.company);
      setText('viewDepGoal', sample.depGoal);
      setText('viewTitle', rec.title || sample.title);
      setText('viewStartDate', rec.startDate || sample.startDate);
      setText('viewFederallyFunded', sample.federallyFunded);
      setText('viewUsergroup', sample.usergroup);
      setText('viewEndDate', rec.endDate || sample.endDate);
      setText('viewBillingAddress', sample.billingAddress);
      setText('viewExternalAccess', sample.externalAccess);
      setText('viewRenewalTerms', sample.renewalTerms);
      setText('viewShippingAddress', sample.shippingAddress);
      setText('viewContractType', rec.contractType || sample.contractType);
      setText('viewCurrency', rec.currency || sample.currency);
      setText('viewRelatedBid', sample.relatedBid);
      setText('viewContractStatus', rec.status || sample.contractStatus);
      setText('viewStartingValue', sample.startingValue);
      setText('viewDisableAlerts', sample.disableAlerts);
      setText('viewProjectManager', sample.projectManager);
      const payBody = document.getElementById('viewPayBody');
      if (payBody) {
        payBody.innerHTML = '';
        const items = (rec.payItems && rec.payItems.length)
          ? rec.payItems.map((i) => ({ item: i.item || '—', qty: i.qty || '—' }))
          : (sample.payItems || []).map((text) => ({ item: text, qty: '100' }));
        items.forEach(({ item, qty }) => {
          const tr = document.createElement('tr');
          const tdItem = document.createElement('td');
          tdItem.className = 'px-4 py-2 text-gray-800';
          tdItem.textContent = item;
          const tdQty = document.createElement('td');
          tdQty.className = 'px-4 py-2 text-right text-gray-800';
          tdQty.textContent = qty;
          tr.append(tdItem, tdQty);
          payBody.appendChild(tr);
        });
      }
    }
    if (modalActions) modalActions.classList.add('hidden');
  }

  // Pay items logic
  function prefillFormFromRecord(rec) {
    if (!form || !rec) return;
    const setVal = (sel, v) => {
      const el = form.querySelector(sel);
      if (el) el.value = v || '';
    };
    const setSelectByValueOrText = (sel, v) => {
      const el = form.querySelector(sel);
      if (!el || v == null) return;
      const val = String(v);
      // try value match
      el.value = val;
      if (el.value === val) return;
      // try text match
      const opt = Array.from(el.options).find((o) => o.textContent.trim() === val);
      if (opt) {
        el.value = opt.value;
        return;
      }
      // fallback add option
      const newOpt = document.createElement('option');
      newOpt.value = val;
      newOpt.textContent = val;
      el.appendChild(newOpt);
      el.value = val;
    };
    setVal('input[name="contractId"]', rec.projectId || '');
    setVal('input[name="title"]', rec.title || '');
    setVal('input[name="startDate"]', rec.startDate || '');
    setVal('input[name="endDate"]', rec.endDate || '');
    setSelectByValueOrText('select[name="contractType"]', rec.contractType || '');
    setSelectByValueOrText('select[name="contractor"]', rec.contractor || '');
    setSelectByValueOrText('select[name="currency"]', rec.currency || '');
    setSelectByValueOrText('select[name="projectName"]', rec.description || '');
    if (payItemsContainer) {
      payItemsContainer.innerHTML = '';
      if (rec.payItems && rec.payItems.length) {
        rec.payItems.forEach((pi) => {
          payItemsContainer.appendChild(createPayRow(pi.item || '', pi.qty || ''));
        });
      } else {
        ensureOnePayRow();
      }
    }
  }
  function createPayRow(item = '', qty = '') {
    const row = document.createElement('div');
    row.className = 'pay-row grid grid-cols-1 gap-3 sm:grid-cols-6 items-end';
    row.innerHTML = `
      <div class="sm:col-span-4">
        <label class="mb-1 block text-xs font-medium text-gray-700">Item</label>
        <input name="payItem" type="text" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div class="sm:col-span-1">
        <label class="mb-1 block text-xs font-medium text-gray-700">Quantity</label>
        <input name="payQty" type="number" class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
      </div>
      <div class="sm:col-span-1 flex items-end">
        <button type="button" class="remove-pay inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs hover:bg-gray-50">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M6.225 4.811 4.81 6.225 10.586 12l-5.775 5.775 1.414 1.414L12 13.414l5.775 5.775 1.414-1.414L13.414 12l5.775-5.775-1.414-1.414L12 10.586 6.225 4.811Z"/></svg>
          Close
        </button>
      </div>
    `;
    row.querySelector('input[name="payItem"]').value = item;
    row.querySelector('input[name="payQty"]').value = qty;
    return row;
  }
  function ensureOnePayRow() {
    if (!payItemsContainer) return;
    const rows = payItemsContainer.querySelectorAll('.pay-row');
    if (rows.length === 0) {
      payItemsContainer.appendChild(createPayRow());
    } else if (rows.length === 1) {
      rows[0].querySelector('input[name="payItem"]').value = '';
      rows[0].querySelector('input[name="payQty"]').value = '';
    }
  }
  // Populate project select from stored projects
  function populateProjectSelect() {
    const select = document.querySelector('select[name="projectName"]');
    if (!select) return;
    const raw = localStorage.getItem(PROJECTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    // Keep existing options, append new ones if not present
    const existing = new Set(Array.from(select.options).map((o) => o.textContent.trim()));
    list.forEach((p) => {
      if (!existing.has(p.title)) {
        const opt = document.createElement('option');
        opt.textContent = p.title;
        select.appendChild(opt);
      }
    });
  }
  function collectPayItems() {
    if (!payItemsContainer) return [];
    return Array.from(payItemsContainer.querySelectorAll('.pay-row')).map((row) => {
      const item = row.querySelector('input[name="payItem"]').value.trim();
      const qty = row.querySelector('input[name="payQty"]').value.trim();
      return { item, qty };
    }).filter((r) => r.item || r.qty);
  }
  if (addPayBtn && payItemsContainer) {
    addPayBtn.addEventListener('click', () => {
      payItemsContainer.appendChild(createPayRow());
      const last = payItemsContainer.querySelector('.pay-row:last-child input[name="payItem"]');
      if (last) last.focus();
    });
    payItemsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-pay');
      if (!btn) return;
      const row = btn.closest('.pay-row');
      if (!row) return;
      const rows = Array.from(payItemsContainer.querySelectorAll('.pay-row'));
      if (rows.length > 1) {
        row.remove();
      } else {
        // Last remaining row: clear inputs
        row.querySelector('input[name="payItem"]').value = '';
        row.querySelector('input[name="payQty"]').value = '';
      }
    });
  }

  // Toggle edit from view
  if (editContractBtn) {
    editContractBtn.addEventListener('click', () => {
      if (lastViewedRecord && ((lastViewedRecord.source || '').toString().toLowerCase() === 'g2')) {
        // Editing is disabled for G2 imported contracts
        return;
      }
      if (!lastViewedRecord) return;
      if (modalTitle) modalTitle.textContent = 'Edit contract';
      if (form) {
        form.classList.remove('hidden');
        prefillFormFromRecord(lastViewedRecord);
      }
      if (contractView) contractView.classList.add('hidden');
      if (modalActions) modalActions.classList.remove('hidden');
      if (sendBtn) sendBtn.textContent = 'Update';
      if (saveDraftBtn) saveDraftBtn.textContent = 'Save';
      if (editContractBtn) editContractBtn.classList.add('hidden');
      if (statusBadge) statusBadge.classList.add('hidden');
    });
  }

  // Status tooltip (clone Workflow body content)
  let statusTooltipEl = null;
  function hideStatusTooltip() {
    if (statusTooltipEl) {
      statusTooltipEl.remove();
      statusTooltipEl = null;
    }
    document.removeEventListener('click', onDocClickForTooltip, true);
  }
  function onDocClickForTooltip(e) {
    if (!statusTooltipEl) return;
    if (statusTooltipEl.contains(e.target) || (statusBadge && statusBadge.contains(e.target))) return;
    hideStatusTooltip();
  }
  function toggleStatusTooltip() {
    if (!statusBadge || !workflowBodyContent) return;
    if (statusTooltipEl) {
      hideStatusTooltip();
      return;
    }
    const rect = statusBadge.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.className = 'fixed z-[80] w-[24rem] max-h-96 overflow-auto rounded-md border border-gray-200 bg-white p-3 shadow-xl';
    tip.style.top = `${rect.bottom + window.scrollY + 8}px`;
    tip.style.left = `${rect.left + window.scrollX}px`;
    // Clone only the inner content of workflow body
    const inner = document.createElement('div');
    inner.innerHTML = workflowBodyContent.innerHTML;
    // Strip edit controls from tooltip
    [
      '#editReviewersBtn','#saveReviewersBtn','#cancelReviewersBtn',
      '#editAcceptanceBtn','#saveAcceptanceBtn','#cancelAcceptanceBtn',
      '#editReviewersPanel','#editAcceptancePanel'
    ].forEach((sel) => {
      const el = inner.querySelector(sel);
      if (el) el.remove();
    });
    tip.appendChild(inner);
    document.body.appendChild(tip);
    statusTooltipEl = tip;
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', onDocClickForTooltip, true);
    }, 0);
  }
  if (statusBadge) {
    statusBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStatusTooltip();
    });
  }

  // Row click -> view modal
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row || !row.dataset.id) return;
      const id = row.dataset.id;
      const rec = contracts.find((r) => String(r.id) === id);
      if (!rec) return;
      enterViewMode(rec);
      openModal();
    });
  }

  // Toast
  function showToast(message, actionLabel, onAction) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pointer-events-auto flex items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm shadow-lg transition-all duration-200 opacity-0 translate-x-4';
    const msg = document.createElement('div');
    msg.className = 'text-gray-800';
    msg.textContent = message;
    wrapper.appendChild(msg);
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.className = 'ml-2 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        if (onAction) onAction();
        wrapper.remove();
      });
      wrapper.appendChild(btn);
    }
    toastContainer.appendChild(wrapper);
    requestAnimationFrame(() => {
      wrapper.classList.remove('opacity-0', 'translate-x-4');
    });
    setTimeout(() => {
      wrapper.classList.add('opacity-0', 'translate-x-4');
      setTimeout(() => wrapper.remove(), 200);
    }, 5000);
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!validateForm()) return;
      const fd = new FormData(form);
      // Update existing record if editing -> open Workflow
      if (editingRecordId) {
        const idx = contracts.findIndex((c) => String(c.id) === String(editingRecordId));
        if (idx >= 0) {
          const base = contracts[idx];
          pendingRecord = {
            ...base,
            description: fd.get('projectName') || base.description,
            projectId: fd.get('contractId') || base.projectId,
            title: fd.get('title') || base.title,
            contractType: fd.get('contractType') || base.contractType,
            contractor: fd.get('contractor') || base.contractor,
            startDate: fd.get('startDate') || base.startDate,
            endDate: fd.get('endDate') || base.endDate,
            currency: fd.get('currency') || base.currency,
            payItems: collectPayItems(),
            status: 'Submitted',
            createdAt: base.createdAt || Date.now(),
            source: base.source || 'Control center'
          };
          pendingIsUpdate = true;
          openWorkflowModal();
          return;
        }
      }
      pendingRecord = {
        id: Date.now(),
        createdAt: Date.now(),
        description: fd.get('projectName') || '—',
        projectId: fd.get('contractId') || '—',
        title: fd.get('title') || '—',
        contractType: fd.get('contractType') || '—',
        contractor: fd.get('contractor') || '—',
        startDate: fd.get('startDate') || '—',
        endDate: fd.get('endDate') || '—',
        currency: fd.get('currency') || '—',
        payItems: collectPayItems(),
        bidsReceived: 0,
        status: 'Submitted',
        source: 'Control center'
      };
      pendingIsUpdate = false;
      openWorkflowModal();
    });
  }
  if (workflowSendBtn) {
    workflowSendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pendingRecord) return;
      // Start progression at "In review"
      pendingRecord.status = 'In review';
      const idx = contracts.findIndex((c) => String(c.id) === String(pendingRecord.id));
      if (idx >= 0) {
        contracts[idx] = pendingRecord;
      } else {
        contracts.push(pendingRecord);
      }
      saveContracts(contracts);
      renderContracts(contracts);
      // Schedule status progression: In review -> In acceptance -> Active
      const idForProgress = pendingRecord.id;
      setTimeout(() => {
        const i1 = contracts.findIndex((c) => String(c.id) === String(idForProgress));
        if (i1 >= 0 && contracts[i1].status === 'In review') {
          contracts[i1].status = 'In acceptance';
          saveContracts(contracts);
          renderContracts(contracts);
        }
      }, 15000);
      setTimeout(() => {
        const i2 = contracts.findIndex((c) => String(c.id) === String(idForProgress));
        if (i2 >= 0 && (contracts[i2].status === 'In acceptance' || contracts[i2].status === 'In review')) {
          contracts[i2].status = 'Active';
          saveContracts(contracts);
          renderContracts(contracts);
        }
      }, 30000);
      closeWorkflowModal();
      closeModal();
      form.reset();
      showToast(pendingIsUpdate ? 'Contract updated.' : 'Contract sent successfully.', 'View', () => {
        window.location.hash = pendingIsUpdate ? '#contract-updated' : '#contract-sent';
      });
      pendingRecord = null;
      pendingIsUpdate = false;
    });
  }
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      // Update existing record if editing (save as draft)
      if (editingRecordId) {
        const idx = contracts.findIndex((c) => String(c.id) === String(editingRecordId));
        if (idx >= 0) {
          const updated = {
            ...contracts[idx],
            description: fd.get('projectName') || contracts[idx].description,
            projectId: fd.get('contractId') || contracts[idx].projectId,
            title: fd.get('title') || contracts[idx].title,
            contractType: fd.get('contractType') || contracts[idx].contractType,
            contractor: fd.get('contractor') || contracts[idx].contractor,
            startDate: fd.get('startDate') || contracts[idx].startDate,
            endDate: fd.get('endDate') || contracts[idx].endDate,
            currency: fd.get('currency') || contracts[idx].currency,
            payItems: collectPayItems(),
            status: 'Draft'
          };
          contracts[idx] = updated;
          saveContracts(contracts);
          renderContracts(contracts);
          closeModal();
          form.reset();
          showToast('Draft updated.', 'View', () => {
            window.location.hash = '#draft-updated';
          });
          editingRecordId = null;
          return;
        }
      }
      const rec = {
        id: Date.now(),
        createdAt: Date.now(),
        description: fd.get('projectName') || '—',
        projectId: fd.get('contractId') || '—',
        title: fd.get('title') || '—',
        contractType: fd.get('contractType') || '—',
        contractor: fd.get('contractor') || '—',
        startDate: fd.get('startDate') || '—',
        endDate: fd.get('endDate') || '—',
        currency: fd.get('currency') || '—',
        payItems: collectPayItems(),
        bidsReceived: 0,
        status: 'Draft',
        source: 'Control center'
      };
      contracts.push(rec);
      saveContracts(contracts);
      renderContracts(contracts);
      closeModal();
      form.reset();
      showToast('Draft saved.', 'View', () => {
        window.location.hash = '#draft-saved';
      });
    });
  }
})();

