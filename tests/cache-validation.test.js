const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../src/content/cache.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));

function createHarness() {
    const state = { local: {}, messages: [], server: null, acknowledgement: { status: 'ok' }, lastError: null };
    const chrome = {
        runtime: {
            sendMessage(message, callback) {
                state.messages.push(plain(message));
                queueMicrotask(() => {
                    chrome.runtime.lastError = state.lastError ? { message: state.lastError } : undefined;
                    callback(message.action === 'cache_lookup'
                        ? state.server ? { hit: true, entry: structuredClone(state.server) } : { hit: false }
                        : state.acknowledgement);
                    chrome.runtime.lastError = undefined;
                });
            }
        },
        storage: {
            local: {
                async get(keys) {
                    return structuredClone(Object.fromEntries(keys.filter(key => key in state.local).map(key => [key, state.local[key]])));
                },
                async set(values) {
                    await flush();
                    Object.assign(state.local, structuredClone(values));
                }
            }
        }
    };
    const context = vm.createContext({ chrome, crypto: webcrypto, TextEncoder, URL,
        location: { href: 'https://example.invalid/' }, console, DEBUG_PREFIX: '[test]' });
    vm.runInContext(source, context, { filename: 'src/content/cache.js' });
    return { context, state };
}

function question(text = 'Fixture question', variants = ['v1', 'v2']) {
    return {
        text,
        images: [],
        answers: variants.map((variantId, index) => ({
            id: String.fromCharCode(65 + index), variantId,
            text: variantId === 'v1' ? 'Red' : 'Blue'
        }))
    };
}

function verdict(accepted = [], rejected = [], summary = {}) {
    return { accepted, rejected,
        summary: { testingId: 'fixture-test', attemptNumber: '1', total: 2, correct: 1, score: 50, unknown: 1, ...summary } };
}

const accepted = (q, ids = ['v2']) => ({ ...q, correctVariantIds: ids, evidence: 'platonus_report_correct' });
const rejected = (q, ids = ['v1']) => ({ ...q, selectedVariantIds: ids, evidence: 'platonus_report_incorrect' });
const storeMessages = state => state.messages.filter(message => message.action === 'cache_store');
const keyFor = (context, q) => context.hashQuestion(q.text, q.answers, q.images);
const guess = (context, q, correct, reason = 'fixture guess') => context.cacheStoreFromResult(q.text, q.answers, { correct, reason }, q.images);
const lookup = (context, q) => context.cacheLookup(q.text, q.answers, q.images);

test('a validated answer repairs a weak guess and uploads canonical identities', async () => {
    const { context, state } = createHarness();
    const q = question();
    const key = await keyFor(context, q);
    await guess(context, q, ['A']);

    const counts = await context.applyPlatonusValidation(verdict([accepted(q)]));

    assert.deepEqual(plain(counts), { verified: 1, rejected: 0, uploaded: 1, failed: 0 });
    assert.deepEqual(state.local.answerCache[key].correct, ['B']);
    assert.deepEqual(state.local.answerCache[key].correctTexts, ['blue::img=']);
    assert.equal(state.local.answerCache[key].source, 'attempt_view');
    assert.deepEqual(storeMessages(state), [{ action: 'cache_store', key, question_preview: q.text,
        correct: ['B'], correctTexts: ['blue::img='], reason: 'platonus_report_correct', source: 'attempt_view' }]);
    await guess(context, q, ['A']);
    assert.deepEqual(state.local.answerCache[key].correct, ['B']);
});

test('local validated answers beat stale server answers and survive variant reordering', async () => {
    const { context, state } = createHarness();
    const q = question();
    await context.applyPlatonusValidation(verdict([accepted(q)]));
    state.server = { correct: ['A'], correctTexts: ['red::img='], source: 'attempt_view' };
    state.messages.length = 0;

    const result = await lookup(context, question(q.text, ['v2', 'v1']));

    assert.deepEqual(plain(result.correct), ['A']);
    assert.equal(result.source, 'attempt_view');
    assert.equal(state.messages.length, 0);
});

test('a rejected exact guess stays stored but cannot be resurrected by server or local lookup', async () => {
    const { context, state } = createHarness();
    const q = question();
    const key = await keyFor(context, q);
    await guess(context, q, ['A']);

    const counts = await context.applyPlatonusValidation(verdict([], [rejected(q)]));
    state.server = { correct: ['A'], correctTexts: ['red::img='], source: 'attempt_view' };

    assert.deepEqual(plain(counts), { verified: 0, rejected: 1, uploaded: 0, failed: 0 });
    assert.deepEqual(state.local.answerCache[key].correct, ['A']);
    assert.equal(state.local.answerCache[key].validation, 'rejected');
    assert.equal(await lookup(context, q), null);
    assert.equal(storeMessages(state).length, 0);
    await guess(context, q, ['A']);
    assert.equal(await lookup(context, q), null);
    await guess(context, q, ['B']);
    assert.deepEqual(plain((await lookup(context, q)).correct), ['B']);
});

test('rejecting a different selected set preserves the existing weak answer', async () => {
    const { context, state } = createHarness();
    const q = question();
    await guess(context, q, ['B']);

    await context.applyPlatonusValidation(verdict([], [rejected(q)]));

    assert.deepEqual(plain((await lookup(context, q)).correct), ['B']);
    assert.equal(storeMessages(state).length, 0);
});

test('rejecting a different selected set preserves a validated answer', async () => {
    const { context, state } = createHarness();
    const q = question();
    await context.applyPlatonusValidation(verdict([accepted(q)]));
    const key = await keyFor(context, q);

    await context.applyPlatonusValidation(verdict([], [rejected(q)]));
    await guess(context, q, ['A']);

    assert.deepEqual(plain((await lookup(context, q)).correct), ['B']);
    assert.equal(state.local.answerCache[key].source, 'attempt_view');
});

test('a newer exact rejection blocks even the same previously validated answer', async () => {
    const { context, state } = createHarness();
    const q = question();
    const key = await keyFor(context, q);
    await context.applyPlatonusValidation(verdict([accepted(q, ['v1'])]));

    await context.applyPlatonusValidation(verdict([], [rejected(q)]));
    state.server = { correct: ['A'], correctTexts: ['red::img='], source: 'attempt_view' };

    assert.equal(state.local.answerCache[key].source, 'attempt_view');
    assert.deepEqual(state.local.answerCache[key].correct, ['A']);
    assert.equal(await lookup(context, q), null);
    await guess(context, q, ['B']);
    assert.deepEqual(plain((await lookup(context, q)).correct), ['B']);
});

test('a partial aggregate result only persists its allowlisted summary', async () => {
    const { context, state } = createHarness();

    const counts = await context.applyPlatonusValidation(verdict([], [], {
        total: 30, correct: 26, score: 86.67, unknown: 30, studentName: 'must not be stored', extra: { private: true }
    }));

    assert.deepEqual(plain(counts), { verified: 0, rejected: 0, uploaded: 0, failed: 0 });
    assert.deepEqual(state.local, { platonusValidationSummary: {
        testingId: 'fixture-test', attemptNumber: '1', total: 30, correct: 26, score: 86.67, unknown: 30,
        verified: 0, rejected: 0, uploaded: 0, failed: 0
    } });
    assert.equal(state.messages.length, 0);
});

test('failed or missing upload acknowledgement never counts as an upload', async () => {
    for (const response of [undefined, {}, { status: 'error' }, { status: 'error', ok: true }, { status: 'rejected' }, { success: false }, { status: 'ok', stored: false }, { error: 'fixture failure' }]) {
        const { context, state } = createHarness();
        state.acknowledgement = response;

        const counts = await context.applyPlatonusValidation(verdict([accepted(question())]));

        assert.deepEqual(plain(counts), { verified: 1, rejected: 0, uploaded: 0, failed: 1 });
        assert.equal(state.local.platonusValidationSummary.failed, 1);
        assert.equal(Object.values(state.local.answerCache)[0].source, 'attempt_view');
    }
    const { context, state } = createHarness();
    state.lastError = 'fixture transport failure';
    const counts = await context.applyPlatonusValidation(verdict([accepted(question())]));
    assert.equal(counts.uploaded, 0);
    assert.equal(counts.failed, 1);
});

test('the accepted stable variant ID determines letters after variants reorder', async () => {
    const { context, state } = createHarness();
    const q = question('Fixture reordered', ['v2', 'v1']);

    await context.applyPlatonusValidation(verdict([accepted(q)]));

    assert.deepEqual(storeMessages(state)[0].correct, ['A']);
    assert.deepEqual(storeMessages(state)[0].correctTexts, ['blue::img=']);
});

test('unknown or ambiguous variant IDs never write an accepted answer', async () => {
    for (const q of [accepted(question(), ['missing']), accepted(question(), ['v1', 'v1']),
        accepted(question('Fixture duplicate', ['v1', 'v1'])),
        accepted({ ...question(), answers: [{ id: 'A', text: 'Red' }] }, ['undefined'])]) {
        const { context, state } = createHarness();

        const counts = await context.applyPlatonusValidation(verdict([q]));

        assert.equal(counts.verified, 0);
        assert.equal(counts.failed, 1);
        assert.equal(state.local.answerCache, undefined);
        assert.equal(state.messages.length, 0);
    }
});

test('concurrent validation and guess writes preserve every validated answer', async () => {
    const { context, state } = createHarness();
    const first = question('Fixture first');
    const second = question('Fixture second');
    const third = question('Fixture third');

    await Promise.all([
        context.applyPlatonusValidation(verdict([accepted(first), accepted(second)])),
        context.applyPlatonusValidation(verdict([accepted(third)])),
        guess(context, first, ['A'])
    ]);

    assert.equal(Object.keys(state.local.answerCache).length, 3);
    for (const q of [first, second, third]) {
        const entry = state.local.answerCache[await keyFor(context, q)];
        assert.equal(entry.source, 'attempt_view');
        assert.deepEqual(entry.correct, ['B']);
    }
});

test('model reasons and unsigned server flags cannot promote a guess to validated', async () => {
    const { context, state } = createHarness();
    const q = question();
    const key = await keyFor(context, q);
    await guess(context, q, ['A'], 'from_results');
    await guess(context, q, ['B']);
    assert.deepEqual(state.local.answerCache[key].correct, ['B']);

    state.server = { correct: ['A'], correctTexts: ['red::img='], source: 'client', validated: true, reason: 'from_results' };
    await lookup(context, q);
    assert.notEqual(state.local.answerCache[key].source, 'attempt_view');
    await guess(context, q, ['B']);
    assert.deepEqual(state.local.answerCache[key].correct, ['B']);
});

test('Univer result review corrects a weak entry and fire-and-forget upload errors stay handled', async () => {
    const { context, state } = createHarness();
    const q = question();
    await guess(context, q, ['A']);
    context.parseAttemptView = () => [{ ...q, correct: 'B' }];
    state.lastError = 'fixture transport failure';

    await context.cacheFromAttemptView();
    await flush();

    const entry = state.local.answerCache[await keyFor(context, q)];
    assert.deepEqual(entry.correct, ['B']);
    assert.equal(entry.source, 'attempt_view');
    assert.equal(storeMessages(state).length, 1);
});
