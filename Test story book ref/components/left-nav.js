/* ===== LEFT NAVIGATION COMPONENT =====
 * Usage: renderLeftNav({ activeLink: 'project-home' | null, expandedGroup: 'contracts' | null, activeSub: 'contracts-list' | null })
 * activeLink  — key of the top-level link that should have lnav-link-active
 * expandedGroup — key of the group that should be open on load
 * activeSub   — key of the sub-item that should have lnav-sublink-active
 *
 * Sub-item keys:
 *   cost-summary, budget, commitments
 *   purchase-orders, bid-packages, vendors
 *   contracts-list, contracts-reports
 *   owner-invoices, subcontractor-invoices
 *   change-orders, potential-changes
 *   reports-overview, custom-reports
 */
(function () {
  var ITEMS = [
    { key: 'project-home', icon: 'pi-home',      label: 'Project Home',      href: 'project-home.html' },
    { key: 'cost',         icon: 'pi-dollar',    label: 'Cost',              children: [
      { key: 'control-accounts', label: 'Control Accounts', href: '#' },
      { key: 'progress',         label: 'Progress',         href: '#' },
      { key: 'cost-summary',     label: 'Summary',          href: '#' },
      { key: 'cost-reports',     label: 'Reports',          href: '#' },
      { key: 'ai-forecasting',   label: 'AI Forecasting',   href: 'scurve-forecast.html' },
    ]},
    { key: 'field',        icon: 'pi-map',       label: 'Field Management',  href: '#' },
    { key: 'procurement',  icon: 'pi-box',       label: 'Procurement',       children: [
      { key: 'purchase-orders', label: 'Purchase Orders', href: '#' },
      { key: 'bid-packages',    label: 'Bid Packages',    href: '#' },
      { key: 'vendors',         label: 'Vendors',         href: '#' },
    ]},
    { key: 'contracts',    icon: 'pi-file',      label: 'Contracts',         children: [
      { key: 'contracts-list',    label: 'Contracts', href: 'contracts.html' },
      { key: 'contracts-reports', label: 'Reports',   href: '#' },
    ]},
    { key: 'invoices',     icon: 'pi-book',      label: 'Invoices',          children: [
      { key: 'owner-invoices',         label: 'Owner Invoices',         href: '#' },
      { key: 'subcontractor-invoices', label: 'Subcontractor Invoices', href: '#' },
    ]},
    { key: 'change-mgmt',  icon: 'pi-refresh',   label: 'Change Management', children: [
      { key: 'change-orders',    label: 'Change Orders',    href: '#' },
      { key: 'potential-changes', label: 'Potential Changes', href: '#' },
    ]},
    { key: 'reports',      icon: 'pi-chart-bar', label: 'Reports',           children: [
      { key: 'reports-overview', label: 'Overview',       href: '#' },
      { key: 'custom-reports',   label: 'Custom Reports', href: '#' },
    ]},
    { key: 'drive',        icon: 'pi-folder',    label: 'Drive',             href: '#' },
  ];

  window.renderLeftNav = function (config) {
    var activeLink    = (config && config.activeLink)    || null;
    var expandedGroup = (config && config.expandedGroup) || null;
    var activeSub     = (config && config.activeSub)     || null;

    var items = ITEMS.map(function (item) {
      if (!item.children) {
        var isActive = item.key === activeLink;
        return `
          <div class="lnav-item" data-key="${item.key}">
            <a class="lnav-link${isActive ? ' lnav-link-active' : ''}" href="${item.href}" onclick="setLnavActive(this)">
              <i class="pi ${item.icon} lnav-icon" aria-hidden="true"></i>
              <span class="lnav-label">${item.label}</span>
            </a>
          </div>`;
      }

      var isOpen       = item.key === expandedGroup;
      var expandedCls  = isOpen ? ' lnav-expanded' : '';
      var subOpenCls   = isOpen ? ' lnav-sub-open' : '';
      var chevron      = isOpen ? 'pi-angle-up' : 'pi-angle-down';
      var ariaExpanded = isOpen ? 'true' : 'false';
      var ariaHidden   = isOpen ? 'false' : 'true';

      var children = item.children.map(function (child) {
        var isActiveSub = child.key === activeSub;
        return `<li><a class="lnav-sublink${isActiveSub ? ' lnav-sublink-active' : ''}" href="${child.href}" onclick="setLnavActive(this)">${child.label}</a></li>`;
      }).join('');

      return `
          <div class="lnav-item lnav-has-children${expandedCls}" data-key="${item.key}">
            <button class="lnav-link lnav-parent-btn" onclick="toggleLnavGroup(this)" aria-expanded="${ariaExpanded}">
              <i class="pi ${item.icon} lnav-icon" aria-hidden="true"></i>
              <span class="lnav-label">${item.label}</span>
              <i class="pi ${chevron} lnav-chevron" aria-hidden="true"></i>
            </button>
            <ul class="lnav-sub${subOpenCls}" aria-hidden="${ariaHidden}">
              ${children}
            </ul>
          </div>`;
    }).join('');

    var html = `
<aside class="lnav" id="leftNav" aria-label="Project navigation">
  <div class="lnav-scroll" id="lnavScroll">
    <nav class="lnav-menu" id="lnavMenu">
      ${items}
    </nav>
  </div>
  <button class="lnav-toggle" id="lnavToggle" onclick="toggleLeftNav()" aria-label="Toggle navigation" title="Collapse sidebar">
    <svg width="16" height="24" viewBox="0 0 16 24" fill="none" class="lnav-toggle-icon lnav-toggle-close">
      <circle cx="5"  cy="8"  r="1.5" fill="#9e9e9e"/>
      <circle cx="5"  cy="12" r="1.5" fill="#9e9e9e"/>
      <circle cx="5"  cy="16" r="1.5" fill="#9e9e9e"/>
      <circle cx="11" cy="8"  r="1.5" fill="#9e9e9e"/>
      <circle cx="11" cy="12" r="1.5" fill="#9e9e9e"/>
      <circle cx="11" cy="16" r="1.5" fill="#9e9e9e"/>
    </svg>
    <svg width="16" height="24" viewBox="0 0 16 24" fill="none" class="lnav-toggle-icon lnav-toggle-open" style="display:none">
      <path d="M6 8 L10 12 L6 16" stroke="#9e9e9e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>
</aside>`;

    var mount = document.getElementById('left-nav-mount');
    if (mount) {
      mount.outerHTML = html;
    }

    /* Restore collapse state (mirrors initLnav in script.js, runs after nav exists) */
    var nav = document.getElementById('leftNav');
    if (nav && localStorage.getItem('left-navigation-is-open') === 'false') {
      nav.dataset.collapsed = 'true';
      document.body.classList.add('lnav-collapsed');
    }
  };
})();
