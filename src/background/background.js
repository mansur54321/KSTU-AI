const CONFIG = {
    MODELS: ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
    MODELS_PRO: ['gemini-3.1-pro-preview'],
    MODELS_PRO_FALLBACK: ['gemini-3-flash-preview'],
    API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    GITHUB_REPO: 'mansur54321/KSTU-AI',
    GITHUB_API: 'https://api.github.com/repos/',
    STATS_SERVER_URL: 'http://159.223.3.49:3000/api/log',
    CACHE_SERVER_URL: 'http://159.223.3.49:3000/api/cache',
    RETRY: { MAX_ATTEMPTS: 3, BASE_DELAY_MS: 1000, BACKOFF_MULTIPLIER: 2 },
    HOTKEY_CODE: 'KeyS',
    MARKER_COLOR: '#888888',
    API_KEY_REGEX: /^AIzaSy[A-Za-z0-9_-]{30,}$/,
    VERSION: '3.4.3'
};

const GITHUB_API_URL = `https://api.github.com/repos/${CONFIG.GITHUB_REPO}/releases/latest`;
const DEBUG_PREFIX = '[KSTU-AI]';

function maskApiKey(key) {
    if (!key) return 'none';
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function describeParts(parts) {
    return {
        total: parts.length,
        text: parts.filter(part => part.text).length,
        images: parts.filter(part => part.inline_data).length,
        textChars: parts.reduce((sum, part) => sum + (part.text?.length || 0), 0)
    };
}

function errorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return error.message || String(error);
}

function stringifyErrorDetails(details) {
    try { return JSON.stringify(details); }
    catch (e) { return String(details); }
}

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

async function askGeminiViaApi(parts, apiKeys, models, requestId = 'no-id') {
    const requestBody = {
        contents: [{ parts: parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 1.0 }
    };

    let lastError = null;
    let rateLimitHit = false;
    let currentKeyIndex = 0;
    const attempts = [];

    const stored = await chrome.storage.sync.get(['currentKeyIndex']);
    currentKeyIndex = stored.currentKeyIndex || 0;

    console.groupCollapsed(`${DEBUG_PREFIX} Gemini request ${requestId}`);
    console.log('Request ID:', requestId);
    console.log('Models queue:', models);
    console.log('Keys count:', apiKeys.length, 'start key index:', currentKeyIndex);
    console.log('Payload summary:', describeParts(parts));
    console.log('Generation config:', requestBody.generationConfig);

    for (const model of models) {
        for (let i = 0; i < apiKeys.length; i++) {
            const keyIndex = (currentKeyIndex + i) % apiKeys.length;
            try {
                const controller = new AbortController();
                const timeoutMs = model.includes('pro') ? 240000 : 120000;
                const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);
                const requestUrl = `${CONFIG.API_BASE_URL}${model}:generateContent?key=${maskApiKey(apiKeys[keyIndex])}`;

                console.log('Trying model/key:', {
                    requestId,
                    model,
                    keyIndex,
                    key: maskApiKey(apiKeys[keyIndex]),
                    url: requestUrl,
                    timeoutMs
                });

                const res = await fetch(`${CONFIG.API_BASE_URL}${model}:generateContent?key=${apiKeys[keyIndex]}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.status === 429 || res.status === 503) {
                    rateLimitHit = true;
                    lastError = `HTTP ${res.status}: rate limit or server unavailable`;
                    attempts.push({ model, keyIndex, status: res.status, outcome: 'rate_or_server_limit' });
                    console.warn('Model/key skipped by rate/server limit:', { requestId, model, keyIndex, status: res.status });
                    continue;
                }
                if (!res.ok) {
                    lastError = await res.text();
                    attempts.push({ model, keyIndex, status: res.status, outcome: 'http_error', error: lastError.slice(0, 200) });
                    console.warn('Model/key failed:', { requestId, model, keyIndex, status: res.status, error: lastError.slice(0, 500) });
                    continue;
                }

                const data = await res.json();
                await chrome.storage.sync.set({ currentKeyIndex: keyIndex });
                const resultText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
                const json = JSON.parse(resultText);
                attempts.push({ model, keyIndex, status: res.status, outcome: 'success' });
                console.log('Model answered:', { requestId, model, keyIndex, responseChars: resultText.length, result: json });
                console.groupEnd();
                return { result: json, model: model, keyUsed: keyIndex, attempts };

            } catch (e) {
                lastError = e;
                attempts.push({ model, keyIndex, outcome: 'exception', error: errorMessage(e) });
                console.warn('Model/key exception:', stringifyErrorDetails({ requestId, model, keyIndex, error: errorMessage(e) }));
            }
        }
    }

    if (rateLimitHit) {
        sendLog('rate_limit', 'all', { keys_tried: apiKeys.length });
    }

    const finalError = errorMessage(lastError);
    console.error('All models failed:', stringifyErrorDetails({ requestId, lastError: finalError, attempts }));
    console.groupEnd();
    throw new Error(`${finalError || 'All models failed'}; attempts=${stringifyErrorDetails(attempts)}`);
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

async function serverCacheLookup(key) {
    const res = await fetch(`${CONFIG.CACHE_SERVER_URL}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
    });
    if (!res.ok) return { hit: false, error: `HTTP ${res.status}` };
    return res.json();
}

async function serverCacheStore(payload) {
    const res = await fetch(`${CONFIG.CACHE_SERVER_URL}/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` };
    return res.json();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log_event') {
        sendLog(request.type, request.model, request.meta);
        sendResponse({ status: "logged" });
    }

    if (request.action === 'ask_gemini') {
        askGeminiViaApi(request.parts, request.apiKeys, request.models, request.requestId)
            .then(sendResponse)
            .catch(e => sendResponse({ error: errorMessage(e), requestId: request.requestId }));
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

    if (request.action === 'screenshot') {
        chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 }, (dataUrl) => {
            sendResponse(dataUrl ? { dataUrl } : { error: 'capture failed' });
        });
        return true;
    }

    if (request.action === 'get_models') {
        const selectedModels = request.pro ? CONFIG.MODELS_PRO : CONFIG.MODELS;
        console.log(`${DEBUG_PREFIX} Selected ${request.pro ? 'PRO' : 'basic'} models:`, selectedModels);
        sendResponse(selectedModels);
    }

    if (request.action === 'get_fallback_models') {
        sendResponse(CONFIG.MODELS_PRO_FALLBACK);
    }

    if (request.action === 'cache_lookup') {
        serverCacheLookup(request.key)
            .then(sendResponse)
            .catch(e => sendResponse({ hit: false, error: errorMessage(e) }));
        return true;
    }

    if (request.action === 'cache_store') {
        serverCacheStore({
            key: request.key,
            question_preview: request.question_preview,
            correct: request.correct,
            correctTexts: request.correctTexts,
            reason: request.reason,
            source: request.source
        })
            .then(sendResponse)
            .catch(e => sendResponse({ status: 'error', error: errorMessage(e) }));
        return true;
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
