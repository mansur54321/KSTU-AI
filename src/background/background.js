// Адрес твоего сервера
const STATS_SERVER_URL = 'http://159.223.3.49:3000/api/log';

// Генерация UUID (уникальный ID пользователя)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Получить или создать ID пользователя
async function getUserId() {
    const result = await chrome.storage.sync.get(['userId']);
    if (result.userId) {
        return result.userId;
    } else {
        const newId = generateUUID();
        await chrome.storage.sync.set({ userId: newId });
        // Отправляем событие "Установка"
        sendLog('install', 'system', { version: chrome.runtime.getManifest().version });
        return newId;
    }
}

// Функция отправки лога
async function sendLog(eventType, model = 'unknown', meta = {}) {
    try {
        const userId = await getUserId();
        
        await fetch(STATS_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                event_type: eventType,
                model: model,
                meta: meta
            })
        });
        console.log('📊 Stat sent:', eventType);
    } catch (e) {
        console.error('Stats error:', e);
    }
}

// Слушатель сообщений от content.js и popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log_event') {
        sendLog(request.type, request.model, request.meta);
    }
});

// Лог при запуске браузера/расширения
chrome.runtime.onStartup.addListener(() => {
    sendLog('startup', 'system');
});

// Лог при установке
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        getUserId(); // Инициирует создание ID и лог
    }
});