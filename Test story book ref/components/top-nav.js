/* ===== TOP NAVIGATION COMPONENT =====
 * Usage: renderTopNav({ activeItem: 'home' | 'projects' })
 * Call this once at the bottom of <body> after this script is loaded.
 * It replaces <div id="top-nav-mount"></div> with the full nav HTML.
 */
(function () {
  window.renderTopNav = function (config) {
    var active = (config && config.activeItem) || 'home';

    var homeClass = active === 'home'     ? ' tnav-link-active' : '';
    var projClass = active === 'projects' ? ' tnav-link-active' : '';

    var html = `
<nav class="top-nav" role="navigation" aria-label="Main navigation">
  <div class="tnav-logo">
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Contruent">
      <g clip-path="url(#clip0_tnav)">
        <rect x="21" y="12" width="14" height="32" stroke="#E5E5E5"/>
        <path d="M21.0706 40.0001H32.5C33.4388 40.0001 34.1998 39.2386 34.1998 38.2989V37.959H22.7705C21.8315 37.959 21.0706 38.7205 21.0706 39.6601V40.0001Z" fill="#F93822"/>
        <path d="M23.2412 28.0724C23.2412 32.1311 24.5412 33.9029 27.7677 33.9029C30.021 33.9029 31.0247 33.1548 31.549 31.6946C31.7772 31.0594 32.3799 30.6356 33.0547 30.6356H34.1337C33.731 33.6386 31.6219 35.9207 27.7685 35.9207C22.8826 35.9215 21 32.1087 21 28.0724C21 24.0361 22.8826 20.2241 27.7677 20.2241C31.6219 20.2241 33.731 22.5062 34.1328 25.5092H33.0539C32.3791 25.5092 31.7763 25.0855 31.5482 24.4503C31.0239 22.9908 30.021 22.2419 27.7669 22.2419C24.5403 22.2419 23.2412 24.0137 23.2412 28.0724Z" fill="#24125F"/>
      </g>
      <defs>
        <clipPath id="clip0_tnav"><rect x="21" y="12" width="14" height="32" fill="white"/></clipPath>
      </defs>
    </svg>
  </div>

  <ul class="tnav-menu" id="tnavMenu">
    <li class="tnav-item"><a class="tnav-link${homeClass}" href="home.html">Home</a></li>
    <li class="tnav-item tnav-has-dropdown" id="tnd-projects">
      <button class="tnav-link tnav-link-dropdown${projClass}" onclick="toggleNavDropdown('tnd-projects')" aria-expanded="false">
        Projects <i class="pi pi-chevron-down tnav-chevron"></i>
      </button>
      <ul class="tnav-dropdown tnav-dropdown-projects" role="menu">
        <div class="tnav-proj-header">Recently opened</div>
        <a class="tnav-proj-item" href="project-home.html" onclick="selectProject(this)"
           data-proj-name="Cisco Systems" data-proj-id="0128-0919-0001" data-proj-initials="CS" data-proj-color="#1565c0">
          <span class="tnav-proj-avatar" style="background:#1565c0">CS</span>
          <div class="tnav-proj-info">
            <span class="tnav-proj-id">0128-0919-0001</span>
            <span class="tnav-proj-name">Cisco Systems</span>
          </div>
        </a>
        <a class="tnav-proj-item" href="project-home.html" onclick="selectProject(this)"
           data-proj-name="Open AI" data-proj-id="0128-0919-1228" data-proj-initials="OA" data-proj-color="#00897b">
          <span class="tnav-proj-avatar" style="background:#00897b">OA</span>
          <div class="tnav-proj-info">
            <span class="tnav-proj-id">0128-0919-1228</span>
            <span class="tnav-proj-name">Open AI</span>
          </div>
        </a>
        <a class="tnav-proj-item" href="project-home.html" onclick="selectProject(this)"
           data-proj-name="Omnes Records" data-proj-id="0128-0919-1229" data-proj-initials="OR" data-proj-color="#8e44ad">
          <span class="tnav-proj-avatar" style="background:#8e44ad">OR</span>
          <div class="tnav-proj-info">
            <span class="tnav-proj-id">0128-0919-1229</span>
            <span class="tnav-proj-name">Omnes Records</span>
          </div>
        </a>
        <a class="tnav-proj-item" href="project-home.html" onclick="selectProject(this)"
           data-proj-name="McDonald's" data-proj-id="0128-0919-1230" data-proj-initials="MD" data-proj-color="#1abc9c">
          <span class="tnav-proj-avatar" style="background:#1abc9c">MD</span>
          <div class="tnav-proj-info">
            <span class="tnav-proj-id">0128-0919-1230</span>
            <span class="tnav-proj-name">McDonald's</span>
          </div>
        </a>
        <a class="tnav-proj-item" href="project-home.html" onclick="selectProject(this)"
           data-proj-name="Burger King" data-proj-id="0128-0919-1231" data-proj-initials="BK" data-proj-color="#00acc1">
          <span class="tnav-proj-avatar" style="background:#00acc1">BK</span>
          <div class="tnav-proj-info">
            <span class="tnav-proj-id">0128-0919-1231</span>
            <span class="tnav-proj-name">Burger King</span>
          </div>
        </a>
        <a class="tnav-proj-item" href="project-home.html" onclick="selectProject(this)"
           data-proj-name="Amazon Web Services" data-proj-id="0128-0919-1232" data-proj-initials="AW" data-proj-color="#283593">
          <span class="tnav-proj-avatar" style="background:#283593">AW</span>
          <div class="tnav-proj-info">
            <span class="tnav-proj-id">0128-0919-1232</span>
            <span class="tnav-proj-name">Amazon Web Services</span>
          </div>
        </a>
        <a class="tnav-proj-footer" href="projects.html">View all projects</a>
      </ul>
    </li>
    <li class="tnav-item"><a class="tnav-link" href="#">Drive</a></li>
    <li class="tnav-item">
      <a class="tnav-link tnav-link-external" href="#" target="_blank">
        Magic Grid <i class="pi pi-arrow-up-right tnav-external-icon"></i>
      </a>
    </li>
    <li class="tnav-item"><a class="tnav-link" href="#">Tasks</a></li>
    <li class="tnav-item"><a class="tnav-link" href="#">Contractors</a></li>
    <li class="tnav-item tnav-has-dropdown" id="tnd-reports">
      <button class="tnav-link tnav-link-dropdown" onclick="toggleNavDropdown('tnd-reports')" aria-expanded="false">
        Reports <i class="pi pi-chevron-down tnav-chevron"></i>
      </button>
      <ul class="tnav-dropdown" role="menu">
        <li class="tnav-dropdown-item" role="menuitem"><i class="pi pi-chart-bar"></i> Overview</li>
        <li class="tnav-dropdown-item" role="menuitem"><i class="pi pi-chart-line"></i> Analytics</li>
        <li class="tnav-dropdown-item" role="menuitem"><i class="pi pi-download"></i> Export</li>
      </ul>
    </li>
    <li class="tnav-item">
      <a class="tnav-link tnav-link-external" href="#" target="_blank">
        Dashboard <i class="pi pi-arrow-up-right tnav-external-icon"></i>
      </a>
    </li>
    <li class="tnav-item tnav-has-dropdown" id="tnd-admin">
      <button class="tnav-link tnav-link-dropdown" onclick="toggleNavDropdown('tnd-admin')" aria-expanded="false">
        Admin <i class="pi pi-chevron-down tnav-chevron"></i>
      </button>
      <ul class="tnav-dropdown" role="menu">
        <li class="tnav-dropdown-item" role="menuitem"><i class="pi pi-users"></i> Users</li>
        <li class="tnav-dropdown-item" role="menuitem"><i class="pi pi-cog"></i> Settings</li>
        <li class="tnav-dropdown-item" role="menuitem"><i class="pi pi-shield"></i> Permissions</li>
      </ul>
    </li>
  </ul>

  <div class="tnav-actions">
    <a class="tnav-ctrl-center" href="#">
      Control Center <i class="pi pi-arrow-up-right" style="font-size:11px;"></i>
    </a>
    <button class="tnav-create-btn"><i class="pi pi-plus"></i> Create</button>
    <div class="tnav-env" title="Environment: rio001">
      <i class="pi pi-globe tnav-env-icon"></i>
      <span class="tnav-env-id">rio001</span>
    </div>
    <button class="tnav-ai-btn" onclick="typeof toggleAiPanel==='function'&&toggleAiPanel()" title="AI Assistant" aria-label="Toggle AI Assistant">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1L9.5 5.5L14 7L9.5 8.5L8 13L6.5 8.5L2 7L6.5 5.5L8 1Z" fill="currentColor"/>
        <path d="M13 1L13.75 3.25L16 4L13.75 4.75L13 7L12.25 4.75L10 4L12.25 3.25L13 1Z" fill="currentColor" opacity="0.7"/>
      </svg>
      AI
    </button>
    <button class="tnav-icon-btn" aria-label="Notifications"><i class="pi pi-bell"></i></button>
    <button class="tnav-icon-btn" aria-label="Add-ons" id="tnavAddonsBtn" onclick="toggleAddons()">
      <i class="pi pi-th-large"></i>
    </button>
    <div class="tnav-addons-panel" id="tnavAddonsPanel">
      <div class="tnav-addons-header">Add-ons</div>
      <a class="tnav-addons-item" href="#" target="_blank">
        <span class="tnav-addons-icon" style="background:#3F51B5"><i class="pi pi-link" style="color:#fff;font-size:11px"></i></span>Connect
      </a>
      <a class="tnav-addons-item" href="#" target="_blank">
        <span class="tnav-addons-icon" style="background:#03A9F4"><i class="pi pi-shopping-cart" style="color:#fff;font-size:11px"></i></span>ProcureWare
      </a>
      <a class="tnav-addons-item" href="#" target="_blank">
        <span class="tnav-addons-icon" style="background:#673AB7"><i class="pi pi-calculator" style="color:#fff;font-size:11px"></i></span>Estimating
      </a>
    </div>
    <div class="tnav-profile" id="tnavProfile">
      <button class="tnav-avatar" onclick="toggleProfile()" aria-label="User profile" aria-expanded="false">JP</button>
      <div class="tnav-profile-panel" id="tnavProfilePanel">
        <div class="tnav-profile-header">
          <div class="tnav-avatar tnav-avatar-lg">JP</div>
          <div>
            <div class="tnav-profile-name">John P.</div>
            <div class="tnav-profile-email">john.p@contruent.com</div>
          </div>
        </div>
        <div class="tnav-profile-divider"></div>
        <a class="tnav-profile-item" href="#"><i class="pi pi-info-circle"></i> Upgrade plan</a>
        <a class="tnav-profile-item tnav-profile-item-danger" href="#"><i class="pi pi-sign-out"></i> Logout</a>
      </div>
    </div>
  </div>

  <button class="tnav-hamburger" onclick="toggleMobileMenu()" aria-label="Open menu" aria-expanded="false">
    <i class="pi pi-bars"></i>
  </button>
</nav>`;

    var mount = document.getElementById('top-nav-mount');
    if (mount) {
      mount.outerHTML = html;
    } else {
      document.body.insertAdjacentHTML('afterbegin', html);
    }
  };
})();
