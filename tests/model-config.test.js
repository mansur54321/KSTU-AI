const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CONFIG,
    selectModels,
    getFallbackModels,
    getGenerationConfig
} = require('../src/config.js');

test('basic mode uses Gemini 3.8 Flash with 3.5 Flash-Lite fallback', () => {
    assert.deepEqual(selectModels(), [
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite'
    ]);
});

test('pro mode defaults to Gemini 4 Argon', () => {
    assert.deepEqual(selectModels({ pro: true }), [
        'gemini-4-argon'
    ]);
});

test('disabling pro mode uses the current Flash family', () => {
    assert.deepEqual(selectModels({ pro: false }), [
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite'
    ]);
});

test('changing the selected pro models does not mutate the config', () => {
    const models = selectModels({ pro: true });
    models.push('test-model');

    assert.deepEqual(CONFIG.MODELS_PRO, ['gemini-4-argon']);
    assert.deepEqual(selectModels({ pro: true }), ['gemini-4-argon']);
});

test('Pro fallback uses the current Flash family', () => {
    assert.deepEqual(getFallbackModels(), [
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite'
    ]);
});

test('validation uses the current primary Flash model', () => {
    assert.equal(CONFIG.VALIDATION_MODEL, 'gemini-3.8-flash');
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
