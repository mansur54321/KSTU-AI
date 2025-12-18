// ============================================================================
// BACKGROUND WORKER (Stats & Server Sync)
// ============================================================================

const STATS_SERVER_URL = 'http://159.223.3.49:3000/api/log';

// 1. Генерация уникального ID пользователя (если нет)
async function getUserId() {
    const data = await chrome.storage.sync.get(['userId']);
    if (data.userId) return data.userId;
    
    const newId = 'user-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    await chrome.storage.sync.set({ userId: newId });
    return newId;
}

// 2. Отправка лога на сервер
async function sendLog(type, model, meta = {}) {
    try {
        const userId = await getUserId();
        
        // Отправка на сервер (без ожидания ответа, fire-and-forget)
        fetch(STATS_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                event_type: type,
                model: model,
                timestamp: new Date().toISOString(),
                meta: meta
            })
        }).catch(err => console.log('Stats sending failed (server offline?)', err));

        // Локальный счетчик для Popup (AdGuard style)
        if (type === 'solve_success') {
            const data = await chrome.storage.sync.get(['solvedCount']);
            const newCount = (data.solvedCount || 0) + 1;
            await chrome.storage.sync.set({ solvedCount: newCount });
        }

    } catch (e) {
        console.error('Background error:', e);
    }
}

// 3. Слушатель сообщений от content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log_event') {
        sendLog(request.type, request.model, request.meta);
        sendResponse({status: "logged"});
    }
    return true;
});

// 4. Событие установки
chrome.runtime.onInstalled.addListener(() => {
    sendLog('install', 'system', { version: chrome.runtime.getManifest().version });
});
