(function () {
    var current = document.body.getAttribute('data-page');

    // Desktop sidebar
    var item = document.querySelector('#sidebar li[data-nav="' + current + '"]');
    if (item) {
        var indicator = item.querySelector('.nav-active-indicator');
        var link = item.querySelector('.nav-link');
        if (indicator) indicator.style.display = '';
        if (link) {
            link.classList.remove('text-on-surface-variant', 'group');
            link.classList.add('text-primary', 'font-bold');
        }
    }

    // Mobile bottom tab bar
    var mobileLink = document.querySelector('.mobile-nav-link[data-nav="' + current + '"]');
    if (mobileLink) {
        var icon = mobileLink.querySelector('.mobile-nav-icon');
        var label = mobileLink.querySelector('.mobile-nav-label');
        if (icon) icon.style.opacity = '1';
        if (label) { label.style.color = '#0D9F6E'; label.style.fontWeight = '700'; }
        var dot = document.createElement('span');
        dot.className = 'w-1 h-1 rounded-full';
        dot.style.background = '#0D9F6E';
        mobileLink.insertBefore(dot, mobileLink.firstChild);
    }

    var accountBtn = document.getElementById('mobile-nav-account');
    var desktopTrigger = document.getElementById('account-menu-trigger');
    if (accountBtn && desktopTrigger) {
        accountBtn.addEventListener('click', function () { desktopTrigger.click(); });
    }
})();
