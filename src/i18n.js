// ============================================================================
// INTERNATIONALIZATION (i18n) SYSTEM
// ============================================================================

const I18N = {
    // Current language (auto-detect or stored)
    currentLang: 'ru',

    // Translations
    translations: {
        ru: {
            // Status messages
            'status.thinking': 'Думаю...',
            'status.solved': 'Решено',
            'status.error': 'Ошибка',
            'status.noKeys': 'Нет ключей',
            'status.noQuestions': 'Вопросы не найдены',
            'status.checkVisuals': 'Проверь визуально!',
            'status.retrying': 'Повтор попытки...',

            // Update messages
            'update.available': 'Доступно обновление',
            'update.current': 'Актуальная версия',
            'update.checking': 'Проверка...',
            'update.error': 'Ошибка проверки',

            // Popup
            'popup.protection.enabled': 'Защита включена',
            'popup.protection.disabled': 'Защита отключена',
            'popup.adsBlocked': 'заблокировано',
            'popup.keysLoaded': 'ключей загружено',
            'popup.saved': 'Сохранено',
            'popup.export': 'Экспорт',
            'popup.import': 'Импорт',
            'popup.settings': 'Настройки',
            'popup.behavior': 'ПОВЕДЕНИЕ',
            'popup.autoClick': 'Автоклик ответа',
            'popup.showMarker': 'Показывать маркер',
            'popup.apiKeys': 'API КЛЮЧИ (GEMINI)',
            'popup.checkKeys': 'Проверить ключи',
            'popup.valid': 'Рабочих',

            // Notifications
            'notify.solved': 'Вопрос решён',
            'notify.allSolved': 'Все вопросы решены',
            'notify.error': 'Ошибка при решении',
            'notify.rateLimit': 'Лимит запросов'
        },
        en: {
            // Status messages
            'status.thinking': 'Thinking...',
            'status.solved': 'Solved',
            'status.error': 'Error',
            'status.noKeys': 'No Keys',
            'status.noQuestions': 'No Questions',
            'status.checkVisuals': 'Check Visuals!',
            'status.retrying': 'Retrying...',

            // Update messages
            'update.available': 'Update available',
            'update.current': 'Up to date',
            'update.checking': 'Checking...',
            'update.error': 'Check failed',

            // Popup
            'popup.protection.enabled': 'Protection is enabled',
            'popup.protection.disabled': 'Protection is disabled',
            'popup.adsBlocked': 'ads blocked',
            'popup.keysLoaded': 'keys loaded',
            'popup.saved': 'Saved',
            'popup.export': 'Export',
            'popup.import': 'Import',
            'popup.settings': 'Settings',
            'popup.behavior': 'BEHAVIOR',
            'popup.autoClick': 'Auto-Click Answer',
            'popup.showMarker': 'Show Visual Marker',
            'popup.apiKeys': 'API KEYS (GEMINI)',
            'popup.checkKeys': 'Check Keys',
            'popup.valid': 'Valid',

            // Notifications
            'notify.solved': 'Question solved',
            'notify.allSolved': 'All questions solved',
            'notify.error': 'Error solving',
            'notify.rateLimit': 'Rate limit reached'
        }
    },

    // Get translation
    t(key) {
        return this.translations[this.currentLang]?.[key] ||
            this.translations['en']?.[key] ||
            key;
    },

    // Set language
    setLang(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            chrome.storage.sync.set({ language: lang });
        }
    },

    // Auto-detect language
    async init() {
        const data = await chrome.storage.sync.get(['language']);
        if (data.language) {
            this.currentLang = data.language;
        } else {
            // Detect from browser
            const browserLang = navigator.language.split('-')[0];
            this.currentLang = this.translations[browserLang] ? browserLang : 'ru';
        }
        return this;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18N;
}
