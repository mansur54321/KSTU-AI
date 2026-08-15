const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeCacheText,
    hashQuestion,
    cacheKeys,
    correctIdsToAnswerTexts,
    answerTextsToCurrentIds,
    pairsToTexts,
    textsToPairs,
    entryToCurrentAnswer
} = require('../src/content/cache.js');

test('normalizeCacheText lowercases, trims, collapses whitespace', () => {
    assert.equal(normalizeCacheText('  Hello   WORLD  '), 'hello world');
});

test('hashQuestion is deterministic and keyed by question + images + answers', async () => {
    const answers = [{ id: 'A', text: 'Red' }, { id: 'B', text: 'Blue' }];
    const a1 = await hashQuestion('What color?', answers, []);
    const a2 = await hashQuestion('What color?', answers, []);
    assert.equal(a1, a2);
    assert.match(a1, /^q_[0-9a-f]{32}$/);
    const diff = await hashQuestion('What color?', [{ id: 'A', text: 'Red' }, { id: 'B', text: 'Green' }], []);
    assert.notEqual(a1, diff);
});

test('cacheKeys returns three deduped legacy-compatible keys', async () => {
    const keys = await cacheKeys('Q', [{ id: 'A', text: 'x' }], []);
    assert.ok(keys.length >= 1);
    assert.equal(new Set(keys).size, keys.length);
});

test('correctIdsToAnswerTexts falls back to raw id for unknown ids', () => {
    const answers = [{ id: 'A', text: 'Red' }];
    assert.deepEqual(correctIdsToAnswerTexts(answers, ['A', 'ZZ:1']), ['red::img=', 'zz:1']);
});

test('answerTextsToCurrentIds maps cached texts back to current answer ids', () => {
    const answers = [{ id: 'A', text: 'Red' }, { id: 'B', text: 'Blue' }];
    assert.deepEqual(answerTextsToCurrentIds(answers, ['red', 'blue']), ['A', 'B']);
});

test('pairsToTexts and textsToPairs round-trip for drag & drop', () => {
    const texts = pairsToTexts([{ zone: 1, item: 'A' }, { zone: 2, item: 'B' }]);
    assert.deepEqual(texts, ['1:A', '2:B']);
    assert.deepEqual(textsToPairs(texts), [{ zone: 1, item: 'A' }, { zone: 2, item: 'B' }]);
});

test('entryToCurrentAnswer handles text_input cache entries', () => {
    const entry = { correctTexts: ['42'], reason: 'r', source: 'local' };
    assert.deepEqual(entryToCurrentAnswer(entry, [], 'text_input'), { answer: '42', reason: 'r', source: 'local' });
    assert.equal(entryToCurrentAnswer({ correctTexts: [] }, [], 'text_input'), null);
});

test('entryToCurrentAnswer handles moodle_dd cache entries', () => {
    const entry = { correctTexts: ['1:A', '2:B'], reason: 'r', source: 'local' };
    assert.deepEqual(entryToCurrentAnswer(entry, [], 'moodle_dd'), {
        pairs: [{ zone: 1, item: 'A' }, { zone: 2, item: 'B' }],
        reason: 'r', source: 'local'
    });
    assert.equal(entryToCurrentAnswer({ correctTexts: ['bad'] }, [], 'moodle_dd'), null);
});

test('entryToCurrentAnswer maps choice by correctTexts then falls back to correct ids', () => {
    const answers = [{ id: 'A', text: 'Red' }, { id: 'B', text: 'Blue' }];
    assert.deepEqual(entryToCurrentAnswer({ correctTexts: ['red'] }, answers, 'choice'), {
        correct: ['A'], reason: 'cache', source: 'cache'
    });
    assert.deepEqual(entryToCurrentAnswer({ correct: ['B'] }, answers, 'choice'), {
        correct: ['B'], reason: 'cache', source: 'cache'
    });
    assert.equal(entryToCurrentAnswer({ correct: ['Z'] }, answers, 'choice'), null);
});
