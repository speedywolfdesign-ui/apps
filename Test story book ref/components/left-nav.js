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
  var COST_SVG = '<svg width="16" height="13" viewBox="0 0 16 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14.4004 0C14.8238 0.00250176 15.2289 0.17225 15.5283 0.47168C15.8278 0.771114 15.9975 1.17617 16 1.59961V10.7432C15.9975 11.1667 15.8278 11.5726 15.5283 11.8721C15.2289 12.1713 14.8237 12.3403 14.4004 12.3428H1.59961C1.17634 12.3403 0.771086 12.1713 0.47168 11.8721C0.172199 11.5726 0.00246534 11.1667 0 10.7432V1.59961C0.00251672 1.17617 0.172246 0.771114 0.47168 0.47168C0.771124 0.17225 1.17616 0.00250178 1.59961 0H14.4004ZM4.57129 1.37109C4.58068 1.49579 4.58067 1.6214 4.57129 1.74609C4.57471 2.11723 4.50329 2.4856 4.36035 2.82812C4.21734 3.17072 4.0056 3.48064 3.73926 3.73926C3.5937 3.88247 3.43431 4.01088 3.26367 4.12305L3.11816 4.20605C2.99045 4.2799 2.85543 4.34098 2.71582 4.38867L2.51465 4.45215C2.39524 4.49187 2.27249 4.5228 2.14844 4.54395H1.37109V7.82617H1.82812C1.92237 7.81676 2.01806 7.81676 2.1123 7.82617C2.27619 7.84649 2.43824 7.88017 2.59668 7.92676L2.7793 8C2.89173 8.04233 3.00164 8.0914 3.1084 8.14648L3.26367 8.24707C3.42666 8.34765 3.57732 8.46725 3.71191 8.60352C3.97821 8.86209 4.18902 9.17213 4.33203 9.51465C4.47504 9.85725 4.54737 10.2254 4.54395 10.5967C4.55334 10.7214 4.55334 10.8469 4.54395 10.9717L11.4834 10.9531C11.474 10.8284 11.474 10.7029 11.4834 10.5781C11.48 10.207 11.5523 9.83863 11.6953 9.49609C11.8383 9.15365 12.0492 8.84348 12.3154 8.58496C12.45 8.44874 12.6007 8.32908 12.7637 8.22852L12.9189 8.12793C13.0341 8.06564 13.1533 8.0111 13.2754 7.96387L13.458 7.89062C13.6164 7.84405 13.7786 7.81036 13.9424 7.79004C14.0366 7.78098 14.1323 7.78098 14.2266 7.79004H14.6836V4.53516H13.915C13.7884 4.51747 13.6635 4.48915 13.541 4.45215L13.3398 4.38867C13.2003 4.34101 13.0652 4.27986 12.9375 4.20605L12.791 4.12305C12.6183 4.01381 12.4586 3.88513 12.3154 3.73926C12.0491 3.48066 11.8383 3.17068 11.6953 2.82812C11.5523 2.48552 11.48 2.11733 11.4834 1.74609C11.474 1.6214 11.474 1.49579 11.4834 1.37109H4.57129ZM14.1074 9.22559H13.9883C13.8855 9.24761 13.7843 9.27764 13.6865 9.31641H13.5771C13.4466 9.37963 13.3286 9.46633 13.2295 9.57227C13.0939 9.70616 12.9859 9.86625 12.9121 10.042C12.8385 10.2176 12.8003 10.4062 12.7998 10.5967C12.8001 10.7236 12.8184 10.85 12.8545 10.9717H14.4004C14.4609 10.9716 14.5187 10.9471 14.5615 10.9043C14.6043 10.8615 14.6288 10.8037 14.6289 10.7432V9.22559H14.4365C14.3272 9.21191 14.2167 9.21191 14.1074 9.22559ZM1.56348 9.21582H1.37109V10.7432C1.37351 10.802 1.39896 10.8576 1.44141 10.8984C1.48392 10.9393 1.54068 10.9619 1.59961 10.9619H3.14551C3.18151 10.8405 3.19991 10.7145 3.2002 10.5879C3.19966 10.3973 3.16164 10.208 3.08789 10.0322C3.01416 9.85657 2.90606 9.69732 2.77051 9.56348C2.66905 9.46024 2.55151 9.37394 2.42285 9.30762H2.31348C2.21765 9.26349 2.11592 9.23234 2.01172 9.21582H1.89258C1.78332 9.20215 1.67273 9.20216 1.56348 9.21582ZM8 2.97168C8.84869 2.97168 9.66258 3.30906 10.2627 3.90918C10.8627 4.50928 11.2002 5.32328 11.2002 6.17188C11.2001 6.80454 11.0126 7.42315 10.6611 7.94922C10.3095 8.47546 9.80933 8.88573 9.22461 9.12793C8.63994 9.3701 7.99666 9.433 7.37598 9.30957C6.75533 9.18612 6.1848 8.88199 5.7373 8.43457C5.2898 7.98707 4.98482 7.41659 4.86133 6.7959C4.73787 6.17524 4.80182 5.53193 5.04395 4.94727C5.28615 4.36254 5.69642 3.86236 6.22266 3.51074C6.74882 3.15927 7.36724 2.97168 8 2.97168ZM8.7002 4.48242C8.36616 4.34406 7.99818 4.30745 7.64355 4.37793C7.28885 4.44849 6.96276 4.62318 6.70703 4.87891C6.4515 5.13452 6.27761 5.45998 6.20703 5.81445C6.13649 6.16911 6.17219 6.537 6.31055 6.87109C6.44894 7.20521 6.68368 7.49048 6.98438 7.69141C7.28508 7.89233 7.63835 8 8 8C8.48487 8 8.95007 7.80763 9.29297 7.46484C9.63579 7.12202 9.82801 6.65669 9.82812 6.17188C9.82812 5.81022 9.72143 5.45598 9.52051 5.15527C9.31968 4.85478 9.03406 4.62082 8.7002 4.48242ZM12.8545 1.38086C12.8184 1.50245 12.8 1.62903 12.7998 1.75586C12.8004 1.94631 12.8384 2.13493 12.9121 2.31055C12.9858 2.4862 13.094 2.64544 13.2295 2.7793C13.3285 2.88524 13.4466 2.97192 13.5771 3.03516H13.6865C13.7839 3.07518 13.8851 3.1062 13.9883 3.12695H14.1074C14.2167 3.14062 14.3273 3.14062 14.4365 3.12695H14.6289V1.59961C14.6264 1.54078 14.6011 1.48514 14.5586 1.44434C14.5161 1.40352 14.4593 1.38091 14.4004 1.38086H12.8545ZM1.59961 1.37109C1.53914 1.3712 1.48125 1.39572 1.43848 1.43848C1.39572 1.48124 1.37121 1.53915 1.37109 1.59961V3.11816H1.56348C1.67272 3.13182 1.78334 3.13183 1.89258 3.11816H2.02051C2.11885 3.10168 2.21426 3.07043 2.30371 3.02637H2.42285C2.55153 2.96004 2.66904 2.87376 2.77051 2.77051C2.90607 2.63668 3.01415 2.47739 3.08789 2.30176C3.16164 2.12601 3.19966 1.93669 3.2002 1.74609C3.19993 1.61924 3.18162 1.4927 3.14551 1.37109H1.59961Z" fill="currentColor"/></svg>';

  var ITEMS = [
    { key: 'project-home', icon: 'pi-home',      label: 'Project Home',      href: 'project-home.html' },
    { key: 'cost',         iconSvg: COST_SVG,    label: 'Cost',              children: [
      { key: 'data-entry', label: 'Data Entry', children: [
        { key: 'control-accounts',  label: 'Control Accounts',  href: '#' },
        { key: 'staffing-plans',    label: 'Staffing Plans',    href: '#' },
        { key: 'employee-plans',    label: 'Employee Plans',    href: '#' },
        { key: 'budget-details',    label: 'Budget Details',    href: '#' },
        { key: 'commitments',       label: 'Commitments',       href: '#' },
        { key: 'period-actuals',    label: 'Period Actuals',    href: '#' },
        { key: 'variance-analysis', label: 'Variance Analysis', href: '#' },
        { key: 'definitions', label: 'Definitions', children: [
          { key: 'default-cost-reporting', label: 'Default / Cost Reporting Periods',  href: '#' },
          { key: 'funding-sources',        label: 'Funding Sources',                   href: '#' },
          { key: 'project-staff',          label: 'Project Staff',                     href: '#' },
          { key: 'ledger-ca-mapping',      label: 'Ledger / Control Account Mapping',  href: '#' },
          { key: 'ledger-ce-mapping',      label: 'Ledger / Control Element Mapping',  href: '#' },
          { key: 'escalations',            label: 'Escalations',                       href: '#' },
          { key: 'multipliers',            label: 'Multipliers',                       href: '#' },
          { key: 'indirect-costs',         label: 'Indirect Costs',                    href: '#' },
        ]},
        { key: 'cost-settings',     label: 'Settings',          href: '#' },
      ]},
      { key: 'calculations', label: 'Calculations', children: [
        { key: 'calculate-totals',   label: 'Calculate Totals',        href: '#' },
        { key: 'spread-time-phased', label: 'Spread Time Phased Data', href: '#' },
        { key: 'close-period',       label: 'Close Period',            href: '#' },
        { key: 'other-calculations', label: 'Other Calculations',      href: '#' },
      ]},
      { key: 'cost-reports-grp', label: 'Reports', children: [
        { key: 'cost-reports',  label: 'Reports',       href: '#' },
        { key: 'lists',         label: 'Lists',         href: '#' },
        { key: 'cost-summary',  label: 'Summary',       href: '#' },
        { key: 'excel-reports', label: 'Excel Reports', href: '#' },
        { key: 'report-writer', label: 'Report Writer', href: '#' },
      ]},
      { key: 'import-utilities', label: 'Import / Export & Utilities', children: [
        { key: 'import-export',         label: 'Import / Export',         href: '#' },
        { key: 'special-import-export', label: 'Special Import / Export', href: '#' },
        { key: 'copy-dates',            label: 'Copy Dates to Accounts',  href: '#' },
        { key: 'validate-data',         label: 'Validate Data',           href: '#' },
        { key: 'other-utilities',       label: 'Other Utilities',         href: '#' },
      ]},
      { key: 'ai-forecasting', label: 'AI Forecasting', href: 'AI centric s-curve.html' },
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

  var ADMIN_ITEMS = [
    { key: 'data-warehouse',     icon: 'pi-database',    label: 'Data Warehouse',         href: '#' },
    { key: 'archive',            icon: 'pi-box',         label: 'Archive',                href: '#' },
    { key: 'calculations',       icon: 'pi-calculator',  label: 'Calculations',           href: '#' },
    { key: 'change-mgmt',        icon: 'pi-refresh',     label: 'Change management',      children: [
      { key: 'user-permissions', label: 'User Permissions',       href: '#' },
      { key: 'workflow-config',  label: 'Workflow Configuration', href: '#' },
    ]},
    { key: 'scurve-forecasting', icon: 'pi-chart-line',  label: 'S-Curve Forecasting',    href: 'scurve-forecast.html?context=admin' },
  ];

  window.renderLeftNav = function (config) {
    var context       = (config && config.context)       || 'project';
    var activeLink    = (config && config.activeLink)    || null;
    var expandedGroup = (config && config.expandedGroup) || null;
    var activeSub     = (config && config.activeSub)     || null;

    var sourceItems = context === 'admin' ? ADMIN_ITEMS : ITEMS;
    var asideLabel  = context === 'admin' ? 'Administration navigation' : 'Project navigation';

    function iconHtml(item) {
      if (item.iconSvg) return `<span class="lnav-icon lnav-icon-svg" aria-hidden="true">${item.iconSvg}</span>`;
      return `<i class="pi ${item.icon} lnav-icon" aria-hidden="true"></i>`;
    }

    var items = sourceItems.map(function (item) {
      if (!item.children) {
        var isActive = item.key === activeLink;
        return `
          <div class="lnav-item" data-key="${item.key}">
            <a class="lnav-link${isActive ? ' lnav-link-active' : ''}" href="${item.href}" onclick="setLnavActive(this)">
              ${iconHtml(item)}
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

      // Recursive: a child with its own children becomes an expandable sub-group
      // (supports any depth — e.g. Cost → Data Entry → Definitions → …)
      function renderSubLi(child) {
        if (child.children) {
          var inner = child.children.map(renderSubLi).join('');
          return `
            <li class="lnav-subgroup" data-key="${child.key}">
              <button class="lnav-sublink lnav-subgroup-btn" onclick="toggleLnavSubGroup(this)" aria-expanded="false">
                <span class="lnav-sublabel">${child.label}</span>
                <i class="pi pi-angle-down lnav-subchevron" aria-hidden="true"></i>
              </button>
              <ul class="lnav-subsub" aria-hidden="true">${inner}</ul>
            </li>`;
        }
        var isActiveSub = child.key === activeSub;
        return `<li><a class="lnav-sublink${isActiveSub ? ' lnav-sublink-active' : ''}" href="${child.href}" onclick="setLnavActive(this)">${child.label}</a></li>`;
      }
      var children = item.children.map(renderSubLi).join('');

      return `
          <div class="lnav-item lnav-has-children${expandedCls}" data-key="${item.key}">
            <button class="lnav-link lnav-parent-btn" onclick="toggleLnavGroup(this)" aria-expanded="${ariaExpanded}">
              ${iconHtml(item)}
              <span class="lnav-label">${item.label}</span>
              <i class="pi ${chevron} lnav-chevron" aria-hidden="true"></i>
            </button>
            <ul class="lnav-sub${subOpenCls}" aria-hidden="${ariaHidden}">
              ${children}
            </ul>
          </div>`;
    }).join('');

    var html = `
<aside class="lnav" id="leftNav" aria-label="${asideLabel}" data-context="${context}">
  <div class="lnav-scroll" id="lnavScroll">
    <nav class="lnav-menu" id="lnavMenu">
      ${items}
    </nav>
  </div>
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
