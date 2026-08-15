(function initKstuConfig(root) {
    const CONFIG = {
        MODELS: [
            'gemini-3.7-flash',
            'gemini-3.5-flash-lite'
        ],
        MODELS_PRO: [
            'gemini-3.1-pro-preview'
        ],
        MODELS_PRO_FALLBACK: [
            'gemini-3.7-flash',
            'gemini-3.5-flash-lite'
        ],
        VALIDATION_MODEL: 'gemini-3.7-flash',
        API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
        GITHUB_REPO: 'mansur54321/KSTU-AI',
        GITHUB_API: 'https://api.github.com/repos/',
        STATS_SERVER_URL: 'https://stats.xd1.me/api/log',
        CACHE_SERVER_URL: 'https://stats.xd1.me/api/cache',
        CACHE_PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArpmnVIZdwHPHzOMear90
miV7ouqm1pYaHCLUgOXdeqMGIKiXiA9n+y1e96NCXAYZzYbYj3KvwZBJdF2azUZt
S8LtVsnfuUd9A6MMkgkalApKF8l9N8BIMGtwvsy5YdB36kHztEmeIEFCdMr6OVd9
dosgI/aMV67UXlrTDEYjNY6hib0gW33fFoHo2KxoeTk5r/l6hN77nP5oBMHHxD17
qoa9oxnCkWkX2Wig3hNapvjmIOXmmcny1fuKUFjQAgUU+HshcmieglpoZlEWxIS+
d4dtJcr2ZSYPaxL7PV43h8sHjLFVwzMiK/CvjApCXDoW/z2zz1AxZoUsFJ4quZQn
XQIDAQAB
-----END PUBLIC KEY-----`,
        RETRY: {
            MAX_ATTEMPTS: 3,
            BASE_DELAY_MS: 1000,
            BACKOFF_MULTIPLIER: 2
        },
        HOTKEY_CODE: 'KeyS',
        HOTKEY_NEXT_PAGE: 'KeyD',
        MARKER_COLOR: '#888888',
        API_KEY_REGEX: /^(?:AIzaSy[A-Za-z0-9_-]{30,}|AQ\.[A-Za-z0-9._-]{20,})$/
    };

    function selectModels({ pro = false, useLegacyPro = false } = {}) {
        if (!pro || !useLegacyPro) return [...CONFIG.MODELS];
        return [...CONFIG.MODELS_PRO];
    }

    function getFallbackModels() {
        return [...CONFIG.MODELS_PRO_FALLBACK];
    }

    function getGenerationConfig() {
        return { responseMimeType: 'application/json' };
    }

    const modelPolicy = {
        CONFIG,
        selectModels,
        getFallbackModels,
        getGenerationConfig
    };

    root.KSTU_AI_CONFIG = modelPolicy;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = modelPolicy;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
