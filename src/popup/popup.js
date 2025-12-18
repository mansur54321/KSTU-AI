document.addEventListener('DOMContentLoaded', async () => {
    // --- Elements ---
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');
    const masterSwitch = document.getElementById('master-switch');
    const openSettingsBtn = document.getElementById('open-settings');
    const backToMainBtn = document.getElementById('back-to-main');
    
    // Status
    const currentSiteEl = document.getElementById('current-site');
    const statusTextEl = document.getElementById('status-text');
    const solveCountEl = document.getElementById('solve-count');
    
    // Settings
    const keysInput = document.getElementById('apiKeysInput');
    const saveKeysBtn = document.getElementById('save-keys');
    const checkKeysBtn = document.getElementById('check-keys');
    const checkResults = document.getElementById('check-results');
    const statusMsg = document.getElementById('status-msg');
    const keyProgress = document.getElementById('keyProgress');
    const keyCountText = document.getElementById('keyCountText');
    const cfgAutoClick = document.getElementById('cfg-autoclick');
    const cfgMarker = document.getElementById('cfg-marker');

    // --- Data Loading ---
    const data = await chrome.storage.sync.get(['isEnabled', 'solvedCount', 'geminiApiKeys', 'cfgAutoClick', 'cfgMarker']);
    
    let isEnabled = data.isEnabled !== false; // Default ON
    let solvedCount = data.solvedCount || 0;
    let apiKeys = data.geminiApiKeys || [];
    let autoClick = data.cfgAutoClick !== false;
    let marker = data.cfgMarker !== false;

    // --- Init UI ---
    updateMasterUI(isEnabled);
    solveCountEl.innerText = solvedCount;
    keysInput.value = apiKeys.join('\n');
    updateKeyMeter(apiKeys.length);
    cfgAutoClick.checked = autoClick;
    cfgMarker.checked = marker;

    // Get current tab domain
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if(tabs[0]?.url && !tabs[0].url.startsWith('chrome')) {
            try { currentSiteEl.innerText = new URL(tabs[0].url).hostname; } catch(e){}
        }
    });

    // --- Handlers ---

    // 1. Master Switch
    masterSwitch.addEventListener('click', () => {
        isEnabled = !isEnabled;
        updateMasterUI(isEnabled);
        chrome.storage.sync.set({ isEnabled });
    });

    function updateMasterUI(active) {
        if (active) {
            masterSwitch.classList.add('active');
            masterSwitch.innerHTML = '<i class="fas fa-check"></i>';
            statusTextEl.innerText = "Protection is enabled";
            statusTextEl.style.color = "#888";
        } else {
            masterSwitch.classList.remove('active');
            masterSwitch.innerHTML = '<i class="fas fa-power-off"></i>';
            statusTextEl.innerText = "Protection is disabled";
            statusTextEl.style.color = "#ff7e67";
        }
    }

    // 2. Navigation
    openSettingsBtn.addEventListener('click', () => { mainView.style.display = 'none'; settingsView.style.display = 'block'; });
    backToMainBtn.addEventListener('click', () => { settingsView.style.display = 'none'; mainView.style.display = 'block'; checkResults.innerHTML = ''; });

    // 3. Settings Toggles
    cfgAutoClick.addEventListener('change', (e) => chrome.storage.sync.set({ cfgAutoClick: e.target.checked }));
    cfgMarker.addEventListener('change', (e) => chrome.storage.sync.set({ cfgMarker: e.target.checked }));

    // 4. Save Keys
    keysInput.addEventListener('input', () => {
        const count = keysInput.value.split('\n').filter(k => k.trim().length > 10).length;
        updateKeyMeter(count);
    });

    saveKeysBtn.addEventListener('click', () => {
        const keys = keysInput.value.split('\n').map(k=>k.trim()).filter(k=>k.length > 10);
        chrome.storage.sync.set({ geminiApiKeys: keys }, () => {
            statusMsg.innerText = `Saved ${keys.length} keys`;
            statusMsg.style.color = '#67b279';
            setTimeout(() => statusMsg.innerText = '', 2000);
            updateKeyMeter(keys.length);
        });
    });

    function updateKeyMeter(count) {
        keyCountText.innerText = `${count} keys loaded`;
        keyProgress.style.width = Math.min((count / 5) * 100, 100) + '%';
        keyProgress.style.background = count > 0 ? '#67b279' : '#3a3d42';
    }

    // 5. CHECK KEYS FUNCTIONALITY
    checkKeysBtn.addEventListener('click', async () => {
        const keys = keysInput.value.split('\n').map(k=>k.trim()).filter(k=>k.length > 10);
        if (keys.length === 0) return;

        checkResults.innerHTML = '<div style="text-align:center; color:#888;">Checking keys...</div>';
        checkKeysBtn.disabled = true;
        checkKeysBtn.style.opacity = '0.5';

        let html = '';
        let validCount = 0;

        for (const key of keys) {
            const mask = key.substring(0, 6) + '...' + key.substring(key.length - 4);
            try {
                // Simple request to test key
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] })
                });

                if (res.ok) {
                    validCount++;
                    html += `<div class="check-item"><span>${mask}</span> <span class="check-ok">OK</span></div>`;
                } else {
                    const err = await res.json();
                    let reason = "Error";
                    if (res.status === 400) reason = "Invalid";
                    if (res.status === 429) reason = "Quota";
                    html += `<div class="check-item"><span>${mask}</span> <span class="check-err">${reason}</span></div>`;
                }
            } catch (e) {
                html += `<div class="check-item"><span>${mask}</span> <span class="check-err">Net Err</span></div>`;
            }
        }

        checkResults.innerHTML = html;
        checkKeysBtn.disabled = false;
        checkKeysBtn.style.opacity = '1';
        statusMsg.innerText = `Valid: ${validCount} / ${keys.length}`;
        statusMsg.style.color = validCount > 0 ? '#67b279' : '#ff7e67';
    });
});
