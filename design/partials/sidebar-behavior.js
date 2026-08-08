(function () {
    var sidebar = document.getElementById('sidebar');
    var mainEl = document.getElementById('main-content');
    var toggleBtn = document.getElementById('sidebar-toggle');
    var toggleIcon = document.getElementById('sidebar-toggle-icon');
    var resizeHandle = document.getElementById('sidebar-resize-handle');

    var COLLAPSED_KEY = 'flare-sidebar-collapsed';
    var WIDTH_KEY = 'flare-sidebar-width';
    var DEFAULT_WIDTH = 200;
    var MIN_WIDTH = 64;
    var MAX_WIDTH = 240;
    var ICON_ONLY_THRESHOLD = 100;

    var savedWidth = parseInt(localStorage.getItem(WIDTH_KEY), 10);
    var currentWidth = (savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) ? savedWidth : DEFAULT_WIDTH;
    var collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';

    function isDesktop() {
        return window.matchMedia('(min-width: 768px)').matches;
    }

    function applyIconOnly(iconOnly) {
        var labels = sidebar.querySelectorAll('.nav-label, .sidebar-brand-label, .sidebar-profile-label');
        labels.forEach(function (el) { el.style.display = iconOnly ? 'none' : ''; });

        // Every row (brand, nav list, nav links, account row) has a different
        // horizontal padding by default, so centering each independently
        // leaves their icons at different x positions. Zeroing all of them
        // out and centering within the full-width rail makes every icon —
        // logo included — line up on the same vertical axis.
        var rows = sidebar.querySelectorAll('.nav-link, #account-menu-trigger, .sidebar-brand-row, .sidebar-nav-list, .sidebar-footer-wrap');
        rows.forEach(function (el) {
            el.style.justifyContent = iconOnly ? 'center' : '';
            el.style.paddingLeft = iconOnly ? '0px' : '';
            el.style.paddingRight = iconOnly ? '0px' : '';
        });

        // Push the brand row down a bit so it doesn't crowd the top edge
        // of the rail once it's icon-only.
        var brandRow = sidebar.querySelector('.sidebar-brand-row');
        if (brandRow) {
            brandRow.style.marginTop = iconOnly ? '12px' : '';
        }

        // The brand logo is sized for a wide sidebar (64px) — at the
        // minimum rail width (64px) it would overflow its own row edge to
        // edge. Shrink it to 1.5x the 20px nav icons (30px) so it fits
        // with breathing room while still reading as a "brand mark"
        // rather than just another nav icon, instead of getting clipped
        // by the rail's overflow:hidden.
        var logoImg = sidebar.querySelector('.sidebar-logo-img');
        if (logoImg) {
            logoImg.style.width = iconOnly ? '30px' : '';
            logoImg.style.height = iconOnly ? '30px' : '';
        }
    }

    function render() {
        var width = collapsed ? 0 : currentWidth;
        sidebar.style.width = width + 'px';
        sidebar.style.opacity = collapsed ? '0' : '1';
        sidebar.style.borderRightWidth = collapsed ? '0px' : '1.5px';
        mainEl.style.marginLeft = (isDesktop() && !collapsed) ? currentWidth + 'px' : '0px';
        toggleIcon.textContent = collapsed ? 'left_panel_open' : 'left_panel_close';
        applyIconOnly(!collapsed && currentWidth <= ICON_ONLY_THRESHOLD);
    }

    function setCollapsed(value) {
        collapsed = value;
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
        render();
    }

    function setWidth(px) {
        currentWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, px));
        localStorage.setItem(WIDTH_KEY, String(currentWidth));
        render();
    }

    toggleBtn.addEventListener('click', function () { setCollapsed(!collapsed); });
    window.addEventListener('resize', render);

    if (resizeHandle) {
        var dragging = false;
        var startX = 0;
        var startWidth = 0;

        resizeHandle.addEventListener('mouseover', function () {
            resizeHandle.style.background = 'rgba(13,159,110,0.3)';
        });
        resizeHandle.addEventListener('mouseout', function () {
            if (!dragging) resizeHandle.style.background = 'transparent';
        });

        resizeHandle.addEventListener('mousedown', function (e) {
            if (collapsed) return;
            dragging = true;
            startX = e.clientX;
            startWidth = currentWidth;
            sidebar.style.transition = 'none';
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            setWidth(startWidth + (e.clientX - startX));
        });

        document.addEventListener('mouseup', function () {
            if (!dragging) return;
            dragging = false;
            sidebar.style.transition = '';
            resizeHandle.style.background = 'transparent';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    render();
})();
