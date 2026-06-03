/* ===== TOP NAV ===== */
function toggleNavDropdown(id) {
  const item = document.getElementById(id);
  const isOpen = item.classList.contains('open');
  // close all
  document.querySelectorAll('.tnav-has-dropdown.open').forEach(el => {
    el.classList.remove('open');
    el.querySelector('.tnav-link-dropdown')?.setAttribute('aria-expanded', 'false');
  });
  if (!isOpen) {
    item.classList.add('open');
    item.querySelector('.tnav-link-dropdown')?.setAttribute('aria-expanded', 'true');
  }
}

function toggleAddons() {
  const panel = document.getElementById('tnavAddonsPanel');
  const isOpen = panel.classList.contains('open');
  closeAllTnavOverlays();
  if (!isOpen) panel.classList.add('open');
}

function toggleProfile() {
  const panel = document.getElementById('tnavProfilePanel');
  const btn   = document.querySelector('.tnav-avatar');
  const isOpen = panel.classList.contains('open');
  closeAllTnavOverlays();
  if (!isOpen) {
    panel.classList.add('open');
    btn?.setAttribute('aria-expanded', 'true');
  }
}

function toggleMobileMenu() {
  const menu = document.getElementById('tnavMenu');
  const btn  = document.querySelector('.tnav-hamburger');
  const isOpen = menu.classList.contains('mobile-open');
  menu.classList.toggle('mobile-open', !isOpen);
  btn?.setAttribute('aria-expanded', String(!isOpen));
}

function closeAllTnavOverlays() {
  document.getElementById('tnavAddonsPanel')?.classList.remove('open');
  document.getElementById('tnavProfilePanel')?.classList.remove('open');
  document.querySelectorAll('.tnav-has-dropdown.open').forEach(el => {
    el.classList.remove('open');
    el.querySelector('.tnav-link-dropdown')?.setAttribute('aria-expanded', 'false');
  });
}

// Close overlays when clicking outside the nav
document.addEventListener('click', (e) => {
  if (!e.target.closest('.top-nav')) closeAllTnavOverlays();
});

// Keyboard: close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllTnavOverlays();
});

/* ===== LEFT NAV: highlight active section on scroll ===== */
const sections = document.querySelectorAll('.component-section');
const navLinks = document.querySelectorAll('.left-nav-link');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.left-nav-link[href="#${entry.target.id}"]`);
      if (link) link.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });

sections.forEach(s => observer.observe(s));

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ===== SPLIT BUTTON ===== */
function toggleSplitMenu(id) {
  const menu = document.getElementById(id);
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.split-btn-menu').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.split-btn')) {
    document.querySelectorAll('.split-btn-menu').forEach(m => m.classList.remove('open'));
  }
});

/* ===== DROPDOWN ===== */
function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const isOpen = dd.classList.contains('open');
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
  if (!isOpen) dd.classList.add('open');
}
function selectOption(ddId, value) {
  const dd = document.getElementById(ddId);
  dd.querySelector('.dropdown-value').textContent = value;
  dd.querySelector('.dropdown-value').classList.remove('dropdown-placeholder');
  dd.classList.remove('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
  }
});

/* ===== CHECKBOX ===== */
function toggleCheck(box) {
  if (box.classList.contains('disabled')) return;
  if (box.classList.contains('indeterminate')) {
    box.classList.remove('checked', 'indeterminate');
    box.innerHTML = '';
  } else if (box.classList.contains('checked')) {
    box.classList.remove('checked');
    box.innerHTML = '';
  } else {
    box.classList.add('checked');
    box.innerHTML = '<i class="pi pi-check checkbox-check-icon"></i>';
  }
}

/* ===== RADIO BUTTON ===== */
function selectRadio(group, id) {
  document.querySelectorAll(`[data-radio-group="${group}"]`).forEach(r => r.classList.remove('selected'));
  const target = document.getElementById(id);
  if (target && !target.classList.contains('disabled')) target.classList.add('selected');
}
document.querySelectorAll('.radio-wrapper').forEach(wrapper => {
  const box = wrapper.querySelector('.radio-box');
  if (box && !box.classList.contains('disabled')) {
    box.dataset.radioGroup = 'rg1';
  }
});

/* ===== INPUT NUMBER ===== */
function changeNum(id, delta) {
  const input = document.getElementById(id);
  const current = parseFloat(input.value) || 0;
  const min = parseFloat(input.min);
  const newVal = current + delta;
  if (!isNaN(min) && newVal < min) return;
  input.value = newVal;
}

/* ===== CHIPS ===== */
function addChip(e) {
  if (e.key !== 'Enter' && e.key !== ',') return;
  e.preventDefault();
  const input = e.target;
  const val = input.value.trim().replace(/,$/, '');
  if (!val) return;
  const container = document.getElementById('chipsContainer');
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.innerHTML = `${val}<i class="pi pi-times chip-remove" onclick="removeChip(this)"></i>`;
  container.insertBefore(chip, input);
  input.value = '';
}
function removeChip(icon) {
  icon.closest('.chip').remove();
}

/* ===== ACCORDION ===== */
function toggleAccordion(header) {
  const isActive = header.classList.contains('active');
  const tab = header.closest('.accordion-tab');
  const content = tab.querySelector('.accordion-content');

  document.querySelectorAll('.accordion-header.active').forEach(h => {
    h.classList.remove('active');
    h.querySelector('.accordion-icon').className = 'pi pi-chevron-right accordion-icon';
    const c = h.closest('.accordion-tab').querySelector('.accordion-content');
    if (c) c.style.display = 'none';
  });

  if (!isActive) {
    header.classList.add('active');
    header.querySelector('.accordion-icon').className = 'pi pi-chevron-down accordion-icon';
    if (content) content.style.display = 'block';
  }
}
document.querySelectorAll('.accordion-tab .accordion-content').forEach((c, i) => {
  if (!c.closest('.accordion-tab').querySelector('.accordion-header.active')) {
    c.style.display = 'none';
  }
});

/* ===== PANEL TOGGLE ===== */
function togglePanel(btn) {
  const panel = btn.closest('.panel');
  const content = panel.querySelector('.panel-content');
  const icon = btn.querySelector('i');
  if (content) {
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    panel.classList.toggle('panel-collapsed', isVisible);
    icon.className = isVisible ? 'pi pi-plus' : 'pi pi-minus';
  }
}

/* ===== TAB MENU ===== */
function switchTab(menuId, clickedItem, contentId, panelId) {
  document.querySelectorAll(`#${menuId} .tab-menu-item`).forEach(i => i.classList.remove('active'));
  clickedItem.classList.add('active');
  document.querySelectorAll(`#${contentId} .tab-panel`).forEach(p => p.classList.remove('active'));
  const target = document.getElementById(panelId);
  if (target) target.classList.add('active');
}

/* ===== TOAST ===== */
const toastIcons = {
  info:    'pi-info-circle',
  success: 'pi-check',
  warn:    'pi-exclamation-triangle',
  error:   'pi-times-circle'
};
/* Contruent DS toast (Storybook: Components/Base/Toast) — severity surface,
   icon + message + divider + close. Title and detail are both optional. */
function showToast(type, title, detail) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <i class="pi ${toastIcons[type]} toast-icon"></i>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      ${detail ? `<div class="toast-detail">${detail}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => dismissToast(toast), 3000);
}
function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.animation = 'toast-out 0.25s ease forwards';
  setTimeout(() => toast.remove(), 250);
}

/* ===== LEFT NAV ===== */
const LNAV_KEY = 'left-navigation-is-open';

function toggleLeftNav() {
  const nav = document.getElementById('leftNav');
  const isCollapsed = nav.dataset.collapsed === 'true';
  nav.dataset.collapsed = isCollapsed ? 'false' : 'true';
  document.body.classList.toggle('lnav-collapsed', !isCollapsed);
  localStorage.setItem(LNAV_KEY, String(isCollapsed));
}

function toggleLnavGroup(btn) {
  const item = btn.closest('.lnav-has-children');
  const sub = item.querySelector('.lnav-sub');
  const chevron = btn.querySelector('.lnav-chevron');
  const isOpen = sub.classList.contains('lnav-sub-open');
  sub.classList.toggle('lnav-sub-open', !isOpen);
  btn.setAttribute('aria-expanded', String(!isOpen));
  chevron.className = `pi ${isOpen ? 'pi-angle-down' : 'pi-angle-up'} lnav-chevron`;
  item.classList.toggle('lnav-expanded', !isOpen);
}

function setLnavActive(link) {
  document.querySelectorAll('.lnav-link, .lnav-sublink').forEach(l => {
    l.classList.remove('lnav-link-active', 'lnav-sublink-active');
  });
  if (link.classList.contains('lnav-sublink')) {
    link.classList.add('lnav-sublink-active');
  } else {
    link.classList.add('lnav-link-active');
  }
}

(function initLnav() {
  const saved = localStorage.getItem(LNAV_KEY);
  if (saved === 'false') {
    const nav = document.getElementById('leftNav');
    if (nav) {
      nav.dataset.collapsed = 'true';
      document.body.classList.add('lnav-collapsed');
    }
  }
})();

/* ===== PROJECT CONTEXT ===== */
const PROJ_KEY = 'currentProject';

/* Default project shown until the user selects one */
const DEFAULT_PROJECT = { name: 'Cisco Systems', id: '0128-0919-0001', initials: 'CS', color: '#1565c0' };

function selectProject(el) {
  const proj = {
    name:     el.dataset.projName,
    id:       el.dataset.projId,
    initials: el.dataset.projInitials,
    color:    el.dataset.projColor,
  };
  localStorage.setItem(PROJ_KEY, JSON.stringify(proj));
}

function applyProjectContext() {
  let proj;
  try { proj = JSON.parse(localStorage.getItem(PROJ_KEY)); } catch (e) {}
  if (!proj || !proj.name) proj = DEFAULT_PROJECT;

  /* Text nodes */
  document.querySelectorAll('[data-proj="name"]').forEach(el => { el.textContent = proj.name; });
  document.querySelectorAll('[data-proj="id"]').forEach(el => { el.textContent = proj.id; });
  document.querySelectorAll('[data-proj="initials"]').forEach(el => { el.textContent = proj.initials; });

  /* Avatar elements get both initials + background colour */
  document.querySelectorAll('[data-proj="avatar"]').forEach(el => {
    el.textContent = proj.initials;
    el.style.background = proj.color;
  });

  /* Browser tab title: replace the first segment before " —" */
  document.title = document.title.replace(/^[^—]+—\s*/, proj.name + ' — ');
}
