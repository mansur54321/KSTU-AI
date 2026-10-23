const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modelPolicy = require('../src/config.js');

const contentSource = fs.readFileSync(path.join(__dirname, '../src/content/content.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

function createHarness() {
    const state = {
        clicks: [],
        markers: [],
        cacheCalls: 0,
        requestCalls: 0,
        storeCalls: 0,
        cacheResult: null,
        requestResult: { result: { correct: ['A'] }, model: 'fixture-model' }
    };
    function question(questionId, variants = ['v1', 'v2']) {
        return {
            platform: 'platonus',
            questionId,
            number: Number(questionId),
            type: 'choice',
            text: `Fixture question ${questionId}`,
            images: [],
            domElement: { style: { opacity: '1' } },
            answers: variants.map((variantId, index) => ({
                id: String.fromCharCode(65 + index),
                variantId,
                text: variantId === 'v1' ? 'First option' : 'Beta option',
                textElement: {},
                element: {
                    checked: false,
                    click() {
                        this.checked = true;
                        state.clicks.push({ questionId, variantId });
                    }
                }
            }))
        };
    }
    state.live = question('1');
    const consoleStub = Object.fromEntries(
        ['log', 'warn', 'error', 'debug', 'groupCollapsed', 'groupEnd'].map(name => [name, () => {}])
    );
    const context = vm.createContext({
        KSTU_AI_CONFIG: modelPolicy,
        console: consoleStub,
        I18N: { t: key => key },
        document: {
            readyState: 'loading',
            body: {},
            addEventListener() {},
            querySelectorAll() { return []; },
            querySelector() { return null; }
        },
        window: { addEventListener() {} },
        location: { href: 'https://example.invalid/test', pathname: '/test' },
        MutationObserver: class { observe() {} },
        chrome: {
            runtime: {
                getManifest: () => ({ version: 'test' }),
                sendMessage: async () => ({})
            },
            storage: { sync: { get: async () => ({ cfgAutoClick: true, cfgMarker: true }) } }
        }
    });
    vm.runInContext(contentSource, context, { filename: 'src/content/content.js' });
    Object.assign(context, {
        showStatus() {},
        showStealthNotify() {},
        injectDotMarker(element) { state.markers.push(element); },
        extractQuestions() { return state.live ? [state.live] : []; },
        async cacheLookup() {
            state.cacheCalls++;
            return state.cacheResult;
        },
        async cacheStoreFromResult() { state.storeCalls++; },
        async buildApiParts() { return { parts: [{ text: 'fixture' }], imgCount: 0 }; },
        async askGeminiWithProFallback() {
            state.requestCalls++;
            return state.requestResult;
        }
    });
    return { context, state, question };
}

test('a prefetched answer does not click another question after the user navigates', async () => {
    const { context, state, question } = createHarness();
    const incoming = state.live;
    const gate = deferred();
    incoming.prefetchedAnswer = gate.promise;
    const processing = context.processQuestion(incoming, ['fixture-key'], ['fixture-model']);
    await flush();

    state.live = question('2');
    gate.resolve({ result: { correct: ['A'] }, answers: incoming.answers });

    assert.equal(await processing, false);
    assert.deepEqual(state.clicks, []);
    assert.deepEqual(state.markers, []);
    assert.equal(state.cacheCalls, 0);
    assert.equal(state.requestCalls, 0);
    assert.equal(incoming.domElement.style.opacity, '1');
});

test('prefetched letters are remapped to stable variant IDs after options reorder', async () => {
    const { context, state, question } = createHarness();
    const incoming = state.live;
    const gate = deferred();
    incoming.prefetchedAnswer = gate.promise;
    const processing = context.processQuestion(incoming, ['fixture-key'], ['fixture-model']);
    await flush();

    state.live = question('1', ['v2', 'v1']);
    gate.resolve({ result: { correct: ['A'] }, answers: incoming.answers });

    assert.equal(await processing, true);
    assert.deepEqual(state.clicks, [{ questionId: '1', variantId: 'v1' }]);
    assert.equal(state.live.answers[0].element.checked, false);
    assert.equal(state.live.answers[1].element.checked, true);
    assert.equal(state.cacheCalls, 0);
    assert.equal(state.requestCalls, 0);
});

test('a manual selection made while prefetch is pending is preserved', async () => {
    const { context, state } = createHarness();
    const incoming = state.live;
    const gate = deferred();
    incoming.prefetchedAnswer = gate.promise;
    const processing = context.processQuestion(incoming, ['fixture-key'], ['fixture-model']);
    await flush();

    state.live.answers[1].element.checked = true;
    gate.resolve({ result: { correct: ['A'] }, answers: incoming.answers });

    assert.equal(await processing, true);
    assert.deepEqual(state.clicks, []);
    assert.deepEqual(state.markers, []);
    assert.equal(state.live.answers[0].element.checked, false);
    assert.equal(state.live.answers[1].element.checked, true);
    assert.equal(incoming.domElement.style.opacity, '1');
});

test('loading a future question result does not apply it to any answer elements', async () => {
    const { context, state, question } = createHarness();
    const future = question('2');

    const loaded = await context.loadPlatonusAnswer(future, ['fixture-key'], ['fixture-model']);

    assert.deepEqual(loaded.result, { correct: ['A'] });
    assert.equal(loaded.answers, future.answers);
    assert.equal(state.live.questionId, '1');
    assert.deepEqual(state.clicks, []);
    assert.deepEqual(state.markers, []);
    assert.equal(state.requestCalls, 1);
    assert.equal(state.storeCalls, 1);
    assert.ok(future.answers.every(answer => !answer.element.checked));
    assert.ok(state.live.answers.every(answer => !answer.element.checked));
});

test('a transient prefetch failure retries the current question once in the foreground', async () => {
    const { context, state } = createHarness();
    const incoming = state.live;
    const gate = deferred();
    incoming.prefetchedAnswer = gate.promise;
    const processing = context.processQuestion(incoming, ['fixture-key'], ['fixture-model']);
    await flush();

    gate.reject(new Error('temporary network timeout'));

    assert.equal(await processing, true);
    assert.equal(incoming.prefetchedAnswer, null);
    assert.equal(state.cacheCalls, 1);
    assert.equal(state.requestCalls, 1);
    assert.equal(state.storeCalls, 1);
    assert.deepEqual(state.clicks, [{ questionId: '1', variantId: 'v1' }]);
    assert.equal(incoming.domElement.style.opacity, '1');
});

test('a prefetch invalidated while building API parts does not send an API request', async () => {
    const { context, state, question } = createHarness();
    const gate = deferred();
    const building = deferred();
    let current = true;
    context.buildApiParts = async () => {
        building.resolve();
        return gate.promise;
    };
    const loading = context.loadPlatonusAnswer(question('2'), ['fixture-key'], ['fixture-model'], () => current);
    await building.promise;

    current = false;
    gate.resolve({ parts: [{ text: 'fixture' }], imgCount: 0 });

    assert.equal(await loading, null);
    assert.equal(state.requestCalls, 0);
    assert.equal(state.storeCalls, 0);
    assert.deepEqual(state.clicks, []);
});

test('a prefetch invalidated during the final enabled check does not send an API request', async () => {
    const { context, state, question } = createHarness();
    const gate = deferred();
    const checking = deferred();
    let current = true;
    let checks = 0;
    context.chrome.storage.sync.get = async () => {
        checks++;
        if (checks === 2) {
            checking.resolve();
            return gate.promise;
        }
        return { isEnabled: true };
    };
    const loading = context.loadPlatonusAnswer(question('2'), ['fixture-key'], ['fixture-model'], () => current);
    await checking.promise;

    current = false;
    gate.resolve({ isEnabled: true });

    assert.equal(await loading, null);
    assert.equal(state.requestCalls, 0);
    assert.equal(state.storeCalls, 0);
    assert.deepEqual(state.clicks, []);
});

test('the live question is read after the final asynchronous enabled check', async () => {
    const { context, state, question } = createHarness();
    const incoming = state.live;
    incoming.prefetchedAnswer = Promise.resolve({ result: { correct: ['A'] }, answers: incoming.answers });
    const gate = deferred();
    const checking = deferred();
    let checks = 0;
    context.chrome.storage.sync.get = async keys => {
        if (!keys.includes('isEnabled')) return { cfgAutoClick: true, cfgMarker: true };
        checks++;
        if (checks === 2) {
            checking.resolve();
            return gate.promise;
        }
        return { isEnabled: true };
    };
    const processing = context.processQuestion(incoming, ['fixture-key'], ['fixture-model']);
    await checking.promise;

    state.live = question('2');
    gate.resolve({ isEnabled: true });

    assert.equal(await processing, false);
    assert.deepEqual(state.clicks, []);
    assert.deepEqual(state.markers, []);
    assert.equal(incoming.domElement.style.opacity, '1');
});

for (const mode of ['cache', 'request']) {
    test(`the existing ${mode} path guards against navigation without prefetched data`, async () => {
        const { context, state, question } = createHarness();
        const incoming = state.live;
        const gate = deferred();
        if (mode === 'cache') state.cacheResult = gate.promise;
        else state.requestResult = gate.promise;
        const processing = context.processQuestion(incoming, ['fixture-key'], ['fixture-model']);
        await flush();

        state.live = question('2');
        gate.resolve(mode === 'cache'
            ? { correct: ['A'] }
            : { result: { correct: ['A'] }, model: 'fixture-model' });

        assert.equal(await processing, false);
        assert.deepEqual(state.clicks, []);
        assert.deepEqual(state.markers, []);
        assert.equal(state.cacheCalls, 1);
        assert.equal(state.requestCalls, mode === 'request' ? 1 : 0);
        assert.equal(state.storeCalls, mode === 'request' ? 1 : 0);
        assert.equal(incoming.domElement.style.opacity, '1');
    });
}
