const CONFIG = {
    MODELS: [
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite'
    ],
    MODELS_PRO: [
        'gemini-3.1-pro-preview'
    ],
    MODELS_PRO_FALLBACK: [
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite'
    ],
    API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    GITHUB_REPO: 'mansur54321/KSTU-AI',
    GITHUB_API: 'https://api.github.com/repos/',
    STATS_SERVER_URL: 'http://159.223.3.49:3000/api/log',
    RETRY: {
        MAX_ATTEMPTS: 3,
        BASE_DELAY_MS: 1000,
        BACKOFF_MULTIPLIER: 2
    },
    HOTKEY_CODE: 'KeyS',
    MARKER_COLOR: '#888888',
    API_KEY_REGEX: /^(?:AIzaSy[A-Za-z0-9_-]{30,}|AQ\.[A-Za-z0-9._-]{20,})$/,
    VERSION: '3.4.9'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
