const CONFIG = {
    MODELS: ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
    MODELS_PRO: ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
    API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    GITHUB_REPO: 'mansur54321/KSTU-AI',
    GITHUB_API: 'https://api.github.com/repos/',
    STATS_SERVER_URL: 'https://159.223.3.49:3000/api/log',
    RETRY: { MAX_ATTEMPTS: 3, BASE_DELAY_MS: 1000, BACKOFF_MULTIPLIER: 2 },
    HOTKEY_CODE: 'KeyS',
    MARKER_COLOR: '#888888',
    API_KEY_REGEX: /^AIzaSy[A-Za-z0-9_-]{30,}$/,
    VERSION: '3.3.0'
};

const GITHUB_API_URL = `https://api.github.com/repos/${CONFIG.GITHUB_REPO}/releases/latest`;

async function getUserId() {
    const data = await chrome.storage.sync.get(['userId']);
    if (data.userId) return data.userId;
    const newId = 'user-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
    await chrome.storage.sync.set({ userId: newId });
    return newId;
}

async function sendLog(type, model, meta = {}) {
    try {
        const userId = await getUserId();
        fetch(CONFIG.STATS_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId, event_type: type, model: model,
                timestamp: new Date().toISOString(), meta: meta
            })
        }).catch(() => { });

        if (type === 'solve_success') {
            const data = await chrome.storage.sync.get(['solvedCount']);
            await chrome.storage.sync.set({ solvedCount: (data.solvedCount || 0) + 1 });
        }
        if (type === 'rate_limit') {
            const data = await chrome.storage.sync.get(['rateLimitHits']);
            await chrome.storage.sync.set({
                rateLimitHits: (data.rateLimitHits || 0) + 1,
                lastRateLimitTime: Date.now()
            });
        }
    } catch (e) { console.debug('Log error:', e); }
}

async function checkForUpdates() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(GITHUB_API_URL, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.status === 404) {
            const info = { hasUpdate: false, currentVersion: chrome.runtime.getManifest().version, checkedAt: Date.now() };
            await chrome.storage.local.set({ updateInfo: info });
            return info;
        }
        if (!response.ok) throw new Error(`GitHub API: ${response.status}`);

        const release = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, '');
        const currentVersion = chrome.runtime.getManifest().version;
        const info = {
            hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
            latestVersion, currentVersion,
            releaseUrl: release.html_url, releaseName: release.name,
            publishedAt: release.published_at, checkedAt: Date.now()
        };
        await chrome.storage.local.set({ updateInfo: info });
        return info;
    } catch (e) {
        return { hasUpdate: false, error: e.message, checkedAt: Date.now() };
    }
}

function compareVersions(v1, v2) {
    const p1 = v1.split('.').map(Number), p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const a = p1[i] || 0, b = p2[i] || 0;
        if (a > b) return 1; if (a < b) return -1;
    }
    return 0;
}

async function askGeminiViaApi(parts, apiKeys, models) {
    const requestBody = {
        contents: [{ parts: parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
    };

    let lastError = null;
    let rateLimitHit = false;
    let currentKeyIndex = 0;

    const stored = await chrome.storage.sync.get(['currentKeyIndex']);
    currentKeyIndex = stored.currentKeyIndex || 0;

    for (const model of models) {
        for (let i = 0; i < apiKeys.length; i++) {
            const keyIndex = (currentKeyIndex + i) % apiKeys.length;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                const res = await fetch(`${CONFIG.API_BASE_URL}${model}:generateContent?key=${apiKeys[keyIndex]}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.status === 429 || res.status === 503) {
                    rateLimitHit = true;
                    continue;
                }
                if (!res.ok) {
                    lastError = await res.text();
                    continue;
                }

                const data = await res.json();
                await chrome.storage.sync.set({ currentKeyIndex: keyIndex });
                const resultText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
                const json = JSON.parse(resultText);
                return { result: json, model: model, keyUsed: keyIndex };

            } catch (e) {
                lastError = e;
            }
        }
    }

    if (rateLimitHit) {
        sendLog('rate_limit', 'all', { keys_tried: apiKeys.length });
    }

    throw new Error(lastError?.message || 'All models failed');
}

async function validateApiKey(key) {
    if (!CONFIG.API_KEY_REGEX.test(key)) return false;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${CONFIG.API_BASE_URL}gemini-3-flash-preview:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return res.ok;
    } catch (e) {
        return false;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log_event') {
        sendLog(request.type, request.model, request.meta);
        sendResponse({ status: "logged" });
    }

    if (request.action === 'ask_gemini') {
        askGeminiViaApi(request.parts, request.apiKeys, request.models)
            .then(sendResponse)
            .catch(e => sendResponse({ error: e.message }));
        return true;
    }

    if (request.action === 'validate_key') {
        validateApiKey(request.key).then(sendResponse);
        return true;
    }

    if (request.action === 'check_updates') {
        checkForUpdates().then(sendResponse);
        return true;
    }

    if (request.action === 'get_update_info') {
        chrome.storage.local.get(['updateInfo'], (data) => {
            sendResponse(data.updateInfo || { hasUpdate: false });
        });
        return true;
    }

    if (request.action === 'get_models') {
        const pro = request.pro;
        sendResponse(pro ? CONFIG.MODELS_PRO : CONFIG.MODELS);
    }

    return true;
});

chrome.runtime.onInstalled.addListener((details) => {
    sendLog('install', 'system', { version: chrome.runtime.getManifest().version, reason: details.reason });
    checkForUpdates();
});

chrome.alarms.create('updateCheck', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'updateCheck') checkForUpdates();
});

checkForUpdates();
