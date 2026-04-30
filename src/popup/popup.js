document.addEventListener('DOMContentLoaded', async () => {
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');
    const masterSwitch = document.getElementById('master-switch');
    const openSettingsBtn = document.getElementById('open-settings');
    const backToMainBtn = document.getElementById('back-to-main');
    const currentSiteEl = document.getElementById('current-site');
    const statusTextEl = document.getElementById('status-text');
    const solveCountEl = document.getElementById('solve-count');
    const versionText = document.getElementById('version-text');
    const rateLimitText = document.getElementById('rate-limit-text');
    const keysInput = document.getElementById('apiKeysInput');
    const saveKeysBtn = document.getElementById('save-keys');
    const checkKeysBtn = document.getElementById('check-keys');
    const checkResults = document.getElementById('check-results');
    const statusMsg = document.getElementById('status-msg');
    const keyProgress = document.getElementById('keyProgress');
    const keyCountText = document.getElementById('keyCountText');
    const cfgAutoClick = document.getElementById('cfg-autoclick');
    const cfgMarker = document.getElementById('cfg-marker');
    const cfgLanguage = document.getElementById('cfg-language');
    const cfgProModels = document.getElementById('cfg-pro-models');
    const cfgFastMode = document.getElementById('cfg-fast-mode');
    const cfgFastModeRow = document.getElementById('cfg-fast-mode-row');
    const exportBtn = document.getElementById('export-settings');
    const importBtn = document.getElementById('import-settings');
    const importFile = document.getElementById('import-file');
    const updateBanner = document.getElementById('update-banner');
    const updateText = document.getElementById('update-text');
    const updateLink = document.getElementById('update-link');
    const checkUpdateBtn = document.getElementById('check-update');
    const updateStatusText = document.getElementById('update-status-text');
    const updateStatus = document.getElementById('update-status');

    function parseApiKeys(text) {
        return text.split('\n').map(k => k.trim()).filter(k => /^AIzaSy[A-Za-z0-9_-]{30,}$/.test(k));
    }

    const data = await chrome.storage.sync.get([
        'isEnabled', 'solvedCount', 'geminiApiKeys',
        'cfgAutoClick', 'cfgMarker', 'language', 'rateLimitHits', 'cfgProModels', 'cfgFastMode'
    ]);

    let isEnabled = data.isEnabled !== false;
    let solvedCount = data.solvedCount || 0;
    let apiKeys = data.geminiApiKeys || [];
    let autoClick = data.cfgAutoClick !== false;
    let marker = data.cfgMarker !== false;
    let language = data.language || 'ru';
    let rateLimitHits = data.rateLimitHits || 0;
    let proModels = data.cfgProModels || false;
    let fastMode = data.cfgFastMode || false;

    updateMasterUI(isEnabled);
    solveCountEl.innerText = solvedCount;
    keysInput.value = apiKeys.join('\n');
    updateKeyMeter(apiKeys.length);
    cfgAutoClick.checked = autoClick;
    cfgMarker.checked = marker;
    cfgLanguage.value = language;
    cfgProModels.checked = proModels;
    cfgFastMode.checked = fastMode && proModels;
    updateFastModeVisibility(proModels);
    versionText.innerText = 'v' + chrome.runtime.getManifest().version;
    rateLimitText.innerText = `Лимитов: ${rateLimitHits}`;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url && !tabs[0].url.startsWith('chrome')) {
            try { currentSiteEl.innerText = new URL(tabs[0].url).hostname; } catch (e) { }
        }
    });

    checkUpdateStatus();

    masterSwitch.addEventListener('click', () => {
        isEnabled = !isEnabled;
        updateMasterUI(isEnabled);
        chrome.storage.sync.set({ isEnabled });
    });

    function updateMasterUI(active) {
        if (active) {
            masterSwitch.classList.add('active');
            masterSwitch.innerHTML = '<i class="fas fa-check"></i>';
            statusTextEl.innerText = "Защита включена";
            statusTextEl.style.color = "#888";
        } else {
            masterSwitch.classList.remove('active');
            masterSwitch.innerHTML = '<i class="fas fa-power-off"></i>';
            statusTextEl.innerText = "Защита отключена";
            statusTextEl.style.color = "#ff7e67";
        }
    }

    function updateFastModeVisibility(proEnabled) {
        cfgFastModeRow.style.display = proEnabled ? 'flex' : 'none';
        cfgFastMode.disabled = !proEnabled;
        if (!proEnabled) cfgFastMode.checked = false;
    }

    openSettingsBtn.addEventListener('click', () => {
        mainView.style.display = 'none';
        settingsView.style.display = 'block';
    });
    backToMainBtn.addEventListener('click', () => {
        settingsView.style.display = 'none';
        mainView.style.display = 'block';
        checkResults.innerHTML = '';
    });

    cfgAutoClick.addEventListener('change', (e) => chrome.storage.sync.set({ cfgAutoClick: e.target.checked }));
    cfgMarker.addEventListener('change', (e) => chrome.storage.sync.set({ cfgMarker: e.target.checked }));
    cfgLanguage.addEventListener('change', (e) => chrome.storage.sync.set({ language: e.target.value }));
    cfgProModels.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        updateFastModeVisibility(enabled);
        chrome.storage.sync.set({ cfgProModels: enabled, cfgFastMode: enabled ? cfgFastMode.checked : false });
    });
    cfgFastMode.addEventListener('change', (e) => chrome.storage.sync.set({ cfgFastMode: e.target.checked && cfgProModels.checked }));

    keysInput.addEventListener('input', () => {
        const count = parseApiKeys(keysInput.value).length;
        updateKeyMeter(count);
    });

    saveKeysBtn.addEventListener('click', () => {
        const keys = parseApiKeys(keysInput.value);
        chrome.storage.sync.set({ geminiApiKeys: keys }, () => {
            statusMsg.innerText = `Сохранено ${keys.length} ключей`;
            statusMsg.style.color = '#67b279';
            setTimeout(() => statusMsg.innerText = '', 2000);
            updateKeyMeter(keys.length);
        });
    });

    function updateKeyMeter(count) {
        keyCountText.innerText = `${count} ключей`;
        keyProgress.style.width = Math.min((count / 5) * 100, 100) + '%';
        keyProgress.style.background = count > 0 ? '#67b279' : '#3a3d42';
    }

    checkKeysBtn.addEventListener('click', async () => {
        const keys = parseApiKeys(keysInput.value);
        if (keys.length === 0) return;

        checkResults.innerHTML = '<div style="text-align:center; color:#888;">Проверка...</div>';
        checkKeysBtn.disabled = true;
        checkKeysBtn.style.opacity = '0.5';

        let html = '';
        let validCount = 0;

        for (const key of keys) {
            const mask = key.substring(0, 4) + '***' + key.substring(key.length - 3);
            try {
                const valid = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ action: 'validate_key', key }, (resp) => {
                        resolve(resp === true);
                    });
                });
                if (valid) {
                    validCount++;
                    html += `<div class="check-item"><span>${mask}</span> <span class="check-ok">OK</span></div>`;
                } else {
                    html += `<div class="check-item"><span>${mask}</span> <span class="check-err">Ошибка</span></div>`;
                }
            } catch (e) {
                html += `<div class="check-item"><span>${mask}</span> <span class="check-err">Сеть</span></div>`;
            }
        }

        checkResults.innerHTML = html;
        checkKeysBtn.disabled = false;
        checkKeysBtn.style.opacity = '1';
        statusMsg.innerText = `Рабочих: ${validCount} / ${keys.length}`;
        statusMsg.style.color = validCount > 0 ? '#67b279' : '#ff7e67';
    });

    exportBtn.addEventListener('click', async () => {
        const exportData = await chrome.storage.sync.get(null);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `adguard-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const importData = JSON.parse(text);
            if (typeof importData !== 'object') throw new Error('Invalid format');
            await chrome.storage.sync.set(importData);
            if (importData.geminiApiKeys) { keysInput.value = importData.geminiApiKeys.join('\n'); updateKeyMeter(importData.geminiApiKeys.length); }
            if (importData.cfgAutoClick !== undefined) cfgAutoClick.checked = importData.cfgAutoClick;
            if (importData.cfgMarker !== undefined) cfgMarker.checked = importData.cfgMarker;
            if (importData.language) cfgLanguage.value = importData.language;
            if (importData.cfgProModels !== undefined) cfgProModels.checked = importData.cfgProModels;
            if (importData.cfgFastMode !== undefined) cfgFastMode.checked = importData.cfgFastMode && cfgProModels.checked;
            updateFastModeVisibility(cfgProModels.checked);
            statusMsg.innerText = 'Импортировано!';
            statusMsg.style.color = '#67b279';
        } catch (err) {
            statusMsg.innerText = 'Ошибка импорта';
            statusMsg.style.color = '#ff7e67';
        }
        setTimeout(() => statusMsg.innerText = '', 2000);
        importFile.value = '';
    });

    async function checkUpdateStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'get_update_info' });
            displayUpdateInfo(response);
        } catch (e) { }
    }

    function displayUpdateInfo(info) {
        if (!info) return;
        if (info.hasUpdate) {
            updateBanner.classList.remove('hidden');
            updateText.innerText = `v${info.latestVersion} доступна`;
            updateLink.href = info.releaseUrl || 'https://github.com/mansur54321/KSTU-AI/releases';
            updateStatus.innerHTML = '<i class="fas fa-exclamation-circle" style="color: #f5a623;"></i>';
            updateStatusText.innerText = `Новая версия: ${info.latestVersion}`;
            updateStatusText.style.color = '#f5a623';
        } else {
            updateBanner.classList.add('hidden');
            updateStatus.innerHTML = '<i class="fas fa-check-circle" style="color: #67b279;"></i>';
            updateStatusText.innerText = 'Версия актуальна';
            updateStatusText.style.color = '#67b279';
        }
    }

    checkUpdateBtn.addEventListener('click', async () => {
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const response = await chrome.runtime.sendMessage({ action: 'check_updates' });
            displayUpdateInfo(response);
        } catch (e) {
            updateStatusText.innerText = 'Ошибка проверки';
            updateStatusText.style.color = '#ff7e67';
        }
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Проверить';
    });

    document.getElementById('refresh-stats')?.addEventListener('click', async () => {
        const data = await chrome.storage.sync.get(['solvedCount', 'rateLimitHits']);
        solveCountEl.innerText = data.solvedCount || 0;
        rateLimitText.innerText = `Лимитов: ${data.rateLimitHits || 0}`;
    });
});
