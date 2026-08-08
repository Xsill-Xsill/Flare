(function () {
        var trigger = document.getElementById('account-menu-trigger');
        var overlay = document.getElementById('account-modal-overlay');
        var backdrop = document.getElementById('account-modal-backdrop');
        var panel = document.getElementById('account-modal-panel');
        var closeBtn = document.getElementById('account-modal-close');
        var contentEl = document.getElementById('account-modal-content');
        var tabBtns = document.querySelectorAll('.account-modal-tab');
        var planLabelEl = document.getElementById('account-plan-label');

        var accountState = {
            activeTab: 'account',
            name: 'Ilyas',
            email: 'ilyas300606@gmail.com',
            avatarFile: '',
            plan: 'basic'
        };

        function updatePlanLabel() {
            if (planLabelEl) planLabelEl.textContent = accountState.plan === 'plus' ? 'Plus plan' : 'Free plan';
        }

        function openAccountModal(tab) {
            accountState.activeTab = tab || accountState.activeTab;
            overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            renderTabs();
            renderTabContent();
            requestAnimationFrame(function () {
                backdrop.style.opacity = '1';
                panel.style.opacity = '1';
                panel.style.transform = 'scale(1)';
            });
        }

        function closeAccountModal() {
            backdrop.style.opacity = '0';
            panel.style.opacity = '0';
            panel.style.transform = 'scale(0.96)';
            document.body.style.overflow = '';
            setTimeout(function () { overlay.classList.add('hidden'); }, 200);
        }

        trigger.addEventListener('click', function () { openAccountModal('account'); });
        closeBtn.addEventListener('click', closeAccountModal);
        backdrop.addEventListener('click', closeAccountModal);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeAccountModal();
        });

        function renderTabs() {
            tabBtns.forEach(function (btn) {
                var isActive = btn.getAttribute('data-tab') === accountState.activeTab;
                btn.style.background = isActive ? '#D1FAE5' : 'transparent';
                btn.style.color = isActive ? '#0D9F6E' : '#3d4a42';
                btn.onmouseover = function () { if (!isActive) btn.style.background = '#EEF2F0'; };
                btn.onmouseout = function () { if (!isActive) btn.style.background = 'transparent'; };
            });
        }

        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                accountState.activeTab = btn.getAttribute('data-tab');
                renderTabs();
                renderTabContent();
            });
        });

        function renderAccountTab() {
            contentEl.innerHTML =
                '<h3 class="font-display-sm mb-lg" style="font-size:20px; font-weight:800; color:#1A2620;">Account</h3>' +
                '<div class="flex items-center gap-md mb-xl">' +
                    '<div class="w-16 h-16 rounded-full flex items-center justify-center text-white font-ui-semibold shrink-0" style="background:#0D9F6E; font-size:22px;">' + accountState.name.charAt(0).toUpperCase() + '</div>' +
                    '<div>' +
                        '<input class="hidden" id="account-avatar-input" type="file" accept="image/*">' +
                        '<button class="text-sm font-ui-semibold px-3 py-1.5 rounded-lg transition-colors" id="account-avatar-btn" style="background:#FFFFFF; border:1.5px solid #D8E2DC; color:#1A2620;" type="button">Upload photo</button>' +
                        '<p class="text-xs mt-1" id="account-avatar-status" style="color:#5C6F65;">' + (accountState.avatarFile || 'JPG or PNG, up to 5MB') + '</p>' +
                    '</div>' +
                '</div>' +
                '<div class="mb-lg">' +
                    '<label class="block text-xs font-ui-semibold mb-1" style="color:#5C6F65;">Name</label>' +
                    '<div class="flex items-center gap-2">' +
                        '<input class="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all" id="account-name-input" style="background:#EEF2F0; border:1px solid #D8E2DC; color:#1A2620;" type="text" value="' + accountState.name + '">' +
                        '<button class="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors active:scale-95 shrink-0" id="account-name-save" onmouseover="this.style.background=\'#0b8a5f\'" onmouseout="this.style.background=\'#0D9F6E\'" style="background:#0D9F6E;" type="button">Save</button>' +
                    '</div>' +
                '</div>' +
                '<div class="mb-xl">' +
                    '<label class="block text-xs font-ui-semibold mb-1" style="color:#5C6F65;">Email</label>' +
                    '<p class="text-sm" style="color:#1A2620;">' + accountState.email + '</p>' +
                '</div>' +
                '<div class="border-t pt-lg" style="border-color:#D8E2DC;">' +
                    '<button class="flex items-center gap-1 text-sm font-ui-semibold px-3 py-2 rounded-lg transition-colors" id="account-signout-btn" onmouseover="this.style.background=\'#EEF2F0\'" onmouseout="this.style.background=\'transparent\'" style="color:#ba1a1a;" type="button">' +
                        '<span class="material-symbols-outlined text-[18px]">logout</span> Sign out' +
                    '</button>' +
                '</div>';

            document.getElementById('account-name-save').addEventListener('click', function () {
                var input = document.getElementById('account-name-input');
                accountState.name = input.value.trim() || 'Ilyas';
                var btn = document.getElementById('account-name-save');
                btn.textContent = 'Saved';
                setTimeout(function () { btn.textContent = 'Save'; }, 1200);
            });

            var avatarInput = document.getElementById('account-avatar-input');
            document.getElementById('account-avatar-btn').addEventListener('click', function () { avatarInput.click(); });
            avatarInput.addEventListener('change', function () {
                if (avatarInput.files.length > 0) {
                    accountState.avatarFile = avatarInput.files[0].name + ' selected (demo, not uploaded)';
                    document.getElementById('account-avatar-status').textContent = accountState.avatarFile;
                }
            });

            document.getElementById('account-signout-btn').addEventListener('click', function () {
                alert('Signed out (demo)');
            });
        }

        function planCard(opts) {
            var isCurrent = accountState.plan === opts.key;
            var featuresHtml = opts.features.map(function (f) {
                return '<li class="flex items-start gap-2 text-sm"><span class="material-symbols-outlined text-[16px] mt-[1px]" style="color:#0D9F6E;">check</span><span style="color:#1A2620;">' + f + '</span></li>';
            }).join('');

            var actionHtml = isCurrent
                ? '<span class="inline-block text-xs font-ui-semibold px-3 py-1.5 rounded-lg" style="background:#EEF2F0; color:#5C6F65;">Current plan</span>'
                : '<button class="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors active:scale-95 w-full account-plan-switch" data-plan="' + opts.key + '" onmouseover="this.style.background=\'#0b8a5f\'" onmouseout="this.style.background=\'#0D9F6E\'" style="background:#0D9F6E;" type="button">' + opts.actionLabel + '</button>';

            return (
                '<div class="rounded-xl p-md flex flex-col" style="background:#FFFFFF; border:1.5px solid ' + (opts.highlight ? '#0D9F6E' : '#D8E2DC') + '; flex:1;">' +
                    (opts.highlight ? '<span class="inline-block text-[10px] font-ui-semibold uppercase tracking-wider px-2 py-[2px] rounded-full mb-2 self-start" style="background:#D1FAE5; color:#0D9F6E;">Recommended</span>' : '') +
                    '<p class="text-sm font-ui-semibold mb-1" style="color:#1A2620;">' + opts.title + '</p>' +
                    '<p class="mb-md" style="color:#1A2620;"><span style="font-size:22px; font-weight:800;">' + opts.price + '</span><span class="text-xs" style="color:#5C6F65;">' + opts.priceSuffix + '</span></p>' +
                    '<ul class="flex flex-col gap-2 mb-lg">' + featuresHtml + '</ul>' +
                    '<div class="mt-auto">' + actionHtml + '</div>' +
                '</div>'
            );
        }

        function renderPlanTab() {
            contentEl.innerHTML =
                '<h3 class="font-display-sm mb-lg" style="font-size:20px; font-weight:800; color:#1A2620;">Plan</h3>' +
                '<div class="flex gap-md" style="align-items:stretch;">' +
                    planCard({
                        key: 'basic',
                        title: 'Basic',
                        price: '$0',
                        priceSuffix: '/mo',
                        highlight: false,
                        actionLabel: 'Downgrade',
                        features: ['Up to 200 notes', '1 workspace', 'Weekly insights', 'Chat scoped to one insight at a time', 'Community support']
                    }) +
                    planCard({
                        key: 'plus',
                        title: 'Plus',
                        price: '$10',
                        priceSuffix: '/mo',
                        highlight: true,
                        actionLabel: 'Upgrade to Plus',
                        features: ['Unlimited notes', 'Unlimited workspaces', 'Daily insights, custom schedule', 'Ask across your entire vault', 'Priority support']
                    }) +
                '</div>';

            document.querySelectorAll('.account-plan-switch').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    accountState.plan = btn.getAttribute('data-plan');
                    updatePlanLabel();
                    renderPlanTab();
                });
            });
        }

        function renderBillingTab() {
            var isPlus = accountState.plan === 'plus';
            contentEl.innerHTML =
                '<h3 class="font-display-sm mb-lg" style="font-size:20px; font-weight:800; color:#1A2620;">Billing</h3>' +
                '<div class="mb-xl">' +
                    '<p class="font-label-caps text-label-caps mb-sm" style="color:#5C6F65;">PAYMENT METHOD</p>' +
                    (isPlus
                        ? '<div class="rounded-xl p-md flex items-center justify-between" style="background:#FFFFFF; border:1px solid #D8E2DC;">' +
                                '<div class="flex items-center gap-sm">' +
                                    '<span class="material-symbols-outlined text-[20px]" style="color:#5C6F65;">credit_card</span>' +
                                    '<span class="text-sm" style="color:#1A2620;">Visa •••• 4242</span>' +
                                '</div>' +
                                '<span class="text-xs" style="color:#5C6F65;">Next charge Sep 4, 2026</span>' +
                          '</div>'
                        : '<div class="rounded-xl p-md" style="background:#FFFFFF; border:1px solid #D8E2DC;"><p class="text-sm" style="color:#5C6F65;">No payment method on file — you\'re on the Free plan.</p></div>'
                    ) +
                '</div>' +
                '<div>' +
                    '<p class="font-label-caps text-label-caps mb-sm" style="color:#5C6F65;">BILLING HISTORY</p>' +
                    (isPlus
                        ? '<div class="rounded-xl" style="background:#FFFFFF; border:1px solid #D8E2DC;">' +
                                '<div class="flex items-center justify-between px-md py-sm">' +
                                    '<span class="text-sm" style="color:#1A2620;">Aug 4, 2026 — Plus plan</span>' +
                                    '<span class="text-sm font-ui-semibold" style="color:#1A2620;">$10.00</span>' +
                                '</div>' +
                          '</div>'
                        : '<div class="rounded-xl p-md" style="background:#FFFFFF; border:1px solid #D8E2DC;"><p class="text-sm" style="color:#5C6F65;">No invoices yet.</p></div>'
                    ) +
                '</div>';
        }

        function renderTabContent() {
            if (accountState.activeTab === 'account') renderAccountTab();
            else if (accountState.activeTab === 'plan') renderPlanTab();
            else renderBillingTab();
        }

        updatePlanLabel();
    })();
