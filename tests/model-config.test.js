const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CONFIG,
    selectModels,
    getFallbackModels,
    getGenerationConfig
} = require('../src/config.js');

test('basic mode uses Gemini 3.7 Flash with 3.5 Flash-Lite fallback', () => {
    assert.deepEqual(selectModels(), [
        'gemini-3.7-flash',
        'gemini-3.5-flash-lite'
    ]);
});

test('pro mode keeps the current Flash family when Legacy is disabled', () => {
    assert.deepEqual(selectModels({ pro: true }), [
        'gemini-3.7-flash',
        'gemini-3.5-flash-lite'
    ]);
});

test('Legacy mode opts into Gemini 3.1 Pro', () => {
    assert.deepEqual(selectModels({ pro: true, useLegacyPro: true }), [
        'gemini-3.1-pro-preview'
    ]);
});

test('Pro fallback uses the current Flash family', () => {
    assert.deepEqual(getFallbackModels(), [
        'gemini-3.7-flash',
        'gemini-3.5-flash-lite'
    ]);
});

test('validation uses the current primary Flash model', () => {
    assert.equal(CONFIG.VALIDATION_MODEL, 'gemini-3.7-flash');
});

test('generation config omits deprecated sampling parameters', () => {
    assert.deepEqual(getGenerationConfig(), {
        responseMimeType: 'application/json'
    });
});

test('stats and cache endpoints use HTTPS', () => {
    assert.match(CONFIG.STATS_SERVER_URL, /^https:\/\//);
    assert.match(CONFIG.CACHE_SERVER_URL, /^https:\/\//);
});
