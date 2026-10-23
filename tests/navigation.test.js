const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modelPolicy = require('../src/config.js');

const contentSource = fs.readFileSync(path.join(__dirname, '../src/content/content.js'), 'utf8');

function createHarness(options = {}) {
    const { spa = true, questionCount = 3, summary, start, waitChanged = true, answerSaved = true } = options;
    const state = {
        questionIndex: 0,
        startCalls: 0,
        nextClicks: 0,
        finishCalls: 0,
        waitCalls: 0,
        savedChecks: 0,
        events: [],
        local: {}
    };
    const select = { get value() { return String(state.questionIndex); } };
    const nextButton = {
        get disabled() { return state.questionIndex >= questionCount - 1; },
        click() {
            assert.equal(this.disabled, false, 'disabled next button must not be clicked');
            state.events.push(`next:${state.questionIndex}`);
            state.nextClicks++;
            state.questionIndex++;
        }
    };
    const finishButton = { click() {} };
    const consoleStub = Object.fromEntries(
        ['log', 'warn', 'error', 'debug', 'groupCollapsed', 'groupEnd'].map(name => [name, () => {}])
    );
    const context = vm.createContext({
        KSTU_AI_CONFIG: modelPolicy,
        console: consoleStub,
        document: {
            readyState: 'loading',
            body: {},
            addEventListener() {},
            querySelector(selector) {
                return spa && selector === '#navigation #question-select' ? select : null;
            }
        },
        location: { href: 'https://example.invalid/test', pathname: '/test' },
        window: { addEventListener() {} },
        MutationObserver: class { observe() {} },
        chrome: {
            runtime: { getManifest: () => ({ version: 'test' }) },
            storage: {
                local: {
                    async set(values) { Object.assign(state.local, values); },
                    async get() { return { ...state.local }; },
                    async remove(key) { delete state.local[key]; }
                }
            }
        }
    });
    vm.runInContext(contentSource, context, { filename: 'src/content/content.js' });
    Object.assign(context, {
        async checkEnabled() { return true; },
        showStealthNotify() {},
        async sleep() {},
        async start() {
            state.startCalls++;
            state.events.push(`start:${state.questionIndex}`);
            if (start) return start(state);
            if (Object.hasOwn(options, 'summary')) return summary;
            return { total: 1, solved: 1, failed: 0 };
        },
        getNextPageButton() { return nextButton.disabled ? null : nextButton; },
        getFinishButton() { return finishButton; },
        async finishTest() {
            state.finishCalls++;
            state.events.push('finish');
        },
        getPlatonusQuestionState() { return { value: String(state.questionIndex) }; },
        async waitForPlatonusAnswer() {
            state.savedChecks++;
            return answerSaved;
        },
        async waitForPlatonusQuestion(previousState) {
            assert.deepEqual(previousState, { value: String(state.questionIndex - 1) });
            state.waitCalls++;
            state.events.push(`wait:${previousState.value}`);
            return waitChanged;
        }
    });
    return { context, state };
}

test('Platonus continues through three questions without reload and finishes once', async () => {
    const { context, state } = createHarness();

    await context.solveAndNext();

    assert.equal(state.startCalls, 3);
    assert.equal(state.nextClicks, 2);
    assert.equal(state.waitCalls, 2);
    assert.equal(state.savedChecks, 3);
    assert.equal(state.finishCalls, 1);
    assert.deepEqual(state.events, [
        'start:0', 'next:0', 'wait:0',
        'start:1', 'next:1', 'wait:1',
        'start:2', 'finish'
    ]);
});

for (const [name, summary] of [
    ['an empty summary', { total: 0, solved: 0, failed: 0 }],
    ['no summary', undefined]
]) {
    test(`navigation stops when start returns ${name}`, async () => {
        for (const questionCount of [1, 3]) {
            const { context, state } = createHarness({ summary, questionCount });

            await context.solveAndNext();

            assert.equal(state.startCalls, 1);
            assert.equal(state.nextClicks, 0);
            assert.equal(state.finishCalls, 0);
            assert.equal(state.waitCalls, 0);
        }
    });
}

test('unresolved questions stop navigation', async () => {
    const { context, state } = createHarness({ summary: { total: 1, solved: 0, failed: 1 } });

    await context.solveAndNext();

    assert.equal(state.startCalls, 1);
    assert.equal(state.nextClicks, 0);
    assert.equal(state.finishCalls, 0);
    assert.equal(state.waitCalls, 0);
});

test('Platonus does not solve again when the question change times out', async () => {
    const { context, state } = createHarness({ waitChanged: false });

    await context.solveAndNext();

    assert.equal(state.nextClicks, 1);
    assert.equal(state.waitCalls, 1);
    assert.equal(state.startCalls, 1);
    assert.equal(state.finishCalls, 0);
});

test('Platonus stops next and finish until the current answer is saved', async () => {
    for (const questionCount of [1, 3]) {
        const { context, state } = createHarness({ answerSaved: false, questionCount });

        await context.solveAndNext();

        assert.equal(state.startCalls, 1);
        assert.equal(state.savedChecks, 1);
        assert.equal(state.nextClicks, 0);
        assert.equal(state.finishCalls, 0);
        assert.equal(state.waitCalls, 0);
    }
});

test('manual navigation during the transition delay does not skip another question', async () => {
    const { context, state } = createHarness();
    context.sleep = async () => { state.questionIndex = 1; };

    await context.solveAndNext();

    assert.equal(state.questionIndex, 1);
    assert.equal(state.startCalls, 1);
    assert.equal(state.nextClicks, 0);
    assert.equal(state.waitCalls, 0);
    assert.equal(state.finishCalls, 0);
});

test('a repeated Alt+D does not start a parallel navigation run', async () => {
    let releaseStart;
    let markStarted;
    const gate = new Promise(resolve => { releaseStart = resolve; });
    const started = new Promise(resolve => { markStarted = resolve; });
    const { context, state } = createHarness({
        questionCount: 1,
        async start(currentState) {
            if (currentState.startCalls === 1) {
                markStarted();
                await gate;
            }
            return { total: 1, solved: 1, failed: 0 };
        }
    });
    const firstRun = context.solveAndNext();
    await started;

    try {
        await context.solveAndNext();
        assert.equal(state.startCalls, 1);
    } finally {
        releaseStart();
        await firstRun;
    }

    assert.equal(state.finishCalls, 1);
});

test('Univer clicks next once and preserves continuation across reload', async () => {
    const { context, state } = createHarness({ spa: false });

    await context.solveAndNext();

    assert.equal(state.startCalls, 1);
    assert.equal(state.nextClicks, 1);
    assert.equal(state.local.autoSolvePending, true);
    assert.equal(state.waitCalls, 0);
    assert.equal(state.savedChecks, 0);
    assert.equal(state.finishCalls, 0);
});

test('an error from start releases the navigation lock', async () => {
    const { context, state } = createHarness({
        questionCount: 1,
        async start(currentState) {
            if (currentState.startCalls === 1) throw new Error('fixture failure');
            return { total: 1, solved: 1, failed: 0 };
        }
    });

    await context.solveAndNext().catch(() => {});
    await context.solveAndNext();

    assert.equal(state.startCalls, 2);
    assert.equal(state.finishCalls, 1);
    assert.equal(state.nextClicks, 0);
});
