document.addEventListener('DOMContentLoaded', async () => {
    // Элементы интерфейса
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');
    const masterSwitch = document.getElementById('master-switch');
    const openSettingsBtn = document.getElementById('open-settings');
    const backToMainBtn = document.getElementById('back-to-main');
    const solveCountEl = document.getElementById('solve-count');
    const keysInput = document.getElementById('apiKeysInput');
    const saveKeysBtn = document.getElementById('save-keys');
    const checkKeysBtn = document.getElementById('check-keys');
    const statusMsg = document.getElementById('status-msg');
    const progressFill = document.getElementById('keyProgress');
    const keyCountText = document.getElementById('keyCountText');
    const checkResults = document.createElement('div'); // Контейнер для результатов проверки
    
    // Добавляем контейнер результатов, если его нет в HTML (на всякий случай)
    checkResults.id = 'check-results';
    checkResults.style.cssText = "margin-top: 10px; max-height: 120px; overflow-y: auto; font-size: 10px; border-top: 1px solid #3a3d42; padding-top: 5px;";
    document.querySelector('.settings-content').appendChild(checkResults);

    // --- 1. ЗАГРУЗКА ДАННЫХ ---
    const data = await chrome.storage.sync.get(['isEnabled', 'solvedCount', 'geminiApiKeys']);
    let isEnabled = data.isEnabled !== false;
    let solvedCount = data.solvedCount || 0;
    let apiKeys = data.geminiApiKeys || [];

    // Инициализация UI
    updateToggle(isEnabled);
    solveCountEl.innerText = solvedCount;
    if (apiKeys.length > 0) {
        keysInput.value = apiKeys.join('\n');
        updateKeyMeter(apiKeys.length);
    }

    // Получаем текущий сайт
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if(tabs[0]?.url && !tabs[0].url.startsWith('chrome')) {
            try {
                const url = new URL(tabs[0].url);
                document.getElementById('current-site').innerText = url.hostname;
            } catch(e){}
        }
    });

    // --- 2. ФУНКЦИИ ---

    function updateToggle(active) {
        if(active) {
            masterSwitch.classList.remove('disabled');
            masterSwitch.innerHTML = '<i class="fas fa-check"></i>';
        } else {
            masterSwitch.classList.add('disabled');
            masterSwitch.innerHTML = '<i class="fas fa-power-off"></i>';
        }
    }

    function updateKeyMeter(count) {
        const pct = Math.min((count / 10) * 100, 100);
        progressFill.style.width = pct + '%';
        
        if (count === 0) progressFill.style.background = '#3a3d42';
        else if (count < 3) progressFill.style.background = '#ff7e67'; // Красный
        else progressFill.style.background = '#67b279'; // Зеленый

        keyCountText.innerText = `${count} / 10 ключей`;
    }

    // --- 3. ОБРАБОТЧИКИ СОБЫТИЙ ---

    // Переключение ВКЛ/ВЫКЛ
    masterSwitch.addEventListener('click', () => {
        isEnabled = !isEnabled;
        updateToggle(isEnabled);
        chrome.storage.sync.set({ isEnabled: isEnabled });
    });

    // Навигация
    openSettingsBtn.addEventListener('click', () => {
        mainView.style.display = 'none';
        settingsView.style.display = 'block';
    });

    backToMainBtn.addEventListener('click', () => {
        settingsView.style.display = 'none';
        mainView.style.display = 'block';
        checkResults.innerHTML = ''; // Очищаем результаты при выходе
    });

    // Слежение за вводом ключей
    keysInput.addEventListener('input', () => {
        const lines = keysInput.value.split('\n').map(k=>k.trim()).filter(k=>k.length > 10);
        updateKeyMeter(lines.length);
    });

    // Сохранение ключей
    saveKeysBtn.addEventListener('click', () => {
        const keys = keysInput.value.split('\n').map(k=>k.trim()).filter(k=>k.length > 20);
        
        if (keys.length === 0) {
            statusMsg.style.color = '#ff7e67';
            statusMsg.innerText = '❌ Список пуст';
            return;
        }

        chrome.storage.sync.set({ geminiApiKeys: keys }, () => {
            statusMsg.style.color = '#67b279';
            statusMsg.innerText = `✅ Сохранено: ${keys.length}`;
            setTimeout(() => statusMsg.innerText = '', 2000);
            updateKeyMeter(keys.length);
        });
    });

    // ПРОВЕРКА КЛЮЧЕЙ
    checkKeysBtn.addEventListener('click', async () => {
        const keys = keysInput.value.split('\n').map(k=>k.trim()).filter(k=>k.length > 20);
        if (keys.length === 0) return;

        checkResults.innerHTML = '<div style="text-align:center; color:#888;">⏳ Connecting...</div>';
        checkKeysBtn.disabled = true;
        checkKeysBtn.style.opacity = '0.5';

        let html = '';
        let valid = 0;

        for (const key of keys) {
            const mask = key.substring(0, 6) + '...';
            try {
                // Используем 2.5-flash для проверки (она легкая)
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: "Hi" }] }]
                    })
                });

                if (res.ok) {
                    valid++;
                    html += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>${mask}</span> <span style="color:#67b279; font-weight:bold;">OK ✅</span>
                             </div>`;
                } else {
                    let reason = "ERR";
                    if (res.status === 400 || res.status === 403) reason = "BAD KEY";
                    if (res.status === 429) reason = "QUOTA";
                    
                    html += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span>${mask}</span> <span style="color:#ff7e67; font-weight:bold;">${reason} ❌</span>
                             </div>`;
                }
            } catch (e) {
                html += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>${mask}</span> <span style="color:#eebb4d;">NET ⚠️</span>
                         </div>`;
            }
        }

        checkResults.innerHTML = html;
        checkKeysBtn.disabled = false;
        checkKeysBtn.style.opacity = '1';
        statusMsg.innerText = `Рабочих: ${valid} из ${keys.length}`;
    });
});
