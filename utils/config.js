// Configuration for AI Test Solver

export const CONFIG = {
    // API Models
    GEMINI_MODELS: [
        'gemini-2.5-pro',    // Primary (Smart, 2 RPM)
        'gemini-2.5-flash'   // Fallback (Fast, 15 RPM)
    ],
    
    // API Endpoints
    GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1/chat/completions',
    
    // OpenRouter Models
    OPENROUTER_MODELS: [
        'anthropic/claude-3.5-sonnet',
        'openai/gpt-4-turbo',
        'google/gemini-pro'
    ],
    
    // Hotkeys
    HOTKEY_CODE: 'KeyS',
    USE_ALT_KEY: true,
    
    // UI Settings
    STATUS_TIMEOUT: 4000,
    QUESTION_DELAY: 1000,
    
    // Generation Settings
    TEMPERATURE: 0.0,
    RESPONSE_MIME_TYPE: 'application/json'
};
