// ============================================================================
// BACKGROUND WORKER (Stats, Update Checker & Messaging)
// ============================================================================

const STATS_SERVER_URL = 'http://159.223.3.49:3000/api/log';
const GITHUB_REPO = 'mansur54321/KSTU-AI';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// 1. Generate unique user ID
async function getUserId() {
    const data = await chrome.storage.sync.get(['userId']);
    if (data.userId) return data.userId;

    // Fixed: substr() -> substring()
    const newId = 'user-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
    await chrome.storage.sync.set({ userId: newId });
    return newId;
}

// 2. Send log to stats server
async function sendLog(type, model, meta = {}) {
    try {
        const userId = await getUserId();

        // Fire-and-forget
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
        }).catch(() => { }); // Silent fail

        // Local counter for Popup
        if (type === 'solve_success') {
            const data = await chrome.storage.sync.get(['solvedCount']);
            const newCount = (data.solvedCount || 0) + 1;
            await chrome.storage.sync.set({ solvedCount: newCount });
        }

        // Track rate limits
        if (type === 'rate_limit') {
            const data = await chrome.storage.sync.get(['rateLimitHits']);
            await chrome.storage.sync.set({
                rateLimitHits: (data.rateLimitHits || 0) + 1,
                lastRateLimitTime: Date.now()
            });
        }

    } catch (e) {
        console.error('Background error:', e);
    }
}

// 3. GitHub Update Checker
async function checkForUpdates() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(GITHUB_API, {
            headers: { 'Accept': 'application/vnd.github.v3+json' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        // 404 = no releases yet, not an error
        if (response.status === 404) {
            const updateInfo = {
                hasUpdate: false,
                currentVersion: chrome.runtime.getManifest().version,
                message: 'No releases found',
                checkedAt: Date.now()
            };
            await chrome.storage.local.set({ updateInfo });
            return updateInfo;
        }

        if (!response.ok) {
            throw new Error(`GitHub API: ${response.status}`);
        }

        const release = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, '');
        const currentVersion = chrome.runtime.getManifest().version;

        const updateInfo = {
            hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
            latestVersion: latestVersion,
            currentVersion: currentVersion,
            releaseUrl: release.html_url,
            releaseName: release.name,
            publishedAt: release.published_at,
            checkedAt: Date.now()
        };

        await chrome.storage.local.set({ updateInfo });
        return updateInfo;

    } catch (e) {
        console.error('Update check failed:', e);
        return { hasUpdate: false, error: e.message, checkedAt: Date.now() };
    }
}

// Version comparison helper (1.2.3 format)
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

// 4. Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log_event') {
        sendLog(request.type, request.model, request.meta);
        sendResponse({ status: "logged" });
    }

    if (request.action === 'check_updates') {
        checkForUpdates().then(info => sendResponse(info));
        return true; // Async response
    }

    if (request.action === 'get_update_info') {
        chrome.storage.local.get(['updateInfo'], (data) => {
            sendResponse(data.updateInfo || { hasUpdate: false });
        });
        return true;
    }

    return true;
});

// 5. Installation event
chrome.runtime.onInstalled.addListener((details) => {
    sendLog('install', 'system', {
        version: chrome.runtime.getManifest().version,
        reason: details.reason
    });

    // Check for updates on install
    checkForUpdates();
});

// 6. Periodic update check (every 6 hours)
chrome.alarms.create('updateCheck', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'updateCheck') {
        checkForUpdates();
    }
});

// Initial update check on startup
checkForUpdates();
