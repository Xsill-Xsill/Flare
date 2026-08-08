(function () {
    var ICONS = { error: 'error', success: 'check_circle' };
    var STYLES = {
        error: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', icon: '#DC2626' },
        success: { bg: '#F0FDF9', border: 'rgba(13,159,110,0.25)', text: '#0D9F6E', icon: '#0D9F6E' }
    };

    window.flareToast = function (message, type) {
        var stack = document.getElementById('flare-toast-stack');
        if (!stack) return;
        type = (type === 'success') ? 'success' : 'error';
        var style = STYLES[type];

        var toast = document.createElement('div');
        toast.className = 'flex items-center gap-2 rounded-lg pointer-events-auto shadow-lg';
        toast.style.cssText =
            'background:' + style.bg + '; border:1px solid ' + style.border + '; color:' + style.text + ';' +
            'padding:10px 16px; font-size:13px; font-weight:600; opacity:0; transform:translateY(8px); transition:opacity .18s ease-out, transform .18s ease-out; max-width:min(90vw,420px);';
        toast.innerHTML =
            '<span class="material-symbols-outlined text-[18px]" style="color:' + style.icon + ';">' + ICONS[type] + '</span>' +
            '<span>' + message + '</span>';
        stack.appendChild(toast);

        requestAnimationFrame(function () {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(function () { toast.remove(); }, 200);
        }, 3200);
    };
})();
