const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modelPolicy = require('../src/config.js');
const QuestionPrefetch = require('../src/content/prefetch.js');

const contentSource = fs.readFileSync(path.join(__dirname, '../src/content/content.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function createSnapshot() {
    return {
        testingId: 'fixture-test',
        attemptNumber: '1',
        currentQuestionId: '1',
        currentNumber: 1,
        completed: false,
        questions: [1, 2, 3].map(number => ({
            questionId: String(number),
            number,
            textHtml: `Fixture question ${number}`,
            variants: [{ id: `variant-${number}`, textHtml: `Fixture choice ${number}` }],
            isMultiSelect: false
        }))
    };
}

function createHarness() {
    const state = { snapshot: createSnapshot(), enqueues: 0, apiCalls: 0 };
    const consoleStub = Object.fromEntries(
        ['log', 'warn', 'error', 'debug', 'groupCollapsed', 'groupEnd'].map(name => [name, () => {}])
    );
    const context = vm.createContext({
        KSTU_AI_CONFIG: modelPolicy,
        KSTU_QUESTION_PREFETCH: class extends QuestionPrefetch {
            enqueue(key, question) {
                state.enqueues++;
                return super.enqueue(key, question);
            }
        },
        console: consoleStub,
        document: { readyState: 'loading', body: {}, addEventListener() {} },
        window: { addEventListener() {} },
        location: { href: 'https://example.invalid/test', pathname: '/test' },
        MutationObserver: class { observe() {} },
        chrome: {
            runtime: {
                getManifest: () => ({ version: 'test' }),
                async sendMessage(message) {
                    return message.action === 'get_platonus_questions' ? state.snapshot : {};
                }
            }
        }
    });
    vm.runInContext(contentSource, context, { filename: 'src/content/content.js' });
    Object.assign(context, {
        async checkEnabled() { return true; },
        showStealthNotify() {},
        platonusHtmlContent(text) { return { text, images: [] }; },
        async cacheLookup() { return null; },
        async cacheStoreFromResult() {},
        async buildApiParts(question) { return { parts: [{ text: question.text }] }; },
        async askGeminiWithProFallback() {
            state.apiCalls++;
            return { result: { correct: ['A'] }, model: 'fixture-model' };
        }
    });
    const currentQuestion = () => ({
        platform: 'platonus',
        type: 'choice',
        questionId: '1',
        number: 1,
        answers: [{ id: 'A', variantId: 'variant-1', element: { checked: false } }]
    });
    return { context, state, currentQuestion };
}

test('disabling prefetch cancels a prepare waiting for its snapshot', async () => {
    const { context, state, currentQuestion } = createHarness();
    let resolveSnapshot;
    state.snapshot = new Promise(resolve => { resolveSnapshot = resolve; });
    const current = currentQuestion();
    const pending = context.preparePlatonusPrefetch([current], ['fixture-key'], ['fixture-model'], true);
    await flush();

    await context.preparePlatonusPrefetch([], ['fixture-key'], ['fixture-model'], false);
    resolveSnapshot(createSnapshot());
    await pending;
    await flush();

    assert.equal(state.enqueues, 0);
    assert.equal(state.apiCalls, 0);
    assert.equal(current.prefetchedAnswer, undefined);
});

test('concurrent prepares reuse question promises and load each of three questions once', async () => {
    const { context, state, currentQuestion } = createHarness();
    const first = currentQuestion();
    const second = currentQuestion();

    await Promise.all([
        context.preparePlatonusPrefetch([first], ['fixture-key'], ['fixture-model'], true),
        context.preparePlatonusPrefetch([second], ['fixture-key'], ['fixture-model'], true)
    ]);
    await flush();

    assert.equal(first.prefetchedAnswer, second.prefetchedAnswer);
    assert.equal(first.prefetchSession, second.prefetchSession);
    assert.equal(state.enqueues, 6);
    assert.equal(state.apiCalls, 3);
    assert.deepEqual((await first.prefetchedAnswer).result, { correct: ['A'] });
});
