const CONFIG = {
    MODELS: [
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview'
    ],
    MODELS_PRO: [
        'gemini-3.1-pro-preview',
        'gemini-3-pro-preview',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview'
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
    API_KEY_REGEX: /^AIzaSy[A-Za-z0-9_-]{30,}$/,
    VERSION: '3.4.1'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
