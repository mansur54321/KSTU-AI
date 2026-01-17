// ============================================================================
// CENTRALIZED CONFIGURATION
// ============================================================================

const CONFIG = {
    // API Models (in priority order)
    MODELS: [
        'gemini-3-flash-preview',
        'gemini-2.5-flash'
    ],

    // API Settings
    API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',

    // GitHub Update Checker
    GITHUB_REPO: 'mansur54321/KSTU-AI',
    GITHUB_API: 'https://api.github.com/repos/',

    // Retry Settings
    RETRY: {
        MAX_ATTEMPTS: 3,
        BASE_DELAY_MS: 1000,
        BACKOFF_MULTIPLIER: 2
    },

    // UI Settings
    HOTKEY_CODE: 'KeyS',
    MARKER_COLOR: '#888888',

    // Version (sync with manifest)
    VERSION: '3.1.0'
};

// Export for ES modules or make global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
